import React, { useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Code2,
  ExternalLink,
  Flame,
  Hammer,
  History,
  Play,
  Plus,
  Sparkles,
  Target,
  ThumbsUp,
  Trophy,
  Users,
  XCircle,
} from 'lucide-react';
import { Badge, EmptyState } from './ui';
import {
  claimOrReleaseBountyApi,
  nominatePotwApi,
  submitArenaChallengeApi,
  submitBountyProofApi,
  submitBuildOffTeamApi,
  togglePotwVoteApi,
  type ArenaActorRef,
} from '../lib/arenaClient';
import type {
  ArenaChallengeItem,
  ArenaLanguage,
  ArenaProblem,
  BountyItem,
  CompetitionHistoryEntry,
  ProjectOfTheWeekNomination,
  SandboxExecutionResult,
  SeasonalCompetition,
  SeasonStandingRow,
  TeamBuildOff,
} from '../types';

type Styles = {
  cardClass: string;
  borderClass: string;
  subtleBgClass: string;
  textPrimary: string;
  textSecondary: string;
  inputClass: string;
  btnPrimary: string;
  btnSecondary: string;
};

/* ============================================================================
 * 1. DAILY & WEEKLY CHALLENGES PANEL (CODE + BUILD)
 * ========================================================================== */
export const ArenaChallengesPanel = ({
  actor,
  challenges,
  problems,
  onChanged,
  onNotify,
  styles,
}: {
  actor: ArenaActorRef;
  challenges: ArenaChallengeItem[];
  problems: ArenaProblem[];
  onChanged: () => void;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  styles: Styles;
}) => {
  const { cardClass, borderClass, subtleBgClass, textPrimary, textSecondary, inputClass, btnPrimary, btnSecondary } = styles;
  const [filter, setFilter] = useState<'all' | 'daily' | 'weekly'>('all');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [language, setLanguage] = useState<ArenaLanguage>('javascript');
  const [code, setCode] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [explanation, setExplanation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastExec, setLastExec] = useState<SandboxExecutionResult | null>(null);

  const myUserId = actor.userId || 'local-member';
  const filtered = useMemo(
    () => (filter === 'all' ? challenges : challenges.filter((c) => c.cadence === filter)).filter((c) => c.status !== 'Closed'),
    [challenges, filter]
  );

  const openChallenge = (ch: ArenaChallengeItem) => {
    setActiveId(ch.id);
    setLastExec(null);
    setRepoUrl('');
    setExplanation('');
    if (ch.kind === 'code' && ch.problemId) {
      const prob = problems.find((p) => p.id === ch.problemId) || problems[0];
      setLanguage('javascript');
      setCode(prob?.starterCode.javascript || '');
    }
  };

  const handleLangSwitch = (nextLang: ArenaLanguage, problemId?: string) => {
    setLanguage(nextLang);
    const prob = problems.find((p) => p.id === problemId) || problems[0];
    setCode(prob?.starterCode[nextLang] || '');
  };

  const handleSubmit = async (ch: ArenaChallengeItem, e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await submitArenaChallengeApi(actor, ch.id, {
        language: ch.kind === 'code' ? language : undefined,
        code: ch.kind === 'code' ? code : undefined,
        repoUrl: repoUrl.trim() || undefined,
        explanation: explanation.trim() || undefined,
      });
      if (res.execution) {
        setLastExec(res.execution);
        if (res.execution.allPassed) {
          onNotify(`Challenge verified! Passed ${res.execution.passedCount}/${res.execution.totalCount} tests (+${ch.xpReward} XP).`);
        } else {
          onNotify(`Passed ${res.execution.passedCount}/${res.execution.totalCount} tests. Review feedback and retry.`, 'error');
        }
      } else {
        onNotify('Challenge submission recorded for review!');
        setActiveId(null);
      }
      onChanged();
    } catch (err: any) {
      onNotify(err?.message || 'Could not submit challenge.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={`text-xl font-semibold ${textPrimary}`}>Daily & Weekly Challenges</h2>
          <p className={`text-sm ${textSecondary}`}>
            Timed coding sprints graded in the isolated sandbox plus weekly system-building prompts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'daily', 'weekly'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-4 min-h-[44px] rounded-full text-sm font-medium border cursor-pointer capitalize ${
                filter === f
                  ? 'bg-[var(--accent-600)] text-white border-[var(--accent-600)]'
                  : `${borderClass} ${textPrimary} bg-[var(--surface-elevated)]`
              }`}
            >
              {f === 'all' ? 'All Challenges' : `${f} Sprints`}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No challenges in this category"
          description="Switch filters or ask a Community Admin to publish a new sprint."
        />
      ) : (
        <div className="space-y-5">
          {filtered.map((ch) => {
            const mySub = ch.submissions.find((s) => s.userId === myUserId);
            const verifiedCount = ch.submissions.filter((s) => s.status === 'Verified').length;
            const linkedProb = ch.problemId ? problems.find((p) => p.id === ch.problemId) : null;
            const isOpen = activeId === ch.id;

            return (
              <article key={ch.id} className={`${cardClass} p-6 space-y-4`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={ch.cadence === 'daily' ? 'info' : 'warning'}>
                        <Flame className="w-3 h-3 mr-1" />
                        {ch.cadence === 'daily' ? 'Daily' : 'Weekly'}
                      </Badge>
                      <Badge variant="neutral">{ch.kind === 'code' ? 'Code Sandbox' : 'Project Build'}</Badge>
                      <Badge variant="neutral">{ch.difficulty}</Badge>
                      <span className={`text-xs font-mono tabular-nums text-[var(--accent-700)] font-semibold`}>
                        +{ch.xpReward} XP
                      </span>
                    </div>
                    <h3 className={`text-lg font-semibold ${textPrimary}`}>{ch.title}</h3>
                    <p className={`text-sm ${textSecondary}`}>{ch.description}</p>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {mySub && (
                      <Badge variant={mySub.status === 'Verified' || mySub.status === 'Reviewed' ? 'success' : 'warning'}>
                        {mySub.status}
                        {typeof mySub.passedCount === 'number' ? ` (${mySub.passedCount}/${mySub.totalCount})` : ''}
                      </Badge>
                    )}
                    <button
                      type="button"
                      onClick={() => (isOpen ? setActiveId(null) : openChallenge(ch))}
                      className={btnPrimary}
                    >
                      {isOpen ? 'Close Workspace' : mySub ? 'Update Attempt' : ch.kind === 'code' ? 'Solve in Sandbox' : 'Submit Build'}
                    </button>
                  </div>
                </div>

                {ch.objectives.length > 0 && (
                  <ul className={`grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs ${textSecondary}`}>
                    {ch.objectives.map((obj, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent-600)] shrink-0 mt-0.5" />
                        <span>{obj}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className={`flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t ${borderClass} ${textSecondary}`}>
                  <span>
                    {ch.category} · {ch.deadline}
                  </span>
                  <span>
                    {ch.submissions.length} submissions · {verifiedCount} verified
                  </span>
                </div>

                {isOpen && (
                  <form onSubmit={(e) => handleSubmit(ch, e)} className={`p-5 rounded-xl border ${borderClass} ${subtleBgClass} space-y-4`}>
                    {ch.kind === 'code' && linkedProb ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs space-y-0.5">
                            <span className={`font-semibold ${textPrimary}`}>
                              Isolated Problem: {linkedProb.title}
                            </span>
                            <span className={`block ${textSecondary}`}>
                              Entrypoint: <code className="font-mono">{linkedProb.entryPoint}</code> ·{' '}
                              {linkedProb.totalTestsCount ?? linkedProb.testCases.length} automated tests
                            </span>
                          </div>
                          <select
                            aria-label="Challenge language"
                            value={language}
                            onChange={(e) => handleLangSwitch(e.target.value as ArenaLanguage, ch.problemId)}
                            className={`${inputClass} w-auto py-1.5 px-3 text-sm`}
                          >
                            <option value="javascript">JavaScript (Node)</option>
                            <option value="typescript">TypeScript</option>
                            <option value="python">Python 3</option>
                          </select>
                        </div>

                        <textarea
                          value={code}
                          onChange={(e) => setCode(e.target.value)}
                          rows={10}
                          spellCheck={false}
                          className="w-full p-4 rounded-xl border border-[var(--border-strong)] bg-[var(--panel-deep)] text-[#FAFAFA] font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--accent-500)]"
                        />

                        <button type="submit" disabled={submitting} className={btnPrimary}>
                          <Play className="w-4 h-4" /> {submitting ? 'Running in Sandbox…' : 'Verify & Submit Solution'}
                        </button>

                        {lastExec && (
                          <div className={`p-4 rounded-xl border ${borderClass} bg-[var(--surface-elevated)] space-y-2`}>
                            <div className="flex items-center justify-between text-sm font-semibold">
                              <span className={lastExec.allPassed ? 'text-[var(--success-ink)]' : 'text-[var(--danger-ink)]'}>
                                {lastExec.allPassed ? 'All tests passed!' : `${lastExec.passedCount}/${lastExec.totalCount} tests passed`}
                              </span>
                              <span className={`text-xs font-mono ${textSecondary}`}>{lastExec.runtimeMs}ms</span>
                            </div>
                            {lastExec.error && (
                              <pre className="text-xs font-mono text-[var(--danger-ink)] whitespace-pre-wrap">{lastExec.error}</pre>
                            )}
                            <ul className="space-y-1">
                              {lastExec.results.map((r) => (
                                <li key={r.testId} className="flex items-center justify-between text-xs">
                                  <span className={textPrimary}>
                                    {r.label} {r.hidden ? '(Hidden)' : ''}
                                  </span>
                                  {r.passed ? (
                                    <CheckCircle2 className="w-4 h-4 text-[var(--success-ink)]" />
                                  ) : (
                                    <XCircle className="w-4 h-4 text-[var(--danger-ink)]" />
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <label className={`block text-xs font-medium ${textSecondary}`}>Repository or Demo Link</label>
                          <input
                            value={repoUrl}
                            onChange={(e) => setRepoUrl(e.target.value)}
                            placeholder="https://github.com/your-handle/challenge-build"
                            className={inputClass}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className={`block text-xs font-medium ${textSecondary}`}>Implementation Notes</label>
                          <textarea
                            rows={3}
                            required
                            value={explanation}
                            onChange={(e) => setExplanation(e.target.value)}
                            placeholder="Describe what you built, architecture tradeoffs, and what was tested."
                            className={inputClass}
                          />
                        </div>
                        <button type="submit" disabled={submitting} className={btnPrimary}>
                          {submitting ? 'Submitting…' : 'Submit Build for Review'}
                        </button>
                      </>
                    )}
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 2. TEAM BUILD-OFFS & PROJECT OF THE WEEK PANEL
 * ========================================================================== */
export const BuildOffAndPotwPanel = ({
  actor,
  buildOffs,
  potwNominations,
  onChanged,
  onNotify,
  styles,
}: {
  actor: ArenaActorRef;
  buildOffs: TeamBuildOff[];
  potwNominations: ProjectOfTheWeekNomination[];
  onChanged: () => void;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  styles: Styles;
}) => {
  const { cardClass, borderClass, subtleBgClass, textPrimary, textSecondary, inputClass, btnPrimary, btnSecondary } = styles;
  const myUserId = actor.userId || 'local-member';

  // Team Build-Off creation
  const [activeBuildOffId, setActiveBuildOffId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('');
  const [boRepo, setBoRepo] = useState('');
  const [boDemo, setBoDemo] = useState('');
  const [boSummary, setBoSummary] = useState('');

  // POTW nomination form
  const [showNomForm, setShowNomForm] = useState(false);
  const [nomTitle, setNomTitle] = useState('');
  const [nomSummary, setNomSummary] = useState('');
  const [nomRepo, setNomRepo] = useState('');
  const [nomDemo, setNomDemo] = useState('');
  const [nomTech, setNomTech] = useState('TypeScript, React, Node');

  const handleRegisterTeam = async (boId: string, e: React.FormEvent) => {
    e.preventDefault();
    try {
      await submitBuildOffTeamApi(actor, boId, {
        teamName: teamName.trim(),
        repoUrl: boRepo.trim(),
        demoUrl: boDemo.trim(),
        summary: boSummary.trim(),
      });
      setTeamName('');
      setBoRepo('');
      setBoDemo('');
      setBoSummary('');
      setActiveBuildOffId(null);
      onChanged();
      onNotify('Team registered for Build-Off!');
    } catch (err: any) {
      onNotify(err?.message || 'Could not register team.', 'error');
    }
  };

  const handleJoinEntry = async (boId: string, entryId: string) => {
    try {
      await submitBuildOffTeamApi(actor, boId, { joinEntryId: entryId });
      onChanged();
      onNotify('Joined Build-Off team!');
    } catch (err: any) {
      onNotify(err?.message || 'Could not join team.', 'error');
    }
  };

  const handleNominatePotw = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await nominatePotwApi(actor, {
        title: nomTitle.trim(),
        summary: nomSummary.trim(),
        repoUrl: nomRepo.trim(),
        demoUrl: nomDemo.trim(),
        technologies: nomTech.split(',').map((s) => s.trim()).filter(Boolean),
      });
      setNomTitle('');
      setNomSummary('');
      setNomRepo('');
      setNomDemo('');
      setShowNomForm(false);
      onChanged();
      onNotify('Project nominated for Project of the Week!');
    } catch (err: any) {
      onNotify(err?.message || 'Could not nominate project.', 'error');
    }
  };

  const handleVotePotw = async (nomId: string) => {
    try {
      await togglePotwVoteApi(actor, nomId);
      onChanged();
    } catch (err: any) {
      onNotify(err?.message || 'Could not update vote.', 'error');
    }
  };

  return (
    <div className="space-y-10">
      {/* TEAM BUILD-OFFS */}
      <section className="space-y-5">
        <div className="space-y-1">
          <h2 className={`text-xl font-semibold ${textPrimary}`}>Team Build-Offs</h2>
          <p className={`text-sm ${textSecondary}`}>
            Form a small engineering squad, ship a focused product under theme constraints, and receive scored judge reviews.
          </p>
        </div>

        {buildOffs.length === 0 ? (
          <EmptyState title="No Team Build-Offs scheduled yet" description="Admins can launch new weekend or sprint Build-Offs from the Admin Console." />
        ) : (
          <div className="space-y-5">
            {buildOffs.map((bo) => {
              const formOpen = activeBuildOffId === bo.id;
              return (
                <article key={bo.id} className={`${cardClass} p-6 space-y-4`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={bo.status === 'Open' ? 'success' : bo.status === 'Judging' ? 'warning' : 'info'}>
                          {bo.status}
                        </Badge>
                        <Badge variant="neutral">{bo.theme}</Badge>
                        <span className="text-xs font-mono text-[var(--accent-700)] font-semibold">+{bo.xpReward} XP</span>
                      </div>
                      <h3 className={`text-lg font-semibold ${textPrimary}`}>{bo.title}</h3>
                      <p className={`text-sm ${textSecondary}`}>{bo.description}</p>
                      <p className={`text-xs ${textSecondary}`}>
                        Team size: {bo.teamSizeMin}–{bo.teamSizeMax} members · Deadline: {bo.deadline}
                      </p>
                    </div>
                    {bo.status !== 'Completed' && (
                      <button
                        type="button"
                        onClick={() => setActiveBuildOffId(formOpen ? null : bo.id)}
                        className={btnPrimary}
                      >
                        <Users className="w-4 h-4" /> {formOpen ? 'Close Form' : 'Register Team Entry'}
                      </button>
                    )}
                  </div>

                  {formOpen && (
                    <form onSubmit={(e) => handleRegisterTeam(bo.id, e)} className={`p-5 rounded-xl border ${borderClass} ${subtleBgClass} space-y-3`}>
                      <h4 className={`text-sm font-semibold ${textPrimary}`}>Create New Team Entry</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          required
                          value={teamName}
                          onChange={(e) => setTeamName(e.target.value)}
                          placeholder="Team name (e.g. Async Builders)"
                          className={inputClass}
                        />
                        <input
                          value={boRepo}
                          onChange={(e) => setBoRepo(e.target.value)}
                          placeholder="GitHub repository URL"
                          className={inputClass}
                        />
                      </div>
                      <input
                        value={boDemo}
                        onChange={(e) => setBoDemo(e.target.value)}
                        placeholder="Live demo URL (optional)"
                        className={inputClass}
                      />
                      <textarea
                        rows={2}
                        value={boSummary}
                        onChange={(e) => setBoSummary(e.target.value)}
                        placeholder="What problem does your build solve and what stack are you using?"
                        className={inputClass}
                      />
                      <button type="submit" className={btnPrimary}>Submit Team Entry</button>
                    </form>
                  )}

                  {bo.entries.length === 0 ? (
                    <p className={`text-xs ${textSecondary}`}>No teams registered yet — be the first team to enter.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {bo.entries.map((entry) => {
                        const alreadyMember = entry.memberIds.includes(myUserId);
                        const canJoin = !alreadyMember && bo.status !== 'Completed' && entry.memberIds.length < bo.teamSizeMax;
                        return (
                          <div
                            key={entry.id}
                            className={`p-4 rounded-xl border ${entry.isWinner ? 'border-[var(--accent-600)] bg-[var(--accent-50)]' : `${borderClass} ${subtleBgClass}`} space-y-2`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className={`font-semibold text-sm ${textPrimary}`}>{entry.teamName}</span>
                              <div className="flex items-center gap-1.5">
                                {entry.isWinner && <Badge variant="success">Winner</Badge>}
                                {typeof entry.judgeScore === 'number' && (
                                  <Badge variant="info">{entry.judgeScore}/100</Badge>
                                )}
                              </div>
                            </div>
                            <p className={`text-xs ${textSecondary}`}>
                              Members ({entry.memberNames.length}/{bo.teamSizeMax}): {entry.memberNames.join(', ')}
                            </p>
                            {entry.summary && <p className={`text-xs ${textPrimary}`}>{entry.summary}</p>}
                            {entry.judgeFeedback && (
                              <p className="text-xs text-[var(--accent-700)] font-medium">Judge feedback: {entry.judgeFeedback}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              {entry.repoUrl && (
                                <a href={entry.repoUrl} target="_blank" rel="noreferrer" className="text-xs text-[var(--accent-600)] hover:underline inline-flex items-center gap-1">
                                  Repo <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                              {canJoin && (
                                <button type="button" onClick={() => handleJoinEntry(bo.id, entry.id)} className="text-xs font-semibold text-[var(--accent-600)] hover:underline cursor-pointer">
                                  Join Team
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* PROJECT OF THE WEEK */}
      <section className="space-y-5 pt-4 border-t border-[var(--border-hairline)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className={`text-xl font-semibold ${textPrimary}`}>Project of the Week</h2>
            <p className={`text-sm ${textSecondary}`}>
              Nominate shipped projects, upvote peers, and celebrate weekly admin-selected winners (+150 XP).
            </p>
          </div>
          <button type="button" onClick={() => setShowNomForm((v) => !v)} className={btnPrimary}>
            <Plus className="w-4 h-4" /> {showNomForm ? 'Close Form' : 'Nominate Project'}
          </button>
        </div>

        {showNomForm && (
          <form onSubmit={handleNominatePotw} className={`${cardClass} p-6 space-y-4`}>
            <h3 className={`font-semibold text-base ${textPrimary}`}>Submit Project Nomination</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                required
                value={nomTitle}
                onChange={(e) => setNomTitle(e.target.value)}
                placeholder="Project title"
                className={inputClass}
              />
              <input
                value={nomTech}
                onChange={(e) => setNomTech(e.target.value)}
                placeholder="Technologies (comma-separated)"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input value={nomRepo} onChange={(e) => setNomRepo(e.target.value)} placeholder="Repository URL" className={inputClass} />
              <input value={nomDemo} onChange={(e) => setNomDemo(e.target.value)} placeholder="Live Demo URL (optional)" className={inputClass} />
            </div>
            <textarea
              required
              rows={3}
              value={nomSummary}
              onChange={(e) => setNomSummary(e.target.value)}
              placeholder="Explain what it does, what you learned building it, and how to test it."
              className={inputClass}
            />
            <button type="submit" className={btnPrimary}>Publish Nomination</button>
          </form>
        )}

        {potwNominations.length === 0 ? (
          <EmptyState
            title="No Project of the Week nominations yet"
            description="Ship something real this week and nominate it so members can upvote and admins can spotlight it."
            actionLabel="Nominate Your Project"
            onAction={() => setShowNomForm(true)}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {potwNominations.map((nom) => {
              const voted = nom.voterIds.includes(myUserId);
              return (
                <article
                  key={nom.id}
                  className={`${cardClass} p-5 flex flex-col justify-between gap-4 ${nom.isWinner ? 'border-[var(--accent-600)]' : ''}`}
                >
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="neutral">{nom.weekLabel}</Badge>
                      {nom.isWinner && (
                        <Badge variant="success">
                          <Trophy className="w-3 h-3 mr-1" /> Official Winner
                        </Badge>
                      )}
                    </div>
                    <h3 className={`text-base font-semibold ${textPrimary}`}>{nom.title}</h3>
                    <p className={`text-xs ${textSecondary}`}>Built by {nom.authorName}</p>
                    <p className={`text-sm ${textSecondary}`}>{nom.summary}</p>
                    {nom.technologies.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {nom.technologies.map((t) => (
                          <span key={t} className={`px-2 py-0.5 rounded-md text-xs ${subtleBgClass} ${textSecondary}`}>
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    {nom.judgeNote && (
                      <p className="text-xs text-[var(--accent-700)] font-medium">Judge Note: {nom.judgeNote}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[var(--border-hairline)]">
                    <div className="flex items-center gap-3 text-xs">
                      {nom.repoUrl && (
                        <a href={nom.repoUrl} target="_blank" rel="noreferrer" className="text-[var(--accent-600)] hover:underline inline-flex items-center gap-1">
                          Repo <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {nom.demoUrl && (
                        <a href={nom.demoUrl} target="_blank" rel="noreferrer" className="text-[var(--accent-600)] hover:underline inline-flex items-center gap-1">
                          Live Demo <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleVotePotw(nom.id)}
                      className={`px-3.5 min-h-[40px] rounded-full text-xs font-semibold border inline-flex items-center gap-1.5 cursor-pointer ${
                        voted
                          ? 'bg-[var(--accent-600)] text-white border-[var(--accent-600)]'
                          : `${borderClass} ${textPrimary} bg-[var(--surface-elevated)]`
                      }`}
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span className="tabular-nums">{nom.voterIds.length}</span> Upvote
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

/* ============================================================================
 * 3. BOUNTY BOARD PANEL
 * ========================================================================== */
export const BountyBoardPanel = ({
  actor,
  bounties,
  onChanged,
  onNotify,
  styles,
}: {
  actor: ArenaActorRef;
  bounties: BountyItem[];
  onChanged: () => void;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  styles: Styles;
}) => {
  const { cardClass, borderClass, subtleBgClass, textPrimary, textSecondary, inputClass, btnPrimary, btnSecondary } = styles;
  const myUserId = actor.userId || 'local-member';
  const [statusFilter, setStatusFilter] = useState<'All' | BountyItem['status']>('All');
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState('');
  const [notes, setNotes] = useState('');

  const filtered = useMemo(
    () => (statusFilter === 'All' ? bounties : bounties.filter((b) => b.status === statusFilter)),
    [bounties, statusFilter]
  );

  const handleClaimAction = async (bountyId: string, action: 'claim' | 'release') => {
    try {
      await claimOrReleaseBountyApi(actor, bountyId, action);
      onChanged();
      onNotify(action === 'claim' ? 'Bounty claimed! Submit proof once ready.' : 'Bounty released back to the board.');
    } catch (err: any) {
      onNotify(err?.message || 'Could not update bounty claim.', 'error');
    }
  };

  const handleSubmitProof = async (bountyId: string, e: React.FormEvent) => {
    e.preventDefault();
    try {
      await submitBountyProofApi(actor, bountyId, { repoUrl: repoUrl.trim(), notes: notes.trim() });
      setRepoUrl('');
      setNotes('');
      setSubmittingId(null);
      onChanged();
      onNotify('Bounty solution submitted for admin verification.');
    } catch (err: any) {
      onNotify(err?.message || 'Could not submit bounty proof.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={`text-xl font-semibold ${textPrimary}`}>Bounty Board</h2>
          <p className={`text-sm ${textSecondary}`}>
            Claim real engineering deliverables, verify every acceptance criterion, and earn verified XP upon admin review.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['All', 'Open', 'Claimed', 'In Review', 'Completed'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3.5 min-h-[44px] rounded-full text-sm font-medium border cursor-pointer ${
                statusFilter === s
                  ? 'bg-[var(--accent-600)] text-white border-[var(--accent-600)]'
                  : `${borderClass} ${textPrimary} bg-[var(--surface-elevated)]`
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No bounties match that filter" description="Switch status tabs or check back when admins post new engineering tasks." />
      ) : (
        <div className="space-y-5">
          {filtered.map((b) => {
            const isClaimedByMe = b.claimedById === myUserId;
            const showForm = submittingId === b.id;
            const latestSub = b.submissions[0];

            return (
              <article key={b.id} className={`${cardClass} p-6 space-y-4`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          b.status === 'Completed'
                            ? 'success'
                            : b.status === 'In Review'
                            ? 'info'
                            : b.status === 'Claimed'
                            ? 'warning'
                            : 'neutral'
                        }
                      >
                        <Target className="w-3 h-3 mr-1" /> {b.status}
                      </Badge>
                      <Badge variant="neutral">{b.category}</Badge>
                      <Badge variant="neutral">{b.difficulty}</Badge>
                      <span className="text-xs font-mono font-semibold text-[var(--accent-700)]">+{b.xpReward} XP</span>
                    </div>
                    <h3 className={`text-lg font-semibold ${textPrimary}`}>{b.title}</h3>
                    <p className={`text-sm ${textSecondary}`}>{b.description}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {b.status === 'Open' && (
                      <button type="button" onClick={() => handleClaimAction(b.id, 'claim')} className={btnPrimary}>
                        Claim Bounty
                      </button>
                    )}
                    {(b.status === 'Claimed' || b.status === 'In Review') && isClaimedByMe && (
                      <>
                        <button
                          type="button"
                          onClick={() => setSubmittingId(showForm ? null : b.id)}
                          className={btnPrimary}
                        >
                          {showForm ? 'Close Submission' : 'Submit Proof'}
                        </button>
                        {b.status === 'Claimed' && (
                          <button type="button" onClick={() => handleClaimAction(b.id, 'release')} className={btnSecondary}>
                            Release
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {b.acceptanceCriteria.length > 0 && (
                  <div className="space-y-1">
                    <div className={`text-xs font-semibold uppercase tracking-wider ${textSecondary}`}>Acceptance Criteria</div>
                    <ul className={`space-y-1 text-xs ${textSecondary}`}>
                      {b.acceptanceCriteria.map((c, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent-600)] shrink-0 mt-0.5" />
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {b.claimedByName && (
                  <p className={`text-xs ${textSecondary}`}>
                    Assigned to <strong className={textPrimary}>{b.claimedByName}</strong>
                  </p>
                )}

                {latestSub && latestSub.judgeNote && (
                  <div className={`p-3 rounded-lg ${subtleBgClass} text-xs`}>
                    <strong className={textPrimary}>Reviewer Note ({latestSub.status}): </strong>
                    <span className={textSecondary}>{latestSub.judgeNote}</span>
                  </div>
                )}

                {showForm && (
                  <form onSubmit={(e) => handleSubmitProof(b.id, e)} className={`p-4 rounded-xl border ${borderClass} ${subtleBgClass} space-y-3`}>
                    <input
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      placeholder="Pull Request or Repository URL"
                      className={inputClass}
                    />
                    <textarea
                      required
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Summarize your solution and how you verified every acceptance criterion."
                      className={inputClass}
                    />
                    <button type="submit" className={btnPrimary}>Send Proof for Review</button>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 4. SEASONAL STANDINGS & COMPETITION HISTORY
 * ========================================================================== */
export const SeasonStandingsPanel = ({
  seasons,
  standings,
  myUserId,
  onNavigateTab,
  styles,
}: {
  seasons: SeasonalCompetition[];
  standings: SeasonStandingRow[];
  myUserId: string;
  onNavigateTab: () => void;
  styles: Styles;
}) => {
  const { cardClass, textPrimary, textSecondary } = styles;
  const activeSeason = seasons.find((s) => s.status === 'Active') || seasons[0];

  return (
    <div className="space-y-6">
      {activeSeason && (
        <section className="rounded-[18px] bg-[var(--panel-deep)] text-white p-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge variant="info">{activeSeason.status} Season</Badge>
            <span className="text-xs font-mono text-white/75">
              {activeSeason.startDate} → {activeSeason.endDate}
            </span>
          </div>
          <h3 className="text-xl font-semibold text-white">{activeSeason.name}</h3>
          <p className="text-sm text-white/80">
            <strong>Theme:</strong> {activeSeason.theme} · <strong>Rewards:</strong> {activeSeason.prizeSummary}
          </p>
        </section>
      )}

      <section className={`${cardClass} p-6 space-y-4`}>
        <div className="space-y-1">
          <h3 className={`text-lg font-semibold ${textPrimary}`}>Seasonal Cup Standings</h3>
          <p className={`text-sm ${textSecondary}`}>
            Standings reflect completed arena matches, verified challenges, approved bounties, judged build-offs, and POTW awards only.
          </p>
        </div>

        {standings.length === 0 ? (
          <EmptyState
            title="No seasonal competition results yet"
            description="Complete a Coding Arena match, Daily Challenge, Build-Off, or Bounty to claim the first seasonal points."
            actionLabel="Open Coding Arena"
            onAction={onNavigateTab}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[600px]">
              <thead className={`text-xs ${textSecondary} bg-[var(--surface-subtle)]`}>
                <tr>
                  <th scope="col" className="py-2.5 pl-4 pr-3 font-medium">Rank</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">Member</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium text-right">Season Pts</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium text-right">Duel Wins / Played</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium text-right">Challenges</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium text-right">Bounties</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {standings.map((row, idx) => {
                  const isMe = row.userId === myUserId;
                  return (
                    <tr key={row.userId} className={isMe ? 'bg-[var(--accent-50)]' : ''}>
                      <td className={`py-3 pl-4 pr-3 font-mono font-semibold tabular-nums ${idx < 3 ? 'text-[var(--accent-700)]' : textSecondary}`}>
                        #{idx + 1}
                      </td>
                      <td className={`py-3 pr-4 font-semibold ${textPrimary}`}>
                        {row.userName} {isMe && <span className="text-xs text-[var(--accent-700)] ml-1">(You)</span>}
                      </td>
                      <td className={`py-3 pr-4 text-right font-mono font-semibold tabular-nums ${textPrimary}`}>
                        {row.seasonPoints}
                      </td>
                      <td className={`py-3 pr-4 text-right font-mono tabular-nums ${textSecondary}`}>
                        {row.duelWins}/{row.duelsPlayed}
                      </td>
                      <td className={`py-3 pr-4 text-right font-mono tabular-nums ${textSecondary}`}>
                        {row.challengesSolved}
                      </td>
                      <td className={`py-3 pr-4 text-right font-mono tabular-nums ${textSecondary}`}>
                        {row.bountiesCompleted}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export const CompetitionHistoryPanel = ({
  history,
  onOpenArena,
  styles,
}: {
  history: CompetitionHistoryEntry[];
  onOpenArena: () => void;
  styles: Styles;
}) => {
  const { cardClass, borderClass, textPrimary, textSecondary } = styles;

  const iconForKind = (kind: CompetitionHistoryEntry['kind']) => {
    switch (kind) {
      case 'duel':
        return Trophy;
      case 'challenge':
        return Code2;
      case 'buildoff':
        return Hammer;
      case 'bounty':
        return Target;
      case 'potw':
        return Sparkles;
      default:
        return Award;
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className={`text-xl font-semibold ${textPrimary}`}>Competition History & Verified Outcomes</h2>
        <p className={`text-sm ${textSecondary}`}>
          Official ledger of completed duels, verified challenges, bounties, and build-off results.
        </p>
      </div>

      {history.length === 0 ? (
        <EmptyState
          title="No completed competitions recorded yet"
          description="Finish a live Coding Arena match, Daily Challenge, Build-Off, or Bounty to build verified competition history."
          actionLabel="Enter Coding Arena"
          onAction={onOpenArena}
        />
      ) : (
        <ul className={`${cardClass} divide-y ${borderClass}`}>
          {history.map((h) => {
            const Icon = iconForKind(h.kind);
            return (
              <li key={h.id} className="p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <span className="w-9 h-9 rounded-full bg-[var(--accent-100)] text-[var(--accent-600)] flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="neutral">{h.kind.toUpperCase()}</Badge>
                      <span className={`font-semibold text-sm ${textPrimary}`}>{h.title}</span>
                    </div>
                    <p className={`text-sm ${textSecondary}`}>{h.outcome}</p>
                    {h.winnerNames.length > 0 && (
                      <p className={`text-xs ${textSecondary}`}>
                        Winners: <strong className={textPrimary}>{h.winnerNames.join(', ')}</strong>
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <span className="block text-sm font-mono font-semibold text-[var(--accent-700)]">+{h.xpAwarded} XP</span>
                  <span className={`block text-xs ${textSecondary}`}>
                    {new Date(h.completedAt).toLocaleDateString()}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
