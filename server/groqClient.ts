// Reusable Groq access layer for Dev Hub. Server-side only: the API key never leaves this process.
//
// Everything AI-related in the app goes through the three functions exported here:
//   generateText  - one-shot text
//   generateJson  - structured output (JSON mode + the app's schema, then validated locally)
//   streamText    - token streaming (used by the mentor chat)
//
// Groq exposes an OpenAI-compatible HTTP API, so this file uses plain fetch (no SDK needed).
// Each call has a timeout, a bounded number of retries for transient failures (rate limits,
// 5xx, network blips, empty answers), and at most ONE extra attempt for malformed JSON.

// ---------------------------------------------------------------------------
// Configuration (all from environment variables; nothing is hard-wired to a key)
// ---------------------------------------------------------------------------

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

/** Strong general-purpose default. Override with GROQ_MODEL. */
export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

/** Models offered in the admin picker. The configured GROQ_MODEL is always added to this list. */
export const GROQ_MODEL_CHOICES = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
];

// Groq model ids look like "llama-3.3-70b-versatile" or "openai/gpt-oss-120b".
const MODEL_PATTERN = /^[a-z0-9][a-z0-9._\-/]{1,80}$/i;

function intFromEnv(name: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(String(process.env[name] ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function isValidModelName(name: string): boolean {
  return MODEL_PATTERN.test(name);
}

export function getConfiguredModel(): string {
  const fromEnv = String(process.env.GROQ_MODEL ?? '').trim().replace(/^['"]|['"]$/g, '');
  return isValidModelName(fromEnv) ? fromEnv : DEFAULT_GROQ_MODEL;
}

export function getGroqApiKey(): string | null {
  const key = process.env.GROQ_API_KEY?.trim().replace(/^['"]|['"]$/g, '');
  if (!key || key === 'MY_GROQ_API_KEY' || key.toLowerCase().includes('your-groq')) return null;
  return key;
}

const timeoutMs = () => intFromEnv('GROQ_TIMEOUT_MS', 45_000, 1_000, 120_000);
/** Lighter model used when the main model hits its rate limit / quota. Set to "off" to disable. */
export function getFallbackModel(): string | null {
  const raw = String(process.env.GROQ_FALLBACK_MODEL ?? 'llama-3.1-8b-instant').trim().replace(/^['"]|['"]$/g, '');
  if (!raw || raw.toLowerCase() === 'off') return null;
  return isValidModelName(raw) ? raw : null;
}
/** Requests per minute this server will send to Groq (keeps free-tier keys under their per-minute cap). 0 = unlimited. */
const maxRpm = () => intFromEnv('GROQ_MAX_RPM', 20, 0, 1000);
const maxRetries = () => intFromEnv('GROQ_MAX_RETRIES', 2, 0, 4);
/**
 * Upper bound on tokens requested per answer. Free-tier tokens-per-minute limits count the size you ask
 * for, so asking for 16k on every call can trigger limits by itself. Raise it if long answers get cut off.
 */
const maxOutputCap = () => intFromEnv('GROQ_MAX_OUTPUT_TOKENS', 6000, 256, 32000);

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type AiErrorCode =
  | 'rate_limit'
  | 'auth'
  | 'model_unavailable'
  | 'timeout'
  | 'unavailable'
  | 'blocked'
  | 'malformed'
  | 'empty'
  | 'bad_request'
  | 'aborted'
  | 'unknown';

const USER_MESSAGES: Record<AiErrorCode, string> = {
  rate_limit: 'The AI is busy or a rate limit was reached. Please wait a moment and try again.',
  auth: 'The AI service key is missing or invalid on the server. An admin needs to check GROQ_API_KEY.',
  model_unavailable: 'The selected AI model is not available. Ask an admin to pick another model.',
  timeout: 'The AI took too long to answer. Please try again.',
  unavailable: 'The AI service is temporarily unavailable. Please try again shortly.',
  blocked: 'The AI could not answer that request. Try rephrasing it.',
  malformed: 'The AI returned an answer in an unexpected format. Please try again.',
  empty: 'The AI returned an empty answer. Please try again.',
  bad_request: 'The AI could not process that request. Please try again with different input.',
  aborted: 'The request was cancelled.',
  unknown: 'The AI request failed. Please try again.',
};

const RETRYABLE: Record<AiErrorCode, boolean> = {
  rate_limit: true,
  auth: false,
  model_unavailable: false,
  timeout: true,
  unavailable: true,
  blocked: false,
  malformed: true,
  empty: true,
  bad_request: false,
  aborted: false,
  unknown: false,
};

export class AiProviderError extends Error {
  code: AiErrorCode;
  status: number;
  retryable: boolean;
  /** Server-suggested wait before retrying (from a 429), in milliseconds. */
  retryAfterMs?: number;
  constructor(code: AiErrorCode, detail?: string, status = 500, retryAfterMs?: number) {
    super(USER_MESSAGES[code]);
    this.name = 'AiProviderError';
    this.code = code;
    this.status = status;
    this.retryable = RETRYABLE[code];
    this.retryAfterMs = retryAfterMs;
    if (detail) (this as any).detail = String(detail).slice(0, 500);
  }
}

/** Groq words waits like "try again in 7m12.5s", "in 1.23s" or "in 340ms". */
function parseRetryAfterMs(raw: string, headerSeconds?: number): number | undefined {
  if (Number.isFinite(headerSeconds) && (headerSeconds as number) > 0) return Math.round((headerSeconds as number) * 1000);
  const m = raw.match(/(?:try again|retry) in\s+(?:(\d+)h)?\s*(?:(\d+)m(?!s))?\s*(?:([\d.]+)s)?\s*(?:([\d.]+)ms)?/i);
  if (!m) return undefined;
  const ms = Number(m[1] || 0) * 3_600_000 + Number(m[2] || 0) * 60_000 + Number(m[3] || 0) * 1000 + Number(m[4] || 0);
  return ms > 0 ? Math.round(ms) : undefined;
}

/** Turn anything thrown by fetch / the API into an AiProviderError. */
export function classifyError(err: unknown): AiProviderError {
  if (err instanceof AiProviderError) return err;
  const anyErr = err as any;
  let raw = String(anyErr?.message ?? err ?? '');
  let status = Number(anyErr?.status ?? anyErr?.code ?? anyErr?.error?.code);
  let providerCode = String(anyErr?.providerCode ?? anyErr?.error?.code ?? '');
  const headerSeconds = Number(anyErr?.retryAfterSeconds);

  // Some callers pass the provider's JSON body as the message
  if (raw.trim().startsWith('{')) {
    try {
      const body = JSON.parse(raw);
      if (body?.error) {
        raw = String(body.error.message ?? raw);
        providerCode = String(body.error.code ?? body.error.type ?? providerCode);
        if (!Number.isFinite(status) && typeof body.error.code === 'number') status = body.error.code;
      }
    } catch {
      /* keep raw */
    }
  }
  const text = `${providerCode} ${raw}`;
  const retryAfterMs = parseRetryAfterMs(raw, headerSeconds);

  if (anyErr?.name === 'AbortError') {
    return new AiProviderError('aborted', raw, 499);
  }
  if (status === 429 || /rate_limit_exceeded|rate.?limit|quota|too many requests/i.test(text)) {
    const rl = new AiProviderError('rate_limit', raw, 429, retryAfterMs);
    // Daily caps: requests per day (RPD) or tokens per day (TPD). Waiting a few seconds will not help.
    (rl as any).daily = /per day|\bRPD\b|\bTPD\b|daily/i.test(text);
    return rl;
  }
  if (status === 401 || status === 403 || /invalid_api_key|invalid api key|permission_denied|unauthori[sz]ed/i.test(text)) {
    return new AiProviderError('auth', raw, status === 403 ? 403 : 401);
  }
  if (status === 404 || /model_not_found|model_decommissioned|does not exist|has been decommissioned|not supported for this model/i.test(text)) {
    return new AiProviderError('model_unavailable', raw, 404);
  }
  if (status === 504 || /timed? ?out|ETIMEDOUT|deadline/i.test(text)) {
    return new AiProviderError('timeout', raw, 504);
  }
  if (status === 413 || status === 400 || status === 422 || /invalid_request_error|request too large|context_length/i.test(text)) {
    return new AiProviderError('bad_request', raw, status === 413 ? 413 : 400);
  }
  if (
    (status >= 500 && status < 600) ||
    /overloaded|over capacity|service unavailable|internal_server_error|fetch failed|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|network/i.test(text)
  ) {
    return new AiProviderError('unavailable', raw, status >= 500 ? status : 503);
  }
  return new AiProviderError('unknown', raw, 500);
}

// ---------------------------------------------------------------------------
// HTTP + retry plumbing
// ---------------------------------------------------------------------------

type FetchLike = (url: string, init: any) => Promise<any>;
let fetchImpl: FetchLike = (url, init) => globalThis.fetch(url, init);
/** Tests only: replace the HTTP layer. Pass null to restore the real fetch. */
export function __setFetchForTests(fn: FetchLike | null) {
  fetchImpl = fn ?? ((url, init) => globalThis.fetch(url, init));
}

let sleepImpl: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms));
/** Tests only: make backoff instant. */
export function __setSleepForTests(fn: ((ms: number) => Promise<void>) | null) {
  sleepImpl = fn ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
}

function requireKey(): string {
  const apiKey = getGroqApiKey();
  if (!apiKey) throw new AiProviderError('auth', 'GROQ_API_KEY is not set', 401);
  return apiKey;
}

function backoffMs(attempt: number, err: AiProviderError): number {
  const base = Math.min(8_000, 700 * 2 ** attempt);
  const jitter = Math.floor(Math.random() * 300);
  const hinted = err.retryAfterMs ? Math.min(10_000, err.retryAfterMs) : 0;
  return Math.max(base + jitter, hinted);
}

/** Read an error response from Groq and throw it as something classifyError understands. */
async function throwHttpError(res: any): Promise<never> {
  let bodyText = '';
  try {
    bodyText = await res.text();
  } catch {
    bodyText = '';
  }
  let message = bodyText;
  let providerCode = '';
  try {
    const body = JSON.parse(bodyText);
    if (body?.error) {
      message = String(body.error.message ?? bodyText);
      providerCode = String(body.error.code ?? body.error.type ?? '');
    }
  } catch {
    /* plain text body */
  }
  const e: any = new Error(message || `HTTP ${res.status}`);
  e.status = res.status;
  e.providerCode = providerCode;
  const ra = Number(res.headers?.get?.('retry-after'));
  if (Number.isFinite(ra)) e.retryAfterSeconds = ra;
  throw e;
}

/** Run one attempt with a hard timeout. The fetch also receives the abort signal. */
async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number, outer?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const onOuterAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) throw new AiProviderError('aborted', 'cancelled by caller', 499);
    outer.addEventListener('abort', onOuterAbort, { once: true });
  }
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new AiProviderError('timeout', `no response within ${ms}ms`, 504));
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } catch (err) {
    if (timedOut) throw new AiProviderError('timeout', `no response within ${ms}ms`, 504);
    if (outer?.aborted) throw new AiProviderError('aborted', 'cancelled by caller', 499);
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
    outer?.removeEventListener('abort', onOuterAbort);
  }
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/** Kept for API compatibility with the feature code: Groq answers carry no web-search citations. */
export interface GroundingSource {
  title: string;
  uri: string;
}

/** Strip any reasoning tags / whitespace the model may include around its answer. */
export function cleanModelText(text: unknown): string {
  return String(text ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
}

export function parseJsonLoose(raw: string): any {
  const text = cleanModelText(raw)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  try {
    return JSON.parse(text);
  } catch {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(text.slice(first, last + 1));
      } catch {
        /* fall through */
      }
    }
    throw new AiProviderError('malformed', 'response was not valid JSON', 502);
  }
}

// ---------------------------------------------------------------------------
// Schema handling (Groq JSON mode returns *a* JSON object; we describe the shape in the prompt and
// then enforce it ourselves with conformToSchema, so wrong-shaped output is rejected, never saved)
// ---------------------------------------------------------------------------

/** Compact, readable description of the expected JSON shape for the model. */
export function describeSchema(schema: any): string {
  const walk = (s: any): any => {
    const type = String(s?.type ?? '').toLowerCase();
    if (type === 'object') {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries<any>(s.properties || {})) out[k] = walk(v);
      return out;
    }
    if (type === 'array') return [walk(s.items || { type: 'string' })];
    if (type === 'integer') return 'integer';
    if (type === 'number') return 'number';
    if (type === 'boolean') return 'boolean';
    if (type === 'string') return s.description ? `string (${String(s.description).slice(0, 120)})` : 'string';
    return 'any';
  };
  return JSON.stringify(walk(schema), null, 2);
}

const malformed = (why: string) => new AiProviderError('malformed', why, 502);

/**
 * Make AI output match the declared schema, or reject it.
 * - strings: null/missing -> "", numbers/booleans are stringified, objects/arrays are rejected
 * - numbers/integers: numeric strings are accepted, anything else is rejected, missing -> 0
 * - booleans: "true"/"false" strings accepted, missing -> false
 * - arrays: must be arrays (missing -> []), empty string items are dropped
 * - objects: recursed; unknown keys are kept as-is
 */
export function conformToSchema(value: any, schema: any, path = 'response'): any {
  const type = String(schema?.type ?? '').toLowerCase();
  switch (type) {
    case 'object': {
      if (value === undefined || value === null) value = {};
      if (typeof value !== 'object' || Array.isArray(value)) throw malformed(`${path} is not an object`);
      const out: Record<string, any> = { ...value };
      for (const [k, sub] of Object.entries<any>(schema.properties || {})) {
        out[k] = conformToSchema(value[k], sub, `${path}.${k}`);
      }
      return out;
    }
    case 'array': {
      if (value === undefined || value === null) return [];
      if (!Array.isArray(value)) throw malformed(`${path} is not an array`);
      const items = value.map((v, i) => conformToSchema(v, schema.items || {}, `${path}[${i}]`));
      return String(schema.items?.type ?? '').toLowerCase() === 'string' ? items.filter((s: string) => s.trim() !== '') : items;
    }
    case 'string':
      if (value === undefined || value === null) return '';
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      throw malformed(`${path} is not text`);
    case 'number':
    case 'integer': {
      if (value === undefined || value === null || value === '') return 0;
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) throw malformed(`${path} is not a number`);
      return type === 'integer' ? Math.round(n) : n;
    }
    case 'boolean':
      if (value === undefined || value === null) return false;
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      throw malformed(`${path} is not true/false`);
    default:
      return value;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

interface BaseOptions {
  model: string;
  systemInstruction: string;
  prompt: string;
  /** Cancel from outside (e.g. the browser disconnected). */
  signal?: AbortSignal;
  maxOutputTokens?: number;
}

export interface TextResult {
  text: string;
  model: string;
  sources: GroundingSource[];
  totalTokens: number | null;
}

function buildBody(opts: BaseOptions, model: string, extra: Record<string, any> = {}) {
  const messages: Array<{ role: string; content: string }> = [];
  if (opts.systemInstruction) messages.push({ role: 'system', content: opts.systemInstruction });
  messages.push({ role: 'user', content: opts.prompt });
  return {
    model,
    messages,
    max_tokens: Math.min(opts.maxOutputTokens ?? maxOutputCap(), maxOutputCap()),
    ...extra,
  };
}

async function postChat(body: Record<string, any>, signal: AbortSignal): Promise<any> {
  const res = await fetchImpl(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${requireKey()}` },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) await throwHttpError(res);
  return res.json();
}

const BLOCKED_FINISH = new Set(['content_filter']);

/** Throws when the response was blocked or is empty; otherwise returns the cleaned text. */
function readText(response: any): string {
  const choice = response?.choices?.[0];
  const finish = String(choice?.finish_reason ?? '');
  const text = cleanModelText(choice?.message?.content);
  if (!text) {
    if (BLOCKED_FINISH.has(finish)) throw new AiProviderError('blocked', `finishReason=${finish}`, 422);
    throw new AiProviderError('empty', `finishReason=${finish}`, 502);
  }
  return text;
}

const tokensOf = (response: any): number | null =>
  Number(response?.usage?.total_tokens ?? response?.x_groq?.usage?.total_tokens) || null;

// Paces requests so a free-tier key (low per-minute cap) is not pushed into 429s by bursts.
// Each request reserves the next free slot in a 60-second window; if the wait would be long, fail fast.
const slotTimes: number[] = [];
const MAX_PACING_WAIT_MS = 20_000;
async function acquireSlot(): Promise<void> {
  const rpm = maxRpm();
  if (!rpm) return;
  const now = Date.now();
  while (slotTimes.length && slotTimes[0] < now - 60_000) slotTimes.shift();
  const earliest = slotTimes.length >= rpm ? slotTimes[slotTimes.length - rpm] + 60_000 : now;
  const slot = Math.max(now, earliest);
  if (slot - now > MAX_PACING_WAIT_MS) {
    throw new AiProviderError('rate_limit', 'local request pacing: too many AI requests in the last minute', 429);
  }
  slotTimes.push(slot);
  if (slot > now) await sleepImpl(slot - now);
}
/** Tests only. */
export function __resetPacerForTests() {
  slotTimes.length = 0;
}

interface RunState {
  model: string;
}
/** After a rate limit on the main model: switch to the lighter fallback model (it has its own limits). */
function degrade(state: RunState): boolean {
  const fb = getFallbackModel();
  if (fb && state.model !== fb) {
    state.model = fb;
    return true;
  }
  return false;
}
/** Whether waiting and trying the same request again could plausibly help. */
function worthRetrying(e: AiProviderError): boolean {
  if (!e.retryable) return false;
  if (e.code === 'rate_limit' && ((e as any).daily || (e.retryAfterMs ?? 0) > MAX_PACING_WAIT_MS)) return false;
  return true;
}

/** Run `attempt` with bounded retries for transient provider failures. */
async function retrying<T>(attempt: (n: number) => Promise<T>, outer?: AbortSignal, state?: RunState): Promise<T> {
  const limit = maxRetries();
  let last: AiProviderError | null = null;
  for (let n = 0; n <= limit; n++) {
    try {
      return await attempt(n);
    } catch (err) {
      last = classifyError(err);
      if (n === limit || outer?.aborted) throw last;
      if (last.code === 'rate_limit' && state && degrade(state)) {
        await sleepImpl(400);
        continue;
      }
      if (!worthRetrying(last)) throw last;
      await sleepImpl(backoffMs(n, last));
    }
  }
  throw last ?? new AiProviderError('unknown');
}

export async function generateText(opts: BaseOptions & { useSearch?: boolean }): Promise<TextResult> {
  requireKey();
  // opts.useSearch is accepted for compatibility; Groq chat models have no built-in web search here.
  const state: RunState = { model: opts.model };
  return retrying(async () => {
    await acquireSlot();
    const usedModel = state.model;
    return withTimeout(
      async (signal) => {
        const response = await postChat(buildBody(opts, usedModel), signal);
        return { text: readText(response), model: usedModel, sources: [], totalTokens: tokensOf(response) } satisfies TextResult;
      },
      timeoutMs(),
      opts.signal
    );
  }, opts.signal, state);
}

export async function generateJson<T>(
  opts: BaseOptions & {
    schema: any;
    /** Semantic check/normalizer. Throw (any Error) to reject the answer; return the value to accept it. */
    validate?: (data: any) => T;
  }
): Promise<{ data: T; model: string; totalTokens: number | null }> {
  requireKey();
  const state: RunState = { model: opts.model };
  // JSON mode needs the word "JSON" in the prompt; the schema description tells the model the exact shape.
  const system = [
    opts.systemInstruction,
    'Respond with a single valid JSON object and nothing else (no markdown fences, no commentary).',
    `The JSON must have exactly this shape:\n${describeSchema(opts.schema)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  let malformedRetries = 0;
  const MAX_MALFORMED_RETRIES = 1;
  return retrying(async () => {
    await acquireSlot();
    const usedModel = state.model;
    try {
      return await withTimeout(
        async (signal) => {
          const response = await postChat(
            buildBody({ ...opts, systemInstruction: system }, usedModel, { response_format: { type: 'json_object' } }),
            signal
          );
          const raw = readText(response);
          const parsed = parseJsonLoose(raw);
          let data: any = conformToSchema(parsed, opts.schema);
          if (opts.validate) {
            try {
              data = opts.validate(data);
            } catch (e: any) {
              if (e instanceof AiProviderError) throw e;
              throw malformed(e?.message || 'failed validation');
            }
          }
          return { data: data as T, model: usedModel, totalTokens: tokensOf(response) };
        },
        timeoutMs(),
        opts.signal
      );
    } catch (err) {
      const e = classifyError(err);
      // Groq rejects JSON-mode answers it could not parse with a 400 "json_validate_failed": treat as malformed.
      const jsonFailed = e.code === 'bad_request' && /json_validate_failed|failed to generate json/i.test(String((e as any).detail || ''));
      const code = jsonFailed ? malformed('provider could not produce valid JSON') : e;
      if (code.code === 'malformed') {
        // Malformed JSON gets one more try at most, regardless of the general retry budget.
        if (malformedRetries >= MAX_MALFORMED_RETRIES) {
          const final = new AiProviderError('malformed', (code as any).detail, 502);
          final.retryable = false;
          throw final;
        }
        malformedRetries += 1;
      }
      throw code;
    }
  }, opts.signal, state);
}

export type StreamEvent =
  | { type: 'token'; text: string }
  | { type: 'done'; text: string; model: string; sources: GroundingSource[]; totalTokens: number | null };

/** Split a growing text buffer into complete SSE lines, keeping any partial tail. */
function takeLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split(/\r?\n/);
  const rest = parts.pop() ?? '';
  return { lines: parts, rest };
}

/**
 * Stream a text answer. Retries happen only before the first token is received;
 * once text has started flowing, a failure is surfaced to the caller.
 */
export async function* streamText(opts: BaseOptions & { useSearch?: boolean }): AsyncGenerator<StreamEvent> {
  requireKey();
  const limit = maxRetries();
  const state: RunState = { model: opts.model };
  for (let n = 0; n <= limit; n++) {
    const usedModel = state.model;
    let started = false;
    let full = '';
    let tokens: number | null = null;
    const controller = new AbortController();
    const onOuterAbort = () => controller.abort();
    if (opts.signal) {
      if (opts.signal.aborted) throw new AiProviderError('aborted', 'cancelled by caller', 499);
      opts.signal.addEventListener('abort', onOuterAbort, { once: true });
    }
    try {
      // Idle timeout: reset every time data arrives.
      const idleMs = timeoutMs();
      const nextWithTimeout = async <V>(p: Promise<V>): Promise<V> => {
        let timer: NodeJS.Timeout | undefined;
        const t = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new AiProviderError('timeout', `no data within ${idleMs}ms`, 504));
          }, idleMs);
        });
        try {
          return await Promise.race([p, t]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      };

      await acquireSlot();
      const res = await nextWithTimeout(
        fetchImpl(`${GROQ_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${requireKey()}` },
          body: JSON.stringify(buildBody(opts, usedModel, { stream: true })),
          signal: controller.signal,
        })
      );
      if (!res.ok) await throwHttpError(res);

      const decoder = new TextDecoder();
      const reader = res.body.getReader();
      let buffer = '';
      let finishReason = '';
      let finished = false;
      while (!finished) {
        const step = await nextWithTimeout(reader.read());
        if (step.done) break;
        buffer += decoder.decode(step.value, { stream: true });
        const { lines, rest } = takeLines(buffer);
        buffer = rest;
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') {
            finished = true;
            break;
          }
          let chunk: any;
          try {
            chunk = JSON.parse(payload);
          } catch {
            continue;
          }
          if (chunk?.error) {
            const e: any = new Error(String(chunk.error.message ?? 'stream error'));
            e.providerCode = String(chunk.error.code ?? chunk.error.type ?? '');
            throw e;
          }
          finishReason = chunk?.choices?.[0]?.finish_reason || finishReason;
          tokens = Number(chunk?.usage?.total_tokens ?? chunk?.x_groq?.usage?.total_tokens) || tokens;
          const piece = String(chunk?.choices?.[0]?.delta?.content ?? '');
          if (piece) {
            started = true;
            full += piece;
            yield { type: 'token', text: piece };
          }
        }
      }
      const finalText = cleanModelText(full);
      if (!finalText) {
        if (BLOCKED_FINISH.has(finishReason)) throw new AiProviderError('blocked', finishReason, 422);
        throw new AiProviderError('empty', `finishReason=${finishReason}`, 502);
      }
      yield { type: 'done', text: finalText, model: usedModel, sources: [], totalTokens: tokens };
      return;
    } catch (err) {
      let e = classifyError(err);
      if (opts.signal?.aborted) e = new AiProviderError('aborted', 'cancelled by caller', 499);
      if (started || n === limit) throw e;
      if (e.code === 'rate_limit' && degrade(state)) {
        await sleepImpl(400);
        continue;
      }
      if (!worthRetrying(e)) throw e;
      await sleepImpl(backoffMs(n, e));
    } finally {
      opts.signal?.removeEventListener('abort', onOuterAbort);
    }
  }
}
