import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { AUTH_ENABLED, DEMO_SERVER_ALLOWED, verifyAccessToken } from './auth.ts';
import {
  addTeamChatMessage,
  checkArenaTimers,
  getArenaMatchForUser,
  listArenaMatches,
  setArenaPresence,
  subscribeArenaEvents,
  updateTeamWorkspace,
} from './arenaStore.ts';
import { isUserAdmin } from './communityStore.ts';

interface ArenaSocketClient {
  ws: WebSocket;
  userId: string;
  userName: string;
  isAdmin: boolean;
  verified: boolean;
  subscribedMatchId: string | null;
  alive: boolean;
  chatTimestamps: number[];
}

const clients = new Set<ArenaSocketClient>();
let subscribedToStore = false;

function sendJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function setupArenaServer(httpServer: HttpServer, allowedOrigins: string[] = []) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });

  if (!subscribedToStore) {
    subscribedToStore = true;
    subscribeArenaEvents((ev) => {
      if (ev.type === 'arena:lobby_sync') {
        for (const c of clients) {
          if (!c.verified || c.ws.readyState !== WebSocket.OPEN) continue;
          sendJson(c.ws, { type: 'arena:lobby_sync', matches: listArenaMatches(c.userId) });
        }
      } else if (ev.type === 'arena:match_updated') {
        for (const c of clients) {
          if (!c.verified || c.ws.readyState !== WebSocket.OPEN) continue;
          if (c.subscribedMatchId === ev.matchId || !c.subscribedMatchId) {
            const view = getArenaMatchForUser(ev.matchId, c.userId);
            if (view) {
              sendJson(c.ws, { type: 'arena:match_updated', match: view });
            }
          }
        }
      } else if (ev.type === 'arena:team_workspace') {
        for (const c of clients) {
          if (!c.verified || c.ws.readyState !== WebSocket.OPEN) continue;
          if (c.subscribedMatchId !== ev.matchId) continue;
          const view = getArenaMatchForUser(ev.matchId, c.userId);
          if (!view) continue;
          const team = view.teams[ev.teamId];
          // Privacy guard: ONLY send workspace sync to verified members of ev.teamId
          if (team && team.memberIds.includes(c.userId) && team.privateState) {
            sendJson(c.ws, {
              type: 'arena:team_workspace',
              matchId: ev.matchId,
              teamId: ev.teamId,
              privateState: team.privateState,
              serverNowMs: Date.now(),
            });
          }
        }
      } else if (ev.type === 'arena:competitions_sync') {
        for (const c of clients) {
          if (!c.verified || c.ws.readyState !== WebSocket.OPEN) continue;
          sendJson(c.ws, { type: 'arena:competitions_sync' });
        }
      }
    });
  }

  const heartbeat = setInterval(() => {
    for (const c of clients) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      try {
        c.ws.ping();
      } catch {
        /* ignore closed socket */
      }
    }
  }, 30_000);
  wss.on('close', () => clearInterval(heartbeat));

  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = (() => {
      try {
        return new URL(request.url || '/', 'http://localhost').pathname;
      } catch {
        return '';
      }
    })();

    if (pathname !== '/ws/arena') {
      return;
    }

    const origin = request.headers.origin;
    if (origin) {
      const originHost = (() => {
        try {
          return new URL(origin).host;
        } catch {
          return '';
        }
      })();
      const sameSite = originHost && originHost === request.headers.host;
      const listed = allowedOrigins.includes(origin.replace(/\/+$/, ''));
      if (!sameSite && !listed) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws) => {
    const client: ArenaSocketClient = {
      ws,
      userId: `member-${Math.random().toString(36).slice(2, 8)}`,
      userName: 'Member',
      isAdmin: false,
      verified: false,
      subscribedMatchId: null,
      alive: true,
      chatTimestamps: [],
    };
    clients.add(client);

    ws.on('pong', () => {
      client.alive = true;
    });

    sendJson(ws, { type: 'arena:hello', serverNowMs: Date.now() });

    let queue: Promise<void> = Promise.resolve();
    ws.on('message', (raw) => {
      queue = queue.then(() => handleMessage(raw)).catch(() => {});
    });

    async function handleMessage(raw: unknown) {
      let msg: any;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (msg.type === 'arena:auth') {
        if (AUTH_ENABLED) {
          const res = await verifyAccessToken(typeof msg.token === 'string' ? msg.token : '');
          if (!res.ok || !res.user) {
            sendJson(ws, { type: 'arena:error', code: 'unauthorized', message: 'Please sign in again to connect to the Arena.' });
            ws.close(4401, 'unauthorized');
            return;
          }
          client.userId = res.user.userId;
          client.userName = res.user.name.slice(0, 64);
          client.isAdmin = res.user.isAdmin;
          client.verified = true;
        } else if (DEMO_SERVER_ALLOWED) {
          if (typeof msg.userId === 'string' && msg.userId.trim()) client.userId = msg.userId.trim().slice(0, 120);
          if (typeof msg.userName === 'string' && msg.userName.trim()) client.userName = msg.userName.trim().slice(0, 80);
          client.isAdmin = isUserAdmin(client.userId);
          client.verified = true;
        } else {
          sendJson(ws, { type: 'arena:error', code: 'unavailable', message: 'Arena WebSocket requires authentication setup.' });
          ws.close(4503, 'not configured');
          return;
        }

        if (typeof msg.matchId === 'string' && msg.matchId.trim()) {
          client.subscribedMatchId = msg.matchId.trim();
          setArenaPresence(client.userId, client.subscribedMatchId, true);
          const match = getArenaMatchForUser(client.subscribedMatchId, client.userId);
          sendJson(ws, { type: 'arena:sync', match, matches: listArenaMatches(client.userId), serverNowMs: Date.now() });
        } else {
          client.subscribedMatchId = null;
          sendJson(ws, { type: 'arena:sync', match: null, matches: listArenaMatches(client.userId), serverNowMs: Date.now() });
        }
        return;
      }

      if (!client.verified) return;

      if (msg.type === 'arena:subscribe_match') {
        const nextMatchId = typeof msg.matchId === 'string' && msg.matchId.trim() ? msg.matchId.trim() : null;
        if (client.subscribedMatchId && client.subscribedMatchId !== nextMatchId) {
          const prevMatchId = client.subscribedMatchId;
          const stillWatchingPrev = Array.from(clients).some(
            (other) => other !== client && other.verified && other.userId === client.userId && other.subscribedMatchId === prevMatchId
          );
          if (!stillWatchingPrev) {
            setArenaPresence(client.userId, prevMatchId, false);
          }
        }
        client.subscribedMatchId = nextMatchId;
        if (nextMatchId) {
          setArenaPresence(client.userId, nextMatchId, true);
          const match = getArenaMatchForUser(nextMatchId, client.userId);
          sendJson(ws, { type: 'arena:sync', match, serverNowMs: Date.now() });
        } else {
          sendJson(ws, { type: 'arena:lobby_sync', matches: listArenaMatches(client.userId), serverNowMs: Date.now() });
        }
      } else if (msg.type === 'arena:code_update') {
        const matchId = typeof msg.matchId === 'string' ? msg.matchId : client.subscribedMatchId;
        if (!matchId) return;
        const out = updateTeamWorkspace(
          matchId,
          { userId: client.userId, userName: client.userName },
          {
            language: msg.language,
            code: typeof msg.code === 'string' ? msg.code : undefined,
          }
        );
        if ('error' in out) {
          sendJson(ws, { type: 'arena:error', message: out.error });
        }
      } else if (msg.type === 'arena:team_chat') {
        const matchId = typeof msg.matchId === 'string' ? msg.matchId : client.subscribedMatchId;
        if (!matchId) return;
        const now = Date.now();
        client.chatTimestamps = client.chatTimestamps.filter((t) => now - t < 8000);
        if (client.chatTimestamps.length >= 10) {
          sendJson(ws, { type: 'arena:error', message: 'Slow down a moment before sending more team messages.' });
          return;
        }
        client.chatTimestamps.push(now);
        const out = addTeamChatMessage(matchId, { userId: client.userId, userName: client.userName }, String(msg.text || ''));
        if ('error' in out) {
          sendJson(ws, { type: 'arena:error', message: out.error });
        }
      } else if (msg.type === 'arena:ping_sync') {
        checkArenaTimers();
        const match = client.subscribedMatchId ? getArenaMatchForUser(client.subscribedMatchId, client.userId) : null;
        sendJson(ws, {
          type: 'arena:sync',
          match,
          matches: listArenaMatches(client.userId),
          serverNowMs: Date.now(),
        });
      }
    }

    ws.on('close', () => {
      clients.delete(client);
      if (client.verified && client.subscribedMatchId) {
        const stillConnected = Array.from(clients).some(
          (other) =>
            other.verified &&
            other.userId === client.userId &&
            other.subscribedMatchId === client.subscribedMatchId &&
            other.ws.readyState === WebSocket.OPEN
        );
        if (!stillConnected) {
          setArenaPresence(client.userId, client.subscribedMatchId, false);
        }
      }
    });
  });

  return wss;
}
