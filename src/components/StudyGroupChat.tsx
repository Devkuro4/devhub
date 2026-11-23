import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  Code2,
  Copy,
  CornerUpLeft,
  Flag,
  Hash,
  Lock,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldAlert,
  Trash2,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { fetchChatHistory, fetchChatRooms, getAccessToken, getChatWsUrl } from '../lib/aiClient';
import type {
  CommunityNotification,
  OnboardingProfile,
  StudyChatMessage,
  StudyChatRoom,
  UserSession,
} from '../types';

export interface OnlinePeer {
  userId: string;
  userName: string;
  userField: string;
}

export interface MentionCandidate {
  id: string;
  name: string;
  username?: string;
}

interface OutboxItem {
  id: string;
  roomId: string;
  text: string;
  codeSnippet?: string;
  replyToId?: string;
  replyToAuthor?: string;
  replyToText?: string;
  createdAt: string;
}

interface StudyChatContextValue {
  rooms: StudyChatRoom[];
  setRooms: React.Dispatch<React.SetStateAction<StudyChatRoom[]>>;
  activeRoomId: string;
  setActiveRoomId: (roomId: string) => void;
  messages: StudyChatMessage[];
  pendingMessages: StudyChatMessage[];
  presence: OnlinePeer[];
  connectionStatus: 'connecting' | 'connected' | 'reconnecting' | 'offline';
  sendMessage: (
    text: string,
    codeSnippet?: string,
    replyTo?: { id: string; senderName: string; text: string }
  ) => boolean;
  deleteMessage: (messageId: string, reason?: string) => void;
  isWidgetOpen: boolean;
  setIsWidgetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  unreadCount: number;
  unreadByRoom: Record<string, number>;
  clearUnread: () => void;
  typingNames: string[];
  notifyTyping: () => void;
  notice: string | null;
  reconnectNow: () => void;
  upsertRoomAndOpen: (room: StudyChatRoom) => void;
}

const MAX_MESSAGE_LENGTH = 2000;
const MAX_CODE_LENGTH = 3000;

const DEFAULT_ROOMS: StudyChatRoom[] = [
  { id: 'general', name: 'General Study Hall', topic: 'Daily check-ins, study accountability & beginner Q&A' },
  { id: 'frontend', name: 'Frontend & UI', topic: 'HTML, CSS, Flexbox, JavaScript, React & responsive design' },
  { id: 'backend', name: 'Backend & Databases', topic: 'APIs, Node.js, SQL, authentication & architecture' },
  { id: 'ai-python', name: 'Python & AI Builders', topic: 'Python scripts, prompts, structured outputs & ML tools' },
  { id: 'projects', name: 'Project Pairings', topic: 'Find teammates, share repos & review each other’s builds' },
];

const StudyChatContext = createContext<StudyChatContextValue | null>(null);

export const StudyChatProvider: React.FC<{
  user: UserSession | null;
  profile: OnboardingProfile;
  onCommunitySync?: () => void;
  onLiveNotification?: (notification: CommunityNotification) => void;
  children: React.ReactNode;
}> = ({ user, profile, onCommunitySync, onLiveNotification, children }) => {
  const [rooms, setRooms] = useState<StudyChatRoom[]>(DEFAULT_ROOMS);
  const [activeRoomId, setActiveRoomIdState] = useState<string>('general');
  const [messagesByRoom, setMessagesByRoom] = useState<Record<string, StudyChatMessage[]>>({});
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [presenceByRoom, setPresenceByRoom] = useState<Record<string, OnlinePeer[]>>({});
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'offline'>('connecting');
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadByRoom, setUnreadByRoom] = useState<Record<string, number>>({});
  const [typingPeers, setTypingPeers] = useState<{ userId: string; userName: string; roomId: string; until: number }[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const lastTypingSentRef = useRef(0);
  const connectRef = useRef<() => void>(() => {});
  const wsRef = useRef<WebSocket | null>(null);
  const activeRoomRef = useRef(activeRoomId);
  activeRoomRef.current = activeRoomId;
  const widgetOpenRef = useRef(isWidgetOpen);
  widgetOpenRef.current = isWidgetOpen;
  const userRef = useRef({ user, profile });
  userRef.current = { user, profile };
  const outboxRef = useRef<OutboxItem[]>(outbox);
  outboxRef.current = outbox;
  const callbacksRef = useRef({ onCommunitySync, onLiveNotification });
  callbacksRef.current = { onCommunitySync, onLiveNotification };
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myUserId = user?.id || user?.email || 'member';

  const mergeMessages = useCallback((roomId: string, incoming: StudyChatMessage[], replaceOrder = false) => {
    setMessagesByRoom((prev) => {
      const existing = prev[roomId] || [];
      const byId = new Map<string, StudyChatMessage>();
      if (replaceOrder) {
        for (const m of existing) byId.set(m.id, m);
        for (const m of incoming) byId.set(m.id, m);
        const merged = Array.from(byId.values()).sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        return { ...prev, [roomId]: merged.slice(-300) };
      }
      const seen = new Set(existing.map((m) => m.id));
      const next = [...existing];
      for (const m of incoming) {
        if (seen.has(m.id)) {
          const i = next.findIndex((x) => x.id === m.id);
          if (i >= 0) next[i] = m;
        } else {
          seen.add(m.id);
          next.push(m);
        }
      }
      return { ...prev, [roomId]: next.slice(-300) };
    });
  }, []);

  const flushOutbox = useCallback((ws: WebSocket) => {
    if (ws.readyState !== WebSocket.OPEN || outboxRef.current.length === 0) return;
    const currentUser = userRef.current.user;
    const currentProfile = userRef.current.profile;
    const queue = [...outboxRef.current];
    for (const item of queue) {
      ws.send(
        JSON.stringify({
          type: 'chat:send',
          id: item.id,
          roomId: item.roomId,
          senderId: currentUser?.id || currentUser?.email || 'member',
          senderName: currentUser?.name || currentProfile.fullName || 'Member',
          senderField: currentProfile.field || '',
          text: item.text,
          codeSnippet: item.codeSnippet || undefined,
          replyToId: item.replyToId,
          replyToAuthor: item.replyToAuthor,
          replyToText: item.replyToText,
        })
      );
    }
    setOutbox([]);
  }, []);

  // Load initial HTTP room list & history gracefully
  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetchChatRooms(myUserId)
      .then((res) => {
        if (alive && Array.isArray(res.rooms) && res.rooms.length > 0) {
          setRooms(res.rooms);
        }
      })
      .catch(() => {});
    fetchChatHistory(activeRoomId, myUserId)
      .then((res) => {
        if (alive && Array.isArray(res.messages)) {
          mergeMessages(activeRoomId, res.messages, true);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user, myUserId, activeRoomId, mergeMessages]);

  useEffect(() => {
    if (!user) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let cancelled = false;
    let attempt = 0;

    const connect = () => {
      if (cancelled) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setConnectionStatus('offline');
        return;
      }

      setConnectionStatus(attempt === 0 ? 'connecting' : 'reconnecting');
      let ws: WebSocket;
      try {
        ws = new WebSocket(getChatWsUrl());
      } catch {
        setConnectionStatus('offline');
        return;
      }
      wsRef.current = ws;

      ws.onopen = async () => {
        if (cancelled) {
          ws.close();
          return;
        }
        attempt = 0;
        setConnectionStatus('connected');
        const currentUser = userRef.current.user;
        const currentProfile = userRef.current.profile;
        const token = await getAccessToken().catch(() => '');
        if (cancelled || ws.readyState !== WebSocket.OPEN) return;
        ws.send(
          JSON.stringify({
            type: 'chat:join',
            token,
            userId: currentUser?.id || currentUser?.email || 'member',
            userName: currentUser?.name || currentProfile.fullName || 'Member',
            userField: currentProfile.field || '',
            roomId: activeRoomRef.current,
          })
        );
        // Flush any messages queued while offline/reconnecting
        setTimeout(() => {
          if (!cancelled && ws.readyState === WebSocket.OPEN) {
            flushOutbox(ws);
          }
        }, 120);
      };

      ws.onmessage = (event) => {
        let payload: any;
        try {
          payload = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (payload.type === 'chat:init' || payload.type === 'chat:rooms') {
          if (Array.isArray(payload.rooms) && payload.rooms.length > 0) {
            setRooms(payload.rooms);
          }
          if (payload.roomId && Array.isArray(payload.history)) {
            mergeMessages(payload.roomId, payload.history, true);
          }
          if (payload.roomId && Array.isArray(payload.presence)) {
            setPresenceByRoom((prev) => ({ ...prev, [payload.roomId]: payload.presence }));
          }
        } else if (payload.type === 'chat:history') {
          if (payload.roomId && Array.isArray(payload.history)) {
            mergeMessages(payload.roomId, payload.history, true);
          }
          if (payload.roomId && Array.isArray(payload.presence)) {
            setPresenceByRoom((prev) => ({ ...prev, [payload.roomId]: payload.presence }));
          }
        } else if (payload.type === 'chat:presence') {
          if (payload.roomId && Array.isArray(payload.presence)) {
            setPresenceByRoom((prev) => ({ ...prev, [payload.roomId]: payload.presence }));
          }
        } else if (payload.type === 'chat:message' && payload.message) {
          const msg = payload.message as StudyChatMessage;
          const msgRoom = msg.roomId || payload.roomId || activeRoomRef.current;
          mergeMessages(msgRoom, [msg]);
          setOutbox((prev) => prev.filter((item) => item.id !== msg.id));
          const myId = userRef.current.user?.id || userRef.current.user?.email || 'member';
          if (msg.senderId !== myId) {
            if (!widgetOpenRef.current || msgRoom !== activeRoomRef.current) {
              setUnreadCount((c) => Math.min(99, c + 1));
            }
            if (msgRoom !== activeRoomRef.current) {
              setUnreadByRoom((prev) => ({ ...prev, [msgRoom]: Math.min(99, (prev[msgRoom] || 0) + 1) }));
            }
          }
          setTypingPeers((prev) => prev.filter((p) => p.userId !== msg.senderId));
        } else if (payload.type === 'chat:message:updated' && payload.message) {
          const msg = payload.message as StudyChatMessage;
          mergeMessages(msg.roomId || payload.roomId || activeRoomRef.current, [msg]);
        } else if (payload.type === 'chat:typing' && payload.userId && payload.roomId) {
          const myId = userRef.current.user?.id || userRef.current.user?.email || 'member';
          if (payload.userId === myId) return;
          setTypingPeers((prev) => [
            ...prev.filter((p) => !(p.userId === payload.userId && p.roomId === payload.roomId)),
            {
              userId: String(payload.userId),
              userName: String(payload.userName || 'Someone'),
              roomId: String(payload.roomId),
              until: Date.now() + 4000,
            },
          ]);
        } else if (payload.type === 'chat:error') {
          setNotice(String(payload.message || 'Your message could not be sent.'));
        } else if (payload.type === 'community:sync') {
          callbacksRef.current.onCommunitySync?.();
        } else if (payload.type === 'notification:new' && payload.notification) {
          callbacksRef.current.onLiveNotification?.(payload.notification as CommunityNotification);
        }
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        if (cancelled) return;
        wsRef.current = null;
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          setConnectionStatus('offline');
          return;
        }
        attempt += 1;
        setConnectionStatus('reconnecting');
        const delay = Math.min(8_000, 800 * Math.pow(1.5, Math.min(attempt, 5)));
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
    };

    connectRef.current = connect;
    connect();
    const handleOnline = () => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connect();
      }
    };
    const handleOffline = () => setConnectionStatus('offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [user?.id, user?.email, mergeMessages, flushOutbox]);

  const setActiveRoomId = useCallback(
    async (roomId: string) => {
      setActiveRoomIdState(roomId);
      setUnreadByRoom((prev) => {
        if (!prev[roomId]) return prev;
        const next = { ...prev };
        delete next[roomId];
        return next;
      });
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        const token = await getAccessToken().catch(() => '');
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(
          JSON.stringify({
            type: 'chat:join',
            token,
            userId: user?.id || user?.email || 'member',
            userName: user?.name || profile.fullName || 'Member',
            userField: profile.field || '',
            roomId,
          })
        );
      }
    },
    [user, profile.fullName, profile.field]
  );

  const upsertRoomAndOpen = useCallback(
    (room: StudyChatRoom) => {
      setRooms((prev) => (prev.some((r) => r.id === room.id) ? prev : [...prev, room]));
      setActiveRoomId(room.id);
    },
    [setActiveRoomId]
  );

  const sendMessage = useCallback(
    (
      text: string,
      codeSnippet?: string,
      replyTo?: { id: string; senderName: string; text: string }
    ) => {
      const cleanText = text.trim();
      const cleanCode = (codeSnippet || '').trim();
      if (!cleanText && !cleanCode) return false;

      const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const roomId = activeRoomRef.current;
      const ws = wsRef.current;

      if (!ws || ws.readyState !== WebSocket.OPEN) {
        // Queue message cleanly so offline/reconnecting sends are delivered automatically on reconnect
        setOutbox((prev) => [
          ...prev,
          {
            id: msgId,
            roomId,
            text: cleanText,
            codeSnippet: cleanCode || undefined,
            replyToId: replyTo?.id,
            replyToAuthor: replyTo?.senderName,
            replyToText: replyTo?.text?.slice(0, 120),
            createdAt: new Date().toISOString(),
          },
        ]);
        setNotice('Reconnecting — your message is queued and will send automatically.');
        return true;
      }

      ws.send(
        JSON.stringify({
          type: 'chat:send',
          id: msgId,
          roomId,
          senderId: user?.id || user?.email || 'member',
          senderName: user?.name || profile.fullName || 'Member',
          senderField: profile.field || '',
          text: cleanText,
          codeSnippet: cleanCode || undefined,
          replyToId: replyTo?.id,
          replyToAuthor: replyTo?.senderName,
          replyToText: replyTo?.text?.slice(0, 120),
        })
      );
      return true;
    },
    [user, profile.fullName, profile.field]
  );

  const deleteMessage = useCallback((messageId: string, reason?: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: 'chat:delete',
        roomId: activeRoomRef.current,
        messageId,
        reason,
      })
    );
  }, []);

  const clearUnread = useCallback(() => {
    setUnreadCount(0);
    setUnreadByRoom((prev) => {
      if (!prev[activeRoomRef.current]) return prev;
      const next = { ...prev };
      delete next[activeRoomRef.current];
      return next;
    });
  }, []);

  useEffect(() => {
    if (typingPeers.length === 0) return;
    const t = setInterval(() => {
      const now = Date.now();
      setTypingPeers((prev) => {
        const next = prev.filter((p) => p.until > now);
        return next.length === prev.length ? prev : next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [typingPeers.length]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    lastTypingSentRef.current = now;
    ws.send(JSON.stringify({ type: 'chat:typing', roomId: activeRoomRef.current }));
  }, []);

  const reconnectNow = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    const ws = wsRef.current;
    if (ws) {
      ws.onclose = null;
      ws.close();
      wsRef.current = null;
    }
    connectRef.current();
  }, []);

  const typingNames = useMemo(
    () => Array.from(new Set(typingPeers.filter((p) => p.roomId === activeRoomId).map((p) => p.userName))),
    [typingPeers, activeRoomId]
  );

  const pendingMessages = useMemo<StudyChatMessage[]>(
    () =>
      outbox
        .filter((o) => o.roomId === activeRoomId)
        .map((o) => ({
          id: o.id,
          roomId: o.roomId,
          senderId: myUserId,
          senderName: user?.name || profile.fullName || 'You',
          senderField: profile.field || '',
          text: o.text,
          codeSnippet: o.codeSnippet,
          replyToId: o.replyToId,
          replyToAuthor: o.replyToAuthor,
          replyToText: o.replyToText,
          createdAt: o.createdAt,
        })),
    [outbox, activeRoomId, myUserId, user?.name, profile.fullName, profile.field]
  );

  const value = useMemo<StudyChatContextValue>(
    () => ({
      rooms,
      setRooms,
      activeRoomId,
      setActiveRoomId,
      messages: messagesByRoom[activeRoomId] || [],
      pendingMessages,
      presence: presenceByRoom[activeRoomId] || [],
      connectionStatus,
      sendMessage,
      deleteMessage,
      isWidgetOpen,
      setIsWidgetOpen,
      unreadCount,
      unreadByRoom,
      clearUnread,
      typingNames,
      notifyTyping,
      notice,
      reconnectNow,
      upsertRoomAndOpen,
    }),
    [
      rooms,
      activeRoomId,
      setActiveRoomId,
      messagesByRoom,
      pendingMessages,
      presenceByRoom,
      connectionStatus,
      sendMessage,
      deleteMessage,
      isWidgetOpen,
      unreadCount,
      unreadByRoom,
      clearUnread,
      typingNames,
      notifyTyping,
      notice,
      reconnectNow,
      upsertRoomAndOpen,
    ]
  );

  return <StudyChatContext.Provider value={value}>{children}</StudyChatContext.Provider>;
};

export function useStudyGroupChat() {
  const ctx = useContext(StudyChatContext);
  if (!ctx) {
    throw new Error('useStudyGroupChat must be used inside StudyChatProvider');
  }
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Shared chat pieces (used by the full Study Chat page and the widget) */
/* ------------------------------------------------------------------ */

const formatTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return 'Today';
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || '?';

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

const LinkifiedText: React.FC<{ text: string; mine: boolean }> = ({ text, mine }) => (
  <>
    {text.split(URL_RE).map((part, i) => {
      if (i % 2 === 0) return <React.Fragment key={i}>{part}</React.Fragment>;
      const trail = part.match(/[.,!?;:)\]]+$/)?.[0] || '';
      const url = trail ? part.slice(0, -trail.length) : part;
      return (
        <React.Fragment key={i}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline underline-offset-2 break-all ${mine ? 'text-white' : 'text-[var(--accent-600)]'}`}
          >
            {url}
          </a>
          {trail}
        </React.Fragment>
      );
    })}
  </>
);

const CodeBlock: React.FC<{ code: string; mine: boolean; compact?: boolean }> = ({ code, mine, compact }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };
  return (
    <div className="relative">
      <pre
        className={`p-2.5 pr-16 rounded-lg font-mono overflow-x-auto ${compact ? 'text-[11px]' : 'text-xs'} ${
          mine ? 'bg-black/25 text-white' : 'bg-[var(--surface-elevated)] border border-[var(--border-hairline)]'
        }`}
      >
        {code}
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Code copied' : 'Copy code'}
        className={`absolute top-1.5 right-1.5 inline-flex items-center gap-1 px-2 min-h-[28px] rounded-md text-[11px] font-medium cursor-pointer ${
          mine ? 'bg-white/15 hover:bg-white/25 text-white' : 'bg-[var(--surface-subtle)] hover:bg-[var(--border-hairline)] text-[var(--ink-secondary)]'
        }`}
      >
        {copied ? <Check className="w-3 h-3" aria-hidden="true" /> : <Copy className="w-3 h-3" aria-hidden="true" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
};

const ConnectionBanner: React.FC<{
  status: StudyChatContextValue['connectionStatus'];
  notice: string | null;
  pendingCount?: number;
  onRetry: () => void;
}> = ({ status, notice, pendingCount = 0, onRetry }) => {
  if (status === 'connected' && !notice && pendingCount === 0) return null;
  const text =
    status === 'offline'
      ? `You are offline.${pendingCount ? ` ${pendingCount} message${pendingCount === 1 ? '' : 's'} queued for reconnect.` : ' Messages sent now queue until you reconnect.'}`
      : status !== 'connected'
        ? `Reconnecting to study chat…${pendingCount ? ` (${pendingCount} queued)` : ''}`
        : notice;
  return (
    <div
      role="status"
      className="px-4 py-2 text-xs flex items-center justify-between gap-3 border-b border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-ink)]"
    >
      <span className="min-w-0">{text}</span>
      {status !== 'connected' && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 inline-flex items-center gap-1.5 min-h-[32px] px-2.5 rounded-md font-semibold hover:bg-black/5 cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" aria-hidden="true" /> Retry
        </button>
      )}
    </div>
  );
};

const ChatMessages: React.FC<{
  messages: StudyChatMessage[];
  pendingIds?: Set<string>;
  currentUserId: string;
  isAdmin?: boolean;
  resetKey: string;
  typingNames: string[];
  empty: React.ReactNode;
  compact?: boolean;
  onReply?: (msg: StudyChatMessage) => void;
  onDelete?: (msg: StudyChatMessage, asMod?: boolean) => void;
  onReport?: (msg: StudyChatMessage) => void;
  onSelectMember?: (userId: string, userName: string) => void;
}> = ({
  messages,
  pendingIds,
  currentUserId,
  isAdmin,
  resetKey,
  typingNames,
  empty,
  compact,
  onReply,
  onDelete,
  onReport,
  onSelectMember,
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const lastCountRef = useRef(messages.length);
  const [unseen, setUnseen] = useState(0);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => {
    stickRef.current = true;
    lastCountRef.current = messages.length;
    setUnseen(0);
    requestAnimationFrame(() => scrollToBottom());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    const added = messages.length - lastCountRef.current;
    lastCountRef.current = messages.length;
    if (added <= 0) return;
    const last = messages[messages.length - 1];
    if (stickRef.current || last?.senderId === currentUserId) {
      requestAnimationFrame(() => scrollToBottom(added <= 3));
      setUnseen(0);
    } else {
      setUnseen((u) => u + added);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickRef.current = nearBottom;
    if (nearBottom) setUnseen(0);
  };

  const typingText =
    typingNames.length === 0
      ? ''
      : typingNames.length === 1
        ? `${typingNames[0]} is typing`
        : typingNames.length === 2
          ? `${typingNames[0]} and ${typingNames[1]} are typing`
          : 'Several people are typing';

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={ref}
        onScroll={onScroll}
        role="log"
        aria-label="Chat messages"
        className={`h-full overflow-y-auto overscroll-contain ${compact ? 'p-3' : 'p-4 sm:p-5'}`}
      >
        {messages.length === 0 ? (
          empty
        ) : (
          <div>
            {messages.map((m, idx) => {
              const prev = messages[idx - 1];
              const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
              const grouped =
                !newDay &&
                !!prev &&
                prev.senderId === m.senderId &&
                new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
              const mine = m.senderId === currentUserId;
              const isPending = pendingIds?.has(m.id);
              const removed = Boolean(m.deleted || m.hidden);

              return (
                <React.Fragment key={m.id}>
                  {newDay && (
                    <div role="separator" className={`flex items-center gap-3 ${idx === 0 ? 'mb-3' : 'my-4'}`}>
                      <span className="h-px flex-1 bg-[var(--border-hairline)]" />
                      <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-muted)]">{dayLabel(m.createdAt)}</span>
                      <span className="h-px flex-1 bg-[var(--border-hairline)]" />
                    </div>
                  )}
                  <div className={`group/msg flex gap-2.5 ${mine ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-1' : idx === 0 || newDay ? '' : 'mt-4'}`}>
                    {!mine && !compact && (
                      <div className="w-8 shrink-0">
                        {!grouped && (
                          <button
                            type="button"
                            onClick={() => onSelectMember?.(m.senderId, m.senderName)}
                            aria-label={`View ${m.senderName}'s profile`}
                            className="w-8 h-8 rounded-full bg-[var(--accent-100)] text-[var(--accent-700)] text-xs font-semibold flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-[var(--accent-600)]"
                          >
                            {initialsOf(m.senderName)}
                          </button>
                        )}
                      </div>
                    )}
                    <div className={`min-w-0 max-w-[85%] sm:max-w-[78%] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                      {!grouped && (
                        <div className="flex items-baseline gap-2 mb-1 px-1 max-w-full">
                          {mine ? (
                            <span className="text-xs font-semibold text-[var(--ink-primary)] truncate">You</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onSelectMember?.(m.senderId, m.senderName)}
                              className="text-xs font-semibold text-[var(--ink-primary)] hover:text-[var(--accent-600)] hover:underline truncate cursor-pointer"
                            >
                              {m.senderName}
                            </button>
                          )}
                          {m.senderField && !compact && !mine && (
                            <span className="text-[11px] text-[var(--ink-muted)] truncate hidden sm:inline">{m.senderField}</span>
                          )}
                          <span className="text-[11px] tabular-nums text-[var(--ink-muted)] shrink-0">{formatTime(m.createdAt)}</span>
                        </div>
                      )}
                      <div
                        title={formatTime(m.createdAt)}
                        className={`rounded-2xl px-3.5 py-2 leading-relaxed space-y-2 border min-w-0 max-w-full ${compact ? 'text-xs' : 'text-sm'} ${
                          removed
                            ? 'bg-[var(--surface-subtle)] border-[var(--border-hairline)] text-[var(--ink-muted)] italic'
                            : mine
                              ? 'bg-[var(--accent-600)] text-white border-transparent'
                              : 'bg-[var(--surface-subtle)] border-[var(--border-hairline)] text-[var(--ink-primary)]'
                        } ${isPending ? 'opacity-75' : ''}`}
                      >
                        {m.replyToText && !removed && (
                          <div
                            className={`text-xs px-2.5 py-1 rounded-lg border-l-2 ${
                              mine ? 'bg-black/15 border-white/60 text-white/90' : 'bg-[var(--surface-elevated)] border-[var(--accent-600)] text-[var(--ink-secondary)]'
                            }`}
                          >
                            <span className="font-semibold">{m.replyToAuthor || 'Reply'}:</span> {m.replyToText}
                          </div>
                        )}
                        {m.text && (
                          <p className="whitespace-pre-wrap break-words">
                            {removed ? m.text : <LinkifiedText text={m.text} mine={mine} />}
                          </p>
                        )}
                        {m.codeSnippet && !removed && <CodeBlock code={m.codeSnippet} mine={mine} compact={compact} />}
                        {isPending && (
                          <span className="inline-flex items-center gap-1 text-[11px] opacity-85">
                            <Clock className="w-3 h-3" aria-hidden="true" /> Queued for send
                          </span>
                        )}
                      </div>

                      {!compact && !removed && !isPending && (onReply || onDelete || onReport) && (
                        <div className="mt-1 px-1 flex items-center gap-2 opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity text-[11px] text-[var(--ink-muted)]">
                          {onReply && (
                            <button
                              type="button"
                              onClick={() => onReply(m)}
                              className="inline-flex items-center gap-1 hover:text-[var(--accent-600)] cursor-pointer"
                            >
                              <CornerUpLeft className="w-3 h-3" aria-hidden="true" /> Reply
                            </button>
                          )}
                          {(mine || isAdmin) && onDelete && (
                            <button
                              type="button"
                              onClick={() => onDelete(m, !mine && isAdmin)}
                              className="inline-flex items-center gap-1 hover:text-[var(--danger-ink)] cursor-pointer"
                            >
                              {!mine && isAdmin ? <ShieldAlert className="w-3 h-3" aria-hidden="true" /> : <Trash2 className="w-3 h-3" aria-hidden="true" />}
                              {!mine && isAdmin ? 'Moderate' : 'Delete'}
                            </button>
                          )}
                          {!mine && onReport && (
                            <button
                              type="button"
                              onClick={() => onReport(m)}
                              className="inline-flex items-center gap-1 hover:text-[var(--warning-ink)] cursor-pointer"
                            >
                              <Flag className="w-3 h-3" aria-hidden="true" /> Report
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}

        <div aria-live="polite" className="h-6 pt-2 text-[11px] text-[var(--ink-muted)]">
          {typingText && (
            <span className="inline-flex items-center gap-1.5 px-1">
              <span className="inline-flex gap-0.5" aria-hidden="true">
                <span className="w-1 h-1 rounded-full bg-current motion-safe:animate-pulse" />
                <span className="w-1 h-1 rounded-full bg-current motion-safe:animate-pulse [animation-delay:150ms]" />
                <span className="w-1 h-1 rounded-full bg-current motion-safe:animate-pulse [animation-delay:300ms]" />
              </span>
              {typingText}…
            </span>
          )}
        </div>
      </div>

      {unseen > 0 && (
        <button
          type="button"
          onClick={() => {
            stickRef.current = true;
            setUnseen(0);
            scrollToBottom(true);
          }}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 min-h-[36px] px-3.5 rounded-full bg-[var(--panel-deep)] text-white text-xs font-medium shadow-[var(--shadow-lg)] cursor-pointer"
        >
          <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
          {unseen} new message{unseen === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );
};

const ChatComposer: React.FC<{
  roomId: string;
  roomLabel?: string;
  value: string;
  onChange: (v: string) => void;
  code?: string;
  onCodeChange?: (v: string) => void;
  showCode?: boolean;
  onToggleCode?: () => void;
  replyTo?: { id: string; senderName: string; text: string } | null;
  onCancelReply?: () => void;
  mentionCandidates?: MentionCandidate[];
  onSubmit: () => void;
  onTyping: () => void;
  connected: boolean;
  mutedReason?: string;
  compact?: boolean;
}> = ({
  roomId,
  roomLabel,
  value,
  onChange,
  code = '',
  onCodeChange,
  showCode,
  onToggleCode,
  replyTo,
  onCancelReply,
  mentionCandidates = [],
  onSubmit,
  onTyping,
  connected,
  mutedReason,
  compact,
}) => {
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [value]);

  const mentionMatch = !compact ? value.match(/(?:^|\s)@([a-z0-9._-]{0,24})$/i) : null;
  const mentionHits = useMemo(() => {
    if (!mentionMatch || mentionCandidates.length === 0) return [];
    const q = mentionMatch[1].toLowerCase();
    return mentionCandidates
      .filter((m) => !q || m.name.toLowerCase().includes(q) || (m.username && m.username.toLowerCase().includes(q)))
      .slice(0, 5);
  }, [mentionMatch, mentionCandidates]);

  const insertMention = (candidate: MentionCandidate) => {
    const handle = candidate.username || candidate.name.replace(/\s+/g, '');
    const next = value.replace(/(^|\s)@[a-z0-9._-]{0,24}$/i, `$1@${handle} `);
    onChange(next);
    taRef.current?.focus();
  };

  const hasContent = value.trim().length > 0 || (showCode && code.trim().length > 0);
  const canSend = !mutedReason && hasContent;

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    if (touch) return;
    e.preventDefault();
    if (canSend) onSubmit();
  };

  const fieldClass =
    'w-full resize-none rounded-xl border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--accent-600)]';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit();
      }}
      className={`border-t border-[var(--border-hairline)] ${compact ? 'p-2.5' : 'p-3 sm:p-4'} space-y-2 relative`}
    >
      {mentionHits.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pb-1">
          <span className="text-[11px] text-[var(--ink-muted)]">Mention:</span>
          {mentionHits.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => insertMention(m)}
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--accent-50)] text-[var(--accent-700)] hover:bg-[var(--accent-100)] cursor-pointer"
            >
              @{m.username || m.name}
            </button>
          ))}
        </div>
      )}

      {replyTo && (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border-hairline)] text-xs">
          <span className="truncate text-[var(--ink-secondary)]">
            Replying to <strong className="text-[var(--ink-primary)]">{replyTo.senderName}</strong>: {replyTo.text}
          </span>
          {onCancelReply && (
            <button type="button" onClick={onCancelReply} aria-label="Cancel reply" className="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {showCode && onCodeChange && (
        <textarea
          rows={3}
          spellCheck={false}
          maxLength={MAX_CODE_LENGTH}
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          placeholder="Paste a code snippet…"
          aria-label="Code snippet"
          className={`${fieldClass} px-3 py-2 font-mono text-xs !min-h-0`}
        />
      )}

      {mutedReason ? (
        <div className="px-3.5 py-2.5 rounded-xl bg-[var(--danger-bg)] border border-[var(--danger-border)] text-xs text-[var(--danger-ink)] flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <span>Chat is muted for your account ({mutedReason}).</span>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          {onToggleCode && (
            <button
              type="button"
              onClick={onToggleCode}
              aria-label="Attach code snippet"
              aria-pressed={showCode}
              title="Attach code snippet"
              className={`min-h-[44px] min-w-[44px] rounded-xl border flex items-center justify-center cursor-pointer shrink-0 ${
                showCode
                  ? 'bg-[var(--accent-50)] text-[var(--accent-600)] border-[var(--accent-600)]'
                  : 'border-[var(--border-strong)] text-[var(--ink-secondary)] hover:bg-[var(--surface-subtle)]'
              }`}
            >
              <Code2 className="w-4 h-4" />
            </button>
          )}
          <textarea
            ref={taRef}
            rows={1}
            value={value}
            maxLength={MAX_MESSAGE_LENGTH}
            onChange={(e) => {
              onChange(e.target.value);
              if (e.target.value) onTyping();
            }}
            onKeyDown={onKeyDown}
            aria-label={`Message ${roomLabel || `#${roomId}`}`}
            placeholder={
              connected
                ? `Message ${roomLabel || `#${roomId}`}… (type @ to mention)`
                : 'Reconnecting — messages queue automatically…'
            }
            className={`${fieldClass} px-3.5 py-2.5 text-base sm:text-sm leading-6 flex-1 min-w-0 !min-h-[44px]`}
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send message"
            className="min-h-[44px] min-w-[44px] px-3.5 rounded-xl bg-[var(--accent-600)] text-white font-semibold text-sm inline-flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50 hover:bg-[var(--accent-700)]"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
            {!compact && <span className="hidden sm:inline">Send</span>}
          </button>
        </div>
      )}
      {(value.length > MAX_MESSAGE_LENGTH - 300 || (!compact && value.length > 0)) && (
        <div className="flex items-center justify-between gap-3 text-[11px] text-[var(--ink-muted)] px-1">
          <span className="hidden sm:inline">{compact ? '' : 'Enter to send · Shift+Enter for a new line'}</span>
          {value.length > MAX_MESSAGE_LENGTH - 300 && (
            <span className={`tabular-nums ml-auto ${value.length >= MAX_MESSAGE_LENGTH ? 'text-[var(--danger-ink)] font-semibold' : ''}`}>
              {value.length}/{MAX_MESSAGE_LENGTH}
            </span>
          )}
        </div>
      )}
    </form>
  );
};

/* ------------------------------------------------------------------ */
/* Full page: Community → Study Chat                                    */
/* ------------------------------------------------------------------ */

export const StudyGroupChatPanel: React.FC<{
  styles: any;
  currentUserId: string;
  isAdmin?: boolean;
  mutedReason?: string;
  mentionCandidates?: MentionCandidate[];
  onReportMessage?: (msg: StudyChatMessage) => void;
  onSelectMember?: (userId: string, userName: string) => void;
}> = ({ styles, currentUserId, isAdmin, mutedReason, mentionCandidates = [], onReportMessage, onSelectMember }) => {
  const { cardClass, borderClass, textPrimary, textSecondary } = styles;
  const {
    rooms,
    activeRoomId,
    setActiveRoomId,
    messages,
    pendingMessages,
    presence,
    connectionStatus,
    sendMessage,
    deleteMessage,
    clearUnread,
    unreadByRoom,
    typingNames,
    notifyTyping,
    notice,
    reconnectNow,
  } = useStudyGroupChat();

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [codeDraft, setCodeDraft] = useState('');
  const [showCodeBox, setShowCodeBox] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [showConversation, setShowConversation] = useState(() => rooms.some((room) => room.id === activeRoomId && room.isDirect));
  const previousRoomId = useRef(activeRoomId);
  const [replyTo, setReplyTo] = useState<{ id: string; senderName: string; text: string } | null>(null);
  const draft = drafts[activeRoomId] || '';
  const connected = connectionStatus === 'connected';

  useEffect(() => {
    clearUnread();
  }, [clearUnread, messages.length, activeRoomId]);

  useEffect(() => {
    setReplyTo(null);
    if (activeRoomId && activeRoomId !== previousRoomId.current) setShowConversation(true);
    previousRoomId.current = activeRoomId;
  }, [activeRoomId]);

  const activeRoom = rooms.find((r) => r.id === activeRoomId) || rooms[0];

  const combinedMessages = useMemo(() => [...messages, ...pendingMessages], [messages, pendingMessages]);
  const pendingIds = useMemo(() => new Set(pendingMessages.map((m) => m.id)), [pendingMessages]);

  const submit = () => {
    if (sendMessage(draft, showCodeBox ? codeDraft : undefined, replyTo || undefined)) {
      setDrafts((d) => ({ ...d, [activeRoomId]: '' }));
      setCodeDraft('');
      setShowCodeBox(false);
      setReplyTo(null);
    }
  };

  const peopleList = (
    <ul className="space-y-1.5">
      {presence.map((peer) => (
        <li key={`${peer.userId}-${peer.userName}`} className="flex items-center gap-2 text-xs min-w-0">
          <span className="w-2 h-2 rounded-full bg-[var(--success-ink)] shrink-0" aria-hidden="true" />
          <button
            type="button"
            onClick={() => onSelectMember?.(peer.userId, peer.userName)}
            className={`font-medium truncate hover:text-[var(--accent-600)] hover:underline cursor-pointer ${textPrimary}`}
          >
            {peer.userName}
            {peer.userId === currentUserId && <span className={`font-normal ${textSecondary}`}> (you)</span>}
          </button>
          {peer.userField && <span className={`truncate ${textSecondary}`}>· {peer.userField}</span>}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">
      {/* Room selector */}
      <aside className={`${showConversation ? 'hidden lg:block' : 'block'} lg:col-span-4 ${cardClass} p-3.5 sm:p-5 space-y-3 sm:space-y-4 min-w-0`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className={`text-base font-semibold ${textPrimary}`}>Conversations</h2>
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
              connected ? 'text-[var(--success-ink)]' : 'text-[var(--warning-ink)]'
            }`}
          >
            {connected ? (
              <><Wifi className="w-3.5 h-3.5" aria-hidden="true" /> Live</>
            ) : (
              <><WifiOff className="w-3.5 h-3.5" aria-hidden="true" /> {connectionStatus === 'offline' ? 'Offline' : 'Reconnecting'}</>
            )}
          </span>
        </div>

        <div
          role="group"
          aria-label="Conversations"
          className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto p-1"
        >
          {rooms.map((room) => {
            const active = room.id === activeRoomId;
            const roomUnread = unreadByRoom[room.id] || 0;
            return (
              <button
                key={room.id}
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => {
                  setActiveRoomId(room.id);
                  setShowConversation(true);
                }}
                className={`shrink-0 w-full text-left px-3.5 py-2.5 rounded-xl border min-h-[44px] transition-colors cursor-pointer ${
                  active
                    ? 'border-[var(--accent-600)] bg-[var(--accent-50)] text-[var(--accent-600)]'
                    : `${borderClass} ${textPrimary} hover:bg-[var(--surface-subtle)]`
                }`}
              >
                <div className="flex items-center justify-between gap-2 font-semibold text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    {room.isDirect ? (
                      <UserCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <Hash className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    )}
                    <span className="truncate">{room.name}</span>
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {room.groupId && <span className="text-[11px] font-medium opacity-75">Group</span>}
                    {room.isDirect && <span className="text-[11px] font-medium opacity-75">Direct</span>}
                    {roomUnread > 0 && !active && (
                      <span className="px-1.5 py-0.5 rounded-full bg-[var(--accent-600)] text-white text-[11px] font-bold tabular-nums">
                        {roomUnread}
                      </span>
                    )}
                  </span>
                </div>
                <p className={`hidden lg:block text-xs mt-0.5 line-clamp-1 ${active ? 'opacity-85' : textSecondary}`}>{room.topic}</p>
              </button>
            );
          })}
        </div>

        <div className={`hidden lg:block pt-3 border-t ${borderClass} space-y-2`}>
          <div className="flex items-center justify-between text-xs">
            <span className={`font-semibold uppercase tracking-wider ${textSecondary}`}>Online in room</span>
            <span className={`tabular-nums font-medium ${textPrimary}`}>{presence.length}</span>
          </div>
          {presence.length === 0 ? (
            <p className={`text-xs ${textSecondary}`}>Nobody else is here yet. Say hello and others will see it when they join.</p>
          ) : (
            peopleList
          )}
        </div>
      </aside>

      {/* Live conversation */}
      <section className={`${showConversation ? 'flex' : 'hidden lg:flex'} lg:col-span-8 ${cardClass} flex-col min-w-0 h-[72dvh] min-h-[360px] lg:h-[620px] lg:max-h-[78dvh] overflow-hidden`}>
        <button type="button" className="workspace-tab self-start lg:hidden!" onClick={() => setShowConversation(false)}>
          <ArrowLeft size={16} aria-hidden="true" /> Back to messages
        </button>
        <div className={`px-4 sm:px-5 py-3.5 border-b ${borderClass} flex items-center justify-between gap-3`}>
          <div className="min-w-0">
            <h3 className={`text-base sm:text-lg font-semibold flex items-center gap-2 ${textPrimary}`}>
              {activeRoom?.isDirect ? (
                <UserCheck className="w-4 h-4 text-[var(--accent-600)] shrink-0" aria-hidden="true" />
              ) : (
                <Hash className="w-4 h-4 text-[var(--accent-600)] shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">{activeRoom?.name || 'Study Room'}</span>
            </h3>
            <p className={`text-xs truncate ${textSecondary}`}>{activeRoom?.topic}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowPeople((v) => !v)}
            aria-expanded={showPeople}
            aria-label={`${presence.length} active. Show who is here`}
            className={`lg:pointer-events-none inline-flex items-center gap-1.5 min-h-[40px] px-2.5 -mr-2 rounded-lg text-xs shrink-0 cursor-pointer lg:cursor-default ${textSecondary} hover:bg-[var(--surface-subtle)] lg:hover:bg-transparent`}
          >
            <Users className="w-3.5 h-3.5 text-[var(--accent-600)]" aria-hidden="true" />
            {presence.length} active
            <ChevronDown className={`w-3.5 h-3.5 lg:hidden transition-transform ${showPeople ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        </div>

        {showPeople && (
          <div className={`lg:hidden px-4 py-3 border-b ${borderClass} bg-[var(--surface-subtle)]`}>
            {presence.length === 0 ? <p className={`text-xs ${textSecondary}`}>Nobody else is here yet.</p> : peopleList}
          </div>
        )}

        <ConnectionBanner
          status={connectionStatus}
          notice={notice}
          pendingCount={pendingMessages.length}
          onRetry={reconnectNow}
        />

        <ChatMessages
          messages={combinedMessages}
          pendingIds={pendingIds}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          resetKey={activeRoomId}
          typingNames={typingNames}
          onReply={(m) =>
            setReplyTo({
              id: m.id,
              senderName: m.senderName,
              text: m.text || (m.codeSnippet ? '[Code snippet]' : ''),
            })
          }
          onDelete={(m, asMod) => deleteMessage(m.id, asMod ? 'Removed by moderator' : undefined)}
          onReport={onReportMessage}
          onSelectMember={onSelectMember}
          empty={
            <div className={`h-full flex flex-col items-center justify-center text-center px-4 py-8 ${textSecondary}`}>
              <MessageSquare className="w-8 h-8 mb-2 opacity-40" aria-hidden="true" />
              <p className={`text-sm font-semibold ${textPrimary}`}>No messages in {activeRoom?.name} yet</p>
              <p className="text-xs max-w-sm mt-1">
                Say hello, share what you are working on today, or paste a tricky line of code to study together in real time.
              </p>
            </div>
          }
        />

        <ChatComposer
          roomId={activeRoom?.id || 'general'}
          roomLabel={activeRoom?.name}
          value={draft}
          onChange={(v) => setDrafts((d) => ({ ...d, [activeRoomId]: v }))}
          code={codeDraft}
          onCodeChange={setCodeDraft}
          showCode={showCodeBox}
          onToggleCode={() => setShowCodeBox((v) => !v)}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          mentionCandidates={mentionCandidates}
          onSubmit={submit}
          onTyping={notifyTyping}
          connected={connected}
          mutedReason={mutedReason}
        />
      </section>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Floating widget                                                      */
/* ------------------------------------------------------------------ */

export const StudyGroupChatWidget: React.FC<{
  styles: any;
  currentUserId: string;
  hidden?: boolean;
  mutedReason?: string;
  onOpenFullRoom?: () => void;
}> = ({ styles, currentUserId, hidden, mutedReason, onOpenFullRoom }) => {
  const { borderClass } = styles;
  const {
    rooms,
    activeRoomId,
    setActiveRoomId,
    messages,
    pendingMessages,
    presence,
    connectionStatus,
    sendMessage,
    isWidgetOpen,
    setIsWidgetOpen,
    unreadCount,
    clearUnread,
    typingNames,
    notifyTyping,
    notice,
    reconnectNow,
  } = useStudyGroupChat();

  const [draft, setDraft] = useState('');
  const connected = connectionStatus === 'connected';
  const combinedMessages = useMemo(() => [...messages, ...pendingMessages], [messages, pendingMessages]);
  const pendingIds = useMemo(() => new Set(pendingMessages.map((m) => m.id)), [pendingMessages]);

  useEffect(() => {
    if (isWidgetOpen) clearUnread();
  }, [isWidgetOpen, messages.length, clearUnread]);

  useEffect(() => {
    if (!isWidgetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsWidgetOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isWidgetOpen, setIsWidgetOpen]);

  if (hidden) return null;

  const activeRoom = rooms.find((r) => r.id === activeRoomId) || rooms[0];

  return (
    <div className="chat-widget-pos fixed z-30 flex flex-col items-end">
      {isWidgetOpen && (
        <div
          role="dialog"
          aria-label="Study Group Live Chat"
          className={`mb-3 w-[calc(100vw-2rem)] sm:w-[390px] h-[min(540px,64dvh)] rounded-2xl border ${borderClass} bg-[var(--surface-elevated)] shadow-[var(--shadow-lg)] flex flex-col overflow-hidden`}
        >
          <div className="px-4 py-3 bg-[var(--panel-deep)] text-white flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[var(--spark)] shrink-0" aria-hidden="true" />
              <span className="font-semibold text-sm truncate">Study Group Chat</span>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${
                  connected ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200'
                }`}
              >
                {connected ? `${presence.length} online` : 'Reconnecting'}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {onOpenFullRoom && (
                <button
                  type="button"
                  onClick={() => {
                    setIsWidgetOpen(false);
                    onOpenFullRoom();
                  }}
                  className="px-2.5 min-h-[32px] text-xs rounded-md bg-white/10 hover:bg-white/20 cursor-pointer"
                >
                  Expand
                </button>
              )}
              <button
                type="button"
                aria-label="Minimize chat"
                onClick={() => setIsWidgetOpen(false)}
                className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-md hover:bg-white/15 cursor-pointer"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className={`px-3 py-2 border-b ${borderClass} flex items-center gap-1.5 overflow-x-auto no-scrollbar`}>
            {rooms.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setActiveRoomId(r.id)}
                aria-pressed={r.id === activeRoomId}
                className={`shrink-0 px-3 min-h-[32px] rounded-full text-xs font-medium cursor-pointer ${
                  r.id === activeRoomId
                    ? 'bg-[var(--accent-600)] text-white'
                    : 'bg-[var(--surface-subtle)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                }`}
              >
                {r.isDirect ? r.name : `#${r.groupId ? r.name : r.id}`}
              </button>
            ))}
          </div>

          <ConnectionBanner
            status={connectionStatus}
            notice={notice}
            pendingCount={pendingMessages.length}
            onRetry={reconnectNow}
          />

          <ChatMessages
            compact
            messages={combinedMessages}
            pendingIds={pendingIds}
            currentUserId={currentUserId}
            resetKey={`${activeRoomId}-${isWidgetOpen}`}
            typingNames={typingNames}
            empty={
              <p className="text-xs text-center py-8 text-[var(--ink-secondary)]">
                Welcome to <strong>{activeRoom?.name}</strong>. Say hello to peers studying right now!
              </p>
            }
          />

          <ChatComposer
            compact
            roomId={activeRoomId}
            roomLabel={activeRoom?.name}
            value={draft}
            onChange={setDraft}
            onSubmit={() => {
              if (sendMessage(draft)) setDraft('');
            }}
            onTyping={notifyTyping}
            connected={connected}
            mutedReason={mutedReason}
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsWidgetOpen((v) => !v)}
        aria-label={isWidgetOpen ? 'Close study group chat' : unreadCount > 0 ? `Open study group chat, ${unreadCount} unread` : 'Open study group chat'}
        aria-expanded={isWidgetOpen}
        className="relative min-h-[46px] px-4 rounded-full bg-[var(--panel-deep)] text-white shadow-[var(--shadow-lg)] border border-white/15 flex items-center gap-2 text-sm font-medium cursor-pointer hover:opacity-95"
      >
        {isWidgetOpen ? <X className="w-4 h-4" /> : <MessageSquare className="w-4 h-4 text-[var(--spark)]" />}
        <span className="hidden sm:inline">{isWidgetOpen ? 'Close Chat' : 'Study Chat'}</span>
        {!isWidgetOpen && unreadCount > 0 && (
          <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-[var(--spark)] text-white text-[11px] font-bold tabular-nums">
            {unreadCount}
          </span>
        )}
      </button>
    </div>
  );
};
