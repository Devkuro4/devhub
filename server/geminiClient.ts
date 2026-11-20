// Reusable Gemini access layer for Dev Hub. Server-side only: the API key never leaves this process.
//
// Everything AI-related in the app goes through the three functions exported here:
//   generateText  - one-shot text (optionally grounded with Google Search)
//   generateJson  - structured output, conformed to a schema and optionally validated
//   streamText    - token streaming (used by the mentor chat)
//
// Each call has a timeout, a bounded number of retries for transient failures (rate limits,
// 5xx, network blips, empty answers), and at most ONE extra attempt for malformed JSON.
import { GoogleGenAI, Type as GeminiType } from '@google/genai';

// ---------------------------------------------------------------------------
// Configuration (all from environment variables; nothing is hard-wired to a key)
// ---------------------------------------------------------------------------

/** Stable, general-purpose default. Override with GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

/** Models offered in the admin picker. The configured GEMINI_MODEL is always added to this list. */
export const GEMINI_MODEL_CHOICES = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-4-argon'];

const GEMINI_MODEL_PATTERN = /^gemini-[a-z0-9][a-z0-9.\-]{1,60}$/;

function intFromEnv(name: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(String(process.env[name] ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function isValidModelName(name: string): boolean {
  return GEMINI_MODEL_PATTERN.test(name);
}

export function getConfiguredModel(): string {
  const fromEnv = String(process.env.GEMINI_MODEL ?? '').trim().replace(/^['"]|['"]$/g, '');
  return isValidModelName(fromEnv) ? fromEnv : DEFAULT_GEMINI_MODEL;
}

export function getGeminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim().replace(/^['"]|['"]$/g, '');
  if (!key || key === 'MY_GEMINI_API_KEY' || key.toLowerCase().includes('your-gemini')) return null;
  return key;
}

const timeoutMs = () => intFromEnv("GEMINI_TIMEOUT_MS", 45_000, 1_000, 120_000);
const maxRetries = () => intFromEnv('GEMINI_MAX_RETRIES', 2, 0, 4);

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
  auth: 'The AI service key is missing or invalid on the server. An admin needs to check GEMINI_API_KEY.',
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

/** Turn anything thrown by the SDK / network into an AiProviderError. */
export function classifyError(err: unknown): AiProviderError {
  if (err instanceof AiProviderError) return err;
  const anyErr = err as any;
  let raw = String(anyErr?.message ?? err ?? '');
  let status = Number(anyErr?.status ?? anyErr?.code ?? anyErr?.error?.code);
  let providerStatus = String(anyErr?.error?.status ?? '');

  // The SDK often puts the provider's JSON body in .message
  if (raw.trim().startsWith('{')) {
    try {
      const body = JSON.parse(raw);
      if (body?.error) {
        raw = String(body.error.message ?? raw);
        if (!Number.isFinite(status)) status = Number(body.error.code);
        providerStatus = String(body.error.status ?? providerStatus);
      }
    } catch {
      /* keep raw */
    }
  }
  const text = `${providerStatus} ${raw}`;
  const retryMatch = raw.match(/retry in ([\d.]+)\s*s/i);
  const retryAfterMs = retryMatch ? Math.round(Number(retryMatch[1]) * 1000) : undefined;

  if (anyErr?.name === 'AbortError') {
    return new AiProviderError('aborted', raw, 499);
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(text)) {
    return new AiProviderError('rate_limit', raw, 429, retryAfterMs);
  }
  if (status === 401 || status === 403 || /API_KEY_INVALID|PERMISSION_DENIED|UNAUTHENTICATED|API key not valid/i.test(text)) {
    return new AiProviderError('auth', raw, status === 403 ? 403 : 401);
  }
  if (status === 404 || /NOT_FOUND|is not found for API version|model.*(not found|does not exist)/i.test(text)) {
    return new AiProviderError('model_unavailable', raw, 404);
  }
  if (status === 504 || /DEADLINE_EXCEEDED|timed? ?out|ETIMEDOUT/i.test(text)) {
    return new AiProviderError('timeout', raw, 504);
  }
  if (status === 400 || /INVALID_ARGUMENT|FAILED_PRECONDITION/i.test(text)) {
    return new AiProviderError('bad_request', raw, 400);
  }
  if (
    (status >= 500 && status < 600) ||
    /UNAVAILABLE|INTERNAL|overloaded|fetch failed|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|network/i.test(text)
  ) {
    return new AiProviderError('unavailable', raw, status >= 500 ? status : 503);
  }
  return new AiProviderError('unknown', raw, 500);
}

// ---------------------------------------------------------------------------
// Client + retry plumbing
// ---------------------------------------------------------------------------

let cachedClient: { key: string; client: GoogleGenAI } | null = null;
let clientFactory: ((apiKey: string) => GoogleGenAI) | null = null;

/** Tests only: replace the SDK client. Pass null to restore the real one. */
export function __setClientFactoryForTests(factory: ((apiKey: string) => any) | null) {
  clientFactory = factory;
  cachedClient = null;
}

let sleepImpl: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms));
/** Tests only: make backoff instant. */
export function __setSleepForTests(fn: ((ms: number) => Promise<void>) | null) {
  sleepImpl = fn ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
}

function getClient(): GoogleGenAI {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new AiProviderError('auth', 'GEMINI_API_KEY is not set', 401);
  if (cachedClient && cachedClient.key === apiKey) return cachedClient.client;
  const client = clientFactory ? clientFactory(apiKey) : new GoogleGenAI({ apiKey });
  cachedClient = { key: apiKey, client };
  return client;
}

function backoffMs(attempt: number, err: AiProviderError): number {
  const base = Math.min(8_000, 700 * 2 ** attempt);
  const jitter = Math.floor(Math.random() * 300);
  const hinted = err.retryAfterMs ? Math.min(10_000, err.retryAfterMs) : 0;
  return Math.max(base + jitter, hinted);
}

/** Run one attempt with a hard timeout. The SDK also receives the abort signal. */
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

export function extractSources(response: any): GroundingSource[] {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const out: GroundingSource[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const uri = chunk?.web?.uri || chunk?.retrievedContext?.uri;
    const title = chunk?.web?.title || chunk?.retrievedContext?.title || uri;
    if (typeof uri === 'string' && uri.startsWith('http') && !seen.has(uri)) {
      seen.add(uri);
      out.push({ title: String(title || uri).trim(), uri });
    }
  }
  return out.slice(0, 6);
}

const BLOCKED_FINISH = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'IMAGE_SAFETY']);

/** Throws when the response was blocked or is empty; otherwise returns the cleaned text. */
function readText(response: any): string {
  const blockReason = response?.promptFeedback?.blockReason;
  const finish = String(response?.candidates?.[0]?.finishReason ?? '');
  let text = '';
  try {
    text = cleanModelText(response?.text);
  } catch {
    text = '';
  }
  if (!text) {
    if (blockReason || BLOCKED_FINISH.has(finish)) {
      throw new AiProviderError('blocked', `blockReason=${blockReason || ''} finishReason=${finish}`, 422);
    }
    throw new AiProviderError('empty', `finishReason=${finish}`, 502);
  }
  return text;
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
// Schema conversion + conforming (validation of AI output)
// ---------------------------------------------------------------------------

/** Convert the plain JSON-Schema-style objects used by the app into Gemini's Type enums. */
export function toGeminiSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  const mapType = (t: string | undefined) => {
    switch (t) {
      case 'object':
        return GeminiType.OBJECT;
      case 'array':
        return GeminiType.ARRAY;
      case 'string':
        return GeminiType.STRING;
      case 'number':
        return GeminiType.NUMBER;
      case 'integer':
        return GeminiType.INTEGER;
      case 'boolean':
        return GeminiType.BOOLEAN;
      default:
        return t;
    }
  };
  const out: any = { ...schema };
  if (typeof out.type === 'string') out.type = mapType(out.type);
  if (out.properties && typeof out.properties === 'object') {
    const props: Record<string, any> = {};
    for (const [k, v] of Object.entries(out.properties)) props[k] = toGeminiSchema(v);
    out.properties = props;
  }
  if (out.items) out.items = toGeminiSchema(out.items);
  return out;
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

function buildConfig(opts: BaseOptions, signal: AbortSignal, extra: Record<string, any> = {}) {
  return {
    systemInstruction: opts.systemInstruction,
    maxOutputTokens: opts.maxOutputTokens,
    abortSignal: signal,
    ...extra,
  };
}

/** Run `attempt` with bounded retries for transient provider failures. */
async function retrying<T>(attempt: (n: number) => Promise<T>, outer?: AbortSignal): Promise<T> {
  const limit = maxRetries();
  let last: AiProviderError | null = null;
  for (let n = 0; n <= limit; n++) {
    try {
      return await attempt(n);
    } catch (err) {
      last = classifyError(err);
      if (!last.retryable || n === limit || outer?.aborted) throw last;
      await sleepImpl(backoffMs(n, last));
    }
  }
  throw last ?? new AiProviderError('unknown');
}

export async function generateText(
  opts: BaseOptions & { useSearch?: boolean }
): Promise<TextResult> {
  const ai = getClient();
  let searchEnabled = Boolean(opts.useSearch);
  return retrying(async () => {
    try {
      return await withTimeout(
        async (signal) => {
          const response: any = await ai.models.generateContent({
            model: opts.model,
            contents: opts.prompt,
            config: buildConfig(opts, signal, searchEnabled ? { tools: [{ googleSearch: {} }] } : {}),
          });
          const text = readText(response);
          return {
            text,
            model: opts.model,
            sources: searchEnabled ? extractSources(response) : [],
            totalTokens: Number(response?.usageMetadata?.totalTokenCount) || null,
          } satisfies TextResult;
        },
        timeoutMs(),
        opts.signal
      );
    } catch (err) {
      const e = classifyError(err);
      // If the grounding tool itself is rejected, answer without it rather than failing the member.
      if (e.code === 'bad_request' && searchEnabled) {
        searchEnabled = false;
        throw new AiProviderError('unavailable', 'search tool rejected; retrying without it', 503);
      }
      throw e;
    }
  }, opts.signal);
}

export async function generateJson<T>(
  opts: BaseOptions & {
    schema: any;
    /** Semantic check/normalizer. Throw (any Error) to reject the answer; return the value to accept it. */
    validate?: (data: any) => T;
  }
): Promise<{ data: T; model: string; totalTokens: number | null }> {
  const ai = getClient();
  const geminiSchema = toGeminiSchema(opts.schema);
  let malformedRetries = 0;
  const MAX_MALFORMED_RETRIES = 1;
  return retrying(async () => {
    try {
      return await withTimeout(
        async (signal) => {
          const response: any = await ai.models.generateContent({
            model: opts.model,
            contents: opts.prompt,
            config: buildConfig(opts, signal, { responseMimeType: 'application/json', responseSchema: geminiSchema }),
          });
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
          return { data: data as T, model: opts.model, totalTokens: Number(response?.usageMetadata?.totalTokenCount) || null };
        },
        timeoutMs(),
        opts.signal
      );
    } catch (err) {
      const e = classifyError(err);
      // Malformed JSON gets one more try at most, regardless of the general retry budget.
      if (e.code === 'malformed') {
        if (malformedRetries >= MAX_MALFORMED_RETRIES) {
          const final = new AiProviderError('malformed', (e as any).detail, 502);
          final.retryable = false;
          throw final;
        }
        malformedRetries += 1;
      }
      throw e;
    }
  }, opts.signal);
}

export type StreamEvent =
  | { type: 'token'; text: string }
  | { type: 'done'; text: string; model: string; sources: GroundingSource[]; totalTokens: number | null };

/**
 * Stream a text answer. Retries happen only before the first token is received;
 * once text has started flowing, a failure is surfaced to the caller.
 */
export async function* streamText(opts: BaseOptions & { useSearch?: boolean }): AsyncGenerator<StreamEvent> {
  const ai = getClient();
  const limit = maxRetries();
  let searchEnabled = Boolean(opts.useSearch);
  for (let n = 0; n <= limit; n++) {
    let started = false;
    let full = '';
    let sources: GroundingSource[] = [];
    let tokens: number | null = null;
    const controller = new AbortController();
    const onOuterAbort = () => controller.abort();
    if (opts.signal) {
      if (opts.signal.aborted) throw new AiProviderError('aborted', 'cancelled by caller', 499);
      opts.signal.addEventListener('abort', onOuterAbort, { once: true });
    }
    try {
      // Idle timeout: reset every time a chunk arrives.
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

      const stream: AsyncIterable<any> = await nextWithTimeout(
        ai.models.generateContentStream({
          model: opts.model,
          contents: opts.prompt,
          config: buildConfig(opts, controller.signal, searchEnabled ? { tools: [{ googleSearch: {} }] } : {}),
        }) as Promise<AsyncIterable<any>>
      );
      const iterator = stream[Symbol.asyncIterator]();
      let finishReason = '';
      let blockReason = '';
      while (true) {
        const step = await nextWithTimeout(iterator.next());
        if (step.done) break;
        const chunk = step.value;
        blockReason = chunk?.promptFeedback?.blockReason || blockReason;
        finishReason = chunk?.candidates?.[0]?.finishReason || finishReason;
        const found = extractSources(chunk);
        if (found.length) sources = found;
        tokens = Number(chunk?.usageMetadata?.totalTokenCount) || tokens;
        let piece = '';
        try {
          piece = String(chunk?.text ?? '');
        } catch {
          piece = '';
        }
        if (piece) {
          started = true;
          full += piece;
          yield { type: 'token', text: piece };
        }
      }
      const finalText = cleanModelText(full);
      if (!finalText) {
        if (blockReason || BLOCKED_FINISH.has(finishReason)) throw new AiProviderError('blocked', `${blockReason} ${finishReason}`, 422);
        throw new AiProviderError('empty', `finishReason=${finishReason}`, 502);
      }
      yield { type: 'done', text: finalText, model: opts.model, sources: searchEnabled ? sources : [], totalTokens: tokens };
      return;
    } catch (err) {
      let e = classifyError(err);
      if (opts.signal?.aborted) e = new AiProviderError('aborted', 'cancelled by caller', 499);
      if (e.code === 'bad_request' && searchEnabled && !started) {
        searchEnabled = false;
        e = new AiProviderError('unavailable', 'search tool rejected; retrying without it', 503);
      }
      if (started || !e.retryable || n === limit) throw e;
      await sleepImpl(backoffMs(n, e));
    } finally {
      opts.signal?.removeEventListener('abort', onOuterAbort);
    }
  }
}
