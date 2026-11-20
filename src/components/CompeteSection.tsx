import React, { useMemo, useState } from 'react';
import { recommendChallenges } from '../lib/adaptive';
import {
  ArrowRight,
  Award,
  Check,
  Code2,
  Flame,
  Hammer,
  History,
  Lock,
  Swords,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react';
import { EmptyState, PageHeader, ProgressBar, SectionTabs, Sparkle } from './ui';
import { MilestoneIcon } from './MilestoneBadges';
import { ArenaMatchRoom } from './ArenaMatchRoom';
import {
  ArenaChallengesPanel,
  BountyBoardPanel,
  BuildOffAndPotwPanel,
  CompetitionHistoryPanel,
  SeasonStandingsPanel,
} from './CompetitionsPanels';
import {
  XP_RULES,
  STREAK_BONUSES,
  LEVELS,
  boardSkills,
  rankBoard,
  type BoardMode,
  type GamificationSummary,
} from '../lib/gamification';
import type { ArenaActorRef, ArenaBootstrapResponse, ArenaSocketClient } from '../lib/arenaClient';
import type { BadgeCategory, LeaderboardMap, MemberMilestone, MilestoneSummary, OnboardingProfile, QuizAttempt } from '../types';

const initialsOf = (n: string) =>
  (n || '').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'D';

const CATEGORY_BLURB: Record<BadgeCategory, string> = {
  Consistency: 'Showing up, at a pace that works for you.',
  Learning: 'Understanding things and checking that it stuck.',
  Building: 'Writing code and shipping projects.',
  Community: 'Helping others and sharing what you know.',
};
const CATEGORY_ORDER: BadgeCategory[] = ['Consistency', 'Learning', 'Building', 'Community'];

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

/* ------------------------------------------------------------------ *
 * Small piece for the Home screen: level, XP bar and streak in one card
 * ------------------------------------------------------------------ */
export const HomeLevelCard = ({
  summary,
  onOpen,
  textPrimary,
  textSecondary,
}: {
  summary: GamificationSummary;
  onOpen: () => void;
  textPrimary: string;
  textSecondary: string;
}) => {
  const { level } = summary;
  return (
    <section className="soft-card p-5 sm:p-6 space-y-4" aria-label="Your level">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className={`text-xs font-semibold uppercase tracking-wider ${textSecondary}`}>Level {level.index + 1}</p>
          <h3 className={`text-lg ${textPrimary}`}>{level.name}</h3>
        </div>
        <p className={`font-display text-2xl tabular-nums leading-none ${textPrimary}`}>
          {summary.totalXp}
          <span className={`text-sm font-sans ml-1 ${textSecondary}`}>XP</span>
        </p>
      </div>
      <ProgressBar value={level.pct} />
      <p className={`text-sm ${textSecondary}`}>
        {level.nextName ? `${level.toNext} XP to ${level.nextName}` : 'You reached the top level. Keep building.'}
      </p>
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--border-hairline)]">
        <span className={`inline-flex items-center gap-1.5 text-sm ${textSecondary}`}>
          <Flame className="w-4 h-4 text-[var(--accent-600)]" aria-hidden="true" />
          {summary.currentStreak > 0 ? `${summary.currentStreak}-day streak` : 'Start a streak today'}
        </span>
        <button type="button" onClick={onOpen} className="text-sm font-medium text-[var(--accent-600)] hover:underline cursor-pointer">
          Open Compete →
        </button>
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ *
 * Badge tile, used in the gallery
 * ------------------------------------------------------------------ */
const BadgeTile = ({ m, textPrimary, textSecondary }: { m: MemberMilestone; textPrimary: string; textSecondary: string }) => {
  const pct = Math.min(100, Math.round((m.current / m.target) * 100));
  return (
    <li className={`soft-card p-5 flex flex-col gap-4 ${m.earned ? '' : 'opacity-95'}`}>
      <div className="flex items-start gap-3">
        <span
          className={`w-12 h-12 rounded-full shrink-0 flex items-center justify-center ${
            m.earned ? 'bg-[var(--accent-100)] text-[var(--accent-600)]' : 'bg-[var(--surface-subtle)] text-[var(--ink-muted)]'
          }`}
        >
          {m.earned ? <MilestoneIcon icon={m.icon} className="w-5 h-5" /> : <Lock className="w-5 h-5" aria-hidden="true" />}
        </span>
        <span className="min-w-0 space-y-0.5">
          <span className={`block text-base font-semibold leading-snug ${textPrimary}`}>{m.title}</span>
          <span className={`block text-sm ${textSecondary}`}>{m.requirementLabel}</span>
        </span>
      </div>
      {m.earned ? (
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent-700)]">
          <Check className="w-4 h-4" aria-hidden="true" /> Unlocked
        </p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className={`text-sm ${textSecondary}`}>Progress</span>
            <span className={`text-sm font-mono tabular-nums ${textSecondary}`}>
              {m.current}/{m.target}
            </span>
          </div>
          <ProgressBar value={pct} />
        </div>
      )}
      <p className={`text-sm leading-relaxed ${textSecondary}`}>{m.encouragement}</p>
    </li>
  );
};

/* ------------------------------------------------------------------ *
 * The Compete section (Overview, Coding Arena, Challenges, Build-Offs, Bounties, Leaderboard & Season, Badges, History)
 * ------------------------------------------------------------------ */
export type CompeteTab =
  | 'compete'
  | 'arena'
  | 'arena-challenges'
  | 'buildoffs'
  | 'bounties'
  | 'leaderboard'
  | 'badges'
  | 'compete-history';

export const CompeteSection = ({
  subTab,
  setSubTab,
  userId,
  userName,
  isAdmin = false,
  profile,
  setProfile,
  summary,
  milestones,
  board,
  onNavigate,
  challenges = [],
  quizAttempts = [],
  arenaBootstrap,
  selectedMatchId,
  onSelectMatch,
  wsConnected,
  serverOffsetMs,
  socketRef,
  onRefreshArena,
  onNotify,
  styles,
}: {
  subTab: CompeteTab;
  setSubTab: (t: CompeteTab) => void;
  userId: string;
  userName: string;
  isAdmin?: boolean;
  profile: OnboardingProfile;
  setProfile: React.Dispatch<React.SetStateAction<OnboardingProfile>>;
  summary: GamificationSummary;
  milestones: MilestoneSummary;
  board: LeaderboardMap;
  onNavigate: (tab: string) => void;
  challenges?: any[];
  quizAttempts?: QuizAttempt[];
  arenaBootstrap: ArenaBootstrapResponse | null;
  selectedMatchId: string | null;
  onSelectMatch: (id: string | null) => void;
  wsConnected: boolean;
  serverOffsetMs: number;
  socketRef: React.MutableRefObject<ArenaSocketClient | null>;
  onRefreshArena: () => void;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  styles: Styles;
}) => {
  const { cardClass, textPrimary, textSecondary, btnPrimary, btnSecondary } = styles;
  const [mode, setMode] = useState<BoardMode>('week');
  const [skill, setSkill] = useState('');

  const actor: ArenaActorRef = useMemo(() => ({ userId, userName: userName || profile.fullName || 'Member' }), [userId, userName, profile.fullName]);

  const fit = useMemo(() => recommendChallenges(challenges, profile, quizAttempts, 3), [challenges, profile, quizAttempts]);
  const joined = profile.joinLeaderboard !== false;
  const skills = useMemo(() => boardSkills(board), [board]);
  const activeSkill = skill && skills.includes(skill) ? skill : skills[0] || '';
  const rows = useMemo(() => rankBoard(board, mode, summary.weekKey, activeSkill, joined ? userId : null), [board, mode, summary.weekKey, activeSkill, joined, userId]);
  const me = rows.find((r) => r.entry.id === userId);
  const ahead = me && me.rank > 1 ? rows[me.rank - 2] : null;

  const liveMatchesCount = useMemo(
    () => (arenaBootstrap?.matches || []).filter((m) => ['waiting', 'ready_check', 'countdown', 'active'].includes(m.status)).length,
    [arenaBootstrap?.matches]
  );
  const openBountiesCount = useMemo(
    () => (arenaBootstrap?.bounties || []).filter((b) => b.status === 'Open').length,
    [arenaBootstrap?.bounties]
  );

  const tabs: { id: CompeteTab; label: string; badge?: string | number }[] = [
    { id: 'compete', label: 'Overview' },
    { id: 'arena', label: 'Coding Arena', badge: liveMatchesCount > 0 ? liveMatchesCount : undefined },
    { id: 'arena-challenges', label: 'Daily & Weekly' },
    { id: 'buildoffs', label: 'Build-Offs & POTW' },
    { id: 'bounties', label: 'Bounty Board', badge: openBountiesCount > 0 ? openBountiesCount : undefined },
    { id: 'leaderboard', label: 'Leaderboard & Season' },
    { id: 'badges', label: 'Badges', badge: `${milestones.earnedCount}/${milestones.totalCount}` },
    { id: 'compete-history', label: 'History' },
  ];

  const pill = (active: boolean) =>
    `px-4 py-2 text-sm font-medium min-h-[44px] rounded-full cursor-pointer transition-colors ${
      active
        ? 'bg-[var(--accent-600)] text-[var(--on-spark)]'
        : 'border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)] hover:bg-[var(--surface-subtle)]'
    }`;

  return (
    <div data-tour="compete-section" className="space-y-6">
      <PageHeader
        title="Competition Centre & Coding Arena"
        description="Challenge peers in synchronized 1v1 and 2v2 coding duels, ship weekly builds, claim engineering bounties, and climb seasonal standings."
      />
      <SectionTabs tabs={tabs} active={subTab} onChange={setSubTab} />

      {/* ------------------------------------------------ OVERVIEW */}
      {subTab === 'compete' && (
        <div className="space-y-6">
          <section className="relative overflow-hidden rounded-[20px] bg-[var(--panel-deep)] text-white px-6 py-7 sm:px-10 sm:py-10">
            <Sparkle className="absolute -right-6 -bottom-10 w-52 text-[#3B82F6] opacity-25" />
            <Sparkle className="absolute right-28 top-6 w-20 text-[#3B82F6] opacity-30 hidden sm:block" />
            <Sparkle className="absolute right-12 top-28 w-12 text-white opacity-10 hidden sm:block" />
            <div className="relative max-w-2xl space-y-4">
              <p className="text-sm text-white/70">Level {summary.level.index + 1} of {LEVELS.length}</p>
              <h2 className="text-white font-semibold !text-[1.75rem] sm:!text-[2rem] leading-tight">
                {summary.level.name} <span className="text-white/60 font-medium">· {summary.totalXp} XP</span>
              </h2>
              <div
                role="progressbar"
                aria-valuenow={summary.level.pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progress to the next level"
                className="h-2 w-full rounded-full bg-white/15 overflow-hidden"
              >
                <div className="h-full rounded-full bg-[#3B82F6] transition-all duration-500" style={{ width: `${summary.level.pct}%` }} />
              </div>
              <p className="text-sm text-white/75">
                {summary.level.nextName
                  ? `${summary.level.toNext} XP until ${summary.level.nextName}. Live coding duels, verified challenges, bounties, and build-offs all count.`
                  : 'You reached the top level. Help someone else climb.'}
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSubTab('arena')}
                  className={btnPrimary}
                >
                  <Swords className="w-4 h-4" /> Enter Coding Arena
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab('arena-challenges')}
                  className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-full border border-white/25 text-white text-sm font-medium hover:bg-white/10 cursor-pointer"
                >
                  <Code2 className="w-4 h-4" /> Daily & Weekly Sprints
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab('bounties')}
                  className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-full border border-white/25 text-white text-sm font-medium hover:bg-white/10 cursor-pointer"
                >
                  <Target className="w-4 h-4" /> Bounty Board
                </button>
              </div>
            </div>
          </section>

          {/* Competition Quick Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                icon: Flame,
                label: 'Current streak',
                value: `${summary.currentStreak}`,
                unit: summary.currentStreak === 1 ? 'day' : 'days',
                sub: summary.activeToday ? 'You are active today' : summary.currentStreak > 0 ? 'Complete one task today' : `Longest: ${summary.longestStreak}`,
              },
              { icon: Zap, label: 'XP this week', value: `${summary.weekXp}`, unit: 'XP', sub: 'Weekly boards reset Monday' },
              {
                icon: Swords,
                label: 'Arena Wins',
                value: `${arenaBootstrap?.myCompetitionXp?.duelWins.length || 0}`,
                unit: `of ${(arenaBootstrap?.myCompetitionXp?.duelWins.length || 0) + (arenaBootstrap?.myCompetitionXp?.duelParticipations.length || 0)} duels`,
                sub: `${liveMatchesCount} live or open rooms`,
              },
              { icon: Award, label: 'Badges', value: `${milestones.earnedCount}`, unit: `of ${milestones.totalCount}`, sub: 'Unlocked so far' },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="soft-card p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full bg-[var(--surface-subtle)] flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <span className={`text-sm ${textSecondary}`}>{s.label}</span>
                  </div>
                  <p className={`font-display text-3xl tabular-nums leading-none ${textPrimary}`}>
                    {s.value}
                    <span className={`text-base font-sans ml-1.5 ${textSecondary}`}>{s.unit}</span>
                  </p>
                  <p className={`text-sm ${textSecondary}`}>{s.sub}</p>
                </div>
              );
            })}
          </div>

          {/* Competition Modes Directory */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                icon: Swords,
                title: '1v1 & 2v2 Coding Arena',
                desc: 'Synchronized countdowns, isolated test grading, speed & scored duels, plus private 2v2 team collaboration.',
                actionLabel: 'Open Arena',
                tab: 'arena' as CompeteTab,
              },
              {
                icon: Hammer,
                title: 'Team Build-Offs & POTW',
                desc: 'Team up on scoped weekend builds, nominate shipped work for Project of the Week, and receive judge reviews.',
                actionLabel: 'View Build-Offs',
                tab: 'buildoffs' as CompeteTab,
              },
              {
                icon: History,
                title: 'Bounties & Competition Ledger',
                desc: 'Claim verified engineering bounties (+90 XP) and inspect official seasonal results and match outcomes.',
                actionLabel: 'Explore Bounties',
                tab: 'bounties' as CompeteTab,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className={`${cardClass} p-5 flex flex-col justify-between gap-4`}>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-[var(--accent-600)]" />
                      <h3 className={`text-base font-semibold ${textPrimary}`}>{item.title}</h3>
                    </div>
                    <p className={`text-sm ${textSecondary}`}>{item.desc}</p>
                  </div>
                  <button type="button" onClick={() => setSubTab(item.tab)} className={btnSecondary}>
                    {item.actionLabel}
                  </button>
                </article>
              );
            })}
          </div>

          {fit.items.length > 0 && (
            <section aria-label="Challenges for your level" className={`${cardClass} p-5 space-y-3`}>
              <h3 className={`font-semibold ${textPrimary}`}>Recommended Sprints</h3>
              <ul className="divide-y divide-[var(--border-hairline)]">
                {fit.items.map((c: any) => (
                  <li key={c.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate ${textPrimary}`}>{c.title}</p>
                      <p className={`text-xs ${textSecondary}`}>{c.difficulty}</p>
                    </div>
                    <button type="button" onClick={() => setSubTab('arena-challenges')} className="min-h-11 px-3 text-sm text-[var(--accent-700)] hover:underline cursor-pointer shrink-0">Open Sprints</button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <section className={`${cardClass} p-6 space-y-4`}>
              <div className="space-y-1">
                <h3 className={`text-lg ${textPrimary}`}>How you earn XP</h3>
                <p className={`text-sm ${textSecondary}`}>Points reward real learning and verified competition outcomes. Repeating the same task earns nothing extra.</p>
              </div>
              <ul className="divide-y divide-[var(--border-hairline)]">
                {XP_RULES.map((r) => (
                  <li key={r.kind} className="flex items-center justify-between gap-4 py-3">
                    <span className="min-w-0">
                      <span className={`block text-sm font-medium ${textPrimary}`}>{r.label}</span>
                      <span className={`block text-xs ${textSecondary}`}>{r.note}</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-[var(--accent-700)] shrink-0">+{r.xp} XP</span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-4 py-3">
                  <span className="min-w-0">
                    <span className={`block text-sm font-medium ${textPrimary}`}>Streak bonuses</span>
                    <span className={`block text-xs ${textSecondary}`}>
                      {STREAK_BONUSES.map((b) => `${b.days} days`).join(', ')}
                    </span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-[var(--accent-700)] shrink-0">
                    +{STREAK_BONUSES[0].xp} to +{STREAK_BONUSES[STREAK_BONUSES.length - 1].xp} XP
                  </span>
                </li>
              </ul>
            </section>

            <div className="space-y-6">
              <section className={`${cardClass} p-6 space-y-4`}>
                <div className="space-y-1">
                  <h3 className={`text-lg ${textPrimary}`}>Your personal bests</h3>
                  <p className={`text-sm ${textSecondary}`}>Compete with who you were last week.</p>
                </div>
                {summary.bests.length > 0 ? (
                  <ul className="divide-y divide-[var(--border-hairline)]">
                    {summary.bests.map((b) => (
                      <li key={b.id} className="py-3 space-y-2">
                        <div className="flex items-center justify-between gap-4">
                          <span className="min-w-0">
                            <span className={`block text-sm font-medium ${textPrimary}`}>{b.label}</span>
                            {b.detail && <span className={`block text-xs truncate ${textSecondary}`}>{b.detail}</span>}
                          </span>
                          <span className={`text-sm font-semibold tabular-nums shrink-0 ${textPrimary}`}>{b.value}</span>
                        </div>
                        {b.from !== undefined && b.to !== undefined && (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-xs tabular-nums">
                              <span className={textSecondary}>{b.from}%</span>
                              <ArrowRight className="w-3.5 h-3.5 text-[var(--accent-600)]" aria-hidden="true" />
                              <span className="font-semibold text-[var(--accent-700)]">{b.to}%</span>
                            </div>
                            <ProgressBar value={b.to} />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={`text-sm ${textSecondary}`}>Take a quiz, enter a duel, or submit an exercise to set your first personal best.</p>
                )}
              </section>

              <section className={`${cardClass} p-6 space-y-4`}>
                <h3 className={`text-lg ${textPrimary}`}>Recent XP</h3>
                {summary.recent.length > 0 ? (
                  <ul className="divide-y divide-[var(--border-hairline)]">
                    {summary.recent.map((e) => (
                      <li key={e.key} className="flex items-center justify-between gap-4 py-2.5">
                        <span className={`text-sm truncate ${textPrimary}`}>{e.label}</span>
                        <span className="text-sm font-semibold tabular-nums text-[var(--accent-700)] shrink-0">+{e.xp} XP</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={`text-sm ${textSecondary}`}>New XP appears here as you learn and compete.</p>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ CODING ARENA */}
      {subTab === 'arena' && (
        <ArenaMatchRoom
          actor={actor}
          isAdmin={isAdmin}
          matches={arenaBootstrap?.matches || []}
          selectedMatchId={selectedMatchId}
          onSelectMatch={onSelectMatch}
          problems={arenaBootstrap?.problems || []}
          sandbox={arenaBootstrap?.sandbox || null}
          wsConnected={wsConnected}
          serverOffsetMs={serverOffsetMs}
          socketRef={socketRef}
          onMatchesChanged={onRefreshArena}
          onNotify={onNotify}
          styles={styles}
        />
      )}

      {/* ------------------------------------------------ DAILY & WEEKLY CHALLENGES */}
      {subTab === 'arena-challenges' && (
        <ArenaChallengesPanel
          actor={actor}
          challenges={arenaBootstrap?.challenges || []}
          problems={arenaBootstrap?.problems || []}
          onChanged={onRefreshArena}
          onNotify={onNotify}
          styles={styles}
        />
      )}

      {/* ------------------------------------------------ TEAM BUILD-OFFS & POTW */}
      {subTab === 'buildoffs' && (
        <BuildOffAndPotwPanel
          actor={actor}
          buildOffs={arenaBootstrap?.buildOffs || []}
          potwNominations={arenaBootstrap?.potwNominations || []}
          onChanged={onRefreshArena}
          onNotify={onNotify}
          styles={styles}
        />
      )}

      {/* ------------------------------------------------ BOUNTY BOARD */}
      {subTab === 'bounties' && (
        <BountyBoardPanel
          actor={actor}
          bounties={arenaBootstrap?.bounties || []}
          onChanged={onRefreshArena}
          onNotify={onNotify}
          styles={styles}
        />
      )}

      {/* ------------------------------------------------ LEADERBOARD & SEASON */}
      {subTab === 'leaderboard' && (
        <div className="space-y-8">
          <SeasonStandingsPanel
            seasons={arenaBootstrap?.seasons || []}
            standings={arenaBootstrap?.seasonStandings || []}
            myUserId={userId}
            onNavigateTab={() => setSubTab('arena')}
            styles={styles}
          />

          <div className="space-y-4 pt-4 border-t border-[var(--border-hairline)]">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Leaderboard type">
              <button type="button" aria-pressed={mode === 'week'} onClick={() => setMode('week')} className={pill(mode === 'week')}>This week</button>
              <button type="button" aria-pressed={mode === 'all'} onClick={() => setMode('all')} className={pill(mode === 'all')}>All time</button>
              <button type="button" aria-pressed={mode === 'skill'} onClick={() => setMode('skill')} className={pill(mode === 'skill')}>By skill</button>
              {mode === 'skill' && skills.length > 0 && (
                <select
                  aria-label="Skill"
                  value={activeSkill}
                  onChange={(e) => setSkill(e.target.value)}
                  className="px-4 text-sm"
                >
                  {skills.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}
            </div>

            {mode === 'skill' && skills.length === 0 ? (
              <EmptyState
                title="No skill rankings yet"
                description="Skills appear once members submit exercises in a language, such as Python or JavaScript."
                actionLabel="Go to My Learning"
                onAction={() => onNavigate('submissions')}
              />
            ) : (
              <section className={`${cardClass} p-2 sm:p-4`}>
                <div className="px-4 pt-3 pb-2 flex items-end justify-between gap-3">
                  <div className="space-y-0.5">
                    <h2 className={`text-lg ${textPrimary}`}>
                      {mode === 'week' ? 'Top this week' : mode === 'all' ? 'Top of all time' : `${activeSkill} champions`}
                    </h2>
                    <p className={`text-sm ${textSecondary}`}>
                      {mode === 'week' ? 'Resets every Monday, so everyone starts fresh.' : mode === 'all' ? 'Total XP earned from real activity.' : 'XP earned from exercises and projects in this skill.'}
                    </p>
                  </div>
                </div>
                {rows.length > 0 ? (
                  <ol className="divide-y divide-[var(--border-hairline)]">
                    {rows.slice(0, 20).map((r) => {
                      const isMe = r.entry.id === userId;
                      return (
                        <li
                          key={r.entry.id}
                          aria-current={isMe ? 'true' : undefined}
                          className={`flex items-center gap-4 px-4 py-3.5 rounded-xl ${isMe ? 'bg-[var(--accent-50)]' : ''}`}
                        >
                          <span className={`w-7 text-center font-display text-lg tabular-nums shrink-0 ${r.rank <= 3 ? 'text-[var(--accent-700)]' : textSecondary}`}>
                            {r.rank}
                          </span>
                          <span aria-hidden="true" className="w-9 h-9 rounded-full bg-[var(--panel-deep)] text-white text-xs font-semibold flex items-center justify-center shrink-0">
                            {initialsOf(r.entry.name)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-sm font-semibold truncate ${textPrimary}`}>
                              {r.entry.name}
                              {isMe && <span className="ml-2 text-xs font-medium text-[var(--accent-700)]">You</span>}
                            </span>
                            <span className={`block text-xs ${textSecondary}`}>
                              {r.entry.level}
                              {r.entry.streak > 0 ? ` · ${r.entry.streak}-day streak` : ''}
                              {r.entry.badges > 0 ? ` · ${r.entry.badges} badges` : ''}
                            </span>
                          </span>
                          <span className={`text-sm font-semibold tabular-nums shrink-0 ${textPrimary}`}>{r.value} XP</span>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <div className="px-4 pb-6">
                    <EmptyState
                      title={mode === 'week' ? 'A fresh week, a fresh start' : 'No one is on the board yet'}
                      description="Complete a duel, lesson, quiz or exercise to put the first genuine points on the board."
                      actionLabel="Enter Coding Arena"
                      onAction={() => setSubTab('arena')}
                    />
                  </div>
                )}
              </section>
            )}

            {joined && me && (
              <p className={`flex items-start gap-2 text-sm ${textSecondary}`}>
                <TrendingUp className="w-4 h-4 mt-1 shrink-0 text-[var(--accent-600)]" aria-hidden="true" />
                {me.rank === 1
                  ? 'You are in first place.'
                  : ahead
                  ? `You are ${ahead.value - me.value} XP behind ${ahead.entry.name}.`
                  : ''}
              </p>
            )}

            <section className={`${cardClass} p-5 flex flex-wrap items-center justify-between gap-4`}>
              <span className="min-w-0 space-y-0.5">
                <span className={`block text-sm font-semibold ${textPrimary}`}>Show me on leaderboards</span>
                <span className={`block text-sm max-w-[56ch] ${textSecondary}`}>
                  Prefer to learn without rankings? Turn this off and your row disappears. You keep your XP, streak and badges.
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={joined}
                aria-label="Show me on leaderboards"
                onClick={() => setProfile((p) => ({ ...p, joinLeaderboard: !(p.joinLeaderboard !== false) }))}
                className={`relative w-12 h-7 rounded-full shrink-0 cursor-pointer transition-colors ${joined ? 'bg-[var(--accent-600)]' : 'bg-[var(--border-strong)]'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white transition-transform ${joined ? 'translate-x-5' : ''}`} />
              </button>
            </section>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ BADGES */}
      {subTab === 'badges' && (
        <div className="space-y-8">
          <section className={`${cardClass} p-6 space-y-4`}>
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div className="space-y-1">
                <h2 className={`text-lg ${textPrimary}`}>Your achievements</h2>
                <p className={`text-sm max-w-[52ch] ${textSecondary}`}>Badges celebrate steady learning and verified competitive wins.</p>
              </div>
              <p className={`font-display text-4xl tabular-nums leading-none ${textPrimary}`}>
                {milestones.earnedCount}
                <span className={`text-base font-sans ml-1.5 ${textSecondary}`}>of {milestones.totalCount} unlocked</span>
              </p>
            </div>
            <div role="img" aria-label={`${milestones.earnedCount} of ${milestones.totalCount} badges unlocked`} className="flex gap-1">
              {milestones.milestones.map((m) => (
                <span key={m.id} className={`h-1.5 flex-1 rounded-full ${m.earned ? 'bg-[var(--accent-600)]' : 'bg-[var(--border-hairline)]'}`} />
              ))}
            </div>
          </section>

          {CATEGORY_ORDER.map((cat) => {
            const list = milestones.milestones.filter((m) => (m.category || 'Learning') === cat);
            if (list.length === 0) return null;
            return (
              <section key={cat} className="space-y-4">
                <div className="space-y-0.5">
                  <h2 className={`text-xl ${textPrimary}`}>{cat}</h2>
                  <p className={`text-sm ${textSecondary}`}>{CATEGORY_BLURB[cat]}</p>
                </div>
                <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                  {list.map((m) => (
                    <BadgeTile key={m.id} m={m} textPrimary={textPrimary} textSecondary={textSecondary} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------ HISTORY */}
      {subTab === 'compete-history' && (
        <CompetitionHistoryPanel
          history={arenaBootstrap?.history || []}
          onOpenArena={() => setSubTab('arena')}
          styles={styles}
        />
      )}
    </div>
  );
};
