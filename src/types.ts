export type LearningStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Practised'
  | 'Demonstrated'
  | 'Needs Revision';

export interface UserSession {
  id?: string;
  name: string;
  email: string;
  isAdmin: boolean;
}

export interface OnboardingProfile {
  fullName: string;
  username: string;
  bio: string;
  field: string;
  skillLevel: string;
  knownSkills: string;
  goal: string;
  studyTime: string;
  languages: string[];
  frameworks: string[];
  interests: string[];
  githubUrl: string;
  portfolioUrl: string;
  linkedinUrl: string;
  streakDays: number;
  showAdvancedTools: boolean;
  notifications: {
    announcements: boolean;
    deadlines: boolean;
    reviewFeedback: boolean;
    weeklyCheckIn: boolean;
  };
}

export interface CourseModule {
  id: string;
  title: string;
  completed: boolean;
}

export interface CourseItem {
  id: string;
  title: string;
  platform: string;
  url: string;
  instructor: string;
  field: string;
  skillLevel: string;
  goals: string;
  targetDate: string;
  progress: number;
  currentTopic: string;
  weeklyTarget: string;
  lastStudied: string;
  notes: string;
  referenceLinks?: string[];
  modules: CourseModule[];
}

export interface DailyTarget {
  id: string;
  dayLabel: string;
  courseId: string;
  courseTitle: string;
  topic: string;
  objective: string;
  recommendedLesson: string;
  whatYouWillUnderstand: string;
  estimatedMinutes: number;
  exerciseTitle: string;
  exerciseInstructions: string;
  exerciseRequirements: string[];
  expectedConcepts: string[];
  starterHint: string;
  isTheoryOnly: boolean;
  status: LearningStatus;
}

export interface LearningPlan {
  courseId: string;
  courseTitle: string;
  planSummary: string;
  advice: string;
  coveredRoadmapTopics: string[];
  missingRoadmapTopics: string[];
  dailyTargets: DailyTarget[];
  generatedAt: string;
}

export interface RoadmapTopic {
  id: string;
  name: string;
  summary?: string;
  stageTitle?: string;
  customLinks?: string[];
}

export interface RoadmapStage {
  id: string;
  title: string;
  description: string;
  topics: RoadmapTopic[];
}

export interface RoadmapItem {
  id: string;
  slug?: string;
  source: 'roadmap.sh' | 'ai' | 'custom';
  title: string;
  field: string;
  officialUrl: string;
  summary: string;
  whatYouWillLearn?: string[];
  stages?: RoadmapStage[];
  topics: RoadmapTopic[];
}

export interface RoadmapTopicProgress {
  status: string;
  notes: string;
  struggling: boolean;
  skippedReason?: string;
  customLinks?: string[];
}

export interface SubmittedFile {
  name: string;
  size: number;
  content: string;
}

export interface AiCodeReviewFeedback {
  whatYouDidWell: string;
  whatNeedsImprovement: string;
  understandingChecks: string[];
  suggestions: string[];
  nextStep: string;
  recommendedStatus: string;
  analysisTypeLabel: string;
  learnerAnswers?: Record<number, string>;
}

export interface CodeSubmission {
  id: string;
  version: number;
  parentSubmissionId?: string;
  createdAt: string;
  courseId: string;
  courseTitle: string;
  topic: string;
  dayLabel: string;
  language: string;
  exerciseTitle: string;
  submissionKind: 'code' | 'files' | 'zip' | 'github' | 'notes';
  code: string;
  files: SubmittedFile[];
  repoUrl: string;
  explanation: string;
  sandboxExecuted: boolean;
  sandboxOutput: string;
  review: AiCodeReviewFeedback | null;
}

export interface QuizQuestion {
  id: string;
  type: string;
  topic: string;
  prompt: string;
  code: string;
  options: string[];
  answer: string;
  explanation: string;
}

export interface QuizItem {
  id: string;
  title: string;
  courseId: string;
  topic: string;
  field: string;
  difficulty: string;
  scope?: string;
  mandatory: boolean;
  deadline: string;
  durationMinutes: number;
  questions: QuizQuestion[];
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  quizTitle: string;
  date: string;
  score: number;
  total: number;
  percentage: number;
  weakTopics: string[];
  strongTopics: string[];
  missedQuestionIds: string[];
  aiQuestionNotes?: Record<string, string>;
}

export interface WeeklyProjectItem {
  id: string;
  title: string;
  shortDescription: string;
  whatItShouldDo: string;
  requirements: string[];
  conceptsToUse: string[];
  optionalHints: string[];
  milestones: { id: string; title: string; done: boolean }[];
  deadline: string;
  submissionInstructions: string;
  projectLevel: string;
  language: string;
  status: 'Not Started' | 'In Progress' | 'Submitted' | 'Reviewed';
  createdAt: string;
  submission?: {
    repoUrl: string;
    demoUrl: string;
    screenshotUrl: string;
    explanation: string;
    codeSnippet: string;
    files: SubmittedFile[];
    submittedAt: string;
  } | null;
  review?: {
    summary: string;
    requirementsMet: string[];
    improvements: string[];
    understandingQuestion: string;
    nextStep: string;
    learnerResponse?: string;
  } | null;
}

export interface ShowcaseProject {
  id: string;
  title: string;
  author: string;
  field: string;
  summary: string;
  technologies: string[];
  repoUrl: string;
  demoUrl: string;
  likes: number;
  createdAt: string;
}

export interface CommunityPostComment {
  id: string;
  author: string;
  text: string;
  isHelpful?: boolean;
}

export interface CommunityPost {
  id: string;
  author: string;
  role: string;
  category: string;
  pinned: boolean;
  timestamp: string;
  title: string;
  content: string;
  codeSnippet?: string;
  attachmentUrl?: string;
  likes: number;
  comments: CommunityPostComment[];
}

export interface CommunityEvent {
  id: string;
  title: string;
  presenter: string;
  topic: string;
  type: string;
  dateTime: string;
  description: string;
  resourceUrl: string;
  attendees: string[];
  reminders?: string[];
}

export type MilestoneTone = 'emerald' | 'amber' | 'sky' | 'violet' | 'rose';

export interface MemberMilestone {
  id: string;
  title: string;
  requirementLabel: string;
  encouragement: string;
  icon: 'seedling' | 'logs' | 'resources' | 'peer' | 'code' | 'roadmap' | 'quiz' | 'project';
  tone: MilestoneTone;
  current: number;
  target: number;
  earned: boolean;
}

export interface MilestoneSummary {
  milestones: MemberMilestone[];
  earned: MemberMilestone[];
  upcoming: MemberMilestone[];
  earnedCount: number;
  totalCount: number;
}


// ---------------------------------------------------------------------------
// Independence tracking: how much AI help a member asked for, and at what level.
// 1 = Nudge (a guiding question), 2 = Hint (an approach, no solution),
// 3 = Walkthrough (a worked explanation).
// ---------------------------------------------------------------------------
export type HelpLevel = 1 | 2 | 3;

export interface AiHelpEvent {
  id: string;
  at: string; // ISO date
  source: 'mentor';
  level: HelpLevel;
  topic: string;
}
