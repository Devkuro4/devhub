import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Cpu,
  HelpCircle,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Users,
} from 'lucide-react';
import { Badge, PageHeader, SectionTabs } from './ui';
import { fetchAiStatus, saveAiSettings, testAiConnection } from '../lib/aiClient';
import type { CommunityEvent, CommunityPost, QuizItem } from '../types';

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
  onNotify: (msg: string) => void;
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
  const { cardClass, borderClass, subtleBgClass, textPrimary, textSecondary, inputClass, btnPrimary, btnSecondary } = styles;

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

  const loadAiStatus = async () => {
    setAiLoading(true);
    try {
      const data = await fetchAiStatus();
      setAiStatus(data);
    } catch (err: any) {
      onNotify(err?.message || 'Could not load AI status.');
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
      onNotify(err?.message || 'Failed to update AI settings.');
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

  const updateMemberRole = (id: string, newRole: string) => {
    setTeamRoster(teamRoster.map((m) => (m.id === id ? { ...m, role: newRole } : m)));
    onNotify(`Updated role to ${newRole}.`);
  };

  const handleCreateAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annBody.trim()) return;
    const item: CommunityPost = {
      id: `post-${Date.now()}`,
      author: user.name || 'Community Admin',
      role: 'Community Admin',
      category: 'Announcement',
      pinned: true,
      timestamp: 'Just now',
      title: annTitle.trim(),
      content: annBody.trim(),
      likes: 1,
      comments: [],
    };
    setPosts([item, ...posts]);
    setAnnTitle('');
    setAnnBody('');
    onNotify('Announcement published to all members.');
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

  const adminTabs: { id: AdminSubTab; label: string; badge?: number }[] = [
    { id: 'admin-dashboard', label: 'Overview' },
    { id: 'admin-members', label: 'Members', badge: teamRoster.length },
    { id: 'admin-support', label: 'Announcements & Help', badge: helpRequests.filter((h) => h.status !== 'Resolved').length },
    { id: 'admin-activities', label: 'Activities & Quizzes', badge: quizzes.length },
    { id: 'admin-ai', label: 'AI Settings' },
  ];

  const openHelp = helpRequests.filter((h) => h.status !== 'Resolved');
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
          {/* Needs attention first: the queue is the job */}
          <section className={`${cardClass} p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-[6px] border-l-[var(--spark)]`}>
            <div>
              <p className={`text-xs ${textSecondary}`}>Needs your attention</p>
              <h2 className={`text-2xl ${textPrimary}`}>
                {openHelp.length === 0 ? 'No open questions. Nice and quiet.' : `${openHelp.length} member question${openHelp.length === 1 ? '' : 's'} waiting`}
              </h2>
            </div>
            <button type="button" onClick={() => setSubTab('admin-support')} className={btnPrimary}>Open help queue</button>
          </section>

          <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
            {[
              { label: 'Members', value: teamRoster.length },
              { label: 'Upcoming events', value: presentations.length },
              { label: 'Group projects', value: projects.length },
              { label: 'Challenges', value: challenges.length },
            ].map((stat) => (
              <div key={stat.label} className={`border-t-4 border-[var(--border-hairline)] pt-2`}>
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
                <button type="button" onClick={() => setSubTab('admin-support')} className="text-sm font-medium text-[var(--accent-600)] hover:underline cursor-pointer">Manage</button>
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

      {/* 2. MEMBERS & EXPANDABLE ROLES */}
      {subTab === 'admin-members' && (
        <div className="space-y-5">
          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            {['Member', 'Learning Coordinator', 'Field Lead', 'Community Admin'].map((r) => (
              <div key={r} className="border-t-4 border-[var(--border-hairline)] pt-2 min-w-[8rem]">
                <dt className={`text-xs ${textSecondary}`}>{r === 'Member' ? 'Members' : `${r}s`}</dt>
                <dd className={`font-display text-4xl tabular-nums ${textPrimary}`}>{teamRoster.filter((m) => (m.role || 'Member') === r).length}</dd>
              </div>
            ))}
          </dl>
          <p className={`text-sm max-w-[70ch] ${textSecondary}`}>Promote Learning Coordinators or Field Leads only as the community grows.</p>

          <div className={`${cardClass} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[640px]">
                <thead className={`${textSecondary} bg-[var(--surface-subtle)] text-xs`}>
                  <tr>
                    <th scope="col" className="py-3 pl-5 pr-4 font-medium">Member</th>
                    <th scope="col" className="py-3 pr-4 font-medium">Focus field</th>
                    <th scope="col" className="py-3 pr-4 font-medium">Level</th>
                    <th scope="col" className="py-3 pr-4 font-medium">Study buddy</th>
                    <th scope="col" className="py-3 pr-5 font-medium">Role</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${borderClass}`}>
                  {teamRoster.map((m) => (
                    <tr key={m.id} className="hover:bg-[var(--accent-50)]">
                      <td className="py-3 pl-5 pr-4">
                        <span className="flex items-center gap-3">
                          <span aria-hidden="true" className="w-8 h-8 rounded-full bg-[var(--accent-100)] text-[var(--accent-700)] text-xs font-semibold flex items-center justify-center shrink-0">{(m.name || '?').slice(0, 1).toUpperCase()}</span>
                          <span className={`font-semibold ${textPrimary}`}>{m.name}</span>
                        </span>
                      </td>
                      <td className={`py-3 pr-4 ${textSecondary}`}>{m.field || '—'}</td>
                      <td className={`py-3 pr-4 ${textSecondary}`}>{m.level || '—'}</td>
                      <td className={`py-3 pr-4 ${textSecondary}`}>{m.partner || '—'}</td>
                      <td className="py-3 pr-5">
                        <select
                          value={m.role || 'Member'}
                          onChange={(e) => updateMemberRole(m.id, e.target.value)}
                          disabled={m.role === 'Community Admin'}
                          title={m.role === 'Community Admin' ? 'Admin access is set in Supabase (see LAUNCH.md)' : undefined}
                          aria-label={`Role for ${m.name}`}
                          className={`${inputClass} py-1 px-2.5 text-xs max-w-[180px]`}
                        >
                          <option>Member</option>
                          <option>Learning Coordinator</option>
                          <option>Field Lead</option>
                          {m.role === 'Community Admin' && <option>Community Admin</option>}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. ANNOUNCEMENTS, WEEKLY RHYTHM & HELP QUEUE */}
      {subTab === 'admin-support' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 lg:order-2 space-y-5">
            <form onSubmit={handleCreateAnnouncement} className={`${cardClass} p-6 space-y-4`}>
              <h2 className={`font-display text-base ${textPrimary}`}>Publish Community Announcement</h2>
              <input value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} placeholder="Title" className={inputClass} required />
              <textarea rows={2} value={annBody} onChange={(e) => setAnnBody(e.target.value)} placeholder="Share a friendly weekly note or reminder..." className={inputClass} required />
              <button type="submit" className={btnPrimary}>Publish Announcement</button>
            </form>

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

          <div className="lg:col-span-7 lg:order-1">
            <div className={`${cardClass} p-6 space-y-4`}>
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-[var(--accent-600)]" />
                <h2 className={`font-display text-base ${textPrimary}`}>Member Help Queue ({openHelp.length} open)</h2>
              </div>
              <div className={`divide-y ${borderClass}`}>
                {[...helpRequests].sort((x, y) => Number(x.status === 'Resolved') - Number(y.status === 'Resolved')).map((h) => (
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
                        onClick={() =>
                          setHelpRequests(
                            helpRequests.map((req) =>
                              req.id === h.id ? { ...req, status: req.status === 'Resolved' ? 'Open' : 'Resolved' } : req
                            )
                          )
                        }
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

          <div className={`lg:col-span-7 lg:order-1 space-y-5`}>
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
        </div>
      )}

      {/* 5. AI SETTINGS & USAGE (SERVER-ONLY KEY ARCHITECTURE) */}
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
