// End-to-end over a real HTTP socket: browser client -> SSE route handler -> aiService -> (fake) Gemini.
// Express itself is not involved: a tiny shim supplies res.status()/res.json() for the handler.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { __setClientFactoryForTests, __setSleepForTests } from '../server/geminiClient.ts';
import * as ai from '../server/aiService.ts';
import { createMentorStreamHandler } from '../server/mentorStream.ts';
import { requestMentorChatStream } from '../src/lib/aiClient.ts';

const ctx = { field: 'Web', skillLevel: 'Beginner', roadmapTitle: 'R', activeCourse: '', currentTopic: '', weakTopics: [], recentSubmissions: [], activeProject: '' };
const input = { message: 'Explain loops', history: [], context: ctx };

function startServer(userId = 'e2e-user') {
  const handler = createMentorStreamHandler(() => userId);
  const server = http.createServer(async (req, res: any) => {
    res.status = (c: number) => { res.statusCode = c; return res; };
    res.json = (o: unknown) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
    let body = '';
    for await (const c of req) body += c;
    (req as any).body = body ? JSON.parse(body) : {};
    await handler(req as any, res);
  });
  return new Promise<{ base: string; close: () => Promise<void> }>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }) }))
  );
}

function setup(streamImpl: (req: any, n: number) => Promise<AsyncIterable<any>>) {
  process.env.GEMINI_API_KEY = 'test-key-not-real';
  process.env.GEMINI_TIMEOUT_MS = '1000';
  process.env.GEMINI_MAX_RPM = '0';
  __setSleepForTests(async () => {});
  const seen: any[] = [];
  __setClientFactoryForTests(() => ({ models: { generateContentStream: async (r: any) => { seen.push(r); return streamImpl(r, seen.length); } } }));
  ai.updateAiSettings({ enabled: true, dailyLimitPerUser: 500, model: 'gemini-3.8-flash' });
  return seen;
}
function pointFetchAt(base: string) {
  const real = globalThis.fetch;
  globalThis.fetch = ((u: any, init: any) => real(String(u).startsWith('/') ? base + u : u, init)) as any;
  return () => { globalThis.fetch = real; };
}

test('browser client receives streamed tokens in order and the complete reply', async () => {
  const seen = setup(async () => (async function* () { yield { text: 'Loops ' }; await new Promise((r) => setTimeout(r, 20)); yield { text: 'repeat ' }; yield { text: 'work.' }; })());
  const srv = await startServer();
  const restore = pointFetchAt(srv.base);
  try {
    const tokens: string[] = [];
    const res = await requestMentorChatStream(input as any, 'e2e-user', (t) => tokens.push(t));
    assert.deepEqual(tokens, ['Loops ', 'repeat ', 'work.']);
    assert.equal(res.text, 'Loops repeat work.');
    assert.equal(res.model, 'gemini-3.8-flash');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].model, 'gemini-3.8-flash');
  } finally { restore(); await srv.close(); }
});

test('a mid-stream provider failure arrives as an error event the client throws', async () => {
  setup(async () => (async function* () { yield { text: 'partial' }; throw new Error('fetch failed'); })());
  const srv = await startServer();
  const restore = pointFetchAt(srv.base);
  try {
    const tokens: string[] = [];
    await assert.rejects(requestMentorChatStream(input as any, 'e2e-user', (t) => tokens.push(t)), /temporarily unavailable/);
    assert.deepEqual(tokens, ['partial']);
  } finally { restore(); await srv.close(); }
});

test('errors before any text (daily limit) come back as HTTP 429 JSON, not a broken stream', async () => {
  setup(async () => (async function* () { yield { text: 'x' }; })());
  ai.updateAiSettings({ dailyLimitPerUser: 5 });
  const srv = await startServer('limit-user');
  const restore = pointFetchAt(srv.base);
  try {
    for (let i = 0; i < 5; i++) await requestMentorChatStream(input as any, 'limit-user', () => {});
    const raw = await fetch('/api/ai/mentor/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    assert.equal(raw.status, 429);
    assert.match((await raw.json()).error, /Daily AI limit/);
    await assert.rejects(requestMentorChatStream(input as any, 'limit-user', () => {}), /Daily AI limit/);
  } finally { restore(); await srv.close(); ai.updateAiSettings({ dailyLimitPerUser: 500 }); }
});

test('closing the connection mid-answer aborts the Gemini request', async () => {
  let aborted = false;
  setup(async (req) => (async function* () {
    yield { text: 'start ' };
    await new Promise<void>((resolve) => { req.config.abortSignal.addEventListener('abort', () => { aborted = true; resolve(); }); setTimeout(resolve, 3000); });
  })());
  const srv = await startServer();
  const restore = pointFetchAt(srv.base);
  try {
    const ctl = new AbortController();
    const p = requestMentorChatStream(input as any, 'e2e-user', () => ctl.abort(), ctl.signal);
    await assert.rejects(p);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(aborted, true);
  } finally { restore(); await srv.close(); }
});
