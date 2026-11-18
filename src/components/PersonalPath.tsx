import React from 'react';
import { ArrowRight, BookOpen, Compass, Flame, Trophy } from 'lucide-react';
import { buildNudges, courseSnapshot, quizAverage, recommendChallenges, topicsNeedingRevision } from '../lib/adaptive';
import { startActionLabel, type StartAction } from '../lib/startLearning';
import type {
  CourseItem,
  DailyTarget,
  LearningPlan,
  OnboardingProfile,
  QuizAttempt,
  RoadmapItem,
  RoadmapTopicProgress,
  WeeklyProjectItem,
} from '../types';

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <dt className="text-xs text-[var(--ink-secondary)]">{label}</dt>
    <dd className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--ink-primary)] truncate">{value}</dd>
  </div>
);

/** The member's own learning journey: built only from their saved data, with honest empty states. */
export const PersonalPath = ({
  profile,
  courses,
  learningPlans,
  dailyTarget,
  selectedRoadmap,
  roadmapProgress,
  quizAttempts,
  weeklyProjects,
  challenges,
  startAction,
  onStartLearning,
  onContinueCourse,
  onPersonalize,
  onNavigate,
}: {
  profile: OnboardingProfile;
  courses: CourseItem[];
  learningPlans: LearningPlan[];
  dailyTarget: DailyTarget;
  selectedRoadmap: RoadmapItem;
  roadmapProgress: Record<string, RoadmapTopicProgress>;
  quizAttempts: QuizAttempt[];
  weeklyProjects: WeeklyProjectItem[];
  challenges: any[];
  startAction: StartAction;
  onStartLearning: () => void;
  onContinueCourse: (courseId: string) => void;
  onPersonalize: () => void;
  onNavigate: (tab: string) => void;
}) => {
  const course = courses.find((c) => (c.progress || 0) < 100) || courses[0] || null;
  const snap = courseSnapshot(course);
  const plan = course ? learningPlans.find((p) => p.courseId === course.id) || null : null;
  const next = plan?.dailyTargets.find((t) => t.status === 'Not Started') || plan?.dailyTargets[0] || null;
  const revision = topicsNeedingRevision(quizAttempts, selectedRoadmap, roadmapProgress);
  const nudges = buildNudges({ profile, course, plan, revision });
  const avg = quizAverage(quizAttempts);
  const demonstrated = selectedRoadmap.topics.filter((t) => ['Demonstrated', 'Completed'].includes(roadmapProgress[t.id]?.status || '')).length;
  const projectsDone = weeklyProjects.filter((p) => p.status === 'Submitted' || p.status === 'Reviewed').length;
  const rec = recommendChallenges(challenges, profile, quizAttempts);
  const goal = profile.goal || '';
  const focus = profile.primaryField || profile.field || '';

  return (
    <section aria-labelledby="personal-path-heading" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="personal-path-heading" className="text-lg font-semibold text-[var(--ink-primary)]">Your learning path</h2>
          <p className="text-sm text-[var(--ink-secondary)] mt-0.5">
            {[focus, profile.skillLevel, goal].filter(Boolean).join(' · ') || 'Add your focus and goal to personalize this.'}
          </p>
        </div>
        <button type="button" onClick={onPersonalize} className="min-h-11 px-3 text-sm text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] underline underline-offset-2 cursor-pointer">
          Update my goals and plan
        </button>
      </div>

      {startAction.kind === 'choose-course' && (
        <div className="soft-card p-5 space-y-3 border-l-4 border-l-[var(--accent-600)]">
          <div>
            <h3 className="font-semibold text-[var(--ink-primary)]">Which course do you want to continue?</h3>
            <p className="text-sm text-[var(--ink-secondary)] mt-0.5">You can switch any time. Your progress in each course is kept.</p>
          </div>
          <ul className="divide-y divide-[var(--border-hairline)]">
            {startAction.courseIds
              .map((id) => courses.find((c) => c.id === id))
              .filter((c): c is CourseItem => !!c)
              .map((c) => {
                const sn = courseSnapshot(c);
                return (
                  <li key={c.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--ink-primary)] truncate">{c.title}</p>
                      <p className="text-xs text-[var(--ink-secondary)] truncate">
                        {c.progress || 0}% done{sn?.current ? ` · Next: ${sn.current.title}` : c.currentTopic ? ` · ${c.currentTopic}` : ''}
                      </p>
                    </div>
                    <button type="button" onClick={() => onContinueCourse(c.id)} className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-lg bg-[var(--accent-600)] hover:bg-[var(--accent-700)] text-white text-sm font-semibold cursor-pointer shrink-0">
                      Continue <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      {nudges.length > 0 && (
        <ul className="space-y-2.5">
          {nudges.map((n) => (
            <li
              key={n.id}
              className={`soft-card px-4 py-3 border-l-4 flex flex-wrap items-center justify-between gap-3 ${
                n.tone === 'warning' ? 'border-l-[var(--spark)]' : n.tone === 'success' ? 'border-l-[var(--success-ink)]' : 'border-l-[var(--accent-600)]'
              }`}
            >
              <div className="min-w-0 max-w-[62ch]">
                <p className="text-sm font-semibold text-[var(--ink-primary)]">{n.title}</p>
                <p className="text-sm text-[var(--ink-secondary)] mt-0.5">{n.body}</p>
              </div>
              {n.action && (
                <button
                  type="button"
                  onClick={() => (n.action!.kind === 'start' ? onStartLearning() : n.action!.kind === 'personalize' ? onPersonalize() : n.action!.tab && onNavigate(n.action!.tab))}
                  className="min-h-11 px-4 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--surface-subtle)] text-sm font-medium text-[var(--ink-primary)] cursor-pointer"
                >
                  {n.action.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Current course */}
        <article className="soft-card p-5 space-y-4">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-full bg-[var(--accent-50)] text-[var(--accent-700)] flex items-center justify-center shrink-0"><BookOpen className="w-5 h-5" aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="text-xs text-[var(--ink-secondary)]">Current course</p>
              <h3 className="font-semibold text-[var(--ink-primary)] truncate">{course ? course.title : 'No course added yet'}</h3>
              {course && <p className="text-sm text-[var(--ink-secondary)] truncate">{[course.platform, course.instructor].filter(Boolean).join(' · ')}</p>}
            </div>
          </div>
          {course ? (
            <>
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-[var(--ink-secondary)]">{snap && snap.total ? `${snap.completed} of ${snap.total} modules` : 'Progress'}</span>
                  <span className="font-semibold tabular-nums">{course.progress || 0}%</span>
                </div>
                <div role="progressbar" aria-label="Course progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={course.progress || 0} className="h-2 rounded-full bg-[var(--border-hairline)] overflow-hidden">
                  <div className="h-full bg-[var(--accent-600)]" style={{ width: `${Math.min(100, course.progress || 0)}%` }} />
                </div>
              </div>
              {snap?.current && <p className="text-sm"><span className="text-[var(--ink-secondary)]">Now: </span><span className="font-medium text-[var(--ink-primary)]">{snap.current.title}</span></p>}
              {snap && snap.upcoming.length > 0 && (
                <p className="text-sm text-[var(--ink-secondary)]">Next: {snap.upcoming.map((m) => m.title).join(' → ')}</p>
              )}
              {snap && snap.total === 0 && <p className="text-sm text-[var(--ink-secondary)]">No modules listed yet. Add them on the Learning page so progress can be tracked.</p>}
            </>
          ) : (
            <p className="text-sm text-[var(--ink-secondary)]">Add a course, or follow the roadmap below. Either way, your next step shows up here.</p>
          )}
          <button type="button" onClick={onStartLearning} className="inline-flex items-center gap-2 min-h-11 px-5 rounded-lg bg-[var(--accent-600)] hover:bg-[var(--accent-700)] text-white text-sm font-semibold cursor-pointer">
            {startActionLabel(startAction)} <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </article>

        {/* Next recommended topic */}
        <article className="soft-card p-5 space-y-3">
          <p className="text-xs text-[var(--ink-secondary)]">Continue learning</p>
          {next || (dailyTarget && dailyTarget.courseId) ? (
            <>
              <h3 className="font-semibold text-[var(--ink-primary)]">{(next || dailyTarget).topic}</h3>
              <p className="text-sm text-[var(--ink-secondary)]">{(next || dailyTarget).whatYouWillUnderstand || (next || dailyTarget).objective}</p>
              <p className="text-sm text-[var(--ink-secondary)]">
                About {(next || dailyTarget).estimatedMinutes} min
                {(next || dailyTarget).recommendedLesson ? ` · Lesson: ${(next || dailyTarget).recommendedLesson}` : ''}
              </p>
              <button type="button" onClick={() => onNavigate('today')} className="min-h-11 px-4 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--surface-subtle)] text-sm font-medium cursor-pointer">Open today’s session</button>
            </>
          ) : (
            <p className="text-sm text-[var(--ink-secondary)]">Your next topic appears here once you have a learning plan. Build one from the Learning page or update your plan above.</p>
          )}
          {plan?.advice && <p className="text-sm text-[var(--ink-secondary)] border-t border-[var(--border-hairline)] pt-3">{plan.advice}</p>}
        </article>
      </div>

      {/* Progress */}
      <dl className="soft-card p-5 grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Stat label="Study streak" value={`${profile.streakDays || 0} days`} />
        <Stat label="Course" value={course ? `${course.progress || 0}%` : '—'} />
        <Stat label="Quiz average" value={avg === null ? '—' : `${avg}%`} />
        <Stat label="Projects done" value={`${projectsDone}`} />
        <Stat label="Skills shown" value={`${demonstrated}/${selectedRoadmap.topics.length}`} />
      </dl>

      {/* Challenges that fit */}
      <div className="soft-card p-5 space-y-3">
        <div className="flex items-center gap-2"><Trophy className="w-4 h-4 text-[var(--accent-700)]" aria-hidden="true" /><h3 className="font-semibold text-[var(--ink-primary)]">Challenges for your level</h3></div>
        {rec.items.length ? (
          <ul className="divide-y divide-[var(--border-hairline)]">
            {rec.items.map((c: any) => (
              <li key={c.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0"><p className="text-sm font-medium truncate">{c.title}</p><p className="text-xs text-[var(--ink-secondary)]">{c.difficulty}{c.category ? ` · ${c.category}` : ''}</p></div>
                <button type="button" onClick={() => onNavigate('challenges')} className="min-h-11 px-3 text-sm text-[var(--accent-700)] hover:underline cursor-pointer shrink-0">Try it</button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--ink-secondary)]">No open challenges match your level right now.</p>
        )}
        <p className="text-xs text-[var(--ink-secondary)]">{rec.stretch ? 'Your quiz results are strong, so one step-up challenge is included.' : 'Challenges step up as your quiz results and practice grow.'}</p>
      </div>
    </section>
  );
};
