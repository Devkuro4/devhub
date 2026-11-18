import type {
  CodeSubmission,
  CommunityPost,
  MemberMilestone,
  MilestoneSummary,
  OnboardingProfile,
  QuizAttempt,
  RoadmapTopicProgress,
  ShowcaseProject,
  UserSession,
  WeeklyProjectItem,
} from '../types';

export interface MilestoneDetectionInput {
  user: Pick<UserSession, 'name' | 'email'> | null;
  profile: OnboardingProfile;
  dailyLogs: any[];
  resources: any[];
  codeSubmissions: CodeSubmission[];
  quizAttempts: QuizAttempt[];
  weeklyProjects: WeeklyProjectItem[];
  roadmapProgress: Record<string, RoadmapTopicProgress>;
  posts: CommunityPost[];
  helpRequests: any[];
  showcaseProjects: ShowcaseProject[];
  /** Longest run of active days. Comes from the XP ledger. */
  longestStreak?: number;
  /** True once the member has been active late in the evening. Comes from the XP ledger. */
  nightOwl?: boolean;
  totalXp?: number;
}

export function buildMemberIdentifiers(user: Pick<UserSession, 'name' | 'email'> | null, profile: OnboardingProfile): Set<string> {
  const candidates = [
    user?.name,
    profile.fullName,
    profile.username,
    user?.email ? user.email.split('@')[0] : '',
  ];
  const normalized = new Set<string>();
  for (const c of candidates) {
    const clean = String(c || '').trim().toLowerCase();
    if (clean) normalized.add(clean);
  }
  return normalized;
}

export function matchesMember(authorValue: unknown, ids: Set<string>): boolean {
  const clean = String(authorValue || '').trim().toLowerCase();
  return Boolean(clean && ids.has(clean));
}

export function detectMemberMilestones(input: MilestoneDetectionInput): MilestoneSummary {
  const ids = buildMemberIdentifiers(input.user, input.profile);

  const dailyLogCount = input.dailyLogs.length;

  const sharedResourceCount = input.resources.filter((r) => matchesMember(r?.addedBy, ids)).length;

  const peerPostCount = input.posts.filter((p) => matchesMember(p?.author, ids)).length;
  const peerReplyCount = input.posts.reduce(
    (sum, p) => sum + (p.comments || []).filter((c) => matchesMember(c?.author, ids)).length,
    0
  );
  const peerHelpReplyCount = input.helpRequests.reduce(
    (sum, h) => sum + (h.responses || []).filter((r: any) => matchesMember(r?.responder, ids)).length,
    0
  );
  const peerContributionCount = peerPostCount + peerReplyCount + peerHelpReplyCount;

  const submissionCount = input.codeSubmissions.length;

  const demonstratedTopicsCount = Object.values(input.roadmapProgress || {}).filter(
    (item) => item?.status === 'Demonstrated' || item?.status === 'Completed'
  ).length;

  const quizCount = input.quizAttempts.length;

  const finishedWeeklyProjects = input.weeklyProjects.filter(
    (p) => p.status === 'Submitted' || p.status === 'Reviewed'
  ).length;
  const memberShowcaseCount = input.showcaseProjects.filter((s) => matchesMember(s?.author, ids)).length;
  const projectBuildCount = finishedWeeklyProjects + memberShowcaseCount;

  const longestStreak = input.longestStreak ?? 0;
  const perfectQuizCount = input.quizAttempts.filter((q) => q.percentage >= 100).length;
  const totalXp = input.totalXp ?? 0;

  const milestones: MemberMilestone[] = [
    {
      id: 'first-log',
      category: 'Consistency',
      title: 'First Check-In',
      requirementLabel: '1 daily log',
      encouragement: 'Every developer journey starts with one honest check-in.',
      icon: 'seedling',
      tone: 'emerald',
      current: Math.min(dailyLogCount, 1),
      target: 1,
      earned: dailyLogCount >= 1,
    },
    {
      id: 'five-logs',
      category: 'Consistency',
      title: 'Steady Rhythm',
      requirementLabel: '5 daily logs',
      encouragement: 'Showing up 5 times builds real momentum—small steps compound.',
      icon: 'logs',
      tone: 'amber',
      current: Math.min(dailyLogCount, 5),
      target: 5,
      earned: dailyLogCount >= 5,
    },
    {
      id: 'three-resources',
      category: 'Community',
      title: 'Resource Sharer',
      requirementLabel: '3 shared resources',
      encouragement: 'Sharing helpful guides lifts the whole Dev Hub community.',
      icon: 'resources',
      tone: 'sky',
      current: Math.min(sharedResourceCount, 3),
      target: 3,
      earned: sharedResourceCount >= 3,
    },
    {
      id: 'helpful-peer',
      category: 'Community',
      title: 'Peer Helper',
      requirementLabel: '2 posts or replies',
      encouragement: 'Asking questions and sharing what you learned helps others grow too.',
      icon: 'peer',
      tone: 'rose',
      current: Math.min(peerContributionCount, 2),
      target: 2,
      earned: peerContributionCount >= 2,
    },
    {
      id: 'three-submissions',
      category: 'Building',
      title: 'Hands-On Coder',
      requirementLabel: '3 code submissions',
      encouragement: 'Writing and reviewing real snippets turns theory into confidence.',
      icon: 'code',
      tone: 'violet',
      current: Math.min(submissionCount, 3),
      target: 3,
      earned: submissionCount >= 3,
    },
    {
      id: 'three-roadmap-topics',
      category: 'Learning',
      title: 'Concept Explorer',
      requirementLabel: '3 roadmap topics demonstrated',
      encouragement: 'You are connecting foundational ideas step by step.',
      icon: 'roadmap',
      tone: 'emerald',
      current: Math.min(demonstratedTopicsCount, 3),
      target: 3,
      earned: demonstratedTopicsCount >= 3,
    },
    {
      id: 'two-quizzes',
      category: 'Learning',
      title: 'Curious Checker',
      requirementLabel: '2 quizzes completed',
      encouragement: 'Checking what clicked makes concepts stick for the long haul.',
      icon: 'quiz',
      tone: 'sky',
      current: Math.min(quizCount, 2),
      target: 2,
      earned: quizCount >= 2,
    },
    {
      id: 'first-project',
      category: 'Building',
      title: 'Project Builder',
      requirementLabel: '1 project submitted or showcased',
      encouragement: 'Shipping a real mini project—even a small one—is huge progress!',
      icon: 'project',
      tone: 'amber',
      current: Math.min(projectBuildCount, 1),
      target: 1,
      earned: projectBuildCount >= 1,
    },
    {
      id: 'streak-7',
      category: 'Consistency',
      title: 'Consistent Coder',
      requirementLabel: '7-day streak',
      encouragement: 'A full week of showing up. Consistency beats intensity.',
      icon: 'streak',
      tone: 'amber',
      current: Math.min(longestStreak, 7),
      target: 7,
      earned: longestStreak >= 7,
    },
    {
      id: 'streak-30',
      category: 'Consistency',
      title: 'Unstoppable',
      requirementLabel: '30-day streak',
      encouragement: 'Thirty days in a row. This is now a habit.',
      icon: 'streak',
      tone: 'amber',
      current: Math.min(longestStreak, 30),
      target: 30,
      earned: longestStreak >= 30,
    },
    {
      id: 'night-owl',
      category: 'Consistency',
      title: 'Night Owl',
      requirementLabel: 'Finish an activity after 9pm',
      encouragement: 'Late-night focus. Just remember to rest too.',
      icon: 'night',
      tone: 'violet',
      current: input.nightOwl ? 1 : 0,
      target: 1,
      earned: Boolean(input.nightOwl),
    },
    {
      id: 'quiz-master',
      category: 'Learning',
      title: 'Quiz Master',
      requirementLabel: 'Score 100% in 3 quizzes',
      encouragement: 'Three perfect scores. You really know your stuff.',
      icon: 'quiz-master',
      tone: 'sky',
      current: Math.min(perfectQuizCount, 3),
      target: 3,
      earned: perfectQuizCount >= 3,
    },
    {
      id: 'problem-solver',
      category: 'Building',
      title: 'Problem Solver',
      requirementLabel: '10 code submissions',
      encouragement: 'Ten real exercises done. Problems feel smaller now.',
      icon: 'solver',
      tone: 'violet',
      current: Math.min(submissionCount, 10),
      target: 10,
      earned: submissionCount >= 10,
    },
    {
      id: 'team-player',
      category: 'Community',
      title: 'Team Player',
      requirementLabel: '10 posts, replies or help answers',
      encouragement: 'You make Dev Hub better for everyone who learns here.',
      icon: 'team',
      tone: 'rose',
      current: Math.min(peerContributionCount, 10),
      target: 10,
      earned: peerContributionCount >= 10,
    },
    {
      id: 'level-developer',
      category: 'Learning',
      title: 'Level Up',
      requirementLabel: 'Reach the Developer level (300 XP)',
      encouragement: 'You moved past the basics and into real development.',
      icon: 'level',
      tone: 'emerald',
      current: Math.min(totalXp, 300),
      target: 300,
      earned: totalXp >= 300,
    },
  ];

  const earned = milestones.filter((m) => m.earned);
  const upcoming = milestones.filter((m) => !m.earned);

  return {
    milestones,
    earned,
    upcoming,
    earnedCount: earned.length,
    totalCount: milestones.length,
  };
}
