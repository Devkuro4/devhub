import { GoogleGenAI, Type as GeminiType } from '@google/genai';

// The schemas below describe the JSON each AI task must return. Values are plain JSON Schema types
// (converted automatically to Gemini Type enums when using @google/genai).
const Type = {
  OBJECT: 'object',
  ARRAY: 'array',
  STRING: 'string',
  NUMBER: 'number',
  INTEGER: 'integer',
  BOOLEAN: 'boolean',
} as const;

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';
const DEFAULT_GROQ_MODEL = (process.env.GROQ_MODEL || 'openai/gpt-oss-120b').trim();
const REASONING_EFFORT = (['low', 'medium', 'high'].includes(String(process.env.GROQ_REASONING_EFFORT))
  ? String(process.env.GROQ_REASONING_EFFORT)
  : 'low') as 'low' | 'medium' | 'high';

export type SupportedModel = string;

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface AiRuntimeSettings {
  provider: 'Gemini' | 'Groq';
  model: SupportedModel;
  dailyLimitPerUser: number;
  enabled: boolean;
}

export interface AiErrorLogEntry {
  id: string;
  timestamp: string;
  operation: string;
  message: string;
}

export interface AiUsageStats {
  totalCalls: number;
  callsToday: number;
  lastResetDate: string;
  byOperation: Record<string, number>;
  estimatedTokens: number;
  estimatedCostUsd: number;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastLatencyMs: number | null;
  errors: AiErrorLogEntry[];
  perUserCallsToday: Record<string, number>;
}

function getGeminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim().replace(/^['"]|['"]$/g, '');
  if (!key || key === 'MY_GEMINI_API_KEY' || key.toLowerCase().includes('your-gemini')) return null;
  return key;
}

function getGroqApiKey(): string | null {
  const key = process.env.GROQ_API_KEY?.trim().replace(/^['"]|['"]$/g, '');
  if (!key || key === 'MY_GROQ_API_KEY' || key.toLowerCase().includes('your-groq')) return null;
  return key;
}

const initialProvider: 'Gemini' | 'Groq' = getGeminiApiKey() || !getGroqApiKey() ? 'Gemini' : 'Groq';
export const MODEL_CHOICES: string[] = Array.from(
  new Set([
    DEFAULT_GEMINI_MODEL,
    'gemini-3.1-flash-lite',
    DEFAULT_GROQ_MODEL,
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
  ])
);

const runtimeSettings: AiRuntimeSettings = {
  provider: initialProvider,
  model: initialProvider === 'Gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_GROQ_MODEL,
  dailyLimitPerUser: 40,
  enabled: true,
};

let cachedGeminiClient: { key: string; client: GoogleGenAI } | null = null;
function getGeminiClient(apiKey: string): GoogleGenAI {
  if (cachedGeminiClient && cachedGeminiClient.key === apiKey) {
    return cachedGeminiClient.client;
  }
  const client = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  cachedGeminiClient = { key: apiKey, client };
  return client;
}

function toGeminiSchema(schema: any): any {
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
    for (const [k, v] of Object.entries(out.properties)) {
      props[k] = toGeminiSchema(v);
    }
    out.properties = props;
  }
  if (out.items) {
    out.items = toGeminiSchema(out.items);
  }
  return out;
}

function extractGeminiSources(response: any): GroundingSource[] {
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

const todayIso = () => new Date().toISOString().slice(0, 10);

const usageStats: AiUsageStats = {
  totalCalls: 0,
  callsToday: 0,
  lastResetDate: todayIso(),
  byOperation: {},
  estimatedTokens: 0,
  estimatedCostUsd: 0,
  lastSuccessAt: null,
  lastErrorAt: null,
  lastLatencyMs: null,
  errors: [],
  perUserCallsToday: {},
};

// Cache learning plan results to keep onboarding and repeat plan checks fast
const learningPlanCache = new Map<string, { value: any; expiresAt: number }>();
const PLAN_CACHE_TTL_MS = 30 * 60 * 1000;

function resetDailyCountersIfNeeded() {
  const today = todayIso();
  if (usageStats.lastResetDate !== today) {
    usageStats.lastResetDate = today;
    usageStats.callsToday = 0;
    usageStats.perUserCallsToday = {};
  }
}

function getActiveProvider(): { provider: 'Gemini' | 'Groq'; apiKey: string; defaultModel: string } {
  const geminiKey = getGeminiApiKey();
  const groqKey = getGroqApiKey();
  if (runtimeSettings.provider === 'Groq' && groqKey) {
    return { provider: 'Groq', apiKey: groqKey, defaultModel: DEFAULT_GROQ_MODEL };
  }
  if (geminiKey) {
    return { provider: 'Gemini', apiKey: geminiKey, defaultModel: DEFAULT_GEMINI_MODEL };
  }
  if (groqKey) {
    return { provider: 'Groq', apiKey: groqKey, defaultModel: DEFAULT_GROQ_MODEL };
  }
  throw new Error('AI service key is not configured on the server yet.');
}

function recordError(operation: string, message: string) {
  usageStats.lastErrorAt = new Date().toISOString();
  usageStats.errors = [
    {
      id: `err-${Date.now()}`,
      timestamp: new Date().toISOString(),
      operation,
      message: message.slice(0, 300),
    },
    ...usageStats.errors,
  ].slice(0, 20);
}

function estimateTokensFromText(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function checkRateAndAvailability(userId: string, operation: string): { provider: 'Gemini' | 'Groq'; apiKey: string; defaultModel: string } {
  resetDailyCountersIfNeeded();
  if (!runtimeSettings.enabled) {
    throw new Error('AI features are currently paused by the community administrator.');
  }
  const active = getActiveProvider();
  const userCalls = usageStats.perUserCallsToday[userId] || 0;
  if (userCalls >= runtimeSettings.dailyLimitPerUser) {
    throw new Error(`Daily AI limit (${runtimeSettings.dailyLimitPerUser} requests) reached for today. Try again tomorrow or ask an admin to raise the limit.`);
  }
  usageStats.perUserCallsToday[userId] = userCalls + 1;
  usageStats.totalCalls += 1;
  usageStats.callsToday += 1;
  usageStats.byOperation[operation] = (usageStats.byOperation[operation] || 0) + 1;
  return active;
}

class GroqHttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function groqRequest(apiKey: string, body: Record<string, unknown>): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(raw);
    } catch {}
    if (!res.ok) {
      const message = String(data?.error?.message || raw || `Groq request failed (${res.status})`).slice(0, 500);
      throw new GroqHttpError(message, res.status);
    }
    return data;
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new GroqHttpError('The AI took too long to answer. Please try again.', 504);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function groqChat(apiKey: string, body: Record<string, unknown>, optionalKeys: string[]): Promise<any> {
  try {
    return await groqRequest(apiKey, body);
  } catch (err: any) {
    if (err instanceof GroqHttpError && err.status === 400 && optionalKeys.some((k) => k in body)) {
      const slim = { ...body };
      for (const k of optionalKeys) delete slim[k];
      return groqRequest(apiKey, slim);
    }
    throw err;
  }
}

function modelOptions(model: string): Record<string, unknown> {
  return /gpt-oss/i.test(model) ? { reasoning_effort: REASONING_EFFORT } : {};
}

function cleanModelText(text: unknown): string {
  return String(text ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
}

function parseJsonLoose(raw: string): any {
  const text = cleanModelText(raw).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(text);
  } catch {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) return JSON.parse(text.slice(first, last + 1));
    throw new Error('The AI returned an answer in an unexpected format. Please try again.');
  }
}

function extractSources(choice: any): GroundingSource[] {
  const out: GroundingSource[] = [];
  const seen = new Set<string>();
  const add = (url: unknown, title: unknown) => {
    if (typeof url !== 'string' || !url.startsWith('http') || seen.has(url)) return;
    seen.add(url);
    out.push({ title: typeof title === 'string' && title.trim() ? title.trim() : url, uri: url });
  };
  const msg = choice?.message;
  for (const a of Array.isArray(msg?.annotations) ? msg.annotations : []) {
    add(a?.url_citation?.url ?? a?.url, a?.url_citation?.title ?? a?.title);
  }
  for (const t of Array.isArray(msg?.executed_tools) ? msg.executed_tools : []) {
    const results = t?.search_results?.results;
    for (const r of Array.isArray(results) ? results : []) add(r?.url, r?.title);
  }
  return out.slice(0, 6);
}

function formatAiError(err: any, fallback: string): Error {
  if (err instanceof GroqHttpError) {
    if (err.status === 401) return new Error('AI provider rejected the API key. Check server credentials.');
    if (err.status === 429) return new Error('AI provider is busy or the rate limit was reached. Please wait a moment and try again.');
    if (err.status === 404 || /model.*(not found|does not exist|decommission|no longer)/i.test(err.message)) {
      return new Error(`The AI model "${runtimeSettings.model}" is not available. Ask an admin to pick another model.`);
    }
    return new Error(err.message || fallback);
  }
  const raw = String(err?.message || '').trim();
  if (/RESOURCE_EXHAUSTED|429/i.test(raw)) {
    return new Error('AI rate limit was reached temporarily. Please wait a moment and try again.');
  }
  if (/API_KEY_INVALID|PERMISSION_DENIED/i.test(raw)) {
    return new Error('AI service key is missing or invalid in Settings > Secrets.');
  }
  return err instanceof Error ? err : new Error(raw || fallback);
}

async function runTextOperation(
  userId: string,
  operation: string,
  prompt: string,
  systemInstruction: string,
  options?: { useWebSearch?: boolean; forceModel?: SupportedModel }
): Promise<{ text: string; model: string; latencyMs: number; sources: GroundingSource[] }> {
  const started = Date.now();
  try {
    const { provider, apiKey, defaultModel } = checkRateAndAvailability(userId, operation);
    const chosen = options?.forceModel || runtimeSettings.model || defaultModel;

    if (provider === 'Gemini') {
      const modelToUse = chosen.startsWith('gemini-') ? chosen : DEFAULT_GEMINI_MODEL;
      const ai = getGeminiClient(apiKey);
      const config: Record<string, any> = {
        systemInstruction,
      };
      if (options?.useWebSearch) {
        config.tools = [{ googleSearch: {} }];
      }
      const response = await ai.models.generateContent({
        model: modelToUse,
        contents: prompt,
        config,
      });
      const text = cleanModelText(response.text);
      const sources = options?.useWebSearch ? extractGeminiSources(response) : [];
      const latencyMs = Date.now() - started;
      const tokens = Number(response.usageMetadata?.totalTokenCount) || estimateTokensFromText(prompt + text);
      usageStats.estimatedTokens += tokens;
      usageStats.estimatedCostUsd = Number((usageStats.estimatedTokens * 0.0000003).toFixed(5));
      usageStats.lastSuccessAt = new Date().toISOString();
      usageStats.lastLatencyMs = latencyMs;
      return { text, model: modelToUse, latencyMs, sources };
    }

    const modelToUse = !chosen.startsWith('gemini-') ? chosen : DEFAULT_GROQ_MODEL;
    const body: Record<string, unknown> = {
      model: modelToUse,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
      temperature: 0.6,
      max_completion_tokens: 3000,
      ...modelOptions(modelToUse),
    };
    if (options?.useWebSearch) body.tools = [{ type: 'browser_search' }];

    const data = await groqChat(apiKey, body, ['tools', 'reasoning_effort', 'max_completion_tokens']);
    const choice = data?.choices?.[0];
    const text = cleanModelText(choice?.message?.content);
    const sources = options?.useWebSearch ? extractSources(choice) : [];
    const latencyMs = Date.now() - started;
    const tokens = Number(data?.usage?.total_tokens) || estimateTokensFromText(prompt + text);
    usageStats.estimatedTokens += tokens;
    usageStats.estimatedCostUsd = Number((usageStats.estimatedTokens * 0.0000003).toFixed(5));
    usageStats.lastSuccessAt = new Date().toISOString();
    usageStats.lastLatencyMs = latencyMs;
    return { text, model: modelToUse, latencyMs, sources };
  } catch (err: any) {
    const cleanErr = formatAiError(err, 'AI request failed');
    recordError(operation, cleanErr.message);
    throw cleanErr;
  }
}

async function runJsonOperation<T>(
  userId: string,
  operation: string,
  prompt: string,
  systemInstruction: string,
  responseSchema: any
): Promise<{ data: T; model: string; latencyMs: number }> {
  const started = Date.now();
  try {
    const { provider, apiKey, defaultModel } = checkRateAndAvailability(userId, operation);

    if (provider === 'Gemini') {
      const modelToUse = runtimeSettings.model.startsWith('gemini-') ? runtimeSettings.model : DEFAULT_GEMINI_MODEL;
      const ai = getGeminiClient(apiKey);
      const response = await ai.models.generateContent({
        model: modelToUse,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: toGeminiSchema(responseSchema),
        },
      });
      const raw = cleanModelText(response.text) || '{}';
      const parsed = parseJsonLoose(raw) as T;
      const latencyMs = Date.now() - started;
      const tokens = Number(response.usageMetadata?.totalTokenCount) || estimateTokensFromText(prompt + raw);
      usageStats.estimatedTokens += tokens;
      usageStats.estimatedCostUsd = Number((usageStats.estimatedTokens * 0.0000003).toFixed(5));
      usageStats.lastSuccessAt = new Date().toISOString();
      usageStats.lastLatencyMs = latencyMs;
      return { data: parsed, model: modelToUse, latencyMs };
    }

    const modelToUse = !runtimeSettings.model.startsWith('gemini-') ? runtimeSettings.model : DEFAULT_GROQ_MODEL;
    const jsonInstruction = `${systemInstruction}

Return ONLY one valid JSON object, with no markdown and no commentary, that follows this JSON Schema exactly. Fill every field:
${JSON.stringify(responseSchema)}`;
    const body: Record<string, unknown> = {
      model: modelToUse,
      messages: [
        { role: 'system', content: jsonInstruction },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      max_completion_tokens: 6000,
      response_format: { type: 'json_object' },
      ...modelOptions(modelToUse),
    };
    const data = await groqChat(apiKey, body, ['response_format', 'reasoning_effort', 'max_completion_tokens']);
    const raw = cleanModelText(data?.choices?.[0]?.message?.content) || '{}';
    const parsed = parseJsonLoose(raw) as T;
    const latencyMs = Date.now() - started;
    const tokens = Number(data?.usage?.total_tokens) || estimateTokensFromText(prompt + raw);
    usageStats.estimatedTokens += tokens;
    usageStats.estimatedCostUsd = Number((usageStats.estimatedTokens * 0.0000003).toFixed(5));
    usageStats.lastSuccessAt = new Date().toISOString();
    usageStats.lastLatencyMs = latencyMs;
    return { data: parsed, model: modelToUse, latencyMs };
  } catch (err: any) {
    const cleanErr = formatAiError(err, 'Structured AI request failed');
    recordError(operation, cleanErr.message);
    throw cleanErr;
  }
}

/** True when at least one AI key is set. Used by /api/health so a missing key is obvious at launch. */
export function isAiConfigured() {
  return Boolean(getGeminiApiKey() || getGroqApiKey());
}

export function getAiStatus() {
  resetDailyCountersIfNeeded();
  const hasGemini = Boolean(getGeminiApiKey());
  const hasGroq = Boolean(getGroqApiKey());
  const activeProvider: 'Gemini' | 'Groq' =
    runtimeSettings.provider === 'Groq' && hasGroq ? 'Groq' : hasGemini ? 'Gemini' : hasGroq ? 'Groq' : runtimeSettings.provider;
  return {
    configured: hasGemini || hasGroq,
    settings: { ...runtimeSettings, provider: activeProvider },
    modelChoices: MODEL_CHOICES.filter((m) => (m.startsWith('gemini-') ? hasGemini : hasGroq)),
    stats: {
      totalCalls: usageStats.totalCalls,
      callsToday: usageStats.callsToday,
      lastResetDate: usageStats.lastResetDate,
      byOperation: usageStats.byOperation,
      estimatedTokens: usageStats.estimatedTokens,
      estimatedCostUsd: usageStats.estimatedCostUsd,
      lastSuccessAt: usageStats.lastSuccessAt,
      lastErrorAt: usageStats.lastErrorAt,
      lastLatencyMs: usageStats.lastLatencyMs,
      errors: usageStats.errors,
    },
  };
}

export function updateAiSettings(patch: Partial<AiRuntimeSettings>) {
  if (typeof patch.model === 'string' && /^[A-Za-z0-9._\/:-]{3,80}$/.test(patch.model.trim())) {
    const nextModel = patch.model.trim();
    const wantsGemini = nextModel.startsWith('gemini-');
    // Ignore a model whose provider has no key on this server (it could only fail for every member).
    if (wantsGemini ? getGeminiApiKey() : getGroqApiKey()) {
      runtimeSettings.model = nextModel;
      runtimeSettings.provider = wantsGemini ? 'Gemini' : 'Groq';
    }
  }
  if (typeof patch.dailyLimitPerUser === 'number' && patch.dailyLimitPerUser >= 5 && patch.dailyLimitPerUser <= 500) {
    runtimeSettings.dailyLimitPerUser = Math.round(patch.dailyLimitPerUser);
  }
  if (typeof patch.enabled === 'boolean') {
    runtimeSettings.enabled = patch.enabled;
  }
  return getAiStatus();
}

export async function testAiConnection(userId: string) {
  const result = await runTextOperation(
    userId,
    'testConnection',
    'Reply with exactly: Dev Hub AI connection verified.',
    'You are checking API connectivity. Respond concisely in 6 words or fewer.'
  );
  return {
    ok: true,
    model: result.model,
    latencyMs: result.latencyMs,
    reply: result.text,
  };
}

// 1. Roadmap Generation
export async function generateAiRoadmap(
  userId: string,
  input: { field: string; skillLevel: string; knownSkills: string; goal: string; studyTime: string }
) {
  const schema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      summary: { type: Type.STRING },
      stages: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            stageName: { type: Type.STRING },
            description: { type: Type.STRING },
            topics: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  whyItMatters: { type: Type.STRING },
                },
              },
            },
          },
        },
      },
    },
  };

  const prompt = `Create a practical, beginner-friendly learning roadmap for:
Field: ${input.field}
Current Level: ${input.skillLevel}
Already Knows: ${input.knownSkills || 'None specified'}
Goal: ${input.goal}
Study Time: ${input.studyTime}

Organize into 3 to 4 progressive stages with 3 to 5 clear, real-world topics per stage in prerequisite order. Use plain, encouraging English.`;

  return runJsonOperation<{
    title: string;
    summary: string;
    stages: { stageName: string; description: string; topics: { name: string; whyItMatters: string }[] }[];
  }>(
    userId,
    'roadmapGeneration',
    prompt,
    'You are an experienced, supportive developer educator designing realistic industry learning roadmaps. Never invent fake technologies.',
    schema
  );
}

// 2. Learning Plan & Course-vs-Roadmap Comparison
export async function generateLearningPlan(
  userId: string,
  input: {
    courseTitle: string;
    platform: string;
    field: string;
    currentLesson: string;
    description: string;
    modules: string[];
    roadmapTitle: string;
    roadmapTopics: string[];
    skillLevel: string;
    studyTime: string;
  }
) {
  const cacheKey = JSON.stringify({
    courseTitle: (input.courseTitle || '').trim().toLowerCase(),
    platform: (input.platform || '').trim().toLowerCase(),
    field: (input.field || '').trim().toLowerCase(),
    currentLesson: (input.currentLesson || '').trim().toLowerCase(),
    modules: (input.modules || []).slice(0, 40).map((m) => m.trim().toLowerCase()),
    roadmapTitle: (input.roadmapTitle || '').trim().toLowerCase(),
    skillLevel: (input.skillLevel || '').trim().toLowerCase(),
    studyTime: (input.studyTime || '').trim().toLowerCase(),
  });

  const cached = learningPlanCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      data: cached.value as {
        planSummary: string;
        dailyTargets: {
          dayLabel: string;
          topic: string;
          objective: string;
          estimatedMinutes: number;
          whatYouWillUnderstand: string;
        }[];
        coveredRoadmapTopics: string[];
        missingRoadmapTopics: string[];
        advice: string;
      },
      model: runtimeSettings.model,
      latencyMs: 1,
    };
  }

  const schema = {
    type: Type.OBJECT,
    properties: {
      planSummary: { type: Type.STRING },
      dailyTargets: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            dayLabel: { type: Type.STRING },
            topic: { type: Type.STRING },
            objective: { type: Type.STRING },
            estimatedMinutes: { type: Type.INTEGER },
            whatYouWillUnderstand: { type: Type.STRING },
          },
        },
      },
      coveredRoadmapTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
      missingRoadmapTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
      advice: { type: Type.STRING },
    },
  };

  const prompt = `Member is studying an external course while following a roadmap. Do NOT tell them to abandon their course.
Course: ${input.courseTitle} (${input.platform}, Field: ${input.field})
Current lesson/module: ${input.currentLesson}
Description: ${input.description}
Course modules provided: ${input.modules.join('; ') || 'Not listed'}
Member level: ${input.skillLevel}, Study time: ${input.studyTime}
Selected Roadmap: ${input.roadmapTitle}
Roadmap topics: ${input.roadmapTopics.join(', ')}

Return a structured 5-day starter learning plan with plain-English objectives, plus which roadmap topics their course appears to cover and which important topics might be missing.`;

  const res = await runJsonOperation<{
    planSummary: string;
    dailyTargets: {
      dayLabel: string;
      topic: string;
      objective: string;
      estimatedMinutes: number;
      whatYouWillUnderstand: string;
    }[];
    coveredRoadmapTopics: string[];
    missingRoadmapTopics: string[];
    advice: string;
  }>(
    userId,
    'learningPlanGeneration',
    prompt,
    'You are a patient learning coach organizing external courses into clear daily targets without overwhelming beginners. Never claim to have watched videos you did not see.',
    schema
  );

  if (learningPlanCache.size >= 100) {
    const oldestKey = learningPlanCache.keys().next().value;
    if (oldestKey) learningPlanCache.delete(oldestKey);
  }
  learningPlanCache.set(cacheKey, {
    value: res.data,
    expiresAt: Date.now() + PLAN_CACHE_TTL_MS,
  });

  return res;
}

// 3. Daily Exercise Generation
export async function generateDailyExercise(
  userId: string,
  input: {
    field: string;
    language: string;
    skillLevel: string;
    courseTitle: string;
    topic: string;
    objective: string;
  }
) {
  const schema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      instructions: { type: Type.STRING },
      requirements: { type: Type.ARRAY, items: { type: Type.STRING } },
      expectedConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
      starterHint: { type: Type.STRING },
      estimatedMinutes: { type: Type.INTEGER },
      isTheoryOnly: { type: Type.BOOLEAN },
    },
  };

  const prompt = `Create ONE practical coding exercise (no full solution!) for today's study session:
Field: ${input.field}
Language: ${input.language}
Level: ${input.skillLevel}
Course: ${input.courseTitle}
Topic: ${input.topic}
Learning Objective: ${input.objective}

Keep it achievable in 20-35 minutes. Provide a gentle starting hint without giving away the answer.`;

  return runJsonOperation<{
    title: string;
    instructions: string;
    requirements: string[];
    expectedConcepts: string[];
    starterHint: string;
    estimatedMinutes: number;
    isTheoryOnly: boolean;
  }>(
    userId,
    'dailyExerciseGeneration',
    prompt,
    'You design practical beginner-to-intermediate coding exercises. Never include the completed solution.',
    schema
  );
}

// 4. AI Code Review
export async function reviewCodeSubmission(
  userId: string,
  input: {
    language: string;
    skillLevel: string;
    courseTitle: string;
    topic: string;
    objective: string;
    requirements: string[];
    expectedConcepts: string[];
    previousFeedback: string;
    code: string;
    explanation: string;
    sandboxExecutionOutput: string;
    sandboxExecuted: boolean;
  }
) {
  const schema = {
    type: Type.OBJECT,
    properties: {
      whatYouDidWell: { type: Type.STRING },
      whatNeedsImprovement: { type: Type.STRING },
      understandingChecks: { type: Type.ARRAY, items: { type: Type.STRING } },
      suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
      nextStep: { type: Type.STRING },
      recommendedStatus: { type: Type.STRING },
      analysisTypeLabel: { type: Type.STRING },
    },
  };

  const prompt = `Review this learner's code submission carefully using supportive, plain English appropriate for their level (${input.skillLevel}).
Language: ${input.language}
Course & Topic: ${input.courseTitle} — ${input.topic}
Daily Objective: ${input.objective}
Exercise Requirements: ${input.requirements.join('; ') || 'General practice'}
Expected Concepts: ${input.expectedConcepts.join(', ') || input.topic}
Previous Relevant Feedback: ${input.previousFeedback || 'None'}
Learner's Explanation: ${input.explanation || 'No explanation written'}
Execution Verification: ${
    input.sandboxExecuted
      ? `Executed safely in browser sandbox. Output:\n${input.sandboxExecutionOutput}`
      : 'Static code analysis only (code was NOT executed on a server — do not falsely claim runtime execution succeeded).'
  }

Submitted Code / Notes:
${input.code.slice(0, 12000)}

Rules:
- Do not judge a beginner by senior enterprise standards.
- Do not rewrite their whole code immediately; give hints before full solutions.
- Ask 1 or 2 specific "Understanding check" questions about lines or logic they actually wrote.
- Set recommendedStatus to one of: "Demonstrated", "Practised", or "Needs Revision".
- Set analysisTypeLabel to "${input.sandboxExecuted ? 'Verified Browser Execution + AI Review' : 'Static Code Analysis (Not Executed)'}".`;

  return runJsonOperation<{
    whatYouDidWell: string;
    whatNeedsImprovement: string;
    understandingChecks: string[];
    suggestions: string[];
    nextStep: string;
    recommendedStatus: string;
    analysisTypeLabel: string;
  }>(
    userId,
    'codeReview',
    prompt,
    'You are an encouraging coding mentor reviewing student submissions. Explain clearly in plain language and ask targeted understanding-check questions.',
    schema
  );
}

// 5. Quiz Generation
export async function generateAiQuiz(
  userId: string,
  input: {
    topic: string;
    courseTitle: string;
    field: string;
    difficulty: string;
    quizScope: string;
    existingQuestionPrompts: string[];
  }
) {
  const schema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      questions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING },
            topic: { type: Type.STRING },
            prompt: { type: Type.STRING },
            code: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            answer: { type: Type.STRING },
            explanation: { type: Type.STRING },
          },
        },
      },
    },
  };

  const prompt = `Generate a ${input.quizScope || 'Topic'} quiz with 4 varied questions that test real understanding (not rote memorization).
Topic: ${input.topic}
Course: ${input.courseTitle}
Field: ${input.field}
Difficulty: ${input.difficulty}
Avoid repeating any of these recent questions: ${input.existingQuestionPrompts.slice(0, 10).join(' | ') || 'None'}

Mix question types using ONLY these exact "type" values: "mcq", "true_false", "code_output", "find_error", "short_answer".
For "mcq", "code_output", "find_error": provide 4 clear options and set "answer" to the exact winning option string.
For "true_false": set options to ["True", "False"] and "answer" to "True" or "False".
For "short_answer": set options to [] and "answer" to a clear concise expected answer.
Include simple, helpful explanations for every question.`;

  return runJsonOperation<{
    title: string;
    questions: {
      type: string;
      topic: string;
      prompt: string;
      code: string;
      options: string[];
      answer: string;
      explanation: string;
    }[];
  }>(
    userId,
    'quizGeneration',
    prompt,
    'You create practical, level-appropriate developer quizzes that test comprehension, debugging, and code reading.',
    schema
  );
}

// 6. Quiz Short-Answer Evaluation
export async function evaluateShortAnswer(
  userId: string,
  input: { questionPrompt: string; expectedAnswer: string; userAnswer: string; topic: string; skillLevel: string }
) {
  const schema = {
    type: Type.OBJECT,
    properties: {
      isCorrect: { type: Type.BOOLEAN },
      feedback: { type: Type.STRING },
    },
  };

  const prompt = `Evaluate this learner's short answer fairly for a ${input.skillLevel} student studying "${input.topic}".
Question: ${input.questionPrompt}
Expected concept/answer: ${input.expectedAnswer}
Learner's answer: ${input.userAnswer}

Mark isCorrect true if they understood the core idea even with slightly different wording, and give 1-2 sentences of clear feedback.`;

  return runJsonOperation<{ isCorrect: boolean; feedback: string }>(
    userId,
    'quizEvaluation',
    prompt,
    'You grade learner short answers generously for conceptual understanding while clarifying misconceptions clearly.',
    schema
  );
}

// 7. Personalized Weekly Project Generation
export async function generateWeeklyProject(
  userId: string,
  input: {
    field: string;
    language: string;
    skillLevel: string;
    topicsCovered: string[];
    weakTopics: string[];
    recentSubmissionSummary: string;
    projectTier: string;
  }
) {
  const schema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      shortDescription: { type: Type.STRING },
      whatItShouldDo: { type: Type.STRING },
      requirements: { type: Type.ARRAY, items: { type: Type.STRING } },
      conceptsToUse: { type: Type.ARRAY, items: { type: Type.STRING } },
      optionalHints: { type: Type.ARRAY, items: { type: Type.STRING } },
      milestones: { type: Type.ARRAY, items: { type: Type.STRING } },
      submissionInstructions: { type: Type.STRING },
      projectLevel: { type: Type.STRING },
    },
  };

  const prompt = `Design ONE personalized weekly coding project tailored specifically to this learner:
Field: ${input.field}
Language/Stack: ${input.language}
Level: ${input.skillLevel}
Desired Project Tier: ${input.projectTier || 'Guided beginner project'}
Topics Covered This Week: ${input.topicsCovered.join(', ') || 'Core basics'}
Areas Needing Practice: ${input.weakTopics.join(', ') || 'Applying basics independently'}
Recent Submissions Context: ${input.recentSubmissionSummary || 'Starting first project'}

Make sure it is realistic for 1 week, directly applies what they studied, includes 3-5 clear requirements, 3 small milestones, and helpful hints (no full code solution).`;

  return runJsonOperation<{
    title: string;
    shortDescription: string;
    whatItShouldDo: string;
    requirements: string[];
    conceptsToUse: string[];
    optionalHints: string[];
    milestones: string[];
    submissionInstructions: string;
    projectLevel: string;
  }>(
    userId,
    'weeklyProjectGeneration',
    prompt,
    'You design practical, motivating weekly coding projects matched to a developer’s exact current skills.',
    schema
  );
}

// 8. AI Project Review
export async function reviewProjectSubmission(
  userId: string,
  input: {
    projectTitle: string;
    requirements: string[];
    conceptsToUse: string[];
    skillLevel: string;
    repoUrl: string;
    demoUrl: string;
    explanation: string;
    codeSnippet: string;
  }
) {
  const schema = {
    type: Type.OBJECT,
    properties: {
      summary: { type: Type.STRING },
      requirementsMet: { type: Type.ARRAY, items: { type: Type.STRING } },
      improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
      understandingQuestion: { type: Type.STRING },
      nextStep: { type: Type.STRING },
    },
  };

  const prompt = `Review this learner's weekly project submission against its requirements:
Project: ${input.projectTitle}
Learner Level: ${input.skillLevel}
Requirements: ${input.requirements.join('; ')}
Expected Concepts: ${input.conceptsToUse.join(', ')}
Repo Link: ${input.repoUrl || 'None'}
Demo Link: ${input.demoUrl || 'None'}
Learner Explanation: ${input.explanation}
Code / Notes Submitted: ${input.codeSnippet.slice(0, 10000) || 'No inline code attached — evaluate based on explanation and structure described; note clearly that live repo code was not executed.'}

Be supportive, practical, and honest about what could be verified from the submitted text/code.`;

  return runJsonOperation<{
    summary: string;
    requirementsMet: string[];
    improvements: string[];
    understandingQuestion: string;
    nextStep: string;
  }>(
    userId,
    'projectReview',
    prompt,
    'You review student software projects encouragingly, checking requirements, code organization, and true understanding.',
    schema
  );
}

// 9. AI Mentor Chat (with optional web search)
export async function mentorChatReply(
  userId: string,
  input: {
    message: string;
    history: { sender: string; text: string }[];
    useWebSearch?: boolean;
    hintLevel?: number;
    context: {
      field: string;
      skillLevel: string;
      roadmapTitle: string;
      activeCourse: string;
      currentTopic: string;
      weakTopics: string[];
      recentSubmissions: string[];
      activeProject: string;
      learningGoal?: string;
      biggestDifficulty?: string;
      contentPreference?: string;
    };
  }
) {
  // Hint ladder: the learner chooses how much help they want. Less help is the default
  // path to independence; more help is always available, and is recorded for their score.
  // Every level keeps the same rule: ONE small step per reply, then stop and let the learner think.
  const hintLevel = input.hintLevel === 1 || input.hintLevel === 3 ? input.hintLevel : 2;
  const hintRule =
    hintLevel === 1
      ? 'HELP LEVEL: NUDGE. Do NOT give the answer, the fix, or finished code. Reply in at most 3 short sentences: name the concept or place to look and ask ONE guiding question so they find the next step themselves.'
      : hintLevel === 3
        ? 'HELP LEVEL: WALKTHROUGH. The learner wants to be guided closely. Still do it ONE stage per reply (never the whole explanation at once): explain that stage fully and plainly, show your reasoning, then ask one question to check they followed. If it is their own graded exercise or project, explain the approach and the key ideas but let them write the final code.'
        : 'HELP LEVEL: HINT. Give a concrete hint for the next step only: the approach, the right concept, or a short outline. Do NOT give the finished solution or a full copy-paste code block. End by asking them to try it and tell you what happened.';

  const levelGuide = /complete beginner|beginner/i.test(input.context.skillLevel)
    ? 'Use very simple, everyday English and tiny examples. Avoid jargon; if you must use a term, explain it in one short sentence the first time.'
    : /advanced/i.test(input.context.skillLevel)
      ? 'Encourage architectural reasoning, trade-offs, and independent research. You can move faster, but keep the one-step-then-check rhythm.'
      : 'Give hints and guiding questions before direct answers so the learner builds problem-solving confidence.';

  const teachingMethod = `HOW YOU TEACH (this matters more than anything else):
You are a patient teacher who sits next to the learner and builds understanding step by step. You are NOT an encyclopedia and you never dump everything at once.

THE GOLDEN RULES
1. ONE small step per reply. Cover a single idea or a single stage, then STOP. Never explain the whole thing in one message.
2. Keep replies short: usually 60 to 150 words. Only go longer for a short code snippet or a small trace table that the step needs.
3. End almost every reply with exactly ONE question for the learner (predict the next value, say what a line does, spot the problem). Then stop and wait. Never answer your own question.
4. When the learner replies, first react to THEIR answer: say what they got right, gently correct any misunderstanding, and explain why. Only then move to the next small step.
5. Read the conversation so far to see which stage you are on. Do not repeat stages you already covered and do not jump ahead of the learner.
6. Plain language, warm tone. Never say "obviously" or "simply". No walls of text, no long bullet lists, no headings.

THE STAGES (move through them gradually, usually one per reply, skipping any that don't apply)
1. Bigger picture: what is this code or concept for, what problem does it solve, what goes in and what comes out, what is the overall flow. Do this BEFORE explaining any individual line.
2. Structure: point out the main pieces (variables, functions, loops, conditions, objects) and how they connect.
3. My thought process: show how YOU read the code out loud ("I see a list called numbers, so there is a collection of values. I see total = 0, so something needs to collect a result..."), so the learner copies the way of thinking, not just the conclusion.
4. Trace the execution: step through what actually happens, with changing variable values. Use a small markdown table when it helps (columns like Iteration | variable | before | after). Trace a few rows, ask the learner to fill in the next row.
5. The WHY: explain why this approach, why this variable, why the condition is written that way, and what would break if it were removed or moved. Example: do not just say "+= adds a value"; say that total += number means total = total + number, and that it is used here because we are collecting a running sum.
6. Experiment: suggest one tiny change and ask the learner to PREDICT the result before you reveal it.
7. Debugging (only if something is broken): do not fix it straight away. Lead them to see (a) what the code should do, (b) what it actually does, (c) where those two start to differ, (d) why. Preserve their original code and propose only the smallest change that fixes it. Ask them to find the spot first.
8. Their turn: finish with a small exercise or question so they practise reasoning on their own.

WHEN THE LEARNER FEELS LOW, STUCK OR DISCOURAGED
Watch for signs like "I can't do this", "I'm too slow", "I'm stupid", "I give up", "this is too hard", "I'll never get it", frustration, or a very flat or tired tone. When you notice them, the person matters more than the lesson:
1. Put the feelings first. Start with one or two warm, genuine sentences that acknowledge how they feel. Do not rush to the lesson and do not give a lecture.
2. Normalise it honestly. Feeling stuck is a normal part of learning to code, and every developer has felt it. Never pretend it is easy, never say "it's simple", and never use empty cheerleading.
3. Point to real evidence. Mention something true from their context or the conversation (a topic they are working on, a question they asked, a step they just got right). Never invent achievements or numbers.
4. Make the next step tiny. Shrink the problem to something they can finish in about 5 minutes, so they get a small win. When someone is discouraged, you may give a bit more help than their chosen help level would normally allow; do not withhold help to make a point.
5. Keep it short and kind (about 60 to 120 words) and end with one gentle question or an easy choice (for example "Want to try just this one line together?").
6. Offer a break if they sound exhausted: stepping away for a few minutes is a good move, not a failure.
7. Praise effort and progress, not talent.
If they say something that suggests serious distress, such as hopelessness, feeling worthless, or thoughts of harming themselves, set the lesson aside completely. Respond with warmth and care, tell them they matter, and encourage them to talk to someone they trust or a local support service or emergency number right now. Do not give a lesson, a task or advice about studying in that reply.

GOAL: the learner should get better at reading code, tracing code, and reasoning about code, and gradually need you less. If they ask "just give me the answer", respect their chosen help level, but still explain the reasoning in small steps.
If their question is not about code (a concept, a career or study question), use the same approach: start with the big picture in a few sentences, then go one small step at a time and check in.
If they ask a quick factual question, answer it directly in 1 to 3 sentences, then offer to go deeper.`;

  const systemInstruction = `You are Dev Hub’s Personal Study Mentor.
Member context:
- Field: ${input.context.field}
- Level: ${input.context.skillLevel}
- Roadmap: ${input.context.roadmapTitle}
- Current Course: ${input.context.activeCourse || 'None yet'}
- Current Topic: ${input.context.currentTopic || 'Getting started'}
- Areas needing review: ${input.context.weakTopics.join(', ') || 'None yet'}
- Recent code submissions: ${input.context.recentSubmissions.join('; ') || 'None yet'}
- Current project: ${input.context.activeProject || 'None yet'}
- Learning goal: ${input.context.learningGoal || 'Not stated'}
- Finds hardest: ${input.context.biggestDifficulty || 'Not stated'}
- Learns best with: ${input.context.contentPreference || 'Not stated'}

${teachingMethod}

Level guide: ${levelGuide}
${hintRule}
When live web search is enabled, verify current documentation, APIs, and best practices without inventing links. Reply in the same language the learner writes in.`;

  // The conversation is saved on the member's account, so we can send a longer transcript.
  // Each message is trimmed so a very long paste cannot crowd out the rest.
  const clip = (t: string) => (t.length > 1800 ? `${t.slice(0, 1800)}…` : t);
  const recentTranscript = input.history
    .slice(-16)
    .map((m) => `${m.sender === 'user' ? 'Learner' : 'Mentor'}: ${clip(String(m.text || ''))}`)
    .join('\n');

  const prompt = `${recentTranscript ? `Conversation so far:\n${recentTranscript}\n\n` : ''}Learner: ${clip(String(input.message || ''))}\n\n(Continue as the Mentor: react to the learner's latest message, then take ONE small next step and ask ONE question.)`;
  return runTextOperation(userId, 'aiMentoring', prompt, systemInstruction, {
    useWebSearch: input.useWebSearch !== false,
  });
}

// 9b. Live web-search Developer Lookup
export async function searchDeveloperDocs(
  userId: string,
  input: { query: string; field: string; skillLevel: string }
) {
  const query = String(input.query || '').trim();
  if (!query) throw new Error('Enter a question or topic to search.');
  const systemInstruction = `You are Dev Hub's live documentation & resource finder helping a ${input.skillLevel || 'Beginner'} developer studying ${input.field || 'Web Development'}.
Use your web search tool to verify current documentation, release changes, and trustworthy beginner-friendly references. Summarize clearly in plain language with practical takeaways (3-5 short bullets or concise paragraphs).`;

  const result = await runTextOperation(
    userId,
    'webSearchLookup',
    `Find accurate, up-to-date guidance and official learning references for: ${query}`,
    systemInstruction,
    { useWebSearch: true }
  );

  return {
    answer: result.text,
    sources: result.sources,
    query,
    model: result.model,
    latencyMs: result.latencyMs,
  };
}

// 10. Weekly Progress Summary
export async function generateWeeklySummary(
  userId: string,
  input: {
    field: string;
    skillLevel: string;
    topicsStudied: string[];
    submissionsCount: number;
    quizSummary: string;
    projectsCompleted: number;
    struggles: string[];
    checkInNotes: string;
  }
) {
  const schema = {
    type: Type.OBJECT,
    properties: {
      whatYouLearned: { type: Type.STRING },
      whatYouBuilt: { type: Type.STRING },
      understoodWell: { type: Type.ARRAY, items: { type: Type.STRING } },
      areasToRevisit: { type: Type.ARRAY, items: { type: Type.STRING } },
      strongestAreas: { type: Type.ARRAY, items: { type: Type.STRING } },
      nextGoals: { type: Type.ARRAY, items: { type: Type.STRING } },
      encouragementNote: { type: Type.STRING },
    },
  };

  const prompt = `Write an encouraging, grounded weekly learning report for a ${input.skillLevel} developer studying ${input.field}.
Topics studied: ${input.topicsStudied.join(', ') || 'Getting started'}
Code submissions this week: ${input.submissionsCount}
Quiz performance: ${input.quizSummary || 'No quizzes taken yet'}
Projects completed: ${input.projectsCompleted}
Areas flagged as tricky: ${input.struggles.join(', ') || 'None flagged'}
Member's weekly notes: ${input.checkInNotes || 'No extra notes'}

Use warm, plain, non-judgmental language.`;

  return runJsonOperation<{
    whatYouLearned: string;
    whatYouBuilt: string;
    understoodWell: string[];
    areasToRevisit: string[];
    strongestAreas: string[];
    nextGoals: string[];
    encouragementNote: string;
  }>(
    userId,
    'weeklyProgressSummary',
    prompt,
    'You write clear, encouraging weekly learning reflections focused on real practice and steady growth.',
    schema
  );
}
