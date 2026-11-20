// Run with: npm test
// These tests inject a fake Groq HTTP layer, so they need no API key and make no network calls.
// They verify Dev Hub's own behaviour (retries, timeouts, validation, streaming, limits, response shapes).
// They do NOT prove the live Groq API accepts the requests; see LAUNCH.md for the live smoke test.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  __setSleepForTests,
  __resetPacerForTests,
  classifyError,
  conformToSchema,
  describeSchema,
  generateJson,
  generateText,
  streamText,
} from '../server/groqClient.ts';
import * as ai from '../server/aiService.ts';
import { apiError, completion as reply, installFakeGroq, rawStreamResponse, type FakeHandlers } from './fakeGroq.ts';

const MAIN = 'llama-3.3-70b-versatile';
const FALLBACK = 'llama-3.1-8b-instant';

let calls: any[] = [];
let streamCalls: any[] = [];
let handler: FakeHandlers['chat'] = () => reply('ok');
let streamHandler: FakeHandlers['stream'] = async () => (async function* () {})();

beforeEach(() => {
  calls = [];
  streamCalls = [];
  handler = () => reply('ok');
  process.env.GROQ_API_KEY = 'test-key-not-real';
  process.env.GROQ_MAX_RETRIES = '2';
  process.env.GROQ_TIMEOUT_MS = '1000';
  process.env.GROQ_MAX_RPM = '0';
  delete process.env.GROQ_FALLBACK_MODEL;
  delete process.env.GROQ_MODEL;
  delete process.env.GROQ_MAX_OUTPUT_TOKENS;
  __resetPacerForTests();
  __setSleepForTests(async () => {});
  installFakeGroq(() => ({ chat: handler, stream: streamHandler }), { get chat() { return calls; }, get stream() { return streamCalls; } } as any);
  ai.updateAiSettings({ enabled: true, dailyLimitPerUser: 500, model: MAIN });
});

// ---------------------------------------------------------------- error classification
test('classifyError maps provider failures to friendly codes', () => {
  assert.equal(classifyError(apiError(429, 'Rate limit reached for model x. Please try again in 3.5s.')).code, 'rate_limit');
  assert.equal(classifyError(apiError(429, 'Rate limit reached. Please try again in 3.5s.')).retryAfterMs, 3500);
  assert.equal(classifyError(apiError(429, 'Rate limit reached. Please try again in 7m12.5s.')).retryAfterMs, 432_500);
  assert.equal(classifyError(apiError(429, 'Rate limit reached. Please try again in 340ms.')).retryAfterMs, 340);
  assert.equal((classifyError(apiError(429, 'Rate limit reached on tokens per day (TPD): Limit 100000')) as any).daily, true);
  assert.equal((classifyError(apiError(429, 'Rate limit reached on tokens per minute (TPM): Limit 12000')) as any).daily, false);
  assert.equal(classifyError(apiError(401, 'Invalid API Key')).code, 'auth');
  assert.equal(classifyError(apiError(403, 'forbidden')).code, 'auth');
  assert.equal(classifyError(apiError(404, 'The model `x` does not exist')).code, 'model_unavailable');
  assert.equal(classifyError(apiError(400, 'The model `x` has been decommissioned')).code, 'model_unavailable');
  assert.equal(classifyError(apiError(503, 'overloaded')).code, 'unavailable');
  assert.equal(classifyError(new Error('fetch failed')).code, 'unavailable');
  assert.equal(classifyError(apiError(400, 'bad')).code, 'bad_request');
  assert.equal(classifyError(apiError(413, 'Request too large')).code, 'bad_request');
  assert.equal(classifyError(apiError(429, 'x')).message.includes('API key'), false, 'no secrets/internal detail in user messages');
});

test('the Retry-After header from Groq is honoured', async () => {
  process.env.GROQ_MAX_RETRIES = '0';
  process.env.GROQ_FALLBACK_MODEL = 'off';
  handler = () => {
    throw apiError(429, 'busy', { 'retry-after': '12' });
  };
  await assert.rejects(generateText({ model: 'm', systemInstruction: '', prompt: 'p' }), (e: any) => e.code === 'rate_limit' && e.retryAfterMs === 12_000);
});

// ---------------------------------------------------------------- text
test('generateText sends model, system message, capped max_tokens and the key; returns no sources', async () => {
  handler = () => reply('Answer');
  const r = await generateText({ model: MAIN, systemInstruction: 'SYS', prompt: 'hi', useSearch: true, maxOutputTokens: 99999 });
  assert.equal(r.text, 'Answer');
  assert.equal(r.totalTokens, 42);
  assert.deepEqual(r.sources, []);
  assert.equal(calls[0].model, MAIN);
  assert.deepEqual(calls[0].messages, [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'hi' }]);
  assert.equal(calls[0].max_tokens, 6000, 'request size is capped to protect free-tier token limits');
  assert.equal(calls[0].authorization, 'Bearer test-key-not-real');
});

test('transient failures are retried up to the limit, then surfaced', async () => {
  handler = (_r, n) => {
    if (n < 3) throw apiError(503, 'overloaded');
    return reply('recovered');
  };
  assert.equal((await generateText({ model: 'm', systemInstruction: '', prompt: 'p' })).text, 'recovered');
  assert.equal(calls.length, 3);

  calls = [];
  process.env.GROQ_FALLBACK_MODEL = 'off';
  handler = () => {
    throw apiError(429, 'Rate limit reached. Please try again in 1s.');
  };
  await assert.rejects(generateText({ model: 'm', systemInstruction: '', prompt: 'p' }), (e: any) => e.code === 'rate_limit');
  assert.equal(calls.length, 3, '1 try + 2 retries, no more');
});

test('auth and bad-model errors are NOT retried', async () => {
  handler = () => {
    throw apiError(401, 'Invalid API Key');
  };
  await assert.rejects(generateText({ model: 'm', systemInstruction: '', prompt: 'p' }), (e: any) => e.code === 'auth');
  assert.equal(calls.length, 1);
});

test('a hung request times out and is retried within the budget', async () => {
  process.env.GROQ_TIMEOUT_MS = '1000';
  process.env.GROQ_MAX_RETRIES = '1';
  handler = () => new Promise(() => {});
  const t0 = Date.now();
  await assert.rejects(generateText({ model: 'm', systemInstruction: '', prompt: 'p' }), (e: any) => e.code === 'timeout');
  assert.equal(calls.length, 2);
  assert.ok(Date.now() - t0 < 4000);
});

test('blocked content is not retried; empty answers are', async () => {
  handler = () => reply('', { finish_reason: 'content_filter' });
  await assert.rejects(generateText({ model: 'm', systemInstruction: '', prompt: 'p' }), (e: any) => e.code === 'blocked');
  assert.equal(calls.length, 1);
  calls = [];
  handler = (_r, n) => (n === 1 ? reply('') : reply('second try'));
  assert.equal((await generateText({ model: 'm', systemInstruction: '', prompt: 'p' })).text, 'second try');
});

test('reasoning tags are stripped from answers', async () => {
  handler = () => reply('<think>internal notes</think>Here is the answer.');
  assert.equal((await generateText({ model: 'm', systemInstruction: '', prompt: 'p' })).text, 'Here is the answer.');
});

// ---------------------------------------------------------------- JSON
const schema = { type: 'object', properties: { title: { type: 'string' }, items: { type: 'array', items: { type: 'string' } }, minutes: { type: 'integer' }, ok: { type: 'boolean' } } };

test('generateJson uses JSON mode, tells the model the shape, and conforms the result', async () => {
  handler = () => reply('```json\n{"title":"T","items":["a","","b"],"minutes":"25"}\n```');
  const r = await generateJson<any>({ model: 'm', systemInstruction: 'S', prompt: 'p', schema });
  assert.equal(calls[0].response_format.type, 'json_object');
  const system = calls[0].messages[0].content as string;
  assert.ok(system.startsWith('S'));
  assert.match(system, /JSON/);
  for (const key of ['title', 'items', 'minutes', 'ok']) assert.ok(system.includes(`"${key}"`), `shape mentions ${key}`);
  assert.deepEqual(r.data, { title: 'T', items: ['a', 'b'], minutes: 25, ok: false });
  assert.ok(describeSchema(schema).includes('"minutes": "integer"'));
});

test('malformed JSON gets exactly one more attempt, even with a larger retry budget', async () => {
  process.env.GROQ_MAX_RETRIES = '4';
  handler = () => reply('this is not json at all');
  await assert.rejects(generateJson({ model: 'm', systemInstruction: '', prompt: 'p', schema }), (e: any) => e.code === 'malformed');
  assert.equal(calls.length, 2);

  calls = [];
  handler = (_r, n) => (n === 1 ? reply('{"title": ') : reply('{"title":"fixed"}'));
  const r = await generateJson<any>({ model: 'm', systemInstruction: '', prompt: 'p', schema });
  assert.equal(r.data.title, 'fixed');
});

test("Groq's json_validate_failed (400) is treated as malformed output and retried once", async () => {
  handler = (_r, n) => {
    if (n === 1) throw apiError(400, 'Failed to generate JSON. Please adjust your prompt. json_validate_failed');
    return reply('{"title":"second"}');
  };
  const r = await generateJson<any>({ model: 'm', systemInstruction: '', prompt: 'p', schema });
  assert.equal(r.data.title, 'second');
  assert.equal(calls.length, 2);
});

test('wrong-typed fields are rejected, a failing validator triggers a retry', async () => {
  assert.throws(() => conformToSchema({ title: { nested: 1 } }, schema), (e: any) => e.code === 'malformed');
  assert.throws(() => conformToSchema([1, 2], schema), (e: any) => e.code === 'malformed');
  handler = (_r, n) => (n === 1 ? reply('{"title":""}') : reply('{"title":"Real"}'));
  const r = await generateJson<any>({
    model: 'm', systemInstruction: '', prompt: 'p', schema,
    validate: (d) => { if (!d.title) throw new Error('no title'); return d; },
  });
  assert.equal(r.data.title, 'Real');
  assert.equal(calls.length, 2);
});

// ---------------------------------------------------------------- streaming
async function collect(gen: AsyncGenerator<any>) {
  const out: any[] = [];
  for await (const e of gen) out.push(e);
  return out;
}
const chunks = (...texts: string[]) => async () => (async function* () { for (const t of texts) yield { text: t }; })();

test('streamText yields tokens in order, then a done event with the full text', async () => {
  streamHandler = chunks('Hel', 'lo ', 'world');
  const ev = await collect(streamText({ model: 'm', systemInstruction: 'S', prompt: 'p' }));
  assert.deepEqual(ev.filter((e) => e.type === 'token').map((e) => e.text), ['Hel', 'lo ', 'world']);
  const done = ev.at(-1);
  assert.equal(done.type, 'done');
  assert.equal(done.text, 'Hello world');
  assert.equal(done.totalTokens, 7);
  assert.equal(streamCalls[0].stream, true);
});

test('streamText reassembles SSE lines that arrive split across network chunks', async () => {
  const line = (t: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`;
  const whole = line('Hello ') + line('there') + 'data: [DONE]\n\n';
  const cut = Math.floor(whole.length / 3);
  streamHandler = async () => ({ __raw: true, response: rawStreamResponse([whole.slice(0, cut), whole.slice(cut, cut * 2 + 5), whole.slice(cut * 2 + 5)]) }) as any;
  const ev = await collect(streamText({ model: 'm', systemInstruction: '', prompt: 'p' }));
  assert.equal(ev.at(-1).text, 'Hello there');
});

test('streamText retries a failure before the first token, but not after text has started', async () => {
  streamHandler = async (_r, n) => {
    if (n === 1) throw apiError(503, 'overloaded');
    return (async function* () { yield { text: 'ok' }; })();
  };
  const ev = await collect(streamText({ model: 'm', systemInstruction: '', prompt: 'p' }));
  assert.equal(ev.at(-1).text, 'ok');
  assert.equal(streamCalls.length, 2);

  streamCalls = [];
  streamHandler = async () => (async function* () { yield { text: 'partial' }; throw apiError(503, 'dropped'); })();
  await assert.rejects(collect(streamText({ model: 'm', systemInstruction: '', prompt: 'p' })), (e: any) => e.code === 'unavailable');
  assert.equal(streamCalls.length, 1, 'no replay once text was shown');
});

test('streamText stops when the caller aborts', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(collect(streamText({ model: 'm', systemInstruction: '', prompt: 'p', signal: controller.signal })), (e: any) => e.code === 'aborted');
  assert.equal(streamCalls.length, 0);
});

// ---------------------------------------------------------------- feature layer (aiService)
const roadmapJson = { title: 'Web Dev', summary: 's', stages: [{ stageName: 'Basics', description: 'd', topics: [{ name: 'HTML', whyItMatters: 'w' }] }] };
const roadmapInput = { field: 'Web', skillLevel: 'Beginner', knownSkills: '', goal: 'job', studyTime: '1h' };

test('every AI feature runs on Groq and returns its original response shape', async () => {
  const U = 'user-shapes';
  const json = (o: any) => () => reply(JSON.stringify(o));

  handler = json(roadmapJson);
  let r: any = await ai.generateAiRoadmap(U, roadmapInput);
  assert.deepEqual(Object.keys(r).sort(), ['data', 'latencyMs', 'model']);
  assert.equal(r.model, MAIN);
  assert.equal(r.data.stages[0].topics[0].name, 'HTML');

  handler = json({ planSummary: 'p', dailyTargets: [{ dayLabel: 'Day 1', topic: 'HTML', objective: 'o', estimatedMinutes: 30, whatYouWillUnderstand: 'w' }], coveredRoadmapTopics: [], missingRoadmapTopics: [], advice: 'a' });
  r = await ai.generateLearningPlan(U, { courseTitle: 'C', platform: 'YouTube', field: 'Web', currentLesson: 'L1', description: 'd', modules: ['m'], roadmapTitle: 'R', roadmapTopics: ['HTML'], skillLevel: 'Beginner', studyTime: '1h' });
  assert.equal(r.data.dailyTargets.length, 1);

  handler = json({ title: 'Ex', instructions: 'Do it', requirements: ['r'], expectedConcepts: ['c'], starterHint: 'h', estimatedMinutes: 20, isTheoryOnly: false });
  r = await ai.generateDailyExercise(U, { field: 'Web', language: 'JS', skillLevel: 'Beginner', courseTitle: 'C', topic: 'loops', objective: 'o' });
  assert.equal(r.data.title, 'Ex');

  handler = json({ whatYouDidWell: 'good', whatNeedsImprovement: 'n', understandingChecks: ['q'], suggestions: ['s'], nextStep: 'x', recommendedStatus: 'practised', analysisTypeLabel: 'Static' });
  r = await ai.reviewCodeSubmission(U, { language: 'JS', skillLevel: 'Beginner', courseTitle: 'C', topic: 't', objective: 'o', requirements: [], expectedConcepts: [], previousFeedback: '', code: 'let a=1', explanation: '', sandboxExecutionOutput: '', sandboxExecuted: false });
  assert.equal(r.data.recommendedStatus, 'Practised', 'status normalised to the exact value the UI expects');

  handler = json({ title: 'Quiz', questions: [
    { type: 'mcq', topic: 'JS', prompt: 'What does const do in JavaScript?', code: '', options: ['Declares a constant binding', 'Declares a var', 'Imports a module', 'Loops'], answer: 'Declares a constant binding', explanation: 'e', incorrectExplanation: 'i', distractorReasons: [] },
    { type: 'true_false', topic: 'JS', prompt: 'JavaScript arrays are zero-indexed.', code: '', options: ['True', 'False'], answer: 'True', explanation: 'e', incorrectExplanation: 'i', distractorReasons: [] },
  ] });
  r = await ai.generateAiQuiz(U, { topic: 'JS', courseTitle: 'C', field: 'Web', difficulty: 'Beginner', quizScope: 'Topic', existingQuestionPrompts: [] });
  assert.equal(r.data.questions.length, 2);
  assert.equal(r.model, MAIN);

  handler = json({ isCorrect: true, feedback: 'Nice', misconception: '' });
  r = await ai.evaluateShortAnswer(U, { questionPrompt: 'q', expectedAnswer: 'a', userAnswer: 'a', topic: 't', skillLevel: 'Beginner' });
  assert.equal(r.data.isCorrect, true);

  handler = json({ title: 'P', shortDescription: 's', whatItShouldDo: 'w', requirements: ['r1'], conceptsToUse: [], optionalHints: [], milestones: [], submissionInstructions: '', projectLevel: 'Beginner' });
  r = await ai.generateWeeklyProject(U, { field: 'Web', language: 'JS', skillLevel: 'Beginner', topicsCovered: [], weakTopics: [], recentSubmissionSummary: '', projectTier: 'Mini' });
  assert.equal(r.data.title, 'P');

  handler = json({ summary: 'Good', requirementsMet: [], improvements: [], understandingQuestion: 'q', nextStep: 'n' });
  r = await ai.reviewProjectSubmission(U, { projectTitle: 'P', requirements: [], conceptsToUse: [], skillLevel: 'Beginner', repoUrl: '', demoUrl: '', explanation: 'e', codeSnippet: '' });
  assert.equal(r.data.summary, 'Good');

  handler = json({ whatYouLearned: 'w', whatYouBuilt: 'b', understoodWell: [], areasToRevisit: [], strongestAreas: [], nextGoals: [], encouragementNote: 'e' });
  r = await ai.generateWeeklySummary(U, { field: 'Web', skillLevel: 'Beginner', topicsStudied: [], submissionsCount: 1, quizSummary: '', projectsCompleted: 0, struggles: [], checkInNotes: '' });
  assert.equal(r.data.whatYouLearned, 'w');

  handler = json({ summary: 'Explains loops', keyConcepts: ['a'], practicePrompt: 'p' });
  r = await ai.explainMaterialExcerpt(U, { fileName: 'notes.md', excerpt: 'A for loop repeats code many times.', skillLevel: 'Beginner', field: 'Web' });
  assert.equal(r.data.summary, 'Explains loops');

  handler = () => reply('Mentor says hi');
  r = await ai.mentorChatReply(U, { message: 'What is a loop?', history: [{ sender: 'user', text: 'hi' }], hintLevel: 2, context: { field: 'Web', skillLevel: 'Beginner', roadmapTitle: 'R', activeCourse: '', currentTopic: '', weakTopics: [], recentSubmissions: [], activeProject: '' } });
  assert.deepEqual(Object.keys(r).sort(), ['latencyMs', 'model', 'sources', 'text']);
  assert.deepEqual(r.sources, [], 'Groq answers carry no live web sources');

  handler = () => reply('Use the docs');
  r = await ai.searchDeveloperDocs(U, { query: 'fetch api', field: 'Web', skillLevel: 'Beginner' });
  assert.deepEqual(Object.keys(r).sort(), ['answer', 'latencyMs', 'model', 'query', 'sources']);
  const lookupPrompt = calls.at(-1).messages[0].content as string;
  assert.match(lookupPrompt, /no live web access/i, 'the model is not told it can browse');

  // every request above went to a Groq model with the server-side key
  assert.ok(calls.length >= 12);
  assert.ok(calls.every((c) => c.model === MAIN));
});

test('an answer missing required content is rejected, retried once, then shown as a friendly error (never saved)', async () => {
  handler = () => reply(JSON.stringify({ title: 'Empty', summary: '', stages: [] }));
  await assert.rejects(ai.generateAiRoadmap('user-bad', roadmapInput), (e: any) => /unexpected format/i.test(e.message) && ai.aiErrorStatus(e) === 500);
  assert.equal(calls.length, 2, 'one automatic retry only');
});

test('mentor streaming emits tokens then done, and counts as one request', async () => {
  streamHandler = chunks('Think ', 'about it.');
  const before = ai.getAiStatus().stats.totalCalls;
  const ev = await collect(ai.streamMentorReply('user-stream', { message: 'help', history: [], context: { field: 'Web', skillLevel: 'Beginner', roadmapTitle: 'R', activeCourse: '', currentTopic: '', weakTopics: [], recentSubmissions: [], activeProject: '' } }));
  assert.equal(ev.at(-1).type, 'done');
  assert.equal(ev.at(-1).text, 'Think about it.');
  assert.equal(ai.getAiStatus().stats.totalCalls, before + 1);
});

test('identical concurrent requests share one provider call and count once', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  handler = async () => {
    await gate;
    return reply(JSON.stringify(roadmapJson));
  };
  const before = ai.getAiStatus().stats.totalCalls;
  const a = ai.generateAiRoadmap('user-dedupe', roadmapInput);
  const b = ai.generateAiRoadmap('user-dedupe', roadmapInput);
  release();
  await Promise.all([a, b]);
  assert.equal(calls.length, 1);
  assert.equal(ai.getAiStatus().stats.totalCalls, before + 1);
});

test('daily limit, pause switch and missing key are enforced with the right HTTP status', async () => {
  ai.updateAiSettings({ dailyLimitPerUser: 5 });
  handler = () => reply('x');
  for (let i = 0; i < 5; i++) await ai.searchDeveloperDocs('user-limit', { query: `q${i}`, field: 'Web', skillLevel: 'Beginner' });
  await assert.rejects(ai.searchDeveloperDocs('user-limit', { query: 'q-extra', field: 'Web', skillLevel: 'Beginner' }), (e: any) => ai.aiErrorStatus(e) === 429 && /Daily AI limit/.test(e.message));

  ai.updateAiSettings({ enabled: false });
  await assert.rejects(ai.testAiConnection('admin'), (e: any) => /paused/.test(e.message));
  ai.updateAiSettings({ enabled: true });

  delete process.env.GROQ_API_KEY;
  assert.equal(ai.isAiConfigured(), false);
  await assert.rejects(ai.testAiConnection('admin'), (e: any) => /GROQ_API_KEY/.test(e.message));
});

test('provider rate-limit errors reach the route as HTTP 429 with a friendly message', async () => {
  process.env.GROQ_FALLBACK_MODEL = 'off';
  handler = () => {
    throw apiError(429, 'Rate limit reached for model x. Please try again in 1s.');
  };
  await assert.rejects(ai.testAiConnection('user-429'), (e: any) => ai.aiErrorStatus(e) === 429 && /busy or a rate limit/.test(e.message));
  // admin panel logged it, without leaking provider internals
  const errs = ai.getAiStatus().stats.errors;
  assert.ok(errs.length > 0 && !/Bearer|test-key-not-real/.test(errs[0].message));
});

test('admin status/settings are Groq-only', () => {
  const s = ai.getAiStatus();
  assert.equal(s.settings.provider, 'Groq');
  assert.ok(s.modelChoices.includes(MAIN) && s.modelChoices.includes(FALLBACK));
  assert.ok(!s.modelChoices.some((m: string) => m.startsWith('gemini-')));
  ai.updateAiSettings({ model: 'not a model!' });
  assert.equal(ai.getAiStatus().settings.model, MAIN, 'invalid model names are ignored');
  ai.updateAiSettings({ model: 'openai/gpt-oss-120b' });
  assert.equal(ai.getAiStatus().settings.model, 'openai/gpt-oss-120b');
});

test('the API key never appears in any status payload', () => {
  assert.equal(JSON.stringify(ai.getAiStatus()).includes('test-key-not-real'), false);
});

// ---------------------------------------------------------------- free-tier protection
test('429 on the main model: switches to the lighter fallback model and reports which model answered', async () => {
  handler = (req) => {
    if (req.model === MAIN) throw apiError(429, 'Rate limit reached for model `llama-3.3-70b-versatile` on tokens per minute (TPM). Please try again in 8s.');
    return reply('from fallback');
  };
  const r = await generateText({ model: MAIN, systemInstruction: '', prompt: 'p' });
  assert.equal(r.model, FALLBACK);
  assert.equal(calls.length, 2);
  handler = (req) => {
    if (req.model === MAIN) throw apiError(429, 'quota for this model');
    return reply('{"title":"T"}');
  };
  const j = await generateJson<any>({ model: MAIN, systemInstruction: '', prompt: 'p', schema });
  assert.equal(j.model, FALLBACK);
});

test('a daily-quota 429 is not hammered with retries when there is nothing to fall back to', async () => {
  process.env.GROQ_FALLBACK_MODEL = 'off';
  handler = () => {
    throw apiError(429, 'Rate limit reached for model x on tokens per day (TPD): Limit 100000, Used 99990. Please try again in 7m12s.');
  };
  await assert.rejects(generateText({ model: MAIN, systemInstruction: '', prompt: 'p' }), (e: any) => e.code === 'rate_limit');
  assert.equal(calls.length, 1);
});

test('request pacing keeps bursts under GROQ_MAX_RPM without calling Groq', async () => {
  process.env.GROQ_MAX_RPM = '2';
  __resetPacerForTests();
  await generateText({ model: 'm', systemInstruction: '', prompt: 'a' });
  await generateText({ model: 'm', systemInstruction: '', prompt: 'b' });
  await assert.rejects(generateText({ model: 'm', systemInstruction: '', prompt: 'c' }), (e: any) => e.code === 'rate_limit');
  assert.equal(calls.length, 2, 'the third request was held back locally');
});

test("admin error log shows the provider's reason; members see only the friendly message", async () => {
  process.env.GROQ_FALLBACK_MODEL = 'off';
  handler = () => {
    throw apiError(429, 'Rate limit reached: limit 5 per minute');
  };
  await assert.rejects(ai.testAiConnection('diag-user'), (e: any) => !/limit 5/.test(e.message));
  assert.match(ai.getAiStatus().stats.errors[0].message, /limit 5 per minute/);
});
