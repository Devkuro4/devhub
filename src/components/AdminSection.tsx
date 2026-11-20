import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Cpu,
  Flag,
  HelpCircle,
  Loader2,
  Lock,
  Pin,
  Plus,
  RefreshCw,
  ShieldAlert,
  Swords,
  Target,
  Trash2,
  Trophy,
} from 'lucide-react';
import { Badge, PageHeader, SectionTabs } from './ui';
import { fetchAiStatus, saveAiSettings, testAiConnection } from '../lib/aiClient';
import {
  cancelArenaMatchApi,
  createArenaChallengeApi,
  createBountyApi,
  createBuildOffApi,
  judgeBuildOffApi,
  reviewBountyApi,
  selectPotwWinnerApi,
  upsertSeasonApi,
  type ArenaActorRef,
  type ArenaBootstrapResponse,
} from '../lib/arenaClient';
import type { CommunityEvent, CommunityPost, ContentReport, ModerationState, QuizItem } from '../types';

export type AdminSubTab =
  | 'admin-dashboard'
  | 'admin-members'
  | 'admin-support'
  | 'admin-activities'
  | 'admin-ai';

export const AdminSection = ({
  subTab,
  setSubTab,
  user,
  teamRoster,
  setTeamRoster,
  helpRequests,
  setHelpRequests,
  posts,
  setPosts,
  presentations,
  challenges,
  projects,
  quizzes,
  setQuizzes,
  weeklyActivities,
  setWeeklyActivities,
  reports = [],
  moderation,
  onCreateAnnouncement,
  onModeratePost,
  onDeletePost,
  onToggleHelpResolved,
  onResolveReport,
  onSetMemberMuted,
  onSetMemberRole,
  onViewMember,
  arenaBootstrap,
  onRefreshArena,
  onNotify,
  styles,
}: {
  subTab: AdminSubTab;
  setSubTab: (t: AdminSubTab) => void;
  user: { id?: string; name: string; email: string };
  teamRoster: any[];
  setTeamRoster: (r: any[]) => void;
  helpRequests: any[];
  setHelpRequests: (h: any[]) => void;
  posts: CommunityPost[];
  setPosts: (p: CommunityPost[]) => void;
  presentations: CommunityEvent[];
  challenges: any[];
  projects: any[];
  quizzes: QuizItem[];
  setQuizzes: (q: QuizItem[]) => void;
  weeklyActivities: any[];
  setWeeklyActivities: (w: any[]) => void;
  reports?: ContentReport[];
  moderation?: ModerationState;
  onCreateAnnouncement?: (title: string, body: string) => Promise<void> | void;
  onModeratePost?: (postId: string, action: { pinned?: boolean; locked?: boolean; hidden?: boolean }) => Promise<void> | void;
  onDeletePost?: (postId: string) => Promise<void> | void;
  onToggleHelpResolved?: (helpId: string) => Promise<void> | void;
  onResolveReport?: (
    reportId: string,
    input: { status: 'resolved' | 'dismissed'; action?: 'none' | 'hide' | 'delete' | 'lock' | 'mute_author'; note?: string }
  ) => Promise<void> | void;
  onSetMemberMuted?: (userId: string, muted: boolean, reason?: string) => Promise<void> | void;
  onSetMemberRole?: (userId: string, role: string) => Promise<void> | void;
  onViewMember?: (memberId: string, memberName: string) => void;
  arenaBootstrap?: ArenaBootstrapResponse | null;
  onRefreshArena?: () => void;
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
    darkMode: boolean;
  };
}) => {
  const { cardClass, borderClass, textPrimary, textSecondary, inputClass, btnPrimary, btnSecondary } = styles;

  // Announcement draft
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');

  // Quick Quiz Creator
  const [quizTitle, setQuizTitle] = useState('');
  const [quizTopic, setQuizTopic] = useState('');
  const [quizDiff, setQuizDiff] = useState('Beginner');
  const [qPrompt, setQPrompt] = useState('');
  const [qOptions, setQOptions] = useState('Option A, Option B, Option C');
  const [qAnswer, setQAnswer] = useState('Option A');

  // AI Server Status & Settings
  const [aiStatus, setAiStatus] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [aiTesting, setAiTesting] = useState(false);

  // Competition Centre admin drafts
  const adminActor: ArenaActorRef = { userId: user.id || 'admin', userName: user.name || 'Community Admin' };
  const [chTitle, setChTitle] = useState('');
  const [chCadence, setChCadence] = useState<'daily' | 'weekly'>('daily');
  const [chKind, setChKind] = useState<'code' | 'build'>('code');
  const [chProblemId, setChProblemId] = useState('prob-two-sum');
  const [chXp, setChXp] = useState(60);
  const [chDesc, setChDesc] = useState('');

  const [bountyTitle, setBountyTitle] = useState('');
  const [bountyCategory, setBountyCategory] = useState('Frontend');
  const [bountyXp, setBountyXp] = useState(90);
  const [bountyDesc, setBountyDesc] = useState('');

  const [boTitle, setBoTitle] = useState('');
  const [boTheme, setBoTheme] = useState('Developer Tooling');
  const [boDesc, setBoDesc] = useState('');

  const [judgeScores, setJudgeScores] = useState<Record<string, number>>({});
  const [judgeNotes, setJudgeNotes] = useState<Record<string, string>>({});
  const [seasonName, setSeasonName] = useState('');
  const [seasonTheme, setSeasonTheme] = useState('');
  const [seasonPrize, setSeasonPrize] = useState('');

  const loadAiStatus = async () => {
    setAiLoading(true);
    try {
      const data = await fetchAiStatus();
      setAiStatus(data);
    } catch (err: any) {
      onNotify(err?.message || 'Could not load AI status.', 'error');
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    if (subTab === 'admin-ai') {
      loadAiStatus();
    }
  }, [subTab]);

  const handleSaveAiSettings = async (patch: { model?: string; dailyLimitPerUser?: number; enabled?: boolean }) => {
    try {
      const updated = await saveAiSettings(patch);
      setAiStatus(updated);
      onNotify('AI settings updated.');
    } catch (err: any) {
      onNotify(err?.message || 'Failed to update AI settings.', 'error');
    }
  };

  const handleTestAi = async () => {
    setAiTesting(true);
    setAiTestResult(null);
    try {
      const res = await testAiConnection(user.id);
      setAiTestResult({ ok: true, text: `Connected (${res.model}, ${res.latencyMs}ms): "${res.reply}"` });
      loadAiStatus();
    } catch (err: any) {
      setAiTestResult({ ok: false, text: err?.message || 'Connection test failed.' });
    } finally {
      setAiTesting(false);
    }
  };

  const updateMemberRole = async (id: string, newRole: string) => {
    if (onSetMemberRole) {
      await onSetMemberRole(id, newRole);
      return;
    }
    setTeamRoster(teamRoster.map((m) => (m.id === id ? { ...m, role: newRole } : m)));
    onNotify(`Updated role to ${newRole}.`);
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annBody.trim()) return;
    if (onCreateAnnouncement) {
      await onCreateAnnouncement(annTitle.trim(), annBody.trim());
    } else {
      const item: CommunityPost = {
        id: `post-${Date.now()}`,
        author: user.name || 'Community Admin',
        authorId: user.id,
        role: 'Community Admin',
        category: 'Announcement',
        pinned: true,
        timestamp: 'Just now',
        title: annTitle.trim(),
        content: annBody.trim(),
        likes: 0,
        comments: [],
      };
      setPosts([item, ...posts]);
      onNotify('Announcement published to all members.');
    }
    setAnnTitle('');
    setAnnBody('');
  };

  const handleCreateQuiz = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quizTitle.trim() || !qPrompt.trim()) return;
    const opts = qOptions.split(',').map((s) => s.trim()).filter(Boolean);
    const newQ: QuizItem = {
      id: `quiz-${Date.now()}`,
      title: quizTitle.trim(),
      courseId: '',
      topic: quizTopic.trim() || 'Community Practice',
      field: 'General',
      difficulty: quizDiff,
      scope: 'Topic Quiz',
      mandatory: false,
      deadline: 'Self-Paced',
      durationMinutes: 5,
      questions: [
        {
          id: `q-${Date.now()}`,
          type: 'mcq',
          topic: quizTopic.trim() || 'Practice',
          prompt: qPrompt.trim(),
          code: '',
          options: opts.length ? opts : ['Option A', 'Option B'],
          answer: qAnswer.trim() || opts[0] || 'Option A',
          explanation: 'Added by Community Admin.',
        },
      ],
    };
    setQuizzes([newQ, ...quizzes]);
    setQuizTitle('');
    setQuizTopic('');
    setQPrompt('');
    onNotify('Quiz added to the community Quiz Bank.');
  };

  const openHelp = helpRequests.filter((h) => h.status !== 'Resolved');
  const openReports = reports.filter((r) => r.status === 'open');
  const announcements = posts.filter((p) => p.category === 'Announcement' || p.pinned);

  const adminTabs: { id: AdminSubTab; label: string; badge?: number }[] = [
    { id: 'admin-dashboard', label: 'Overview' },
    { id: 'admin-members', label: 'Members', badge: teamRoster.length },
    { id: 'admin-support', label: 'Moderation & Help', badge: openHelp.length + openReports.length },
    { id: 'admin-activities', label: 'Activities & Competitions', badge: quizzes.length },
    { id: 'admin-ai', label: 'AI Settings' },
  ];

  const aiStats = aiStatus?.stats;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Community Admin Console"
        description="Lightweight coordination for a small, growing beginner community. Member AI chats and personal notes always stay private."
        action={
          <div className="inline-flex items-center gap-1.5 text-xs text-[var(--success-ink)]">
            <Lock className="w-3.5 h-3.5" />
            <span>Private member chats stay private</span>
          </div>
        }
      />

      <SectionTabs tabs={adminTabs} active={subTab} onChange={setSubTab} />

      {/* 1. OVERVIEW */}
      {subTab === 'admin-dashboard' && (
        <div className="space-y-6">
          <section className={`${cardClass} p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-[6px] border-l-[var(--spark)]`}>
            <div>
              <p className={`text-xs ${textSecondary}`}>Needs your attention</p>
              <h2 className={`text-2xl ${textPrimary}`}>
                {openHelp.length === 0 && openReports.length === 0
                  ? 'No open questions or reports. Nice and quiet.'
                  : `${openReports.length} open report${openReports.length === 1 ? '' : 's'} · ${openHelp.length} member question${openHelp.length === 1 ? '' : 's'} waiting`}
              </h2>
            </div>
            <button type="button" onClick={() => setSubTab('admin-support')} className={btnPrimary}>
              Open moderation & help queue
            </button>
          </section>

          <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
            {[
              { label: 'Members', value: teamRoster.length },
              { label: 'Open reports', value: openReports.length },
              { label: 'Upcoming events', value: presentations.length },
              { label: 'Challenges', value: challenges.length },
            ].map((stat) => (
              <div key={stat.label} className="soft-card px-5 py-4">
                <dt className={`text-xs ${textSecondary}`}>{stat.label}</dt>
                <dd className={`font-display text-4xl tabular-nums ${textPrimary}`}>{stat.value}</dd>
              </div>
            ))}
          </dl>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <section className={`${cardClass} p-6 lg:col-span-7 space-y-4`}>
              <h2 className={`text-lg ${textPrimary}`}>Questions to answer</h2>
              {openHelp.length === 0 ? (
                <p className={`text-sm ${textSecondary}`}>Every help question is resolved.</p>
              ) : (
                <ul className={`divide-y ${borderClass}`}>
                  {openHelp.slice(0, 5).map((h) => (
                    <li key={h.id} className="py-3 space-y-0.5">
                      <div className={`text-sm font-semibold ${textPrimary}`}>{h.helpNeeded}</div>
                      <div className={`text-xs ${textSecondary}`}>{h.author} · {h.field}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={`${cardClass} p-6 lg:col-span-5 space-y-4`}>
              <div className="flex items-center justify-between">
                <h2 className={`text-lg ${textPrimary}`}>This week</h2>
                <button type="button" onClick={() => setSubTab('admin-support')} className="text-sm font-medium text-[var(--accent-600)] hover:underline cursor-pointer">
                  Manage
                </button>
              </div>
              <ul className={`divide-y ${borderClass}`}>
                {weeklyActivities.slice(0, 5).map((wa) => (
                  <li key={wa.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                    <span className={textPrimary}><span className="font-semibold">{wa.day}</span> {wa.title}</span>
                    <span className={`text-xs shrink-0 ${wa.completed ? 'text-[var(--success-ink)] font-medium' : textSecondary}`}>{wa.completed ? 'Done' : 'Upcoming'}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}

      {/* 2. MEMBERS, ROLES & MUTE CONTROLS */}
      {subTab === 'admin-members' && (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {['Member', 'Learning Coordinator', 'Field Lead', 'Community Admin'].map((r) => (
              <div key={r} className="soft-card px-5 py-4">
                <dt className={`text-xs ${textSecondary}`}>{r === 'Member' ? 'Members' : `${r}s`}</dt>
                <dd className={`font-display text-4xl tabular-nums ${textPrimary}`}>{teamRoster.filter((m) => (m.role || 'Member') === r).length}</dd>
              </div>
            ))}
          </dl>
          <p className={`text-sm max-w-[70ch] ${textSecondary}`}>
            Manage member roles or temporarily mute accounts that need a community guidelines reminder.
          </p>

          <div className={`${cardClass} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[740px]">
                <thead className={`${textSecondary} bg-[var(--surface-subtle)] text-xs`}>
                  <tr>
                    <th scope="col" className="py-3 pl-5 pr-4 font-medium">Member</th>
                    <th scope="col" className="py-3 pr-4 font-medium">Focus field</th>
                    <th scope="col" className="py-3 pr-4 font-medium">Level</th>
                    <th scope="col" className="py-3 pr-4 font-medium">Status</th>
                    <th scope="col" className="py-3 pr-4 font-medium">Role</th>
                    <th scope="col" className="py-3 pr-5 font-medium text-right">Moderation</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${borderClass}`}>
                  {teamRoster.map((m) => {
                    const isMuted = Boolean(moderation?.mutedUserIds?.[m.id]);
                    const isAdminMember = m.role === 'Community Admin';
                    return (
                      <tr key={m.id} className="hover:bg-[var(--accent-50)]">
                        <td className="py-3 pl-5 pr-4">
                          <button
                            type="button"
                            onClick={() => onViewMember?.(m.id, m.name)}
                            className="flex items-center gap-3 text-left cursor-pointer hover:underline"
                          >
                            <span aria-hidden="true" className="w-8 h-8 rounded-full bg-[var(--accent-100)] text-[var(--accent-700)] text-xs font-semibold flex items-center justify-center shrink-0">
                              {(m.name || '?').slice(0, 1).toUpperCase()}
                            </span>
                            <span className={`font-semibold ${textPrimary}`}>{m.name}</span>
                          </button>
                        </td>
                        <td className={`py-3 pr-4 ${textSecondary}`}>{m.field || '—'}</td>
                        <td className={`py-3 pr-4 ${textSecondary}`}>{m.level || '—'}</td>
                        <td className="py-3 pr-4">
                          {isMuted ? <Badge variant="danger">Muted</Badge> : <Badge variant="success">Active</Badge>}
                        </td>
                        <td className="py-3 pr-4">
                          <select
                            value={m.role || 'Member'}
                            onChange={(e) => updateMemberRole(m.id, e.target.value)}
                            disabled={isAdminMember}
                            aria-label={`Role for ${m.name}`}
                            className={`${inputClass} py-1 px-2.5 text-xs max-w-[180px]`}
                          >
                            <option>Member</option>
                            <option>Learning Coordinator</option>
                            <option>Field Lead</option>
                            {isAdminMember && <option>Community Admin</option>}
                          </select>
                        </td>
                        <td className="py-3 pr-5 text-right">
                          {!isAdminMember && onSetMemberMuted && m.id !== user.id && (
                            <button
                              type="button"
                              onClick={() =>
                                onSetMemberMuted(
                                  m.id,
                                  !isMuted,
                                  isMuted ? undefined : 'Community guidelines reminder'
                                )
                              }
                              className="px-3 min-h-[34px] rounded-lg border border-[var(--border-strong)] text-xs font-medium hover:bg-[var(--surface-subtle)] cursor-pointer"
                            >
                              {isMuted ? 'Unmute' : 'Mute'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. MODERATION QUEUE, ANNOUNCEMENTS & HELP QUEUE */}
      {subTab === 'admin-support' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 lg:order-2 space-y-5">
            <form onSubmit={handleCreateAnnouncement} className={`${cardClass} p-6 space-y-4`}>
              <h2 className={`font-display text-base ${textPrimary}`}>Publish Community Announcement</h2>
              <input value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} placeholder="Title" className={inputClass} required />
              <textarea rows={2} value={annBody} onChange={(e) => setAnnBody(e.target.value)} placeholder="Share a friendly weekly note or reminder..." className={inputClass} required />
              <button type="submit" className={btnPrimary}>Publish Announcement</button>
            </form>

            {announcements.length > 0 && (
              <div className={`${cardClass} p-6 space-y-3`}>
                <h2 className={`font-display text-base ${textPrimary}`}>Manage Announcements ({announcements.length})</h2>
                <ul className={`divide-y ${borderClass}`}>
                  {announcements.slice(0, 6).map((a) => (
                    <li key={a.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className={`font-semibold truncate ${textPrimary}`}>{a.title}</div>
                        <div className={textSecondary}>{a.pinned ? 'Pinned' : 'Standard'} · {a.timestamp}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {onModeratePost && (
                          <button
                            type="button"
                            onClick={() => onModeratePost(a.id, { pinned: !a.pinned })}
                            className="inline-flex items-center gap-1 text-[var(--accent-600)] hover:underline cursor-pointer"
                          >
                            <Pin className="w-3 h-3" /> {a.pinned ? 'Unpin' : 'Pin'}
                          </button>
                        )}
                        {onDeletePost && (
                          <button
                            type="button"
                            onClick={() => onDeletePost(a.id)}
                            className="inline-flex items-center gap-1 text-[var(--danger-ink)] hover:underline cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className={`${cardClass} p-6 space-y-4`}>
              <h2 className={`font-display text-base ${textPrimary}`}>Weekly Community Rhythm</h2>
              <div className={`divide-y ${borderClass}`}>
                {weeklyActivities.map((wa) => (
                  <div key={wa.id} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                    <div className="space-y-0.5 text-xs">
                      <div className="font-semibold text-[var(--accent-600)]">{wa.day} · {wa.theme}</div>
                      <div className={`font-medium ${textPrimary}`}>{wa.title}</div>
                      <p className={textSecondary}>{wa.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setWeeklyActivities(
                          weeklyActivities.map((item) => (item.id === wa.id ? { ...item, completed: !item.completed } : item))
                        )
                      }
                      className={btnSecondary}
                    >
                      {wa.completed ? 'Done ✓' : 'Mark Done'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 lg:order-1 space-y-6">
            {/* Reports Moderation Queue */}
            <div className={`${cardClass} p-6 space-y-4`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-[var(--warning-ink)]" />
                  <h2 className={`font-display text-base ${textPrimary}`}>Content Reports ({openReports.length} open)</h2>
                </div>
              </div>

              {reports.length === 0 ? (
                <p className={`text-sm ${textSecondary}`}>No community reports submitted yet.</p>
              ) : (
                <div className={`divide-y ${borderClass}`}>
                  {[...reports]
                    .sort((a, b) => Number(a.status !== 'open') - Number(b.status !== 'open'))
                    .map((rep) => (
                      <div
                        key={rep.id}
                        className={`py-4 first:pt-0 last:pb-0 space-y-2.5 ${
                          rep.status === 'open' ? 'pl-3 border-l-4 border-l-[var(--warning-ink)]' : 'opacity-65'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--ink-primary)]">
                            <Flag className="w-3.5 h-3.5 text-[var(--warning-ink)]" />
                            {rep.targetType.toUpperCase()} by {rep.targetAuthorName}
                          </span>
                          <Badge variant={rep.status === 'open' ? 'warning' : rep.status === 'resolved' ? 'success' : 'neutral'}>
                            {rep.status}
                          </Badge>
                        </div>
                        <div className="text-xs space-y-1">
                          <div className={textPrimary}>
                            <strong>Reason:</strong> {rep.reason} · <span className={textSecondary}>reported by {rep.reporterName}</span>
                          </div>
                          <p className={`p-2.5 rounded-lg bg-[var(--surface-subtle)] ${textSecondary} line-clamp-2`}>
                            {rep.targetPreview}
                          </p>
                          {rep.details && <p className={textSecondary}>Note: {rep.details}</p>}
                          {rep.resolutionAction && (
                            <p className="text-[var(--success-ink)] font-medium">
                              Action: {rep.resolutionAction} {rep.resolvedBy ? `by ${rep.resolvedBy}` : ''}
                            </p>
                          )}
                        </div>

                        {rep.status === 'open' && onResolveReport && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            <button
                              type="button"
                              onClick={() => onResolveReport(rep.id, { status: 'dismissed', action: 'none' })}
                              className="px-3 min-h-[32px] rounded-lg border border-[var(--border-strong)] text-xs font-medium hover:bg-[var(--surface-subtle)] cursor-pointer"
                            >
                              Dismiss
                            </button>
                            <button
                              type="button"
                              onClick={() => onResolveReport(rep.id, { status: 'resolved', action: 'hide' })}
                              className="px-3 min-h-[32px] rounded-lg border border-[var(--border-strong)] text-xs font-medium hover:bg-[var(--surface-subtle)] cursor-pointer"
                            >
                              Hide content
                            </button>
                            {rep.targetType === 'post' && (
                              <button
                                type="button"
                                onClick={() => onResolveReport(rep.id, { status: 'resolved', action: 'lock' })}
                                className="px-3 min-h-[32px] rounded-lg border border-[var(--border-strong)] text-xs font-medium hover:bg-[var(--surface-subtle)] cursor-pointer"
                              >
                                Lock thread
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onResolveReport(rep.id, { status: 'resolved', action: 'delete' })}
                              className="px-3 min-h-[32px] rounded-lg bg-[var(--danger-bg)] border border-[var(--danger-border)] text-[var(--danger-ink)] text-xs font-semibold cursor-pointer"
                            >
                              Delete content
                            </button>
                            {rep.targetAuthorId && (
                              <button
                                type="button"
                                onClick={() => onResolveReport(rep.id, { status: 'resolved', action: 'mute_author' })}
                                className="px-3 min-h-[32px] rounded-lg bg-[var(--danger-bg)] border border-[var(--danger-border)] text-[var(--danger-ink)] text-xs font-semibold cursor-pointer"
                              >
                                Mute author
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Member Help Queue */}
            <div className={`${cardClass} p-6 space-y-4`}>
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-[var(--accent-600)]" />
                <h2 className={`font-display text-base ${textPrimary}`}>Member Help Queue ({openHelp.length} open)</h2>
              </div>
              <div className={`divide-y ${borderClass}`}>
                {[...helpRequests]
                  .sort((x, y) => Number(x.status === 'Resolved') - Number(y.status === 'Resolved'))
                  .map((h) => (
                    <div key={h.id} className={`py-3 first:pt-0 last:pb-0 space-y-3 ${h.status === 'Resolved' ? 'opacity-60' : 'pl-3 border-l-4 border-l-[var(--spark)]'}`}>
                      <div className="flex items-center justify-between text-xs">
                        <span className={textPrimary}><strong>{h.author}</strong> · {h.field}</span>
                        <Badge variant={h.status === 'Resolved' ? 'success' : 'warning'}>{h.status}</Badge>
                      </div>
                      <div className={`text-base font-medium ${textPrimary}`}>{h.helpNeeded}</div>
                      <div className="flex items-center justify-between text-xs">
                        <span className={textSecondary}>{(h.responses || []).length} peer responses</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (onToggleHelpResolved) {
                              onToggleHelpResolved(h.id);
                            } else {
                              setHelpRequests(
                                helpRequests.map((req) =>
                                  req.id === h.id ? { ...req, status: req.status === 'Resolved' ? 'Open' : 'Resolved' } : req
                                )
                              );
                            }
                          }}
                          className={btnSecondary}
                        >
                          {h.status === 'Resolved' ? 'Reopen' : 'Mark Resolved'}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. ACTIVITIES & QUIZ BANK */}
      {subTab === 'admin-activities' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form onSubmit={handleCreateQuiz} className={`lg:col-span-5 lg:order-2 lg:sticky lg:top-6 self-start ${cardClass} p-6 space-y-4`}>
            <h2 className={`font-display text-base ${textPrimary}`}>Add Starter Quiz</h2>
            <input value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} placeholder="Quiz title" className={inputClass} required />
            <div className="grid grid-cols-2 gap-2">
              <input value={quizTopic} onChange={(e) => setQuizTopic(e.target.value)} placeholder="Topic" className={inputClass} />
              <select value={quizDiff} onChange={(e) => setQuizDiff(e.target.value)} className={inputClass}>
                <option>Beginner</option>
                <option>Intermediate</option>
              </select>
            </div>
            <input value={qPrompt} onChange={(e) => setQPrompt(e.target.value)} placeholder="Question prompt" className={inputClass} required />
            <input value={qOptions} onChange={(e) => setQOptions(e.target.value)} placeholder="Comma-separated options" className={inputClass} />
            <input value={qAnswer} onChange={(e) => setQAnswer(e.target.value)} placeholder="Exact correct answer" className={inputClass} />
            <button type="submit" className={btnPrimary}>
              <Plus className="w-3.5 h-3.5" /> Add Quiz
            </button>
          </form>

          <div className="lg:col-span-7 lg:order-1 space-y-5">
            <div className={`${cardClass} p-6 space-y-4`}>
              <h2 className={`font-display text-base ${textPrimary}`}>Quiz Bank ({quizzes.length})</h2>
              <div className={`divide-y ${borderClass}`}>
                {quizzes.map((q) => (
                  <div key={q.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className={`text-base font-semibold ${textPrimary}`}>{q.title}</div>
                      <div className={`text-xs ${textSecondary}`}>{q.topic} · {q.difficulty} · {q.questions.length} questions</div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setQuizzes(quizzes.map((item) => (item.id === q.id ? { ...item, mandatory: !item.mandatory } : item)))
                      }
                      className={btnSecondary}
                    >
                      {q.mandatory ? 'Required ✓' : 'Optional'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className={`${cardClass} p-6 space-y-3 text-xs`}>
              <div className={`font-semibold ${textPrimary}`}>Active Community Summary</div>
              <p className={textSecondary}>
                {presentations.length} study sessions/events · {challenges.length} weekly challenges · {projects.length} collaborative projects.
              </p>
            </div>
          </div>

          {/* Competition Centre Judging & Management */}
          {arenaBootstrap && (
            <div className="lg:col-span-12 space-y-6 pt-4 border-t border-[var(--border-hairline)]">
              <div className="space-y-1">
                <h2 className={`font-display text-xl ${textPrimary}`}>Competition Centre Judging & Management</h2>
                <p className={`text-sm ${textSecondary}`}>
                  Launch challenges, bounties, and build-offs, moderate live arena matches, and judge official submissions.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Create Arena Challenge */}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!chTitle.trim()) return;
                    try {
                      await createArenaChallengeApi(adminActor, {
                        cadence: chCadence,
                        kind: chKind,
                        title: chTitle.trim(),
                        category: 'Algorithms & Systems',
                        difficulty: 'Intermediate',
                        deadline: chCadence === 'daily' ? 'Resets Daily' : 'Sunday 23:59',
                        xpReward: chXp,
                        problemId: chKind === 'code' ? chProblemId : undefined,
                        description: chDesc.trim() || chTitle.trim(),
                        objectives: ['Submit a tested implementation'],
                      });
                      setChTitle('');
                      setChDesc('');
                      onRefreshArena?.();
                      onNotify('Published Arena challenge.');
                    } catch (err: any) {
                      onNotify(err?.message || 'Failed to create challenge.', 'error');
                    }
                  }}
                  className={`${cardClass} p-5 space-y-3`}
                >
                  <h3 className={`font-semibold text-sm flex items-center gap-2 ${textPrimary}`}>
                    <Trophy className="w-4 h-4 text-[var(--accent-600)]" /> New Daily / Weekly Challenge
                  </h3>
                  <input value={chTitle} onChange={(e) => setChTitle(e.target.value)} placeholder="Challenge title" className={inputClass} required />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={chCadence} onChange={(e) => setChCadence(e.target.value as any)} className={inputClass}>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                    <select value={chKind} onChange={(e) => setChKind(e.target.value as any)} className={inputClass}>
                      <option value="code">Code Sandbox</option>
                      <option value="build">Project Build</option>
                    </select>
                  </div>
                  {chKind === 'code' && (
                    <select value={chProblemId} onChange={(e) => setChProblemId(e.target.value)} className={inputClass}>
                      {arenaBootstrap.problems.map((p) => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </select>
                  )}
                  <input type="number" min={15} max={300} value={chXp} onChange={(e) => setChXp(Number(e.target.value))} placeholder="XP reward" className={inputClass} />
                  <textarea rows={2} value={chDesc} onChange={(e) => setChDesc(e.target.value)} placeholder="Prompt & evaluation notes" className={inputClass} />
                  <button type="submit" className={btnPrimary}>Publish Challenge</button>
                </form>

                {/* Create Bounty */}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!bountyTitle.trim()) return;
                    try {
                      await createBountyApi(adminActor, {
                        title: bountyTitle.trim(),
                        category: bountyCategory,
                        difficulty: 'Intermediate',
                        description: bountyDesc.trim() || bountyTitle.trim(),
                        acceptanceCriteria: ['Verified working solution linked cleanly'],
                        xpReward: bountyXp,
                      });
                      setBountyTitle('');
                      setBountyDesc('');
                      onRefreshArena?.();
                      onNotify('Published Bounty.');
                    } catch (err: any) {
                      onNotify(err?.message || 'Failed to create bounty.', 'error');
                    }
                  }}
                  className={`${cardClass} p-5 space-y-3`}
                >
                  <h3 className={`font-semibold text-sm flex items-center gap-2 ${textPrimary}`}>
                    <Target className="w-4 h-4 text-[var(--accent-600)]" /> Post Engineering Bounty
                  </h3>
                  <input value={bountyTitle} onChange={(e) => setBountyTitle(e.target.value)} placeholder="Bounty title" className={inputClass} required />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={bountyCategory} onChange={(e) => setBountyCategory(e.target.value)} placeholder="Category" className={inputClass} />
                    <input type="number" min={25} max={400} value={bountyXp} onChange={(e) => setBountyXp(Number(e.target.value))} placeholder="XP" className={inputClass} />
                  </div>
                  <textarea rows={3} value={bountyDesc} onChange={(e) => setBountyDesc(e.target.value)} placeholder="Problem scope and acceptance criteria" className={inputClass} />
                  <button type="submit" className={btnPrimary}>Publish Bounty</button>
                </form>

                {/* Launch Build-Off & Season Update */}
                <div className="space-y-5">
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!boTitle.trim()) return;
                      try {
                        await createBuildOffApi(adminActor, {
                          title: boTitle.trim(),
                          theme: boTheme.trim() || 'Full-Stack',
                          description: boDesc.trim() || boTitle.trim(),
                          deadline: 'Upcoming Sunday',
                          xpReward: 150,
                        });
                        setBoTitle('');
                        setBoDesc('');
                        onRefreshArena?.();
                        onNotify('Launched Team Build-Off.');
                      } catch (err: any) {
                        onNotify(err?.message || 'Failed to launch build-off.', 'error');
                      }
                    }}
                    className={`${cardClass} p-5 space-y-3`}
                  >
                    <h3 className={`font-semibold text-sm ${textPrimary}`}>Launch Team Build-Off</h3>
                    <input value={boTitle} onChange={(e) => setBoTitle(e.target.value)} placeholder="Build-Off title" className={inputClass} required />
                    <input value={boTheme} onChange={(e) => setBoTheme(e.target.value)} placeholder="Theme" className={inputClass} />
                    <textarea rows={2} value={boDesc} onChange={(e) => setBoDesc(e.target.value)} placeholder="Brief & rules" className={inputClass} />
                    <button type="submit" className={btnPrimary}>Open Build-Off</button>
                  </form>

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!seasonName.trim()) return;
                      try {
                        await upsertSeasonApi(adminActor, {
                          name: seasonName.trim(),
                          theme: seasonTheme.trim() || 'Competitive Engineering',
                          startDate: new Date().toISOString().slice(0, 10),
                          endDate: '2026-12-31',
                          status: 'Active',
                          prizeSummary: seasonPrize.trim() || 'Seasonal Champion Badge & XP',
                        });
                        setSeasonName('');
                        setSeasonTheme('');
                        setSeasonPrize('');
                        onRefreshArena?.();
                        onNotify('Season saved.');
                      } catch (err: any) {
                        onNotify(err?.message || 'Could not update season.', 'error');
                      }
                    }}
                    className={`${cardClass} p-5 space-y-2.5`}
                  >
                    <h3 className={`font-semibold text-sm ${textPrimary}`}>Create / Update Season</h3>
                    <input value={seasonName} onChange={(e) => setSeasonName(e.target.value)} placeholder="Season name" className={inputClass} required />
                    <input value={seasonTheme} onChange={(e) => setSeasonTheme(e.target.value)} placeholder="Season theme" className={inputClass} />
                    <input value={seasonPrize} onChange={(e) => setSeasonPrize(e.target.value)} placeholder="Prize / recognition summary" className={inputClass} />
                    <button type="submit" className={btnSecondary}>Save Season</button>
                  </form>
                </div>
              </div>

              {/* Active Judging Queues */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Bounty Reviews & Live Match Controls */}
                <div className={`${cardClass} p-6 space-y-4`}>
                  <h3 className={`font-semibold text-base ${textPrimary}`}>Bounties Awaiting Review & Live Arena Control</h3>
                  <div className="space-y-3">
                    {arenaBootstrap.bounties
                      .filter((b) => b.status === 'In Review' || b.submissions.some((s) => s.status === 'Pending Review'))
                      .map((b) => {
                        const sub = b.submissions.find((s) => s.status === 'Pending Review') || b.submissions[0];
                        if (!sub) return null;
                        return (
                          <div key={b.id} className={`p-3.5 rounded-xl border ${borderClass} space-y-2 text-xs`}>
                            <div className="flex items-center justify-between gap-2">
                              <strong className={textPrimary}>{b.title}</strong>
                              <Badge variant="info">{sub.claimantName}</Badge>
                            </div>
                            <p className={textSecondary}>{sub.notes}</p>
                            {sub.repoUrl && <div className="font-mono text-[var(--accent-600)] truncate">{sub.repoUrl}</div>}
                            <input
                              value={judgeNotes[sub.id] || ''}
                              onChange={(e) => setJudgeNotes((prev) => ({ ...prev, [sub.id]: e.target.value }))}
                              placeholder="Reviewer feedback (optional)"
                              className={`${inputClass} py-1.5 text-xs`}
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  await reviewBountyApi(adminActor, b.id, {
                                    submissionId: sub.id,
                                    status: 'Approved',
                                    judgeNote: judgeNotes[sub.id],
                                  });
                                  onRefreshArena?.();
                                  onNotify('Bounty approved & XP awarded.');
                                }}
                                className={btnPrimary}
                              >
                                Approve (+{b.xpReward} XP)
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await reviewBountyApi(adminActor, b.id, {
                                    submissionId: sub.id,
                                    status: 'Needs Revision',
                                    judgeNote: judgeNotes[sub.id],
                                  });
                                  onRefreshArena?.();
                                  onNotify('Requested revision on bounty.');
                                }}
                                className={btnSecondary}
                              >
                                Needs Revision
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    {arenaBootstrap.bounties.every((b) => b.status !== 'In Review') && (
                      <p className={`text-xs ${textSecondary}`}>No bounty submissions awaiting review right now.</p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-[var(--border-hairline)] space-y-2">
                    <div className={`text-xs font-semibold flex items-center gap-1.5 ${textPrimary}`}>
                      <Swords className="w-3.5 h-3.5 text-[var(--accent-600)]" /> Active Arena Matches
                    </div>
                    {arenaBootstrap.matches
                      .filter((m) => ['waiting', 'ready_check', 'countdown', 'active'].includes(m.status))
                      .map((m) => (
                        <div key={m.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className={`truncate ${textPrimary}`}>
                            {m.title} ({m.status})
                          </span>
                          <button
                            type="button"
                            onClick={async () => {
                              await cancelArenaMatchApi(adminActor, m.id);
                              onRefreshArena?.();
                              onNotify('Arena match cancelled.');
                            }}
                            className="text-[var(--danger-ink)] hover:underline cursor-pointer shrink-0"
                          >
                            Force Cancel
                          </button>
                        </div>
                      ))}
                    {arenaBootstrap.matches.every((m) => !['waiting', 'ready_check', 'countdown', 'active'].includes(m.status)) && (
                      <p className={`text-xs ${textSecondary}`}>No open or active arena matches.</p>
                    )}
                  </div>
                </div>

                {/* Build-Off Judging & POTW Winner Selection */}
                <div className={`${cardClass} p-6 space-y-4`}>
                  <h3 className={`font-semibold text-base ${textPrimary}`}>Judge Build-Offs & Select POTW Winner</h3>
                  <div className="space-y-3">
                    {arenaBootstrap.buildOffs.flatMap((bo) =>
                      bo.entries.map((entry) => (
                        <div key={entry.id} className={`p-3.5 rounded-xl border ${borderClass} space-y-2 text-xs`}>
                          <div className="flex items-center justify-between gap-2">
                            <strong className={textPrimary}>
                              {bo.title}: {entry.teamName}
                            </strong>
                            <Badge variant={entry.isWinner ? 'success' : 'neutral'}>
                              {entry.isWinner ? 'Winner' : `${entry.memberNames.length} members`}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={judgeScores[entry.id] ?? entry.judgeScore ?? 85}
                              onChange={(e) => setJudgeScores((prev) => ({ ...prev, [entry.id]: Number(e.target.value) }))}
                              placeholder="Score"
                              className={`${inputClass} py-1.5 text-xs`}
                            />
                            <input
                              value={judgeNotes[entry.id] ?? entry.judgeFeedback ?? ''}
                              onChange={(e) => setJudgeNotes((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                              placeholder="Judge feedback"
                              className={`${inputClass} col-span-2 py-1.5 text-xs`}
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                await judgeBuildOffApi(adminActor, bo.id, {
                                  entryId: entry.id,
                                  judgeScore: judgeScores[entry.id] ?? 85,
                                  judgeFeedback: judgeNotes[entry.id] || 'Solid execution.',
                                  declareWinner: false,
                                });
                                onRefreshArena?.();
                                onNotify('Saved judge score.');
                              }}
                              className={btnSecondary}
                            >
                              Save Score
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await judgeBuildOffApi(adminActor, bo.id, {
                                  entryId: entry.id,
                                  judgeScore: judgeScores[entry.id] ?? 95,
                                  judgeFeedback: judgeNotes[entry.id] || 'Selected as Build-Off winner.',
                                  declareWinner: true,
                                });
                                onRefreshArena?.();
                                onNotify(`${entry.teamName} crowned Build-Off winner!`);
                              }}
                              className={btnPrimary}
                            >
                              Crown Winner
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                    {arenaBootstrap.buildOffs.every((b) => b.entries.length === 0) && (
                      <p className={`text-xs ${textSecondary}`}>No Build-Off team entries to judge yet.</p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-[var(--border-hairline)] space-y-2">
                    <div className={`text-xs font-semibold ${textPrimary}`}>Project of the Week Nominations</div>
                    {arenaBootstrap.potwNominations.map((nom) => (
                      <div key={nom.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className={`truncate ${textPrimary}`}>
                          {nom.title} by {nom.authorName} ({nom.voterIds.length} votes)
                        </span>
                        {nom.isWinner ? (
                          <Badge variant="success">Winner</Badge>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              await selectPotwWinnerApi(adminActor, nom.id, 'Outstanding architecture and usefulness.');
                              onRefreshArena?.();
                              onNotify(`Selected ${nom.title} as Project of the Week!`);
                            }}
                            className="text-[var(--accent-600)] font-semibold hover:underline cursor-pointer shrink-0"
                          >
                            Select Winner
                          </button>
                        )}
                      </div>
                    ))}
                    {arenaBootstrap.potwNominations.length === 0 && (
                      <p className={`text-xs ${textSecondary}`}>No Project of the Week nominations submitted yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. AI SETTINGS & USAGE */}
      {subTab === 'admin-ai' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Cpu className="w-5 h-5 text-[var(--accent-600)]" />
              <div>
                <h2 className={`font-display text-2xl ${textPrimary}`}>AI service and usage</h2>
                <p className={`text-xs ${textSecondary}`}>
                  The Groq key lives on the server only, set as GROQ_API_KEY.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={loadAiStatus} disabled={aiLoading} className={btnSecondary}>
                <RefreshCw className={`w-3.5 h-3.5 ${aiLoading ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <button type="button" onClick={handleTestAi} disabled={aiTesting} className={btnPrimary}>
                {aiTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                {aiTesting ? 'Testing…' : 'Test AI Connection'}
              </button>
            </div>
          </div>

          {aiTestResult && (
            <div
              className={`p-3.5 rounded-lg border text-xs flex items-center gap-2 ${
                aiTestResult.ok
                  ? 'bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-ink)]'
                  : 'bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger-ink)]'
              }`}
            >
              {aiTestResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{aiTestResult.text}</span>
            </div>
          )}

          {aiStatus && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`${cardClass} p-5 space-y-2`}>
                  <div className={`text-xs ${textSecondary}`}>Server Key Status</div>
                  <Badge variant={aiStatus.configured ? 'success' : 'warning'}>
                    {aiStatus.configured ? 'Configured on Server' : 'Not Configured Yet'}
                  </Badge>
                  <p className={`text-xs ${textSecondary}`}>
                    Set <code>GROQ_API_KEY</code> in the server environment variables (Railway Variables).
                  </p>
                </div>

                <div className={`${cardClass} p-5 space-y-3`}>
                  <label className={`block text-xs font-medium ${textSecondary}`}>Active Groq Model</label>
                  <select
                    value={aiStatus.settings?.model || 'openai/gpt-oss-120b'}
                    onChange={(e) => handleSaveAiSettings({ model: e.target.value })}
                    className={inputClass}
                  >
                    {(aiStatus.modelChoices || ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']).map((m: string) => (
                      <option key={m} value={m}>
                        {m}
                        {m.endsWith('120b') ? ' (Best quality)' : m.endsWith('20b') ? ' (Faster, cheaper)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={`${cardClass} p-5 space-y-3`}>
                  <label className={`block text-xs font-medium ${textSecondary}`}>Daily Limit Per Member</label>
                  <div className="flex items-center gap-2">
                    <select
                      value={aiStatus.settings?.dailyLimitPerUser ?? 40}
                      onChange={(e) => handleSaveAiSettings({ dailyLimitPerUser: Number(e.target.value) })}
                      className={inputClass}
                    >
                      <option value={20}>20 requests / day</option>
                      <option value={40}>40 requests / day</option>
                      <option value={80}>80 requests / day</option>
                      <option value={150}>150 requests / day</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleSaveAiSettings({ enabled: !aiStatus.settings?.enabled })}
                      className={btnSecondary}
                    >
                      {aiStatus.settings?.enabled ? 'Enabled' : 'Paused'}
                    </button>
                  </div>
                </div>
              </div>

              {aiStats && (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className={`${cardClass} p-5`}>
                      <div className={`text-xs ${textSecondary}`}>AI Calls Today</div>
                      <div className={`font-display text-2xl tabular-nums mt-1 ${textPrimary}`}>{aiStats.callsToday ?? 0}</div>
                    </div>
                    <div className={`${cardClass} p-5`}>
                      <div className={`text-xs ${textSecondary}`}>Total Calls (Uptime)</div>
                      <div className={`font-display text-2xl tabular-nums mt-1 ${textPrimary}`}>{aiStats.totalCalls ?? 0}</div>
                    </div>
                    <div className={`${cardClass} p-5`}>
                      <div className={`text-xs ${textSecondary}`}>Estimated Tokens</div>
                      <div className={`font-display text-2xl tabular-nums mt-1 ${textPrimary}`}>{aiStats.estimatedTokens ?? 0}</div>
                    </div>
                    <div className={`${cardClass} p-5`}>
                      <div className={`text-xs ${textSecondary}`}>Estimated Cost</div>
                      <div className={`font-display text-2xl tabular-nums mt-1 ${textPrimary}`}>
                        ${Number(aiStats.estimatedCostUsd || 0).toFixed(4)}
                      </div>
                    </div>
                  </div>

                  {Object.keys(aiStats.byOperation || {}).length > 0 && (
                    <div className={`${cardClass} p-5 space-y-3`}>
                      <div className={`text-xs font-semibold ${textPrimary}`}>Calls by Feature</div>
                      <div className={`flex flex-wrap gap-3 text-xs ${textSecondary}`}>
                        {Object.entries(aiStats.byOperation).map(([op, count]: [string, any]) => (
                          <span key={op}>
                            <strong className={textPrimary}>{op}:</strong> <span className="tabular-nums">{count}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {aiStats.errors?.length > 0 && (
                    <div className="space-y-3">
                      <div className={`text-xs font-semibold ${textPrimary}`}>Recent AI Errors</div>
                      <div className="space-y-2">
                        {aiStats.errors.map((err: any, i: number) => (
                          <div key={err.id || i} className="p-2.5 rounded-lg border border-[var(--danger-border)] text-xs text-[var(--danger-ink)]">
                            <strong>{err.operation}</strong> ({err.timestamp ? new Date(err.timestamp).toLocaleTimeString() : 'recent'}): {err.message}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
