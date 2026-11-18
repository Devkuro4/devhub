import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Bot,
  ChevronDown,
  ChevronRight,
  Compass,
  ExternalLink,
  Globe,
  Loader2,
  MessageSquare,
  PanelLeft,
  Plus,
  RotateCcw,
  Save,
  Send,
  Settings,
  Trash2,
  User,
} from 'lucide-react';
import { PageHeader } from './ui';
import { ProfileMilestonesCard } from './MilestoneBadges';
import { requestMentorChat, type GroundedSource } from '../lib/aiClient';
import { HELP_LEVELS } from '../lib/independence';
import { MAX_CHATS, MAX_MESSAGES_PER_CHAT, chatTitle, groupChats, normalizeStore } from '../lib/mentorChats';
import type {
  AiHelpEvent,
  HelpLevel,
  MentorChatMessage,
  MentorChatStore,
  CodeSubmission,
  CourseItem,
  MilestoneSummary,
  OnboardingProfile,
  QuizAttempt,
  RoadmapItem,
  RoadmapTopicProgress,
  WeeklyProjectItem,
} from '../types';

const QUICK_PROMPTS = [
  { label: 'Explain a concept', prompt: 'Explain my current topic simply with a beginner-friendly mental model.' },
  { label: 'Give me a hint', prompt: 'Give me one small hint on my current exercise or weekly project without spoiling the whole answer.' },
  { label: 'Quiz me', prompt: 'Ask me one quick question to check if I understand my current topic.' },
  { label: 'Help me practise', prompt: 'Give me a 15-minute beginner practice exercise matched to my level.' },
  { label: 'Review my code', prompt: 'I want to paste a few lines of my code—can you review what it does and suggest one small improvement?' },
  { label: 'Help me debug', prompt: 'Help me debug a piece of code—ask me what error I see and guide me step by step.' },
  { label: 'I feel stuck or discouraged', prompt: 'I’m feeling stuck and a bit discouraged. Can you help me get moving again with one small, doable step?' },
  { label: 'What should I learn next?', prompt: 'Looking at my roadmap, course, and weak spots, what is the clearest next step for me today?' },
];

// Renders a markdown table (| a | b |) as a real table so step-by-step traces are easy to read.
const renderTable = (lines: string[], key: string, borderClass: string, subtleBgClass: string) => {
  const cells = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const rows = lines.filter((l) => !/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l)).map(cells);
  if (!rows.length) return null;
  const [head, ...body] = rows;
  return (
    <div key={key} className={`rounded-lg border ${borderClass} overflow-x-auto`}>
      <table className="w-full text-xs">
        <thead className={subtleBgClass}>
          <tr>{head.map((h, i) => <th key={i} className="text-left font-semibold px-3 py-1.5">{h}</th>)}</tr>
        </thead>
        <tbody>
          {body.map((r, ri) => (
            <tr key={ri} className={`border-t ${borderClass}`}>
              {r.map((c, ci) => <td key={ci} className="px-3 py-1.5 font-mono">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Splits plain text into paragraphs and markdown tables.
const renderTextBlocks = (text: string, keyPrefix: string, borderClass: string, subtleBgClass: string) => {
  const lines = text.trim().split('\n');
  const blocks: React.ReactNode[] = [];
  let buf: string[] = [];
  let table: string[] = [];
  const flushText = () => {
    if (buf.length) blocks.push(<div key={`${keyPrefix}-t${blocks.length}`} className="whitespace-pre-wrap">{buf.join('\n').trim()}</div>);
    buf = [];
  };
  const flushTable = () => {
    if (table.length) {
      const t = renderTable(table, `${keyPrefix}-tb${blocks.length}`, borderClass, subtleBgClass);
      if (t) blocks.push(t);
    }
    table = [];
  };
  lines.forEach((line) => {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushText();
      table.push(line);
    } else {
      flushTable();
      buf.push(line);
    }
  });
  flushTable();
  flushText();
  return blocks;
};

const FormattedMessageText = ({ text, isUser, subtleBgClass, borderClass, textPrimary }: {
  text: string;
  isUser: boolean;
  subtleBgClass: string;
  borderClass: string;
  textPrimary: string;
}) => {
  if (isUser) {
    return <div className="whitespace-pre-wrap">{text}</div>;
  }

  const segments = text.split(/(```[\s\S]*?```)/g);
  return (
    <div className="space-y-2.5">
      {segments.map((seg, idx) => {
        if (!seg) return null;
        if (seg.startsWith('```') && seg.endsWith('```')) {
          const inner = seg.slice(3, -3);
          const firstNewline = inner.indexOf('\n');
          const lang = firstNewline > 0 && firstNewline < 20 ? inner.slice(0, firstNewline).trim() : '';
          const codeBody = firstNewline > 0 && firstNewline < 20 ? inner.slice(firstNewline + 1) : inner;
          return (
            <div key={idx} className={`rounded-lg border ${borderClass} ${subtleBgClass} overflow-hidden`}>
              {lang && (
                <div className={`px-3 py-1 border-b ${borderClass} text-[10px] font-mono uppercase tracking-wide opacity-70`}>
                  {lang}
                </div>
              )}
              <pre className={`p-3 font-mono text-xs overflow-x-auto ${textPrimary}`}>
                {codeBody.trim()}
              </pre>
            </div>
          );
        }
        return <React.Fragment key={idx}>{renderTextBlocks(seg, `s${idx}`, borderClass, subtleBgClass)}</React.Fragment>;
      })}
    </div>
  );
};

export const MentorSection = ({
  profile,
  user,
  courses,
  selectedRoadmap,
  roadmapProgress,
  codeSubmissions,
  quizAttempts,
  weeklyProjects,
  initialPrompt,
  onClearInitialPrompt,
  onLogHelp,
  chat,
  onChatChange,
  styles,
}: {
  profile: OnboardingProfile;
  user: { id?: string; name: string; email: string };
  courses: CourseItem[];
  selectedRoadmap: RoadmapItem;
  roadmapProgress: Record<string, RoadmapTopicProgress>;
  codeSubmissions: CodeSubmission[];
  quizAttempts: QuizAttempt[];
  weeklyProjects: WeeklyProjectItem[];
  initialPrompt?: string;
  onClearInitialPrompt?: () => void;
  onLogHelp?: (event: AiHelpEvent) => void;
  chat: MentorChatStore;
  onChatChange: React.Dispatch<React.SetStateAction<MentorChatStore>>;
  styles: {
    cardClass: string;
    borderClass: string;
    subtleBgClass: string;
    textPrimary: string;
    textSecondary: string;
    inputClass: string;
    btnPrimary: string;
    btnSecondary: string;
    darkMode: boolean;
  };
}) => {
  const { cardClass, borderClass, subtleBgClass, textPrimary, textSecondary } = styles;

  const activeCourse = courses[0];
  const activeProject = weeklyProjects[0];
  const weakTopics = Array.from(
    new Set([
      ...(quizAttempts[0]?.weakTopics || []),
      ...selectedRoadmap.topics
        .filter((t) => ['Needs Revision', 'Struggling'].includes(roadmapProgress[t.id]?.status || '') || roadmapProgress[t.id]?.struggling)
        .map((t) => t.name),
    ])
  );
  const currentTopic = activeCourse?.currentTopic || selectedRoadmap.topics[0]?.name || 'Foundations';

  // Chats are saved by the app (mentorChat in App.tsx): they survive refreshes and sync across devices.
  // activeId === null means a fresh chat that is created when the first message is sent.
  const store = normalizeStore(chat);
  const activeChat = store.chats.find((c) => c.id === store.activeId) || null;
  const messages = activeChat?.messages ?? [];
  const groups = groupChats(store.chats);

  const [input, setInput] = useState('');
  const [useWebSearch, setUseWebSearch] = useState(true);
  // Hint ladder: the member chooses how much help they want. Starting small builds independence.
  const [helpLevel, setHelpLevel] = useState<HelpLevel>(2);
  const [busyChatId, setBusyChatId] = useState<string | null>(null);
  // Connection errors are shown but never saved or sent to the AI as if the mentor had said them.
  const [error, setError] = useState<{ chatId: string; text: string } | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const busy = busyChatId !== null;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const update = (fn: (s: MentorChatStore) => MentorChatStore) => onChatChange((prev) => fn(normalizeStore(prev)));

  // Adds a message to a chat. A new chat is created (and opened) when the first message arrives.
  const addMessage = (chatId: string, msg: MentorChatMessage, opts?: { createWithTitle?: string }) =>
    update((s) => {
      const now = new Date().toISOString();
      if (s.chats.some((c) => c.id === chatId)) {
        return {
          ...s,
          chats: s.chats.map((c) =>
            c.id === chatId ? { ...c, updatedAt: now, messages: [...c.messages, msg].slice(-MAX_MESSAGES_PER_CHAT) } : c
          ),
        };
      }
      if (opts?.createWithTitle === undefined) return s; // chat was deleted while waiting for a reply
      return {
        activeId: chatId,
        chats: [{ id: chatId, title: opts.createWithTitle, createdAt: now, updatedAt: now, messages: [msg] }, ...s.chats].slice(0, MAX_CHATS),
      };
    });

  const sendMessage = async (textToSend: string, forceNewChat = false) => {
    const trimmed = textToSend.trim();
    if (!trimmed || busy) return;

    const base = forceNewChat ? null : activeChat;
    const chatId = base?.id ?? `c-${Date.now()}`;
    const history = (base?.messages ?? []).slice(-16).map((m) => ({ sender: m.sender, text: m.text }));
    const userMsg: MentorChatMessage = { id: `u-${Date.now()}`, sender: 'user', text: trimmed, at: new Date().toISOString() };
    addMessage(chatId, userMsg, { createWithTitle: chatTitle(trimmed) });
    setError(null);
    setInput('');
    setBusyChatId(chatId);

    try {
      const res = await requestMentorChat(
        {
          message: trimmed,
          history,
          useWebSearch,
          hintLevel: helpLevel,
          context: {
            field: profile.field || selectedRoadmap.field,
            skillLevel: profile.skillLevel || 'Beginner',
            roadmapTitle: selectedRoadmap.title,
            activeCourse: activeCourse?.title || 'None linked yet',
            currentTopic,
            weakTopics,
            recentSubmissions: codeSubmissions.slice(0, 3).map((s) => `${s.topic} (${s.exerciseTitle})`),
            activeProject: activeProject?.title || 'None started yet',
          },
        },
        user.id
      );

      addMessage(chatId, { id: `a-${Date.now()}`, sender: 'mentor', text: res.text, sources: res.sources, at: new Date().toISOString() });
      onLogHelp?.({
        id: `help-${Date.now()}`,
        at: new Date().toISOString(),
        source: 'mentor',
        level: helpLevel,
        topic: currentTopic,
      });
    } catch (err: any) {
      setError({
        chatId,
        text: `I couldn’t reach the live AI mentor right now (${err?.message || 'connection issue'}). In the meantime, focus on your current step (${currentTopic}), test a small 5–10 line example, or post your question in Community Discussions!`,
      });
    } finally {
      setBusyChatId(null);
    }
  };

  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      const p = initialPrompt;
      onClearInitialPrompt?.();
      // A question sent from elsewhere in the app (e.g. "Ask mentor") starts its own chat.
      sendMessage(p, true);
    }
  }, [initialPrompt]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, busyChatId, store.activeId, error]);

  // The message box grows with what you type (up to a limit), like a chat app.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const startNewChat = () => {
    update((s) => ({ ...s, activeId: null }));
    setSidebarOpen(false);
    setInput('');
    textareaRef.current?.focus();
  };
  const openChat = (id: string) => {
    update((s) => ({ ...s, activeId: id }));
    setSidebarOpen(false);
  };
  const deleteChat = (id: string) => {
    if (!window.confirm('Delete this chat? This cannot be undone.')) return;
    update((s) => ({ activeId: s.activeId === id ? null : s.activeId, chats: s.chats.filter((c) => c.id !== id) }));
  };

  const level = HELP_LEVELS.find((h) => h.level === helpLevel);
  const firstName = (user.name || profile.fullName || 'there').split(' ')[0];
  const ctx: [string, string][] = [
    ['Field and level', `${profile.field || selectedRoadmap.field}, ${profile.skillLevel || 'Beginner'}`],
    ['Roadmap', selectedRoadmap.title],
    ['Course', activeCourse ? activeCourse.title : 'Not linked yet'],
    ['Current topic', currentTopic],
    ['Weekly project', activeProject?.title || 'None yet'],
    ['To revisit', weakTopics.length ? weakTopics.join(', ') : 'Nothing flagged'],
  ];
  const showSpinner = busyChatId !== null && busyChatId === activeChat?.id;
  const pill = (active: boolean) =>
    `px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer border transition-colors ${
      active ? 'bg-[var(--accent-600)] text-white border-transparent' : `${borderClass} ${textSecondary} hover:border-[var(--accent-500)]`
    }`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="AI Mentor"
        description="A private study guide that teaches one small step at a time. Your chats are saved."
      />

      <div className={`${cardClass} relative flex h-[76dvh] min-h-[520px] lg:h-[calc(100dvh-13rem)] overflow-hidden`}>
        {/* Chat history sidebar */}
        {sidebarOpen && (
          <button type="button" aria-label="Close chat list" onClick={() => setSidebarOpen(false)} className="lg:hidden absolute inset-0 z-10 bg-black/40 cursor-default" />
        )}
        <aside
          className={`${sidebarOpen ? 'flex' : 'hidden'} lg:flex absolute lg:static inset-y-0 left-0 z-20 w-72 lg:w-64 shrink-0 flex-col border-r ${borderClass} ${subtleBgClass}`}
        >
          <div className="p-3">
            <button
              type="button"
              onClick={startNewChat}
              className={`w-full inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium cursor-pointer ${borderClass} ${textPrimary} hover:border-[var(--accent-500)]`}
            >
              <Plus className="w-4 h-4" /> New chat
            </button>
          </div>
          <nav aria-label="Your chats" className="flex-1 overflow-y-auto px-2 pb-3 space-y-4">
            {groups.length === 0 && <p className={`px-2 text-xs ${textSecondary}`}>Your chats will show up here, so you can come back to them any time.</p>}
            {groups.map((g) => (
              <div key={g.label}>
                <div className={`px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide ${textSecondary}`}>{g.label}</div>
                <ul className="space-y-0.5">
                  {g.items.map((c) => {
                    const active = c.id === store.activeId;
                    return (
                      <li key={c.id} className={`group flex items-center rounded-lg ${active ? 'bg-[var(--accent-50)]' : 'hover:bg-[var(--accent-50)]'}`}>
                        <button
                          type="button"
                          onClick={() => openChat(c.id)}
                          aria-current={active ? 'true' : undefined}
                          className={`flex-1 min-w-0 flex items-center gap-2 px-2.5 py-2 text-left text-sm cursor-pointer ${active ? 'font-semibold text-[var(--accent-600)]' : textPrimary}`}
                        >
                          <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-70" />
                          <span className="truncate">{c.title}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteChat(c.id)}
                          aria-label={`Delete chat: ${c.title}`}
                          className={`p-1.5 mr-1 rounded-md cursor-pointer ${textSecondary} hover:text-[var(--accent-600)] ${active ? '' : 'lg:opacity-0'} lg:group-hover:opacity-100 focus:opacity-100`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Conversation */}
        <section className="flex-1 min-w-0 flex flex-col">
          <div className={`px-4 py-3 border-b ${borderClass} flex items-center justify-between gap-3`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open your chats"
                className={`lg:hidden p-1.5 rounded-lg border cursor-pointer ${borderClass} ${textSecondary}`}
              >
                <PanelLeft className="w-4 h-4" />
              </button>
              <div className="w-8 h-8 rounded-lg rounded-bl-sm bg-[var(--spark)] text-[var(--on-spark)] flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className={`font-display text-base truncate ${textPrimary}`}>{activeChat?.title || 'New chat'}</div>
                <div className={`text-[11px] truncate ${textSecondary}`}>Private · {currentTopic}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={startNewChat}
                aria-label="New chat"
                title="New chat"
                className={`lg:hidden p-1.5 rounded-lg border cursor-pointer ${borderClass} ${textSecondary}`}
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setContextOpen((v) => !v)}
                aria-expanded={contextOpen}
                title="What your mentor knows about you"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium cursor-pointer ${borderClass} ${contextOpen ? 'text-[var(--accent-600)]' : textSecondary}`}
              >
                <Compass className="w-3.5 h-3.5" /> <span className="hidden sm:inline">What I know</span>
              </button>
            </div>
          </div>

          {contextOpen && (
            <div className={`px-4 py-3 border-b ${borderClass} ${subtleBgClass}`}>
              <p className={`text-xs ${textSecondary}`}>Private to you. It keeps answers at your level.</p>
              <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {ctx.map(([k, v]) => (
                  <div key={k}>
                    <dt className={`text-[11px] ${textSecondary}`}>{k}</dt>
                    <dd className={`text-sm font-medium ${textPrimary}`}>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
            <div className="max-w-3xl mx-auto space-y-5">
              {messages.length === 0 && !showSpinner && (
                <div className="pt-4 sm:pt-10 text-center space-y-5">
                  <div className="w-11 h-11 mx-auto rounded-xl rounded-bl-sm bg-[var(--spark)] text-[var(--on-spark)] flex items-center justify-center">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div className="space-y-1.5">
                    <h2 className={`text-xl ${textPrimary}`}>Hi {firstName}, what are we learning?</h2>
                    <p className={`text-sm max-w-md mx-auto ${textSecondary}`}>
                      You’re learning {profile.field || selectedRoadmap.field} at the {profile.skillLevel || 'Beginner'} level
                      {activeCourse ? `, studying “${activeCourse.title}”` : ''}. No question is too basic. I’ll go one small step at a time and check in with you.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                    {QUICK_PROMPTS.map((qp) => (
                      <button
                        key={qp.label}
                        type="button"
                        onClick={() => sendMessage(qp.prompt)}
                        disabled={busy}
                        className={`px-3.5 py-2.5 rounded-xl border ${borderClass} text-sm ${textPrimary} cursor-pointer hover:border-[var(--accent-500)] hover:bg-[var(--accent-50)] disabled:opacity-50`}
                      >
                        {qp.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) =>
                m.sender === 'user' ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm bg-[var(--panel-deep)] text-white">
                      <FormattedMessageText text={m.text} isUser subtleBgClass={subtleBgClass} borderClass={borderClass} textPrimary={textPrimary} />
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex gap-3 max-w-[94%]">
                    <span aria-hidden="true" className="w-[3px] rounded-full bg-[var(--spark)] shrink-0" />
                    <div className={`text-sm leading-relaxed min-w-0 ${textPrimary}`}>
                      <FormattedMessageText text={m.text} isUser={false} subtleBgClass={subtleBgClass} borderClass={borderClass} textPrimary={textPrimary} />
                      {m.sources && m.sources.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          <span className={`text-[11px] ${textSecondary}`}>Sources</span>
                          {m.sources.map((src, idx) => (
                            <a key={idx} href={src.uri} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border ${borderClass} text-[11px] text-[var(--accent-600)] hover:underline`}>
                              <span className="truncate max-w-[200px]">{src.title}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              )}

              {error && error.chatId === activeChat?.id && !showSpinner && (
                <div className="flex gap-3 max-w-[94%]">
                  <span aria-hidden="true" className="w-[3px] rounded-full bg-[var(--spark)] shrink-0" />
                  <div className={`text-sm leading-relaxed ${textPrimary}`}>{error.text}</div>
                </div>
              )}
              {showSpinner && (
                <div className={`flex items-center gap-2 text-xs ${textSecondary}`} role="status">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-600)]" />
                  {useWebSearch ? 'Checking current docs…' : 'Thinking it through…'}
                </div>
              )}
            </div>
          </div>

          {/* Message box: the help level lives inside it, like a mode picker in a chat app */}
          <div className="px-4 sm:px-6 pb-4 pt-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(input);
              }}
              className="max-w-3xl mx-auto"
            >
              <div className={`rounded-2xl border ${borderClass} ${subtleBgClass} focus-within:border-[var(--accent-500)] transition-colors`}>
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      sendMessage(input);
                    }
                  }}
                  placeholder="Ask a question, or paste code or an error"
                  aria-label="Message the mentor"
                  disabled={busy}
                  className={`w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm outline-none placeholder:opacity-60 ${textPrimary}`}
                />
                <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0" role="radiogroup" aria-label="How much help do you want?">
                    <span className={`text-[11px] pl-1.5 pr-0.5 ${textSecondary}`}>Help</span>
                    {HELP_LEVELS.map((h) => (
                      <button
                        key={h.level}
                        type="button"
                        role="radio"
                        aria-checked={helpLevel === h.level}
                        title={h.description}
                        onClick={() => setHelpLevel(h.level)}
                        className={pill(helpLevel === h.level)}
                      >
                        {h.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setUseWebSearch((v) => !v)}
                      aria-pressed={useWebSearch}
                      title="Lets the mentor look things up on the web for current docs"
                      className={`inline-flex items-center gap-1 ${pill(useWebSearch)}`}
                    >
                      <Globe className="w-3 h-3" /> Web
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={busy || !input.trim()}
                    aria-label="Send"
                    className="w-8 h-8 shrink-0 rounded-full bg-[var(--accent-600)] text-white flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <p className={`mt-1.5 text-center text-[11px] ${textSecondary}`}>
                {level?.description} Smaller help counts more toward your independence score.
              </p>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
};

const SETTINGS_SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'goals', label: 'Learning goals' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'account', label: 'Account' },
] as const;

const SettingsField = ({
  label,
  hint,
  textPrimary,
  textSecondary,
  children,
}: {
  label: string;
  hint?: string;
  textPrimary: string;
  textSecondary: string;
  children: React.ReactNode;
}) => (
  <label className="block space-y-1.5">
    <span className={`block text-sm font-medium ${textPrimary}`}>{label}</span>
    {children}
    {hint && <span className={`block text-[13px] ${textSecondary}`}>{hint}</span>}
  </label>
);

const SettingsCheck = ({
  checked,
  onChange,
  title,
  description,
  borderClass,
  textPrimary,
  textSecondary,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description?: string;
  borderClass: string;
  textPrimary: string;
  textSecondary: string;
}) => (
  <label
    className={`flex items-start gap-3 min-h-[44px] px-3.5 py-3 rounded-lg border border-l-4 cursor-pointer transition-colors ${borderClass} ${
      checked ? '!border-l-[var(--spark)] bg-[var(--accent-50)]' : 'border-l-transparent hover:bg-[var(--surface-subtle)]'
    }`}
  >
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-0.5 w-5 h-5 shrink-0 cursor-pointer accent-[var(--accent-600)]"
    />
    <span className="min-w-0">
      <span className={`block text-sm font-medium ${textPrimary}`}>{title}</span>
      {description && <span className={`block text-[13px] leading-relaxed ${textSecondary}`}>{description}</span>}
    </span>
  </label>
);

export const ProfileSection = ({
  profile,
  setProfile,
  milestones,
  onRestartOnboarding,
  onNotify,
  styles,
}: {
  profile: OnboardingProfile;
  setProfile: (p: OnboardingProfile) => void;
  milestones: MilestoneSummary;
  onRestartOnboarding: () => void;
  onNotify: (msg: string) => void;
  styles: {
    cardClass: string;
    borderClass: string;
    subtleBgClass: string;
    textPrimary: string;
    textSecondary: string;
    inputClass: string;
    btnPrimary: string;
    btnSecondary: string;
    darkMode: boolean;
  };
}) => {
  const { cardClass, borderClass, subtleBgClass, textPrimary, textSecondary, inputClass, btnPrimary, btnSecondary, darkMode } = styles;

  const [draft, setDraft] = useState<OnboardingProfile>(profile);
  const [langText, setLangText] = useState((profile.languages || []).join(', '));
  const [interestsText, setInterestsText] = useState((profile.interests || []).join(', '));
  const [activeSection, setActiveSection] = useState<string>('profile');

  useEffect(() => {
    setDraft(profile);
    setLangText((profile.languages || []).join(', '));
    setInterestsText((profile.interests || []).join(', '));
  }, [profile]);

  // Highlight the section currently in view in the left list (display only).
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id.replace('settings-', ''));
        });
      },
      { rootMargin: '-15% 0px -70% 0px' },
    );
    SETTINGS_SECTIONS.forEach((sec) => {
      const el = document.getElementById(`settings-${sec.id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const goToSection = (id: string) => {
    setActiveSection(id);
    const el = document.getElementById(`settings-${id}`);
    if (!el) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setProfile({
      ...draft,
      languages: langText.split(',').map((s) => s.trim()).filter(Boolean),
      interests: interestsText.split(',').map((s) => s.trim()).filter(Boolean),
    });
    onNotify('Profile & learning preferences saved!');
  };

  // Display only: tells the person whether the form differs from what is saved.
  const hasChanges =
    JSON.stringify(draft) !== JSON.stringify(profile) ||
    langText !== (profile.languages || []).join(', ') ||
    interestsText !== (profile.interests || []).join(', ');

  const field = `${inputClass} min-h-[44px]`;
  const fieldProps = { textPrimary, textSecondary };
  const sectionHead = (title: string, description: string) => (
    <div className="space-y-1">
      <h2 className={`text-xl scroll-mt-24 ${textPrimary}`}>{title}</h2>
      <p className={`text-sm max-w-[60ch] ${textSecondary}`}>{description}</p>
    </div>
  );

  return (
    <div className="max-w-6xl space-y-8">
      <PageHeader
        title="Profile & Settings"
        description="Update your learning focus, links, badges and notification preferences whenever you like."
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start">
        <nav
          aria-label="Settings sections"
          className="lg:col-span-3 lg:sticky lg:top-24 flex lg:flex-col gap-1.5 overflow-x-auto no-scrollbar pb-1"
        >
          {SETTINGS_SECTIONS.map((sec) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => goToSection(sec.id)}
              aria-current={activeSection === sec.id ? 'true' : undefined}
              className={`min-h-[44px] px-3.5 py-2 rounded-lg text-sm font-medium cursor-pointer whitespace-nowrap shrink-0 text-left border-l-4 transition-colors ${
                activeSection === sec.id
                  ? 'bg-[var(--accent-50)] border-[var(--spark)] text-[var(--ink-primary)] font-semibold'
                  : `border-transparent hover:bg-[var(--surface-subtle)] ${textSecondary}`
              }`}
            >
              {sec.label}
            </button>
          ))}
        </nav>

        <form onSubmit={handleSave} className="lg:col-span-9 min-w-0 space-y-12">
          {/* PROFILE */}
          <section id="settings-profile" aria-labelledby="settings-profile-title" className="space-y-4 scroll-mt-24">
            <div id="settings-profile-title">{sectionHead('Profile', 'How other members see you, and where to find your work.')}</div>

            <div className={`${cardClass} p-5 sm:p-8 space-y-5`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <SettingsField label="Full name" {...fieldProps}>
                  <input value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} className={field} />
                </SettingsField>
                <SettingsField label="Username" {...fieldProps}>
                  <input value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} className={field} />
                </SettingsField>
              </div>

              <SettingsField label="Short bio" hint="A sentence or two about you. Shown on your profile." {...fieldProps}>
                <textarea rows={3} value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} className={`${inputClass} min-h-[88px]`} />
              </SettingsField>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <SettingsField label="Languages and tools" hint="Separate with commas." {...fieldProps}>
                  <input value={langText} onChange={(e) => setLangText(e.target.value)} className={field} />
                </SettingsField>
                <SettingsField label="Interests" hint="Separate with commas." {...fieldProps}>
                  <input value={interestsText} onChange={(e) => setInterestsText(e.target.value)} className={field} />
                </SettingsField>
              </div>

              <div className={`pt-5 border-t ${borderClass} space-y-4`}>
                <h3 className={`text-lg ${textPrimary}`}>Developer links</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <SettingsField label="GitHub" {...fieldProps}>
                    <input value={draft.githubUrl} onChange={(e) => setDraft({ ...draft, githubUrl: e.target.value })} className={field} />
                  </SettingsField>
                  <SettingsField label="Portfolio" {...fieldProps}>
                    <input value={draft.portfolioUrl} onChange={(e) => setDraft({ ...draft, portfolioUrl: e.target.value })} className={field} />
                  </SettingsField>
                  <SettingsField label="LinkedIn" {...fieldProps}>
                    <input value={draft.linkedinUrl} onChange={(e) => setDraft({ ...draft, linkedinUrl: e.target.value })} className={field} />
                  </SettingsField>
                </div>
              </div>
            </div>

            <ProfileMilestonesCard
              summary={milestones}
              cardClass={cardClass}
              borderClass={borderClass}
              subtleBgClass={subtleBgClass}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
            />
          </section>

          {/* LEARNING GOALS */}
          <section id="settings-goals" aria-labelledby="settings-goals-title" className="space-y-4 scroll-mt-24">
            <div id="settings-goals-title">{sectionHead('Learning goals', 'Your mentor and roadmap use these to suggest the right next step.')}</div>

            <div className={`${cardClass} p-5 sm:p-8 space-y-5`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <SettingsField label="What you're learning" {...fieldProps}>
                  <input value={draft.field} onChange={(e) => setDraft({ ...draft, field: e.target.value })} className={field} placeholder="e.g., Frontend Development" />
                </SettingsField>
                <SettingsField label="Current level" {...fieldProps}>
                  <select value={draft.skillLevel} onChange={(e) => setDraft({ ...draft, skillLevel: e.target.value })} className={field}>
                    <option>Complete beginner</option>
                    <option>Beginner</option>
                    <option>Intermediate</option>
                    <option>Advanced</option>
                  </select>
                </SettingsField>
                <SettingsField label="Main goal" {...fieldProps}>
                  <input value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value })} className={field} placeholder="e.g., Build my own products" />
                </SettingsField>
                <SettingsField label="Study time" {...fieldProps}>
                  <input value={draft.studyTime} onChange={(e) => setDraft({ ...draft, studyTime: e.target.value })} className={field} placeholder="e.g., 30 minutes per day" />
                </SettingsField>
              </div>
              <SettingsField label="Skills you already know" hint="Topics you're comfortable with, so we don't repeat them." {...fieldProps}>
                <input value={draft.knownSkills} onChange={(e) => setDraft({ ...draft, knownSkills: e.target.value })} className={field} placeholder="e.g., Basic HTML, CSS selectors, Python loops" />
              </SettingsField>
            </div>
          </section>

          {/* APPEARANCE */}
          <section id="settings-appearance" aria-labelledby="settings-appearance-title" className="space-y-4 scroll-mt-24">
            <div id="settings-appearance-title">{sectionHead('Appearance', 'Choose how much of Dev Hub you see and which theme you use.')}</div>

            <div className={`${cardClass} p-5 sm:p-8 space-y-5`}>
              <SettingsCheck
                checked={!!draft.showAdvancedTools}
                onChange={(v) => setDraft({ ...draft, showAdvancedTools: v })}
                title="Show advanced tools"
                description="Adds 10-stage software lifecycle tracking to Group Projects, plus extra metrics."
                borderClass={borderClass}
                textPrimary={textPrimary}
                textSecondary={textSecondary}
              />
              <p className={`text-sm max-w-[60ch] ${textSecondary}`}>
                You're using the <strong className={textPrimary}>{darkMode ? 'dark' : 'light'}</strong> theme. Switch it any time with the sun or moon button at the top of the page.
              </p>
            </div>
          </section>

          {/* ACCOUNT */}
          <section id="settings-account" aria-labelledby="settings-account-title" className="space-y-4 scroll-mt-24">
            <div id="settings-account-title">{sectionHead('Account', 'Reminders we send you, and your setup.')}</div>

            <div className={`${cardClass} p-5 sm:p-8 space-y-6`}>
              <fieldset className="space-y-2.5">
                <legend className={`text-lg mb-2.5 ${textPrimary}`}>Notifications</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    ['announcements', 'Community announcements'],
                    ['deadlines', 'Weekly project and session reminders'],
                    ['reviewFeedback', 'Code review feedback updates'],
                    ['weeklyCheckIn', 'Sunday weekly check-in reminder'],
                  ].map(([key, label]) => (
                    <SettingsCheck
                      key={key}
                      checked={!!(draft.notifications as any)?.[key]}
                      onChange={(v) => setDraft({ ...draft, notifications: { ...draft.notifications, [key]: v } })}
                      title={label}
                      borderClass={borderClass}
                      textPrimary={textPrimary}
                      textSecondary={textSecondary}
                    />
                  ))}
                </div>
              </fieldset>

              <div className={`pt-5 border-t ${borderClass} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                <div className="space-y-0.5 max-w-[52ch]">
                  <h3 className={`text-lg ${textPrimary}`}>Setup</h3>
                  <p className={`text-sm ${textSecondary}`}>Answer the short setup questions again to refresh your roadmap and goals.</p>
                </div>
                <button type="button" onClick={onRestartOnboarding} className={`${btnSecondary} min-h-[44px] !px-4 !text-sm`}>
                  <RotateCcw className="w-4 h-4" /> Run setup again
                </button>
              </div>
            </div>
          </section>

          {/* One save for every section above */}
          <div className={`sticky bottom-16 lg:bottom-0 z-10 -mx-1 px-1 py-3 border-t ${borderClass} bg-[var(--canvas-bg)] flex items-center justify-between gap-3`}>
            <p aria-live="polite" className={`text-sm ${hasChanges ? 'text-[var(--ink-primary)] font-medium' : textSecondary}`}>
              {hasChanges ? 'You have unsaved changes.' : 'All changes saved.'}
            </p>
            <button type="submit" className={`${btnPrimary} min-h-[44px] !px-5 !text-sm`}>
              <Save className="w-4 h-4" /> Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
