import type {
  CodeSubmission,
  CommunityPost,
  LeaderboardEntry,
  LeaderboardMap,
  LedgerEntry,
  OnboardingProfile,
  QuizAttempt,
  RoadmapTopicProgress,
  ShowcaseProject,
  UserSession,
  WeeklyProjectItem,
  XpKind,
} from '../types';
import { buildMemberIdentifiers, matchesMember } from './milestones';

/* ------------------------------------------------------------------ *
 * Rules
 * XP rewards real learning. Every reward is tied to a unique "key"
 * (one quiz, one exercise, one project...), so repeating the same easy
 * task can never farm points. Logging in earns nothing; a daily check-in
 * earns a small amount once a day.
 * ------------------------------------------------------------------ */

export const XP_RULES: { kind: XpKind; label: string; xp: number; note: string }[] = [
  { kind: 'lesson', label: 'Demonstrate a roadmap topic', xp: 20, note: 'Once per topic' },
  { kind: 'quiz', label: 'Pass a quiz with 70% or more', xp: 30, note: 'Once per quiz' },
  { kind: 'code', label: 'Submit a new exercise', xp: 50, note: 'Resubmitting the same exercise earns nothing extra' },
  { kind: 'project', label: 'Finish or showcase a project', xp: 100, note: 'Once per project' },
  { kind: 'help', label: 'Help another member', xp: 15, note: 'Up to 20 helpful replies' },
  { kind: 'checkin', label: 'Daily check-in', xp: 5, note: 'Once a day' },
];

export const STREAK_BONUSES = [
  { days: 7, xp: 25 },
  { days: 14, xp: 50 },
  { days: 30, xp: 100 },
];

const HELP_CAP = 20;

export const LEVELS = [
  { name: 'Rookie', min: 0 },
  { name: 'Apprentice', min: 100 },
  { name: 'Developer', min: 300 },
  { name: 'Specialist', min: 700 },
  { name: 'Expert', min: 1400 },
  { name: 'Elite', min: 2500 },
];

export interface LevelInfo {
  index: number;
  name: string;
  min: number;
  nextName: string | null;
  nextMin: number | null;
  /** 0-100 progress through the current level */
  pct: number;
  toNext: number;
}

export function levelFor(xp: number): LevelInfo {
  let index = 0;
  LEVELS.forEach((l, i) => {
    if (xp >= l.min) index = i;
  });
  const cur = LEVELS[index];
  const next = LEVELS[index + 1] || null;
  const pct = next ? Math.round(((xp - cur.min) / (next.min - cur.min)) * 100) : 100;
  return {
    index,
    name: cur.name,
    min: cur.min,
    nextName: next ? next.name : null,
    nextMin: next ? next.min : null,
    pct,
    toNext: next ? next.min - xp : 0,
  };
}

/* ------------------------------------------------------------------ *
 * Dates (always the member's own local calendar)
 * ------------------------------------------------------------------ */

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The Monday of the week that contains d, as a day key. Weekly boards reset on Mondays. */
export function weekKeyFor(d: Date): string {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (copy.getDay() + 6) % 7; // Monday = 0
  copy.setDate(copy.getDate() - offset);
  return dayKey(copy);
}

function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/* ------------------------------------------------------------------ *
 * Finding what has earned XP
 * ------------------------------------------------------------------ */

export interface AwardInput {
  user: Pick<UserSession, 'name' | 'email'> | null;
  profile: OnboardingProfile;
  dailyLogs: any[];
  codeSubmissions: CodeSubmission[];
  quizAttempts: QuizAttempt[];
  weeklyProjects: WeeklyProjectItem[];
  roadmapProgress: Record<string, RoadmapTopicProgress>;
  posts: CommunityPost[];
  helpRequests: any[];
  showcaseProjects: ShowcaseProject[];
}

interface Award {
  key: string;
  kind: XpKind;
  xp: number;
  label: string;
  skill?: string;
}

const ruleXp = (kind: XpKind) => XP_RULES.find((r) => r.kind === kind)?.xp ?? 0;

/** Everything the member has done that is worth XP right now, each with a unique key. */
export function collectAwards(input: AwardInput): Award[] {
  const awards: Award[] = [];
  const ids = buildMemberIdentifiers(input.user, input.profile);

  Object.entries(input.roadmapProgress || {}).forEach(([topicId, p]) => {
    if (p?.status === 'Demonstrated' || p?.status === 'Completed') {
      awards.push({ key: `lesson:${topicId}`, kind: 'lesson', xp: ruleXp('lesson'), label: 'Demonstrated a roadmap topic' });
    }
  });

  const passedQuizzes = new Map<string, QuizAttempt>();
  input.quizAttempts.forEach((q) => {
    if (q.percentage >= 70 && !passedQuizzes.has(q.quizId)) passedQuizzes.set(q.quizId, q);
  });
  passedQuizzes.forEach((q, quizId) => {
    awards.push({ key: `quiz:${quizId}`, kind: 'quiz', xp: ruleXp('quiz'), label: `Passed “${q.quizTitle}”` });
  });

  input.codeSubmissions.forEach((s) => {
    awards.push({
      key: `code:${s.courseId}:${(s.exerciseTitle || s.topic || s.id).toLowerCase()}`,
      kind: 'code',
      xp: ruleXp('code'),
      label: `Submitted “${s.exerciseTitle || s.topic}”`,
      skill: s.language || undefined,
    });
  });

  input.weeklyProjects.forEach((p) => {
    if (p.status === 'Submitted' || p.status === 'Reviewed') {
      awards.push({ key: `project:${p.id}`, kind: 'project', xp: ruleXp('project'), label: `Finished “${p.title}”`, skill: p.language || undefined });
    }
  });
  input.showcaseProjects.forEach((s) => {
    if (matchesMember(s?.author, ids)) {
      awards.push({ key: `showcase:${s.id}`, kind: 'project', xp: ruleXp('project'), label: `Showcased “${s.title}”` });
    }
  });

  const helps: Award[] = [];
  input.posts.forEach((p) => {
    (p.comments || []).forEach((c) => {
      if (matchesMember(c?.author, ids)) {
        helps.push({ key: `help:c:${p.id}:${c.id}`, kind: 'help', xp: ruleXp('help'), label: 'Replied to a discussion' });
      }
    });
  });
  input.helpRequests.forEach((h) => {
    (h.responses || []).forEach((r: any, i: number) => {
      if (matchesMember(r?.responder, ids)) {
        helps.push({ key: `help:r:${h.id}:${r.id ?? i}`, kind: 'help', xp: ruleXp('help'), label: 'Answered a help request' });
      }
    });
  });
  awards.push(...helps.slice(0, HELP_CAP));

  input.dailyLogs.forEach((l, i) => {
    awards.push({ key: `log:${l?.id ?? i}`, kind: 'checkin', xp: ruleXp('checkin'), label: 'Daily check-in' });
  });

  return awards;
}

/* ------------------------------------------------------------------ *
 * The ledger
 * ------------------------------------------------------------------ */

export function activeDays(ledger: LedgerEntry[]): Set<string> {
  const days = new Set<string>();
  ledger.forEach((e) => {
    if (!e.backfill && e.kind !== 'start' && e.kind !== 'streak') days.add(e.day);
  });
  return days;
}

export function streaksFor(ledger: LedgerEntry[], now: Date) {
  const days = activeDays(ledger);
  const today = dayKey(now);
  const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterday = dayKey(yesterdayDate);

  // A streak stays alive until the end of the day after your last active day.
  let current = 0;
  let cursor = days.has(today) ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : days.has(yesterday) ? yesterdayDate : null;
  while (cursor && days.has(dayKey(cursor))) {
    current += 1;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  }

  let longest = 0;
  const sorted = [...days].sort();
  let run = 0;
  let prev: Date | null = null;
  sorted.forEach((d) => {
    const dt = parseDay(d);
    if (prev && Math.round((dt.getTime() - prev.getTime()) / 86400000) === 1) run += 1;
    else run = 1;
    longest = Math.max(longest, run);
    prev = dt;
  });

  return { current, longest, activeToday: days.has(today) };
}

/**
 * Compare what the member has done with what the ledger has already rewarded.
 * Returns the new ledger, or null when nothing changed.
 * The first time it runs, existing progress is counted as a starting balance (not weekly XP, not a streak).
 */
export function syncLedger(ledger: LedgerEntry[], awards: Award[], now: Date): LedgerEntry[] | null {
  const today = dayKey(now);
  const hour = now.getHours();
  const known = new Set(ledger.map((e) => e.key));
  const next: LedgerEntry[] = [...ledger];
  const first = ledger.length === 0;

  if (first) {
    next.push({ key: 'start', kind: 'start', xp: 0, label: 'Joined XP', day: today, hour, backfill: true });
  }

  const checkinDays = new Set(ledger.filter((e) => e.kind === 'checkin' && e.xp > 0 && !e.backfill).map((e) => e.day));

  awards.forEach((a) => {
    if (known.has(a.key)) return;
    known.add(a.key);
    let xp = a.xp;
    if (!first && a.kind === 'checkin') {
      // one check-in reward per day; extra check-ins still count as activity
      if (checkinDays.has(today)) xp = 0;
      checkinDays.add(today);
    }
    next.push({ key: a.key, kind: a.kind, xp, label: a.label, day: today, hour, skill: a.skill, backfill: first || undefined });
  });

  // Streak bonuses, once each
  const { longest } = streaksFor(next, now);
  STREAK_BONUSES.forEach((b) => {
    const key = `streak:${b.days}`;
    if (longest >= b.days && !known.has(key)) {
      known.add(key);
      next.push({ key, kind: 'streak', xp: b.xp, label: `${b.days}-day streak bonus`, day: today, hour });
    }
  });

  return next.length === ledger.length ? null : next;
}

/* ------------------------------------------------------------------ *
 * Summaries the screens read
 * ------------------------------------------------------------------ */

export interface PersonalBest {
  id: string;
  label: string;
  value: string;
  detail?: string;
  /** Set for the improvement card: before and after percentages */
  from?: number;
  to?: number;
}

export interface GamificationSummary {
  totalXp: number;
  weekXp: number;
  weekKey: string;
  level: LevelInfo;
  currentStreak: number;
  longestStreak: number;
  activeToday: boolean;
  nightOwl: boolean;
  recent: LedgerEntry[];
  skills: Record<string, number>;
  bests: PersonalBest[];
}

export function summarize(ledger: LedgerEntry[], quizAttempts: QuizAttempt[], codeCount: number, now: Date): GamificationSummary {
  const weekKey = weekKeyFor(now);
  const totalXp = ledger.reduce((sum, e) => sum + e.xp, 0);
  const real = ledger.filter((e) => !e.backfill && e.kind !== 'start');
  const weekXp = real.filter((e) => e.day >= weekKey).reduce((sum, e) => sum + e.xp, 0);
  const { current, longest, activeToday } = streaksFor(ledger, now);
  const nightOwl = real.some((e) => e.kind !== 'streak' && (e.hour >= 21 || e.hour < 4));

  const skills: Record<string, number> = {};
  ledger.forEach((e) => {
    if (e.skill && e.xp > 0) skills[e.skill] = (skills[e.skill] || 0) + e.xp;
  });

  // Personal bests: compete against yourself
  const bests: PersonalBest[] = [];
  if (quizAttempts.length > 0) {
    const top = quizAttempts.reduce((a, b) => (b.percentage > a.percentage ? b : a));
    bests.push({ id: 'quiz-high', label: 'Highest quiz score', value: `${top.percentage}%`, detail: top.quizTitle });

    // attempts are stored newest first
    const byQuiz = new Map<string, QuizAttempt[]>();
    [...quizAttempts].reverse().forEach((q) => byQuiz.set(q.quizId, [...(byQuiz.get(q.quizId) || []), q]));
    let best: { title: string; from: number; to: number } | null = null;
    byQuiz.forEach((list) => {
      if (list.length < 2) return;
      const from = list[0].percentage;
      const to = Math.max(...list.map((q) => q.percentage));
      if (to - from > (best ? best.to - best.from : 0)) best = { title: list[0].quizTitle, from, to };
    });
    if (best) {
      const b = best as { title: string; from: number; to: number };
      bests.push({
        id: 'quiz-improve',
        label: 'Biggest improvement',
        value: `+${b.to - b.from} points`,
        detail: b.title,
        from: b.from,
        to: b.to,
      });
    }
  }

  const weeks = new Map<string, number>();
  real.forEach((e) => {
    const wk = weekKeyFor(parseDay(e.day));
    weeks.set(wk, (weeks.get(wk) || 0) + e.xp);
  });
  const bestWeek = Math.max(0, ...weeks.values());
  if (bestWeek > 0) bests.push({ id: 'best-week', label: 'Best week', value: `${bestWeek} XP` });
  if (longest > 0) bests.push({ id: 'longest-streak', label: 'Longest streak', value: `${longest} ${longest === 1 ? 'day' : 'days'}` });
  if (codeCount > 0) bests.push({ id: 'exercises', label: 'Exercises submitted', value: String(codeCount) });

  return {
    totalXp,
    weekXp,
    weekKey,
    level: levelFor(totalXp),
    currentStreak: current,
    longestStreak: longest,
    activeToday,
    nightOwl,
    recent: [...real].reverse().filter((e) => e.xp > 0).slice(0, 6),
    skills,
    bests,
  };
}

/* ------------------------------------------------------------------ *
 * Leaderboards
 * ------------------------------------------------------------------ */

export function buildLeaderboardEntry(
  userId: string,
  name: string,
  summary: GamificationSummary,
  badgeCount: number
): LeaderboardEntry {
  // keep only the strongest skills so the shared row stays small
  const skills = Object.fromEntries(Object.entries(summary.skills).sort((a, b) => b[1] - a[1]).slice(0, 6));
  return {
    id: userId,
    name: name || 'Member',
    totalXp: summary.totalXp,
    weekXp: summary.weekXp,
    weekKey: summary.weekKey,
    level: summary.level.name,
    streak: summary.currentStreak,
    badges: badgeCount,
    skills,
  };
}

export const sameEntry = (a?: LeaderboardEntry, b?: LeaderboardEntry) => Boolean(a && b && JSON.stringify(a) === JSON.stringify(b));

export type BoardMode = 'week' | 'all' | 'skill';

export interface RankedRow {
  entry: LeaderboardEntry;
  value: number;
  rank: number;
}

export function rankBoard(board: LeaderboardMap, mode: BoardMode, weekKey: string, skill: string, meId: string | null): RankedRow[] {
  const valueOf = (e: LeaderboardEntry) => {
    if (mode === 'week') return e.weekKey === weekKey ? e.weekXp : 0; // old weeks count as zero
    if (mode === 'skill') return e.skills?.[skill] || 0;
    return e.totalXp;
  };
  const rows = Object.values(board)
    .map((entry) => ({ entry, value: valueOf(entry) }))
    .filter((r) => r.value > 0 || r.entry.id === meId)
    .sort((a, b) => b.value - a.value || a.entry.name.localeCompare(b.entry.name));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

export function boardSkills(board: LeaderboardMap): string[] {
  const totals: Record<string, number> = {};
  Object.values(board).forEach((e) => Object.entries(e.skills || {}).forEach(([k, v]) => (totals[k] = (totals[k] || 0) + v)));
  return Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

/** Friendly sample rows for demo mode, so the leaderboard looks alive before real members exist. */
export function seedLeaderboard(roster: { id: string; name: string; role?: string }[], weekKey: string): LeaderboardMap {
  const samples = [
    { totalXp: 340, weekXp: 95, streak: 5, badges: 6, skills: { JavaScript: 150, Python: 90 } },
    { totalXp: 780, weekXp: 140, streak: 9, badges: 9, skills: { Python: 320, SQL: 180 } },
    { totalXp: 190, weekXp: 60, streak: 3, badges: 4, skills: { JavaScript: 90 } },
    { totalXp: 640, weekXp: 110, streak: 6, badges: 8, skills: { Python: 260 } },
  ];
  const out: LeaderboardMap = {};
  roster
    .filter((m) => m.role !== 'Community Admin')
    .slice(0, samples.length)
    .forEach((m, i) => {
      const s = samples[i];
      out[m.id] = { id: m.id, name: m.name, weekKey, level: levelFor(s.totalXp).name, ...s };
    });
  return out;
}
