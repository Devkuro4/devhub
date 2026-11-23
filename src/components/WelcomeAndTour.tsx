import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  FolderGit2,
  HelpCircle,
  LayoutDashboard,
  Map as MapIcon,
  Play,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import type { CourseItem, DailyTarget, OnboardingProfile, RoadmapItem, TutorialState } from '../types';

export interface TourStepDef {
  id: string;
  key: 'dashboard' | 'learning' | 'ai-mentor' | 'quizzes' | 'compete' | 'projects' | 'community' | 'profile';
  title: string;
  tab: string;
  selector: string;
  fallbackSelector: string;
  message: string;
  highlights: string[];
  presentation: 'intro' | 'spotlight' | 'interactive';
  miniActionLabel?: string;
  miniActionDescription?: string;
}

const DEV_HUB_OFFERINGS = [
  { icon: LayoutDashboard, label: 'Track the course you already use' },
  { icon: Target, label: 'Turn daily effort into visible progress' },
  { icon: Users, label: 'Get unstuck with people and an AI mentor' },
];

export const buildTourSteps = (): TourStepDef[] => ([
  {
    id: 'step-dashboard',
    key: 'dashboard',
    title: 'Your home',
    tab: 'dashboard',
    selector: '[data-tour="home-workspace"]',
    fallbackSelector: '[data-tour="nav-dashboard"]',
    message: 'This is your calm overview: what you are tracking, how today is going and the clearest next step.',
    highlights: [
      'See your active course and today’s progress',
      'Continue without searching through menus',
    ],
    presentation: 'intro',
  },
  {
    id: 'step-learning',
    key: 'learning',
    title: 'Your progress tracker',
    tab: 'courses',
    selector: '[data-tour="learning-courses"]',
    fallbackSelector: '[data-tour="nav-today"]',
    message: 'Bring the course you already use, then record study time, modules and private code evidence in one short daily flow.',
    highlights: [
      'Add or open an external course',
      'Log today’s work and check what stuck',
    ],
    presentation: 'interactive',
    miniActionLabel: 'Open today’s tracker',
    miniActionDescription: 'See the short check-in flow for your active course.',
  },
  {
    id: 'step-mentor',
    key: 'ai-mentor',
    title: 'AI Mentor',
    tab: 'ai-mentor',
    selector: '[data-tour="mentor-workspace"]',
    fallbackSelector: '[data-tour="nav-ai-mentor"]',
    message: 'Think of your AI mentor as a learning companion. It helps you understand, not just find answers.',
    highlights: [
      'Ask programming questions and request beginner-friendly explanations',
      'Get hints when solving problems and decode confusing error messages',
      'Receive guidance tailored to your current topic and recommended next study steps',
    ],
    presentation: 'interactive',
    miniActionLabel: 'Try a sample question with AI Mentor',
    miniActionDescription: 'Prefills a tailored question based on your field so you can see how the Mentor responds.',
  },
  {
    id: 'step-quizzes',
    key: 'quizzes',
    title: 'Quizzes & Assessments',
    tab: 'quizzes',
    selector: '[data-tour="learning-quizzes"]',
    fallbackSelector: '[data-tour="nav-today"]',
    message: "Don't just watch tutorials. Test what you understand and identify what needs more practice.",
    highlights: [
      'Topic-based quizzes and quick knowledge checks',
      'Clear assessment results that highlight strong and weak areas',
      'Track your improvement across topics over time',
    ],
    presentation: 'interactive',
    miniActionLabel: 'View available topic quizzes',
    miniActionDescription: 'Explore your Quizzes tab and see your current knowledge checks.',
  },
  {
    id: 'step-compete',
    key: 'compete',
    title: 'Challenges & Competitions',
    tab: 'compete',
    selector: '[data-tour="compete-section"]',
    fallbackSelector: '[data-tour="nav-compete"]',
    message: 'Challenge yourself, compete with others and celebrate your progress.',
    highlights: [
      'Daily and weekly coding challenges to sharpen practical skills',
      'XP, study streaks, levels, and milestone achievements',
      'Opt-in community leaderboards and badges',
    ],
    presentation: 'spotlight',
  },
  {
    id: 'step-projects',
    key: 'projects',
    title: 'Projects & Showcase',
    tab: 'weekly-project',
    selector: '[data-tour="projects-section"]',
    fallbackSelector: '[data-tour="nav-weekly-project"]',
    message: 'Learning becomes meaningful when you start building. Turn what you learn into something real.',
    highlights: [
      'Discover project ideas matched to your skill level and field',
      'Submit completed projects with GitHub repositories and live demonstrations',
      'Receive constructive feedback and showcase your growth',
    ],
    presentation: 'interactive',
    miniActionLabel: 'Browse peer projects in Showcase',
    miniActionDescription: 'See what fellow Dev Hub members have built and shared.',
  },
  {
    id: 'step-community',
    key: 'community',
    title: 'Help when you need it',
    tab: 'community-home',
    selector: '[data-tour="community-section"]',
    fallbackSelector: '[data-tour="nav-community-home"]',
    message: "Ask the community, join a study room or use the AI mentor for a hint. You stay in control of the work.",
    highlights: [
      'Ask questions and learn beside real people',
      'Use the mentor for hints rather than copied answers',
    ],
    presentation: 'interactive',
    miniActionLabel: 'Open study chat',
    miniActionDescription: 'See the rooms where members check in together.',
  },
  {
    id: 'step-profile',
    key: 'profile',
    title: 'Your growth story',
    tab: 'profile',
    selector: '[data-tour="profile-section"]',
    fallbackSelector: '[data-tour="nav-profile"]',
    message: 'Your profile brings your progress, code, preferences and earned badges together—and you can edit it anytime.',
    highlights: [
      'Update your photo and personal details',
      'See real milestones and collectible badges',
    ],
    presentation: 'spotlight',
  },
] satisfies TourStepDef[]).filter((step) => ['dashboard', 'learning', 'community', 'profile'].includes(step.key));

function sampleQuestionForProfile(profile: OnboardingProfile, activeCourse?: CourseItem): string {
  const field = (profile.field || '').toLowerCase();
  const topic = activeCourse?.currentTopic || '';
  if (topic) {
    return `Explain "${topic}" in simple beginner steps, and give me one small practice prompt to test myself without giving away the answer.`;
  }
  if (field.includes('python') || field.includes('ai') || field.includes('data')) {
    return 'I am learning Python and AI basics. Can you explain how functions and JSON data work together using a simple example?';
  }
  if (field.includes('backend')) {
    return 'Explain the difference between a GET and POST request in a beginner-friendly way with a small example.';
  }
  if (field.includes('design') || field.includes('ui')) {
    return 'What are the 3 most important spacing and contrast rules to make a web layout look clean and accessible?';
  }
  return 'Can you explain how state and events work together in a web interface, and give me a small practice hint?';
}

// ============================================================================
// 1. FIRST WELCOME EXPERIENCE
// ============================================================================
export const WelcomeExperience: React.FC<{
  open: boolean;
  profile: OnboardingProfile;
  activeCourse?: CourseItem;
  selectedRoadmap: RoadmapItem;
  onStartTour: () => void;
  onExploreOwn: () => void;
  styles: any;
}> = ({ open, profile, activeCourse, selectedRoadmap, onStartTour, onExploreOwn, styles }) => {
  const { borderClass, textPrimary, textSecondary, subtleBgClass, btnPrimary, btnSecondary } = styles;

  if (!open) return null;

  const firstName = (profile.fullName || '').trim().split(' ')[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-headline"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/55 backdrop-blur-sm overflow-y-auto"
    >
      <div className={`w-full max-w-2xl rounded-2xl border ${borderClass} bg-[var(--surface-elevated)] shadow-[var(--shadow-lg)] overflow-hidden my-auto`}>
        <div className="pastel-aqua text-[var(--ink-primary)] px-6 py-6 sm:px-8 sm:py-7 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--ink-secondary)]">
              <Sparkles className="w-3.5 h-3.5 text-[var(--spark)]" />
              {firstName ? `Ready for you, ${firstName}` : 'Your workspace is ready'}
            </span>
            <button
              type="button"
              onClick={onExploreOwn}
              aria-label="Close welcome screen"
              className="p-2 -mr-2 rounded-full text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-elevated)]/60 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <h1 id="welcome-headline" className="font-display text-2xl sm:text-3xl font-bold leading-tight">
            Welcome to Dev Hub
          </h1>
          <p className="text-sm sm:text-base text-[var(--ink-secondary)] leading-relaxed max-w-[58ch]">
            Track your course, see your daily progress, and get unstuck with peers or the AI Mentor.
          </p>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {/* Personalized track badge */}
          <div className={`p-3.5 rounded-xl border ${borderClass} ${subtleBgClass} flex flex-wrap items-center justify-between gap-3 text-sm`}>
            <div className="min-w-0">
              <span className={`text-xs uppercase tracking-wider font-semibold ${textSecondary}`}>Your personalized path</span>
              <p className={`font-semibold truncate ${textPrimary}`}>
                {selectedRoadmap.title}
                {activeCourse ? ` · ${activeCourse.title}` : ''}
              </p>
            </div>
            <span className="text-xs font-medium text-[var(--accent-600)] shrink-0">
              {profile.skillLevel || 'Beginner'} · {profile.studyTime || 'Daily study'}
            </span>
          </div>

          <div className="space-y-2.5">
            <p className={`text-xs font-semibold uppercase tracking-wider ${textSecondary}`}>Three things to remember</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {DEV_HUB_OFFERINGS.map(({ icon: Icon, label }, index) => (
                <div key={label} className={`flex items-center gap-3 px-4 py-4 rounded-2xl ${index === 0 ? 'pastel-yellow' : index === 1 ? 'pastel-pink' : 'pastel-lilac'}`}>
                  <Icon className="w-4 h-4 text-[var(--accent-600)] shrink-0" aria-hidden="true" />
                  <span className={`text-sm font-medium ${textPrimary}`}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className={`pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t ${borderClass}`}>
            <p className={`text-xs ${textSecondary}`}>
              Replay the tutorial anytime from Help.
            </p>
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
              <button type="button" onClick={onExploreOwn} className={`${btnSecondary} min-h-[44px] justify-center`}>
                Skip for now
              </button>
              <button type="button" onClick={onStartTour} className={`${btnPrimary} min-h-[44px] justify-center`}>
                Show me around
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. INTERACTIVE GUIDED PRODUCT TOUR
// ============================================================================
export const ProductTour: React.FC<{
  open: boolean;
  stepIndex: number;
  onStepChange: (index: number) => void;
  onSwitchTab: (tab: string) => void;
  onFinish: () => void;
  onPause: (currentStep: number) => void;
  onSkip: () => void;
  onTryMentorSample: (prompt: string) => void;
  onOpenActiveCourse: () => void;
  onRecordMiniTutorial: (key: string) => void;
  profile: OnboardingProfile;
  activeCourse?: CourseItem;
  selectedRoadmap: RoadmapItem;
  styles: any;
}> = ({
  open,
  stepIndex,
  onStepChange,
  onSwitchTab,
  onFinish,
  onPause,
  onSkip,
  onTryMentorSample,
  onOpenActiveCourse,
  onRecordMiniTutorial,
  profile,
  activeCourse,
  selectedRoadmap,
  styles,
}) => {
  const { borderClass, textPrimary, textSecondary, subtleBgClass } = styles;
  const steps = useMemo(() => buildTourSteps(), []);
  const clampedIndex = Math.max(0, Math.min(steps.length - 1, stepIndex));
  const step = steps[clampedIndex];

  const [targetRect, setTargetRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number }>({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  });
  const [miniDone, setMiniDone] = useState<string | null>(null);

  // Switch application tab to match the current tour step
  useEffect(() => {
    if (!open || !step) return;
    onSwitchTab(step.tab);
    setMiniDone(null);
  }, [open, step?.id]);

  // Measure target element rect & scroll off-screen targets smoothly
  useEffect(() => {
    if (!open || !step) {
      setTargetRect(null);
      return;
    }

    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let scrolledThisStep = false;

    const findAndMeasure = () => {
      if (cancelled) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setViewport({ w: vw, h: vh });

      const primaryEl = document.querySelector(step.selector) as HTMLElement | null;
      const fallbackEl = document.querySelector(step.fallbackSelector) as HTMLElement | null;
      const el =
        primaryEl && primaryEl.getBoundingClientRect().width > 0
          ? primaryEl
          : fallbackEl && fallbackEl.getBoundingClientRect().width > 0
          ? fallbackEl
          : null;

      if (!el) {
        setTargetRect(null);
        return;
      }

      if (!scrolledThisStep) {
        scrolledThisStep = true;
        const r = el.getBoundingClientRect();
        if (r.top < 72 || r.bottom > vh - 120) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
      }

      const rect = el.getBoundingClientRect();
      // Clamp highlighted box cleanly within viewport height if the target section is tall
      const visibleTop = Math.max(8, rect.top);
      const visibleBottom = Math.min(vh - 8, rect.bottom);
      const clampedHeight = Math.max(48, Math.min(rect.height, Math.max(80, visibleBottom - visibleTop)));

      setTargetRect({
        top: rect.top < 0 ? 12 : rect.top,
        left: Math.max(6, rect.left),
        width: Math.min(vw - 12, rect.width),
        height: Math.min(vh - 24, clampedHeight),
      });

      if (observer) observer.disconnect();
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => findAndMeasure());
        observer.observe(el);
      }
    };

    const t1 = setTimeout(findAndMeasure, 90);
    const t2 = setTimeout(findAndMeasure, 340);
    const t3 = setTimeout(findAndMeasure, 700);

    window.addEventListener('resize', findAndMeasure);
    window.addEventListener('scroll', findAndMeasure, true);

    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      if (observer) observer.disconnect();
      window.removeEventListener('resize', findAndMeasure);
      window.removeEventListener('scroll', findAndMeasure, true);
    };
  }, [open, step?.id]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        onPause(clampedIndex);
      } else if (e.key === 'ArrowRight') {
        if (clampedIndex < steps.length - 1) onStepChange(clampedIndex + 1);
      } else if (e.key === 'ArrowLeft') {
        if (clampedIndex > 0) onStepChange(clampedIndex - 1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, clampedIndex, steps.length, onPause, onStepChange]);

  if (!open || !step) return null;

  const isMobile = viewport.w < 768;
  const pad = 6;
  const spotlight = targetRect
    ? {
        x: Math.max(0, targetRect.left - pad),
        y: Math.max(0, targetRect.top - pad),
        w: Math.min(viewport.w, targetRect.width + pad * 2),
        h: Math.min(viewport.h, targetRect.height + pad * 2),
      }
    : null;

  // Smart desktop tooltip placement so it avoids covering the highlighted area where possible
  const popoverWidth = Math.min(410, viewport.w - 32);
  const popoverStyle: React.CSSProperties = (() => {
    if (isMobile) {
      return {
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        zIndex: 62,
      };
    }
    if (!spotlight) {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: popoverWidth,
        zIndex: 62,
      };
    }

    const spaceRight = viewport.w - (spotlight.x + spotlight.w);
    const spaceLeft = spotlight.x;
    const spaceBottom = viewport.h - (spotlight.y + spotlight.h);
    const spaceTop = spotlight.y;

    let top = 24;
    let left = Math.max(16, Math.min(viewport.w - popoverWidth - 16, spotlight.x));

    if (spaceBottom >= 290) {
      top = spotlight.y + spotlight.h + 14;
    } else if (spaceTop >= 290) {
      top = Math.max(16, spotlight.y - 340);
    } else if (spaceRight >= popoverWidth + 24) {
      left = spotlight.x + spotlight.w + 16;
      top = Math.max(20, Math.min(viewport.h - 380, spotlight.y));
    } else if (spaceLeft >= popoverWidth + 24) {
      left = spotlight.x - popoverWidth - 16;
      top = Math.max(20, Math.min(viewport.h - 380, spotlight.y));
    } else {
      // Target fills most of viewport (e.g. main workspace card) — dock cleanly at bottom-right
      left = Math.max(16, viewport.w - popoverWidth - 24);
      top = Math.max(20, viewport.h - 420);
    }

    return {
      position: 'fixed',
      top: Math.max(16, Math.min(viewport.h - 360, top)),
      left,
      width: popoverWidth,
      zIndex: 62,
    };
  })();

  const handleMiniAction = () => {
    onRecordMiniTutorial(step.key);
    if (step.key === 'learning') {
      onOpenActiveCourse();
      setMiniDone('Opened Today’s Learning so you can jump right into your next lesson.');
    } else if (step.key === 'ai-mentor') {
      const prompt = sampleQuestionForProfile(profile, activeCourse);
      onTryMentorSample(prompt);
      setMiniDone('Sample question loaded in your AI Mentor input — press Send whenever you’re ready.');
    } else if (step.key === 'quizzes') {
      onSwitchTab('quizzes');
      setMiniDone('Viewing your Quizzes & Assessments list.');
    } else if (step.key === 'projects') {
      onSwitchTab('showcase');
      setMiniDone('Switched to Project Showcase so you can browse completed builds.');
    } else if (step.key === 'community') {
      onSwitchTab('study-chat');
      setMiniDone('Switched to Live Study Group Chat rooms.');
    }
  };

  return (
    <div aria-live="polite">
      {/* Spotlight backdrop */}
      <svg
        className="fixed inset-0 z-[60] pointer-events-none w-full h-full"
        width={viewport.w}
        height={viewport.h}
        aria-hidden="true"
      >
        <defs>
          <mask id="devhub-tour-spotlight-mask">
            <rect x="0" y="0" width={viewport.w} height={viewport.h} fill="white" />
            {spotlight && (
              <rect
                x={spotlight.x}
                y={spotlight.y}
                width={spotlight.w}
                height={spotlight.h}
                rx="14"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width={viewport.w}
          height={viewport.h}
          fill="rgba(15, 23, 42, 0.56)"
          mask="url(#devhub-tour-spotlight-mask)"
        />
      </svg>

      {/* Click-blocker outside card with gentle pause click */}
      <div
        className="fixed inset-0 z-[61] bg-transparent"
        onClick={() => onPause(clampedIndex)}
        aria-hidden="true"
      />

      {/* Crisp spotlight ring */}
      {spotlight && (
        <div
          aria-hidden="true"
          className="fixed z-[61] pointer-events-none rounded-[14px] ring-2 ring-[var(--spark)] shadow-[0_0_0_4px_rgba(59,130,246,0.2)] transition-all duration-200"
          style={{
            top: spotlight.y,
            left: spotlight.x,
            width: spotlight.w,
            height: spotlight.h,
          }}
        />
      )}

      {/* Contextual Tour Card */}
      <section
        role="dialog"
        aria-modal="false"
        aria-label={`Product tour: ${step.title}`}
        style={popoverStyle}
        onClick={(e) => e.stopPropagation()}
        className={`rounded-2xl border ${borderClass} bg-[var(--surface-elevated)] shadow-[var(--shadow-lg)] p-5 space-y-4 max-h-[82dvh] overflow-y-auto`}
      >
        {/* Top bar: progress & close/resume */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-600)] tabular-nums">
              Step {clampedIndex + 1} of {steps.length}
            </span>
            <span className={`text-xs ${textSecondary}`}>·</span>
            <span className={`text-xs capitalize ${textSecondary}`}>
              {step.presentation === 'intro' ? 'Overview' : step.presentation === 'interactive' ? 'Try it' : 'Feature guide'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPause(clampedIndex)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${textSecondary} hover:bg-[var(--surface-subtle)] cursor-pointer`}
            >
              Resume later
            </button>
            <button
              type="button"
              aria-label="Close and resume tour later"
              onClick={() => onPause(clampedIndex)}
              className={`p-1.5 rounded-full ${textSecondary} hover:bg-[var(--surface-subtle)] cursor-pointer`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Step progress bars */}
        <div className="flex gap-1" aria-hidden="true">
          {steps.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Jump to step ${idx + 1}: ${s.title}`}
              onClick={() => onStepChange(idx)}
              className={`h-1.5 flex-1 rounded-full cursor-pointer transition-colors ${
                idx <= clampedIndex ? 'bg-[var(--spark)]' : 'bg-[var(--border-hairline)]'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="space-y-2">
          <h2 className={`font-display text-lg font-bold leading-snug ${textPrimary}`}>{step.title}</h2>
          <p className={`text-sm font-medium leading-relaxed text-[var(--accent-600)]`}>“{step.message}”</p>
          <ul className={`space-y-1.5 pt-1 text-xs leading-relaxed ${textSecondary}`}>
            {step.highlights.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success-ink)] shrink-0 mt-0.5" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Personalized context strip on Step 1 */}
        {step.key === 'dashboard' && (
          <div className={`p-3 rounded-xl border ${borderClass} ${subtleBgClass} text-xs space-y-1`}>
            <div className={`font-semibold ${textPrimary}`}>Tailored for {profile.field || 'your track'}</div>
            <div className={textSecondary}>
              Path: <strong>{selectedRoadmap.title}</strong>
              {activeCourse ? ` · Active course: ${activeCourse.title}` : ''}
            </div>
          </div>
        )}

        {/* Optional Interactive Mini-Tutorial */}
        {step.miniActionLabel && (
          <div className={`p-3 rounded-xl border ${borderClass} ${subtleBgClass} space-y-2`}>
            <p className={`text-xs ${textSecondary}`}>{step.miniActionDescription}</p>
            <button
              type="button"
              onClick={handleMiniAction}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[var(--accent-600)] text-[var(--accent-600)] hover:bg-[var(--accent-50)] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{step.miniActionLabel}</span>
            </button>
            {miniDone && <p className="text-[11px] font-medium text-[var(--success-ink)]">{miniDone}</p>}
          </div>
        )}

        {/* Navigation footer */}
        <div className={`pt-2 border-t ${borderClass} flex flex-wrap items-center justify-between gap-2`}>
          <button
            type="button"
            onClick={onSkip}
            className={`min-h-[40px] px-2 text-xs font-medium ${textSecondary} hover:${textPrimary} underline cursor-pointer`}
          >
            Skip tour
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              disabled={clampedIndex === 0}
              onClick={() => onStepChange(clampedIndex - 1)}
              className={`min-h-[42px] px-3.5 rounded-full border ${borderClass} text-xs font-semibold ${textPrimary} disabled:opacity-40 cursor-pointer inline-flex items-center gap-1`}
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Previous
            </button>
            {clampedIndex < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => onStepChange(clampedIndex + 1)}
                className="min-h-[42px] px-4 rounded-full bg-[var(--accent-600)] text-white text-xs font-semibold cursor-pointer inline-flex items-center gap-1 hover:opacity-95"
              >
                Next <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onFinish}
                className="min-h-[42px] px-4 rounded-full bg-[var(--accent-600)] text-white text-xs font-semibold cursor-pointer inline-flex items-center gap-1 hover:opacity-95"
              >
                Finish tour <CheckCircle2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// 3. FIRST LEARNING SESSION LAUNCH MODAL
// ============================================================================
export const FirstLearningSessionModal: React.FC<{
  open: boolean;
  selectedRoadmap: RoadmapItem;
  activeCourse?: CourseItem;
  dailyTarget: DailyTarget;
  onStartLearning: () => void;
  onClose: () => void;
  styles: any;
}> = ({ open, selectedRoadmap, activeCourse, dailyTarget, onStartLearning, onClose, styles }) => {
  const { borderClass, textPrimary, textSecondary, subtleBgClass, btnPrimary, btnSecondary } = styles;
  if (!open) return null;

  const activeTopic = activeCourse?.currentTopic || dailyTarget.topic || selectedRoadmap.topics[0]?.name || 'Foundations';
  const recommendedActivity = dailyTarget.objective || dailyTarget.exerciseTitle || 'Complete your next lesson and review check';
  const estMinutes = dailyTarget.estimatedMinutes || 25;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-session-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
    >
      <div className={`w-full max-w-lg rounded-2xl border ${borderClass} bg-[var(--surface-elevated)] shadow-[var(--shadow-lg)] p-6 sm:p-8 space-y-5`}>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--accent-600)]">
              <Award className="w-4 h-4" /> Tour Complete
            </span>
            <h2 id="first-session-title" className={`font-display text-2xl font-bold leading-tight ${textPrimary}`}>
              You're all set. Let's take your first step.
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`p-2 -mr-2 rounded-full ${textSecondary} hover:bg-[var(--surface-subtle)] cursor-pointer`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className={`rounded-xl border ${borderClass} ${subtleBgClass} p-4 space-y-3`}>
          <div>
            <span className={`text-xs uppercase tracking-wider font-semibold ${textSecondary}`}>Active learning path</span>
            <p className={`text-sm font-semibold ${textPrimary}`}>
              {selectedRoadmap.title}
              {activeCourse ? ` — ${activeCourse.title}` : ''}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <span className={`text-xs uppercase tracking-wider font-semibold ${textSecondary}`}>Current topic</span>
              <p className={`text-sm font-medium ${textPrimary}`}>{activeTopic}</p>
            </div>
            <div>
              <span className={`text-xs uppercase tracking-wider font-semibold ${textSecondary}`}>Estimated time</span>
              <p className={`text-sm font-medium flex items-center gap-1.5 ${textPrimary}`}>
                <Clock className="w-3.5 h-3.5 text-[var(--accent-600)]" /> {estMinutes} minutes
              </p>
            </div>
          </div>
          <div className={`pt-2 border-t ${borderClass}`}>
            <span className={`text-xs uppercase tracking-wider font-semibold ${textSecondary}`}>Recommended first activity</span>
            <p className={`text-sm leading-relaxed mt-0.5 ${textPrimary}`}>{recommendedActivity}</p>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5">
          <button type="button" onClick={onClose} className={`${btnSecondary} min-h-[44px] justify-center`}>
            Stay on Dashboard
          </button>
          <button type="button" onClick={onStartLearning} className={`${btnPrimary} min-h-[44px] justify-center`}>
            Start Learning <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 4. HELP & DISCOVERY DRAWER
// ============================================================================
const FAQS = [
  {
    q: 'How does Dev Hub handle external courses (Udemy, Coursera, YouTube, ZIPs)?',
    a: 'You can track courses from any source in My Courses—or combine multiple sources together. Video files from downloaded course archives are automatically skipped for privacy and speed; Dev Hub uses your syllabus, markdown notes, PDFs, and starter code to organize daily targets.',
  },
  {
    q: 'Does skipping the welcome tour lock any features?',
    a: 'No. Every workspace tool, roadmap, quiz, project showcase, AI mentor, and live study chat stays unlocked whether you finish or skip the tour.',
  },
  {
    q: 'How does the AI Mentor help me actually learn?',
    a: 'Instead of handing over finished solutions, AI Mentor gives plain-English explanations, debugging hints, and practice prompts tailored to your active topic and skill level.',
  },
  {
    q: 'How does Live Study Group Chat work?',
    a: 'Every room in Study Group Chat connects online members in real time via WebSocket. Pick a topic room like #frontend or #general from Community or the floating Study Chat button.',
  },
];

export const HelpDiscoveryDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  tutorialState: TutorialState;
  onStartTourFromStep: (stepIndex: number) => void;
  onOpenWelcome: () => void;
  styles: any;
}> = ({ open, onClose, tutorialState, onStartTourFromStep, onOpenWelcome, styles }) => {
  const { borderClass, textPrimary, textSecondary, subtleBgClass, btnPrimary, btnSecondary } = styles;
  const steps = useMemo(() => buildTourSteps(), []);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const canResume = !tutorialState.tourCompleted && tutorialState.lastTourStep > 0 && tutorialState.lastTourStep < steps.length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-xs" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Help and platform discovery"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md h-full border-l ${borderClass} bg-[var(--surface-elevated)] shadow-[var(--shadow-lg)] flex flex-col overflow-hidden`}
      >
        <div className={`px-5 py-4 border-b ${borderClass} flex items-center justify-between gap-3`}>
          <div className="flex items-center gap-2.5">
            <HelpCircle className="w-5 h-5 text-[var(--accent-600)]" />
            <h2 className={`font-display text-lg font-bold ${textPrimary}`}>Help & Feature Discovery</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help drawer"
            className={`p-2 rounded-full ${textSecondary} hover:bg-[var(--surface-subtle)] cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Guided tour launch / resume */}
          <section className={`rounded-xl border ${borderClass} ${subtleBgClass} p-4 space-y-3`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`text-sm font-bold flex items-center gap-2 ${textPrimary}`}>
                <Compass className="w-4 h-4 text-[var(--accent-600)]" /> Interactive Guided Tour
              </span>
              {tutorialState.tourCompleted && (
                <span className="text-xs font-semibold text-[var(--success-ink)]">Completed</span>
              )}
            </div>
            <p className={`text-xs leading-relaxed ${textSecondary}`}>
              Walk through each real workspace control step by step—from your daily path to AI Mentor, quizzes, projects, and community chat.
            </p>
            <div className="flex flex-wrap gap-2">
              {canResume && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onStartTourFromStep(tutorialState.lastTourStep);
                  }}
                  className={`${btnPrimary} min-h-[42px] text-xs`}
                >
                  Resume Tour (Step {tutorialState.lastTourStep + 1})
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartTourFromStep(0);
                }}
                className={`${canResume ? btnSecondary : btnPrimary} min-h-[42px] text-xs`}
              >
                <RotateCcw className="w-3.5 h-3.5" /> {tutorialState.tourCompleted ? 'Replay Full Tour' : 'Start Quick Tour'}
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenWelcome();
                }}
                className={`${btnSecondary} min-h-[42px] text-xs`}
              >
                Welcome Overview
              </button>
            </div>
          </section>

          {/* How Dev Hub works */}
          <section className="space-y-2.5">
            <h3 className={`text-xs font-semibold uppercase tracking-wider ${textSecondary}`}>How Dev Hub Works</h3>
            <ol className="space-y-2 text-xs">
              {[
                ['1. Follow your path', 'Pick a roadmap.sh career path or combine Udemy, Coursera, YouTube, and downloaded course materials.'],
                ['2. Focus on today', 'Use Today’s Learning for clear daily objectives, code practice, and AI Mentor hints.'],
                ['3. Test & build', 'Take topic quizzes to spot weak areas and submit real projects for feedback.'],
                ['4. Grow together', 'Ask questions, share wins, and study live with peers in Study Group Chat.'],
              ].map(([title, desc]) => (
                <li key={title} className={`p-3 rounded-xl border ${borderClass} bg-[var(--surface-bg)] space-y-0.5`}>
                  <div className={`font-semibold ${textPrimary}`}>{title}</div>
                  <div className={textSecondary}>{desc}</div>
                </li>
              ))}
            </ol>
          </section>

          {/* Jump directly to mini feature tutorials */}
          <section className="space-y-2.5">
            <h3 className={`text-xs font-semibold uppercase tracking-wider ${textSecondary}`}>Jump to Feature Guide</h3>
            <div className={`divide-y ${borderClass} rounded-xl border ${borderClass} overflow-hidden`}>
              {steps.map((s, idx) => {
                const done = tutorialState.completedMiniTutorials.includes(s.key);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      onClose();
                      onStartTourFromStep(idx);
                    }}
                    className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-2 hover:bg-[var(--surface-subtle)] cursor-pointer min-h-[44px]`}
                  >
                    <div className="min-w-0">
                      <div className={`text-sm font-medium truncate ${textPrimary}`}>
                        {idx + 1}. {s.title}
                      </div>
                      <div className={`text-xs truncate ${textSecondary}`}>{s.message}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {done && <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success-ink)]" />}
                      <ChevronRight className={`w-4 h-4 ${textSecondary}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* FAQs */}
          <section className="space-y-2.5">
            <h3 className={`text-xs font-semibold uppercase tracking-wider ${textSecondary}`}>Frequently Asked Questions</h3>
            <div className="space-y-2">
              {FAQS.map((item, idx) => {
                const expanded = openFaq === idx;
                return (
                  <div key={item.q} className={`rounded-xl border ${borderClass} overflow-hidden`}>
                    <button
                      type="button"
                      onClick={() => setOpenFaq(expanded ? null : idx)}
                      aria-expanded={expanded}
                      className={`w-full px-3.5 py-3 text-left flex items-center justify-between gap-2 text-xs font-semibold ${textPrimary} cursor-pointer min-h-[44px]`}
                    >
                      <span>{item.q}</span>
                      <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                    {expanded && <p className={`px-3.5 pb-3 text-xs leading-relaxed ${textSecondary}`}>{item.a}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
};

// Persistent non-intrusive Help button
export const HelpTriggerButton: React.FC<{
  onClick: () => void;
  hasPausedTour?: boolean;
  compact?: boolean;
  className?: string;
}> = ({ onClick, hasPausedTour, compact, className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="Open help and product tour"
    className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] ${
      compact ? 'min-w-[44px] px-2.5' : 'px-3.5'
    } rounded-full border border-[var(--border-hairline)] text-sm font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-subtle)] cursor-pointer transition-colors ${className}`}
  >
    <HelpCircle className="w-4 h-4 text-[var(--accent-600)] shrink-0" />
    {!compact && <span>Help</span>}
    {hasPausedTour && <span className="w-2 h-2 rounded-full bg-[var(--spark)] shrink-0" title="Tour paused — resume anytime" />}
  </button>
);
