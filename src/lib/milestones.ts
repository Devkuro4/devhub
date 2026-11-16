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
}

function buildMemberIdentifiers(user: Pick<UserSession, 'name' | 'email'> | null, profile: OnboardingProfile): Set<string> {
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

function matchesMember(authorValue: unknown, ids: Set<string>): boolean {
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

  const milestones: MemberMilestone[] = [
    {
      id: 'first-log',
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
      title: 'Project Builder',
      requirementLabel: '1 project submitted or showcased',
      encouragement: 'Shipping a real mini project—even a small one—is huge progress!',
      icon: 'project',
      tone: 'amber',
      current: Math.min(projectBuildCount, 1),
      target: 1,
      earned: projectBuildCount >= 1,
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
