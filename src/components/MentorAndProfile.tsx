import React, { useEffect, useState } from 'react';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Compass,
  ExternalLink,
  Globe,
  Loader2,
  RotateCcw,
  Save,
  Send,
  Settings,
  User,
} from 'lucide-react';
import { PageHeader } from './ui';
import { ProfileMilestonesCard } from './MilestoneBadges';
import { requestMentorChat, type GroundedSource } from '../lib/aiClient';
import { HELP_LEVELS } from '../lib/independence';
import type {
  AiHelpEvent,
  HelpLevel,
  MentorChatMessage,
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
  chat: MentorChatMessage[];
  onChatChange: React.Dispatch<React.SetStateAction<MentorChatMessage[]>>;
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
  const { cardClass, borderClass, subtleBgClass, textPrimary, textSecondary, inputClass, btnPrimary } = styles;

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

  // The conversation is saved by the app (see mentorChat in App.tsx), so it survives refreshes.
  // The welcome message is only a greeting; it is not saved and not sent to the AI.
  const welcome: MentorChatMessage = {
    id: 'm-welcome',
    sender: 'mentor',
    text: `Hi ${(user.name || profile.fullName || 'there').split(' ')[0]}! I’m your private AI Mentor. I can see you’re learning ${profile.field || selectedRoadmap.field} at the ${profile.skillLevel || 'Beginner'} level${activeCourse ? `, currently studying \"${activeCourse.title}\"` : ''}. Ask any question, no question is too basic. I’ll take it one small step at a time and check in with you as we go.`,
  };
  const saved = chat;
  const messages = [welcome, ...saved];
  // Connection errors are shown but never saved or sent to the AI as if the mentor had said them.
  const [errorNote, setErrorNote] = useState('');
  const [input, setInput] = useState('');
  const [useWebSearch, setUseWebSearch] = useState(true);
  // Hint ladder: the member chooses how much help they want. Starting small builds independence.
  const [helpLevel, setHelpLevel] = useState<HelpLevel>(2);
  const [busy, setBusy] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || busy) return;

    const userMsg: MentorChatMessage = { id: `u-${Date.now()}`, sender: 'user', text: trimmed, at: new Date().toISOString() };
    onChatChange((prev) => [...prev, userMsg].slice(-200));
    setErrorNote('');
    setInput('');
    setBusy(true);

    try {
      const res = await requestMentorChat(
        {
          message: trimmed,
          history: saved.slice(-16).map((m) => ({ sender: m.sender, text: m.text })),
          useWebSearch,
          hintLevel: helpLevel,
          context: {
            field: profile.field || selectedRoadmap.field,
            skillLevel: profile.skillLevel || 'Beginner',
            roadmapTitle: selectedRoadmap.title,
            activeCourse: activeCourse?.title || 'None linked yet',
            currentTopic: activeCourse?.currentTopic || selectedRoadmap.topics[0]?.name || 'Foundations',
            weakTopics,
            recentSubmissions: codeSubmissions.slice(0, 3).map((s) => `${s.topic} (${s.exerciseTitle})`),
            activeProject: activeProject?.title || 'None started yet',
          },
        },
        user.id
      );

      onChatChange((prev) =>
        [...prev, { id: `a-${Date.now()}`, sender: 'mentor' as const, text: res.text, sources: res.sources, at: new Date().toISOString() }].slice(-200)
      );
      onLogHelp?.({
        id: `help-${Date.now()}`,
        at: new Date().toISOString(),
        source: 'mentor',
        level: helpLevel,
        topic: activeCourse?.currentTopic || selectedRoadmap.topics[0]?.name || 'Foundations',
      });
    } catch (err: any) {
      setErrorNote(
        `I couldn’t reach the live AI mentor right now (${err?.message || 'connection issue'}). In the meantime, focus on your current step (${activeCourse?.currentTopic || selectedRoadmap.topics[0]?.name || 'your roadmap'}), test a small 5–10 line example, or post your question in Community Discussions!`
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      const p = initialPrompt;
      onClearInitialPrompt?.();
      sendMessage(p);
    }
  }, [initialPrompt]);

  const level = HELP_LEVELS.find((h) => h.level === helpLevel);
  const fresh = saved.length === 0;
  const ctx: [string, string][] = [
    ['Field and level', `${profile.field || selectedRoadmap.field}, ${profile.skillLevel || 'Beginner'}`],
    ['Roadmap', selectedRoadmap.title],
    ['Course', activeCourse ? activeCourse.title : 'Not linked yet'],
    ['Current topic', activeCourse?.currentTopic || selectedRoadmap.topics[0]?.name || 'Foundations'],
    ['Weekly project', activeProject?.title || 'None yet'],
    ['To revisit', weakTopics.length ? weakTopics.join(', ') : 'Nothing flagged'],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Mentor"
        description="A private study guide that gives hints first. Pick how much help you want, then ask."
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Chat is the page: wide, tall, composer pinned to the bottom */}
        <section className={`${cardClass} lg:col-span-8 flex flex-col h-[72dvh] min-h-[500px] lg:h-[calc(100dvh-15rem)] overflow-hidden`}>
          <div className={`px-5 py-3 border-b ${borderClass} flex items-center justify-between gap-3`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg rounded-bl-sm bg-[var(--spark)] text-[var(--on-spark)] flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className={`font-display text-base ${textPrimary}`}>Study chat</div>
                <div className={`text-[11px] truncate ${textSecondary}`}>Private · {ctx[3][1]}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
            {saved.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Start a new chat? This clears your saved conversation with the mentor.')) {
                    onChatChange([]);
                    setErrorNote('');
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium cursor-pointer ${borderClass} ${textSecondary}`}
                title="Clear the saved conversation and start fresh"
              >
                New chat
              </button>
            )}
            <button
              type="button"
              onClick={() => setUseWebSearch((v) => !v)}
              aria-pressed={useWebSearch}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium cursor-pointer shrink-0 ${
                useWebSearch ? 'bg-[var(--success-bg)] text-[var(--success-ink)] border-[var(--success-border)]' : `${borderClass} ${textSecondary}`
              }`}
              title="Lets the mentor look things up on the web for current docs"
            >
              <Globe className="w-3.5 h-3.5" /> Web {useWebSearch ? 'on' : 'off'}
            </button>
            </div>
          </div>

          <div ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }} className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
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
            {errorNote && !busy && (
              <div className="flex gap-3 max-w-[94%]">
                <span aria-hidden="true" className="w-[3px] rounded-full bg-[var(--spark)] shrink-0" />
                <div className={`text-sm leading-relaxed ${textPrimary}`}>{errorNote}</div>
              </div>
            )}
            {busy && (
              <div className={`flex items-center gap-2 text-xs ${textSecondary}`} role="status">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-600)]" />
                {useWebSearch ? 'Checking current docs…' : 'Thinking it through…'}
              </div>
            )}
            {fresh && !busy && (
              <div className="pt-2 space-y-2">
                <p className={`text-xs ${textSecondary}`}>Not sure where to start?</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((qp) => (
                    <button key={qp.label} type="button" onClick={() => sendMessage(qp.prompt)} className={`px-3 py-1.5 rounded-full border ${borderClass} text-xs font-medium ${textPrimary} cursor-pointer hover:border-[var(--accent-500)] hover:bg-[var(--accent-50)]`}>
                      {qp.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className={`border-t ${borderClass} p-4 space-y-3 ${subtleBgClass}`}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2" role="radiogroup" aria-label="How much help do you want?">
              <span className={`text-xs font-semibold ${textPrimary} sm:mr-1`}>How much help?</span>
              <div className={`grid grid-cols-3 gap-1 p-1 rounded-lg border ${borderClass} flex-1 sm:max-w-md`}>
                {HELP_LEVELS.map((h) => (
                  <button key={h.level} type="button" role="radio" aria-checked={helpLevel === h.level} onClick={() => setHelpLevel(h.level)} className={`px-2 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${helpLevel === h.level ? 'bg-[var(--accent-600)] text-white' : textSecondary}`}>
                    {h.short}
                  </button>
                ))}
              </div>
            </div>
            <p className={`text-[11px] ${textSecondary}`}>{level?.description} Smaller help counts more toward your independence score.</p>
            <div className="flex gap-2.5">
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question, or paste code or an error" className={inputClass} disabled={busy} aria-label="Message the mentor" />
              <button type="submit" disabled={busy || !input.trim()} className={btnPrimary}>
                <Send className="w-3.5 h-3.5" /> Send
              </button>
            </div>
          </form>
        </section>

        {/* Rail: what the mentor knows about you, always visible */}
        <aside className="lg:col-span-4 space-y-4 lg:sticky lg:top-6">
          <section className={`${cardClass} p-5`}>
            <h2 className={`text-lg flex items-center gap-2 ${textPrimary}`}>
              <Compass className="w-4 h-4 text-[var(--accent-600)]" /> What your mentor knows
            </h2>
            <p className={`text-xs mt-1 ${textSecondary}`}>Private to you. It keeps answers at your level.</p>
            <dl className={`mt-3 divide-y ${borderClass}`}>
              {ctx.map(([k, v]) => (
                <div key={k} className="py-2">
                  <dt className={`text-[11px] ${textSecondary}`}>{k}</dt>
                  <dd className={`text-sm font-medium ${textPrimary}`}>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          {!fresh && (
            <section className={`${cardClass} p-5 space-y-2`}>
              <h2 className={`text-sm font-semibold ${textPrimary}`}>Quick starts</h2>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PROMPTS.map((qp) => (
                  <button key={qp.label} type="button" disabled={busy} onClick={() => sendMessage(qp.prompt)} className={`px-2.5 py-1 rounded-full border ${borderClass} text-xs ${textPrimary} cursor-pointer hover:border-[var(--accent-500)]`}>
                    {qp.label}
                  </button>
                ))}
              </div>
            </section>
          )}
        </aside>
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
