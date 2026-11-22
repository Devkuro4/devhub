import fs from 'node:fs';
import path from 'node:path';
import { loadDurableState, saveDurableState } from './durableState.ts';
import {
  ARENA_PROBLEMS,
  INITIAL_ARENA_CHALLENGES,
  INITIAL_BOUNTIES,
  INITIAL_SEASON,
  INITIAL_TEAM_BUILD_OFFS,
} from '../src/data/arenaProblems.ts';
import type {
  ArenaChallengeItem,
  ArenaChallengeSubmission,
  ArenaLanguage,
  ArenaMatchFormat,
  ArenaMatchView,
  ArenaParticipant,
  ArenaProblem,
  ArenaScoringType,
  ArenaTeamPrivateState,
  ArenaTeamSubmission,
  ArenaTeamView,
  BountyItem,
  CompetitionHistoryEntry,
  CompetitionXpAwards,
  ProjectOfTheWeekNomination,
  SandboxExecutionResult,
  SeasonalCompetition,
  SeasonStandingRow,
  TeamBuildOff,
} from '../src/types.ts';
import { getSandboxStatus, runIsolatedTests } from './sandboxRunner.ts';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_PATH = path.join(DATA_DIR, 'arena-store.json');
// How long a team may be completely absent before the other side can claim the win (overridable for tests).
const RECONNECT_GRACE_MS = Number(process.env.ARENA_RECONNECT_GRACE_MS) > 0 ? Number(process.env.ARENA_RECONNECT_GRACE_MS) : 45_000;

interface InternalArenaTeam {
  teamId: string;
  label: string;
  memberIds: string[];
  bestScore: number;
  passedCount: number;
  totalCount: number;
  allPassed: boolean;
  submitted: boolean;
  lastSubmissionAtMs: number | null;
  forfeited: boolean;
  privateState: ArenaTeamPrivateState;
}

interface InternalArenaMatch {
  id: string;
  title: string;
  format: ArenaMatchFormat;
  teamSize: number;
  scoringType: ArenaScoringType;
  problemId: string;
  allowedLanguages: ArenaLanguage[];
  durationSeconds: number;
  status: ArenaMatchView['status'];
  createdBy: string;
  createdByName: string;
  createdAt: string;
  countdownEndsAtMs: number | null;
  startedAtMs: number | null;
  endsAtMs: number | null;
  endedAtMs: number | null;
  winnerTeamId: string | null;
  winReason?: string;
  participants: ArenaParticipant[];
  teams: Record<string, InternalArenaTeam>;
  submissions: ArenaTeamSubmission[];
}

interface PersistedArenaStore {
  matches: InternalArenaMatch[];
  challenges: ArenaChallengeItem[];
  buildOffs: TeamBuildOff[];
  potwNominations: ProjectOfTheWeekNomination[];
  bounties: BountyItem[];
  seasons: SeasonalCompetition[];
  history: CompetitionHistoryEntry[];
  customProblems: ArenaProblem[];
}

export type ArenaBroadcastEvent =
  | { type: 'arena:lobby_sync' }
  | { type: 'arena:match_updated'; matchId: string }
  | { type: 'arena:team_workspace'; matchId: string; teamId: string }
  | { type: 'arena:competitions_sync' };

type ArenaListener = (ev: ArenaBroadcastEvent) => void;
const listeners = new Set<ArenaListener>();

export function subscribeArenaEvents(fn: ArenaListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(ev: ArenaBroadcastEvent) {
  for (const fn of listeners) {
    try {
      fn(ev);
    } catch {
      /* ignore listener errors */
    }
  }
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createInitialStore(): PersistedArenaStore {
  return {
    matches: [],
    challenges: INITIAL_ARENA_CHALLENGES.map((c) => ({ ...c, submissions: [...(c.submissions || [])] })),
    buildOffs: INITIAL_TEAM_BUILD_OFFS.map((b) => ({ ...b, entries: [...(b.entries || [])] })),
    potwNominations: [],
    bounties: INITIAL_BOUNTIES.map((b) => ({ ...b, submissions: [...(b.submissions || [])] })),
    seasons: [{ ...INITIAL_SEASON }],
    history: [],
    customProblems: [],
  };
}

function loadStore(): PersistedArenaStore {
  const base = createInitialStore();
  try {
    if (!fs.existsSync(STORE_PATH)) return base;
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return {
      matches: Array.isArray(parsed.matches) ? parsed.matches : [],
      challenges: Array.isArray(parsed.challenges) && parsed.challenges.length ? parsed.challenges : base.challenges,
      buildOffs: Array.isArray(parsed.buildOffs) && parsed.buildOffs.length ? parsed.buildOffs : base.buildOffs,
      potwNominations: Array.isArray(parsed.potwNominations) ? parsed.potwNominations : [],
      bounties: Array.isArray(parsed.bounties) && parsed.bounties.length ? parsed.bounties : base.bounties,
      seasons: Array.isArray(parsed.seasons) && parsed.seasons.length ? parsed.seasons : base.seasons,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      customProblems: Array.isArray(parsed.customProblems) ? parsed.customProblems : [],
    };
  } catch {
    return base;
  }
}

let store: PersistedArenaStore = loadStore();

export async function hydrateArenaStore() {
  const remote = await loadDurableState<PersistedArenaStore>('arena');
  if (!remote || !Array.isArray(remote.matches) || !Array.isArray(remote.challenges)) return;
  store = { ...createInitialStore(), ...remote };
  resetPresenceOnBoot();
}

// Sockets don't survive a restart, but the saved "connected" flags do. Start everyone as disconnected;
// players who are really still around flip back to connected as soon as their WebSocket reconnects.
function resetPresenceOnBoot() {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  for (const m of store.matches) {
    if (m.status === 'completed' || m.status === 'forfeited' || m.status === 'cancelled') continue;
    for (const p of m.participants) {
      p.connected = false;
      p.disconnectedAtMs = nowMs;
      p.lastSeenAt = nowIso;
    }
  }
}
resetPresenceOnBoot();

// Who has a live socket watching which match, even before they've joined it. Without this, someone who opens a room
// and THEN joins would be marked disconnected until they re-subscribed.
const watchers = new Set<string>();
const watchKey = (userId: string, matchId: string) => `${userId}|${matchId}`;

// Any authenticated REST action (run, submit, ready, ...) proves the player is still there, even if their socket is blocked.
function touchParticipant(match: InternalArenaMatch, userId: string) {
  const p = match.participants.find((x) => x.userId === userId);
  if (p) p.lastSeenAt = new Date().toISOString();
}

// When did this participant last give a sign of life? Connected players are "now".
function absentSinceMs(p: ArenaParticipant): number {
  if (p.connected) return Number.POSITIVE_INFINITY;
  return Math.max(p.disconnectedAtMs || 0, Date.parse(p.lastSeenAt) || 0);
}

function saveStore() {
  saveDurableState('arena', store);
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmp, STORE_PATH);
  } catch (err) {
    console.warn('[arenaStore] failed to persist store:', err);
  }
}

function findProblem(problemId: string): ArenaProblem | undefined {
  return store.customProblems.find((p) => p.id === problemId) || ARENA_PROBLEMS.find((p) => p.id === problemId);
}

// Lenient lookup used for matches/challenges that already exist (legacy data may point at a missing problem).
// New matches must go through findProblem so an unknown id is rejected instead of silently becoming Two Sum.
function getProblemById(problemId: string): ArenaProblem {
  return findProblem(problemId) || ARENA_PROBLEMS[0];
}

const MAX_CUSTOM_PROBLEMS = 100;

export function registerCustomArenaProblem(problem: ArenaProblem): ArenaProblem {
  // Never evict a problem that a stored match still points at, otherwise that match silently turns into Two Sum.
  const inUse = new Set<string>([
    ...store.matches.map((m) => m.problemId),
    ...store.challenges.map((c) => c.problemId || ''),
  ]);
  const others = store.customProblems.filter((p) => p.id !== problem.id);
  const kept: ArenaProblem[] = [];
  let free = MAX_CUSTOM_PROBLEMS - 1;
  for (const p of others) {
    if (inUse.has(p.id)) kept.push(p);
    else if (free > 0) {
      kept.push(p);
      free -= 1;
    }
  }
  store.customProblems = [problem, ...kept];
  saveStore();
  return problem;
}

// A problem stays secret until the match has actually started.
function isProblemRevealed(match: InternalArenaMatch): boolean {
  return match.startedAtMs !== null && match.startedAtMs !== undefined;
}

// What a client may know about a problem: no hidden tests, and no expected values for them.
function toClientProblem(problem: ArenaProblem): ArenaProblem {
  return {
    ...problem,
    starterCode: { ...problem.starterCode },
    constraints: [...problem.constraints],
    examples: [...problem.examples],
    testCases: problem.testCases.filter((t) => !t.hidden),
    totalTestsCount: problem.testCases.length,
  };
}

function pickBuiltInProblem(difficulty?: string): ArenaProblem {
  const wanted = ['Beginner', 'Intermediate', 'Advanced'].includes(String(difficulty)) ? String(difficulty) : null;
  const pool = wanted ? ARENA_PROBLEMS.filter((p) => p.difficulty === wanted) : ARENA_PROBLEMS;
  const base = pool.length ? pool : ARENA_PROBLEMS;
  // Prefer problems that are not published as a daily/weekly challenge, so nobody has seen the statement already.
  const challengeIds = new Set(store.challenges.map((c) => c.problemId).filter(Boolean));
  const fresh = base.filter((p) => !challengeIds.has(p.id));
  const choices = fresh.length ? fresh : base;
  return choices[Math.floor(Math.random() * choices.length)];
}

// Strict privacy filter: NEVER expose another team's private workspace (code or private team chat).
export function sanitizeMatchForUser(match: InternalArenaMatch, viewerUserId?: string): ArenaMatchView {
  const problem = getProblemById(match.problemId);
  const revealed = isProblemRevealed(match);
  const teams: Record<string, ArenaTeamView> = {};
  for (const [teamId, t] of Object.entries(match.teams)) {
    const isMember = Boolean(viewerUserId && t.memberIds.includes(viewerUserId));
    teams[teamId] = {
      teamId: t.teamId,
      label: t.label,
      memberIds: [...t.memberIds],
      bestScore: t.bestScore,
      passedCount: t.passedCount,
      totalCount: t.totalCount,
      allPassed: t.allPassed,
      submitted: t.submitted,
      lastSubmissionAtMs: t.lastSubmissionAtMs,
      forfeited: t.forfeited,
      ...(isMember
        ? {
            privateState: {
              activeLanguage: t.privateState.activeLanguage,
              codeByLanguage: { ...t.privateState.codeByLanguage },
              lastEditedBy: t.privateState.lastEditedBy,
              lastEditedById: t.privateState.lastEditedById,
              lastEditedAt: t.privateState.lastEditedAt,
              teamChat: [...t.privateState.teamChat],
              lastRun: t.privateState.lastRun || null,
            },
          }
        : {}),
    };
  }

  return {
    id: match.id,
    title: match.title,
    format: match.format,
    teamSize: match.teamSize,
    scoringType: match.scoringType,
    problemId: revealed ? match.problemId : '',
    problem: revealed
      ? {
          id: problem.id,
          title: problem.title,
          difficulty: problem.difficulty,
          category: problem.category,
          timeLimitSeconds: problem.timeLimitSeconds,
          scoringRule: problem.scoringRule,
          description: problem.description,
          constraints: [...problem.constraints],
          examples: [...problem.examples],
          entryPoint: problem.entryPoint,
          starterCode: { ...problem.starterCode },
          visibleTests: problem.testCases.filter((tc) => !tc.hidden),
          totalTestsCount: problem.testCases.length,
          hiddenTestsCount: problem.testCases.filter((tc) => tc.hidden).length,
          revealed: true,
        }
      : {
          // Withheld until the match starts: only generic facts about the match are shared.
          id: 'hidden',
          title: '',
          difficulty: problem.difficulty,
          category: '',
          timeLimitSeconds: problem.timeLimitSeconds,
          scoringRule: '',
          description: '',
          constraints: [],
          examples: [],
          entryPoint: '',
          starterCode: { javascript: '', typescript: '', python: '' },
          visibleTests: [],
          totalTestsCount: problem.testCases.length,
          hiddenTestsCount: problem.testCases.filter((tc) => tc.hidden).length,
          revealed: false,
        },
    allowedLanguages: [...match.allowedLanguages],
    durationSeconds: match.durationSeconds,
    status: match.status,
    createdBy: match.createdBy,
    createdByName: match.createdByName,
    createdAt: match.createdAt,
    countdownEndsAtMs: match.countdownEndsAtMs,
    startedAtMs: match.startedAtMs,
    endsAtMs: match.endsAtMs,
    endedAtMs: match.endedAtMs,
    winnerTeamId: match.winnerTeamId,
    winReason: match.winReason,
    participants: match.participants.map((p) => ({ ...p })),
    teams,
    submissions: match.submissions.map((s) => ({ ...s })),
    serverNowMs: Date.now(),
  };
}

function recordMatchHistory(match: InternalArenaMatch) {
  if (store.history.some((h) => h.id === `hist-match-${match.id}`)) return;
  const winnerTeam = match.winnerTeamId ? match.teams[match.winnerTeamId] : null;
  const winnerNames = winnerTeam
    ? winnerTeam.memberIds.map((id) => match.participants.find((p) => p.userId === id)?.name || id)
    : [];
  store.history.unshift({
    id: `hist-match-${match.id}`,
    kind: 'duel',
    title: `${match.format} · ${match.title}`,
    outcome: match.winReason || (match.status === 'forfeited' ? 'Ended by forfeit' : 'Completed'),
    winnerNames,
    participantIds: match.participants.map((p) => p.userId),
    xpAwarded: match.winnerTeamId ? 75 : 25,
    completedAt: new Date().toISOString(),
  });
  store.history = store.history.slice(0, 120);
}

function settleMatchOnTimeout(match: InternalArenaMatch, now: number, cause: 'timeout' | 'all_passed' = 'timeout') {
  const endedBy = cause === 'timeout' ? 'Time expired' : 'All teams passed every test';
  const teamList = Object.values(match.teams);
  // Sort by highest bestScore, then earliest lastSubmissionAtMs
  const scoredTeams = [...teamList].sort((a, b) => {
    if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
    if (a.lastSubmissionAtMs && b.lastSubmissionAtMs) return a.lastSubmissionAtMs - b.lastSubmissionAtMs;
    if (a.lastSubmissionAtMs) return -1;
    if (b.lastSubmissionAtMs) return 1;
    return 0;
  });

  const top = scoredTeams[0];
  const second = scoredTeams[1];
  match.status = 'completed';
  match.endedAtMs = now;

  if (!top || top.bestScore <= 0) {
    match.winnerTeamId = null;
    match.winReason = `${endedBy} with no passing test submissions (Draw).`;
  } else if (
    second &&
    second.bestScore === top.bestScore &&
    second.lastSubmissionAtMs === top.lastSubmissionAtMs
  ) {
    match.winnerTeamId = null;
    match.winReason = `${endedBy} — exact tie at ${top.bestScore} points (Draw).`;
  } else {
    match.winnerTeamId = top.teamId;
    match.winReason =
      second && second.bestScore === top.bestScore
        ? `${top.label} won on faster tie-breaker timestamp at ${top.bestScore} pts.`
        : cause === 'timeout'
          ? `${top.label} won on time with ${top.bestScore} pts (${top.passedCount}/${top.totalCount} tests passed).`
          : `${top.label} won with the higher score of ${top.bestScore} pts (${top.passedCount}/${top.totalCount} tests passed).`;
  }
  recordMatchHistory(match);
}

// Team editors start empty so the starter code (function signature) can't give the problem away before the match starts.
function seedStarterCode(match: InternalArenaMatch) {
  const problem = getProblemById(match.problemId);
  for (const team of Object.values(match.teams)) {
    for (const lang of ['javascript', 'typescript', 'python'] as ArenaLanguage[]) {
      if (!String(team.privateState.codeByLanguage[lang] || '').trim()) {
        team.privateState.codeByLanguage[lang] = problem.starterCode[lang] || '';
      }
    }
  }
}

// Re-evaluated cleanly by server timer & before reads/mutations
export function checkArenaTimers(): string[] {
  const now = Date.now();
  const changedIds: string[] = [];

  for (const m of store.matches) {
    if (m.status === 'countdown' && m.countdownEndsAtMs && now >= m.countdownEndsAtMs) {
      m.status = 'active';
      m.startedAtMs = now;
      m.endsAtMs = now + m.durationSeconds * 1000;
      seedStarterCode(m);
      changedIds.push(m.id);
    } else if (m.status === 'active' && m.endsAtMs && now >= m.endsAtMs) {
      settleMatchOnTimeout(m, now);
      changedIds.push(m.id);
    }
  }

  if (changedIds.length > 0) {
    saveStore();
    for (const id of changedIds) emit({ type: 'arena:match_updated', matchId: id });
    emit({ type: 'arena:lobby_sync' });
  }
  return changedIds;
}

export function listArenaMatches(viewerUserId?: string): ArenaMatchView[] {
  checkArenaTimers();
  return store.matches.map((m) => sanitizeMatchForUser(m, viewerUserId));
}

export function getArenaMatchForUser(matchId: string, viewerUserId?: string): ArenaMatchView | null {
  checkArenaTimers();
  const found = store.matches.find((m) => m.id === matchId);
  return found ? sanitizeMatchForUser(found, viewerUserId) : null;
}

export function createArenaMatch(
  actor: { userId: string; userName: string },
  input: {
    title?: string;
    format?: ArenaMatchFormat;
    teamSize?: number;
    scoringType?: ArenaScoringType;
    problemId?: string;
    difficulty?: string;
    allowedLanguages?: ArenaLanguage[];
    durationSeconds?: number;
  }
): ArenaMatchView | { error: string; status: number } {
  const format: ArenaMatchFormat = input.format === '2v2' ? '2v2' : '1v1';
  const teamSize = format === '2v2' ? Math.max(2, Math.min(4, Number(input.teamSize) || 2)) : 1;
  const scoringType: ArenaScoringType = input.scoringType === 'scored' ? 'scored' : 'speed';
  const requestedProblemId = String(input.problemId || '').trim();
  // Duels use AI-generated problems only: the client generates one first and passes its id.
  if (!requestedProblemId || requestedProblemId === 'random') {
    return { error: 'Generate an AI challenge first. Duels no longer use the built-in question bank.', status: 400 };
  }
  const problem = findProblem(requestedProblemId);
  if (!problem) return { error: 'That problem no longer exists. Pick another one or generate a new problem.', status: 400 };
  const allowedLanguages: ArenaLanguage[] =
    Array.isArray(input.allowedLanguages) && input.allowedLanguages.length > 0
      ? input.allowedLanguages.filter((l): l is ArenaLanguage => ['javascript', 'typescript', 'python'].includes(l))
      : ['javascript', 'typescript', 'python'];
  if (allowedLanguages.length === 0) allowedLanguages.push('javascript');

  const durationSeconds = Math.max(120, Math.min(3600, Number(input.durationSeconds) || problem.timeLimitSeconds || 420));
  const defaultLang = allowedLanguages[0];
  const makeTeam = (teamId: string, label: string, firstMember?: string): InternalArenaTeam => ({
    teamId,
    label,
    memberIds: firstMember ? [firstMember] : [],
    bestScore: 0,
    passedCount: 0,
    totalCount: problem.testCases.length,
    allPassed: false,
    submitted: false,
    lastSubmissionAtMs: null,
    forfeited: false,
    privateState: {
      activeLanguage: defaultLang,
      codeByLanguage: { javascript: '', typescript: '', python: '' },
      teamChat: [],
      lastRun: null,
    },
  });

  const match: InternalArenaMatch = {
    id: uid('match'),
    // Default title must not name the problem: the statement stays hidden until the match starts.
    title: String(input.title || '').trim().slice(0, 80) || `${format} ${scoringType === 'speed' ? 'Speed Duel' : 'Scored Duel'} · ${problem.difficulty}`,
    format,
    teamSize,
    scoringType,
    problemId: problem.id,
    allowedLanguages,
    durationSeconds,
    status: 'waiting',
    createdBy: actor.userId,
    createdByName: actor.userName,
    createdAt: new Date().toISOString(),
    countdownEndsAtMs: null,
    startedAtMs: null,
    endsAtMs: null,
    endedAtMs: null,
    winnerTeamId: null,
    participants: [
      {
        userId: actor.userId,
        name: actor.userName,
        teamId: 'team-a',
        ready: false,
        // Not "connected" until their WebSocket actually subscribes to the match (see setArenaPresence).
        connected: false,
        disconnectedAtMs: Date.now(),
        lastSeenAt: new Date().toISOString(),
        forfeited: false,
      },
    ],
    teams: {
      'team-a': makeTeam('team-a', format === '1v1' ? actor.userName : 'Team Alpha', actor.userId),
      'team-b': makeTeam('team-b', format === '1v1' ? 'Challenger' : 'Team Beta'),
    },
    submissions: [],
  };

  store.matches = [match, ...store.matches].slice(0, 60);
  saveStore();
  emit({ type: 'arena:lobby_sync' });
  return sanitizeMatchForUser(match, actor.userId);
}

function updateReadyPhase(match: InternalArenaMatch) {
  const teamA = match.teams['team-a'];
  const teamB = match.teams['team-b'];
  const filled = teamA.memberIds.length >= match.teamSize && teamB.memberIds.length >= match.teamSize;
  if (!filled) {
    if (match.status === 'ready_check' || match.status === 'countdown') {
      match.status = 'waiting';
      match.countdownEndsAtMs = null;
    }
    return;
  }
  const allReady = match.participants.length >= match.teamSize * 2 && match.participants.every((p) => p.ready);
  if (allReady) {
    match.status = 'countdown';
    match.countdownEndsAtMs = Date.now() + 3000;
  } else {
    match.status = 'ready_check';
    match.countdownEndsAtMs = null;
  }
}

export function joinArenaMatch(
  matchId: string,
  actor: { userId: string; userName: string },
  preferredTeamId?: 'team-a' | 'team-b'
): { match: ArenaMatchView } | { error: string; status: number } {
  checkArenaTimers();
  const match = store.matches.find((m) => m.id === matchId);
  if (!match) return { error: 'Match not found.', status: 404 };

  const existing = match.participants.find((p) => p.userId === actor.userId);
  if (existing) {
    existing.lastSeenAt = new Date().toISOString();
    saveStore();
    emit({ type: 'arena:match_updated', matchId });
    return { match: sanitizeMatchForUser(match, actor.userId) };
  }

  if (match.status !== 'waiting' && match.status !== 'ready_check') {
    return { error: 'Match has already started or ended.', status: 409 };
  }

  const teamA = match.teams['team-a'];
  const teamB = match.teams['team-b'];
  let targetTeamId: 'team-a' | 'team-b' | null = null;

  if (preferredTeamId && match.teams[preferredTeamId].memberIds.length < match.teamSize) {
    targetTeamId = preferredTeamId;
  } else if (teamB.memberIds.length < match.teamSize && teamB.memberIds.length <= teamA.memberIds.length) {
    targetTeamId = 'team-b';
  } else if (teamA.memberIds.length < match.teamSize) {
    targetTeamId = 'team-a';
  } else if (teamB.memberIds.length < match.teamSize) {
    targetTeamId = 'team-b';
  }

  if (!targetTeamId) {
    return { error: 'This match is already full.', status: 409 };
  }

  match.teams[targetTeamId].memberIds.push(actor.userId);
  if (match.format === '1v1' && targetTeamId === 'team-b') {
    match.teams['team-b'].label = actor.userName;
  }
  match.participants.push({
    userId: actor.userId,
    name: actor.userName,
    teamId: targetTeamId,
    ready: false,
    connected: watchers.has(watchKey(actor.userId, matchId)),
    disconnectedAtMs: watchers.has(watchKey(actor.userId, matchId)) ? null : Date.now(),
    lastSeenAt: new Date().toISOString(),
    forfeited: false,
  });

  updateReadyPhase(match);
  saveStore();
  emit({ type: 'arena:match_updated', matchId });
  emit({ type: 'arena:lobby_sync' });
  return { match: sanitizeMatchForUser(match, actor.userId) };
}

export function setArenaParticipantReady(
  matchId: string,
  userId: string,
  ready?: boolean
): { match: ArenaMatchView } | { error: string; status: number } {
  checkArenaTimers();
  const match = store.matches.find((m) => m.id === matchId);
  if (!match) return { error: 'Match not found.', status: 404 };
  if (match.status !== 'waiting' && match.status !== 'ready_check' && match.status !== 'countdown') {
    return { error: 'Ready status can only change before the match starts.', status: 409 };
  }
  const participant = match.participants.find((p) => p.userId === userId);
  if (!participant) return { error: 'Join the match before marking ready.', status: 403 };

  participant.ready = typeof ready === 'boolean' ? ready : !participant.ready;
  participant.lastSeenAt = new Date().toISOString();
  updateReadyPhase(match);
  saveStore();
  emit({ type: 'arena:match_updated', matchId });
  emit({ type: 'arena:lobby_sync' });
  return { match: sanitizeMatchForUser(match, userId) };
}

export function setArenaPresence(userId: string, matchId: string | null, connected: boolean) {
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  let changed = false;
  if (matchId) {
    if (connected) watchers.add(watchKey(userId, matchId));
    else watchers.delete(watchKey(userId, matchId));
  }
  for (const m of store.matches) {
    if (matchId && m.id !== matchId) continue;
    const p = m.participants.find((x) => x.userId === userId);
    if (!p) continue;
    if (p.connected !== connected) {
      p.connected = connected;
      p.disconnectedAtMs = connected ? null : nowMs;
      p.lastSeenAt = nowIso;
      changed = true;
      emit({ type: 'arena:match_updated', matchId: m.id });
    }
  }
  if (changed) saveStore();
}

export function updateTeamWorkspace(
  matchId: string,
  actor: { userId: string; userName: string },
  patch: { language?: ArenaLanguage; code?: string }
): { ok: true } | { error: string; status: number } {
  checkArenaTimers();
  const match = store.matches.find((m) => m.id === matchId);
  if (!match) return { error: 'Match not found.', status: 404 };
  if (match.status !== 'active' && match.status !== 'countdown' && match.status !== 'ready_check' && match.status !== 'waiting') {
    return { error: 'Match has ended.', status: 409 };
  }
  const participant = match.participants.find((p) => p.userId === actor.userId);
  if (!participant) return { error: 'Only participants may edit their team workspace.', status: 403 };
  const team = match.teams[participant.teamId];
  if (!team) return { error: 'Team not found.', status: 404 };

  if (patch.language && match.allowedLanguages.includes(patch.language)) {
    team.privateState.activeLanguage = patch.language;
  }
  if (typeof patch.code === 'string') {
    const lang = patch.language && match.allowedLanguages.includes(patch.language) ? patch.language : team.privateState.activeLanguage;
    team.privateState.codeByLanguage[lang] = patch.code.slice(0, 64 * 1024);
    team.privateState.lastEditedBy = actor.userName;
    team.privateState.lastEditedById = actor.userId;
    team.privateState.lastEditedAt = new Date().toISOString();
  }
  saveStore();
  emit({ type: 'arena:team_workspace', matchId, teamId: team.teamId });
  return { ok: true };
}

export function addTeamChatMessage(
  matchId: string,
  actor: { userId: string; userName: string },
  text: string
): { ok: true } | { error: string; status: number } {
  const match = store.matches.find((m) => m.id === matchId);
  if (!match) return { error: 'Match not found.', status: 404 };
  const participant = match.participants.find((p) => p.userId === actor.userId);
  if (!participant) return { error: 'Only teammates can chat in this team channel.', status: 403 };
  const team = match.teams[participant.teamId];
  const clean = String(text || '').trim().slice(0, 1000);
  if (!clean) return { error: 'Empty message.', status: 400 };

  team.privateState.teamChat = [
    ...team.privateState.teamChat,
    { id: uid('tc'), senderId: actor.userId, senderName: actor.userName, text: clean, createdAt: new Date().toISOString() },
  ].slice(-80);
  saveStore();
  emit({ type: 'arena:team_workspace', matchId, teamId: team.teamId });
  return { ok: true };
}

export async function runMatchSampleTests(
  matchId: string,
  actor: { userId: string; userName: string },
  input: { language: ArenaLanguage; code: string }
): Promise<{ result: SandboxExecutionResult; match: ArenaMatchView } | { error: string; status: number }> {
  checkArenaTimers();
  const match = store.matches.find((m) => m.id === matchId);
  if (!match) return { error: 'Match not found.', status: 404 };
  if (match.status !== 'active') return { error: 'Code tests can only run while the match is active.', status: 409 };
  const participant = match.participants.find((p) => p.userId === actor.userId);
  if (!participant) return { error: 'You are not a participant in this match.', status: 403 };
  if (!match.allowedLanguages.includes(input.language)) return { error: 'Language is not enabled for this match.', status: 400 };

  touchParticipant(match, actor.userId);
  const team = match.teams[participant.teamId];
  const problem = getProblemById(match.problemId);
  const visibleTests = problem.testCases.filter((t) => !t.hidden);
  team.privateState.activeLanguage = input.language;
  team.privateState.codeByLanguage[input.language] = String(input.code || '').slice(0, 64 * 1024);

  const result = await runIsolatedTests({
    language: input.language,
    code: input.code,
    entryPoint: problem.entryPoint,
    tests: visibleTests,
  });

  team.privateState.lastRun = result;
  saveStore();
  emit({ type: 'arena:team_workspace', matchId, teamId: team.teamId });
  return { result, match: sanitizeMatchForUser(match, actor.userId) };
}

// Per-match mutex queue ensures simultaneous submissions compare server arrival timestamps cleanly
const submissionQueues = new Map<string, Promise<unknown>>();

export function submitMatchSolution(
  matchId: string,
  actor: { userId: string; userName: string },
  input: { language: ArenaLanguage; code: string }
): Promise<{ submission: ArenaTeamSubmission; result: SandboxExecutionResult; match: ArenaMatchView } | { error: string; status: number }> {
  const submittedAtMs = Date.now();
  const prev = submissionQueues.get(matchId) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      checkArenaTimers();
      const match = store.matches.find((m) => m.id === matchId);
      if (!match) return { error: 'Match not found.', status: 404 };
      if (match.status !== 'active') {
        return { error: 'Submissions are closed because the match is no longer active.', status: 409 };
      }
      const participant = match.participants.find((p) => p.userId === actor.userId);
      if (!participant) return { error: 'You are not a participant in this match.', status: 403 };
      if (!match.allowedLanguages.includes(input.language)) {
        return { error: 'Selected language is not permitted in this match.', status: 400 };
      }

      touchParticipant(match, actor.userId);
      const team = match.teams[participant.teamId];
      const problem = getProblemById(match.problemId);
      team.privateState.activeLanguage = input.language;
      team.privateState.codeByLanguage[input.language] = String(input.code || '').slice(0, 64 * 1024);

      const result = await runIsolatedTests({
        language: input.language,
        code: input.code,
        entryPoint: problem.entryPoint,
        tests: problem.testCases,
      });

      // The sandbox run is async: the match may have ended (timer, forfeit, cancel, or another submission) while we waited.
      checkArenaTimers();
      if (match.status !== 'active') {
        return { error: 'The match ended while your solution was being tested, so this submission was not counted.', status: 409 };
      }

      // Calculate score fairly against the server arrival timestamp
      const remainingMs = Math.max(0, (match.endsAtMs || submittedAtMs) - submittedAtMs);
      const durationMs = Math.max(1000, match.durationSeconds * 1000);
      const passRatio = result.totalCount > 0 ? result.passedCount / result.totalCount : 0;
      const computedScore = Math.round(passRatio * 800) + (result.allPassed ? Math.round((remainingMs / durationMs) * 200) : 0);

      const sub: ArenaTeamSubmission = {
        id: uid('asub'),
        teamId: team.teamId,
        submittedByUserId: actor.userId,
        submittedByName: actor.userName,
        language: input.language,
        passedCount: result.passedCount,
        totalCount: result.totalCount,
        hiddenPassed: result.hiddenPassed,
        hiddenTotal: result.hiddenTotal,
        score: computedScore,
        runtimeMs: result.runtimeMs,
        allPassed: result.allPassed,
        error: result.error,
        submittedAtIso: new Date(submittedAtMs).toISOString(),
        submittedAtMs,
      };

      match.submissions = [sub, ...match.submissions].slice(0, 40);
      team.submitted = true;
      team.privateState.lastRun = result;

      const improved =
        computedScore > team.bestScore ||
        (computedScore === team.bestScore && (team.lastSubmissionAtMs === null || submittedAtMs < team.lastSubmissionAtMs));
      if (improved || team.lastSubmissionAtMs === null) {
        team.bestScore = Math.max(team.bestScore, computedScore);
        team.passedCount = Math.max(team.passedCount, result.passedCount);
        team.allPassed = team.allPassed || result.allPassed;
        team.lastSubmissionAtMs = submittedAtMs;
      }

      // Re-check status in case another queued submission just ended the match
      if (match.status === 'active') {
        if (match.scoringType === 'speed' && result.allPassed) {
          match.status = 'completed';
          match.endedAtMs = submittedAtMs;
          match.winnerTeamId = team.teamId;
          match.winReason = `${team.label} won Speed Duel (${result.passedCount}/${result.totalCount} tests passed in ${result.runtimeMs}ms).`;
          recordMatchHistory(match);
        } else if (match.scoringType === 'scored') {
          const allTeamsAllPassed = Object.values(match.teams).every((t) => t.memberIds.length > 0 && t.allPassed);
          if (allTeamsAllPassed) {
            settleMatchOnTimeout(match, submittedAtMs, 'all_passed');
          }
        }
      }

      saveStore();
      emit({ type: 'arena:match_updated', matchId });
      emit({ type: 'arena:lobby_sync' });
      return { submission: sub, result, match: sanitizeMatchForUser(match, actor.userId) };
    });

  submissionQueues.set(matchId, next);
  return next as Promise<any>;
}

export function forfeitArenaMatch(
  matchId: string,
  actor: { userId: string; userName: string }
): { match: ArenaMatchView } | { error: string; status: number } {
  checkArenaTimers();
  const match = store.matches.find((m) => m.id === matchId);
  if (!match) return { error: 'Match not found.', status: 404 };
  if (match.status !== 'active' && match.status !== 'countdown') {
    return { error: 'You can only forfeit an active or starting match.', status: 409 };
  }
  const participant = match.participants.find((p) => p.userId === actor.userId);
  if (!participant) return { error: 'Not a participant in this match.', status: 403 };

  participant.forfeited = true;
  const forfeitingTeam = match.teams[participant.teamId];
  forfeitingTeam.forfeited = true;

  const opponentTeam = Object.values(match.teams).find((t) => t.teamId !== participant.teamId);
  match.status = 'forfeited';
  match.endedAtMs = Date.now();
  match.winnerTeamId = opponentTeam ? opponentTeam.teamId : null;
  match.winReason = `${actor.userName} (${forfeitingTeam.label}) forfeited. ${opponentTeam ? opponentTeam.label : 'Opponent'} declared winner.`;
  recordMatchHistory(match);

  saveStore();
  emit({ type: 'arena:match_updated', matchId });
  emit({ type: 'arena:lobby_sync' });
  return { match: sanitizeMatchForUser(match, actor.userId) };
}

export function claimDisconnectForfeit(
  matchId: string,
  actor: { userId: string }
): { match: ArenaMatchView } | { error: string; status: number } {
  checkArenaTimers();
  const match = store.matches.find((m) => m.id === matchId);
  if (!match) return { error: 'Match not found.', status: 404 };
  if (match.status !== 'active') return { error: 'Match is not active.', status: 409 };
  const caller = match.participants.find((p) => p.userId === actor.userId);
  if (!caller) return { error: 'Not a participant.', status: 403 };

  const opponentTeam = Object.values(match.teams).find((t) => t.teamId !== caller.teamId);
  if (!opponentTeam) return { error: 'Opponent team not found.', status: 404 };

  const now = Date.now();
  const opponentParticipants = match.participants.filter((p) => p.teamId === opponentTeam.teamId);
  // Absent = no live socket AND no REST activity for the whole grace window. Players who never opened a socket count too.
  const allDisconnectedPastGrace =
    opponentParticipants.length > 0 && opponentParticipants.every((p) => now - absentSinceMs(p) >= RECONNECT_GRACE_MS);

  if (!allDisconnectedPastGrace) {
    return {
      error: `Opponent still has a ${Math.round(RECONNECT_GRACE_MS / 1000)}s reconnection window before forfeit can be claimed.`,
      status: 409,
    };
  }

  opponentTeam.forfeited = true;
  match.status = 'forfeited';
  match.endedAtMs = now;
  match.winnerTeamId = caller.teamId;
  match.winReason = `${opponentTeam.label} disconnected and did not reconnect within ${Math.round(RECONNECT_GRACE_MS / 1000)}s.`;
  recordMatchHistory(match);
  saveStore();
  emit({ type: 'arena:match_updated', matchId });
  emit({ type: 'arena:lobby_sync' });
  return { match: sanitizeMatchForUser(match, actor.userId) };
}

export function cancelArenaMatch(
  matchId: string,
  actor: { userId: string; isAdmin: boolean }
): { match: ArenaMatchView } | { error: string; status: number } {
  const match = store.matches.find((m) => m.id === matchId);
  if (!match) return { error: 'Match not found.', status: 404 };
  const isCreator = match.createdBy === actor.userId;
  if (!isCreator && !actor.isAdmin) {
    return { error: 'Only the match creator or an admin can cancel this match.', status: 403 };
  }
  // A finished match is final for everyone, admins included: cancelling would erase the recorded winner.
  if (match.status === 'completed' || match.status === 'forfeited' || match.status === 'cancelled') {
    return { error: 'This match has already finished and can no longer be cancelled.', status: 409 };
  }
  if (!actor.isAdmin && match.status === 'active') {
    return { error: 'Use Forfeit once a match is active.', status: 409 };
  }
  match.status = 'cancelled';
  match.endedAtMs = Date.now();
  match.winnerTeamId = null;
  match.winReason = actor.isAdmin ? 'Match cancelled by administrator.' : 'Match cancelled before start.';
  saveStore();
  emit({ type: 'arena:match_updated', matchId });
  emit({ type: 'arena:lobby_sync' });
  return { match: sanitizeMatchForUser(match, actor.userId) };
}

// ============================================================================
// CHALLENGES (DAILY & WEEKLY), TEAM BUILD-OFFS, POTW, BOUNTIES & SEASONS
// ============================================================================
/** Admin-only API callers may update competition metadata/status without replacing participant data. */
export function updateArenaCompetition(kind: 'challenge' | 'bounty' | 'buildoff', id: string, patch: Record<string, unknown>) {
  const item: any = kind === 'challenge' ? store.challenges.find((x) => x.id === id)
    : kind === 'bounty' ? store.bounties.find((x) => x.id === id)
    : store.buildOffs.find((x) => x.id === id);
  if (!item) return { error: 'Competition not found.', status: 404 } as const;
  const textFields = kind === 'challenge'
    ? ['title', 'category', 'deadline', 'description']
    : kind === 'bounty' ? ['title', 'category', 'description'] : ['title', 'theme', 'description', 'deadline'];
  for (const key of textFields) {
    if (patch[key] !== undefined) {
      const value = String(patch[key]).trim();
      if (!value || value.length > (key === 'description' ? 10000 : 180)) return { error: `Invalid ${key}.`, status: 400 } as const;
      item[key] = value;
    }
  }
  for (const dateField of ['startDate', 'deadline']) {
    if (patch[dateField] === undefined) continue;
    const value = String(patch[dateField]);
    if (value && !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value)) return { error: `Invalid ${dateField}.`, status: 400 } as const;
    item[dateField] = value || undefined;
  }
  if (patch.xpReward !== undefined) {
    const xp = Number(patch.xpReward);
    if (!Number.isInteger(xp) || xp < 0 || xp > 10000) return { error: 'Reward must be a whole number between 0 and 10000.', status: 400 } as const;
    item.xpReward = xp;
  }
  if (kind === 'challenge' && patch.cadence !== undefined) {
    if (!['daily', 'weekly'].includes(String(patch.cadence))) return { error: 'Invalid challenge cadence.', status: 400 } as const;
    item.cadence = patch.cadence;
  }
  if (kind === 'bounty' && patch.status !== undefined) {
    if (!['Open', 'Claimed', 'In Review', 'Completed'].includes(String(patch.status))) return { error: 'Invalid bounty status.', status: 400 } as const;
    item.status = patch.status;
  }
  if (kind === 'buildoff' && patch.status !== undefined) {
    if (!['Open', 'Judging', 'Completed'].includes(String(patch.status))) return { error: 'Invalid Build-Off status.', status: 400 } as const;
    item.status = patch.status;
  }
  if (kind === 'challenge' && patch.status !== undefined) {
    if (!['Open', 'Closed'].includes(String(patch.status))) return { error: 'Invalid challenge status.', status: 400 } as const;
    item.status = patch.status;
  }
  saveStore();
  emit({ type: 'arena:competitions_sync' });
  return { item } as const;
}

export function deleteArenaCompetition(kind: 'challenge' | 'bounty' | 'buildoff', id: string) {
  const list: any[] = kind === 'challenge' ? store.challenges : kind === 'bounty' ? store.bounties : store.buildOffs;
  const index = list.findIndex((x) => x.id === id);
  if (index < 0) return { error: 'Competition not found.', status: 404 } as const;
  if ((list[index].submissions?.length || list[index].entries?.length || 0) > 0) {
    return { error: 'This competition has participation records. Close it instead to preserve submissions and judging history.', status: 409 } as const;
  }
  list.splice(index, 1);
  saveStore();
  emit({ type: 'arena:competitions_sync' });
  return { ok: true } as const;
}

export function createArenaChallenge(
  actor: { userId: string; userName: string; isAdmin: boolean },
  input: {
    cadence: 'daily' | 'weekly';
    kind: 'code' | 'build';
    title: string;
    category: string;
    difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
    deadline: string;
    startDate?: string;
    xpReward: number;
    problemId?: string;
    description: string;
    objectives: string[];
  }
): ArenaChallengeItem {
  const item: ArenaChallengeItem = {
    id: uid('ac'),
    cadence: input.cadence === 'daily' ? 'daily' : 'weekly',
    status: 'Open',
    kind: input.kind === 'code' ? 'code' : 'build',
    title: String(input.title || '').trim(),
    category: String(input.category || 'Algorithms').trim(),
    difficulty: (['Beginner', 'Intermediate', 'Advanced'].includes(input.difficulty) ? input.difficulty : 'Beginner') as any,
    deadline: String(input.deadline || (input.cadence === 'daily' ? 'Resets Daily' : 'Sunday 23:59')).trim(),
    startDate: input.startDate || undefined,
    xpReward: Math.max(15, Math.min(300, Number(input.xpReward) || 50)),
    problemId: input.kind === 'code' ? getProblemById(String(input.problemId || '')).id : undefined,
    description: String(input.description || '').trim(),
    objectives: Array.isArray(input.objectives) ? input.objectives.filter(Boolean).slice(0, 6) : [],
    submissions: [],
    createdBy: actor.userName,
    createdAt: new Date().toISOString(),
  };
  store.challenges = [item, ...store.challenges];
  saveStore();
  emit({ type: 'arena:competitions_sync' });
  return item;
}

export async function submitArenaChallenge(
  challengeId: string,
  actor: { userId: string; userName: string },
  input: { language?: ArenaLanguage; code?: string; repoUrl?: string; explanation?: string }
): Promise<{ challenge: ArenaChallengeItem; execution?: SandboxExecutionResult } | { error: string; status: number }> {
  const ch = store.challenges.find((c) => c.id === challengeId);
  if (!ch) return { error: 'Challenge not found.', status: 404 };
  if (ch.status === 'Closed') return { error: 'This challenge is closed.', status: 409 };
  if (ch.startDate && Date.parse(ch.startDate) > Date.now()) return { error: 'This challenge has not started yet.', status: 409 };

  let execution: SandboxExecutionResult | undefined;
  let status: ArenaChallengeSubmission['status'] = 'Submitted';

  if (ch.kind === 'code' && ch.problemId) {
    const problem = getProblemById(ch.problemId);
    const lang: ArenaLanguage = ['javascript', 'typescript', 'python'].includes(String(input.language))
      ? (input.language as ArenaLanguage)
      : 'javascript';
    execution = await runIsolatedTests({
      language: lang,
      code: String(input.code || ''),
      entryPoint: problem.entryPoint,
      tests: problem.testCases,
    });
    status = execution.allPassed ? 'Verified' : 'Needs Revision';
  }

  const sub: ArenaChallengeSubmission = {
    id: uid('csub'),
    userId: actor.userId,
    userName: actor.userName,
    language: input.language,
    passedCount: execution?.passedCount,
    totalCount: execution?.totalCount,
    allPassed: execution?.allPassed,
    score: execution ? Math.round((execution.passedCount / Math.max(1, execution.totalCount)) * 100) : undefined,
    repoUrl: String(input.repoUrl || '').trim() || undefined,
    explanation: String(input.explanation || '').trim() || (execution?.allPassed ? 'Passed all isolated test cases.' : 'Submitted attempt.'),
    submittedAt: new Date().toISOString(),
    status,
  };

  ch.submissions = [sub, ...ch.submissions.filter((s) => s.userId !== actor.userId)];

  if (status === 'Verified') {
    store.history.unshift({
      id: `hist-ch-${ch.id}-${actor.userId}`,
      kind: 'challenge',
      title: ch.title,
      outcome: `${actor.userName} verified solution (${execution?.passedCount}/${execution?.totalCount} tests)`,
      winnerNames: [actor.userName],
      participantIds: [actor.userId],
      xpAwarded: ch.xpReward,
      completedAt: new Date().toISOString(),
    });
    store.history = store.history.slice(0, 120);
  }

  saveStore();
  emit({ type: 'arena:competitions_sync' });
  return { challenge: ch, execution };
}

export function judgeArenaChallengeSubmission(
  challengeId: string,
  submissionId: string,
  input: { status: 'Verified' | 'Reviewed' | 'Needs Revision'; judgeNote?: string }
): { challenge: ArenaChallengeItem } | { error: string; status: number } {
  const ch = store.challenges.find((c) => c.id === challengeId);
  if (!ch) return { error: 'Challenge not found.', status: 404 };
  const sub = ch.submissions.find((s) => s.id === submissionId);
  if (!sub) return { error: 'Submission not found.', status: 404 };
  sub.status = input.status;
  sub.judgeNote = String(input.judgeNote || '').trim() || undefined;
  saveStore();
  emit({ type: 'arena:competitions_sync' });
  return { challenge: ch };
}

export function createTeamBuildOff(input: {
  title: string;
  theme: string;
  description: string;
  teamSizeMin?: number;
  teamSizeMax?: number;
  deadline: string;
  startDate?: string;
  xpReward?: number;
}): TeamBuildOff {
  const item: TeamBuildOff = {
    id: uid('bo'),
    title: String(input.title || '').trim(),
    theme: String(input.theme || 'Full-Stack').trim(),
    description: String(input.description || '').trim(),
    teamSizeMin: Math.max(2, Number(input.teamSizeMin) || 2),
    teamSizeMax: Math.max(2, Math.min(6, Number(input.teamSizeMax) || 3)),
    deadline: String(input.deadline || '').trim() || 'Upcoming Sunday',
    startDate: input.startDate || undefined,
    xpReward: Math.max(50, Math.min(400, Number(input.xpReward) || 150)),
    status: 'Open',
    entries: [],
    winnerEntryId: null,
    createdAt: new Date().toISOString(),
  };
  store.buildOffs = [item, ...store.buildOffs];
  saveStore();
  emit({ type: 'arena:competitions_sync' });
  return item;
}

export function registerOrUpdateBuildOffTeam(
  buildOffId: string,
  actor: { userId: string; userName: string },
  input: { teamName?: string; joinEntryId?: string; repoUrl?: string; demoUrl?: string; summary?: string }
): { buildOff: TeamBuildOff } | { error: string; status: number } {
  const bo = store.buildOffs.find((b) => b.id === buildOffId);
  if (!bo) return { error: 'Team Build-Off not found.', status: 404 };
  if (bo.status === 'Completed') return { error: 'This Build-Off has concluded.', status: 409 };

  if (input.joinEntryId) {
    const entry = bo.entries.find((e) => e.id === input.joinEntryId);
    if (!entry) return { error: 'Team entry not found.', status: 404 };
    if (!entry.memberIds.includes(actor.userId)) {
      if (entry.memberIds.length >= bo.teamSizeMax) {
        return { error: `That team already has ${bo.teamSizeMax} members.`, status: 409 };
      }
      entry.memberIds.push(actor.userId);
      entry.memberNames.push(actor.userName);
    }
    if (typeof input.repoUrl === 'string' && input.repoUrl.trim()) entry.repoUrl = input.repoUrl.trim();
    if (typeof input.demoUrl === 'string' && input.demoUrl.trim()) entry.demoUrl = input.demoUrl.trim();
    if (typeof input.summary === 'string' && input.summary.trim()) entry.summary = input.summary.trim();
    entry.submittedAt = new Date().toISOString();
    saveStore();
    emit({ type: 'arena:competitions_sync' });
    return { buildOff: bo };
  }

  const teamName = String(input.teamName || '').trim();
  if (!teamName) return { error: 'Team name is required.', status: 400 };
  const entry = {
    id: uid('boe'),
    teamName,
    memberIds: [actor.userId],
    memberNames: [actor.userName],
    repoUrl: String(input.repoUrl || '').trim(),
    demoUrl: String(input.demoUrl || '').trim(),
    summary: String(input.summary || '').trim(),
    submittedAt: new Date().toISOString(),
  };
  bo.entries = [entry, ...bo.entries];
  saveStore();
  emit({ type: 'arena:competitions_sync' });
  return { buildOff: bo };
}

export function judgeBuildOff(
  buildOffId: string,
  input: { entryId: string; judgeScore: number; judgeFeedback: string; declareWinner?: boolean }
): { buildOff: TeamBuildOff } | { error: string; status: number } {
  const bo = store.buildOffs.find((b) => b.id === buildOffId);
  if (!bo) return { error: 'Build-Off not found.', status: 404 };
  const entry = bo.entries.find((e) => e.id === input.entryId);
  if (!entry) return { error: 'Team entry not found.', status: 404 };

  entry.judgeScore = Math.max(0, Math.min(100, Number(input.judgeScore) || 0));
  entry.judgeFeedback = String(input.judgeFeedback || '').trim();

  if (input.declareWinner) {
    bo.entries.forEach((e) => {
      e.isWinner = e.id === entry.id;
    });
    bo.winnerEntryId = entry.id;
    bo.status = 'Completed';
    store.history.unshift({
      id: `hist-bo-${bo.id}`,
      kind: 'buildoff',
      title: bo.title,
      outcome: `${entry.teamName} won with judge score ${entry.judgeScore}/100`,
      winnerNames: [...entry.memberNames],
      participantIds: [...entry.memberIds],
      xpAwarded: bo.xpReward,
      completedAt: new Date().toISOString(),
    });
    store.history = store.history.slice(0, 120);
  } else {
    bo.status = 'Judging';
  }

  saveStore();
  emit({ type: 'arena:competitions_sync' });
  return { buildOff: bo };
}

export function nominateProjectOfTheWeek(
  actor: { userId: string; userName: string },
  input: { title: string; summary: string; repoUrl?: string; demoUrl?: string; technologies?: string[] }
): ProjectOfTheWeekNomination {
  const now = new Date();
  const weekLabel = `Week of ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  const item: ProjectOfTheWeekNomination = {
    id: uid('potw'),
    weekLabel,
    title: String(input.title || '').trim(),
    authorId: actor.userId,
    authorName: actor.userName,
    summary: String(input.summary || '').trim(),
    repoUrl: String(input.repoUrl || '').trim(),
    demoUrl: String(input.demoUrl || '').trim(),
    technologies: Array.isArray(input.technologies) ? input.technologies.filter(Boolean).slice(0, 5) : [],
    voterIds: [],
    isWinner: false,
    createdAt: now.toISOString(),
  };
  store.potwNominations = [item, ...store.potwNominations];
  saveStore();
  emit({ type: 'arena:competitions_sync' });
  return item;
}

export function togglePotwVote(
  nominationId: string,
  userId: string
): { nomination: ProjectOfTheWeekNomination } | { error: string; status: number } {
  const nom = store.potwNominations.find((n) => n.id === nominationId);
  if (!nom) return { error: 'Project nomination not found.', status: 404 };
  if (nom.voterIds.includes(userId)) {
    nom.voterIds = nom.voterIds.filter((v) => v !== userId);
  } else {
    nom.voterIds.push(userId);
  }
  saveStore();
  emit({ type: 'arena:competitions_sync' });
  return { nomination: nom };
}

export function selectPotwWinner(
  nominationId: string,
  judgeNote: string
): { nomination: ProjectOfTheWeekNomination } | { error: string; status: number } {
  const nom = store.potwNominations.find((n) => n.id === nominationId);
  if (!nom) return { error: 'Project nomination not found.', status: 404 };
  nom.isWinner = true;
  nom.judgeNote = String(judgeNote || '').trim() || 'Selected by Community Admin judging panel.';
  store.history.unshift({
    id: `hist-potw-${nom.id}`,
    kind: 'potw',
    title: `Project of the Week: ${nom.title}`,
    outcome: nom.judgeNote,
    winnerNames: [nom.authorName],
    participantIds: [nom.authorId],
    xpAwarded: 150,
    completedAt: new Date().toISOString(),
  });
  store.history = store.history.slice(0, 120);
  saveStore();
  emit({ type: 'arena:competitions_sync' });
  return { nomination: nom };
}

export function createBounty(input: {
  title: string;
  category: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  description: string;
  startDate?: string;
  deadline?: string;
  acceptanceCriteria: string[];
  xpReward: number;
}): BountyItem {
  const item: BountyItem = {
    id: uid('bounty'),
    title: String(input.title || '').trim(),
    category: String(input.category || 'Engineering').trim(),
    difficulty: (['Beginner', 'Intermediate', 'Advanced'].includes(input.difficulty) ? input.difficulty : 'Beginner') as any,
    description: String(input.description || '').trim(),
    startDate: input.startDate || undefined,
    deadline: input.deadline || undefined,
    acceptanceCriteria: Array.isArray(input.acceptanceCriteria) ? input.acceptanceCriteria.filter(Boolean).slice(0, 6) : [],
    xpReward: Math.max(25, Math.min(400, Number(input.xpReward) || 90)),
    status: 'Open',
    submissions: [],
    createdAt: new Date().toISOString(),
  };
  store.bounties = [item, ...store.bounties];
  saveStore();
  emit({ type: 'arena:competitions_sync' });
  return item;
}

export function claimOrReleaseBounty(
  bountyId: string,
  actor: { userId: string; userName: string },
  action: 'claim' | 'release'
): { bounty: BountyItem } | { error: string; status: number } {
  const b = store.bounties.find((x) => x.id === bountyId);
  if (!b) return { error: 'Bounty not found.', status: 404 };
  if (b.status === 'Completed') return { error: 'This bounty is already completed.', status: 409 };

  if (action === 'claim') {
    if (b.claimedById && b.claimedById !== actor.userId) {
      return { error: `Already claimed by ${b.claimedByName}.`, status: 409 };
    }
    b.claimedById = actor.userId;
    b.claimedByName = actor.userName;
    b.status = 'Claimed';
  } else {
    if (b.claimedById !== actor.userId) return { error: 'Only the claimant can release this bounty.', status: 403 };
    b.claimedById = undefined;
    b.claimedByName = undefined;
    b.status = 'Open';
  }
  saveStore();
  emit({ type: 'arena:competitions_sync' });
  return { bounty: b };
}

export function submitBountyProof(
  bountyId: string,
  actor: { userId: string; userName: string },
  input: { repoUrl?: string; notes: string }
): { bounty: BountyItem } | { error: string; status: number } {
  const b = store.bounties.find((x) => x.id === bountyId);
  if (!b) return { error: 'Bounty not found.', status: 404 };
  if (b.status === 'Completed') return { error: 'Bounty is already completed.', status: 409 };
  if (b.claimedById && b.claimedById !== actor.userId) {
    return { error: `Claimed by ${b.claimedByName}.`, status: 409 };
  }
  b.claimedById = actor.userId;
  b.claimedByName = actor.userName;
  b.status = 'In Review';
  b.submissions.unshift({
    id: uid('bsub'),
    claimantId: actor.userId,
    claimantName: actor.userName,
    repoUrl: String(input.repoUrl || '').trim(),
    notes: String(input.notes || '').trim(),
    submittedAt: new Date().toISOString(),
    status: 'Pending Review',
  });
  saveStore();
  emit({ type: 'arena:competitions_sync' });
  return { bounty: b };
}

export function reviewBountySubmission(
  bountyId: string,
  submissionId: string,
  input: { status: 'Approved' | 'Needs Revision'; judgeNote?: string }
): { bounty: BountyItem } | { error: string; status: number } {
  const b = store.bounties.find((x) => x.id === bountyId);
  if (!b) return { error: 'Bounty not found.', status: 404 };
  const sub = b.submissions.find((s) => s.id === submissionId);
  if (!sub) return { error: 'Submission not found.', status: 404 };

  sub.status = input.status;
  sub.judgeNote = String(input.judgeNote || '').trim() || undefined;
  if (input.status === 'Approved') {
    b.status = 'Completed';
    store.history.unshift({
      id: `hist-bounty-${b.id}`,
      kind: 'bounty',
      title: `Bounty: ${b.title}`,
      outcome: `Completed & verified for ${sub.claimantName}`,
      winnerNames: [sub.claimantName],
      participantIds: [sub.claimantId],
      xpAwarded: b.xpReward,
      completedAt: new Date().toISOString(),
    });
    store.history = store.history.slice(0, 120);
  } else {
    b.status = 'Claimed';
  }
  saveStore();
  emit({ type: 'arena:competitions_sync' });
  return { bounty: b };
}

export function upsertSeason(input: { id?: string; name: string; theme: string; startDate: string; endDate: string; status: 'Active' | 'Completed'; prizeSummary: string }): SeasonalCompetition {
  const existing = input.id ? store.seasons.find((s) => s.id === input.id) : null;
  if (existing) {
    Object.assign(existing, {
      name: input.name,
      theme: input.theme,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status,
      prizeSummary: input.prizeSummary,
    });
    saveStore();
    emit({ type: 'arena:competitions_sync' });
    return existing;
  }
  const item: SeasonalCompetition = {
    id: uid('season'),
    name: input.name,
    theme: input.theme,
    startDate: input.startDate,
    endDate: input.endDate,
    status: input.status,
    prizeSummary: input.prizeSummary,
  };
  store.seasons = [item, ...store.seasons];
  saveStore();
  emit({ type: 'arena:competitions_sync' });
  return item;
}

// Compute real seasonal standings strictly from actual persisted matches, challenges, bounties, and build-offs.
export function computeSeasonStandings(): SeasonStandingRow[] {
  const map = new Map<string, SeasonStandingRow>();
  const ensure = (userId: string, userName: string) => {
    if (!map.has(userId)) {
      map.set(userId, {
        userId,
        userName: userName || userId,
        seasonPoints: 0,
        duelWins: 0,
        duelsPlayed: 0,
        challengesSolved: 0,
        bountiesCompleted: 0,
        buildOffPoints: 0,
      });
    }
    return map.get(userId)!;
  };

  for (const m of store.matches) {
    if (m.status !== 'completed' && m.status !== 'forfeited') continue;
    for (const p of m.participants) {
      const row = ensure(p.userId, p.name);
      row.duelsPlayed += 1;
      const won = m.winnerTeamId && p.teamId === m.winnerTeamId;
      if (won) {
        row.duelWins += 1;
        row.seasonPoints += 100;
      } else {
        row.seasonPoints += 25;
      }
    }
  }

  for (const c of store.challenges) {
    for (const sub of c.submissions || []) {
      if (sub.status === 'Verified' || sub.status === 'Reviewed') {
        const row = ensure(sub.userId, sub.userName);
        row.challengesSolved += 1;
        row.seasonPoints += c.xpReward || 50;
      }
    }
  }

  for (const b of store.bounties) {
    for (const sub of b.submissions || []) {
      if (sub.status === 'Approved') {
        const row = ensure(sub.claimantId, sub.claimantName);
        row.bountiesCompleted += 1;
        row.seasonPoints += b.xpReward || 90;
      }
    }
  }

  for (const bo of store.buildOffs) {
    for (const entry of bo.entries || []) {
      if (entry.judgeScore || entry.isWinner) {
        const pts = (entry.judgeScore || 50) + (entry.isWinner ? 100 : 0);
        entry.memberIds.forEach((uid, idx) => {
          const row = ensure(uid, entry.memberNames[idx] || uid);
          row.buildOffPoints += pts;
          row.seasonPoints += pts;
        });
      }
    }
  }

  for (const nom of store.potwNominations) {
    if (nom.isWinner) {
      const row = ensure(nom.authorId, nom.authorName);
      row.seasonPoints += 150;
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => b.seasonPoints - a.seasonPoints || b.duelWins - a.duelWins || a.userName.localeCompare(b.userName)
  );
}

export function getCompetitionXpAwardsForUser(userId: string): CompetitionXpAwards {
  const duelWins: { matchId: string; title: string; xp: number }[] = [];
  const duelParticipations: { matchId: string; title: string; xp: number }[] = [];
  const challengesSolved: { challengeId: string; title: string; xp: number }[] = [];
  const bountiesApproved: { bountyId: string; title: string; xp: number }[] = [];
  const buildOffResults: { buildOffId: string; title: string; xp: number; won: boolean }[] = [];
  const potwWins: { nominationId: string; title: string; xp: number }[] = [];

  for (const m of store.matches) {
    if (m.status !== 'completed' && m.status !== 'forfeited') continue;
    const participant = m.participants.find((p) => p.userId === userId);
    if (!participant) continue;
    if (m.winnerTeamId && participant.teamId === m.winnerTeamId) {
      duelWins.push({ matchId: m.id, title: m.title, xp: 75 });
    } else {
      duelParticipations.push({ matchId: m.id, title: m.title, xp: 25 });
    }
  }

  for (const ch of store.challenges) {
    const solved = ch.submissions.some((s) => s.userId === userId && (s.status === 'Verified' || s.status === 'Reviewed'));
    if (solved) {
      challengesSolved.push({ challengeId: ch.id, title: ch.title, xp: ch.xpReward || 50 });
    }
  }

  for (const b of store.bounties) {
    const approved = b.submissions.some((s) => s.claimantId === userId && s.status === 'Approved');
    if (approved) {
      bountiesApproved.push({ bountyId: b.id, title: b.title, xp: b.xpReward || 90 });
    }
  }

  for (const bo of store.buildOffs) {
    const entry = bo.entries.find((e) => e.memberIds.includes(userId) && (e.isWinner || (e.judgeScore || 0) > 0));
    if (entry) {
      buildOffResults.push({
        buildOffId: bo.id,
        title: bo.title,
        xp: entry.isWinner ? bo.xpReward : Math.round(bo.xpReward * 0.4),
        won: Boolean(entry.isWinner),
      });
    }
  }

  for (const nom of store.potwNominations) {
    if (nom.authorId === userId && nom.isWinner) {
      potwWins.push({ nominationId: nom.id, title: nom.title, xp: 150 });
    }
  }

  return { duelWins, duelParticipations, challengesSolved, bountiesApproved, buildOffResults, potwWins };
}

// Only problems published as daily/weekly challenges are sent to clients (and never their hidden tests),
// so the bootstrap payload can't be used to read ahead at a duel problem.
function getClientProblems(): ArenaProblem[] {
  const ids = new Set(store.challenges.map((c) => c.problemId).filter(Boolean));
  return [...store.customProblems, ...ARENA_PROBLEMS].filter((p) => ids.has(p.id)).map(toClientProblem);
}

export function sanitizeChallengeForViewer(
  challenge: ArenaChallengeItem,
  viewerUserId?: string,
  isAdmin = false
): ArenaChallengeItem {
  return {
    ...challenge,
    submissions: isAdmin
      ? [...challenge.submissions]
      : challenge.submissions.filter((submission) => submission.userId === viewerUserId),
  };
}

export function sanitizeBountyForViewer(
  bounty: BountyItem,
  viewerUserId?: string,
  isAdmin = false
): BountyItem {
  return {
    ...bounty,
    submissions: isAdmin
      ? [...bounty.submissions]
      : bounty.submissions.filter((submission) => submission.claimantId === viewerUserId),
  };
}

export function getArenaBootstrap(viewerUserId?: string, isAdmin = false) {
  checkArenaTimers();
  return {
    sandbox: getSandboxStatus(),
    problems: getClientProblems(),
    matches: listArenaMatches(viewerUserId),
    challenges: store.challenges.map((challenge) => sanitizeChallengeForViewer(challenge, viewerUserId, isAdmin)),
    buildOffs: store.buildOffs,
    potwNominations: store.potwNominations,
    bounties: store.bounties.map((bounty) => sanitizeBountyForViewer(bounty, viewerUserId, isAdmin)),
    seasons: store.seasons,
    seasonStandings: computeSeasonStandings(),
    history: store.history,
    myCompetitionXp: viewerUserId ? getCompetitionXpAwardsForUser(viewerUserId) : null,
  };
}
