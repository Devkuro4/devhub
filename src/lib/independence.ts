import type { AiHelpEvent, CodeSubmission, HelpLevel, QuizAttempt, WeeklyProjectItem } from '../types';

/**
 * Independence score: Dev Hub's answer to "how do we measure growth without just counting courses?"
 *
 * Everything here is deliberately simple and explainable, so members can see exactly what moves it:
 *  - Self-reliance (50%): work you finished (exercises, quizzes, projects) compared with how much
 *    AI help you asked for. A nudge costs little, a full walkthrough costs a lot.
 *  - Understanding (30%): your recent quiz results and how often you explain your own code.
 *  - Building (20%): projects you actually submitted compared with projects you started.
 *
 * Only the last 30 days count, so the score reflects who you are becoming, not who you were.
 */

export const WINDOW_DAYS = 30;
const HELP_WEIGHT: Record<HelpLevel, number> = { 1: 1, 2: 2, 3: 4 };

export const HELP_LEVELS: { level: HelpLevel; label: string; short: string; description: string }[] = [
  { level: 1, label: 'Nudge', short: 'Just a nudge', description: 'A guiding question. You do the thinking.' },
  { level: 2, label: 'Hint', short: 'A bigger hint', description: 'An approach or outline, but not the answer.' },
  { level: 3, label: 'Walkthrough', short: 'Walk me through it', description: 'A full explanation, then a task to try alone.' },
];

export type JourneyStageId = 'learn' | 'practise' | 'demonstrate' | 'build' | 'collaborate' | 'independent';

export interface JourneyStage {
  id: JourneyStageId;
  label: string;
  hint: string;
  reached: boolean;
}

export interface IndependenceSummary {
  score: number | null;
  label: string;
  tip: string;
  workDone: number;
  helpLoad: number;
  helpByLevel: Record<HelpLevel, number>;
  components: {
    selfReliance: number | null;
    understanding: number | null;
    building: number | null;
  };
  stages: JourneyStage[];
}

export interface IndependenceInput {
  codeSubmissions: CodeSubmission[];
  quizAttempts: QuizAttempt[];
  weeklyProjects: WeeklyProjectItem[];
  aiHelpLog: AiHelpEvent[];
  hasStartedLearning: boolean;
  hasCollaborated: boolean;
}

function inWindow(dateLike: string | undefined, now: number): boolean {
  if (!dateLike) return true; // unknown dates are counted rather than silently dropped
  const t = Date.parse(dateLike);
  if (Number.isNaN(t)) return true;
  return now - t <= WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

const pct = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 100);

export function computeIndependence(input: IndependenceInput, now: number = Date.now()): IndependenceSummary {
  const subs = input.codeSubmissions.filter((s) => inWindow(s.createdAt, now));
  const attempts = input.quizAttempts.filter((a) => inWindow(a.date, now));
  const submittedProjects = input.weeklyProjects.filter(
    (p) => (p.status === 'Submitted' || p.status === 'Reviewed') && inWindow(p.submission?.submittedAt, now)
  );
  const help = input.aiHelpLog.filter((h) => inWindow(h.at, now));

  const helpByLevel: Record<HelpLevel, number> = { 1: 0, 2: 0, 3: 0 };
  let helpLoad = 0;
  for (const h of help) {
    helpByLevel[h.level] += 1;
    helpLoad += HELP_WEIGHT[h.level];
  }
  const workDone = subs.length + attempts.length + submittedProjects.length;

  // Self-reliance
  let selfReliance: number | null = null;
  if (workDone > 0 || helpLoad > 0) {
    selfReliance = workDone === 0 ? 0 : (workDone * 4) / (workDone * 4 + helpLoad);
  }

  // Understanding
  const understandingParts: number[] = [];
  const lastAttempts = input.quizAttempts.slice(0, 5);
  if (lastAttempts.length > 0) {
    understandingParts.push(lastAttempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / lastAttempts.length / 100);
  }
  if (subs.length > 0) {
    understandingParts.push(subs.filter((s) => (s.explanation || '').trim().length >= 40).length / subs.length);
  }
  const understanding = understandingParts.length
    ? understandingParts.reduce((a, b) => a + b, 0) / understandingParts.length
    : null;

  // Building
  const startedProjects = input.weeklyProjects.filter((p) => p.status !== 'Not Started');
  const building =
    startedProjects.length > 0
      ? startedProjects.filter((p) => p.status === 'Submitted' || p.status === 'Reviewed').length / startedProjects.length
      : null;

  const parts: { value: number | null; weight: number }[] = [
    { value: selfReliance, weight: 0.5 },
    { value: understanding, weight: 0.3 },
    { value: building, weight: 0.2 },
  ];
  const available = parts.filter((p) => p.value !== null) as { value: number; weight: number }[];
  const totalWeight = available.reduce((s, p) => s + p.weight, 0);
  const score = totalWeight > 0 ? pct(available.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight) : null;

  const label =
    score === null
      ? 'Not enough activity yet'
      : score >= 70
        ? 'Working independently'
        : score >= 40
          ? 'Growing steadily'
          : 'Building the habit';

  let tip: string;
  if (score === null) {
    tip = 'Submit one exercise or take one quiz and your score will appear.';
  } else if (helpByLevel[3] >= 3 && helpByLevel[3] >= helpByLevel[1] + helpByLevel[2]) {
    tip = `You asked for a full walkthrough ${helpByLevel[3]} times this month. Next time, try a Nudge first and see how far you get.`;
  } else if (workDone < 3) {
    tip = 'Do one more exercise this week without asking for help first. Finished work is what lifts this score.';
  } else if (understanding !== null && understanding < 0.6) {
    tip = 'Explain your reasoning when you submit code, in a sentence or two. It helps you understand it and raises your score.';
  } else if (building !== null && building < 0.5) {
    tip = 'You have projects started but not submitted. Finishing one is the biggest step toward independence.';
  } else {
    tip = 'Nice balance of effort and help. Keep trying things alone first, and use the mentor to get unstuck.';
  }

  const stages: JourneyStage[] = [
    { id: 'learn', label: 'Learn', hint: 'Start a course or log your study', reached: input.hasStartedLearning },
    { id: 'practise', label: 'Practise', hint: 'Submit an exercise', reached: input.codeSubmissions.length > 0 },
    {
      id: 'demonstrate',
      label: 'Demonstrate',
      hint: 'Take a quiz or explain your code',
      reached:
        input.quizAttempts.length > 0 ||
        input.codeSubmissions.some((s) => (s.explanation || '').trim().length >= 40),
    },
    {
      id: 'build',
      label: 'Build',
      hint: 'Submit a project',
      reached: input.weeklyProjects.some((p) => p.status === 'Submitted' || p.status === 'Reviewed'),
    },
    { id: 'collaborate', label: 'Collaborate', hint: 'Help a peer or join a group project', reached: input.hasCollaborated },
    {
      id: 'independent',
      label: 'Independent',
      hint: 'Keep your score at 70+ over 5 or more finished tasks',
      reached: score !== null && score >= 70 && workDone >= 5,
    },
  ];

  return {
    score,
    label,
    tip,
    workDone,
    helpLoad,
    helpByLevel,
    components: {
      selfReliance: selfReliance === null ? null : pct(selfReliance),
      understanding: understanding === null ? null : pct(understanding),
      building: building === null ? null : pct(building),
    },
    stages,
  };
}
