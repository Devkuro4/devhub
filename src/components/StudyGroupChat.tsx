import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Hash,
  MessageSquare,
  RefreshCw,
  Send,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { fetchChatHistory, fetchChatRooms, getAccessToken, getChatWsUrl } from '../lib/aiClient';
import type { OnboardingProfile, StudyChatMessage, StudyChatRoom, UserSession } from '../types';

export interface OnlinePeer {
  userId: string;
  userName: string;
  userField: string;
}

interface StudyChatContextValue {
  rooms: StudyChatRoom[];
  activeRoomId: string;
  setActiveRoomId: (roomId: string) => void;
  messages: StudyChatMessage[];
  presence: OnlinePeer[];
  connectionStatus: 'connecting' | 'connected' | 'reconnecting' | 'offline';
  sendMessage: (text: string, codeSnippet?: string) => boolean;
  isWidgetOpen: boolean;
  setIsWidgetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  unreadCount: number;
  clearUnread: () => void;
  /** Names of people currently typing in the active room (never includes you) */
  typingNames: string[];
  notifyTyping: () => void;
  /** Short-lived message such as "slow down" */
  notice: string | null;
  reconnectNow: () => void;
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
  children: React.ReactNode;
}> = ({ user, profile, children }) => {
  const [rooms, setRooms] = useState<StudyChatRoom[]>(DEFAULT_ROOMS);
  const [activeRoomId, setActiveRoomIdState] = useState<string>('general');
  const [messagesByRoom, setMessagesByRoom] = useState<Record<string, StudyChatMessage[]>>({});
  const [presenceByRoom, setPresenceByRoom] = useState<Record<string, OnlinePeer[]>>({});
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'offline'>('connecting');
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
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
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mergeMessages = useCallback((roomId: string, incoming: StudyChatMessage[]) => {
    setMessagesByRoom((prev) => {
      const existing = prev[roomId] || [];
      const seen = new Set(existing.map((m) => m.id));
      const next = [...existing];
      for (const m of incoming) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          next.push(m);
        }
      }
      return { ...prev, [roomId]: next.slice(-200) };
    });
  }, []);

  // Load initial HTTP room list & history gracefully
  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetchChatRooms()
      .then((res) => {
        if (alive && Array.isArray(res.rooms) && res.rooms.length > 0) {
          setRooms(res.rooms);
        }
      })
      .catch(() => {});
    fetchChatHistory(activeRoomId)
      .then((res) => {
        if (alive && Array.isArray(res.history)) {
          setMessagesByRoom((prev) => ({ ...prev, [activeRoomId]: res.history }));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user, activeRoomId]);

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
        // The server learns who this is from the login token, not from the fields below.
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
      };

      ws.onmessage = (event) => {
        let payload: any;
        try {
          payload = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (payload.type === 'chat:init') {
          if (Array.isArray(payload.rooms) && payload.rooms.length > 0) {
            setRooms(payload.rooms);
          }
          if (payload.roomId && Array.isArray(payload.history)) {
            setMessagesByRoom((prev) => ({ ...prev, [payload.roomId]: payload.history }));
          }
          if (payload.roomId && Array.isArray(payload.presence)) {
            setPresenceByRoom((prev) => ({ ...prev, [payload.roomId]: payload.presence }));
          }
        } else if (payload.type === 'chat:history') {
          if (payload.roomId && Array.isArray(payload.history)) {
            setMessagesByRoom((prev) => ({ ...prev, [payload.roomId]: payload.history }));
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
          mergeMessages(msg.roomId || payload.roomId || activeRoomRef.current, [msg]);
          const myId = userRef.current.user?.id || userRef.current.user?.email || 'member';
          if (!widgetOpenRef.current && msg.senderId !== myId) {
            setUnreadCount((c) => Math.min(99, c + 1));
          }
          // Someone who just sent a message is no longer "typing"
          setTypingPeers((prev) => prev.filter((p) => p.userId !== msg.senderId));
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
        }
      };

      ws.onerror = () => {
        // Error handler followed by close handler
      };

      ws.onclose = () => {
        if (cancelled) return;
        wsRef.current = null;
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          setConnectionStatus('offline');
          return;
        }
        attempt += 1;
        setConnectionStatus('reconnecting');
        const delay = Math.min(10_000, 1000 * Math.pow(1.6, Math.min(attempt, 5)));
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
  }, [user?.id, user?.email, mergeMessages]);

  const setActiveRoomId = useCallback(
    async (roomId: string) => {
      setActiveRoomIdState(roomId);
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

  const sendMessage = useCallback(
    (text: string, codeSnippet?: string) => {
      const cleanText = text.trim();
      const cleanCode = (codeSnippet || '').trim();
      if (!cleanText && !cleanCode) return false;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;

      const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      ws.send(
        JSON.stringify({
          type: 'chat:send',
          id: msgId,
          roomId: activeRoomRef.current,
          senderId: user?.id || user?.email || 'member',
          senderName: user?.name || profile.fullName || 'Member',
          senderField: profile.field || '',
          text: cleanText,
          codeSnippet: cleanCode || undefined,
        })
      );
      return true;
    },
    [user, profile.fullName, profile.field]
  );

  const clearUnread = useCallback(() => setUnreadCount(0), []);

  // "Someone is typing…" expires on its own if they stop
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

  const value = useMemo<StudyChatContextValue>(
    () => ({
      rooms,
      activeRoomId,
      setActiveRoomId,
      messages: messagesByRoom[activeRoomId] || [],
      presence: presenceByRoom[activeRoomId] || [],
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
    }),
    [
      rooms,
      activeRoomId,
      setActiveRoomId,
      messagesByRoom,
      presenceByRoom,
      connectionStatus,
      sendMessage,
      isWidgetOpen,
      unreadCount,
      clearUnread,
      typingNames,
      notifyTyping,
      notice,
      reconnectNow,
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

/** Plain text with http(s) links made clickable. Nothing else is interpreted. */
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
    } catch {
      /* clipboard blocked: nothing to do */
    }
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
  onRetry: () => void;
}> = ({ status, notice, onRetry }) => {
  if (status === 'connected' && !notice) return null;
  const text =
    status === 'offline'
      ? 'You are offline. Your message stays in the box until you are back.'
      : status !== 'connected'
        ? 'Reconnecting to study chat…'
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
  currentUserId: string;
  resetKey: string;
  typingNames: string[];
  empty: React.ReactNode;
  compact?: boolean;
}> = ({ messages, currentUserId, resetKey, typingNames, empty, compact }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const lastCountRef = useRef(messages.length);
  const [unseen, setUnseen] = useState(0);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // New room: start at the latest message
  useEffect(() => {
    stickRef.current = true;
    lastCountRef.current = messages.length;
    setUnseen(0);
    requestAnimationFrame(() => scrollToBottom());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // New messages: follow along only if you are already at the bottom (or you sent it).
  // Otherwise leave your scroll position alone and offer a jump button.
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
              return (
                <React.Fragment key={m.id}>
                  {newDay && (
                    <div role="separator" className={`flex items-center gap-3 ${idx === 0 ? 'mb-3' : 'my-4'}`}>
                      <span className="h-px flex-1 bg-[var(--border-hairline)]" />
                      <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-muted)]">{dayLabel(m.createdAt)}</span>
                      <span className="h-px flex-1 bg-[var(--border-hairline)]" />
                    </div>
                  )}
                  <div className={`flex gap-2.5 ${mine ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-1' : idx === 0 || newDay ? '' : 'mt-4'}`}>
                    {!mine && !compact && (
                      <div className="w-8 shrink-0">
                        {!grouped && (
                          <span
                            aria-hidden="true"
                            className="w-8 h-8 rounded-full bg-[var(--accent-100)] text-[var(--accent-700)] text-xs font-semibold flex items-center justify-center"
                          >
                            {initialsOf(m.senderName)}
                          </span>
                        )}
                      </div>
                    )}
                    <div className={`min-w-0 max-w-[85%] sm:max-w-[78%] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                      {!grouped && (
                        <div className="flex items-baseline gap-2 mb-1 px-1 max-w-full">
                          <span className="text-xs font-semibold text-[var(--ink-primary)] truncate">{mine ? 'You' : m.senderName}</span>
                          {m.senderField && !compact && !mine && (
                            <span className="text-[11px] text-[var(--ink-muted)] truncate hidden sm:inline">{m.senderField}</span>
                          )}
                          <span className="text-[11px] tabular-nums text-[var(--ink-muted)] shrink-0">{formatTime(m.createdAt)}</span>
                        </div>
                      )}
                      <div
                        title={formatTime(m.createdAt)}
                        className={`rounded-2xl px-3.5 py-2 leading-relaxed space-y-2 border min-w-0 max-w-full ${compact ? 'text-xs' : 'text-sm'} ${
                          mine
                            ? 'bg-[var(--accent-600)] text-white border-transparent'
                            : 'bg-[var(--surface-subtle)] border-[var(--border-hairline)] text-[var(--ink-primary)]'
                        }`}
                      >
                        {m.text && (
                          <p className="whitespace-pre-wrap break-words">
                            <LinkifiedText text={m.text} mine={mine} />
                          </p>
                        )}
                        {m.codeSnippet && <CodeBlock code={m.codeSnippet} mine={mine} compact={compact} />}
                      </div>
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
  value: string;
  onChange: (v: string) => void;
  code?: string;
  onCodeChange?: (v: string) => void;
  showCode?: boolean;
  onToggleCode?: () => void;
  onSubmit: () => void;
  onTyping: () => void;
  connected: boolean;
  compact?: boolean;
}> = ({ roomId, value, onChange, code = '', onCodeChange, showCode, onToggleCode, onSubmit, onTyping, connected, compact }) => {
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Grow with the text, up to about six lines
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [value]);

  const canSend = connected && (value.trim().length > 0 || (showCode && code.trim().length > 0));

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    // On phones Enter is a new line (the Send button sends). On desktop Enter sends.
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
      className={`border-t border-[var(--border-hairline)] ${compact ? 'p-2.5' : 'p-3 sm:p-4'} space-y-2`}
    >
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
          aria-label={`Message #${roomId}`}
          placeholder={connected ? `Message #${roomId}…` : 'Reconnecting…'}
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
}> = ({ styles, currentUserId }) => {
  const { cardClass, borderClass, textPrimary, textSecondary } = styles;
  const {
    rooms,
    activeRoomId,
    setActiveRoomId,
    messages,
    presence,
    connectionStatus,
    sendMessage,
    clearUnread,
    typingNames,
    notifyTyping,
    notice,
    reconnectNow,
  } = useStudyGroupChat();

  // One draft per room so switching rooms never loses what you were writing
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [codeDraft, setCodeDraft] = useState('');
  const [showCodeBox, setShowCodeBox] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const draft = drafts[activeRoomId] || '';
  const connected = connectionStatus === 'connected';

  useEffect(() => {
    clearUnread();
  }, [clearUnread, messages.length]);

  const activeRoom = rooms.find((r) => r.id === activeRoomId) || rooms[0];

  const submit = () => {
    if (sendMessage(draft, showCodeBox ? codeDraft : undefined)) {
      setDrafts((d) => ({ ...d, [activeRoomId]: '' }));
      setCodeDraft('');
      setShowCodeBox(false);
    }
  };

  const peopleList = (
    <ul className="space-y-1.5">
      {presence.map((peer) => (
        <li key={`${peer.userId}-${peer.userName}`} className="flex items-center gap-2 text-xs min-w-0">
          <span className="w-2 h-2 rounded-full bg-[var(--success-ink)] shrink-0" aria-hidden="true" />
          <span className={`font-medium truncate ${textPrimary}`}>
            {peer.userName}
            {peer.userId === currentUserId && <span className={`font-normal ${textSecondary}`}> (you)</span>}
          </span>
          {peer.userField && <span className={`truncate ${textSecondary}`}>· {peer.userField}</span>}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">
      {/* Room selector */}
      <aside className={`lg:col-span-4 ${cardClass} p-3.5 sm:p-5 space-y-3 sm:space-y-4 min-w-0`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className={`text-base font-semibold ${textPrimary}`}>Study Rooms</h2>
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
              connected ? 'text-[var(--success-ink)]' : 'text-[var(--warning-ink)]'
            }`}
          >
            {connected ? (
              <><Wifi className="w-3.5 h-3.5" aria-hidden="true" /> Live</>
            ) : (
              <><WifiOff className="w-3.5 h-3.5" aria-hidden="true" /> {connectionStatus === 'offline' ? 'Offline' : 'Connecting'}</>
            )}
          </span>
        </div>

        <div
          role="tablist"
          aria-label="Study rooms"
          className="flex lg:flex-col gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1 lg:pb-0 lg:mx-0 lg:px-0 snap-x"
        >
          {rooms.map((room) => {
            const active = room.id === activeRoomId;
            return (
              <button
                key={room.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveRoomId(room.id)}
                className={`shrink-0 snap-start lg:w-full text-left px-3.5 py-2.5 rounded-xl border min-h-[44px] transition-colors cursor-pointer ${
                  active
                    ? 'border-[var(--accent-600)] bg-[var(--accent-50)] text-[var(--accent-600)]'
                    : `${borderClass} ${textPrimary} hover:bg-[var(--surface-subtle)]`
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-sm whitespace-nowrap lg:whitespace-normal">
                  <Hash className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="lg:truncate">{room.name}</span>
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
      <section className={`lg:col-span-8 ${cardClass} flex flex-col min-w-0 h-[72dvh] min-h-[440px] lg:h-[620px] lg:max-h-[78dvh] overflow-hidden`}>
        <div className={`px-4 sm:px-5 py-3.5 border-b ${borderClass} flex items-center justify-between gap-3`}>
          <div className="min-w-0">
            <h3 className={`text-base sm:text-lg font-semibold flex items-center gap-2 ${textPrimary}`}>
              <Hash className="w-4 h-4 text-[var(--accent-600)] shrink-0" aria-hidden="true" />
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

        <ConnectionBanner status={connectionStatus} notice={notice} onRetry={reconnectNow} />

        <ChatMessages
          messages={messages}
          currentUserId={currentUserId}
          resetKey={activeRoomId}
          typingNames={typingNames}
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
          value={draft}
          onChange={(v) => setDrafts((d) => ({ ...d, [activeRoomId]: v }))}
          code={codeDraft}
          onCodeChange={setCodeDraft}
          showCode={showCodeBox}
          onToggleCode={() => setShowCodeBox((v) => !v)}
          onSubmit={submit}
          onTyping={notifyTyping}
          connected={connected}
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
  onOpenFullRoom?: () => void;
}> = ({ styles, currentUserId, hidden, onOpenFullRoom }) => {
  const { borderClass } = styles;
  const {
    rooms,
    activeRoomId,
    setActiveRoomId,
    messages,
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
                {connected ? `${presence.length} online` : 'Connecting'}
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
                #{r.id}
              </button>
            ))}
          </div>

          <ConnectionBanner status={connectionStatus} notice={notice} onRetry={reconnectNow} />

          <ChatMessages
            compact
            messages={messages}
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
            value={draft}
            onChange={setDraft}
            onSubmit={() => {
              if (sendMessage(draft)) setDraft('');
            }}
            onTyping={notifyTyping}
            connected={connected}
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
