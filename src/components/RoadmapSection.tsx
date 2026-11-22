import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Badge, PageHeader, ProgressBar } from './ui';
import { getUrlError } from '../lib/url';
import { lookupOfficialRoadmap, requestAiRoadmap } from '../lib/aiClient';
import { ROADMAPS_CATALOG } from '../data/seedData';
import type {
  OnboardingProfile,
  RoadmapItem,
  RoadmapTopic,
  RoadmapTopicProgress,
} from '../types';

const STATUS_ORDER = [
  'Not Started',
  'In Progress',
  'Practised',
  'Demonstrated',
  'Needs Revision',
];

export const RoadmapSection = ({
  profile,
  setProfile,
  selectedRoadmapId,
  setSelectedRoadmapId,
  customRoadmaps,
  setCustomRoadmaps,
  roadmapProgress,
  setRoadmapProgress,
  userId,
  onAskMentor,
  onQuizTopic,
  onNotify,
  styles,
}: {
  profile: OnboardingProfile;
  setProfile: (p: OnboardingProfile) => void;
  selectedRoadmapId: string;
  setSelectedRoadmapId: (id: string) => void;
  customRoadmaps: RoadmapItem[];
  setCustomRoadmaps: (r: RoadmapItem[]) => void;
  roadmapProgress: Record<string, RoadmapTopicProgress>;
  setRoadmapProgress: (p: Record<string, RoadmapTopicProgress>) => void;
  userId?: string;
  onAskMentor: (topic: string) => void;
  onQuizTopic?: (topic: string) => void;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  styles: {
    cardClass: string;
    borderClass: string;
    subtleBgClass: string;
    textPrimary: string;
    textSecondary: string;
    inputClass: string;
    btnPrimary: string;
    btnSecondary: string;
  };
}) => {
  const { cardClass, borderClass, subtleBgClass, textPrimary, textSecondary, inputClass, btnPrimary, btnSecondary } = styles;

  // Prefer customized/live-synced copies over static catalog entries when IDs match
  const allRoadmaps: RoadmapItem[] = [
    ...customRoadmaps,
    ...ROADMAPS_CATALOG.filter((cat) => !customRoadmaps.some((cr) => cr.id === cat.id)),
  ];
  const selectedRoadmap = allRoadmaps.find((r) => r.id === selectedRoadmapId) || allRoadmaps[0];

  const [searchField, setSearchField] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [topicFilter, setTopicFilter] = useState<'ALL' | 'Outstanding' | 'In Progress' | 'Needs Revision' | 'Completed'>('ALL');

  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({ '0': true });
  const [openTopicTools, setOpenTopicTools] = useState<Record<string, boolean>>({});
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newLinkDrafts, setNewLinkDrafts] = useState<Record<string, string>>({});
  const [linkErrors, setLinkErrors] = useState<Record<string, string>>({});
  const [skipTopicId, setSkipTopicId] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState(profile.goal || '');

  const getStatus = (topicId: string) => {
    const raw = roadmapProgress[topicId]?.status || 'Not Started';
    if (raw === 'Completed') return 'Demonstrated';
    if (raw === 'Currently Learning') return 'In Progress';
    return raw;
  };

  const demonstratedCount = selectedRoadmap.topics.filter((t) => getStatus(t.id) === 'Demonstrated').length;
  const practisedCount = selectedRoadmap.topics.filter((t) => getStatus(t.id) === 'Practised').length;
  const inProgressCount = selectedRoadmap.topics.filter((t) => getStatus(t.id) === 'In Progress').length;
  const needsRevisionCount = selectedRoadmap.topics.filter((t) => getStatus(t.id) === 'Needs Revision' || roadmapProgress[t.id]?.struggling).length;
  const outstandingCount = selectedRoadmap.topics.filter((t) => getStatus(t.id) === 'Not Started').length;
  const pct = selectedRoadmap.topics.length
    ? Math.round(((demonstratedCount + practisedCount * 0.5) / selectedRoadmap.topics.length) * 100)
    : 0;

  const stages = selectedRoadmap.stages?.length
    ? selectedRoadmap.stages
    : [
        {
          id: 'default-stage',
          title: 'Learning Steps',
          description: 'Work through one topic at a time.',
          topics: selectedRoadmap.topics,
        },
      ];

  const currentStageIndex = Math.max(
    0,
    stages.findIndex((st) => st.topics.some((t) => getStatus(t.id) !== 'Demonstrated'))
  );

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchField.trim()) return;
    setLookupBusy(true);
    try {
      const res = await lookupOfficialRoadmap(searchField.trim());
      setLookupResult(res);
    } catch {
      setLookupResult({ found: false, field: searchField.trim() });
    } finally {
      setLookupBusy(false);
    }
  };

  const handleGenerateAiAlternative = async (fieldOverride?: string) => {
    setAiBusy(true);
    try {
      const targetField = fieldOverride || searchField.trim() || selectedRoadmap.field || profile.field || 'Web Development';
      const { data } = await requestAiRoadmap(
        {
          field: targetField,
          skillLevel: profile.skillLevel || 'Beginner',
          knownSkills: profile.knownSkills || '',
          goal: profile.goal || 'Become a confident developer',
          studyTime: profile.studyTime || '45 minutes per day',
        },
        userId
      );
      const nextStages = (data.stages || []).map((st, idx) => ({
        id: `ai-st-${Date.now()}-${idx}`,
        title: st.stageName,
        description: st.description,
        topics: (st.topics || []).map((tp, tIdx) => ({
          id: `ai-tp-${Date.now()}-${idx}-${tIdx}`,
          name: tp.name,
          summary: tp.whyItMatters,
          stageTitle: st.stageName,
        })),
      }));
      const flatTopics = nextStages.flatMap((s) => s.topics);
      const created: RoadmapItem = {
        id: `rm-ai-${Date.now()}`,
        source: 'ai',
        title: data.title || `${targetField} Custom Roadmap`,
        field: targetField,
        officialUrl: '',
        summary: data.summary || `Structured path for ${targetField}.`,
        stages: nextStages,
        topics: flatTopics,
      };
      setCustomRoadmaps([created, ...customRoadmaps]);
      setSelectedRoadmapId(created.id);
      setLookupResult(null);
      setExpandedStages({ '0': true });
      onNotify(`Created personalized roadmap: ${created.title}`);
    } catch (err: any) {
      onNotify(err?.message || 'AI roadmap generator could not run right now. Add custom topics manually below.', 'error');
    } finally {
      setAiBusy(false);
    }
  };

  const ensureEditableRoadmap = (): { roadmaps: RoadmapItem[]; active: RoadmapItem } => {
    const existingCustom = customRoadmaps.find((r) => r.id === selectedRoadmap.id);
    if (existingCustom) return { roadmaps: customRoadmaps, active: existingCustom };
    const cloned: RoadmapItem = {
      ...selectedRoadmap,
      id: `rm-custom-${Date.now()}`,
      source: 'custom',
      title: `${selectedRoadmap.title} (My Custom Path)`,
      topics: selectedRoadmap.topics.map((t) => ({ ...t })),
      stages: selectedRoadmap.stages?.map((s) => ({ ...s, topics: s.topics.map((t) => ({ ...t })) })),
    };
    return { roadmaps: [cloned, ...customRoadmaps], active: cloned };
  };

  const handleAddTopic = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTopicTitle.trim();
    if (!title) return;
    const { roadmaps, active } = ensureEditableRoadmap();
    const newTopic: RoadmapTopic = {
      id: `tp-${Date.now()}`,
      name: title,
      summary: 'Added by you',
      stageTitle: stages[0]?.title || 'Custom Steps',
    };
    const updatedStages = active.stages?.length
      ? active.stages.map((st, idx) => (idx === 0 ? { ...st, topics: [...st.topics, newTopic] } : st))
      : [{ id: 'custom-s1', title: 'My Topics', description: '', topics: [...active.topics, newTopic] }];

    const nextActive: RoadmapItem = {
      ...active,
      topics: [...active.topics, newTopic],
      stages: updatedStages,
    };
    setCustomRoadmaps(roadmaps.map((r) => (r.id === active.id ? nextActive : r)));
    setSelectedRoadmapId(nextActive.id);
    setNewTopicTitle('');
    onNotify(`Added "${title}" to your roadmap.`);
  };

  const handleRemoveTopic = (topicId: string) => {
    const { roadmaps, active } = ensureEditableRoadmap();
    const nextActive: RoadmapItem = {
      ...active,
      topics: active.topics.filter((t) => t.id !== topicId),
      stages: active.stages?.map((st) => ({
        ...st,
        topics: st.topics.filter((t) => t.id !== topicId),
      })),
    };
    setCustomRoadmaps(roadmaps.map((r) => (r.id === active.id ? nextActive : r)));
    setSelectedRoadmapId(nextActive.id);
    onNotify('Removed topic from your custom path.');
  };

  const handleMoveTopic = (stageIdx: number, topicIdx: number, direction: -1 | 1) => {
    const { roadmaps, active } = ensureEditableRoadmap();
    const activeStages = active.stages?.length
      ? [...active.stages]
      : [{ id: 's-0', title: 'Learning Steps', description: '', topics: [...active.topics] }];

    const st = { ...activeStages[stageIdx], topics: [...activeStages[stageIdx].topics] };
    const swapIdx = topicIdx + direction;
    if (swapIdx < 0 || swapIdx >= st.topics.length) return;
    const temp = st.topics[topicIdx];
    st.topics[topicIdx] = st.topics[swapIdx];
    st.topics[swapIdx] = temp;
    activeStages[stageIdx] = st;

    const nextActive: RoadmapItem = {
      ...active,
      stages: activeStages,
      topics: activeStages.flatMap((s) => s.topics),
    };
    setCustomRoadmaps(roadmaps.map((r) => (r.id === active.id ? nextActive : r)));
    setSelectedRoadmapId(nextActive.id);
  };

  const updateTopicStatus = (topicId: string, nextStatus: string) => {
    setRoadmapProgress({
      ...roadmapProgress,
      [topicId]: {
        ...(roadmapProgress[topicId] || { notes: '', struggling: false }),
        status: nextStatus,
        struggling: nextStatus === 'Needs Revision',
      },
    });
  };

  const markAlreadyKnow = (topicId: string) => {
    const existing = roadmapProgress[topicId] || { notes: '', struggling: false };
    setRoadmapProgress({
      ...roadmapProgress,
      [topicId]: {
        ...existing,
        status: 'Demonstrated',
        struggling: false,
        notes: existing.notes || 'Marked as already known.',
      },
    });
    onNotify('Marked as already known.');
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="My Learning Plan"
        description="Follow one stage at a time instead of everything at once. Mark topics you already know, save notes, or switch paths anytime."
        action={
          <>
            <button type="button" onClick={() => setShowSwitcher((v) => !v)} className={btnSecondary}>
              <Search className="w-3.5 h-3.5" /> {showSwitcher ? 'Hide Path Finder' : 'Switch or Search Roadmap'}
            </button>
            <button
              type="button"
              disabled={aiBusy}
              onClick={() => handleGenerateAiAlternative()}
              className={btnPrimary}
            >
              {aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Create AI Path
            </button>
          </>
        }
      />

      {/* Collapsible Roadmap Finder / Switcher */}
      {showSwitcher && (
        <div className={`${cardClass} p-6 space-y-4`}>
          <form onSubmit={handleLookup} className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className={`w-4 h-4 absolute left-3.5 top-3 ${textSecondary}`} />
              <input
                type="text"
                value={searchField}
                onChange={(e) => setSearchField(e.target.value)}
                placeholder="Search roadmap.sh by field (e.g., Frontend, Backend, Cybersecurity, Python)..."
                className={`${inputClass} pl-10`}
              />
            </div>
            <button type="submit" disabled={lookupBusy} className={btnPrimary}>
              {lookupBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search roadmap.sh'}
            </button>
          </form>

          {lookupResult && (
            <div className={`p-4 rounded-xl border ${borderClass} ${subtleBgClass} space-y-4`}>
              {lookupResult.found ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant={lookupResult.liveSynced ? 'success' : 'info'}>
                      {lookupResult.liveSynced ? 'Live synced from roadmap.sh' : 'Curated roadmap.sh structure'}
                    </Badge>
                    <a href={lookupResult.officialUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[var(--accent-600)] hover:underline inline-flex items-center gap-1">
                      Original roadmap.sh <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div>
                    <h3 className={`text-sm font-semibold ${textPrimary}`}>{lookupResult.title}</h3>
                    <p className={`text-xs mt-0.5 ${textSecondary}`}>{lookupResult.summary}</p>
                    {!lookupResult.liveSynced && (
                      <p className={`text-[11px] mt-1 ${textSecondary}`}>
                        Loaded from verified local snapshot because live roadmap.sh endpoint did not respond with JSON.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const catalogMatch = ROADMAPS_CATALOG.find(
                          (r) => r.id === lookupResult.id || r.slug === lookupResult.slug
                        );
                        if (!lookupResult.liveSynced && catalogMatch) {
                          setSelectedRoadmapId(catalogMatch.id);
                        } else {
                          const targetId = catalogMatch?.id || lookupResult.id || `rm-${lookupResult.slug}`;
                          const created: RoadmapItem = {
                            id: targetId,
                            slug: lookupResult.slug,
                            source: 'roadmap.sh',
                            liveSynced: Boolean(lookupResult.liveSynced),
                            syncedAt: lookupResult.syncedAt || new Date().toISOString(),
                            title: lookupResult.title,
                            field: lookupResult.field,
                            officialUrl: lookupResult.officialUrl,
                            summary: lookupResult.summary,
                            whatYouWillLearn: lookupResult.whatYouWillLearn,
                            stages: lookupResult.stages,
                            topics: (lookupResult.stages || []).flatMap((s: any) => s.topics),
                          };
                          setCustomRoadmaps([created, ...customRoadmaps.filter((r) => r.id !== targetId)]);
                          setSelectedRoadmapId(created.id);
                        }
                        setLookupResult(null);
                        onNotify(`Switched to ${lookupResult.title} roadmap.`);
                      }}
                      className={btnPrimary}
                    >
                      Use This Roadmap
                    </button>
                    <button type="button" onClick={() => handleGenerateAiAlternative(lookupResult.field)} className={btnSecondary}>
                      Create AI Alternative
                    </button>
                    <button type="button" onClick={() => setLookupResult(null)} className={btnSecondary}>
                      Close
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className={`text-sm font-semibold ${textPrimary}`}>
                    No exact roadmap.sh match for “{lookupResult.field}” yet — build a custom path instead.
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={aiBusy} onClick={() => handleGenerateAiAlternative(lookupResult.field)} className={btnPrimary}>
                      {aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      Generate Path for “{lookupResult.field}”
                    </button>
                    <button type="button" onClick={() => setLookupResult(null)} className={btnSecondary}>Dismiss</button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {allRoadmaps.map((rm) => {
              const active = rm.id === selectedRoadmap.id;
              return (
                <button
                  key={rm.id}
                  type="button"
                  onClick={() => {
                    setSelectedRoadmapId(rm.id);
                    setExpandedStages({ '0': true });
                  }}
                  className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
                    active
                      ? 'bg-[var(--accent-600)] text-white border-[var(--accent-600)]'
                      : `${subtleBgClass} ${borderClass} ${textPrimary} hover:border-[var(--accent-500)]/40`
                  }`}
                >
                  <div className="text-xs opacity-80">{rm.source === 'ai' ? 'AI Custom Path' : rm.source === 'custom' ? 'Customized' : 'roadmap.sh'}</div>
                  <div className="text-sm font-semibold mt-0.5 truncate">{rm.title}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Roadmap Overview + Stage List */}
      <div className={`${cardClass} p-6 space-y-5`}>
        <div className={`flex flex-col md:flex-row md:items-start justify-between gap-4 pb-5 border-b ${borderClass}`}>
          <div className="space-y-2 max-w-2xl">
            <div className={`flex flex-wrap items-center gap-2 text-xs ${textSecondary}`}>
              <span className="font-semibold text-[var(--accent-600)]">{selectedRoadmap.field}</span>
              <span>·</span>
              <span>Goal: <strong className={textPrimary}>{profile.goal || 'Become a better developer'}</strong></span>
              <button type="button" onClick={() => setEditingGoal((v) => !v)} className="text-[var(--accent-600)] hover:underline cursor-pointer">
                {editingGoal ? 'Cancel' : 'Edit goal'}
              </button>
              {selectedRoadmap.officialUrl && (
                <>
                  <span>·</span>
                  <a href={selectedRoadmap.officialUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-600)] hover:underline inline-flex items-center gap-1">
                    {selectedRoadmap.liveSynced ? 'Live synced with roadmap.sh' : 'Based on roadmap.sh (snapshot)'} <ExternalLink className="w-3 h-3" />
                  </a>
                  <button
                    type="button"
                    disabled={refreshBusy}
                    onClick={async () => {
                      setRefreshBusy(true);
                      try {
                        const res = await lookupOfficialRoadmap(selectedRoadmap.slug || selectedRoadmap.field || selectedRoadmap.title);
                        if (res?.found && res?.liveSynced) {
                          const refreshed: RoadmapItem = {
                            ...selectedRoadmap,
                            liveSynced: true,
                            syncedAt: res.syncedAt || new Date().toISOString(),
                            title: res.title || selectedRoadmap.title,
                            summary: res.summary || selectedRoadmap.summary,
                            stages: res.stages,
                            topics: (res.stages || []).flatMap((s: any) => s.topics),
                          };
                          setCustomRoadmaps([refreshed, ...customRoadmaps.filter((r) => r.id !== selectedRoadmap.id)]);
                          onNotify(`Refreshed ${refreshed.title} live from roadmap.sh.`);
                        } else {
                          onNotify('Live roadmap.sh feed unavailable right now; keeping verified snapshot.', 'error');
                        }
                      } catch {
                        onNotify('Could not reach roadmap.sh right now.', 'error');
                      } finally {
                        setRefreshBusy(false);
                      }
                    }}
                    className="text-[var(--accent-600)] hover:underline cursor-pointer disabled:opacity-50"
                  >
                    {refreshBusy ? 'Refreshing…' : 'Sync now'}
                  </button>
                </>
              )}
            </div>
            {editingGoal && (
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={goalDraft}
                  onChange={(e) => setGoalDraft(e.target.value)}
                  placeholder="Enter your updated learning goal..."
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => {
                    setProfile({ ...profile, goal: goalDraft.trim() || profile.goal });
                    setEditingGoal(false);
                    onNotify('Learning goal updated!');
                  }}
                  className={btnPrimary}
                >
                  Save
                </button>
              </div>
            )}
            <h2 className={`font-display text-2xl ${textPrimary}`}>{selectedRoadmap.title}</h2>
            <p className={`text-xs leading-relaxed ${textSecondary}`}>{selectedRoadmap.summary}</p>
          </div>
          <div className="shrink-0 min-w-[200px] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className={textSecondary}>Overall progress</span>
              <span className={`font-semibold tabular-nums ${textPrimary}`}>{pct}%</span>
            </div>
            <ProgressBar value={pct} />
            <div className={`text-xs tabular-nums ${textSecondary}`}>
              {demonstratedCount} demonstrated · {outstandingCount} outstanding
            </div>
          </div>
        </div>

        {/* Topic Breakdown & Quick Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'ALL', label: `All (${selectedRoadmap.topics.length})` },
                { id: 'Outstanding', label: `Outstanding (${outstandingCount})` },
                { id: 'In Progress', label: `In Progress (${inProgressCount})` },
                { id: 'Needs Revision', label: `Needs Revision (${needsRevisionCount})` },
                { id: 'Completed', label: `Completed (${demonstratedCount + practisedCount})` },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTopicFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer transition ${
                  topicFilter === f.id
                    ? 'bg-[var(--accent-600)] text-white border-[var(--accent-600)]'
                    : `${borderClass} ${subtleBgClass} ${textSecondary} hover:${textPrimary}`
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Add a custom topic */}
        <form onSubmit={handleAddTopic} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={newTopicTitle}
            onChange={(e) => setNewTopicTitle(e.target.value)}
            placeholder="Add your own topic to this plan (e.g., Tailwind Responsive Navbars)..."
            className={inputClass}
          />
          <button type="submit" className={btnSecondary}>
            <Plus className="w-4 h-4" /> Add Topic
          </button>
        </form>

        {/* Stage-by-Stage Accordion */}
        <div className="relative space-y-5 pl-8 sm:pl-10 before:content-[''] before:absolute before:left-[11px] sm:before:left-[13px] before:top-4 before:bottom-4 before:w-[3px] before:bg-[var(--border-hairline)]">
          {stages.map((stage, sIdx) => {
            const isOpen = expandedStages[String(sIdx)] ?? sIdx === currentStageIndex;
            const stageDone = stage.topics.filter((t) => getStatus(t.id) === 'Demonstrated').length;
            const isCurrentStage = sIdx === currentStageIndex;

            return (
              <div key={stage.id} className="relative">
                <span
                  className={`absolute -left-8 sm:-left-10 top-3.5 w-[24px] h-[24px] sm:w-[28px] sm:h-[28px] rounded-full text-xs font-semibold tabular-nums flex items-center justify-center border-2 z-10 ${
                    stageDone === stage.topics.length && stage.topics.length > 0
                      ? 'bg-[var(--success-ink)] border-[var(--success-ink)] text-white'
                      : isCurrentStage
                        ? 'bg-[var(--spark)] border-[var(--ink-primary)] text-[var(--on-spark)]'
                        : 'bg-[var(--surface-elevated)] border-[var(--border-strong)] text-[var(--ink-secondary)]'
                  }`}
                >
                  {stageDone === stage.topics.length && stage.topics.length > 0 ? '✓' : sIdx + 1}
                </span>
              <div className={`relative rounded-xl border overflow-hidden bg-[var(--surface-elevated)] ${isCurrentStage ? 'border-[var(--ink-primary)] shadow-[var(--shadow-md)]' : borderClass}`}>
                <span
                  aria-hidden="true"
                  className={`absolute left-[-1px] top-0 bottom-0 w-1 ${stageDone === stage.topics.length && stage.topics.length > 0 ? 'bg-[var(--success-ink)]' : isCurrentStage ? 'bg-[var(--spark)]' : 'bg-transparent'}`}
                />
                <button
                  type="button"
                  onClick={() => setExpandedStages((prev) => ({ ...prev, [String(sIdx)]: !isOpen }))}
                  className={`w-full px-5 py-4 flex items-center justify-between gap-3 text-left cursor-pointer ${subtleBgClass}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm font-semibold ${textPrimary}`}>{stage.title}</span>
                        {isCurrentStage && (
                          <span className="text-xs font-semibold text-[var(--accent-600)]">· Current Focus</span>
                        )}
                      </div>
                      {stage.description && <div className={`text-xs truncate mt-0.5 ${textSecondary}`}>{stage.description}</div>}
                    </div>
                  </div>
                  <span className={`text-xs font-medium tabular-nums shrink-0 ${textSecondary}`}>
                    {stageDone}/{stage.topics.length} done
                  </span>
                </button>

                {isOpen && (
                  <div className={`p-5 space-y-4 border-t ${borderClass}`}>
                    {/* Beginner stage clarity: What you'll learn / Why it matters / What you'll be able to do */}
                    <div className={`p-4 rounded-xl ${subtleBgClass} grid grid-cols-1 md:grid-cols-3 gap-4 text-xs`}>
                      <div>
                        <div className={`font-semibold ${textPrimary}`}>What you’ll learn</div>
                        <p className={`mt-1 leading-relaxed ${textSecondary}`}>
                          {stage.topics.slice(0, 3).map((t) => t.name).join(', ')}
                          {stage.topics.length > 3 ? ` + ${stage.topics.length - 3} more` : ''}.
                        </p>
                      </div>
                      <div>
                        <div className={`font-semibold ${textPrimary}`}>Why it matters</div>
                        <p className={`mt-1 leading-relaxed ${textSecondary}`}>
                          {stage.description || 'Builds essential foundations before moving to harder tools.'}
                        </p>
                      </div>
                      <div>
                        <div className={`font-semibold ${textPrimary}`}>What you’ll be able to do</div>
                        <p className={`mt-1 leading-relaxed ${textSecondary}`}>
                          Apply these concepts in small daily exercises, answer check-in quizzes, and build projects cleanly.
                        </p>
                      </div>
                    </div>

                    {/* Clean single-level topic rows */}
                    <div className={`divide-y ${borderClass}`}>
                      {stage.topics
                        .filter((topic) => {
                          const st = getStatus(topic.id);
                          if (topicFilter === 'ALL') return true;
                          if (topicFilter === 'Outstanding') return st === 'Not Started';
                          if (topicFilter === 'In Progress') return st === 'In Progress';
                          if (topicFilter === 'Needs Revision') return st === 'Needs Revision' || Boolean(roadmapProgress[topic.id]?.struggling);
                          return st === 'Demonstrated' || st === 'Practised';
                        })
                        .map((topic, tIdx) => {
                        const state = roadmapProgress[topic.id] || { status: 'Not Started', notes: '', struggling: false, customLinks: [] };
                        const status = getStatus(topic.id);
                        const links = state.customLinks || [];
                        const toolsOpen = openTopicTools[topic.id] ?? false;

                        return (
                          <div key={topic.id} className="py-4 first:pt-1 last:pb-1 space-y-4">
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                              <div className="space-y-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2.5">
                                  <label htmlFor={`topic-status-${topic.id}`} className="sr-only">
                                    Learning status for {topic.name}
                                  </label>
                                  <select
                                    id={`topic-status-${topic.id}`}
                                    value={status}
                                    onChange={(e) => updateTopicStatus(topic.id, e.target.value)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer whitespace-nowrap shrink-0 focus:outline-none focus:ring-2 focus:ring-[var(--accent-500)]/20 ${
                                      status === 'Demonstrated'
                                        ? 'bg-[var(--success-bg)] text-[var(--success-ink)] border-[var(--success-border)]'
                                        : status === 'Practised'
                                          ? 'bg-[var(--accent-50)] text-[var(--accent-600)] border-[var(--accent-500)]/40'
                                          : status === 'Needs Revision'
                                            ? 'bg-[var(--warning-bg)] text-[var(--warning-ink)] border-[var(--warning-border)]'
                                            : status === 'In Progress'
                                              ? 'bg-[var(--accent-100)] text-[var(--accent-600)] border-[var(--accent-500)]/40'
                                              : `${borderClass} bg-transparent ${textSecondary}`
                                    }`}
                                  >
                                    {STATUS_ORDER.map((opt) => (
                                      <option key={opt} value={opt} className="bg-[var(--surface-elevated)] text-[var(--ink-primary)]">
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                  <span className={`text-sm font-semibold ${textPrimary}`}>{topic.name}</span>
                                  {topic.resourceUrl && (
                                    <a
                                      href={topic.resourceUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-600)] hover:underline"
                                    >
                                      Guide <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                  {(state.notes || links.length > 0) && (
                                    <span className={`text-xs ${textSecondary}`}>
                                      · {links.length ? `${links.length} link${links.length > 1 ? 's' : ''}` : 'Notes saved'}
                                    </span>
                                  )}
                                </div>
                                {topic.summary && <p className={`text-xs leading-relaxed ${textSecondary}`}>{topic.summary}</p>}
                              </div>

                              <div className="flex flex-wrap items-center gap-2 shrink-0">
                                {status !== 'Demonstrated' && (
                                  <button type="button" onClick={() => markAlreadyKnow(topic.id)} className={btnSecondary} title="Mark if you already know this">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Already Know
                                  </button>
                                )}
                                {onQuizTopic && (
                                  <button type="button" onClick={() => onQuizTopic(topic.name)} className={btnSecondary}>
                                    Quiz Topic
                                  </button>
                                )}
                                <button type="button" onClick={() => onAskMentor(topic.name)} className={btnSecondary}>
                                  Ask Mentor
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setOpenTopicTools((prev) => ({ ...prev, [topic.id]: !toolsOpen }))}
                                  className={`text-xs font-medium px-2 py-1.5 rounded-lg cursor-pointer ${textSecondary} hover:text-[var(--accent-600)]`}
                                >
                                  {toolsOpen ? 'Hide Notes' : 'Notes & Links'}
                                </button>
                              </div>
                            </div>

                            {toolsOpen && (
                              <div className={`p-4 rounded-xl ${subtleBgClass} space-y-4`}>
                                <div>
                                  <label className={`block text-xs font-medium mb-1 ${textSecondary}`}>Personal notes & key takeaways</label>
                                  <input
                                    type="text"
                                    value={state.notes}
                                    onChange={(e) =>
                                      setRoadmapProgress({
                                        ...roadmapProgress,
                                        [topic.id]: { ...state, notes: e.target.value },
                                      })
                                    }
                                    placeholder="Write what clicked or what confused you..."
                                    className={inputClass}
                                  />
                                </div>

                                <div className="space-y-3">
                                  {links.length > 0 && (
                                    <div className="flex flex-wrap gap-3">
                                      {links.map((lnk, idx) => (
                                        <a
                                          key={idx}
                                          href={lnk}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-600)] hover:underline"
                                        >
                                          <ExternalLink className="w-3 h-3" /> Saved Link {idx + 1}
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                  <div className="flex flex-col sm:flex-row gap-2">
                                    <input
                                      type="url"
                                      value={newLinkDrafts[topic.id] || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setNewLinkDrafts({ ...newLinkDrafts, [topic.id]: val });
                                        setLinkErrors((prev) => ({ ...prev, [topic.id]: getUrlError(val, 'https://developer.mozilla.org/...') }));
                                      }}
                                      placeholder="Save a tutorial or doc URL (https://...)..."
                                      className={`${inputClass} text-xs`}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const url = (newLinkDrafts[topic.id] || '').trim();
                                        if (!url) return;
                                        const err = getUrlError(url, 'https://developer.mozilla.org/...');
                                        if (err) {
                                          setLinkErrors((prev) => ({ ...prev, [topic.id]: err }));
                                          return;
                                        }
                                        setRoadmapProgress({
                                          ...roadmapProgress,
                                          [topic.id]: { ...state, customLinks: [...links, url] },
                                        });
                                        setNewLinkDrafts({ ...newLinkDrafts, [topic.id]: '' });
                                        setLinkErrors((prev) => ({ ...prev, [topic.id]: '' }));
                                        onNotify('Resource link saved to topic.');
                                      }}
                                      className={btnSecondary}
                                    >
                                      Save Link
                                    </button>
                                  </div>
                                  {linkErrors[topic.id] && (
                                    <p className="text-xs text-[var(--danger-ink)]">{linkErrors[topic.id]}</p>
                                  )}
                                </div>

                                <div className={`pt-2 border-t ${borderClass} flex flex-wrap items-center justify-between gap-2`}>
                                  {status !== 'Demonstrated' ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSkipTopicId(skipTopicId === topic.id ? null : topic.id);
                                        setSkipReason('');
                                      }}
                                      className="text-xs font-medium text-[var(--accent-600)] hover:underline cursor-pointer"
                                    >
                                      {skipTopicId === topic.id ? 'Cancel skip check' : 'Skip with quick verification'}
                                    </button>
                                  ) : (
                                    <span />
                                  )}
                                  <div className="flex items-center gap-1.5">
                                    {(() => {
                                      const origIdx = stage.topics.findIndex((x) => x.id === topic.id);
                                      return (
                                        <>
                                          <button type="button" onClick={() => handleMoveTopic(sIdx, origIdx, -1)} disabled={origIdx <= 0} aria-label="Move up" className={`${btnSecondary} !px-2 disabled:opacity-40`}>
                                            <ArrowUp className="w-3.5 h-3.5" />
                                          </button>
                                          <button type="button" onClick={() => handleMoveTopic(sIdx, origIdx, 1)} disabled={origIdx < 0 || origIdx >= stage.topics.length - 1} aria-label="Move down" className={`${btnSecondary} !px-2 disabled:opacity-40`}>
                                            <ArrowDown className="w-3.5 h-3.5" />
                                          </button>
                                        </>
                                      );
                                    })()}
                                    <button type="button" onClick={() => handleRemoveTopic(topic.id)} aria-label="Remove topic" className={`${btnSecondary} !px-2 text-[var(--danger-ink)]`}>
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {skipTopicId === topic.id && (
                                  <div className={`p-3 rounded-lg border ${borderClass} space-y-3`}>
                                    <p className={`text-xs font-medium ${textPrimary}`}>
                                      Quick check before skipping “{topic.name}”: explain in 1 sentence what it does or share an example.
                                    </p>
                                    <div className="flex gap-2">
                                      <input
                                        type="text"
                                        value={skipReason}
                                        onChange={(e) => setSkipReason(e.target.value)}
                                        placeholder="e.g., I used Flexbox on 3 responsive pages in my portfolio..."
                                        className={inputClass}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (!skipReason.trim()) return;
                                          setRoadmapProgress({
                                            ...roadmapProgress,
                                            [topic.id]: {
                                              ...state,
                                              status: 'Demonstrated',
                                              struggling: false,
                                              notes: `Skipped with explanation: ${skipReason.trim()}`,
                                              skippedReason: skipReason.trim(),
                                            },
                                          });
                                          setSkipTopicId(null);
                                          setSkipReason('');
                                          onNotify(`Verified & skipped "${topic.name}".`);
                                        }}
                                        className={btnPrimary}
                                      >
                                        Confirm Skip
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
