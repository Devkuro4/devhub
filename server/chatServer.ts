import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { AUTH_ENABLED, DEMO_SERVER_ALLOWED, verifyAccessToken } from './auth.ts';

export interface StudyChatRoom {
  id: string;
  name: string;
  topic: string;
}

export interface StudyChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderField?: string;
  text: string;
  codeSnippet?: string;
  createdAt: string;
}

interface ClientInfo {
  ws: WebSocket;
  userId: string;
  userName: string;
  userField: string;
  roomId: string;
  /** True once the member's login token has been checked (or demo mode is allowed). */
  verified: boolean;
  sentAt: number[];
  lastTypingAt: number;
  alive: boolean;
}

const RATE_LIMIT_COUNT = 6;
const RATE_LIMIT_WINDOW_MS = 10_000;

const DEFAULT_ROOMS: StudyChatRoom[] = [
  { id: 'general', name: 'General Study Hall', topic: 'Daily check-ins, study accountability & beginner Q&A' },
  { id: 'frontend', name: 'Frontend & UI', topic: 'HTML, CSS, Flexbox, JavaScript, React & responsive design' },
  { id: 'backend', name: 'Backend & Databases', topic: 'APIs, Node.js, SQL, authentication & architecture' },
  { id: 'ai-python', name: 'Python & AI Builders', topic: 'Python scripts, prompts, structured outputs & ML tools' },
  { id: 'projects', name: 'Project Pairings', topic: 'Find teammates, share repos & review each other’s builds' },
];

const rooms: StudyChatRoom[] = [...DEFAULT_ROOMS];
const roomHistory = new Map<string, StudyChatMessage[]>();
const clients = new Set<ClientInfo>();

for (const r of rooms) {
  roomHistory.set(r.id, []);
}

export function listChatRooms(): StudyChatRoom[] {
  return rooms;
}

export function getChatHistory(roomId: string): StudyChatMessage[] {
  return roomHistory.get(roomId) || [];
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

export function setupChatServer(httpServer: HttpServer, allowedOrigins: string[] = []) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  // Drop dead connections (common on mobile networks) so "online" counts stay honest
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

    // Refuse connections from other websites. Same-site and the configured ALLOWED_ORIGINS are fine;
    // clients that send no Origin header (not browsers) are let through to the login check below.
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

    // Nothing is sent until the member proves who they are with their login token (chat:join).
    ws.send(JSON.stringify({ type: 'chat:init', rooms, roomId: client.roomId, history: [], presence: [] }));

    // Serialises messages so a second message can never be handled before the login check has finished.
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
            // Identity comes from the verified account, never from what the browser says it is.
            client.userId = result.user.userId;
            client.userName = result.user.name.slice(0, 64);
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
          // Local demo only: there are no accounts, so the browser's own name and id are used.
          if (typeof msg.userId === 'string' && msg.userId.trim()) client.userId = msg.userId.trim().slice(0, 64);
          if (typeof msg.userName === 'string' && msg.userName.trim()) client.userName = msg.userName.trim().slice(0, 64);
        }

        const prevRoom = client.roomId;
        const nextRoom = typeof msg.roomId === 'string' && rooms.some((r) => r.id === msg.roomId) ? msg.roomId : 'general';
        if (typeof msg.userField === 'string') client.userField = msg.userField.trim().slice(0, 64);
        client.roomId = nextRoom;

        ws.send(
          JSON.stringify({
            type: 'chat:history',
            roomId: nextRoom,
            history: getChatHistory(nextRoom),
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
        // Light spam protection: a few messages per short window
        const now = Date.now();
        client.sentAt = client.sentAt.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
        if (client.sentAt.length >= RATE_LIMIT_COUNT) {
          ws.send(JSON.stringify({ type: 'chat:error', code: 'rate_limited', message: 'Slow down a little — you can send again in a few seconds.' }));
          return;
        }
        client.sentAt.push(now);

        const roomId = typeof msg.roomId === 'string' && roomHistory.has(msg.roomId) ? msg.roomId : client.roomId;
        const text = String(msg.text || '').trim().slice(0, 2000);
        const codeSnippet = typeof msg.codeSnippet === 'string' ? msg.codeSnippet.trim().slice(0, 3000) : '';
        if (!text && !codeSnippet) return;

        // Never trust a sender name or id from the browser: use what was verified at join time.
        const senderName = client.userName;
        const senderId = client.userId;

        const messageObj: StudyChatMessage = {
          id: typeof msg.id === 'string' && msg.id.trim() ? msg.id.trim().slice(0, 80) : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          roomId,
          senderId,
          senderName,
          senderField: client.userField,
          text,
          codeSnippet: codeSnippet || undefined,
          createdAt: new Date().toISOString(),
        };

        const list = roomHistory.get(roomId) || [];
        if (!list.some((m) => m.id === messageObj.id && m.senderId === messageObj.senderId)) {
          list.push(messageObj);
          if (list.length > 200) list.splice(0, list.length - 200);
          roomHistory.set(roomId, list);
          broadcastToRoom(roomId, { type: 'chat:message', roomId, message: messageObj });
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
