import type { CourseItem, LearningPlan, OnboardingProfile, QuizAttempt, RoadmapItem, RoadmapTopicProgress } from '../types';

/**
 * Adaptive rules. Everything here only READS member data and returns suggestions.
 * Nothing here marks a topic as mastered: mastery still comes from quizzes, exercises and reviews.
 */

const LEVEL_RANK: Record<string, number> = { 'Complete beginner': 0, Beginner: 0, Intermediate: 1, Advanced: 2 };
const CHALLENGE_RANK: Record<string, number> = { Beginner: 0, Easy: 0, Intermediate: 1, Medium: 1, Advanced: 2, Hard: 2 };

export function courseSnapshot(course?: CourseItem | null) {
  if (!course) return null;
  const mods = course.modules || [];
  const done = mods.filter((m) => m.completed);
  const nextIdx = mods.findIndex((m) => !m.completed);
  return {
    total: mods.length,
    completed: done.length,
    current: nextIdx >= 0 ? mods[nextIdx] : null,
    upcoming: nextIdx >= 0 ? mods.slice(nextIdx + 1, nextIdx + 4) : [],
    finished: mods.length > 0 && nextIdx < 0,
  };
}

export function daysSince(iso?: string, now = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

/** Topics that need another look, based on low quiz scores and what the member marked as hard. */
export function topicsNeedingRevision(
  quizAttempts: QuizAttempt[],
  roadmap: RoadmapItem,
  progress: Record<string, RoadmapTopicProgress>
): string[] {
  const out = new Set<string>();
  quizAttempts
    .slice(0, 5)
    .filter((q) => q.percentage < 60)
    .forEach((q) => (q.weakTopics || []).forEach((t) => out.add(t)));
  roadmap.topics.forEach((t) => {
    const p = progress[t.id];
    if (p && (p.struggling || p.status === 'Needs Revision')) out.add(t.name);
  });
  return Array.from(out).slice(0, 4);
}

export function quizAverage(attempts: QuizAttempt[]): number | null {
  if (!attempts.length) return null;
  return Math.round(attempts.reduce((a, q) => a + (q.percentage || 0), 0) / attempts.length);
}

/**
 * Challenges that fit the member. Beginners are not placed in advanced challenges.
 * One level of stretch is offered only after a few good quiz results.
 */
export function recommendChallenges<T extends { difficulty?: string; status?: string }>(
  challenges: T[],
  profile: OnboardingProfile,
  quizAttempts: QuizAttempt[],
  limit = 3
): { items: T[]; stretch: boolean } {
  const level = LEVEL_RANK[profile.skillLevel] ?? 0;
  const avg = quizAverage(quizAttempts.slice(0, 5));
  const stretch = quizAttempts.length >= 3 && (avg ?? 0) >= 80;
  const ceiling = level + (stretch ? 1 : 0);
  const open = challenges.filter((c) => c.status !== 'Completed');
  const fit = open.filter((c) => (CHALLENGE_RANK[c.difficulty || 'Beginner'] ?? 0) <= ceiling);
  // Closest to the member's level first
  fit.sort((a, b) => Math.abs((CHALLENGE_RANK[a.difficulty || ''] ?? 0) - level) - Math.abs((CHALLENGE_RANK[b.difficulty || ''] ?? 0) - level));
  return { items: fit.slice(0, limit), stretch };
}

export interface Nudge {
  id: string;
  tone: 'info' | 'warning' | 'success';
  title: string;
  body: string;
  action?: { label: string; tab?: string; kind?: 'start' | 'personalize' };
}

export function buildNudges(input: {
  profile: OnboardingProfile;
  course?: CourseItem | null;
  plan?: LearningPlan | null;
  revision: string[];
  now?: number;
}): Nudge[] {
  const nudges: Nudge[] = [];
  const gap = daysSince(input.profile.lastStudiedAt, input.now);
  const snap = courseSnapshot(input.course);

  if (snap?.finished) {
    nudges.push({
      id: 'course-done',
      tone: 'success',
      title: `You finished ${input.course!.title}`,
      body: 'Choose a logical next path. A project is a good way to lock in what you learned.',
      action: { label: 'Choose next path', tab: 'roadmaps' },
    });
  }
  if (gap !== null && gap >= 3 && !snap?.finished) {
    nudges.push({
      id: 'resume',
      tone: 'info',
      title: gap >= 14 ? 'Welcome back. Start small.' : 'Ready to pick it back up?',
      body: `It’s been ${gap} days. No catch-up needed. A 10-minute refresher on ${snap?.current?.title || input.course?.currentTopic || 'your last topic'} is enough to get going.`,
      action: { label: 'Start a short session', kind: 'start' },
    });
  }
  if (input.revision.length) {
    nudges.push({
      id: 'revise',
      tone: 'warning',
      title: 'Worth another look',
      body: `Recent quizzes or your own notes flag: ${input.revision.join(', ')}. Review the explanation, then retry a short quiz.`,
      action: { label: 'Open quizzes', tab: 'quizzes' },
    });
  }
  if (input.plan && input.plan.missingRoadmapTopics.length) {
    nudges.push({
      id: 'gaps',
      tone: 'info',
      title: 'Foundations your course doesn’t cover',
      body: `Consider adding: ${input.plan.missingRoadmapTopics.slice(0, 3).join(', ')}.`,
      action: { label: 'See roadmap', tab: 'roadmaps' },
    });
  }
  return nudges.slice(0, 3);
}
