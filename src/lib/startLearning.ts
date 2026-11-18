import type { CourseItem, LearningPlan, OnboardingState } from '../types';

/**
 * Members saved before the personalized onboarding only have a boolean `onboarded`.
 * Convert that once, without touching anything else, so nobody is sent back through setup.
 */
export function normalizeOnboarding(onboarded: boolean, state?: OnboardingState | null): OnboardingState {
  if (state && typeof state === 'object' && state.status) return state;
  if (onboarded) {
    return { status: 'completed', step: 1, draft: null, version: 1, personalized: false };
  }
  return { status: 'not_started', step: 1, draft: null, version: 2, personalized: false };
}

export type StartAction =
  | { kind: 'start-onboarding' }
  | { kind: 'resume-onboarding' }
  | { kind: 'choose-course'; courseIds: string[] }
  | { kind: 'todays-session'; courseId?: string }
  | { kind: 'add-path' }
  | { kind: 'next-path' };

const isActive = (c: CourseItem) => (c.progress || 0) < 100;

/** The single place that decides where "Start learning" goes. */
export function resolveStartAction(input: {
  onboarding: OnboardingState;
  courses: CourseItem[];
  learningPlans: LearningPlan[];
}): StartAction {
  const { onboarding, courses } = input;
  if (onboarding.status === 'in_progress') return { kind: 'resume-onboarding' };
  if (onboarding.status === 'not_started') return { kind: 'start-onboarding' };

  if (courses.length === 0) return { kind: 'add-path' };
  const active = courses.filter(isActive);
  if (active.length === 0) return { kind: 'next-path' };
  if (active.length > 1) {
    // Prefer the course with a plan if exactly one has one; otherwise let the member choose.
    const withPlan = active.filter((c) => input.learningPlans.some((p) => p.courseId === c.id));
    if (withPlan.length === 1) return { kind: 'todays-session', courseId: withPlan[0].id };
    return { kind: 'choose-course', courseIds: active.map((c) => c.id) };
  }
  return { kind: 'todays-session', courseId: active[0].id };
}

export function startActionLabel(a: StartAction): string {
  switch (a.kind) {
    case 'start-onboarding':
      return 'Set up my learning';
    case 'resume-onboarding':
      return 'Resume setup';
    case 'add-path':
      return 'Add a learning path';
    case 'next-path':
      return 'Choose my next path';
    case 'choose-course':
      return 'Choose what to continue';
    default:
      return 'Continue learning';
  }
}
