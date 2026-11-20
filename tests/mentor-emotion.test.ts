// Emotional-intelligence behaviour of the AI mentor. The classifier and prompt are tested directly;
// the Groq wire is a fake (tests/fakeGroq.ts), so no key and no network are needed.
// These tests check that the right guidance reaches the model and that safety replies bypass it.
// They do NOT check the tone of real model output, which needs a live Groq key and a human reader.
import test from 'node:test';
import assert from 'node:assert/strict';
import { __setSleepForTests } from '../server/groqClient.ts';
import { installFakeGroq, completion } from './fakeGroq.ts';
import * as ai from '../server/aiService.ts';
import { assessEmotionalContext, crisisReply, isSensitiveForTitle, offlineSupportFallback, mentionsSelfHarm } from '../src/lib/mentorEmotion.ts';

const ctx = { field: 'Web', skillLevel: 'Beginner', roadmapTitle: 'R', activeCourse: '', currentTopic: 'Loops', weakTopics: ['Loops'], recentSubmissions: [], activeProject: '' };
const lvl = (m: string, h: { sender: string; text: string }[] = []) => assessEmotionalContext(m, h).level;

test('ordinary technical questions are technical-only (no emotional reassurance wanted)', () => {
  for (const m of ['How do I reverse an array in JavaScript?', 'What is the difference between let and const?', 'Why does `kill -9` stop a process?', 'TypeError: cannot read properties of undefined (reading map)']) {
    const a = assessEmotionalContext(m);
    assert.equal(a.level, 'neutral', m);
    assert.equal(a.technicalOnly, true, m);
  }
});

test('code that contains scary words is not treated as distress', () => {
  const m = 'Why does this crash?\n```js\nprocess.kill(pid)\nif (user.wantsToDie) { killMyself() }\n// I give up\n```';
  assert.equal(lvl(m), 'neutral');
  assert.equal(mentionsSelfHarm(m), false);
  assert.equal(lvl('this bug is killing me, nothing works'), 'struggling'); // idiom, not a self-harm statement
});

test('everyday idioms are not mistaken for giving up or self-harm', () => {
  assert.equal(lvl("I'm going to quit my job and learn full time"), 'neutral');
  assert.equal(lvl('I give up on this approach, let me try recursion'), 'neutral');
  assert.equal(lvl('I want to die laughing, this meme is great'), 'neutral');
  assert.equal(lvl('can you kill the dev server process'), 'neutral');
});

test('plain confusion is "confused", not an emotional emergency', () => {
  assert.equal(lvl("I don't understand how closures work"), 'confused');
});

test('frustration, overwhelm, self-doubt, disappointment, low motivation are recognised', () => {
  const cases: [string, string][] = [
    ["ugh this is so frustrating, it's still not working", 'frustration'],
    ["there's too much to learn and I don't know where to start", 'overwhelm'],
    ["I'm so stupid, everyone else is faster than me", 'self_doubt'],
    ['I failed the quiz and I feel so disappointed', 'disappointment'],
    ["I have no motivation to code anymore", 'low_motivation'],
  ];
  for (const [m, signal] of cases) {
    const a = assessEmotionalContext(m);
    assert.equal(a.level, 'struggling', m);
    assert.ok(a.signals.includes(signal as any), `${m} -> ${a.signals}`);
  }
});

test('wanting to quit learning is "giving_up" and is not a crisis', () => {
  for (const m of ["I'm going to give up coding", 'maybe programming is just not for me', "what's the point of learning this"]) {
    assert.equal(lvl(m), 'giving_up', m);
  }
});

test('repeated difficulty and "explanation did not land" are detected from the chat', () => {
  const history = [
    { sender: 'user', text: 'why is my loop printing undefined' },
    { sender: 'mentor', text: 'Check the index.' },
    { sender: 'user', text: "I still don't get it" },
    { sender: 'mentor', text: 'Think of the index as a position.' },
  ];
  const a = assessEmotionalContext("that didn't help, same error again", history);
  assert.equal(a.explanationNotLanding, true);
  assert.equal(a.repeatedDifficulty, true);
  assert.equal(assessEmotionalContext('How do I loop over an object?').repeatedDifficulty, false);
});

test('serious distress that is not about code is "distress"', () => {
  assert.equal(lvl('I feel hopeless and worthless'), 'distress');
  assert.equal(lvl('I feel like a burden to everyone'), 'distress');
});

test('self-harm statements are crisis; plans or "now" are immediate danger', () => {
  assert.equal(lvl('I want to die'), 'crisis');
  assert.equal(lvl("I've been thinking about killing myself"), 'crisis');
  assert.equal(lvl("everyone would be better off without me"), 'crisis');
  assert.equal(lvl("I'm going to kill myself tonight"), 'crisis_immediate');
  assert.equal(lvl("I have a plan to end my life"), 'crisis_immediate');
  assert.equal(lvl("I'm not safe right now"), 'crisis_immediate');
});

test('a follow-up after a self-harm statement stays in care mode', () => {
  const a = assessEmotionalContext('okay', [{ sender: 'user', text: 'I want to die' }, { sender: 'mentor', text: 'x' }]);
  assert.equal(a.recentSafetyConcern, true);
  assert.equal(a.technicalOnly, false);
});

test('crisis replies: caring, ask about safety, point to people and emergency help, no diagnosis, no lesson', () => {
  for (const l of ['crisis', 'crisis_immediate'] as const) {
    const r = crisisReply(l);
    assert.match(r, /emergency number/i);
    assert.match(r, /trust|someone/i);
    assert.match(r, /not a counsellor|can't diagnose/i);
    assert.match(r, /findahelpline\.com/);
    assert.doesNotMatch(r, /\b(array|loop|function|variable|exercise|lesson:)\b/i);
  }
  assert.match(crisisReply('crisis'), /safe right now/i);
  assert.match(crisisReply('crisis_immediate'), /call your local emergency number now/i);
});

test('sensitive first messages do not become a visible chat title', () => {
  assert.equal(isSensitiveForTitle('I want to die'), true);
  assert.equal(isSensitiveForTitle('I feel hopeless'), true);
  assert.equal(isSensitiveForTitle('Explain loops'), false);
  assert.equal(isSensitiveForTitle('Why does my useEffect run twice?'), false);
});

test('offline fallback is supportive for feelings and silent for technical questions', () => {
  assert.match(offlineSupportFallback('I want to die', 'Loops') || '', /emergency number/i);
  assert.match(offlineSupportFallback("I'm going to give up", 'Loops') || '', /step away/i);
  assert.equal(offlineSupportFallback('How do I use map()?', 'Loops'), null);
});

// ---- End to end through aiService with a fake Groq ---------------------------------------------

function setup() {
  process.env.GROQ_API_KEY = 'test-key-not-real';
  process.env.GROQ_TIMEOUT_MS = '1000';
  process.env.GROQ_MAX_RPM = '0';
  __setSleepForTests(async () => {});
  const seen = { chat: [] as any[], stream: [] as any[] };
  installFakeGroq(() => ({ chat: async () => completion('ok'), stream: async () => (async function* () { yield { text: 'ok' }; })() }), seen);
  ai.updateAiSettings({ enabled: true, dailyLimitPerUser: 500, model: 'openai/gpt-oss-120b' });
  return seen;
}
const systemOf = (req: any) => String(req.messages.find((m: any) => m.role === 'system')?.content || '');
let n = 0;
const uid = () => `emo-${++n}`;

test('system prompt always carries the emotional-intelligence rules', async () => {
  const seen = setup();
  await ai.mentorChatReply(uid(), { message: 'Explain loops', history: [], context: ctx as any });
  const s = systemOf(seen.chat[0]);
  assert.match(s, /EMOTIONAL INTELLIGENCE/);
  assert.match(s, /SERIOUS DISTRESS AND SAFETY/);
});

test('technical question: model is told not to add reassurance', async () => {
  const seen = setup();
  await ai.mentorChatReply(uid(), { message: 'How do I reverse an array in JavaScript?', history: [], context: ctx as any });
  assert.match(systemOf(seen.chat[0]), /plain technical question with no emotional content/);
  assert.doesNotMatch(systemOf(seen.chat[0]), /EMOTIONAL CONTEXT FOR THIS REPLY[\s\S]*learner is showing/);
});

test('frustrated learner: short reply, acknowledge first, one small step, choice to talk or break', async () => {
  const seen = setup();
  await ai.mentorChatReply(uid(), { message: "I'm so frustrated, nothing works", history: [], context: ctx as any });
  const s = systemOf(seen.chat[0]);
  assert.match(s, /showing frustration/);
  assert.match(s, /acknowledge how they feel/);
  assert.match(s, /talk about it, take a break, or try it a different way/);
  assert.match(s, /already on their list of areas to review/); // learning context: Loops is a weak topic
});

test('overwhelmed learner is told to shrink the problem to one tiny step', async () => {
  const seen = setup();
  await ai.mentorChatReply(uid(), { message: "it's too much, I don't know where to start", history: [], context: ctx as any });
  assert.match(systemOf(seen.chat[0]), /ONE tiny step/);
});

test('learner who wants to quit: no lesson, no speech, offers talk / break / smaller step', async () => {
  const seen = setup();
  await ai.mentorChatReply(uid(), { message: "I think I'll just quit", history: [], context: ctx as any });
  const s = systemOf(seen.chat[0]);
  assert.match(s, /thinking about quitting/);
  assert.match(s, /No lesson content/);
});

test('repeated difficulty and a failed explanation change the instructions', async () => {
  const seen = setup();
  const history = [{ sender: 'user', text: "I don't understand closures" }, { sender: 'mentor', text: 'A closure is...' }, { sender: 'user', text: "still don't get it" }];
  await ai.mentorChatReply(uid(), { message: "that didn't help, I still don't understand", history, context: ctx as any });
  const s = systemOf(seen.chat[0]);
  assert.match(s, /DID NOT LAND/);
  assert.match(s, /REPEATED DIFFICULTY/);
});

test('serious distress: lesson set aside, asks about safety', async () => {
  const seen = setup();
  await ai.mentorChatReply(uid(), { message: 'I feel hopeless and worthless lately', history: [], context: ctx as any });
  const s = systemOf(seen.chat[0]);
  assert.match(s, /Set the lesson aside/);
  assert.match(s, /whether they are safe right now/);
});

test('self-harm and immediate danger get the fixed safety reply, with NO Groq call and no daily-limit use (normal and streaming)', async () => {
  const seen = setup();
  ai.updateAiSettings({ dailyLimitPerUser: 5 });
  const user = uid();
  for (let i = 0; i < 8; i++) {
    const r = await ai.mentorChatReply(user, { message: "I'm going to kill myself tonight", history: [], context: ctx as any });
    assert.equal(r.model, ai.SAFETY_REPLY_MODEL);
    assert.match(r.text, /emergency number/i);
  }
  const events: any[] = [];
  for await (const ev of ai.streamMentorReply(user, { message: 'I want to die', history: [], context: ctx as any })) events.push(ev);
  assert.equal(events.at(-1).type, 'done');
  assert.equal(events.at(-1).model, ai.SAFETY_REPLY_MODEL);
  assert.equal(seen.chat.length + seen.stream.length, 0);
  // the member can still use the mentor normally afterwards (limit was not consumed)
  const ok = await ai.mentorChatReply(user, { message: 'Explain loops', history: [], context: ctx as any });
  assert.equal(ok.text, 'ok');
  ai.updateAiSettings({ dailyLimitPerUser: 500 });
});

test('follow-up after a self-harm message keeps the model in care mode', async () => {
  const seen = setup();
  const history = [{ sender: 'user', text: 'I want to die' }, { sender: 'mentor', text: 'careful reply' }];
  await ai.mentorChatReply(uid(), { message: "I'm okay, I just needed to say it", history, context: ctx as any });
  assert.match(systemOf(seen.chat[0]), /Set the lesson aside/);
});

test('privacy: emotional text is not copied into server logs', async () => {
  setup();
  const logged: string[] = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  console.log = console.error = console.warn = (...a: any[]) => { logged.push(a.join(' ')); };
  try {
    await ai.mentorChatReply(uid(), { message: 'I feel hopeless and worthless', history: [], context: ctx as any });
    for await (const _ of ai.streamMentorReply(uid(), { message: 'I want to die', history: [], context: ctx as any })) { /* drain */ }
  } finally { Object.assign(console, orig); }
  assert.equal(logged.some((l) => /hopeless|worthless|want to die/i.test(l)), false);
});
