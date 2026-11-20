import type { Request, Response } from 'express';
import { aiErrorStatus, streamMentorReply } from './aiService.ts';

/**
 * POST /api/ai/mentor/stream: same reply as /api/ai/mentor, delivered as server-sent events so the
 * answer appears as it is written. Events: "token" {text}, "done" {text, model, latencyMs, sources},
 * "error" {error}. Problems found before any text exists (daily limit, missing key...) are answered
 * with a normal JSON error and the matching HTTP status.
 */
export function createMentorStreamHandler(getUserId: (req: Request, res: Response) => string) {
  return async (req: Request, res: Response) => {
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort(); // the browser went away: stop paying for the answer
    });
    let streaming = false;
    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    try {
      for await (const ev of streamMentorReply(getUserId(req, res), (req.body || {}) as any, controller.signal)) {
        if (!streaming) {
          streaming = true;
          res.status(200);
          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-transform');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('X-Accel-Buffering', 'no');
          res.flushHeaders();
        }
        if (ev.type === 'token') send('token', { text: ev.text });
        else send('done', { text: ev.text, model: ev.model, latencyMs: ev.latencyMs, sources: ev.sources });
      }
    } catch (err: any) {
      const message = err?.message || 'Mentor could not reply right now.';
      if (streaming) send('error', { error: message });
      else if (!res.headersSent) res.status(aiErrorStatus(err)).json({ error: message });
    }
    if (!res.writableEnded) res.end();
  };
}
