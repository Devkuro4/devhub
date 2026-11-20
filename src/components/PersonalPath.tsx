import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Calendar,
  CheckCircle2,
  Circle,
  Compass,
  Edit3,
  Plus,
  Target,
  Trash2,
  Trophy,
} from 'lucide-react';
import { buildNudges, courseSnapshot, quizAverage, recommendChallenges, topicsNeedingRevision } from '../lib/adaptive';
import { startActionLabel, type StartAction } from '../lib/startLearning';
import type {
  CodeSubmission,
  CourseItem,
  DailyTarget,
  LearningPlan,
  OnboardingProfile,
  PersonalMilestone,
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

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FIELD_OPTIONS = [
  'Frontend Development',
  'Backend Development',
  'Full-Stack Development',
  'Python',
  'AI Engineering',
  'Mobile Development',
  'Data Science',
  'Cybersecurity',
  'DevOps',
  'UI/UX Design',
];

/** The member's own learning journey: built only from their saved data, with honest controls & empty states. */
export const PersonalPath = ({
  profile,
  onUpdateProfile,
  courses,
  learningPlans,
  dailyTarget,
  allRoadmaps,
  selectedRoadmap,
  onSelectRoadmap,
  roadmapProgress,
  quizAttempts,
  codeSubmissions = [],
  weeklyProjects,
  challenges,
  personalMilestones = [],
  setPersonalMilestones,
  startAction,
  onStartLearning,
  onContinueCourse,
  onPersonalize,
  onNavigate,
  onNotify,
}: {
  profile: OnboardingProfile;
  onUpdateProfile?: (patch: Partial<OnboardingProfile>) => void;
  courses: CourseItem[];
  learningPlans: LearningPlan[];
  dailyTarget: DailyTarget;
  allRoadmaps?: RoadmapItem[];
  selectedRoadmap: RoadmapItem;
  onSelectRoadmap?: (id: string) => void;
  roadmapProgress: Record<string, RoadmapTopicProgress>;
  quizAttempts: QuizAttempt[];
  codeSubmissions?: CodeSubmission[];
  weeklyProjects: WeeklyProjectItem[];
  challenges: any[];
  personalMilestones?: PersonalMilestone[];
  setPersonalMilestones?: React.Dispatch<React.SetStateAction<PersonalMilestone[]>>;
  startAction: StartAction;
  onStartLearning: () => void;
  onContinueCourse: (courseId: string) => void;
  onPersonalize: () => void;
  onNavigate: (tab: string) => void;
  onNotify?: (msg: string, tone?: 'success' | 'error') => void;
}) => {
  const course = courses.find((c) => (c.progress || 0) < 100) || courses[0] || null;
  const snap = courseSnapshot(course);
  const plan = course ? learningPlans.find((p) => p.courseId === course.id) || null : null;
  const next = plan?.dailyTargets.find((t) => t.status === 'Not Started') || plan?.dailyTargets[0] || null;
  const revision = topicsNeedingRevision(quizAttempts, selectedRoadmap, roadmapProgress, codeSubmissions);
  const nudges = buildNudges({ profile, course, plan, revision });
  const avg = quizAverage(quizAttempts);
  const demonstrated = selectedRoadmap.topics.filter((t) => ['Demonstrated', 'Completed'].includes(roadmapProgress[t.id]?.status || '')).length;
  const projectsDone = weeklyProjects.filter((p) => p.status === 'Submitted' || p.status === 'Reviewed').length;
  const rec = recommendChallenges(challenges, profile, quizAttempts);
  const goal = profile.goal || '';
  const focus = profile.primaryField || profile.field || '';

  // Inline Learning Plan & Direction Editor state
  const [editingPlan, setEditingPlan] = useState(false);
  const [goalDraft, setGoalDraft] = useState(profile.goal || '');
  const [fieldDraft, setFieldDraft] = useState(profile.primaryField || profile.field || 'Frontend Development');
  const [levelDraft, setLevelDraft] = useState(profile.skillLevel || 'Beginner');
  const [studyTimeDraft, setStudyTimeDraft] = useState(profile.studyTime || '45 minutes per day');
  const [studyDaysDraft, setStudyDaysDraft] = useState<string[]>(profile.studyDays || ['Mon', 'Wed', 'Fri']);

  // Custom Milestones Organizer state
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState('');
  const [newMilestoneSource, setNewMilestoneSource] = useState<PersonalMilestone['sourceType']>('custom');

  const sortedMilestones = useMemo(
    () => [...personalMilestones].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [personalMilestones]
  );
  const completedMilestones = sortedMilestones.filter((m) => m.status === 'Completed').length;

  // Next unstarted suggestions from active roadmap or course modules
  const suggestedTopics = useMemo(() => {
    const existingTitles = new Set(sortedMilestones.map((m) => m.title.toLowerCase()));
    const out: { title: string; sourceType: PersonalMilestone['sourceType']; linkedId?: string }[] = [];
    selectedRoadmap.topics
      .filter((t) => !['Demonstrated', 'Completed'].includes(roadmapProgress[t.id]?.status || ''))
      .slice(0, 4)
      .forEach((t) => {
        if (!existingTitles.has(t.name.toLowerCase())) {
          out.push({ title: t.name, sourceType: 'roadmap', linkedId: t.id });
        }
      });
    (course?.modules || [])
      .filter((m) => !m.completed)
      .slice(0, 3)
      .forEach((m) => {
        if (!existingTitles.has(m.title.toLowerCase())) {
          out.push({ title: m.title, sourceType: 'course', linkedId: m.id });
        }
      });
    return out.slice(0, 4);
  }, [sortedMilestones, selectedRoadmap.topics, roadmapProgress, course]);

  const handleSavePlanChanges = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateProfile) return;
    onUpdateProfile({
      goal: goalDraft.trim() || profile.goal,
      field: fieldDraft,
      primaryField: fieldDraft,
      skillLevel: levelDraft,
      studyTime: studyTimeDraft,
      studyDays: studyDaysDraft,
    });
    setEditingPlan(false);
    onNotify?.('Updated your personal goals & study schedule.');
  };

  const handleAddMilestone = (title: string, sourceType: PersonalMilestone['sourceType'] = 'custom', linkedId?: string) => {
    const clean = title.trim();
    if (!clean || !setPersonalMilestones) return;
    const item: PersonalMilestone = {
      id: `pm-${Date.now()}`,
      title: clean,
      topic: clean,
      sourceType,
      linkedId,
      status: 'Not Started',
      targetDate: newMilestoneDate || undefined,
      notes: '',
      order: sortedMilestones.length ? Math.max(...sortedMilestones.map((m) => m.order || 0)) + 1 : 0,
    };
    setPersonalMilestones((prev) => [...prev, item]);
    if (sourceType === newMilestoneSource) {
      setNewMilestoneTitle('');
      setNewMilestoneDate('');
    }
    onNotify?.(`Added milestone "${clean}".`);
  };

  const cycleMilestoneStatus = (id: string) => {
    if (!setPersonalMilestones) return;
    setPersonalMilestones((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const nextStatus: PersonalMilestone['status'] =
          m.status === 'Not Started' ? 'In Progress' : m.status === 'In Progress' ? 'Completed' : 'Not Started';
        return { ...m, status: nextStatus };
      })
    );
  };

  const moveMilestone = (index: number, dir: -1 | 1) => {
    if (!setPersonalMilestones) return;
    const target = index + dir;
    if (target < 0 || target >= sortedMilestones.length) return;
    const copy = [...sortedMilestones];
    const tmp = copy[index];
    copy[index] = copy[target];
    copy[target] = tmp;
    setPersonalMilestones(copy.map((m, idx) => ({ ...m, order: idx })));
  };

  const removeMilestone = (id: string) => {
    if (!setPersonalMilestones) return;
    setPersonalMilestones((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <section aria-labelledby="personal-path-heading" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="personal-path-heading" className="text-lg font-semibold text-[var(--ink-primary)]">Your learning path</h2>
          <p className="text-sm text-[var(--ink-secondary)] mt-0.5">
            {[focus, profile.skillLevel, goal].filter(Boolean).join(' · ') || 'Add your focus and goal to personalize this.'}
            {profile.studyTime ? ` · ${profile.studyTime}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {onUpdateProfile && (
            <button
              type="button"
              onClick={() => {
                setGoalDraft(profile.goal || '');
                setFieldDraft(profile.primaryField || profile.field || 'Frontend Development');
                setLevelDraft(profile.skillLevel || 'Beginner');
                setStudyTimeDraft(profile.studyTime || '45 minutes per day');
                setStudyDaysDraft(profile.studyDays || ['Mon', 'Wed', 'Fri']);
                setEditingPlan((v) => !v);
              }}
              className="inline-flex items-center gap-1.5 min-h-10 px-3.5 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--surface-subtle)] text-xs font-medium text-[var(--ink-primary)] cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" /> {editingPlan ? 'Close Goal Editor' : 'Adjust Goal & Direction'}
            </button>
          )}
          <button
            type="button"
            onClick={onPersonalize}
            className="min-h-10 px-2 text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] underline underline-offset-2 cursor-pointer"
          >
            Run full setup wizard
          </button>
        </div>
      </div>

      {/* Inline Personal Goal, Direction & Schedule Adjuster */}
      {editingPlan && onUpdateProfile && (
        <form onSubmit={handleSavePlanChanges} className="soft-card p-5 space-y-4 border-l-4 border-l-[var(--accent-600)]">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink-primary)]">
            <Compass className="w-4 h-4 text-[var(--accent-600)]" /> Adjust your direction, goal, and study cadence
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--ink-secondary)]">Your Learning Goal</span>
              <input
                type="text"
                value={goalDraft}
                onChange={(e) => setGoalDraft(e.target.value)}
                placeholder="e.g., Build and deploy 2 full-stack React + API apps"
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--ink-secondary)]">Learning Direction / Field</span>
              <select
                value={fieldDraft}
                onChange={(e) => setFieldDraft(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)]"
              >
                {FIELD_OPTIONS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--ink-secondary)]">Skill Level</span>
              <select
                value={levelDraft}
                onChange={(e) => setLevelDraft(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)]"
              >
                <option value="Complete beginner">Complete beginner</option>
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--ink-secondary)]">Daily Study Pace</span>
              <select
                value={studyTimeDraft}
                onChange={(e) => setStudyTimeDraft(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)]"
              >
                <option value="20 minutes per day">20 minutes per day (light)</option>
                <option value="45 minutes per day">45 minutes per day (steady)</option>
                <option value="90 minutes per day">90 minutes per day (focused)</option>
                <option value="2+ hours per day">2+ hours per day (intensive)</option>
              </select>
            </label>
          </div>

          {allRoadmaps && allRoadmaps.length > 0 && onSelectRoadmap && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--ink-secondary)]">Active Roadmap</span>
              <select
                value={selectedRoadmap.id}
                onChange={(e) => onSelectRoadmap(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)]"
              >
                {allRoadmaps.map((rm) => (
                  <option key={rm.id} value={rm.id}>
                    {rm.title} ({rm.field})
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-[var(--ink-secondary)]">Planned Study Days</span>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((day) => {
                const active = studyDaysDraft.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() =>
                      setStudyDaysDraft((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))
                    }
                    className={`px-3 py-1 rounded-lg text-xs font-medium border cursor-pointer ${
                      active
                        ? 'bg-[var(--accent-600)] text-white border-[var(--accent-600)]'
                        : 'border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-secondary)]'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingPlan(false)}
              className="px-4 py-2 rounded-lg border border-[var(--border-strong)] text-xs font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[var(--accent-600)] hover:bg-[var(--accent-700)] text-white text-xs font-semibold cursor-pointer"
            >
              Save Learning Plan
            </button>
          </div>
        </form>
      )}

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
            <p className="text-sm text-[var(--ink-secondary)]">Add a course, or follow your personal milestones below. Either way, your next step shows up here.</p>
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
            <p className="text-sm text-[var(--ink-secondary)]">Your next topic appears here once you have a learning plan. Build one from the Learning page or organize milestones below.</p>
          )}
          {plan?.advice && <p className="text-sm text-[var(--ink-secondary)] border-t border-[var(--border-hairline)] pt-3">{plan.advice}</p>}
        </article>
      </div>

      {/* Personal Milestones & Topic Organizer */}
      {setPersonalMilestones && (
        <div className="soft-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-[var(--accent-600)]" aria-hidden="true" />
              <h3 className="font-semibold text-[var(--ink-primary)]">Personal milestones</h3>
              <span className="text-xs text-[var(--ink-secondary)] tabular-nums">
                ({completedMilestones}/{sortedMilestones.length} done)
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('roadmaps')}
              className="text-xs font-medium text-[var(--accent-600)] hover:underline cursor-pointer"
            >
              Open full {selectedRoadmap.title} roadmap →
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddMilestone(newMilestoneTitle, newMilestoneSource);
            }}
            className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2"
          >
            <input
              type="text"
              value={newMilestoneTitle}
              onChange={(e) => setNewMilestoneTitle(e.target.value)}
              placeholder="Add a personal milestone (e.g., Master Array.reduce, Build API auth)..."
              className="px-3.5 py-2 text-sm rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)]"
            />
            <select
              value={newMilestoneSource}
              onChange={(e) => setNewMilestoneSource(e.target.value as PersonalMilestone['sourceType'])}
              className="px-3 py-2 text-xs rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)]"
            >
              <option value="custom">Custom goal</option>
              <option value="roadmap">Roadmap</option>
              <option value="course">Course</option>
              <option value="self_directed">Self-directed</option>
            </select>
            <input
              type="date"
              value={newMilestoneDate}
              onChange={(e) => setNewMilestoneDate(e.target.value)}
              aria-label="Target date"
              className="px-3 py-2 text-xs rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)]"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent-600)] hover:bg-[var(--accent-700)] text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </form>

          {suggestedTopics.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[var(--ink-secondary)]">Quick add next:</span>
              {suggestedTopics.map((s) => (
                <button
                  key={`${s.sourceType}-${s.title}`}
                  type="button"
                  onClick={() => handleAddMilestone(s.title, s.sourceType, s.linkedId)}
                  className="px-2.5 py-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] hover:border-[var(--accent-600)] text-[var(--ink-primary)] cursor-pointer"
                >
                  + {s.title}
                </button>
              ))}
            </div>
          )}

          {sortedMilestones.length === 0 ? (
            <p className="text-xs text-[var(--ink-secondary)]">
              No personal milestones yet. Add goals above or pick from your upcoming roadmap and course topics.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border-hairline)]">
              {sortedMilestones.map((m, idx) => (
                <li key={m.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => cycleMilestoneStatus(m.id)}
                      aria-label={`Cycle status for ${m.title} (currently ${m.status})`}
                      className="shrink-0 cursor-pointer"
                    >
                      {m.status === 'Completed' ? (
                        <CheckCircle2 className="w-4 h-4 text-[var(--success-ink)]" />
                      ) : m.status === 'In Progress' ? (
                        <Compass className="w-4 h-4 text-[var(--accent-600)]" />
                      ) : (
                        <Circle className="w-4 h-4 text-[var(--ink-muted)]" />
                      )}
                    </button>
                    <div className="min-w-0">
                      <span className={`font-medium truncate block ${m.status === 'Completed' ? 'line-through text-[var(--ink-secondary)]' : 'text-[var(--ink-primary)]'}`}>
                        {m.title}
                      </span>
                      <span className="text-xs text-[var(--ink-secondary)]">
                        {m.status} · {m.sourceType.replace('_', ' ')}
                        {m.targetDate ? (
                          <span className="inline-flex items-center gap-1 ml-1.5">
                            <Calendar className="w-3 h-3" /> {m.targetDate}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveMilestone(idx, -1)}
                      aria-label="Move milestone up"
                      className="p-1.5 rounded-lg border border-[var(--border-hairline)] disabled:opacity-40 cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === sortedMilestones.length - 1}
                      onClick={() => moveMilestone(idx, 1)}
                      aria-label="Move milestone down"
                      className="p-1.5 rounded-lg border border-[var(--border-hairline)] disabled:opacity-40 cursor-pointer"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeMilestone(m.id)}
                      aria-label="Remove milestone"
                      className="p-1.5 rounded-lg text-[var(--ink-muted)] hover:text-[var(--danger-ink)] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Real Connected Progress */}
      <dl className="soft-card p-5 grid grid-cols-2 sm:grid-cols-6 gap-4">
        <Stat label="Study streak" value={`${profile.streakDays || 0} days`} />
        <Stat label="Course" value={course ? `${course.progress || 0}%` : '—'} />
        <Stat label="Quiz average" value={avg === null ? '—' : `${avg}%`} />
        <Stat label="Projects done" value={`${projectsDone}`} />
        <Stat label="Roadmap shown" value={`${demonstrated}/${selectedRoadmap.topics.length}`} />
        <Stat label="Milestones" value={sortedMilestones.length ? `${completedMilestones}/${sortedMilestones.length}` : '0'} />
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
