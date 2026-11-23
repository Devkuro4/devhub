import React, { useRef, useState } from 'react';
import {
  BookOpen,
  Bot,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  FolderGit2,
  ListChecks,
  Map as MapIcon,
  Megaphone,
  MessageSquare,
  Play,
  Search,
  SlidersHorizontal,
  Trophy,
  Users,
} from 'lucide-react';
import { PersonalPath } from './PersonalPath';
import { type StartAction } from '../lib/startLearning';
import { ProgressBar } from './ui';
import { DashboardMilestoneStrip } from './MilestoneBadges';
import { IndependenceCard } from './IndependenceCard';
import { HomeLevelCard } from './CompeteSection';
import type { GamificationSummary } from '../lib/gamification';
import type { IndependenceSummary } from '../lib/independence';
import type {
  CodeSubmission,
  CommunityEvent,
  CommunityPost,
  CourseItem,
  DailyTarget,
  MilestoneSummary,
  OnboardingProfile,
  LearningPlan,
  PersonalMilestone,
  QuizAttempt,
  QuizItem,
  RoadmapItem,
  RoadmapTopicProgress,
  WeeklyProjectItem,
} from '../types';

const initialsOf = (n: string) =>
  (n || '').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'D';

const TYPE_CHIP = 'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-[var(--accent-50)] text-[var(--accent-700)] whitespace-nowrap';
const ACTION_CHIP = 'inline-flex items-center justify-center rounded-md px-3 min-h-8 text-xs font-semibold bg-[var(--accent-50)] text-[var(--accent-700)] hover:bg-[var(--accent-100)] whitespace-nowrap cursor-pointer';
const THUMBS = [
  'bg-[var(--panel-deep)] text-white/70',
  'bg-[var(--accent-50)] text-[var(--accent-700)]',
  'bg-[var(--surface-subtle)] text-[var(--ink-secondary)]',
];

export const HomeDashboard = ({
  firstName,
  greeting,
  profile,
  onUpdateProfile,
  onboarded,
  onStartOnboarding,
  startAction,
  onStartLearning,
  onContinueCourse,
  onPersonalize,
  personalized,
  courses,
  learningPlans,
  dailyTarget,
  codeSubmissions,
  quizzes,
  quizAttempts,
  weeklyProjects,
  allRoadmaps,
  selectedRoadmap,
  onSelectRoadmap,
  roadmapProgress,
  personalMilestones,
  setPersonalMilestones,
  posts,
  presentations,
  challenges,
  helpRequests,
  dailyLogs,
  quickCheckInText,
  setQuickCheckInText,
  shareCheckInAsWin,
  setShareCheckInAsWin,
  onQuickCheckIn,
  onNavigate,
  onNotify,
  milestones,
  gamification,
  independence,
  teamRoster,
  userName,
  onViewMember,
  tutorialState,
  onStartTour,
  styles,
}: {
  firstName: string;
  greeting: string;
  profile: OnboardingProfile;
  onUpdateProfile?: (patch: Partial<OnboardingProfile>) => void;
  onboarded: boolean;
  onStartOnboarding: () => void;
  startAction: StartAction;
  onStartLearning: () => void;
  onContinueCourse: (courseId: string) => void;
  onPersonalize: () => void;
  personalized: boolean;
  courses: CourseItem[];
  learningPlans: LearningPlan[];
  dailyTarget: DailyTarget;
  codeSubmissions: CodeSubmission[];
  quizzes: QuizItem[];
  quizAttempts: QuizAttempt[];
  weeklyProjects: WeeklyProjectItem[];
  allRoadmaps?: RoadmapItem[];
  selectedRoadmap: RoadmapItem;
  onSelectRoadmap?: (id: string) => void;
  roadmapProgress: Record<string, RoadmapTopicProgress>;
  personalMilestones?: PersonalMilestone[];
  setPersonalMilestones?: React.Dispatch<React.SetStateAction<PersonalMilestone[]>>;
  posts: CommunityPost[];
  presentations: CommunityEvent[];
  challenges: any[];
  helpRequests: any[];
  dailyLogs: any[];
  quickCheckInText: string;
  setQuickCheckInText: (v: string) => void;
  shareCheckInAsWin: boolean;
  setShareCheckInAsWin: (v: boolean) => void;
  onQuickCheckIn: (e: React.FormEvent) => void;
  onNavigate: (tab: string) => void;
  onNotify?: (msg: string, tone?: 'success' | 'error') => void;
  milestones: MilestoneSummary;
  gamification: GamificationSummary;
  independence: IndependenceSummary;
  teamRoster: any[];
  userName: string;
  onViewMember?: (member: any) => void;
  tutorialState?: {
    welcomeCompleted: boolean;
    tourCompleted: boolean;
    tourSkipped: boolean;
    lastTourStep: number;
  };
  onStartTour?: (stepIndex?: number) => void;
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
  const { cardClass, borderClass, subtleBgClass, textPrimary, textSecondary, inputClass, btnPrimary, btnSecondary } = styles;

  const latestCourse = courses[0];
  const latestSubmission = codeSubmissions[0];
  const latestQuizAttempt = quizAttempts[0];
  const latestWeeklyProject = weeklyProjects[0];

  const topicStatuses = selectedRoadmap.topics.map((t) => roadmapProgress[t.id]?.status || 'Not Started');
  const demonstratedCount = topicStatuses.filter((s) => s === 'Demonstrated' || s === 'Completed').length;
  // Today's 4 clear learning steps (accurate topic matching)
  const hasLearnedTopic = dailyTarget.status !== 'Not Started' || codeSubmissions.some((s) => s.topic === dailyTarget.topic);
  const hasPractisedOrSubmitted = codeSubmissions.some((s) => s.topic === dailyTarget.topic);
  const topicNorm = (dailyTarget.topic || '').trim().toLowerCase();
  const topicTokens = topicNorm.split(/\s+/).filter((w) => w.length >= 3);
  const matchesDaily = (txt: string) => {
    const low = String(txt || '').trim().toLowerCase();
    if (!low || !topicNorm) return false;
    if (low === topicNorm || low.includes(topicNorm) || topicNorm.includes(low)) return true;
    return topicTokens.some((tok) => low.includes(tok));
  };
  const topicQuiz = quizzes.find((q) => matchesDaily(q.topic) || matchesDaily(q.title)) || quizzes[0];
  const hasQuizAttempt = quizAttempts.some(
    (a) =>
      (topicQuiz && a.quizId === topicQuiz.id) ||
      matchesDaily(a.quizTitle) ||
      (a.strongTopics || []).some(matchesDaily)
  );

  const todayChecklist = [
    {
      id: 'learn',
      label: 'Learn your topic',
      detail: dailyTarget.topic,
      done: hasLearnedTopic,
      tab: 'today',
    },
    {
      id: 'practice',
      label: 'Complete your practice',
      detail: dailyTarget.exerciseTitle,
      done: hasPractisedOrSubmitted,
      tab: 'today',
    },
    {
      id: 'submit',
      label: 'Submit your code',
      detail: hasPractisedOrSubmitted ? 'Submitted for review' : 'Paste, upload files, or link GitHub',
      done: hasPractisedOrSubmitted,
      tab: 'today',
    },
    {
      id: 'quiz',
      label: 'Take your quiz',
      detail: topicQuiz ? topicQuiz.title : 'Check what clicked',
      done: hasQuizAttempt,
      tab: 'quizzes',
    },
  ];

  const nextActivity = todayChecklist.find((item) => !item.done) || todayChecklist[0];
  const importantAnnouncement = posts.find((p) => p.category === 'Announcement' || p.pinned) || posts[0];
  const nextEvent = presentations[0];
  const openChallenge = challenges.find((c) => c.status !== 'Completed') || challenges[0];
  const openQuestionsCount = helpRequests.filter((h) => h.status !== 'Resolved').length;

  const totalCourseModules = courses.reduce((s, c) => s + (c.modules?.length || 0), 0);
  const doneCourseModules = courses.reduce((s, c) => s + (c.modules?.filter((m) => m.completed).length || 0), 0);
  const rollup = totalCourseModules
    ? Math.round((doneCourseModules / totalCourseModules) * 100)
    : courses.length
      ? Math.round(courses.reduce((s, c) => s + (c.progress || 0), 0) / courses.length)
      : Math.round((demonstratedCount / Math.max(1, selectedRoadmap.topics.length)) * 100);
  const doneCount = todayChecklist.filter((s) => s.done).length;
  const isBrandNewMember =
    startAction.kind === 'resume-onboarding' ||
    (startAction.kind === 'start-onboarding' && !latestCourse && codeSubmissions.length === 0 && dailyLogs.length === 0);
  const showPersonalize = onboarded && !personalized && !isBrandNewMember;

  // --- search + filter over courses
  const [query, setQuery] = useState('');
  const [unfinishedOnly, setUnfinishedOnly] = useState(false);
  const [learningPlanOpen, setLearningPlanOpen] = useState(false);
  const rail = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();
  const visibleCourses = courses.filter(
    (c) =>
      (!unfinishedOnly || (c.progress || 0) < 100) &&
      (!q || `${c.title} ${c.platform} ${c.field} ${c.instructor}`.toLowerCase().includes(q))
  );
  const scrollRail = (dir: 1 | -1) => rail.current?.scrollBy({ left: dir * 300, behavior: 'smooth' });

  // --- right panel data
  const fullName = userName || profile.fullName || firstName;
  const ringC = 2 * Math.PI * 54;
  const ringPct = Math.min(100, Math.max(0, rollup));
  const recentScores = quizAttempts.slice(0, 5).reverse();
  const people = (teamRoster || [])
    .filter((m: any) => m.name !== fullName)
    .sort((a: any, b: any) => (a.role === 'Member' ? 1 : 0) - (b.role === 'Member' ? 1 : 0))
    .slice(0, 5);

  // --- activity table (everything that used to be in "latest work" and "around the hub")
  const activity: { icon: React.ElementType; title: string; sub: string; type: string; detail: string; cta: string; tab: string }[] = [
    {
      icon: Code2,
      title: latestSubmission ? latestSubmission.exerciseTitle : 'Your first code review',
      sub: latestSubmission ? latestSubmission.topic : 'Not started',
      type: 'Code review',
      detail: latestSubmission?.review?.nextStep || 'Submit today’s practice for a gentle review.',
      cta: latestSubmission ? 'Feedback' : 'Start',
      tab: 'submissions',
    },
    {
      icon: BookOpen,
      title: latestQuizAttempt ? latestQuizAttempt.quizTitle : 'Your first quiz',
      sub: latestQuizAttempt ? `${latestQuizAttempt.score}/${latestQuizAttempt.total} correct` : 'Not started',
      type: 'Quiz',
      detail: latestQuizAttempt ? `You scored ${latestQuizAttempt.percentage}%.` : 'A short quiz shows what clicked.',
      cta: 'Quizzes',
      tab: 'quizzes',
    },
    {
      icon: FolderGit2,
      title: latestWeeklyProject ? latestWeeklyProject.title : 'Weekly project',
      sub: latestWeeklyProject ? latestWeeklyProject.status : 'Not started',
      type: 'Project',
      detail: latestWeeklyProject ? `Due ${latestWeeklyProject.deadline}` : 'Pick a beginner-friendly project for this week.',
      cta: 'Projects',
      tab: 'weekly-project',
    },
    ...(importantAnnouncement
      ? [{ icon: Megaphone, title: importantAnnouncement.title, sub: importantAnnouncement.author, type: importantAnnouncement.category, detail: 'Pinned for the community.', cta: 'Read', tab: 'announcements' }]
      : []),
    ...(nextEvent
      ? [{ icon: Calendar, title: nextEvent.title, sub: nextEvent.type, type: 'Event', detail: nextEvent.dateTime, cta: 'Join', tab: 'events' }]
      : []),
    ...(openChallenge
      ? [{ icon: Trophy, title: openChallenge.title, sub: openChallenge.difficulty, type: 'Challenge', detail: 'This week’s challenge.', cta: 'Try it', tab: 'challenges' }]
      : []),
    {
      icon: MessageSquare,
      title: 'Peer help',
      sub: 'Help desk',
      type: 'Community',
      detail: `${openQuestionsCount} questions need an answer`,
      cta: 'Help',
      tab: 'pairing-help',
    },
  ];

  const statCards = [
    { icon: ListChecks, top: `${doneCount}/${todayChecklist.length} steps done`, label: 'Today’s learning', tab: nextActivity.tab },
    { icon: MapIcon, top: `${demonstratedCount}/${selectedRoadmap.topics.length} topics`, label: 'Roadmap', tab: 'roadmaps' },
    { icon: BookOpen, top: `${quizAttempts.length} taken`, label: 'Quizzes', tab: 'quizzes' },
  ];

  return (
    <div className="2xl:grid 2xl:grid-cols-[minmax(0,1fr)_380px]">
      {/* ------------------------------------------------------------ MAIN */}
      <div data-tour="home-workspace" className="p-5 sm:p-8 xl:p-10 2xl:p-12 space-y-9 sm:space-y-12 min-w-0">
        {/* Welcome + search */}
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5">
          <div>
            <p className="text-sm font-semibold text-[var(--ink-muted)]">Your Dev Hub</p>
            <h1 className="mt-1 !text-[2.1rem] sm:!text-[3rem] font-bold tracking-[-0.04em]">
              Welcome back{firstName ? `, ${firstName}` : ''} <span aria-hidden="true">👋</span>
            </h1>
          </div>
          <div className="flex items-center gap-3 sm:gap-4 xl:w-[min(100%,28rem)]">
          <label className="relative flex-1 min-w-0">
            <span className="sr-only">Search your courses</span>
            <Search className="w-5 h-5 absolute left-5 top-1/2 -translate-y-1/2 text-[var(--ink-primary)]" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search something"
              className="w-full !h-14 !pl-14 pr-5 !rounded-full text-sm !border-transparent bg-[var(--surface-elevated)] focus:!border-[var(--ink-primary)]"
            />
          </label>
          <button
            type="button"
            aria-label="Show courses still in progress"
            aria-pressed={unfinishedOnly}
            onClick={() => setUnfinishedOnly((v) => !v)}
            className={`w-14 h-14 rounded-full border-0 flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
              unfinishedOnly ? 'bg-[var(--ink-primary)] text-white' : `bg-[var(--surface-elevated)] ${textSecondary} hover:bg-[var(--pastel-aqua)]`
            }`}
          >
            <SlidersHorizontal className="w-5 h-5" aria-hidden="true" />
          </button>
          </div>
        </div>

        {/* Today's activities */}
        <section className="space-y-5" aria-labelledby="today-activities-h">
          <div className="flex items-end justify-between gap-4">
            <h2 id="today-activities-h" className="!text-[1.75rem] sm:!text-[2.15rem]">Your activities today <span className="text-[var(--ink-muted)]">({todayChecklist.length})</span></h2>
            <span className={`hidden sm:block text-sm ${textSecondary}`}>{doneCount} completed</span>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            {todayChecklist.slice(0, 2).map((item, index) => {
              const ActivityIcon = index === 0 ? BookOpen : Code2;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.tab)}
                  className={`pastel-card ${index === 0 ? 'pastel-aqua' : 'pastel-pink'} min-h-[220px] p-6 sm:p-7 flex flex-col justify-between text-left cursor-pointer transition-transform hover:-translate-y-1`}
                >
                  <span className="flex items-start justify-between gap-4">
                    <span className="w-12 h-12 rounded-full bg-white/80 flex items-center justify-center"><ActivityIcon className="w-5 h-5" /></span>
                    <span className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-bold">{item.done ? 'Completed' : `${dailyTarget.estimatedMinutes} min`}</span>
                  </span>
                  <span className="flex items-end justify-between gap-4 mt-8">
                    <span>
                      <span className="block text-sm font-medium text-[var(--ink-secondary)] line-clamp-1">{item.detail}</span>
                      <span className="block mt-1 text-xl sm:text-2xl font-bold">{item.label}</span>
                    </span>
                    <span className="round-action w-12 h-12 flex items-center justify-center shrink-0"><Play className="w-4 h-4 fill-current" /></span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-5" aria-labelledby="learning-progress-h">
          <h2 id="learning-progress-h" className="!text-[1.75rem] sm:!text-[2.15rem]">Learning progress</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
            {statCards.map((c, index) => {
              const Icon = c.icon;
              const tone = ['pastel-aqua', 'pastel-yellow', 'pastel-lilac'][index];
              return (
                <button key={c.label} type="button" onClick={() => onNavigate(c.tab)} className={`pastel-card ${tone} min-h-[160px] p-5 sm:p-6 flex flex-col justify-between text-left cursor-pointer transition-transform hover:-translate-y-1`}>
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">{c.label}</span>
                    <span className="round-action w-10 h-10 flex items-center justify-center"><Icon className="w-4 h-4" /></span>
                  </span>
                  <span className="text-2xl sm:text-3xl font-bold tabular-nums">{c.top}</span>
                </button>
              );
            })}
          </div>
        </section>

        {showPersonalize && (
          <section aria-label="Personalize your learning" className="soft-card px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--ink-secondary)] max-w-[56ch]">
              Add your current course and where you are in it, and we’ll tailor your plan. Your existing progress stays as it is.
            </p>
            <button type="button" onClick={onPersonalize} className="min-h-11 px-4 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--surface-subtle)] text-sm font-medium text-[var(--ink-primary)] cursor-pointer">
              Personalize my learning journey
            </button>
          </section>
        )}

        {tutorialState && !tutorialState.tourCompleted && tutorialState.lastTourStep > 0 && onStartTour && (
          <section aria-label="Resume guided tour" className="soft-card px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--ink-secondary)]">
              Tour paused at <strong className="text-[var(--ink-primary)]">Step {tutorialState.lastTourStep + 1} of 8</strong>. Ready to see the rest of Dev Hub?
            </p>
            <button type="button" onClick={() => onStartTour(tutorialState.lastTourStep)} className="min-h-11 px-4 rounded-full bg-[var(--accent-600)] text-white text-sm font-semibold cursor-pointer">
              Resume tour
            </button>
          </section>
        )}

        {!isBrandNewMember && (
          <section data-tour="home-learning-path" className="soft-card overflow-hidden">
            <button
              type="button"
              aria-expanded={learningPlanOpen}
              aria-controls="dashboard-learning-plan"
              onClick={() => setLearningPlanOpen((open) => !open)}
              className="w-full min-h-[72px] px-5 sm:px-6 py-4 flex items-center justify-between gap-4 text-left cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors"
            >
              <span className="min-w-0">
                <span className={`block text-sm font-semibold ${textPrimary}`}>Your learning plan</span>
                <span className={`block mt-1 text-xs sm:text-sm truncate ${textSecondary}`}>
                  {selectedRoadmap.title} · {demonstratedCount} of {selectedRoadmap.topics.length} topics complete
                </span>
              </span>
              <span className={`inline-flex items-center gap-2 text-sm font-medium shrink-0 ${textSecondary}`}>
                <span className="hidden sm:inline">{learningPlanOpen ? 'Hide details' : 'View details'}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${learningPlanOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </span>
            </button>
            {learningPlanOpen && (
              <div id="dashboard-learning-plan" className="border-t border-[var(--border-hairline)] px-4 sm:px-6 py-6">
                <PersonalPath
                  profile={profile}
                  onUpdateProfile={onUpdateProfile}
                  courses={courses}
                  learningPlans={learningPlans}
                  dailyTarget={dailyTarget}
                  allRoadmaps={allRoadmaps}
                  selectedRoadmap={selectedRoadmap}
                  onSelectRoadmap={onSelectRoadmap}
                  roadmapProgress={roadmapProgress}
                  quizAttempts={quizAttempts}
                  codeSubmissions={codeSubmissions}
                  weeklyProjects={weeklyProjects}
                  challenges={challenges}
                  personalMilestones={personalMilestones}
                  setPersonalMilestones={setPersonalMilestones}
                  startAction={startAction}
                  onStartLearning={onStartLearning}
                  onContinueCourse={onContinueCourse}
                  onPersonalize={onPersonalize}
                  onNavigate={onNavigate}
                  onNotify={onNotify}
                />
              </div>
            )}
          </section>
        )}

        {/* Continue learning */}
        <section aria-labelledby="continue-h" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="continue-h" className={`!text-base ${textPrimary}`}>Continue learning</h2>
            <div className="flex items-center gap-2">
              {[{ d: -1 as const, I: ChevronLeft, l: 'Scroll back' }, { d: 1 as const, I: ChevronRight, l: 'Scroll forward' }].map(({ d, I, l }) => (
                <button key={l} type="button" aria-label={l} onClick={() => scrollRail(d)} className={`w-8 h-8 rounded-full border ${borderClass} ${textSecondary} flex items-center justify-center cursor-pointer hover:bg-[var(--surface-subtle)]`}>
                  <I className="w-4 h-4" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>

          {visibleCourses.length === 0 ? (
            <div className="soft-card p-6 sm:p-8 text-center space-y-3">
              <p className={`text-sm ${textSecondary}`}>
                {courses.length === 0 ? 'No courses linked yet.' : 'No courses match your search.'}
              </p>
              {courses.length === 0 && (
                <button type="button" onClick={() => onNavigate('courses')} className={btnPrimary}>Link a course</button>
              )}
            </div>
          ) : (
            <div ref={rail} className="flex gap-4 sm:gap-5 overflow-x-auto no-scrollbar snap-x snap-mandatory overscroll-x-contain scroll-px-1 -mx-1 px-1 py-2">
              {visibleCourses.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onNavigate('courses')}
                  className="soft-card soft-card-interactive snap-start shrink-0 w-[min(270px,78vw)] p-2.5 text-left"
                >
                  <span className={`h-36 rounded-xl flex flex-col items-center justify-center gap-2 ${THUMBS[i % THUMBS.length]}`}>
                    <Code2 className="w-7 h-7" aria-hidden="true" />
                    <span className="text-xs font-medium">{c.platform}</span>
                  </span>
                  <span className="block px-1.5 pt-3 pb-2 space-y-2.5">
                    <span className={TYPE_CHIP}>{c.field}</span>
                    <span className={`block text-sm font-semibold leading-snug line-clamp-2 min-h-[2.6em] ${textPrimary}`}>{c.title}</span>
                    <ProgressBar value={c.progress || 0} />
                    <span className="flex items-center gap-2 pt-1">
                      <span aria-hidden="true" className="w-7 h-7 rounded-full bg-[var(--surface-subtle)] text-[11px] font-semibold flex items-center justify-center shrink-0">
                        {initialsOf(c.instructor)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-xs font-medium truncate ${textPrimary}`}>{c.instructor || 'Self-paced'}</span>
                        <span className={`block text-xs truncate ${textSecondary}`}>{c.skillLevel}</span>
                      </span>
                      <span className={`text-xs font-semibold tabular-nums ${textPrimary}`}>{c.progress || 0}%</span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Daily check-in */}
        <form onSubmit={onQuickCheckIn} className="soft-card p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="checkin" className={`text-sm font-semibold ${textPrimary}`}>What did you figure out today?</label>
            <label className={`inline-flex items-center gap-2 text-xs cursor-pointer ${textSecondary}`}>
              <input type="checkbox" checked={shareCheckInAsWin} onChange={(e) => setShareCheckInAsWin(e.target.checked)} />
              Share as a small win
            </label>
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input id="checkin" type="text" value={quickCheckInText} onChange={(e) => setQuickCheckInText(e.target.value)} placeholder="Built a card grid, finally understood async fetch" className={inputClass} />
            <button type="submit" className={btnPrimary}>Save check-in</button>
          </div>
        </form>

        {/* Activity table */}
        <section aria-labelledby="activity-h" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 id="activity-h" className={`!text-base ${textPrimary}`}>Your activity</h2>
            <button type="button" onClick={() => onNavigate('progress')} className="text-xs font-medium text-[var(--accent-600)] hover:underline cursor-pointer">See all</button>
          </div>
          <div className="soft-card px-5 sm:px-6 py-2">
            <div className={`hidden md:grid grid-cols-[1.7fr_.8fr_1.4fr_auto] gap-4 py-3 text-xs font-medium uppercase tracking-wide ${textSecondary}`}>
              <span>Item</span><span>Type</span><span>Detail</span><span className="w-24 text-right">Action</span>
            </div>
            <ul className={`divide-y ${borderClass}`}>
              {activity.map((r) => {
                const Icon = r.icon;
                return (
                  <li key={r.title + r.type} className="py-3.5 grid grid-cols-[1fr_auto] md:grid-cols-[1.7fr_.8fr_1.4fr_auto] items-center gap-x-4 gap-y-1">
                    <span className="flex items-center gap-3 min-w-0">
                      <span className="w-9 h-9 rounded-full bg-[var(--surface-subtle)] flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-sm font-semibold leading-snug line-clamp-2 ${textPrimary}`}>{r.title}</span>
                        <span className={`block text-xs truncate ${textSecondary}`}>{r.sub}</span>
                      </span>
                    </span>
                    <span className="hidden md:block"><span className={TYPE_CHIP}>{r.type}</span></span>
                    <span className={`hidden md:block text-sm line-clamp-2 ${textSecondary}`}>{r.detail}</span>
                    <span className="md:w-24 md:text-right">
                      <button type="button" onClick={() => onNavigate(r.tab)} className={ACTION_CHIP}>{r.cta}</button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-7 items-start">
          <div className="space-y-6 min-w-0">
            <HomeLevelCard summary={gamification} onOpen={() => onNavigate('compete')} textPrimary={textPrimary} textSecondary={textSecondary} />
            <IndependenceCard summary={independence} styles={styles} onOpenMentor={() => onNavigate('ai-mentor')} />
          </div>
          <section className="soft-card p-5 sm:p-6">
            <DashboardMilestoneStrip summary={milestones} borderClass={borderClass} subtleBgClass={subtleBgClass} textPrimary={textPrimary} textSecondary={textSecondary} onOpenProfile={() => onNavigate('profile')} />
          </section>
        </div>
      </div>

      {/* ------------------------------------------------------ RIGHT PANEL */}
      <aside aria-label="Schedule and profile" className={`border-t 2xl:border-t-0 2xl:border-l ${borderClass} bg-[var(--surface-elevated)]/45 p-6 sm:p-8 xl:p-10 2xl:p-8 grid gap-8 sm:grid-cols-2 2xl:block 2xl:space-y-10 min-w-0`}>
        <section className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="!text-[1.65rem]">Your schedule</h2>
            <button type="button" onClick={() => onNavigate('events')} className="w-10 h-10 rounded-full bg-[var(--surface-elevated)] flex items-center justify-center cursor-pointer hover:bg-[var(--pastel-aqua)]" aria-label="Open all events">
              <Calendar className="w-4 h-4" />
            </button>
          </div>
          <div className="pastel-card pastel-aqua p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ink-secondary)]">Coming up</p>
            {presentations.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {presentations.slice(0, 3).map((event) => (
                  <li key={event.id}>
                    <button type="button" onClick={() => onNavigate('events')} className="w-full bg-white/75 rounded-2xl p-4 flex items-center gap-3 text-left cursor-pointer hover:bg-white">
                      <span className="w-10 h-10 rounded-full bg-[var(--ink-primary)] text-white flex items-center justify-center shrink-0"><BookOpen className="w-4 h-4" /></span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold line-clamp-2">{event.title}</span>
                        <span className="block mt-0.5 text-xs text-[var(--ink-secondary)] truncate">{event.dateTime || event.type}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4 bg-white/75 rounded-2xl p-4">
                <p className="text-sm font-bold">Your calendar is open</p>
                <p className="mt-1 text-xs text-[var(--ink-secondary)]">Community sessions will appear here.</p>
                <button type="button" onClick={() => onNavigate('events')} className="mt-3 text-xs font-bold underline cursor-pointer">Explore events</button>
              </div>
            )}
          </div>
        </section>

        <section className="pastel-card pastel-lilac p-5 sm:p-6 text-center">
          <div className="flex items-center justify-between gap-3 text-left">
            <h2 className="!text-base">My Profile</h2>
            <button type="button" onClick={() => onNavigate('profile')} className="round-action px-3 min-h-9 text-xs font-bold cursor-pointer">Edit profile</button>
          </div>
          <div className="relative w-32 h-32 mx-auto mt-6">
            <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" role="img" aria-label={`${ringPct}% complete`}>
              <circle cx="60" cy="60" r="54" fill="none" stroke="rgb(255 255 255 / 65%)" strokeWidth="6" />
              <circle cx="60" cy="60" r="54" fill="none" stroke="var(--spark)" strokeWidth="6" strokeLinecap="round" strokeDasharray={ringC} strokeDashoffset={ringC * (1 - ringPct / 100)} />
            </svg>
            <div className="absolute inset-4 rounded-full bg-[var(--surface-elevated)] text-[var(--ink-primary)] flex items-center justify-center font-display text-2xl font-semibold overflow-hidden">
              {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" /> : initialsOf(fullName)}
            </div>
          </div>
          <p className={`mt-4 text-base font-semibold ${textPrimary}`}>{greeting}{firstName ? `, ${firstName}` : ''}</p>
          <p className="mt-1 text-sm mx-auto max-w-[24ch] text-[var(--ink-secondary)]">
            {ringPct}% through {latestCourse ? latestCourse.title : selectedRoadmap.title}. {profile.streakDays}-day streak.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            {[{ I: Bot, l: 'Ask the AI mentor', t: 'ai-mentor' }, { I: Users, l: 'Open community', t: 'community-home' }, { I: Trophy, l: 'See milestones', t: 'profile' }].map(({ I, l, t }) => (
              <button key={l} type="button" aria-label={l} title={l} onClick={() => onNavigate(t)} className="w-11 h-11 rounded-full bg-white/80 text-[var(--ink-primary)] flex items-center justify-center cursor-pointer hover:bg-white">
                <I className="w-[18px] h-[18px]" aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="scores-h" className="space-y-4">
          <h2 id="scores-h" className={`!text-base ${textPrimary}`}>Recent quiz scores</h2>
          {recentScores.length === 0 ? (
            <div className="soft-card p-4 space-y-3">
              <p className={`text-sm ${textSecondary}`}>No score yet. A short quiz will give you a useful baseline.</p>
              <button type="button" onClick={() => onNavigate('quizzes')} className="min-h-10 px-3 rounded-lg bg-[var(--accent-50)] text-[var(--accent-700)] text-sm font-semibold cursor-pointer">
                Take a quick quiz
              </button>
            </div>
          ) : (
            <ul className="flex items-end justify-center gap-4 h-32" role="list">
              {recentScores.map((a, i) => (
                <li key={a.id || i} className="flex-1 max-w-12 h-full flex flex-col justify-end items-center gap-1.5" aria-label={`${a.quizTitle}: ${a.percentage}%`}>
                  <span className="w-full flex-1 rounded-md bg-[var(--accent-50)] flex items-end overflow-hidden">
                    <span className="w-full rounded-md bg-[var(--spark)]" style={{ height: `${Math.max(6, a.percentage)}%` }} />
                  </span>
                  <span className={`text-xs tabular-nums ${textSecondary}`}>{a.percentage}%</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="people-h" className="space-y-3">
          <h2 id="people-h" className={`!text-base ${textPrimary}`}>Mentors and peers</h2>
          {people.length === 0 ? (
            <div className="soft-card p-4 space-y-3">
              <p className={`text-sm ${textSecondary}`}>Your circle is empty for now. Meet someone learning a similar path.</p>
              <button type="button" onClick={() => onNavigate('community-home')} className="min-h-10 px-3 rounded-lg bg-[var(--accent-50)] text-[var(--accent-700)] text-sm font-semibold cursor-pointer">
                Explore the community
              </button>
            </div>
          ) : (
            <ul className={`divide-y ${borderClass}`}>
              {people.map((m: any) => (
                <li key={m.id || m.name} className="py-3 flex items-center gap-3">
                  <span aria-hidden="true" className="w-9 h-9 rounded-full bg-[var(--panel-deep)] text-white text-xs font-semibold flex items-center justify-center shrink-0">
                    {initialsOf(m.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-medium leading-tight truncate ${textPrimary}`}>{m.name}</span>
                    <span className={`block text-xs truncate ${textSecondary}`}>{m.role === 'Member' ? m.field : m.role}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => (onViewMember ? onViewMember(m) : onNavigate('pairing-help'))}
                    className="inline-flex items-center rounded-full px-3 min-h-8 text-xs font-semibold bg-[var(--spark)] text-[var(--on-spark)] hover:bg-[var(--accent-700)] cursor-pointer"
                  >
                    View
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => onNavigate('pairing-help')} className="w-full min-h-11 rounded-full bg-[var(--accent-50)] text-[var(--accent-700)] text-sm font-semibold hover:bg-[var(--accent-100)] cursor-pointer">
            See all
          </button>
        </section>
      </aside>
    </div>
  );
};
