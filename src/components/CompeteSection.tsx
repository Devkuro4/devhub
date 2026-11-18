import React, { useMemo, useState } from 'react';
import { recommendChallenges } from '../lib/adaptive';
import { ArrowRight, Award, Check, Flame, Lock, TrendingUp, Zap } from 'lucide-react';
import { EmptyState, PageHeader, ProgressBar, SectionTabs, Sparkle } from './ui';
import { MilestoneIcon } from './MilestoneBadges';
import { XP_RULES, STREAK_BONUSES, LEVELS, boardSkills, rankBoard, type BoardMode, type GamificationSummary } from '../lib/gamification';
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
    <section className="soft-card p-6 space-y-4" aria-label="Your level">
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
 * The Compete section
 * ------------------------------------------------------------------ */
export type CompeteTab = 'compete' | 'leaderboard' | 'badges';

export const CompeteSection = ({
  subTab,
  setSubTab,
  userId,
  userName,
  profile,
  setProfile,
  summary,
  milestones,
  board,
  onNavigate,
  challenges = [],
  quizAttempts = [],
  styles,
}: {
  subTab: CompeteTab;
  setSubTab: (t: CompeteTab) => void;
  userId: string;
  userName: string;
  profile: OnboardingProfile;
  setProfile: React.Dispatch<React.SetStateAction<OnboardingProfile>>;
  summary: GamificationSummary;
  milestones: MilestoneSummary;
  board: LeaderboardMap;
  onNavigate: (tab: string) => void;
  challenges?: any[];
  quizAttempts?: QuizAttempt[];
  styles: Styles;
}) => {
  const { cardClass, textPrimary, textSecondary } = styles;
  const [mode, setMode] = useState<BoardMode>('week');
  const [skill, setSkill] = useState('');

  const fit = useMemo(() => recommendChallenges(challenges, profile, quizAttempts, 3), [challenges, profile, quizAttempts]);
  const joined = profile.joinLeaderboard !== false;
  const skills = useMemo(() => boardSkills(board), [board]);
  const activeSkill = skill && skills.includes(skill) ? skill : skills[0] || '';
  const rows = useMemo(() => rankBoard(board, mode, summary.weekKey, activeSkill, joined ? userId : null), [board, mode, summary.weekKey, activeSkill, joined, userId]);
  const me = rows.find((r) => r.entry.id === userId);
  const ahead = me && me.rank > 1 ? rows[me.rank - 2] : null;

  const tabs: { id: CompeteTab; label: string; badge?: string | number }[] = [
    { id: 'compete', label: 'Overview' },
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'badges', label: 'Badges', badge: `${milestones.earnedCount}/${milestones.totalCount}` },
  ];

  const pill = (active: boolean) =>
    `px-4 py-2 text-sm font-medium min-h-[44px] rounded-full cursor-pointer transition-colors ${
      active
        ? 'bg-[var(--accent-600)] text-[var(--on-spark)]'
        : 'border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)] hover:bg-[var(--surface-subtle)]'
    }`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compete"
        description="Earn XP for real learning, build a streak at your own pace, and see how you grow. Competing is always optional."
      />
      <SectionTabs tabs={tabs} active={subTab} onChange={setSubTab} />

      {/* ------------------------------------------------ OVERVIEW */}
      {subTab === 'compete' && (
        <div className="space-y-6">
          {fit.items.length > 0 && (
            <section aria-label="Challenges for your level" className={`${cardClass} p-5 space-y-3`}>
              <h3 className={`font-semibold ${textPrimary}`}>Challenges for your level</h3>
              <ul className="divide-y divide-[var(--border-hairline)]">
                {fit.items.map((c: any) => (
                  <li key={c.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate ${textPrimary}`}>{c.title}</p>
                      <p className={`text-xs ${textSecondary}`}>{c.difficulty}</p>
                    </div>
                    <button type="button" onClick={() => onNavigate('challenges')} className="min-h-11 px-3 text-sm text-[var(--accent-700)] hover:underline cursor-pointer shrink-0">Try it</button>
                  </li>
                ))}
              </ul>
              <p className={`text-xs ${textSecondary}`}>Competition should help you grow. These match your level, and harder ones unlock as your results improve.</p>
            </section>
          )}
          <section className="relative overflow-hidden rounded-[20px] bg-[var(--panel-deep)] text-white px-7 py-8 sm:px-10 sm:py-10">
            <Sparkle className="absolute -right-6 -bottom-10 w-52 text-[#3B82F6] opacity-25" />
            <Sparkle className="absolute right-28 top-6 w-20 text-[#3B82F6] opacity-30 hidden sm:block" />
            <Sparkle className="absolute right-12 top-28 w-12 text-white opacity-10 hidden sm:block" />
            <div className="relative max-w-xl space-y-4">
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
                  ? `${summary.level.toNext} XP until ${summary.level.nextName}. Every lesson, quiz and project counts.`
                  : 'You reached the top level. Help someone else climb.'}
              </p>
            </div>
          </section>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              {
                icon: Flame,
                label: 'Current streak',
                value: `${summary.currentStreak}`,
                unit: summary.currentStreak === 1 ? 'day' : 'days',
                sub: summary.activeToday ? 'You are active today' : summary.currentStreak > 0 ? 'Do one thing today to keep it going' : `Longest so far: ${summary.longestStreak}`,
              },
              { icon: Zap, label: 'XP this week', value: `${summary.weekXp}`, unit: 'XP', sub: 'Weekly boards reset every Monday' },
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <section className={`${cardClass} p-6 space-y-4`}>
              <div className="space-y-1">
                <h3 className={`text-lg ${textPrimary}`}>How you earn XP</h3>
                <p className={`text-sm ${textSecondary}`}>Points reward real learning. Repeating the same task will not earn more.</p>
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
                  <p className={`text-sm ${textSecondary}`}>Take a quiz or submit an exercise and your first personal best shows up here.</p>
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
                  <p className={`text-sm ${textSecondary}`}>New XP appears here as you learn. Your progress so far already counts toward your total.</p>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ LEADERBOARD */}
      {subTab === 'leaderboard' && (
        <div className="space-y-6">
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
                    {mode === 'week' ? 'Resets every Monday, so everyone starts fresh.' : mode === 'all' ? 'Total XP since the start.' : 'XP earned from exercises and projects in this skill.'}
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
                    description="Complete a lesson, quiz or exercise to put the first points on the board."
                    actionLabel="Start learning"
                    onAction={() => onNavigate('today')}
                  />
                </div>
              )}
            </section>
          )}

          {joined && me && (
            <p className={`flex items-start gap-2 text-sm ${textSecondary}`}>
              <TrendingUp className="w-4 h-4 mt-1 shrink-0 text-[var(--accent-600)]" aria-hidden="true" />
              {me.rank === 1
                ? 'You are in first place. Cheer on whoever is catching up.'
                : ahead
                ? `You are ${ahead.value - me.value} XP behind ${ahead.entry.name}. One quiz or exercise could close that gap.`
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
      )}

      {/* ------------------------------------------------ BADGES */}
      {subTab === 'badges' && (
        <div className="space-y-8">
          <section className={`${cardClass} p-6 space-y-4`}>
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div className="space-y-1">
                <h2 className={`text-lg ${textPrimary}`}>Your achievements</h2>
                <p className={`text-sm max-w-[52ch] ${textSecondary}`}>Badges also appear on your profile. There is no rush; they are here when you are ready.</p>
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
    </div>
  );
};

