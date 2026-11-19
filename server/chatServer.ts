import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { AUTH_ENABLED, DEMO_SERVER_ALLOWED, verifyAccessToken } from './auth.ts';
import {
  appendChatMessage,
  deleteOrHideChatMessage,
  getChatHistoryForRoom,
  isUserAdmin,
  isUserMuted,
  listChatRoomsForUser,
  subscribeCommunityEvents,
} from './communityStore.ts';
import type { StudyChatMessage, StudyChatRoom } from '../src/types.ts';

export type { StudyChatMessage, StudyChatRoom };

interface ClientInfo {
  ws: WebSocket;
  userId: string;
  userName: string;
  userField: string;
  isAdmin: boolean;
  roomId: string;
  /** True once the member's login token has been checked (or demo mode is allowed). */
  verified: boolean;
  sentAt: number[];
  lastTypingAt: number;
  alive: boolean;
}

const RATE_LIMIT_COUNT = 8;
const RATE_LIMIT_WINDOW_MS = 10_000;

const clients = new Set<ClientInfo>();

export function listChatRooms(userId?: string): StudyChatRoom[] {
  return listChatRoomsForUser(userId);
}

export function getChatHistory(roomId: string): StudyChatMessage[] {
  return getChatHistoryForRoom(roomId);
}

function getRoomPresence(roomId: string): { userId: string; userName: string; userField: string }[] {
  const seen = new Set<string>();
  const list: { userId: string; userName: string; userField: string }[] = [];
  for (const c of clients) {
    if (!c.verified || c.roomId !== roomId || c.ws.readyState !== WebSocket.OPEN) continue;
    const key = `${c.userId}::${c.userName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ userId: c.userId, userName: c.userName, userField: c.userField });
  }
  return list;
}

function broadcastToRoom(roomId: string, payload: unknown, except?: ClientInfo) {
  const encoded = JSON.stringify(payload);
  for (const c of clients) {
    if (c === except) continue;
    if (c.verified && c.roomId === roomId && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(encoded);
    }
  }
}

function broadcastToUser(userId: string, payload: unknown) {
  const encoded = JSON.stringify(payload);
  for (const c of clients) {
    if (c.verified && c.userId === userId && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(encoded);
    }
  }
}

function broadcastAllVerified(payload: unknown) {
  const encoded = JSON.stringify(payload);
  for (const c of clients) {
    if (c.verified && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(encoded);
    }
  }
}

let subscribed = false;

export function setupChatServer(httpServer: HttpServer, allowedOrigins: string[] = []) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 24 * 1024 });

  if (!subscribed) {
    subscribed = true;
    subscribeCommunityEvents((ev) => {
      if (ev.type === 'community:sync') {
        broadcastAllVerified(ev);
      } else if (ev.type === 'notification:new') {
        broadcastToUser(ev.recipientId, { type: 'notification:new', notification: ev.notification });
      } else if (ev.type === 'chat:rooms') {
        for (const c of clients) {
          if (c.verified && c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(JSON.stringify({ type: 'chat:rooms', rooms: listChatRoomsForUser(c.userId) }));
          }
        }
      } else if (ev.type === 'chat:message:updated') {
        broadcastToRoom(ev.roomId, { type: 'chat:message:updated', roomId: ev.roomId, message: ev.message });
      }
    });
  }

  // Drop dead connections so "online" counts stay honest
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
        /* closed */
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

    if (pathname !== '/ws/chat') {
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
    const client: ClientInfo = {
      ws,
      userId: `member-${Math.random().toString(36).slice(2, 8)}`,
      userName: 'Member',
      userField: '',
      isAdmin: false,
      roomId: 'general',
      verified: false,
      sentAt: [],
      lastTypingAt: 0,
      alive: true,
    };
    clients.add(client);
    ws.on('pong', () => {
      client.alive = true;
    });

    // Nothing private is sent until chat:join verifies identity.
    ws.send(
      JSON.stringify({
        type: 'chat:init',
        rooms: listChatRoomsForUser(undefined),
        roomId: client.roomId,
        history: [],
        presence: [],
      })
    );

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

      if (msg.type === 'chat:join') {
        if (!client.verified) {
          if (AUTH_ENABLED) {
            const result = await verifyAccessToken(typeof msg.token === 'string' ? msg.token : '');
            if (!result.ok || !result.user) {
              ws.send(JSON.stringify({ type: 'chat:error', code: 'unauthorized', message: 'Please sign in again to use study chat.' }));
              ws.close(4401, 'unauthorized');
              return;
            }
            client.userId = result.user.userId;
            client.userName = result.user.name.slice(0, 64);
            client.isAdmin = result.user.isAdmin;
            client.verified = true;
          } else if (DEMO_SERVER_ALLOWED) {
            client.verified = true;
          } else {
            ws.send(JSON.stringify({ type: 'chat:error', code: 'unavailable', message: 'Study chat is switched off until the server is connected to Supabase.' }));
            ws.close(4503, 'not configured');
            return;
          }
        }
        if (!AUTH_ENABLED) {
          if (typeof msg.userId === 'string' && msg.userId.trim()) client.userId = msg.userId.trim().slice(0, 120);
          if (typeof msg.userName === 'string' && msg.userName.trim()) client.userName = msg.userName.trim().slice(0, 80);
          client.isAdmin = isUserAdmin(client.userId);
        }

        const userRooms = listChatRoomsForUser(client.userId);
        const prevRoom = client.roomId;
        const requestedRoom = typeof msg.roomId === 'string' ? msg.roomId : 'general';
        const nextRoom = userRooms.some((r) => r.id === requestedRoom) ? requestedRoom : 'general';
        if (typeof msg.userField === 'string') client.userField = msg.userField.trim().slice(0, 80);
        client.roomId = nextRoom;

        ws.send(
          JSON.stringify({
            type: 'chat:rooms',
            rooms: userRooms,
          })
        );
        ws.send(
          JSON.stringify({
            type: 'chat:history',
            roomId: nextRoom,
            history: getChatHistoryForRoom(nextRoom),
            presence: getRoomPresence(nextRoom),
          })
        );

        if (prevRoom !== nextRoom) {
          broadcastToRoom(prevRoom, { type: 'chat:presence', roomId: prevRoom, presence: getRoomPresence(prevRoom) });
        }
        broadcastToRoom(nextRoom, { type: 'chat:presence', roomId: nextRoom, presence: getRoomPresence(nextRoom) });
      } else if (!client.verified) {
        return;
      } else if (msg.type === 'chat:typing') {
        const now = Date.now();
        if (now - client.lastTypingAt < 1500) return;
        client.lastTypingAt = now;
        broadcastToRoom(
          client.roomId,
          { type: 'chat:typing', roomId: client.roomId, userId: client.userId, userName: client.userName },
          client
        );
      } else if (msg.type === 'chat:send') {
        const mute = isUserMuted(client.userId);
        if (mute.muted) {
          ws.send(
            JSON.stringify({
              type: 'chat:error',
              code: 'muted',
              message: `You are currently muted${mute.reason ? ` (${mute.reason})` : ''}.`,
            })
          );
          return;
        }

        const now = Date.now();
        client.sentAt = client.sentAt.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
        if (client.sentAt.length >= RATE_LIMIT_COUNT) {
          ws.send(JSON.stringify({ type: 'chat:error', code: 'rate_limited', message: 'Slow down a little — you can send again in a few seconds.' }));
          return;
        }
        client.sentAt.push(now);

        const userRooms = listChatRoomsForUser(client.userId);
        const roomId = typeof msg.roomId === 'string' && userRooms.some((r) => r.id === msg.roomId) ? msg.roomId : client.roomId;
        const text = String(msg.text || '').trim().slice(0, 2000);
        const codeSnippet = typeof msg.codeSnippet === 'string' ? msg.codeSnippet.trim().slice(0, 3000) : '';
        if (!text && !codeSnippet) return;

        const messageObj: StudyChatMessage = {
          id: typeof msg.id === 'string' && msg.id.trim() ? msg.id.trim().slice(0, 80) : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          roomId,
          senderId: client.userId,
          senderName: client.userName,
          senderField: client.userField,
          text,
          codeSnippet: codeSnippet || undefined,
          replyToId: typeof msg.replyToId === 'string' && msg.replyToId.trim() ? msg.replyToId.trim().slice(0, 80) : undefined,
          replyToAuthor: typeof msg.replyToAuthor === 'string' && msg.replyToAuthor.trim() ? msg.replyToAuthor.trim().slice(0, 80) : undefined,
          replyToText: typeof msg.replyToText === 'string' && msg.replyToText.trim() ? msg.replyToText.trim().slice(0, 140) : undefined,
          createdAt: new Date().toISOString(),
        };

        const saved = appendChatMessage(messageObj);
        if ('error' in saved) {
          ws.send(JSON.stringify({ type: 'chat:error', code: 'rejected', message: saved.error }));
          return;
        }
        broadcastToRoom(roomId, { type: 'chat:message', roomId, message: saved.message });
      } else if (msg.type === 'chat:delete') {
        const roomId = typeof msg.roomId === 'string' ? msg.roomId : client.roomId;
        const messageId = typeof msg.messageId === 'string' ? msg.messageId : '';
        if (!messageId) return;
        const result = deleteOrHideChatMessage(
          { userId: client.userId, isAdmin: client.isAdmin || isUserAdmin(client.userId) },
          roomId,
          messageId,
          typeof msg.reason === 'string' ? msg.reason : undefined
        );
        if ('error' in result) {
          ws.send(JSON.stringify({ type: 'chat:error', code: 'forbidden', message: result.error }));
        }
      }
    }

    ws.on('close', () => {
      clients.delete(client);
      broadcastToRoom(client.roomId, {
        type: 'chat:presence',
        roomId: client.roomId,
        presence: getRoomPresence(client.roomId),
      });
    });
  });

  return wss;
}
