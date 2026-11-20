import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Code2,
  Flag,
  Lock,
  MessageSquare,
  Play,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  Users,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { Badge, EmptyState } from './ui';
import {
  ArenaSocketClient,
  cancelArenaMatchApi,
  claimDisconnectWinApi,
  createArenaMatchApi,
  forfeitArenaMatchApi,
  joinArenaMatchApi,
  runMatchTestsApi,
  setArenaReadyApi,
  submitMatchSolutionApi,
  type ArenaActorRef,
} from '../lib/arenaClient';
import type {
  ArenaLanguage,
  ArenaMatchFormat,
  ArenaMatchView,
  ArenaProblem,
  ArenaScoringType,
  SandboxExecutionResult,
  SandboxStatus,
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

const LANG_LABEL: Record<ArenaLanguage, string> = {
  javascript: 'JavaScript (Node)',
  typescript: 'TypeScript',
  python: 'Python 3',
};

function formatClock(msRemaining: number): string {
  const totalSec = Math.max(0, Math.ceil(msRemaining / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const ArenaMatchRoom = ({
  actor,
  isAdmin,
  matches,
  selectedMatchId,
  onSelectMatch,
  problems,
  sandbox,
  wsConnected,
  serverOffsetMs,
  socketRef,
  onMatchesChanged,
  onNotify,
  styles,
}: {
  actor: ArenaActorRef;
  isAdmin: boolean;
  matches: ArenaMatchView[];
  selectedMatchId: string | null;
  onSelectMatch: (id: string | null) => void;
  problems: ArenaProblem[];
  sandbox: SandboxStatus | null;
  wsConnected: boolean;
  serverOffsetMs: number;
  socketRef: React.MutableRefObject<ArenaSocketClient | null>;
  onMatchesChanged: () => void;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  styles: Styles;
}) => {
  const { cardClass, borderClass, subtleBgClass, textPrimary, textSecondary, inputClass, btnPrimary, btnSecondary } = styles;

  // Lobby state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [lobbyFilter, setLobbyFilter] = useState<'all' | 'open' | 'finished'>('all');
  const [creating, setCreating] = useState(false);
  const [format, setFormat] = useState<ArenaMatchFormat>('1v1');
  const [scoringType, setScoringType] = useState<ArenaScoringType>('speed');
  const [problemId, setProblemId] = useState<string>(problems[0]?.id || 'prob-two-sum');
  const [allowedLangs, setAllowedLangs] = useState<ArenaLanguage[]>(['javascript', 'typescript', 'python']);
  const [durationSeconds, setDurationSeconds] = useState<number>(420);
  const [customTitle, setCustomTitle] = useState('');

  // Active match state
  const activeMatch = useMemo(
    () => (selectedMatchId ? matches.find((m) => m.id === selectedMatchId) || null : null),
    [matches, selectedMatchId]
  );

  const myUserId = actor.userId || 'local-member';
  const myParticipant = activeMatch?.participants.find((p) => p.userId === myUserId) || null;
  const myTeam = myParticipant && activeMatch ? activeMatch.teams[myParticipant.teamId] : null;
  const opponentTeam = useMemo(() => {
    if (!activeMatch) return null;
    if (myTeam) {
      return Object.values(activeMatch.teams).find((t) => t.teamId !== myTeam.teamId) || null;
    }
    return Object.values(activeMatch.teams)[1] || null;
  }, [activeMatch, myTeam]);

  // Live synced clock tick
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const serverNow = nowTick + serverOffsetMs;
  const countdownRemainingMs = activeMatch?.countdownEndsAtMs ? Math.max(0, activeMatch.countdownEndsAtMs - serverNow) : 0;
  const activeRemainingMs = activeMatch?.endsAtMs ? Math.max(0, activeMatch.endsAtMs - serverNow) : 0;

  // Local editor state synced with myTeam.privateState
  const [language, setLanguage] = useState<ArenaLanguage>('javascript');
  const [code, setCode] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const [chatText, setChatText] = useState('');
  const [localRunResult, setLocalRunResult] = useState<SandboxExecutionResult | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoadedMatchKey = useRef<string>('');

  // Sync editor when entering a match or receiving teammate edits
  useEffect(() => {
    if (!activeMatch || !myTeam?.privateState) {
      lastLoadedMatchKey.current = '';
      setLocalRunResult(null);
      return;
    }
    const key = `${activeMatch.id}:${myTeam.teamId}`;
    const priv = myTeam.privateState;
    if (lastLoadedMatchKey.current !== key) {
      lastLoadedMatchKey.current = key;
      const lang = activeMatch.allowedLanguages.includes(priv.activeLanguage)
        ? priv.activeLanguage
        : activeMatch.allowedLanguages[0] || 'javascript';
      setLanguage(lang);
      setCode(priv.codeByLanguage?.[lang] ?? activeMatch.problem.starterCode[lang] ?? '');
      setLocalRunResult(priv.lastRun || null);
      setConfirmForfeit(false);
    } else {
      // Teammate live sync (don't overwrite if I'm the latest editor in the last 800ms)
      if (priv.activeLanguage !== language && activeMatch.allowedLanguages.includes(priv.activeLanguage)) {
        setLanguage(priv.activeLanguage);
        setCode(priv.codeByLanguage?.[priv.activeLanguage] ?? '');
      } else {
        const remoteCode = priv.codeByLanguage?.[language];
        if (
          typeof remoteCode === 'string' &&
          remoteCode !== code &&
          priv.lastEditedBy &&
          priv.lastEditedBy !== actor.userName
        ) {
          setCode(remoteCode);
        }
      }
      if (priv.lastRun) {
        setLocalRunResult(priv.lastRun);
      }
    }
  }, [activeMatch, myTeam?.privateState, language, actor.userName]);

  // Sync WebSocket subscription whenever selected match changes
  useEffect(() => {
    socketRef.current?.subscribeMatch(selectedMatchId);
  }, [selectedMatchId, socketRef]);

  const handleToggleLangCheckbox = (lang: ArenaLanguage) => {
    setAllowedLangs((prev) => {
      if (prev.includes(lang)) {
        return prev.length > 1 ? prev.filter((l) => l !== lang) : prev;
      }
      return [...prev, lang];
    });
  };

  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await createArenaMatchApi(actor, {
        title: customTitle.trim() || undefined,
        format,
        teamSize: format === '2v2' ? 2 : 1,
        scoringType,
        problemId,
        allowedLanguages: allowedLangs,
        durationSeconds,
      });
      setCustomTitle('');
      setShowCreateForm(false);
      onMatchesChanged();
      onSelectMatch(res.match.id);
      onNotify(`Created ${res.match.format} match room.`);
    } catch (err: any) {
      onNotify(err?.message || 'Could not create match.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinMatch = async (matchId: string, preferredTeamId?: 'team-a' | 'team-b') => {
    try {
      const res = await joinArenaMatchApi(actor, matchId, preferredTeamId);
      onMatchesChanged();
      onSelectMatch(res.match.id);
      onNotify('Joined match room.');
    } catch (err: any) {
      onNotify(err?.message || 'Could not join match.', 'error');
    }
  };

  const handleReadyToggle = async () => {
    if (!activeMatch || !myParticipant) return;
    try {
      await setArenaReadyApi(actor, activeMatch.id, !myParticipant.ready);
      onMatchesChanged();
    } catch (err: any) {
      onNotify(err?.message || 'Could not update ready state.', 'error');
    }
  };

  const handleLanguageChange = (nextLang: ArenaLanguage) => {
    setLanguage(nextLang);
    const saved = myTeam?.privateState?.codeByLanguage?.[nextLang] ?? activeMatch?.problem.starterCode[nextLang] ?? '';
    setCode(saved);
    if (activeMatch && myParticipant) {
      socketRef.current?.sendCodeUpdate(activeMatch.id, nextLang, saved);
    }
  };

  const handleCodeChange = (nextCode: string) => {
    setCode(nextCode);
    if (!activeMatch || !myParticipant) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      socketRef.current?.sendCodeUpdate(activeMatch.id, language, nextCode);
    }, 180);
  };

  const handleResetStarter = () => {
    if (!activeMatch) return;
    const starter = activeMatch.problem.starterCode[language] || '';
    setCode(starter);
    socketRef.current?.sendCodeUpdate(activeMatch.id, language, starter);
    onNotify('Reset editor to starter template.');
  };

  const handleRunTests = async () => {
    if (!activeMatch) return;
    setRunning(true);
    try {
      const res = await runMatchTestsApi(actor, activeMatch.id, { language, code });
      setLocalRunResult(res.result);
      onMatchesChanged();
      if (res.result.allPassed) {
        onNotify(`Passed all ${res.result.totalCount} visible tests (${res.result.runtimeMs}ms).`);
      } else {
        onNotify(`Passed ${res.result.passedCount}/${res.result.totalCount} visible tests.`, 'error');
      }
    } catch (err: any) {
      onNotify(err?.message || 'Could not run sample tests.', 'error');
    } finally {
      setRunning(false);
    }
  };

  const handleSubmitSolution = async () => {
    if (!activeMatch) return;
    setSubmitting(true);
    try {
      const res = await submitMatchSolutionApi(actor, activeMatch.id, { language, code });
      setLocalRunResult(res.result);
      onMatchesChanged();
      if (res.match.winnerTeamId && res.match.winnerTeamId === myTeam?.teamId) {
        onNotify(`Victory! ${res.match.winReason || 'All tests passed.'}`);
      } else if (res.result.allPassed) {
        onNotify(`Submitted! Passed ${res.result.passedCount}/${res.result.totalCount} tests (${res.submission.score} pts).`);
      } else {
        onNotify(
          `Submitted (${res.result.passedCount}/${res.result.totalCount} passed). Check hidden test feedback and retry.`,
          'error'
        );
      }
    } catch (err: any) {
      onNotify(err?.message || 'Submission failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForfeit = async () => {
    if (!activeMatch) return;
    try {
      await forfeitArenaMatchApi(actor, activeMatch.id);
      setConfirmForfeit(false);
      onMatchesChanged();
      onNotify('You forfeited the match.');
    } catch (err: any) {
      onNotify(err?.message || 'Could not forfeit match.', 'error');
    }
  };

  const handleClaimDisconnectWin = async () => {
    if (!activeMatch) return;
    try {
      await claimDisconnectWinApi(actor, activeMatch.id);
      onMatchesChanged();
      onNotify('Disconnect forfeit claimed — victory awarded!');
    } catch (err: any) {
      onNotify(err?.message || 'Could not claim disconnect win yet.', 'error');
    }
  };

  const handleCancelMatch = async (matchId: string) => {
    try {
      await cancelArenaMatchApi(actor, matchId);
      onMatchesChanged();
      onNotify('Match cancelled.');
    } catch (err: any) {
      onNotify(err?.message || 'Could not cancel match.', 'error');
    }
  };

  const handleSendTeamChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMatch || !chatText.trim()) return;
    socketRef.current?.sendTeamChat(activeMatch.id, chatText.trim());
    setChatText('');
  };

  const filteredMatches = useMemo(() => {
    if (lobbyFilter === 'open') {
      return matches.filter((m) => ['waiting', 'ready_check', 'countdown', 'active'].includes(m.status));
    }
    if (lobbyFilter === 'finished') {
      return matches.filter((m) => ['completed', 'forfeited', 'cancelled'].includes(m.status));
    }
    return matches;
  }, [matches, lobbyFilter]);

  // --------------------------------------------------------------------------
  // MATCH ROOM VIEW
  // --------------------------------------------------------------------------
  if (activeMatch) {
    const teamA = activeMatch.teams['team-a'];
    const teamB = activeMatch.teams['team-b'];
    const oppParticipants = opponentTeam
      ? activeMatch.participants.filter((p) => p.teamId === opponentTeam.teamId)
      : [];
    const oppDisconnectedSec =
      activeMatch.status === 'active' &&
      oppParticipants.length > 0 &&
      oppParticipants.every((p) => !p.connected && p.disconnectedAtMs)
        ? Math.floor((serverNow - Math.min(...oppParticipants.map((p) => p.disconnectedAtMs || serverNow))) / 1000)
        : 0;

    const statusBadge = (() => {
      switch (activeMatch.status) {
        case 'waiting':
          return <Badge variant="neutral">Waiting for players</Badge>;
        case 'ready_check':
          return <Badge variant="warning">Ready check</Badge>;
        case 'countdown':
          return <Badge variant="info">Starting in {Math.max(1, Math.ceil(countdownRemainingMs / 1000))}s</Badge>;
        case 'active':
          return <Badge variant="success">Live match</Badge>;
        case 'completed':
          return <Badge variant="info">Completed</Badge>;
        case 'forfeited':
          return <Badge variant="warning">Forfeited</Badge>;
        case 'cancelled':
          return <Badge variant="danger">Cancelled</Badge>;
      }
    })();

    const isCreator = activeMatch.createdBy === myUserId;

    return (
      <div className="space-y-6">
        {/* Top Match Bar */}
        <div className={`${cardClass} p-5 flex flex-wrap items-center justify-between gap-4`}>
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => onSelectMatch(null)}
              className={`${btnSecondary} min-h-[44px]`}
            >
              <ArrowLeft className="w-4 h-4" /> Arena Lobby
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className={`text-lg font-semibold truncate ${textPrimary}`}>{activeMatch.title}</h2>
                {statusBadge}
                <Badge variant="neutral">
                  {activeMatch.format} · {activeMatch.scoringType === 'speed' ? 'Speed Duel' : 'Scored Challenge'}
                </Badge>
              </div>
              <p className={`text-xs ${textSecondary} flex items-center gap-2 mt-0.5`}>
                <span>Problem: {activeMatch.problem.title} ({activeMatch.problem.difficulty})</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  {wsConnected ? <Wifi className="w-3.5 h-3.5 text-[var(--success-ink)]" /> : <WifiOff className="w-3.5 h-3.5 text-[var(--warning-ink)]" />}
                  {wsConnected ? 'Live sync connected' : 'Reconnecting…'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {activeMatch.status === 'active' && (
              <div className="px-4 py-2 rounded-xl bg-[var(--panel-deep)] text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#3B82F6]" />
                <span className="font-mono text-xl font-bold tabular-nums">{formatClock(activeRemainingMs)}</span>
              </div>
            )}
            {activeMatch.status === 'countdown' && (
              <div className="px-4 py-2 rounded-xl bg-[var(--accent-600)] text-white font-mono text-xl font-bold tabular-nums">
                Starts in {Math.max(1, Math.ceil(countdownRemainingMs / 1000))}
              </div>
            )}
            {(activeMatch.status === 'waiting' || activeMatch.status === 'ready_check') && myParticipant && (
              <button type="button" onClick={handleReadyToggle} className={btnPrimary}>
                {myParticipant.ready ? 'Ready ✓ (Click to Unready)' : 'Mark Ready'}
              </button>
            )}
            {(activeMatch.status === 'waiting' || activeMatch.status === 'ready_check' || isAdmin) &&
              (isCreator || isAdmin) &&
              activeMatch.status !== 'completed' &&
              activeMatch.status !== 'cancelled' && (
                <button type="button" onClick={() => handleCancelMatch(activeMatch.id)} className={btnSecondary}>
                  Cancel Match
                </button>
              )}
          </div>
        </div>

        {/* Countdown Overlay Banner */}
        {activeMatch.status === 'countdown' && (
          <div className="rounded-[18px] bg-[var(--panel-deep)] text-white p-6 text-center space-y-2">
            <p className="text-xs uppercase tracking-widest text-white/70">Synchronized Start</p>
            <p className="font-display text-4xl font-bold tabular-nums">
              {Math.max(1, Math.ceil(countdownRemainingMs / 1000))}
            </p>
            <p className="text-sm text-white/80">All players are ready. The editor unlocks automatically when the clock hits zero.</p>
          </div>
        )}

        {/* Result Banner */}
        {(activeMatch.status === 'completed' || activeMatch.status === 'forfeited' || activeMatch.status === 'cancelled') && (
          <div
            className={`rounded-[16px] p-5 border flex flex-wrap items-center justify-between gap-4 ${
              activeMatch.winnerTeamId && activeMatch.winnerTeamId === myTeam?.teamId
                ? 'bg-[var(--success-bg)] border-[var(--success-border)]'
                : 'bg-[var(--surface-elevated)] border-[var(--border-hairline)]'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-full bg-[var(--accent-100)] text-[var(--accent-600)] flex items-center justify-center shrink-0">
                <Trophy className="w-5 h-5" />
              </span>
              <div className="space-y-1">
                <h3 className={`text-base font-semibold ${textPrimary}`}>
                  {activeMatch.winnerTeamId
                    ? `Winner: ${activeMatch.teams[activeMatch.winnerTeamId]?.label}`
                    : activeMatch.status === 'cancelled'
                    ? 'Match Cancelled'
                    : 'Match Drawn'}
                </h3>
                <p className={`text-sm ${textSecondary}`}>{activeMatch.winReason || 'Match concluded.'}</p>
              </div>
            </div>
            <button type="button" onClick={() => onSelectMatch(null)} className={btnSecondary}>
              Back to Lobby
            </button>
          </div>
        )}

        {/* Disconnect Grace Claim Notice */}
        {myParticipant && oppDisconnectedSec > 0 && activeMatch.status === 'active' && (
          <div className={`${cardClass} p-4 border-l-4 border-l-[var(--warning-ink)] flex flex-wrap items-center justify-between gap-3`}>
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-[var(--warning-ink)] shrink-0" />
              <span className={textPrimary}>
                Opponent appears disconnected ({oppDisconnectedSec}s elapsed · 45s reconnect window).
              </span>
            </div>
            {oppDisconnectedSec >= 45 && (
              <button type="button" onClick={handleClaimDisconnectWin} className={btnPrimary}>
                Claim Disconnect Win
              </button>
            )}
          </div>
        )}

        {/* Teams Scoreboard & Join Slots */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[teamA, teamB].map((team) => {
            const members = activeMatch.participants.filter((p) => p.teamId === team.teamId);
            const isMine = myParticipant?.teamId === team.teamId;
            const isWinner = activeMatch.winnerTeamId === team.teamId;
            const canJoinThisTeam =
              !myParticipant &&
              (activeMatch.status === 'waiting' || activeMatch.status === 'ready_check') &&
              team.memberIds.length < activeMatch.teamSize;
            return (
              <section
                key={team.teamId}
                className={`${cardClass} p-5 space-y-3 ${isMine ? 'border-[var(--accent-600)]' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className={`font-semibold text-base ${textPrimary}`}>{team.label}</h3>
                    {isMine && <Badge variant="info">Your team</Badge>}
                    {isWinner && <Badge variant="success">Winner</Badge>}
                  </div>
                  <div className="text-right font-mono tabular-nums text-xs">
                    <span className={`font-semibold text-sm ${textPrimary}`}>{team.bestScore} pts</span>
                    <span className={`block ${textSecondary}`}>
                      {team.passedCount}/{team.totalCount} tests
                    </span>
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {members.map((p) => (
                    <li key={p.userId} className={`flex items-center justify-between text-sm px-3 py-2 rounded-lg ${subtleBgClass}`}>
                      <span className="flex items-center gap-2 min-w-0">
                        {p.connected ? (
                          <Wifi className="w-3.5 h-3.5 text-[var(--success-ink)] shrink-0" />
                        ) : (
                          <WifiOff className="w-3.5 h-3.5 text-[var(--warning-ink)] shrink-0" />
                        )}
                        <span className={`truncate font-medium ${textPrimary}`}>{p.name}</span>
                      </span>
                      <span className="flex items-center gap-1.5 text-xs shrink-0">
                        {p.forfeited ? (
                          <Badge variant="danger">Forfeited</Badge>
                        ) : p.ready ? (
                          <Badge variant="success">Ready</Badge>
                        ) : (
                          <Badge variant="neutral">Not ready</Badge>
                        )}
                      </span>
                    </li>
                  ))}
                  {Array.from({ length: Math.max(0, activeMatch.teamSize - members.length) }).map((_, idx) => (
                    <li
                      key={`open-${idx}`}
                      className={`px-3 py-2 rounded-lg border border-dashed ${borderClass} text-xs ${textSecondary} flex items-center justify-between`}
                    >
                      <span>Open player slot</span>
                      {canJoinThisTeam && idx === 0 && (
                        <button
                          type="button"
                          onClick={() => handleJoinMatch(activeMatch.id, team.teamId as 'team-a' | 'team-b')}
                          className="text-xs font-semibold text-[var(--accent-600)] hover:underline cursor-pointer"
                        >
                          Join {team.label}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        {/* Main Split Arena Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Problem & Private Team Chat */}
          <div className="lg:col-span-5 space-y-5">
            <section className={`${cardClass} p-6 space-y-4`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="neutral">{activeMatch.problem.category}</Badge>
                <span className={`text-xs font-mono ${textSecondary}`}>
                  {activeMatch.problem.visibleTests.length} sample + {activeMatch.problem.hiddenTestsCount} hidden tests
                </span>
              </div>
              <h3 className={`text-lg font-semibold ${textPrimary}`}>{activeMatch.problem.title}</h3>
              <p className={`text-sm leading-relaxed ${textSecondary}`}>{activeMatch.problem.description}</p>

              <div className={`p-3 rounded-lg ${subtleBgClass} text-xs space-y-1`}>
                <div className={`font-semibold ${textPrimary}`}>Scoring & Rules</div>
                <p className={textSecondary}>
                  {activeMatch.scoringType === 'speed'
                    ? 'Speed Duel: The first team whose final submission passes 100% of visible and hidden test cases wins immediately.'
                    : 'Scored Challenge: 800 pts × test pass ratio + up to 200 speed bonus points. Ties break by earliest server arrival timestamp.'}
                </p>
              </div>

              <div className="space-y-2">
                <div className={`text-xs font-semibold uppercase tracking-wider ${textSecondary}`}>Examples</div>
                {activeMatch.problem.examples.map((ex, i) => (
                  <div key={i} className={`p-3 rounded-lg border ${borderClass} font-mono text-xs space-y-1`}>
                    <div className={textPrimary}>In: {ex.input}</div>
                    <div className="text-[var(--accent-700)]">Out: {ex.output}</div>
                    {ex.explanation && <div className={`font-sans ${textSecondary}`}>{ex.explanation}</div>}
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <div className={`text-xs font-semibold uppercase tracking-wider ${textSecondary}`}>Constraints</div>
                <ul className={`list-disc pl-4 text-xs space-y-1 ${textSecondary}`}>
                  {activeMatch.problem.constraints.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            </section>

            {/* Private Team Chat (only shown to members of that team — never exposed to opponents) */}
            {myTeam?.privateState && (
              <section className={`${cardClass} p-5 space-y-3`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-[var(--accent-600)]" />
                    <h3 className={`font-semibold text-sm ${textPrimary}`}>Private Team Channel</h3>
                  </div>
                  <Badge variant="info">
                    <Lock className="w-3 h-3 mr-1" /> Private to {myTeam.label}
                  </Badge>
                </div>
                <p className={`text-xs ${textSecondary}`}>
                  {activeMatch.format === '2v2'
                    ? 'Coordinate strategy with your teammate. Opponents cannot see this chat or your code.'
                    : 'Your scratch notes stay private to you and are never shared with opponents.'}
                </p>
                <div className={`max-h-48 overflow-y-auto space-y-2 p-3 rounded-xl border ${borderClass} ${subtleBgClass}`}>
                  {myTeam.privateState.teamChat.length === 0 ? (
                    <p className={`text-xs ${textSecondary}`}>No team messages yet.</p>
                  ) : (
                    myTeam.privateState.teamChat.map((m) => (
                      <div key={m.id} className="text-xs space-y-0.5">
                        <span className={`font-semibold ${textPrimary}`}>{m.senderName}: </span>
                        <span className={textSecondary}>{m.text}</span>
                      </div>
                    ))
                  )}
                </div>
                <form onSubmit={handleSendTeamChat} className="flex items-center gap-2">
                  <input
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder="Message your team privately…"
                    className={`${inputClass} py-2 text-sm`}
                  />
                  <button type="submit" aria-label="Send team message" className={btnPrimary}>
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </section>
            )}
          </div>

          {/* Code Editor, Isolated Execution & Submission Results */}
          <div className="lg:col-span-7 space-y-5">
            {myParticipant && myTeam?.privateState ? (
              <section className={`${cardClass} p-6 space-y-4`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-[var(--accent-600)]" />
                    <h3 className={`font-semibold text-base ${textPrimary}`}>
                      Team Editor {activeMatch.format === '2v2' ? '(Shared with teammate)' : ''}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      aria-label="Programming language"
                      value={language}
                      onChange={(e) => handleLanguageChange(e.target.value as ArenaLanguage)}
                      disabled={activeMatch.status !== 'active' && activeMatch.status !== 'waiting' && activeMatch.status !== 'ready_check'}
                      className={`${inputClass} w-auto py-1.5 px-3 text-sm`}
                    >
                      {activeMatch.allowedLanguages.map((l) => (
                        <option key={l} value={l}>
                          {LANG_LABEL[l]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleResetStarter}
                      title="Reset to starter code"
                      className={`${btnSecondary} px-3 min-h-[40px]`}
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Reset
                    </button>
                  </div>
                </div>

                {myTeam.privateState.lastEditedBy && (
                  <p className={`text-xs ${textSecondary}`}>
                    Last synced edit by <strong>{myTeam.privateState.lastEditedBy}</strong> · Entry function:{' '}
                    <code className="font-mono">{activeMatch.problem.entryPoint}</code>
                  </p>
                )}

                <textarea
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab') {
                      e.preventDefault();
                      const target = e.currentTarget;
                      const start = target.selectionStart;
                      const end = target.selectionEnd;
                      const next = code.slice(0, start) + '  ' + code.slice(end);
                      handleCodeChange(next);
                      requestAnimationFrame(() => {
                        target.selectionStart = target.selectionEnd = start + 2;
                      });
                    }
                  }}
                  spellCheck={false}
                  rows={14}
                  readOnly={activeMatch.status === 'completed' || activeMatch.status === 'forfeited' || activeMatch.status === 'cancelled'}
                  aria-label="Solution code editor"
                  className="w-full p-4 rounded-xl border border-[var(--border-strong)] bg-[var(--panel-deep)] text-[#FAFAFA] font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--accent-500)]"
                />

                {sandbox && (
                  <div className={`flex flex-wrap items-center gap-2 text-xs ${textSecondary}`}>
                    <ShieldCheck className="w-4 h-4 text-[var(--success-ink)] shrink-0" />
                    <span>
                      Sandbox: {sandbox.label} · Timeout {sandbox.limits.wallTimeoutMs}ms · CPU {sandbox.limits.cpuSeconds}s · Memory{' '}
                      {sandbox.limits.memoryMb}MB
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRunTests}
                      disabled={running || activeMatch.status !== 'active'}
                      className={btnSecondary}
                    >
                      <Play className="w-4 h-4" /> {running ? 'Running Tests…' : 'Run Sample Tests'}
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitSolution}
                      disabled={submitting || activeMatch.status !== 'active'}
                      className={btnPrimary}
                    >
                      <Sparkles className="w-4 h-4" /> {submitting ? 'Evaluating…' : 'Submit Team Solution'}
                    </button>
                  </div>

                  {activeMatch.status === 'active' && (
                    <div>
                      {!confirmForfeit ? (
                        <button
                          type="button"
                          onClick={() => setConfirmForfeit(true)}
                          className="px-3 min-h-[44px] rounded-full text-xs font-medium text-[var(--danger-ink)] hover:bg-[var(--danger-bg)] cursor-pointer inline-flex items-center gap-1"
                        >
                          <Flag className="w-3.5 h-3.5" /> Forfeit
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleForfeit}
                            className="px-3 min-h-[44px] rounded-full bg-[var(--danger-bg)] border border-[var(--danger-border)] text-[var(--danger-ink)] text-xs font-semibold cursor-pointer"
                          >
                            Confirm Forfeit
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmForfeit(false)}
                            className="px-3 min-h-[44px] text-xs font-medium text-[var(--ink-secondary)] cursor-pointer"
                          >
                            Keep playing
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Test Execution Feedback */}
                {localRunResult && (
                  <div className={`p-4 rounded-xl border ${borderClass} ${subtleBgClass} space-y-3`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {localRunResult.allPassed ? (
                          <CheckCircle2 className="w-4 h-4 text-[var(--success-ink)]" />
                        ) : (
                          <XCircle className="w-4 h-4 text-[var(--danger-ink)]" />
                        )}
                        <span className={`text-sm font-semibold ${textPrimary}`}>
                          {localRunResult.passedCount}/{localRunResult.totalCount} tests passed
                        </span>
                      </div>
                      <span className={`text-xs font-mono tabular-nums ${textSecondary}`}>
                        {localRunResult.runtimeMs}ms · {localRunResult.isolationMode}
                      </span>
                    </div>

                    {localRunResult.error && (
                      <pre className="p-3 rounded-lg bg-[var(--danger-bg)] text-[var(--danger-ink)] text-xs font-mono whitespace-pre-wrap overflow-x-auto">
                        {localRunResult.error}
                      </pre>
                    )}

                    {localRunResult.stdout && (
                      <pre className="p-3 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border-hairline)] text-xs font-mono whitespace-pre-wrap overflow-x-auto">
                        {localRunResult.stdout}
                      </pre>
                    )}

                    <ul className="space-y-2">
                      {localRunResult.results.map((r) => (
                        <li
                          key={r.testId}
                          className={`p-2.5 rounded-lg border ${borderClass} bg-[var(--surface-elevated)] text-xs space-y-1`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`font-medium ${textPrimary}`}>
                              {r.label} {r.hidden ? '(Hidden test)' : ''}
                            </span>
                            <Badge variant={r.passed ? 'success' : 'danger'}>{r.passed ? 'Passed' : 'Failed'}</Badge>
                          </div>
                          {!r.passed && (
                            <div className="font-mono text-xs space-y-0.5 text-[var(--ink-secondary)]">
                              {!r.hidden && r.expected !== undefined && <div>Expected: {r.expected}</div>}
                              {!r.hidden && r.actual !== undefined && <div>Actual: {r.actual}</div>}
                              {r.error && <div className="text-[var(--danger-ink)]">Error: {r.error}</div>}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            ) : (
              <section className={`${cardClass} p-6 space-y-3`}>
                <h3 className={`font-semibold text-base ${textPrimary}`}>Spectator View</h3>
                <p className={`text-sm ${textSecondary}`}>
                  You are viewing this match as a spectator. Private team code editors and private team chats are hidden.
                </p>
              </section>
            )}

            {/* Match Submission Log */}
            <section className={`${cardClass} p-6 space-y-3`}>
              <h3 className={`font-semibold text-base ${textPrimary}`}>Submission Log ({activeMatch.submissions.length})</h3>
              {activeMatch.submissions.length === 0 ? (
                <p className={`text-sm ${textSecondary}`}>No official submissions evaluated yet.</p>
              ) : (
                <ul className={`divide-y ${borderClass}`}>
                  {activeMatch.submissions.map((s) => (
                    <li key={s.id} className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <span className={`font-semibold ${textPrimary}`}>
                          {activeMatch.teams[s.teamId]?.label || s.teamId} ({s.submittedByName})
                        </span>
                        <span className={`block ${textSecondary}`}>
                          {LANG_LABEL[s.language]} · {s.passedCount}/{s.totalCount} tests ({s.hiddenPassed}/{s.hiddenTotal} hidden)
                        </span>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <Badge variant={s.allPassed ? 'success' : 'neutral'}>{s.score} pts</Badge>
                        <span className={`block mt-0.5 ${textSecondary}`}>{s.runtimeMs}ms</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // ARENA LOBBY VIEW
  // --------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className={`text-xl font-semibold ${textPrimary}`}>Real-Time Coding Arena</h2>
          <p className={`text-sm ${textSecondary}`}>
            Compete in synchronized 1v1 duels or 2v2 team matches with isolated server-side grading.
          </p>
        </div>
        <button type="button" onClick={() => setShowCreateForm((v) => !v)} className={btnPrimary}>
          <Plus className="w-4 h-4" /> {showCreateForm ? 'Close Match Setup' : 'Create Arena Match'}
        </button>
      </div>

      {sandbox && (
        <div className={`${cardClass} p-4 flex flex-wrap items-center justify-between gap-3`}>
          <div className="flex items-center gap-2.5 text-sm">
            <ShieldCheck className="w-4 h-4 text-[var(--success-ink)] shrink-0" />
            <span className={textPrimary}>
              <strong>Isolated Sandbox Active:</strong> {sandbox.label}
            </span>
          </div>
          <span className={`text-xs font-mono tabular-nums ${textSecondary}`}>
            {sandbox.limits.wallTimeoutMs}ms cap · {sandbox.limits.memoryMb}MB RAM
          </span>
        </div>
      )}

      {/* Match Creation Panel */}
      {showCreateForm && (
        <form onSubmit={handleCreateMatch} className={`${cardClass} p-6 space-y-5`}>
          <h3 className={`text-lg font-semibold ${textPrimary}`}>New Coding Match</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className={`block text-xs font-medium ${textSecondary}`}>Format</label>
              <select value={format} onChange={(e) => setFormat(e.target.value as ArenaMatchFormat)} className={inputClass}>
                <option value="1v1">1v1 Solo Duel</option>
                <option value="2v2">2v2 Team Match (Private team workspace)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={`block text-xs font-medium ${textSecondary}`}>Win Rule</label>
              <select
                value={scoringType}
                onChange={(e) => setScoringType(e.target.value as ArenaScoringType)}
                className={inputClass}
              >
                <option value="speed">Speed Duel (First 100% pass wins)</option>
                <option value="scored">Scored Challenge (Score + time tie-break)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={`block text-xs font-medium ${textSecondary}`}>Time Limit</label>
              <select
                value={durationSeconds}
                onChange={(e) => setDurationSeconds(Number(e.target.value))}
                className={inputClass}
              >
                <option value={180}>3 minutes</option>
                <option value={300}>5 minutes</option>
                <option value={420}>7 minutes</option>
                <option value={600}>10 minutes</option>
                <option value={900}>15 minutes</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={`block text-xs font-medium ${textSecondary}`}>Shared Problem</label>
              <select value={problemId} onChange={(e) => setProblemId(e.target.value)} className={inputClass}>
                {problems.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.difficulty}] {p.title} ({p.category})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={`block text-xs font-medium ${textSecondary}`}>Custom Match Title (Optional)</label>
              <input
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="e.g. Friday Afternoon Sprint"
                className={inputClass}
              />
            </div>
          </div>

          <div className="space-y-2">
            <span className={`block text-xs font-medium ${textSecondary}`}>Permitted Languages</span>
            <div className="flex flex-wrap gap-2">
              {(['javascript', 'typescript', 'python'] as ArenaLanguage[]).map((l) => {
                const active = allowedLangs.includes(l);
                return (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handleToggleLangCheckbox(l)}
                    className={`px-4 min-h-[44px] rounded-full text-sm font-medium border cursor-pointer ${
                      active
                        ? 'bg-[var(--accent-600)] text-white border-[var(--accent-600)]'
                        : `${borderClass} ${textPrimary} bg-[var(--surface-elevated)]`
                    }`}
                  >
                    {LANG_LABEL[l]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button type="submit" disabled={creating} className={btnPrimary}>
              {creating ? 'Creating Match…' : 'Open Match Room'}
            </button>
            <button type="button" onClick={() => setShowCreateForm(false)} className={btnSecondary}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Lobby Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {([
            ['all', 'All Matches'],
            ['open', 'Open & Live'],
            ['finished', 'Finished'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setLobbyFilter(id)}
              className={`px-4 min-h-[44px] rounded-full text-sm font-medium border cursor-pointer ${
                lobbyFilter === id
                  ? 'bg-[var(--accent-600)] text-white border-[var(--accent-600)]'
                  : `${borderClass} ${textPrimary} bg-[var(--surface-elevated)]`
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className={`text-xs ${textSecondary}`}>
          {wsConnected ? 'Live arena updates enabled' : 'Connecting to arena server…'}
        </span>
      </div>

      {/* Matches List */}
      {filteredMatches.length === 0 ? (
        <EmptyState
          title="No arena matches yet"
          description="Start a 1v1 coding duel or 2v2 team match above, then invite a teammate or challenger to join."
          actionLabel="Create Arena Match"
          onAction={() => setShowCreateForm(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredMatches.map((m) => {
            const amInMatch = m.participants.some((p) => p.userId === myUserId);
            const totalSlots = m.teamSize * 2;
            const joinable = (m.status === 'waiting' || m.status === 'ready_check') && m.participants.length < totalSlots;
            return (
              <article key={m.id} className={`${cardClass} p-5 flex flex-col justify-between gap-4`}>
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="info">{m.format}</Badge>
                      <Badge variant="neutral">{m.scoringType === 'speed' ? 'Speed Duel' : 'Scored'}</Badge>
                    </div>
                    <Badge
                      variant={
                        m.status === 'active'
                          ? 'success'
                          : m.status === 'completed'
                          ? 'info'
                          : m.status === 'cancelled'
                          ? 'danger'
                          : 'warning'
                      }
                    >
                      {m.status.replace('_', ' ')}
                    </Badge>
                  </div>

                  <h3 className={`text-base font-semibold ${textPrimary}`}>{m.title}</h3>
                  <p className={`text-xs ${textSecondary}`}>
                    Problem: <strong className={textPrimary}>{m.problem.title}</strong> ({m.problem.difficulty}) ·{' '}
                    {Math.round(m.durationSeconds / 60)}m · Languages: {m.allowedLanguages.join(', ')}
                  </p>

                  <div className={`flex items-center gap-2 text-xs ${textSecondary}`}>
                    {m.format === '2v2' ? <Users className="w-3.5 h-3.5" /> : <Swords className="w-3.5 h-3.5" />}
                    <span>
                      {m.participants.length}/{totalSlots} players joined · Host: {m.createdByName}
                    </span>
                  </div>

                  {m.winReason && <p className={`text-xs font-medium ${textPrimary}`}>{m.winReason}</p>}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border-hairline)]">
                  {amInMatch ? (
                    <button type="button" onClick={() => onSelectMatch(m.id)} className={btnPrimary}>
                      Enter Match Room
                    </button>
                  ) : joinable ? (
                    <>
                      {m.teams['team-a'].memberIds.length < m.teamSize && (
                        <button type="button" onClick={() => handleJoinMatch(m.id, 'team-a')} className={btnPrimary}>
                          Join {m.teams['team-a'].label}
                        </button>
                      )}
                      {m.teams['team-b'].memberIds.length < m.teamSize && (
                        <button type="button" onClick={() => handleJoinMatch(m.id, 'team-b')} className={btnPrimary}>
                          Join {m.teams['team-b'].label}
                        </button>
                      )}
                      <button type="button" onClick={() => onSelectMatch(m.id)} className={btnSecondary}>
                        Inspect
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => onSelectMatch(m.id)} className={btnSecondary}>
                      {m.status === 'active' ? 'Watch Live' : 'View Results'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
