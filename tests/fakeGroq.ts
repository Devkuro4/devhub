// Test helper: a fake Groq HTTP layer so tests need no API key and make no network calls.
import { __setFetchForTests } from '../server/groqClient.ts';

export function apiError(status: number, message: string, headers: Record<string, string> = {}) {
  const e: any = new Error(message);
  e.status = status;
  e.providerCode = status === 429 ? 'rate_limit_exceeded' : '';
  e.headers = headers;
  return e;
}

/** What Groq's chat completions endpoint returns for a normal answer. */
export const completion = (text: string, extra: any = {}) => ({
  choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop', ...extra }],
  usage: { total_tokens: 42 },
});

function errorResponse(e: any) {
  const status = Number(e?.status) || 503;
  // Network-level failures (no status) surface as thrown errors, like a real fetch failure.
  if (!e?.status) throw e;
  const headers = new Headers(e.headers || {});
  return {
    ok: false,
    status,
    headers,
    text: async () => JSON.stringify({ error: { message: e.message, type: 'x', code: e.providerCode || '' } }),
  };
}

const enc = new TextEncoder();
const sseLine = (obj: unknown) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);

/** Turns an async iterable of `{ text }` pieces into a Groq-style SSE response. A throw mid-iteration breaks the stream. */
export function sseResponse(iter: AsyncIterable<{ text: string }>) {
  const it = iter[Symbol.asyncIterator]();
  let finished = false;
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    body: {
      getReader: () => ({
        read: async () => {
          if (finished) return { done: true, value: undefined };
          const step = await it.next();
          if (step.done) {
            finished = true;
            return { done: false, value: enc.encode('data: [DONE]\n\n') };
          }
          return {
            done: false,
            value: sseLine({ choices: [{ delta: { content: step.value.text }, finish_reason: null }], x_groq: { usage: { total_tokens: 7 } } }),
          };
        },
      }),
    },
  };
}

/** A raw byte stream, for testing how SSE lines that are split across network chunks are reassembled. */
export function rawStreamResponse(parts: string[]) {
  let i = 0;
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    body: { getReader: () => ({ read: async () => (i < parts.length ? { done: false, value: enc.encode(parts[i++]) } : { done: true, value: undefined }) }) },
  };
}

export interface FakeHandlers {
  chat: (req: any, call: number) => any | Promise<any>;
  stream: (req: any, call: number) => Promise<AsyncIterable<{ text: string }> | any>;
}

/** Installs the fake. `req` is the parsed request body plus `signal`. Thrown errors with a .status become HTTP errors. */
export function installFakeGroq(get: () => FakeHandlers, record: { chat: any[]; stream: any[] }) {
  __setFetchForTests(async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    const req = { ...body, signal: init.signal, authorization: init.headers?.Authorization };
    try {
      if (body.stream) {
        record.stream.push(req);
        const out = await get().stream(req, record.stream.length);
        return out?.__raw ? out.response : sseResponse(out);
      }
      record.chat.push(req);
      const out = await get().chat(req, record.chat.length);
      return { ok: true, status: 200, headers: new Headers(), json: async () => out, text: async () => JSON.stringify(out) };
    } catch (e) {
      return errorResponse(e);
    }
  });
}
