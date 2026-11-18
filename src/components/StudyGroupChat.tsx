import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Code2,
  Hash,
  MessageSquare,
  Send,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { fetchChatHistory, fetchChatRooms, getChatWsUrl } from '../lib/aiClient';
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
}

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

      ws.onopen = () => {
        if (cancelled) {
          ws.close();
          return;
        }
        attempt = 0;
        setConnectionStatus('connected');
        const currentUser = userRef.current.user;
        const currentProfile = userRef.current.profile;
        ws.send(
          JSON.stringify({
            type: 'chat:join',
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
    (roomId: string) => {
      setActiveRoomIdState(roomId);
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'chat:join',
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

const formatTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

export const StudyGroupChatPanel: React.FC<{
  styles: any;
  currentUserId: string;
}> = ({ styles, currentUserId }) => {
  const { cardClass, borderClass, textPrimary, textSecondary, subtleBgClass, inputClass, btnPrimary } = styles;
  const { rooms, activeRoomId, setActiveRoomId, messages, presence, connectionStatus, sendMessage, clearUnread } =
    useStudyGroupChat();
  const [draft, setDraft] = useState('');
  const [codeDraft, setCodeDraft] = useState('');
  const [showCodeBox, setShowCodeBox] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    clearUnread();
  }, [clearUnread, messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, activeRoomId]);

  const activeRoom = rooms.find((r) => r.id === activeRoomId) || rooms[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sendMessage(draft, showCodeBox ? codeDraft : undefined)) {
      setDraft('');
      setCodeDraft('');
      setShowCodeBox(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Room selector */}
      <aside className={`lg:col-span-4 ${cardClass} p-4 sm:p-5 space-y-4 min-w-0`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className={`text-base font-semibold ${textPrimary}`}>Study Rooms</h2>
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
              connectionStatus === 'connected' ? 'text-[var(--success-ink)]' : 'text-[var(--warning-ink)]'
            }`}
          >
            {connectionStatus === 'connected' ? (
              <><Wifi className="w-3.5 h-3.5" /> Live</>
            ) : (
              <><WifiOff className="w-3.5 h-3.5" /> {connectionStatus === 'offline' ? 'Offline' : 'Connecting'}</>
            )}
          </span>
        </div>

        <div className="flex lg:flex-col gap-2 overflow-x-auto pb-1 lg:pb-0">
          {rooms.map((room) => {
            const active = room.id === activeRoomId;
            return (
              <button
                key={room.id}
                type="button"
                onClick={() => setActiveRoomId(room.id)}
                className={`shrink-0 lg:w-full text-left px-3.5 py-2.5 rounded-xl border min-h-[44px] transition-colors cursor-pointer ${
                  active
                    ? 'border-[var(--accent-600)] bg-[var(--accent-50)] text-[var(--accent-600)]'
                    : `${borderClass} ${textPrimary} hover:bg-[var(--surface-subtle)]`
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <Hash className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{room.name}</span>
                </div>
                <p className={`hidden lg:block text-xs mt-0.5 line-clamp-1 ${active ? 'opacity-85' : textSecondary}`}>
                  {room.topic}
                </p>
              </button>
            );
          })}
        </div>

        <div className={`pt-3 border-t ${borderClass} space-y-2`}>
          <div className="flex items-center justify-between text-xs">
            <span className={`font-semibold uppercase tracking-wider ${textSecondary}`}>Online in room</span>
            <span className={`tabular-nums font-medium ${textPrimary}`}>{presence.length}</span>
          </div>
          {presence.length === 0 ? (
            <p className={`text-xs ${textSecondary}`}>Waiting for members to connect to this room.</p>
          ) : (
            <ul className="space-y-1.5">
              {presence.map((peer) => (
                <li key={`${peer.userId}-${peer.userName}`} className="flex items-center gap-2 text-xs min-w-0">
                  <span className="w-2 h-2 rounded-full bg-[var(--success-ink)] shrink-0" aria-hidden="true" />
                  <span className={`font-medium truncate ${textPrimary}`}>{peer.userName}</span>
                  {peer.userField && <span className={`truncate ${textSecondary}`}>· {peer.userField}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Live conversation */}
      <section className={`lg:col-span-8 ${cardClass} flex flex-col min-w-0 h-[560px] max-h-[75vh]`}>
        <div className={`px-5 py-4 border-b ${borderClass} flex flex-wrap items-center justify-between gap-2`}>
          <div className="min-w-0">
            <h3 className={`text-lg font-semibold flex items-center gap-2 ${textPrimary}`}>
              <Hash className="w-4 h-4 text-[var(--accent-600)] shrink-0" />
              <span className="truncate">{activeRoom?.name || 'Study Room'}</span>
            </h3>
            <p className={`text-xs truncate ${textSecondary}`}>{activeRoom?.topic}</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-xs ${textSecondary}`}>
            <Users className="w-3.5 h-3.5 text-[var(--accent-600)]" />
            {presence.length} active
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
          {messages.length === 0 ? (
            <div className={`h-full flex flex-col items-center justify-center text-center px-4 py-8 ${textSecondary}`}>
              <MessageSquare className="w-8 h-8 mb-2 opacity-40" />
              <p className={`text-sm font-semibold ${textPrimary}`}>No messages in {activeRoom?.name} yet</p>
              <p className="text-xs max-w-sm mt-1">
                Say hello, share what you are working on today, or paste a tricky line of code to study together in real time.
              </p>
            </div>
          ) : (
            messages.map((m) => {
              const isMine = m.senderId === currentUserId;
              return (
                <div key={m.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-baseline gap-2 mb-1 px-1">
                    <span className={`text-xs font-semibold ${textPrimary}`}>{isMine ? 'You' : m.senderName}</span>
                    {m.senderField && <span className={`text-[11px] ${textSecondary}`}>{m.senderField}</span>}
                    <span className={`text-[11px] tabular-nums ${textSecondary}`}>{formatTime(m.createdAt)}</span>
                  </div>
                  <div
                    className={`max-w-[90%] sm:max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed space-y-2 border ${
                      isMine
                        ? 'bg-[var(--accent-600)] text-white border-transparent'
                        : `${subtleBgClass} ${borderClass} ${textPrimary}`
                    }`}
                  >
                    {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                    {m.codeSnippet && (
                      <pre
                        className={`p-2.5 rounded-lg text-xs font-mono overflow-x-auto ${
                          isMine ? 'bg-black/25 text-white' : 'bg-[var(--surface-elevated)] border border-[var(--border-hairline)]'
                        }`}
                      >
                        {m.codeSnippet}
                      </pre>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSubmit} className={`p-3.5 sm:p-4 border-t ${borderClass} space-y-2.5`}>
          {showCodeBox && (
            <textarea
              rows={3}
              spellCheck={false}
              value={codeDraft}
              onChange={(e) => setCodeDraft(e.target.value)}
              placeholder="Paste optional code snippet..."
              className={`${inputClass} font-mono text-xs`}
            />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCodeBox((v) => !v)}
              aria-label="Attach code snippet"
              aria-pressed={showCodeBox}
              className={`min-h-[44px] min-w-[44px] px-3 rounded-xl border ${borderClass} flex items-center justify-center cursor-pointer ${
                showCodeBox ? 'bg-[var(--accent-50)] text-[var(--accent-600)] border-[var(--accent-600)]' : `${textSecondary} hover:bg-[var(--surface-subtle)]`
              }`}
              title="Attach code snippet"
            >
              <Code2 className="w-4 h-4" />
            </button>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                connectionStatus === 'connected'
                  ? `Message #${activeRoom?.id || 'general'}…`
                  : 'Reconnecting to live study chat…'
              }
              className={`${inputClass} min-h-[44px] flex-1 min-w-0`}
            />
            <button
              type="submit"
              disabled={connectionStatus !== 'connected' || (!draft.trim() && !codeDraft.trim())}
              className={`${btnPrimary} min-h-[44px] px-4 shrink-0 disabled:opacity-50`}
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

export const StudyGroupChatWidget: React.FC<{
  styles: any;
  currentUserId: string;
  hidden?: boolean;
  onOpenFullRoom?: () => void;
}> = ({ styles, currentUserId, hidden, onOpenFullRoom }) => {
  const { borderClass, textPrimary, textSecondary, subtleBgClass, inputClass } = styles;
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
  } = useStudyGroupChat();

  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isWidgetOpen) {
      clearUnread();
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [isWidgetOpen, messages.length, clearUnread]);

  if (hidden) return null;

  const activeRoom = rooms.find((r) => r.id === activeRoomId) || rooms[0];

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (sendMessage(draft)) setDraft('');
  };

  return (
    <div className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-30 flex flex-col items-end">
      {isWidgetOpen && (
        <div
          role="dialog"
          aria-label="Study Group Live Chat"
          className={`mb-3 w-[calc(100vw-2rem)] sm:w-[390px] max-h-[70vh] rounded-2xl border ${borderClass} bg-[var(--surface-elevated)] shadow-[var(--shadow-lg)] flex flex-col overflow-hidden`}
        >
          <div className={`px-4 py-3 border-b ${borderClass} bg-[var(--panel-deep)] text-white flex items-center justify-between gap-2`}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[var(--spark)] shrink-0" />
                <span className="font-semibold text-sm truncate">Study Group Chat</span>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full ${
                    connectionStatus === 'connected' ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200'
                  }`}
                >
                  {connectionStatus === 'connected' ? `${presence.length} online` : 'Connecting'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {onOpenFullRoom && (
                <button
                  type="button"
                  onClick={() => {
                    setIsWidgetOpen(false);
                    onOpenFullRoom();
                  }}
                  className="px-2 py-1 text-xs rounded-md bg-white/10 hover:bg-white/20 cursor-pointer"
                >
                  Expand
                </button>
              )}
              <button
                type="button"
                aria-label="Minimize chat"
                onClick={() => setIsWidgetOpen(false)}
                className="p-1.5 rounded-md hover:bg-white/15 cursor-pointer"
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
                className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer ${
                  r.id === activeRoomId
                    ? 'bg-[var(--accent-600)] text-white'
                    : `${subtleBgClass} ${textSecondary} hover:${textPrimary}`
                }`}
              >
                #{r.id}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-[220px] max-h-[340px] overflow-y-auto p-3.5 space-y-2.5">
            {messages.length === 0 ? (
              <p className={`text-xs text-center py-8 ${textSecondary}`}>
                Welcome to <strong>{activeRoom?.name}</strong>. Say hello to peers studying right now!
              </p>
            ) : (
              messages.map((m) => {
                const mine = m.senderId === currentUserId;
                return (
                  <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                    <span className={`text-[11px] px-1 mb-0.5 ${textSecondary}`}>
                      <strong className={textPrimary}>{mine ? 'You' : m.senderName}</strong> · {formatTime(m.createdAt)}
                    </span>
                    <div
                      className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                        mine ? 'bg-[var(--accent-600)] text-white' : `${subtleBgClass} border ${borderClass} ${textPrimary}`
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                      {m.codeSnippet && (
                        <pre className="mt-1.5 p-2 rounded bg-black/20 font-mono text-[11px] overflow-x-auto">{m.codeSnippet}</pre>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSend} className={`p-2.5 border-t ${borderClass} flex items-center gap-2`}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Message #${activeRoomId}…`}
              className={`${inputClass} min-h-[40px] text-xs flex-1 min-w-0`}
            />
            <button
              type="submit"
              disabled={connectionStatus !== 'connected' || !draft.trim()}
              aria-label="Send chat message"
              className="min-h-[40px] min-w-[40px] rounded-full bg-[var(--accent-600)] text-white flex items-center justify-center cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsWidgetOpen((v) => !v)}
        aria-label={isWidgetOpen ? 'Close study group chat' : 'Open study group chat'}
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
