// ---------------------------------------------------------------------------
// Groq integration (OpenAI-compatible chat API). No SDK needed: plain fetch.
// Docs: https://console.groq.com/docs
// ---------------------------------------------------------------------------

// The schemas below describe the JSON each AI task must return. Values are plain JSON Schema types.
const Type = {
  OBJECT: 'object',
  ARRAY: 'array',
  STRING: 'string',
  NUMBER: 'number',
  INTEGER: 'integer',
  BOOLEAN: 'boolean',
} as const;

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Groq changes its model list often. Both of these can be overridden with environment variables
// (GROQ_MODEL) or from the Admin screen, so a retired model never needs a code change.
const DEFAULT_MODEL = (process.env.GROQ_MODEL || 'openai/gpt-oss-120b').trim();
export const MODEL_CHOICES: string[] = Array.from(new Set([DEFAULT_MODEL, 'openai/gpt-oss-120b', 'openai/gpt-oss-20b']));
const REASONING_EFFORT = (['low', 'medium', 'high'].includes(String(process.env.GROQ_REASONING_EFFORT))
  ? String(process.env.GROQ_REASONING_EFFORT)
  : 'low') as 'low' | 'medium' | 'high';

export type SupportedModel = string;

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface AiRuntimeSettings {
  provider: 'Groq';
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

const runtimeSettings: AiRuntimeSettings = {
  provider: 'Groq',
  model: DEFAULT_MODEL,
  dailyLimitPerUser: 40,
  enabled: true,
};

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

function resetDailyCountersIfNeeded() {
  const today = todayIso();
  if (usageStats.lastResetDate !== today) {
    usageStats.lastResetDate = today;
    usageStats.callsToday = 0;
    usageStats.perUserCallsToday = {};
  }
}

function getApiKey(): string | null {
  const key = process.env.GROQ_API_KEY?.trim().replace(/^['"]|['"]$/g, '');
  if (!key || key === 'MY_GROQ_API_KEY' || key.toLowerCase().includes('your-groq')) return null;
  return key;
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

function checkRateAndAvailability(userId: string, operation: string): { apiKey: string } {
  resetDailyCountersIfNeeded();
  if (!runtimeSettings.enabled) {
    throw new Error('AI features are currently paused by the community administrator.');
  }
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('The Groq API key is not set on the server yet. Add GROQ_API_KEY to the server environment variables.');
  }
  const userCalls = usageStats.perUserCallsToday[userId] || 0;
  if (userCalls >= runtimeSettings.dailyLimitPerUser) {
    throw new Error(`Daily AI limit (${runtimeSettings.dailyLimitPerUser} requests) reached for today. Try again tomorrow or ask an admin to raise the limit.`);
  }
  usageStats.perUserCallsToday[userId] = userCalls + 1;
  usageStats.totalCalls += 1;
  usageStats.callsToday += 1;
  usageStats.byOperation[operation] = (usageStats.byOperation[operation] || 0) + 1;
  return { apiKey };
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

// Some optional settings (reasoning effort, JSON mode, web search) are not accepted by every model.
// If Groq rejects the request as invalid, retry once without them so the feature still works.
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
    if (err.status === 401) return new Error('Groq rejected the API key. Check GROQ_API_KEY on the server.');
    if (err.status === 429) return new Error('Groq is busy or the rate limit was reached. Please wait a moment and try again.');
    if (err.status === 404 || /model.*(not found|does not exist|decommission|no longer)/i.test(err.message)) {
      return new Error(`The AI model "${runtimeSettings.model}" is not available on your Groq account. Ask an admin to pick another model.`);
    }
    return new Error(err.message || fallback);
  }
  const raw = String(err?.message || '').trim();
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
  const modelToUse = options?.forceModel || runtimeSettings.model;
  try {
    const { apiKey } = checkRateAndAvailability(userId, operation);
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
    const { apiKey } = checkRateAndAvailability(userId, operation);
    const jsonInstruction = `${systemInstruction}

Return ONLY one valid JSON object, with no markdown and no commentary, that follows this JSON Schema exactly. Fill every field:
${JSON.stringify(responseSchema)}`;
    const body: Record<string, unknown> = {
      model: runtimeSettings.model,
      messages: [
        { role: 'system', content: jsonInstruction },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      max_completion_tokens: 6000,
      response_format: { type: 'json_object' },
      ...modelOptions(runtimeSettings.model),
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
    return { data: parsed, model: runtimeSettings.model, latencyMs };
  } catch (err: any) {
    const cleanErr = formatAiError(err, 'Structured AI request failed');
    recordError(operation, cleanErr.message);
    throw cleanErr;
  }
}

export function getAiStatus() {
  resetDailyCountersIfNeeded();
  const hasKey = Boolean(getApiKey());
  return {
    configured: hasKey,
    settings: runtimeSettings,
    modelChoices: MODEL_CHOICES,
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
    runtimeSettings.model = patch.model.trim();
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

  return runJsonOperation<{
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
    };
  }
) {
  // Hint ladder: the learner chooses how much help they want. Less help is the default
  // path to independence; more help is always available, and is recorded for their score.
  const hintLevel = input.hintLevel === 1 || input.hintLevel === 3 ? input.hintLevel : 2;
  const hintRule =
    hintLevel === 1
      ? 'HELP LEVEL: NUDGE. Do NOT give the answer, the fix, or finished code. Reply in at most 3 short sentences: name the concept or doc section to look at and ask ONE guiding question that helps them find the next step themselves.'
      : hintLevel === 3
        ? 'HELP LEVEL: WALKTHROUGH. Explain the idea fully with a small worked example in plain language. Then finish with a similar practice task and ask them to try it on their own without your help. If they asked for a complete solution to their own graded exercise or project, explain the approach and the key pieces but let them write the final code.'
        : 'HELP LEVEL: HINT. Give a concrete hint: the approach, the right concept, or a short outline or pseudocode. Do NOT give the finished solution or a full copy-paste code block. End by asking them to try the next step and tell you what happened.';

  const levelGuide = /complete beginner|beginner/i.test(input.context.skillLevel)
    ? 'Use very simple, everyday English. Break concepts into small steps and give tiny clear examples. Avoid heavy jargon.'
    : /advanced/i.test(input.context.skillLevel)
      ? 'Encourage architectural reasoning, trade-offs, and independent research rather than hand-holding.'
      : 'Give helpful hints and guiding questions before direct answers so the learner builds problem-solving confidence.';

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

Teaching rule: ${levelGuide}
${hintRule}
Goal: Help the developer become independent rather than copy-paste dependent. When live web search is enabled, verify current documentation, APIs, and best practices without inventing links. Keep responses concise, warm, and well-structured.`;

  const recentTranscript = input.history
    .slice(-8)
    .map((m) => `${m.sender === 'user' ? 'Learner' : 'Mentor'}: ${m.text}`)
    .join('\n');

  const prompt = `${recentTranscript ? `Recent conversation:\n${recentTranscript}\n\n` : ''}Learner: ${input.message}`;
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
