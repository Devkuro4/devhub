import React, { useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Circle,
  ExternalLink,
  Link2,
  MessageSquare,
  Plus,
  Search,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { Badge, EmptyState, Modal, SkeletonBlock } from './ui';
import { getUrlError } from '../lib/url';
import type { StudyGroup } from '../types';

export const StudyGroupsPanel: React.FC<{
  groups: StudyGroup[];
  loading?: boolean;
  currentUserId: string;
  currentUserField?: string;
  mutedReason?: string;
  onCreateGroup: (input: {
    name: string;
    field: string;
    topic: string;
    description: string;
    level?: string;
    schedule?: string;
    maxMembers?: number;
  }) => Promise<StudyGroup | null | void>;
  onToggleJoinGroup: (groupId: string) => Promise<void> | void;
  onUpdateWorkspace: (
    groupId: string,
    input: { addGoal?: string; toggleGoalId?: string; addLink?: { title: string; url: string } }
  ) => Promise<void> | void;
  onOpenGroupChat: (group: StudyGroup) => void;
  onSelectMember: (memberId: string, memberName: string) => void;
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
}> = ({
  groups,
  loading,
  currentUserId,
  currentUserField,
  mutedReason,
  onCreateGroup,
  onToggleJoinGroup,
  onUpdateWorkspace,
  onOpenGroupChat,
  onSelectMember,
  styles,
}) => {
  const { cardClass, borderClass, subtleBgClass, textPrimary, textSecondary, inputClass, btnPrimary, btnSecondary } = styles;

  const [search, setSearch] = useState('');
  const [filterScope, setFilterScope] = useState<'all' | 'mine'>('all');
  const [fieldFilter, setFieldFilter] = useState('All');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create group form
  const [name, setName] = useState('');
  const [field, setField] = useState(currentUserField || 'Frontend Development');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState('Beginner');
  const [schedule, setSchedule] = useState('Wednesdays · 18:00 UTC');
  const [maxMembers, setMaxMembers] = useState(8);
  const [creating, setCreating] = useState(false);

  // Workspace inputs
  const [goalDraft, setGoalDraft] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const linkUrlError = getUrlError(linkUrl, 'https://developer.mozilla.org/...');

  const fields = useMemo(() => {
    const set = new Set<string>(['All']);
    for (const g of groups) {
      if (g.field) set.add(g.field);
    }
    return Array.from(set);
  }, [groups]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (filterScope === 'mine' && !g.memberIds.includes(currentUserId)) return false;
      if (fieldFilter !== 'All' && g.field !== fieldFilter) return false;
      if (!q) return true;
      return (
        g.name.toLowerCase().includes(q) ||
        g.topic.toLowerCase().includes(q) ||
        g.field.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q)
      );
    });
  }, [groups, filterScope, fieldFilter, search, currentUserId]);

  const activeGroup = useMemo(() => {
    if (selectedGroupId) {
      return groups.find((g) => g.id === selectedGroupId) || null;
    }
    return filteredGroups.find((g) => g.memberIds.includes(currentUserId)) || filteredGroups[0] || null;
  }, [selectedGroupId, groups, filteredGroups, currentUserId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !topic.trim() || creating) return;
    setCreating(true);
    try {
      const created = await onCreateGroup({
        name: name.trim(),
        field: field.trim() || 'General',
        topic: topic.trim(),
        description: description.trim() || `Collaborative study circle focused on ${topic.trim()}.`,
        level,
        schedule: schedule.trim() || 'Flexible weekly check-ins',
        maxMembers,
      });
      if (created && created.id) {
        setSelectedGroupId(created.id);
      }
      setName('');
      setTopic('');
      setDescription('');
      setShowCreateModal(false);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-14 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-3">
            <SkeletonBlock className="h-36 w-full" />
            <SkeletonBlock className="h-36 w-full" />
          </div>
          <div className="lg:col-span-7">
            <SkeletonBlock className="h-72 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Search, filter & CTA bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          <label className="relative flex-1 min-w-[200px]">
            <span className="sr-only">Search study groups</span>
            <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${textSecondary}`} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search study groups by topic or field..."
              className={`${inputClass} !pl-10 min-h-11`}
            />
          </label>
          <div className="flex items-center gap-1.5">
            {([
              ['all', `All (${groups.length})`],
              ['mine', `My groups (${groups.filter((g) => g.memberIds.includes(currentUserId)).length})`],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilterScope(id)}
                className={`px-3.5 min-h-[40px] rounded-full text-sm font-medium border cursor-pointer transition-colors ${
                  filterScope === id
                    ? 'bg-[var(--accent-50)] border-[var(--spark)] text-[var(--ink-primary)] font-semibold'
                    : `border-[var(--border-hairline)] ${textSecondary} hover:bg-[var(--surface-subtle)]`
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {fields.length > 2 && (
            <select
              value={fieldFilter}
              onChange={(e) => setFieldFilter(e.target.value)}
              aria-label="Filter study groups by field"
              className={`${inputClass} !w-auto min-h-11 text-sm`}
            >
              {fields.map((f) => (
                <option key={f} value={f}>
                  {f === 'All' ? 'All fields' : f}
                </option>
              ))}
            </select>
          )}
        </div>

        <button
          type="button"
          disabled={Boolean(mutedReason)}
          onClick={() => setShowCreateModal(true)}
          className={btnPrimary}
        >
          <Plus className="w-4 h-4" aria-hidden="true" /> Create Study Group
        </button>
      </div>

      {filteredGroups.length === 0 ? (
        <EmptyState
          title={groups.length === 0 ? 'No study groups yet' : 'No study groups match your filter'}
          description={
            groups.length === 0
              ? 'Start a small study circle with a shared topic, checklist goals, and a dedicated group chat room.'
              : 'Try clearing your search or switch back to all study groups.'
          }
          actionLabel={groups.length === 0 ? 'Create the first study group' : 'Show all study groups'}
          onAction={() => {
            if (groups.length === 0) {
              setShowCreateModal(true);
            } else {
              setSearch('');
              setFilterScope('all');
              setFieldFilter('All');
            }
          }}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Group list */}
          <div className="lg:col-span-5 space-y-3 min-w-0">
            {filteredGroups.map((g) => {
              const isMember = g.memberIds.includes(currentUserId);
              const isSelected = activeGroup?.id === g.id;
              const isFull = Boolean(g.maxMembers && g.memberIds.length >= g.maxMembers && !isMember);
              return (
                <div
                  key={g.id}
                  onClick={() => setSelectedGroupId(g.id)}
                  className={`${cardClass} p-5 space-y-3 cursor-pointer transition-all ${
                    isSelected ? 'border-[var(--accent-600)] ring-2 ring-[var(--accent-500)]/15' : 'hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-[var(--accent-600)]">{g.field}</span>
                        <span className={textSecondary}>· {g.level}</span>
                      </div>
                      <h3 className={`font-display text-lg truncate ${textPrimary}`}>{g.name}</h3>
                      <p className={`text-xs font-medium ${textSecondary}`}>{g.topic}</p>
                    </div>
                    {isMember && <Badge variant="success">Joined</Badge>}
                  </div>

                  <p className={`text-sm line-clamp-2 ${textSecondary}`}>{g.description}</p>

                  <div className={`pt-2 border-t ${borderClass} flex flex-wrap items-center justify-between gap-2 text-xs`}>
                    <span className={`inline-flex items-center gap-1.5 tabular-nums ${textSecondary}`}>
                      <Users className="w-3.5 h-3.5" aria-hidden="true" />
                      {g.memberIds.length}
                      {g.maxMembers ? `/${g.maxMembers}` : ''} members
                    </span>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        disabled={isFull || Boolean(mutedReason && !isMember)}
                        onClick={() => onToggleJoinGroup(g.id)}
                        className={isMember ? btnSecondary : btnPrimary}
                      >
                        {isMember ? (
                          <><UserCheck className="w-3.5 h-3.5" aria-hidden="true" /> Leave</>
                        ) : isFull ? (
                          'Full'
                        ) : (
                          <><UserPlus className="w-3.5 h-3.5" aria-hidden="true" /> Join</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Group Workspace */}
          {activeGroup && (
            <section className={`lg:col-span-7 ${cardClass} p-6 space-y-6 min-w-0`}>
              {(() => {
                const isMember = activeGroup.memberIds.includes(currentUserId);
                const doneGoals = activeGroup.goals.filter((gl) => gl.done).length;
                return (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[var(--border-hairline)]">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge variant="info">{activeGroup.field}</Badge>
                          <span className={textSecondary}>{activeGroup.level}</span>
                          {activeGroup.schedule && (
                            <span className={`inline-flex items-center gap-1 ${textSecondary}`}>
                              <Calendar className="w-3.5 h-3.5" aria-hidden="true" /> {activeGroup.schedule}
                            </span>
                          )}
                        </div>
                        <h2 className={`font-display text-2xl ${textPrimary}`}>{activeGroup.name}</h2>
                        <p className={`text-sm font-medium ${textSecondary}`}>Focus: {activeGroup.topic}</p>
                        <p className={`text-sm leading-relaxed pt-1 ${textSecondary}`}>{activeGroup.description}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onOpenGroupChat(activeGroup)}
                          className={btnPrimary}
                        >
                          <MessageSquare className="w-4 h-4" aria-hidden="true" /> Open Group Chat
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleJoinGroup(activeGroup.id)}
                          className={btnSecondary}
                        >
                          {isMember ? 'Leave group' : 'Join group'}
                        </button>
                      </div>
                    </div>

                    {/* Members list */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                          Group Members ({activeGroup.memberIds.length})
                        </span>
                        <span className={textSecondary}>Led by {activeGroup.creatorName}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {activeGroup.memberIds.map((mid, idx) => {
                          const mName = activeGroup.memberNames[idx] || 'Member';
                          return (
                            <button
                              key={mid}
                              type="button"
                              onClick={() => onSelectMember(mid, mName)}
                              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${borderClass} ${subtleBgClass} hover:border-[var(--accent-600)] text-xs font-medium ${textPrimary} cursor-pointer`}
                            >
                              <span className="w-5 h-5 rounded-full bg-[var(--accent-600)] text-white text-[10px] font-bold flex items-center justify-center">
                                {mName.slice(0, 1).toUpperCase()}
                              </span>
                              <span>{mName}{mid === currentUserId ? ' (you)' : ''}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Shared Study Goals Checklist */}
                    <div className="space-y-3 pt-2 border-t border-[var(--border-hairline)]">
                      <div className="flex items-center justify-between">
                        <h3 className={`text-base font-semibold ${textPrimary}`}>
                          Shared Study Goals ({doneGoals}/{activeGroup.goals.length})
                        </h3>
                        {!isMember && <span className={`text-xs ${textSecondary}`}>Join group to edit goals</span>}
                      </div>

                      {activeGroup.goals.length === 0 ? (
                        <p className={`text-xs ${textSecondary}`}>No goals added yet. Add a shared milestone for this week.</p>
                      ) : (
                        <ul className="space-y-2">
                          {activeGroup.goals.map((gl) => (
                            <li key={gl.id}>
                              <button
                                type="button"
                                disabled={!isMember}
                                onClick={() => onUpdateWorkspace(activeGroup.id, { toggleGoalId: gl.id })}
                                className={`w-full text-left px-3.5 py-2.5 rounded-xl border ${borderClass} ${subtleBgClass} flex items-center gap-2.5 text-sm ${
                                  isMember ? 'cursor-pointer hover:border-[var(--accent-600)]' : 'cursor-default opacity-80'
                                }`}
                              >
                                {gl.done ? (
                                  <CheckCircle2 className="w-4 h-4 text-[var(--success-ink)] shrink-0" />
                                ) : (
                                  <Circle className="w-4 h-4 text-[var(--ink-muted)] shrink-0" />
                                )}
                                <span className={gl.done ? `line-through ${textSecondary}` : textPrimary}>{gl.title}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      {isMember && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (!goalDraft.trim()) return;
                            onUpdateWorkspace(activeGroup.id, { addGoal: goalDraft.trim() });
                            setGoalDraft('');
                          }}
                          className="flex flex-col sm:flex-row gap-2"
                        >
                          <input
                            value={goalDraft}
                            onChange={(e) => setGoalDraft(e.target.value)}
                            placeholder="Add a shared goal (e.g., Build flexbox navbar together)"
                            className={`${inputClass} flex-1`}
                          />
                          <button type="submit" disabled={!goalDraft.trim()} className={btnSecondary}>
                            Add goal
                          </button>
                        </form>
                      )}
                    </div>

                    {/* Shared Study Links */}
                    <div className="space-y-3 pt-2 border-t border-[var(--border-hairline)]">
                      <h3 className={`text-base font-semibold ${textPrimary}`}>
                        Shared Study Links ({activeGroup.sharedLinks.length})
                      </h3>
                      {activeGroup.sharedLinks.length === 0 ? (
                        <p className={`text-xs ${textSecondary}`}>No shared links yet. Drop helpful docs, repos, or notes here.</p>
                      ) : (
                        <ul className="space-y-2">
                          {activeGroup.sharedLinks.map((lk) => (
                            <li
                              key={lk.id}
                              className={`px-3.5 py-2.5 rounded-xl border ${borderClass} ${subtleBgClass} flex items-center justify-between gap-3 text-sm`}
                            >
                              <div className="min-w-0 flex items-center gap-2">
                                <Link2 className="w-4 h-4 text-[var(--accent-600)] shrink-0" aria-hidden="true" />
                                <div className="min-w-0">
                                  <div className={`font-medium truncate ${textPrimary}`}>{lk.title}</div>
                                  <div className={`text-xs truncate ${textSecondary}`}>Shared by {lk.addedBy}</div>
                                </div>
                              </div>
                              <a
                                href={lk.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-600)] hover:underline shrink-0"
                              >
                                Open <ExternalLink className="w-3 h-3" />
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}

                      {isMember && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (!linkTitle.trim() || !linkUrl.trim() || linkUrlError) return;
                            onUpdateWorkspace(activeGroup.id, {
                              addLink: { title: linkTitle.trim(), url: linkUrl.trim() },
                            });
                            setLinkTitle('');
                            setLinkUrl('');
                          }}
                          className="space-y-2"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              value={linkTitle}
                              onChange={(e) => setLinkTitle(e.target.value)}
                              placeholder="Link title (e.g., MDN Grid Guide)"
                              className={inputClass}
                            />
                            <input
                              type="url"
                              value={linkUrl}
                              onChange={(e) => setLinkUrl(e.target.value)}
                              placeholder="https://..."
                              className={inputClass}
                            />
                          </div>
                          {linkUrlError && <p className="text-xs text-[var(--danger-ink)]">{linkUrlError}</p>}
                          <button
                            type="submit"
                            disabled={!linkTitle.trim() || !linkUrl.trim() || Boolean(linkUrlError)}
                            className={btnSecondary}
                          >
                            Share link with group
                          </button>
                        </form>
                      )}
                    </div>
                  </>
                );
              })()}
            </section>
          )}
        </div>
      )}

      {/* Create Study Group Modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create a Study Group">
        <form onSubmit={handleCreate} className="space-y-4">
          <p className={`text-xs ${textSecondary}`}>
            Creating a group also opens a dedicated persistent Study Chat room for members.
          </p>
          <div>
            <label htmlFor="sg-name" className={`block text-sm font-medium mb-1 ${textPrimary}`}>Group name</label>
            <input
              id="sg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., React Hooks & Async Study Circle"
              className={inputClass}
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="sg-field" className={`block text-sm font-medium mb-1 ${textPrimary}`}>Field</label>
              <input
                id="sg-field"
                value={field}
                onChange={(e) => setField(e.target.value)}
                placeholder="Frontend Development"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="sg-level" className={`block text-sm font-medium mb-1 ${textPrimary}`}>Level</label>
              <select id="sg-level" value={level} onChange={(e) => setLevel(e.target.value)} className={inputClass}>
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>All Levels</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="sg-topic" className={`block text-sm font-medium mb-1 ${textPrimary}`}>Focus topic</label>
            <input
              id="sg-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Building responsive apps & debugging API calls"
              className={inputClass}
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="sg-schedule" className={`block text-sm font-medium mb-1 ${textPrimary}`}>Weekly rhythm</label>
              <input
                id="sg-schedule"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder="Wednesdays · 18:00 UTC"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="sg-max" className={`block text-sm font-medium mb-1 ${textPrimary}`}>Max members</label>
              <select
                id="sg-max"
                value={maxMembers}
                onChange={(e) => setMaxMembers(Number(e.target.value))}
                className={inputClass}
              >
                <option value={4}>4 members</option>
                <option value={6}>6 members</option>
                <option value={8}>8 members</option>
                <option value={12}>12 members</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="sg-desc" className={`block text-sm font-medium mb-1 ${textPrimary}`}>Description</label>
            <textarea
              id="sg-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What will members practice or build together?"
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowCreateModal(false)} className={btnSecondary}>
              Cancel
            </button>
            <button type="submit" disabled={creating || !name.trim() || !topic.trim()} className={btnPrimary}>
              {creating ? 'Creating…' : 'Create Study Group'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
