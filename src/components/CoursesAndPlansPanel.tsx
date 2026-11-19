import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  FolderArchive,
  Link2,
  Plus,
  Sparkles,
  Trash2,
  Video,
} from 'lucide-react';
import { Badge, EmptyState, Modal } from './ui';
import { getUrlError } from '../lib/url';
import type {
  CourseItem,
  CourseLearningStatus,
  DailyTarget,
  ImportedMaterialPack,
  LearningPlan,
  OnboardingProfile,
  RoadmapItem,
  SelfDirectedTopic,
} from '../types';
import type { CourseMaterialsStyles } from './CourseMaterialsModal';

// ============================================================================
// COURSE DETAIL & EDIT MODAL (Full Metadata, Modules, Manual Video Bookmarks)
// ============================================================================
export const CourseEditModal = ({
  course,
  open,
  onClose,
  onSave,
  importedMaterials,
  onOpenMaterialsModal,
  styles,
}: {
  course: CourseItem | null;
  open: boolean;
  onClose: () => void;
  onSave: (updated: CourseItem) => void;
  importedMaterials: ImportedMaterialPack[];
  onOpenMaterialsModal: (packId?: string) => void;
  styles: CourseMaterialsStyles;
}) => {
  const { borderClass, subtleBgClass, textPrimary, textSecondary, inputClass, btnPrimary, btnSecondary } = styles;

  const [draft, setDraft] = useState<CourseItem | null>(course);
  const [newVideoTitle, setNewVideoTitle] = useState('');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newModuleTitle, setNewModuleTitle] = useState('');

  useEffect(() => {
    setDraft(course ? { ...course } : null);
    setNewVideoTitle('');
    setNewVideoUrl('');
    setNewModuleTitle('');
  }, [course, open]);

  if (!draft) return null;

  const urlErr = getUrlError(draft.url, 'https://...');
  const videoUrlErr = newVideoUrl.trim() ? getUrlError(newVideoUrl, 'https://...') : '';

  const connectedPacks = importedMaterials.filter(
    (p) => p.linkedCourseId === draft.id || (draft.linkedMaterialPackIds || []).includes(p.id)
  );

  const handleAddVideoBookmark = () => {
    if (!newVideoTitle.trim() || videoUrlErr) return;
    const refs = draft.videoRefs || [];
    setDraft({
      ...draft,
      videoRefs: [
        ...refs,
        {
          id: `vid-${Date.now()}`,
          title: newVideoTitle.trim(),
          url: newVideoUrl.trim(),
          completed: false,
        },
      ],
    });
    setNewVideoTitle('');
    setNewVideoUrl('');
  };

  const handleAddModule = () => {
    if (!newModuleTitle.trim()) return;
    const nextMods = [
      ...draft.modules,
      { id: `mod-${Date.now()}`, title: newModuleTitle.trim(), completed: false },
    ];
    const done = nextMods.filter((m) => m.completed).length;
    setDraft({
      ...draft,
      modules: nextMods,
      progress: nextMods.length ? Math.round((done / nextMods.length) * 100) : draft.progress,
    });
    setNewModuleTitle('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim() || urlErr) return;
    const done = draft.modules.filter((m) => m.completed).length;
    const progress = draft.modules.length ? Math.round((done / draft.modules.length) * 100) : draft.progress;
    const resolvedStatus: CourseLearningStatus =
      draft.status || (progress === 100 ? 'Completed' : progress > 0 ? 'In Progress' : 'Not Started');
    onSave({
      ...draft,
      title: draft.title.trim(),
      status: resolvedStatus,
      progress,
    });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={`Course Details · ${draft.title}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block space-y-1 sm:col-span-2">
            <span className={`text-xs font-medium ${textSecondary}`}>Course Title *</span>
            <input
              type="text"
              required
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block space-y-1">
            <span className={`text-xs font-medium ${textSecondary}`}>Platform</span>
            <select
              value={draft.platform}
              onChange={(e) => setDraft({ ...draft, platform: e.target.value })}
              className={inputClass}
            >
              <option value="Udemy">Udemy</option>
              <option value="Coursera">Coursera</option>
              <option value="YouTube">YouTube</option>
              <option value="Downloaded Course">Downloaded Course</option>
              <option value="Self-Directed">Self-Directed</option>
              <option value="freeCodeCamp">freeCodeCamp</option>
              <option value="Official Documentation">Official Documentation</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className={`text-xs font-medium ${textSecondary}`}>Learning Status</span>
            <select
              value={draft.status || 'In Progress'}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as CourseLearningStatus })}
              className={inputClass}
            >
              <option value="Not Started">Not Started</option>
              <option value="In Progress">In Progress</option>
              <option value="Paused">Paused</option>
              <option value="Completed">Completed</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className={`text-xs font-medium ${textSecondary}`}>Instructor / Creator</span>
            <input
              type="text"
              value={draft.instructor}
              onChange={(e) => setDraft({ ...draft, instructor: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block space-y-1">
            <span className={`text-xs font-medium ${textSecondary}`}>Subject / Technology</span>
            <input
              type="text"
              value={draft.field}
              onChange={(e) => setDraft({ ...draft, field: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className={`text-xs font-medium ${textSecondary}`}>Course URL</span>
            <input
              type="url"
              value={draft.url}
              onChange={(e) => setDraft({ ...draft, url: e.target.value })}
              placeholder="https://..."
              className={inputClass}
            />
            {urlErr && <span className="text-xs text-[var(--danger-ink)]">{urlErr}</span>}
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className={`text-xs font-medium ${textSecondary}`}>Description / Goals</span>
            <textarea
              rows={2}
              value={draft.description ?? draft.goals}
              onChange={(e) => setDraft({ ...draft, description: e.target.value, goals: e.target.value })}
              className={inputClass}
            />
          </label>
        </div>

        {/* Video Bookmark Section (URL / Local metadata only — never uploads video files) */}
        <div className={`p-3.5 rounded-xl border ${borderClass} ${subtleBgClass} space-y-2.5`}>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-xs font-semibold flex items-center gap-1.5 ${textPrimary}`}>
              <Video className="w-3.5 h-3.5 text-[var(--accent-600)]" /> Video Lesson Bookmarks (Local / URL Only)
            </span>
            <span className={`text-[11px] ${textSecondary}`}>Videos stay on your device</span>
          </div>
          {(draft.videoRefs || []).length > 0 && (
            <ul className="space-y-1.5">
              {(draft.videoRefs || []).map((v) => (
                <li key={v.id} className={`flex items-center justify-between gap-2 text-xs p-2 rounded-lg bg-[var(--surface-elevated)] border ${borderClass}`}>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        videoRefs: (draft.videoRefs || []).map((item) =>
                          item.id === v.id ? { ...item, completed: !item.completed } : item
                        ),
                      })
                    }
                    className="flex items-center gap-2 text-left flex-1 min-w-0 cursor-pointer"
                  >
                    {v.completed ? (
                      <CheckCircle2 className="w-4 h-4 text-[var(--success-ink)] shrink-0" />
                    ) : (
                      <Circle className={`w-4 h-4 shrink-0 ${textSecondary}`} />
                    )}
                    <span className={`truncate ${v.completed ? 'line-through opacity-60' : textPrimary}`}>{v.title}</span>
                  </button>
                  {v.url && (
                    <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-600)] hover:underline shrink-0">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    aria-label="Remove bookmark"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        videoRefs: (draft.videoRefs || []).filter((item) => item.id !== v.id),
                      })
                    }
                    className={`${textSecondary} hover:text-[var(--danger-ink)] cursor-pointer`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <input
              type="text"
              value={newVideoTitle}
              onChange={(e) => setNewVideoTitle(e.target.value)}
              placeholder="Video lesson title (e.g. Ep 04 · Async Await)"
              className={`${inputClass} !py-2 text-xs sm:col-span-5`}
            />
            <input
              type="url"
              value={newVideoUrl}
              onChange={(e) => setNewVideoUrl(e.target.value)}
              placeholder="External URL (optional)"
              className={`${inputClass} !py-2 text-xs sm:col-span-5`}
            />
            <button
              type="button"
              onClick={handleAddVideoBookmark}
              disabled={!newVideoTitle.trim() || Boolean(videoUrlErr)}
              className={`${btnSecondary} !py-2 text-xs sm:col-span-2`}
            >
              Add
            </button>
          </div>
          {videoUrlErr && <p className="text-xs text-[var(--danger-ink)]">{videoUrlErr}</p>}
        </div>

        {/* Modules Quick Add */}
        <div className="space-y-2">
          <span className={`block text-xs font-semibold ${textPrimary}`}>Modules ({draft.modules.length})</span>
          <div className="flex gap-2">
            <input
              type="text"
              value={newModuleTitle}
              onChange={(e) => setNewModuleTitle(e.target.value)}
              placeholder="Add another lesson or module..."
              className={`${inputClass} !py-2 text-xs`}
            />
            <button type="button" onClick={handleAddModule} className={`${btnSecondary} !py-2 text-xs`}>
              <Plus className="w-3.5 h-3.5" /> Add Module
            </button>
          </div>
        </div>

        {/* Connected Material Packs */}
        {connectedPacks.length > 0 && (
          <div className={`p-3 rounded-xl border ${borderClass} space-y-2`}>
            <div className={`text-xs font-semibold flex items-center gap-1.5 ${textPrimary}`}>
              <FolderArchive className="w-3.5 h-3.5 text-[var(--accent-600)]" /> Connected Downloaded Materials
            </div>
            <div className="flex flex-wrap gap-2">
              {connectedPacks.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenMaterialsModal(pack.id);
                  }}
                  className={`${btnSecondary} !px-3 !py-1.5 text-xs`}
                >
                  {pack.title} · {pack.totalFiles} files →
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
          <button type="submit" className={btnPrimary}>Save Course Details</button>
        </div>
      </form>
    </Modal>
  );
};

// ============================================================================
// SELF-DIRECTED LEARNING & SCHEDULES PANEL (Sub-tab: 'plans')
// ============================================================================
export const SelfDirectedAndPlansPanel = ({
  profile,
  courses,
  selectedRoadmap,
  learningPlans,
  setLearningPlans,
  selfDirectedTopics,
  setSelfDirectedTopics,
  importedMaterials,
  dailyTarget,
  setDailyTarget,
  onStartDailyTask,
  onOpenMaterialsModal,
  onNotify,
  styles,
}: {
  profile: OnboardingProfile;
  courses: CourseItem[];
  selectedRoadmap: RoadmapItem;
  learningPlans: LearningPlan[];
  setLearningPlans: React.Dispatch<React.SetStateAction<LearningPlan[]>>;
  selfDirectedTopics: SelfDirectedTopic[];
  setSelfDirectedTopics: React.Dispatch<React.SetStateAction<SelfDirectedTopic[]>>;
  importedMaterials: ImportedMaterialPack[];
  dailyTarget: DailyTarget;
  setDailyTarget: (t: DailyTarget) => void;
  onStartDailyTask: (t: DailyTarget) => void;
  onOpenMaterialsModal: (packId?: string) => void;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  styles: CourseMaterialsStyles;
}) => {
  const { cardClass, borderClass, subtleBgClass, textPrimary, textSecondary, inputClass, btnPrimary, btnSecondary } = styles;

  const todayDate = new Date().toISOString().slice(0, 10);
  const plusOneDate = (baseIso?: string) => {
    const d = baseIso ? new Date(`${baseIso}T12:00:00`) : new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  };

  // --- Self-Directed Topic Creator State ---
  const [showSdForm, setShowSdForm] = useState(false);
  const [sdTitle, setSdTitle] = useState('');
  const [sdField, setSdField] = useState(profile.field || 'Full-Stack Web');
  const [sdObjectivesText, setSdObjectivesText] = useState('');
  const [sdProjectIdea, setSdProjectIdea] = useState('');
  const [sdRefUrl, setSdRefUrl] = useState('');
  const [sdTaskDraft, setSdTaskDraft] = useState<Record<string, string>>({});
  const [sdRefDraft, setSdRefDraft] = useState<Record<string, { title: string; url: string }>>({});
  const [confirmDeleteSdId, setConfirmDeleteSdId] = useState<string | null>(null);

  // --- Schedule Task Creator & Filter ---
  const [scheduleFilter, setScheduleFilter] = useState<'all' | 'pending' | 'overdue' | 'completed'>('all');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskSource, setNewTaskSource] = useState<'course' | 'self_directed' | 'roadmap'>('course');
  const [newTaskSourceId, setNewTaskSourceId] = useState(courses[0]?.id || '');
  const [newTaskDate, setNewTaskDate] = useState(todayDate);
  const [newTaskMinutes, setNewTaskMinutes] = useState(30);

  const sdRefUrlError = sdRefUrl.trim() ? getUrlError(sdRefUrl, 'https://...') : '';

  const handleCreateSelfDirected = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sdTitle.trim() || sdRefUrlError) return;
    const objectives = sdObjectivesText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const now = new Date().toISOString();
    const created: SelfDirectedTopic = {
      id: `sd-${Date.now()}`,
      title: sdTitle.trim(),
      field: sdField.trim() || 'Independent Study',
      status: 'In Progress',
      objectives: objectives.length ? objectives : [`Understand core patterns of ${sdTitle.trim()} and build a small demo`],
      notes: '',
      projectIdea: sdProjectIdea.trim(),
      tasks: [
        {
          id: `sdt-${Date.now()}-1`,
          title: `Read notes & map key ideas for ${sdTitle.trim()}`,
          done: false,
          scheduledDate: todayDate,
          estimatedMinutes: 30,
        },
      ],
      references: sdRefUrl.trim()
        ? [{ id: `ref-${Date.now()}`, title: 'Primary Reference', url: sdRefUrl.trim() }]
        : [],
      linkedMaterialPackIds: [],
      createdAt: now,
      updatedAt: now,
    };
    setSelfDirectedTopics((prev) => [created, ...prev]);
    setSdTitle('');
    setSdObjectivesText('');
    setSdProjectIdea('');
    setSdRefUrl('');
    setShowSdForm(false);
    onNotify(`Created self-directed topic: ${created.title}`);
  };

  // Unified Schedule Items from LearningPlans + SelfDirectedTopics
  interface ScheduleEntry {
    kind: 'plan' | 'self_directed';
    planCourseId?: string;
    sdId?: string;
    id: string;
    title: string;
    contextLabel: string;
    scheduledDate: string;
    estimatedMinutes: number;
    done: boolean;
    sourceTag: string;
    rawTarget?: DailyTarget;
  }

  const scheduleEntries = useMemo<ScheduleEntry[]>(() => {
    const out: ScheduleEntry[] = [];
    for (const plan of learningPlans) {
      for (const dt of plan.dailyTargets) {
        const done = dt.status === 'Practised' || dt.status === 'Demonstrated';
        out.push({
          kind: 'plan',
          planCourseId: plan.courseId,
          id: dt.id,
          title: dt.topic,
          contextLabel: `${plan.courseTitle} · ${dt.dayLabel}`,
          scheduledDate: dt.scheduledDate || todayDate,
          estimatedMinutes: dt.estimatedMinutes || 30,
          done,
          sourceTag: dt.sourceType === 'roadmap' ? 'Roadmap' : 'Course Plan',
          rawTarget: dt,
        });
      }
    }
    for (const sd of selfDirectedTopics) {
      for (const task of sd.tasks) {
        out.push({
          kind: 'self_directed',
          sdId: sd.id,
          id: task.id,
          title: task.title,
          contextLabel: sd.title,
          scheduledDate: task.scheduledDate || todayDate,
          estimatedMinutes: task.estimatedMinutes || 25,
          done: task.done,
          sourceTag: 'Self-Directed',
        });
      }
    }
    return out.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  }, [learningPlans, selfDirectedTopics, todayDate]);

  const filteredSchedule = useMemo(() => {
    return scheduleEntries.filter((entry) => {
      if (scheduleFilter === 'completed') return entry.done;
      if (scheduleFilter === 'pending') return !entry.done;
      if (scheduleFilter === 'overdue') return !entry.done && entry.scheduledDate < todayDate;
      return true;
    });
  }, [scheduleEntries, scheduleFilter, todayDate]);

  const rescheduleEntry = (entry: ScheduleEntry, nextDate: string) => {
    if (entry.kind === 'plan' && entry.planCourseId) {
      setLearningPlans((prev) =>
        prev.map((p) =>
          p.courseId === entry.planCourseId
            ? {
                ...p,
                dailyTargets: p.dailyTargets.map((dt) =>
                  dt.id === entry.id ? { ...dt, scheduledDate: nextDate } : dt
                ),
              }
            : p
        )
      );
      if (dailyTarget.id === entry.id) {
        setDailyTarget({ ...dailyTarget, scheduledDate: nextDate });
      }
    } else if (entry.kind === 'self_directed' && entry.sdId) {
      setSelfDirectedTopics((prev) =>
        prev.map((sd) =>
          sd.id === entry.sdId
            ? {
                ...sd,
                updatedAt: new Date().toISOString(),
                tasks: sd.tasks.map((t) => (t.id === entry.id ? { ...t, scheduledDate: nextDate } : t)),
              }
            : sd
        )
      );
    }
    onNotify(`Rescheduled "${entry.title}" to ${nextDate === todayDate ? 'Today' : nextDate}.`);
  };

  const toggleEntryDone = (entry: ScheduleEntry) => {
    if (entry.kind === 'plan' && entry.planCourseId) {
      setLearningPlans((prev) =>
        prev.map((p) =>
          p.courseId === entry.planCourseId
            ? {
                ...p,
                dailyTargets: p.dailyTargets.map((dt) =>
                  dt.id === entry.id
                    ? {
                        ...dt,
                        status: entry.done ? 'Not Started' : 'Demonstrated',
                        completedAt: entry.done ? undefined : new Date().toISOString(),
                      }
                    : dt
                ),
              }
            : p
        )
      );
    } else if (entry.kind === 'self_directed' && entry.sdId) {
      setSelfDirectedTopics((prev) =>
        prev.map((sd) =>
          sd.id === entry.sdId
            ? {
                ...sd,
                updatedAt: new Date().toISOString(),
                tasks: sd.tasks.map((t) => (t.id === entry.id ? { ...t, done: !entry.done } : t)),
              }
            : sd
        )
      );
    }
  };

  const handleAddScheduledTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    if (newTaskSource === 'self_directed' && newTaskSourceId) {
      setSelfDirectedTopics((prev) =>
        prev.map((sd) =>
          sd.id === newTaskSourceId
            ? {
                ...sd,
                updatedAt: new Date().toISOString(),
                tasks: [
                  ...sd.tasks,
                  {
                    id: `sdt-${Date.now()}`,
                    title: newTaskTitle.trim(),
                    done: false,
                    scheduledDate: newTaskDate,
                    estimatedMinutes: newTaskMinutes,
                  },
                ],
              }
            : sd
        )
      );
    } else {
      const targetCourseId =
        newTaskSource === 'course'
          ? newTaskSourceId || courses[0]?.id || 'general-plan'
          : `roadmap-${selectedRoadmap.id}`;
      const targetCourseTitle =
        newTaskSource === 'course'
          ? courses.find((c) => c.id === targetCourseId)?.title || 'Personal Study Plan'
          : selectedRoadmap.title;
      const newDt: DailyTarget = {
        id: `dt-${Date.now()}`,
        dayLabel: newTaskDate === todayDate ? 'Today' : newTaskDate,
        scheduledDate: newTaskDate,
        courseId: targetCourseId,
        courseTitle: targetCourseTitle,
        sourceType: newTaskSource === 'roadmap' ? 'roadmap' : 'course',
        topic: newTaskTitle.trim(),
        objective: `Complete scheduled study task: ${newTaskTitle.trim()}`,
        recommendedLesson: targetCourseTitle,
        whatYouWillUnderstand: `Clear working understanding of ${newTaskTitle.trim()}.`,
        estimatedMinutes: newTaskMinutes,
        exerciseTitle: `Practice: ${newTaskTitle.trim()}`,
        exerciseInstructions: `Build or summarize a small hands-on example for "${newTaskTitle.trim()}".`,
        exerciseRequirements: ['Write a minimal runnable example or structured note', 'Test or review your work'],
        expectedConcepts: [newTaskTitle.trim()],
        starterHint: 'Break the task into a 15-minute concept read and a 15-minute hands-on test.',
        isTheoryOnly: false,
        status: 'Not Started',
      };
      setLearningPlans((prev) => {
        const existing = prev.find((p) => p.courseId === targetCourseId);
        if (existing) {
          return prev.map((p) =>
            p.courseId === targetCourseId ? { ...p, dailyTargets: [...p.dailyTargets, newDt] } : p
          );
        }
        return [
          {
            courseId: targetCourseId,
            courseTitle: targetCourseTitle,
            planSummary: `Custom scheduled study tasks for ${targetCourseTitle}.`,
            advice: 'Stick to realistic daily blocks and reschedule unfinished items cleanly rather than skipping.',
            coveredRoadmapTopics: [],
            missingRoadmapTopics: [],
            dailyTargets: [newDt],
            generatedAt: 'Today',
          },
          ...prev,
        ];
      });
    }

    setNewTaskTitle('');
    onNotify('Added task to your study schedule.');
  };

  return (
    <div className="space-y-8">
      {/* SECTION A: LEARNING SCHEDULES & PLANS */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className={`font-display text-xl ${textPrimary}`}>Learning Schedule & Tasks</h2>
            <p className={`text-sm ${textSecondary}`}>
              Plan daily or weekly blocks across courses, self-directed topics, and your roadmap — and reschedule unfinished work cleanly.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'pending', 'overdue', 'completed'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setScheduleFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                  scheduleFilter === f
                    ? 'bg-[var(--accent-600)] text-white border-[var(--accent-600)]'
                    : `${borderClass} ${textSecondary} hover:bg-[var(--surface-subtle)]`
                }`}
              >
                {f === 'all' ? 'All' : f === 'pending' ? 'Pending' : f === 'overdue' ? 'Overdue' : 'Completed'}
              </button>
            ))}
          </div>
        </div>

        {/* Add Scheduled Task Form */}
        <form onSubmit={handleAddScheduledTask} className={`${cardClass} p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end`}>
          <label className="block space-y-1 sm:col-span-4">
            <span className={`text-xs font-medium ${textSecondary}`}>Task or Topic</span>
            <input
              type="text"
              required
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="e.g., Practice CSS Grid layouts"
              className={inputClass}
            />
          </label>
          <label className="block space-y-1 sm:col-span-3">
            <span className={`text-xs font-medium ${textSecondary}`}>Connect to</span>
            <select
              value={`${newTaskSource}:${newTaskSourceId}`}
              onChange={(e) => {
                const [src, ...rest] = e.target.value.split(':');
                setNewTaskSource(src as any);
                setNewTaskSourceId(rest.join(':'));
              }}
              className={inputClass}
            >
              {courses.map((c) => (
                <option key={c.id} value={`course:${c.id}`}>Course: {c.title}</option>
              ))}
              {selfDirectedTopics.map((sd) => (
                <option key={sd.id} value={`self_directed:${sd.id}`}>Self-Directed: {sd.title}</option>
              ))}
              <option value={`roadmap:${selectedRoadmap.id}`}>Roadmap: {selectedRoadmap.title}</option>
            </select>
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className={`text-xs font-medium ${textSecondary}`}>Date</span>
            <input
              type="date"
              value={newTaskDate}
              onChange={(e) => setNewTaskDate(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block space-y-1 sm:col-span-1">
            <span className={`text-xs font-medium ${textSecondary}`}>Min</span>
            <input
              type="number"
              min={5}
              max={240}
              value={newTaskMinutes}
              onChange={(e) => setNewTaskMinutes(Number(e.target.value) || 30)}
              className={inputClass}
            />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className={`${btnPrimary} w-full`}>
              <Plus className="w-4 h-4" /> Schedule
            </button>
          </div>
        </form>

        {/* Scheduled Task Rows */}
        {filteredSchedule.length === 0 ? (
          <EmptyState
            title="No scheduled tasks matching this filter"
            description="Add a study task above or generate a course learning plan from My Courses."
          />
        ) : (
          <div className={`${cardClass} divide-y ${borderClass}`}>
            {filteredSchedule.map((entry) => {
              const isOverdue = !entry.done && entry.scheduledDate < todayDate;
              return (
                <div key={`${entry.kind}-${entry.id}`} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleEntryDone(entry)}
                      aria-label={entry.done ? `Mark ${entry.title} incomplete` : `Mark ${entry.title} complete`}
                      className="mt-0.5 cursor-pointer shrink-0"
                    >
                      {entry.done ? (
                        <CheckCircle2 className="w-5 h-5 text-[var(--success-ink)]" />
                      ) : (
                        <Circle className={`w-5 h-5 ${isOverdue ? 'text-[var(--warning-ink)]' : textSecondary}`} />
                      )}
                    </button>
                    <div className="min-w-0 space-y-0.5">
                      <div className={`text-sm font-semibold ${entry.done ? 'line-through opacity-60' : textPrimary}`}>
                        {entry.title}
                      </div>
                      <div className={`text-xs flex flex-wrap items-center gap-x-2 gap-y-0.5 ${textSecondary}`}>
                        <span>{entry.sourceTag}</span>
                        <span>·</span>
                        <span>{entry.contextLabel}</span>
                        <span>·</span>
                        <span className={isOverdue ? 'text-[var(--warning-ink)] font-semibold' : ''}>
                          {entry.scheduledDate === todayDate ? 'Today' : entry.scheduledDate}
                          {isOverdue ? ' (Overdue)' : ''}
                        </span>
                        <span>·</span>
                        <span className="tabular-nums">{entry.estimatedMinutes}m</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {!entry.done && (
                      <>
                        <button
                          type="button"
                          onClick={() => rescheduleEntry(entry, todayDate)}
                          className={`${btnSecondary} !px-2.5 !py-1.5 text-xs`}
                        >
                          <Calendar className="w-3.5 h-3.5" /> Today
                        </button>
                        <button
                          type="button"
                          onClick={() => rescheduleEntry(entry, plusOneDate(entry.scheduledDate))}
                          className={`${btnSecondary} !px-2.5 !py-1.5 text-xs`}
                        >
                          +1 Day
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (entry.rawTarget) {
                              onStartDailyTask(entry.rawTarget);
                            } else {
                              onStartDailyTask({
                                id: entry.id,
                                dayLabel: 'Self-Directed',
                                scheduledDate: entry.scheduledDate,
                                courseId: entry.sdId || 'self-directed',
                                courseTitle: entry.contextLabel,
                                sourceType: 'self_directed',
                                selfDirectedId: entry.sdId,
                                topic: entry.title,
                                objective: `Work through self-directed task: ${entry.title}`,
                                recommendedLesson: entry.contextLabel,
                                whatYouWillUnderstand: `Practical mastery of ${entry.title}`,
                                estimatedMinutes: entry.estimatedMinutes,
                                exerciseTitle: `Practice: ${entry.title}`,
                                exerciseInstructions: `Apply "${entry.title}" in a tiny test script or study note.`,
                                exerciseRequirements: ['Write or explain one concrete example', 'Note any open question'],
                                expectedConcepts: [entry.title],
                                starterHint: 'Keep your example focused on one core behavior.',
                                isTheoryOnly: false,
                                status: 'In Progress',
                              });
                            }
                          }}
                          className={`${btnPrimary} !px-3 !py-1.5 text-xs`}
                        >
                          Start Lesson →
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION B: SELF-DIRECTED LEARNING TOPICS */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className={`font-display text-xl ${textPrimary}`}>Self-Directed Learning</h2>
            <p className={`text-sm ${textSecondary}`}>
              Organize independent topics, project-based learning, custom study notes, and external docs outside formal courses.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSdForm((v) => !v)}
            className={btnPrimary}
          >
            <Plus className="w-4 h-4" /> {showSdForm ? 'Close Form' : 'New Study Topic'}
          </button>
        </div>

        {showSdForm && (
          <form onSubmit={handleCreateSelfDirected} className={`${cardClass} p-5 space-y-3`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className={`text-xs font-medium ${textSecondary}`}>Topic Title *</span>
                <input
                  type="text"
                  required
                  value={sdTitle}
                  onChange={(e) => setSdTitle(e.target.value)}
                  placeholder="e.g., PostgreSQL Indexing & Query Plans"
                  className={inputClass}
                />
              </label>
              <label className="block space-y-1">
                <span className={`text-xs font-medium ${textSecondary}`}>Subject / Technology</span>
                <input
                  type="text"
                  value={sdField}
                  onChange={(e) => setSdField(e.target.value)}
                  placeholder="e.g., Databases, TypeScript, Systems"
                  className={inputClass}
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className={`text-xs font-medium ${textSecondary}`}>Learning Objectives (One per line)</span>
              <textarea
                rows={2}
                value={sdObjectivesText}
                onChange={(e) => setSdObjectivesText(e.target.value)}
                placeholder={'Explain B-tree vs GIN indexes\nRead EXPLAIN ANALYZE output cleanly'}
                className={inputClass}
              />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className={`text-xs font-medium ${textSecondary}`}>Project-Based Learning Idea (Optional)</span>
                <input
                  type="text"
                  value={sdProjectIdea}
                  onChange={(e) => setSdProjectIdea(e.target.value)}
                  placeholder="e.g., Benchmark 50k sample rows before and after adding composite indexes"
                  className={inputClass}
                />
              </label>
              <label className="block space-y-1">
                <span className={`text-xs font-medium ${textSecondary}`}>External Reference URL (Optional)</span>
                <input
                  type="url"
                  value={sdRefUrl}
                  onChange={(e) => setSdRefUrl(e.target.value)}
                  placeholder="https://..."
                  className={inputClass}
                />
                {sdRefUrlError && <span className="text-xs text-[var(--danger-ink)]">{sdRefUrlError}</span>}
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowSdForm(false)} className={btnSecondary}>Cancel</button>
              <button type="submit" className={btnPrimary}>Save Study Topic</button>
            </div>
          </form>
        )}

        {selfDirectedTopics.length === 0 ? (
          <EmptyState
            title="No self-directed topics yet"
            description="Create a custom study topic whenever you want to explore documentation, build a mini-project, or learn independently without a formal course."
            actionLabel="Create Study Topic"
            onAction={() => setShowSdForm(true)}
          />
        ) : (
          <div className="space-y-4">
            {selfDirectedTopics.map((sd) => {
              const doneTasks = sd.tasks.filter((t) => t.done).length;
              const linkedPacks = importedMaterials.filter(
                (p) => p.linkedSelfDirectedId === sd.id || sd.linkedMaterialPackIds.includes(p.id)
              );
              const draftTask = sdTaskDraft[sd.id] || '';
              const draftRef = sdRefDraft[sd.id] || { title: '', url: '' };
              const draftRefErr = draftRef.url.trim() ? getUrlError(draftRef.url, 'https://...') : '';

              return (
                <div key={sd.id} className={`${cardClass} p-5 space-y-4`}>
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className={`text-xs flex flex-wrap items-center gap-2 ${textSecondary}`}>
                        <span className="font-semibold text-[var(--accent-600)]">{sd.field}</span>
                        <span>·</span>
                        <span>{doneTasks}/{sd.tasks.length} tasks done</span>
                        <span>·</span>
                        <span>{sd.objectives.length} objectives</span>
                      </div>
                      <h3 className={`text-xl font-semibold ${textPrimary}`}>{sd.title}</h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label={`Status for ${sd.title}`}
                        value={sd.status}
                        onChange={(e) =>
                          setSelfDirectedTopics((prev) =>
                            prev.map((x) =>
                              x.id === sd.id ? { ...x, status: e.target.value as any, updatedAt: new Date().toISOString() } : x
                            )
                          )
                        }
                        className={`${inputClass} !w-auto !py-1.5 text-xs`}
                      >
                        <option value="Not Started">Not Started</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Paused">Paused</option>
                        <option value="Completed">Completed</option>
                      </select>
                      {confirmDeleteSdId === sd.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setSelfDirectedTopics((prev) => prev.filter((x) => x.id !== sd.id));
                              setConfirmDeleteSdId(null);
                              onNotify('Removed self-directed topic.');
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--danger-ink)] text-white cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteSdId(null)}
                            className={`${btnSecondary} !px-2.5 !py-1.5 text-xs`}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Delete ${sd.title}`}
                          onClick={() => setConfirmDeleteSdId(sd.id)}
                          className={`p-2 rounded-lg border ${borderClass} ${textSecondary} hover:text-[var(--danger-ink)] cursor-pointer`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Learning Objectives & Project Idea */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className={`p-3.5 rounded-xl ${subtleBgClass} space-y-2`}>
                      <div className={`text-xs font-semibold ${textPrimary}`}>Learning Objectives</div>
                      <ul className={`space-y-1 text-xs ${textSecondary}`}>
                        {sd.objectives.map((obj, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <Sparkles className="w-3.5 h-3.5 text-[var(--accent-600)] shrink-0 mt-0.5" />
                            <span>{obj}</span>
                          </li>
                        ))}
                      </ul>
                      {sd.projectIdea && (
                        <div className={`pt-2 border-t ${borderClass} text-xs`}>
                          <strong className={textPrimary}>Project-Based Learning:</strong>{' '}
                          <span className={textSecondary}>{sd.projectIdea}</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className={`block text-xs font-semibold ${textPrimary}`}>Personal Study Notes</label>
                      <textarea
                        rows={3}
                        value={sd.notes}
                        onChange={(e) =>
                          setSelfDirectedTopics((prev) =>
                            prev.map((x) =>
                              x.id === sd.id ? { ...x, notes: e.target.value, updatedAt: new Date().toISOString() } : x
                            )
                          )
                        }
                        placeholder="Summarize concepts in your own words or track discoveries..."
                        className={inputClass}
                      />
                    </div>
                  </div>

                  {/* Tasks Checklist */}
                  <div className="space-y-2">
                    <div className={`text-xs font-semibold ${textPrimary}`}>Tasks</div>
                    <div className={`divide-y ${borderClass} border-t ${borderClass}`}>
                      {sd.tasks.map((task) => (
                        <div key={task.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setSelfDirectedTopics((prev) =>
                                prev.map((x) =>
                                  x.id === sd.id
                                    ? {
                                        ...x,
                                        updatedAt: new Date().toISOString(),
                                        tasks: x.tasks.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)),
                                      }
                                    : x
                                )
                              )
                            }
                            className="flex items-center gap-2 text-left flex-1 min-w-0 cursor-pointer"
                          >
                            {task.done ? (
                              <CheckCircle2 className="w-4 h-4 text-[var(--success-ink)] shrink-0" />
                            ) : (
                              <Circle className={`w-4 h-4 shrink-0 ${textSecondary}`} />
                            )}
                            <span className={`text-xs truncate ${task.done ? 'line-through opacity-60' : textPrimary}`}>
                              {task.title}
                            </span>
                            {task.scheduledDate && (
                              <span className={`text-[11px] shrink-0 ${textSecondary}`}>· {task.scheduledDate}</span>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onStartDailyTask({
                                id: task.id,
                                dayLabel: 'Self-Directed',
                                scheduledDate: task.scheduledDate || todayDate,
                                courseId: sd.id,
                                courseTitle: sd.title,
                                sourceType: 'self_directed',
                                selfDirectedId: sd.id,
                                topic: task.title,
                                objective: sd.objectives[0] || `Complete "${task.title}"`,
                                recommendedLesson: sd.title,
                                whatYouWillUnderstand: sd.projectIdea || `Clear grasp of ${task.title}`,
                                estimatedMinutes: task.estimatedMinutes || 25,
                                exerciseTitle: `Practice: ${task.title}`,
                                exerciseInstructions: sd.projectIdea || `Write a short experiment or summary exploring "${task.title}".`,
                                exerciseRequirements: sd.objectives.slice(0, 3),
                                expectedConcepts: [sd.field, task.title],
                                starterHint: 'Focus on one concrete experiment or code snippet.',
                                isTheoryOnly: false,
                                status: 'In Progress',
                              })
                            }
                            className="text-xs font-medium text-[var(--accent-600)] hover:underline cursor-pointer"
                          >
                            Study Today →
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        value={draftTask}
                        onChange={(e) => setSdTaskDraft((prev) => ({ ...prev, [sd.id]: e.target.value }))}
                        placeholder="Add a task to this topic..."
                        className={`${inputClass} !py-2 text-xs`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!draftTask.trim()) return;
                          setSelfDirectedTopics((prev) =>
                            prev.map((x) =>
                              x.id === sd.id
                                ? {
                                    ...x,
                                    updatedAt: new Date().toISOString(),
                                    tasks: [
                                      ...x.tasks,
                                      {
                                        id: `sdt-${Date.now()}`,
                                        title: draftTask.trim(),
                                        done: false,
                                        scheduledDate: todayDate,
                                        estimatedMinutes: 30,
                                      },
                                    ],
                                  }
                                : x
                            )
                          );
                          setSdTaskDraft((prev) => ({ ...prev, [sd.id]: '' }));
                        }}
                        className={`${btnSecondary} !py-2 text-xs`}
                      >
                        Add Task
                      </button>
                    </div>
                  </div>

                  {/* References + Connected Materials */}
                  <div className={`pt-3 border-t ${borderClass} space-y-2.5 text-xs`}>
                    <div className="flex flex-wrap items-center gap-2">
                      {sd.references.map((ref) => (
                        <a
                          key={ref.id}
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${btnSecondary} !px-3 !py-1.5 text-xs`}
                        >
                          <Link2 className="w-3.5 h-3.5" /> {ref.title} <ExternalLink className="w-3 h-3" />
                        </a>
                      ))}
                      {linkedPacks.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => onOpenMaterialsModal(p.id)}
                          className={`${btnSecondary} !px-3 !py-1.5 text-xs`}
                        >
                          <FolderArchive className="w-3.5 h-3.5" /> {p.title}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <input
                        type="text"
                        value={draftRef.title}
                        onChange={(e) =>
                          setSdRefDraft((prev) => ({ ...prev, [sd.id]: { ...draftRef, title: e.target.value } }))
                        }
                        placeholder="Reference label (e.g. MDN Guide)"
                        className={`${inputClass} !py-1.5 text-xs sm:col-span-4`}
                      />
                      <input
                        type="url"
                        value={draftRef.url}
                        onChange={(e) =>
                          setSdRefDraft((prev) => ({ ...prev, [sd.id]: { ...draftRef, url: e.target.value } }))
                        }
                        placeholder="https://..."
                        className={`${inputClass} !py-1.5 text-xs sm:col-span-6`}
                      />
                      <button
                        type="button"
                        disabled={!draftRef.url.trim() || Boolean(draftRefErr)}
                        onClick={() => {
                          if (!draftRef.url.trim() || draftRefErr) return;
                          setSelfDirectedTopics((prev) =>
                            prev.map((x) =>
                              x.id === sd.id
                                ? {
                                    ...x,
                                    updatedAt: new Date().toISOString(),
                                    references: [
                                      ...x.references,
                                      {
                                        id: `ref-${Date.now()}`,
                                        title: draftRef.title.trim() || 'External Resource',
                                        url: draftRef.url.trim(),
                                      },
                                    ],
                                  }
                                : x
                            )
                          );
                          setSdRefDraft((prev) => ({ ...prev, [sd.id]: { title: '', url: '' } }));
                        }}
                        className={`${btnSecondary} !py-1.5 text-xs sm:col-span-2`}
                      >
                        Add Link
                      </button>
                    </div>
                    {draftRefErr && <p className="text-xs text-[var(--danger-ink)]">{draftRefErr}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
