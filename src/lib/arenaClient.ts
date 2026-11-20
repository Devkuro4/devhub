import { supabase } from './supabase';
import type {
  ArenaChallengeItem,
  ArenaLanguage,
  ArenaMatchFormat,
  ArenaMatchView,
  ArenaProblem,
  ArenaScoringType,
  ArenaTeamPrivateState,
  ArenaTeamSubmission,
  BountyItem,
  CompetitionHistoryEntry,
  CompetitionXpAwards,
  ProjectOfTheWeekNomination,
  SandboxExecutionResult,
  SandboxStatus,
  SeasonalCompetition,
  SeasonStandingRow,
  TeamBuildOff,
} from '../types';

const API_BASE = String((import.meta as any).env?.VITE_API_URL || '')
  .trim()
  .replace(/^['"]|['"]$/g, '')
  .replace(/\/+$/, '');

export interface ArenaActorRef {
  userId?: string;
  userName?: string;
}

export interface ArenaBootstrapResponse {
  sandbox: SandboxStatus;
  problems: ArenaProblem[];
  matches: ArenaMatchView[];
  challenges: ArenaChallengeItem[];
  buildOffs: TeamBuildOff[];
  potwNominations: ProjectOfTheWeekNomination[];
  bounties: BountyItem[];
  seasons: SeasonalCompetition[];
  seasonStandings: SeasonStandingRow[];
  history: CompetitionHistoryEntry[];
  myCompetitionXp: CompetitionXpAwards | null;
}

async function buildHeaders(actor?: ArenaActorRef): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (actor?.userId) headers['X-Devhub-User'] = actor.userId;
  if (actor?.userName) headers['X-Devhub-Name'] = encodeURIComponent(actor.userName);
  return headers;
}

async function apiReq<T>(method: string, url: string, actor?: ArenaActorRef, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: await buildHeaders(actor),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function fetchArenaBootstrap(actor: ArenaActorRef) {
  return apiReq<ArenaBootstrapResponse>('GET', '/api/arena/bootstrap', actor);
}

export function fetchArenaMatches(actor: ArenaActorRef) {
  return apiReq<{ matches: ArenaMatchView[]; serverNowMs: number }>('GET', '/api/arena/matches', actor);
}

export function generateArenaProblemApi(
  actor: ArenaActorRef,
  input: { topic: string; difficulty: 'Beginner' | 'Intermediate' | 'Advanced' }
) {
  return apiReq<{ problem: ArenaProblem }>('POST', '/api/arena/generate-problem', actor, input);
}

export function createArenaMatchApi(
  actor: ArenaActorRef,
  input: {
    title?: string;
    format: ArenaMatchFormat;
    teamSize?: number;
    scoringType: ArenaScoringType;
    problemId: string;
    allowedLanguages: ArenaLanguage[];
    durationSeconds: number;
  }
) {
  return apiReq<{ match: ArenaMatchView }>('POST', '/api/arena/matches', actor, input);
}

export function joinArenaMatchApi(actor: ArenaActorRef, matchId: string, teamId?: 'team-a' | 'team-b') {
  return apiReq<{ match: ArenaMatchView }>('POST', `/api/arena/matches/${encodeURIComponent(matchId)}/join`, actor, { teamId });
}

export function setArenaReadyApi(actor: ArenaActorRef, matchId: string, ready?: boolean) {
  return apiReq<{ match: ArenaMatchView }>('POST', `/api/arena/matches/${encodeURIComponent(matchId)}/ready`, actor, { ready });
}

export function runMatchTestsApi(actor: ArenaActorRef, matchId: string, input: { language: ArenaLanguage; code: string }) {
  return apiReq<{ result: SandboxExecutionResult; match: ArenaMatchView }>(
    'POST',
    `/api/arena/matches/${encodeURIComponent(matchId)}/run`,
    actor,
    input
  );
}

export function submitMatchSolutionApi(actor: ArenaActorRef, matchId: string, input: { language: ArenaLanguage; code: string }) {
  return apiReq<{ submission: ArenaTeamSubmission; result: SandboxExecutionResult; match: ArenaMatchView }>(
    'POST',
    `/api/arena/matches/${encodeURIComponent(matchId)}/submit`,
    actor,
    input
  );
}

export function forfeitArenaMatchApi(actor: ArenaActorRef, matchId: string) {
  return apiReq<{ match: ArenaMatchView }>('POST', `/api/arena/matches/${encodeURIComponent(matchId)}/forfeit`, actor);
}

export function claimDisconnectWinApi(actor: ArenaActorRef, matchId: string) {
  return apiReq<{ match: ArenaMatchView }>(
    'POST',
    `/api/arena/matches/${encodeURIComponent(matchId)}/claim-disconnect-win`,
    actor
  );
}

export function cancelArenaMatchApi(actor: ArenaActorRef, matchId: string) {
  return apiReq<{ match: ArenaMatchView }>('POST', `/api/arena/matches/${encodeURIComponent(matchId)}/cancel`, actor);
}

// Challenges (Daily & Weekly)
export function createArenaChallengeApi(
  actor: ArenaActorRef,
  input: {
    cadence: 'daily' | 'weekly';
    kind: 'code' | 'build';
    title: string;
    category: string;
    difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
    deadline: string;
    xpReward: number;
    problemId?: string;
    description: string;
    objectives: string[];
  }
) {
  return apiReq<{ challenge: ArenaChallengeItem }>('POST', '/api/arena/challenges', actor, input);
}

export function submitArenaChallengeApi(
  actor: ArenaActorRef,
  challengeId: string,
  input: { language?: ArenaLanguage; code?: string; repoUrl?: string; explanation?: string }
) {
  return apiReq<{ challenge: ArenaChallengeItem; execution?: SandboxExecutionResult }>(
    'POST',
    `/api/arena/challenges/${encodeURIComponent(challengeId)}/submit`,
    actor,
    input
  );
}

export function judgeArenaChallengeApi(
  actor: ArenaActorRef,
  challengeId: string,
  subId: string,
  input: { status: 'Verified' | 'Reviewed' | 'Needs Revision'; judgeNote?: string }
) {
  return apiReq<{ challenge: ArenaChallengeItem }>(
    'POST',
    `/api/arena/challenges/${encodeURIComponent(challengeId)}/submissions/${encodeURIComponent(subId)}/judge`,
    actor,
    input
  );
}

// Team Build-Offs
export function createBuildOffApi(
  actor: ArenaActorRef,
  input: {
    title: string;
    theme: string;
    description: string;
    teamSizeMin?: number;
    teamSizeMax?: number;
    deadline: string;
    xpReward?: number;
  }
) {
  return apiReq<{ buildOff: TeamBuildOff }>('POST', '/api/arena/build-offs', actor, input);
}

export function submitBuildOffTeamApi(
  actor: ArenaActorRef,
  buildOffId: string,
  input: { teamName?: string; joinEntryId?: string; repoUrl?: string; demoUrl?: string; summary?: string }
) {
  return apiReq<{ buildOff: TeamBuildOff }>(
    'POST',
    `/api/arena/build-offs/${encodeURIComponent(buildOffId)}/teams`,
    actor,
    input
  );
}

export function judgeBuildOffApi(
  actor: ArenaActorRef,
  buildOffId: string,
  input: { entryId: string; judgeScore: number; judgeFeedback: string; declareWinner?: boolean }
) {
  return apiReq<{ buildOff: TeamBuildOff }>(
    'POST',
    `/api/arena/build-offs/${encodeURIComponent(buildOffId)}/judge`,
    actor,
    input
  );
}

// Project of the Week
export function nominatePotwApi(
  actor: ArenaActorRef,
  input: { title: string; summary: string; repoUrl?: string; demoUrl?: string; technologies?: string[] }
) {
  return apiReq<{ nomination: ProjectOfTheWeekNomination }>('POST', '/api/arena/potw/nominate', actor, input);
}

export function togglePotwVoteApi(actor: ArenaActorRef, nominationId: string) {
  return apiReq<{ nomination: ProjectOfTheWeekNomination }>(
    'POST',
    `/api/arena/potw/${encodeURIComponent(nominationId)}/vote`,
    actor
  );
}

export function selectPotwWinnerApi(actor: ArenaActorRef, nominationId: string, judgeNote: string) {
  return apiReq<{ nomination: ProjectOfTheWeekNomination }>(
    'POST',
    `/api/arena/potw/${encodeURIComponent(nominationId)}/select-winner`,
    actor,
    { judgeNote }
  );
}

// Bounties
export function createBountyApi(
  actor: ArenaActorRef,
  input: {
    title: string;
    category: string;
    difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
    description: string;
    acceptanceCriteria: string[];
    xpReward: number;
  }
) {
  return apiReq<{ bounty: BountyItem }>('POST', '/api/arena/bounties', actor, input);
}

export function claimOrReleaseBountyApi(actor: ArenaActorRef, bountyId: string, action: 'claim' | 'release') {
  return apiReq<{ bounty: BountyItem }>(
    'POST',
    `/api/arena/bounties/${encodeURIComponent(bountyId)}/claim`,
    actor,
    { action }
  );
}

export function submitBountyProofApi(actor: ArenaActorRef, bountyId: string, input: { repoUrl?: string; notes: string }) {
  return apiReq<{ bounty: BountyItem }>(
    'POST',
    `/api/arena/bounties/${encodeURIComponent(bountyId)}/submit`,
    actor,
    input
  );
}

export function reviewBountyApi(
  actor: ArenaActorRef,
  bountyId: string,
  input: { submissionId: string; status: 'Approved' | 'Needs Revision'; judgeNote?: string }
) {
  return apiReq<{ bounty: BountyItem }>(
    'POST',
    `/api/arena/bounties/${encodeURIComponent(bountyId)}/review`,
    actor,
    input
  );
}

// Seasons
export function upsertSeasonApi(
  actor: ArenaActorRef,
  input: { id?: string; name: string; theme: string; startDate: string; endDate: string; status: 'Active' | 'Completed'; prizeSummary: string }
) {
  return apiReq<{ season: SeasonalCompetition }>('POST', '/api/arena/seasons', actor, input);
}

// WebSocket Connection Helper for Real-Time Arena Matches & Private Team Workspaces
export type ArenaWsEvent =
  | { type: 'connected'; serverOffsetMs: number }
  | { type: 'disconnected' }
  | { type: 'arena:sync'; match: ArenaMatchView | null; matches?: ArenaMatchView[]; serverNowMs: number }
  | { type: 'arena:lobby_sync'; matches: ArenaMatchView[] }
  | { type: 'arena:match_updated'; match: ArenaMatchView }
  | { type: 'arena:team_workspace'; matchId: string; teamId: string; privateState: ArenaTeamPrivateState; serverNowMs: number }
  | { type: 'arena:competitions_sync' }
  | { type: 'arena:error'; message: string };

export function getArenaWsUrl(): string {
  if (API_BASE) {
    return API_BASE.replace(/^http/, 'ws') + '/ws/arena';
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/arena`;
}

export class ArenaSocketClient {
  private ws: WebSocket | null = null;
  private closed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private actor: ArenaActorRef;
  private matchId: string | null = null;
  private onEvent: (ev: ArenaWsEvent) => void;

  constructor(actor: ArenaActorRef, onEvent: (ev: ArenaWsEvent) => void) {
    this.actor = actor;
    this.onEvent = onEvent;
    this.connect();
  }

  public setActor(actor: ArenaActorRef) {
    this.actor = actor;
    this.sendAuth();
  }

  public subscribeMatch(matchId: string | null) {
    this.matchId = matchId;
    this.send({ type: 'arena:subscribe_match', matchId });
  }

  public sendCodeUpdate(matchId: string, language: ArenaLanguage, code: string) {
    this.send({ type: 'arena:code_update', matchId, language, code });
  }

  public sendTeamChat(matchId: string, text: string) {
    this.send({ type: 'arena:team_chat', matchId, text });
  }

  public requestSync() {
    this.send({ type: 'arena:ping_sync' });
  }

  public destroy() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
  }

  private send(payload: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private async sendAuth() {
    let token = '';
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token || '';
    }
    this.send({
      type: 'arena:auth',
      token,
      userId: this.actor.userId,
      userName: this.actor.userName,
      matchId: this.matchId,
    });
  }

  private connect() {
    if (this.closed) return;
    try {
      const ws = new WebSocket(getArenaWsUrl());
      this.ws = ws;
      ws.onopen = () => {
        this.sendAuth();
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(String(e.data));
          if (typeof msg.serverNowMs === 'number') {
            this.onEvent({ type: 'connected', serverOffsetMs: msg.serverNowMs - Date.now() });
          }
          if (msg.type === 'arena:sync') {
            this.onEvent(msg);
          } else if (msg.type === 'arena:lobby_sync') {
            this.onEvent(msg);
          } else if (msg.type === 'arena:match_updated') {
            this.onEvent(msg);
          } else if (msg.type === 'arena:team_workspace') {
            this.onEvent(msg);
          } else if (msg.type === 'arena:competitions_sync') {
            this.onEvent(msg);
          } else if (msg.type === 'arena:error') {
            this.onEvent(msg);
          }
        } catch {}
      };
      ws.onclose = () => {
        this.ws = null;
        this.onEvent({ type: 'disconnected' });
        if (!this.closed) {
          this.reconnectTimer = setTimeout(() => this.connect(), 1500);
        }
      };
    } catch {
      if (!this.closed) {
        this.reconnectTimer = setTimeout(() => this.connect(), 2500);
      }
    }
  }
}
