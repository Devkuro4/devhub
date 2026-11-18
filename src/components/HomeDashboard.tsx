import React from 'react';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Circle,
  Code2,
  FolderGit2,
  Megaphone,
  MessageSquare,
  Trophy,
} from 'lucide-react';
import { ProgressBar } from './ui';
import { DashboardMilestoneStrip } from './MilestoneBadges';
import { IndependenceCard } from './IndependenceCard';
import type { IndependenceSummary } from '../lib/independence';
import type {
  CodeSubmission,
  CommunityEvent,
  CommunityPost,
  CourseItem,
  DailyTarget,
  MilestoneSummary,
  OnboardingProfile,
  QuizAttempt,
  QuizItem,
  RoadmapItem,
  RoadmapTopicProgress,
  WeeklyProjectItem,
} from '../types';

export const HomeDashboard = ({
  firstName,
  greeting,
  profile,
  onboarded,
  onStartOnboarding,
  courses,
  dailyTarget,
  codeSubmissions,
  quizzes,
  quizAttempts,
  weeklyProjects,
  selectedRoadmap,
  roadmapProgress,
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
  milestones,
  independence,
  styles,
}: {
  firstName: string;
  greeting: string;
  profile: OnboardingProfile;
  onboarded: boolean;
  onStartOnboarding: () => void;
  courses: CourseItem[];
  dailyTarget: DailyTarget;
  codeSubmissions: CodeSubmission[];
  quizzes: QuizItem[];
  quizAttempts: QuizAttempt[];
  weeklyProjects: WeeklyProjectItem[];
  selectedRoadmap: RoadmapItem;
  roadmapProgress: Record<string, RoadmapTopicProgress>;
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
  milestones: MilestoneSummary;
  independence: IndependenceSummary;
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
  const currentStage =
    selectedRoadmap.stages?.find((st) =>
      st.topics.some((tp) => (roadmapProgress[tp.id]?.status || 'Not Started') !== 'Demonstrated')
    ) || selectedRoadmap.stages?.[0];

  // Today's 4 clear learning steps
  const hasLearnedTopic = dailyTarget.status !== 'Not Started' || codeSubmissions.some((s) => s.topic === dailyTarget.topic);
  const hasPractisedOrSubmitted = codeSubmissions.some((s) => s.topic === dailyTarget.topic);
  const hasQuizAttempt = quizAttempts.some((a) =>
    a.quizTitle.toLowerCase().includes(dailyTarget.topic.toLowerCase().split(' ')[0] || '')
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
      detail: quizzes[0] ? quizzes[0].title : 'Check what clicked',
      done: hasQuizAttempt,
      tab: 'quizzes',
    },
  ];

  const nextActivity = todayChecklist.find((item) => !item.done) || todayChecklist[0];
  const importantAnnouncement = posts.find((p) => p.category === 'Announcement' || p.pinned) || posts[0];
  const nextEvent = presentations[0];
  const openChallenge = challenges.find((c) => c.status !== 'Completed') || challenges[0];
  const openQuestionsCount = helpRequests.filter((h) => h.status !== 'Resolved').length;

  const rollup = latestCourse ? latestCourse.progress : Math.round((demonstratedCount / Math.max(1, selectedRoadmap.topics.length)) * 100);
  const doneCount = todayChecklist.filter((s) => s.done).length;
  const row = (Icon: React.ElementType, kicker: string, title: string, tab: string, cta: string) => (
    <button type="button" onClick={() => onNavigate(tab)} className="w-full py-4 flex items-start gap-4 text-left cursor-pointer group">
      <Icon className="w-5 h-5 text-[var(--accent-600)] shrink-0 mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className={`block text-xs ${textSecondary}`}>{kicker}</span>
        <span className={`block text-sm font-semibold leading-snug ${textPrimary}`}>{title}</span>
      </span>
      <span className="text-xs font-medium text-[var(--accent-600)] shrink-0 group-hover:underline">{cta}</span>
    </button>
  );

  const isBrandNewMember = !onboarded && !latestCourse && codeSubmissions.length === 0 && dailyLogs.length === 0;

  return (
    <div className="space-y-10">
      {/* 1. Calm Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="space-y-1">
          <p className={`text-xs font-medium ${textSecondary}`}>
            {greeting} · {profile.field || selectedRoadmap.field} · {profile.skillLevel || 'Beginner'}
          </p>
          <h1 className={`font-display text-2xl font-semibold tracking-tight [text-wrap:balance] ${textPrimary}`}>
            {firstName ? `Welcome back, ${firstName}!` : 'Welcome back!'} Ready to make progress today?
          </h1>
        </div>
        <div className={`text-xs font-medium tabular-nums shrink-0 ${textSecondary}`}>
          {profile.streakDays}-day streak · {dailyLogs.length} check-ins
        </div>
      </div>

      {/* New Member Guided Welcome (Replaces Empty Stats) */}
      {isBrandNewMember ? (
        <div className={`${cardClass} p-6 sm:p-8 space-y-5`}>
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-semibold text-[var(--accent-600)]">First time here? Start in 1 minute</p>
            <h2 className={`font-display text-2xl ${textPrimary}`}>
              Let’s set up your learning path together.
            </h2>
            <p className={`text-sm leading-relaxed ${textSecondary}`}>
              Tell us what you’re learning and how much time you have. We’ll build a simple step-by-step roadmap so you always know what to do next—no guessing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button type="button" onClick={onStartOnboarding} className={btnPrimary}>
              Set Up My Learning Path <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => onNavigate('courses')} className={btnSecondary}>
              Link an Existing Course
            </button>
          </div>
        </div>
      ) : (
        <>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
            {/* MAIN: one clear next step, today's trail, check-in, recent work */}
            <div className="lg:col-span-8 space-y-8 min-w-0">
              <section className="rounded-[8px] bg-[var(--panel-deep)] text-white p-6 sm:p-8 border border-[var(--border-hairline)] shadow-[var(--shadow-lg)]">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/70">
                  <span>{latestCourse ? latestCourse.platform : selectedRoadmap.title} · ~{dailyTarget.estimatedMinutes} min left today</span>
                  <span className="tabular-nums">{doneCount} of {todayChecklist.length} steps done</span>
                </div>
                <h2 className="mt-4 text-3xl sm:text-4xl [text-wrap:balance]">{nextActivity.label}</h2>
                <p className="mt-2 text-sm text-white/75 max-w-xl">
                  {nextActivity.detail}{currentStage ? ` · ${currentStage.title}` : ''}
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => onNavigate(nextActivity.tab)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white text-[#0A0A0A] text-base font-semibold cursor-pointer hover:brightness-105 active:translate-y-px">
                    {doneCount === 0 ? 'Start today' : 'Continue'} <ArrowRight className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => onNavigate('ai-mentor')} className="text-sm text-white/80 underline-offset-4 hover:underline cursor-pointer">
                    Stuck? Ask the mentor
                  </button>
                </div>
              </section>

              <ol className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-6" aria-label="Today's steps">
                {todayChecklist.map((step, i) => {
                  const isNext = !step.done && step.id === nextActivity.id;
                  return (
                    <li key={step.id}>
                      <button type="button" onClick={() => onNavigate(step.tab)} className={`w-full h-full text-left pt-3 cursor-pointer border-t-4 transition-colors ${step.done ? 'border-[var(--spark)]' : isNext ? 'border-[var(--accent-600)]' : borderClass}`}>
                        <span className={`flex items-center gap-1.5 text-xs tabular-nums ${textSecondary}`}>
                          {step.done ? <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success-ink)]" /> : <Circle className="w-3.5 h-3.5" />}
                          Step {i + 1}
                        </span>
                        <span className={`mt-1 block text-sm font-semibold leading-snug ${step.done ? 'line-through opacity-60' : textPrimary}`}>{step.label}</span>
                        <span className={`block text-xs line-clamp-2 ${textSecondary}`}>{step.detail}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              <form onSubmit={onQuickCheckIn} className={`${cardClass} p-6 sm:p-6 space-y-4`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="checkin" className={`text-sm font-semibold ${textPrimary}`}>What did you figure out today?</label>
                  <label className={`inline-flex items-center gap-2 text-xs cursor-pointer ${textSecondary}`}>
                    <input type="checkbox" checked={shareCheckInAsWin} onChange={(e) => setShareCheckInAsWin(e.target.checked)} className="rounded border-[var(--border-strong)]" />
                    Share as a small win
                  </label>
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input id="checkin" type="text" value={quickCheckInText} onChange={(e) => setQuickCheckInText(e.target.value)} placeholder="Built a card grid, finally understood async fetch" className={inputClass} />
                  <button type="submit" className={btnPrimary}>Save check-in</button>
                </div>
              </form>

              <section className={`${cardClass} px-6 pt-5 pb-2`}>
                <div className="flex items-center justify-between">
                  <h2 className={`text-lg ${textPrimary}`}>Your latest work</h2>
                  <button type="button" onClick={() => onNavigate('progress')} className="text-xs font-medium text-[var(--accent-600)] hover:underline cursor-pointer">All progress</button>
                </div>
                <div className={`divide-y ${borderClass}`}>
                  {row(Code2, latestSubmission ? `Code review · ${latestSubmission.topic}` : 'Code review', latestSubmission?.review?.nextStep || 'Submit today’s practice for a gentle review.', 'submissions', latestSubmission ? 'Feedback' : 'Start')}
                  {row(BookOpen, 'Quiz', latestQuizAttempt ? `${latestQuizAttempt.quizTitle}: ${latestQuizAttempt.score}/${latestQuizAttempt.total} (${latestQuizAttempt.percentage}%)` : 'No quizzes yet. A short one shows what clicked.', 'quizzes', 'Quizzes')}
                  {row(FolderGit2, 'Weekly project', latestWeeklyProject ? `${latestWeeklyProject.title} · ${latestWeeklyProject.status}, due ${latestWeeklyProject.deadline}` : 'Pick a beginner-friendly project for this week.', 'weekly-project', 'Projects')}
                </div>
              </section>
            </div>

            {/* RAIL: where you are, how independent you are, who is around */}
            <aside className="lg:col-span-4 space-y-8 min-w-0 lg:sticky lg:top-24">
              <section className={`${cardClass} p-6 space-y-4`}>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className={`text-lg leading-snug ${textPrimary}`}>{latestCourse ? latestCourse.title : selectedRoadmap.title}</h2>
                  <span className={`text-2xl font-display tabular-nums ${textPrimary}`}>{rollup}%</span>
                </div>
                <ProgressBar value={rollup} />
                <p className={`text-xs ${textSecondary}`}>
                  <span className="tabular-nums font-medium">{demonstratedCount}/{selectedRoadmap.topics.length}</span> topics demonstrated · {profile.streakDays}-day streak · {dailyLogs.length} check-ins
                </p>
              </section>

              <IndependenceCard summary={independence} styles={styles} onOpenMentor={() => onNavigate('ai-mentor')} />

              <section className={`${cardClass} p-6`}>
                <DashboardMilestoneStrip summary={milestones} borderClass={borderClass} subtleBgClass={subtleBgClass} textPrimary={textPrimary} textSecondary={textSecondary} onOpenProfile={() => onNavigate('profile')} />
              </section>

              <section className={`${cardClass} px-6 pt-5 pb-2`}>
                <div className="flex items-center justify-between">
                  <h2 className={`text-lg ${textPrimary}`}>Around the hub</h2>
                  <button type="button" onClick={() => onNavigate('community')} className="text-xs font-medium text-[var(--accent-600)] hover:underline cursor-pointer">Community</button>
                </div>
                <div className={`divide-y ${borderClass}`}>
                  {importantAnnouncement && row(Megaphone, `${importantAnnouncement.category} · ${importantAnnouncement.author}`, importantAnnouncement.title, 'announcements', 'Read')}
                  {nextEvent && row(Calendar, `${nextEvent.type} · ${nextEvent.dateTime}`, nextEvent.title, 'events', 'Join')}
                  {openChallenge && row(Trophy, `Weekly challenge · ${openChallenge.difficulty}`, openChallenge.title, 'challenges', 'Try it')}
                  {row(MessageSquare, 'Peer help', `${openQuestionsCount} questions need an answer`, 'pairing-help', 'Help')}
                </div>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
};
