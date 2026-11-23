import React from 'react';
import {
  Award,
  CalendarCheck2,
  ClipboardCheck,
  Code2,
  Compass,
  Flame,
  GraduationCap,
  HeartHandshake,
  Library,
  Lock,
  Moon,
  Puzzle,
  Rocket,
  Sprout,
  Swords,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import type { MemberMilestone, MilestoneSummary, MilestoneTone } from '../types';

const TONE_CLASSES: Record<MilestoneTone, { earned: string; medal: string; ribbon: string }> = {
  emerald: { earned: 'bg-[var(--pastel-aqua)]', medal: 'bg-[#205E56] text-white', ribbon: 'bg-[#78B8AF]' },
  amber: { earned: 'bg-[var(--pastel-yellow)]', medal: 'bg-[#8A5A08] text-white', ribbon: 'bg-[#E8B94E]' },
  sky: { earned: 'bg-[#CFE1F4] dark:bg-[#243C54]', medal: 'bg-[#245B88] text-white', ribbon: 'bg-[#6FA6D1]' },
  violet: { earned: 'bg-[var(--pastel-lilac)]', medal: 'bg-[#624887] text-white', ribbon: 'bg-[#A98CC8]' },
  rose: { earned: 'bg-[var(--pastel-pink)]', medal: 'bg-[#8B3F63] text-white', ribbon: 'bg-[#D884AA]' },
};

export function MilestoneIcon({
  icon,
  className = 'w-3.5 h-3.5',
}: {
  icon: MemberMilestone['icon'];
  className?: string;
}) {
  switch (icon) {
    case 'seedling':
      return <Sprout className={className} />;
    case 'logs':
      return <CalendarCheck2 className={className} />;
    case 'resources':
      return <Library className={className} />;
    case 'peer':
      return <HeartHandshake className={className} />;
    case 'code':
      return <Code2 className={className} />;
    case 'roadmap':
      return <Compass className={className} />;
    case 'quiz':
      return <ClipboardCheck className={className} />;
    case 'project':
      return <Rocket className={className} />;
    case 'streak':
      return <Flame className={className} />;
    case 'night':
      return <Moon className={className} />;
    case 'quiz-master':
      return <GraduationCap className={className} />;
    case 'solver':
      return <Puzzle className={className} />;
    case 'team':
      return <Users className={className} />;
    case 'level':
      return <TrendingUp className={className} />;
    case 'duel':
      return <Swords className={className} />;
    case 'bounty':
      return <Target className={className} />;
    case 'trophy':
      return <Trophy className={className} />;
    default:
      return <Award className={className} />;
  }
}

export function AchievementBadgeMark({
  milestone,
  earned = milestone.earned,
  size = 'md',
}: {
  milestone: MemberMilestone;
  earned?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const palette = TONE_CLASSES[milestone.tone];
  const dimensions = size === 'sm' ? 'w-8 h-10' : size === 'lg' ? 'w-16 h-[4.75rem]' : 'w-12 h-14';
  const medalSize = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-14 h-14' : 'w-11 h-11';
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5';

  return (
    <span className={`relative inline-flex justify-center shrink-0 ${dimensions}`} aria-hidden="true">
      <span className={`absolute bottom-0 left-[20%] h-[42%] w-[27%] rotate-[8deg] rounded-b-sm ${earned ? palette.ribbon : 'bg-[var(--border-strong)]'}`} />
      <span className={`absolute bottom-0 right-[20%] h-[42%] w-[27%] -rotate-[8deg] rounded-b-sm ${earned ? palette.ribbon : 'bg-[var(--border-strong)]'}`} />
      <span className={`relative z-10 rounded-full border-[3px] border-[var(--surface-elevated)] shadow-sm flex items-center justify-center ${medalSize} ${earned ? palette.medal : 'bg-[var(--surface-subtle)] text-[var(--ink-muted)]'}`}>
        {earned ? <MilestoneIcon icon={milestone.icon} className={iconSize} /> : <Lock className={iconSize} />}
      </span>
    </span>
  );
}

/**
 * Compact badge strip for HomeDashboard: displays earned small badge icons
 * plus the closest upcoming milestone to encourage steady progress.
 */
export const DashboardMilestoneStrip = ({
  summary,
  borderClass,
  subtleBgClass,
  textPrimary,
  textSecondary,
  onOpenProfile,
}: {
  summary: MilestoneSummary;
  borderClass: string;
  subtleBgClass: string;
  textPrimary: string;
  textSecondary: string;
  onOpenProfile: () => void;
}) => {
  const nextUp = [...summary.upcoming].sort((a, b) => b.current / b.target - a.current / a.target)[0];

  return (
    <div className={`pt-3 border-t ${borderClass} space-y-3`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Award className="w-3.5 h-3.5 text-[var(--accent-600)]" />
          <span className={`text-xs font-semibold ${textPrimary}`}>
            Milestones ({summary.earnedCount}/{summary.totalCount})
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenProfile}
          className="text-xs font-medium text-[var(--accent-600)] hover:underline cursor-pointer"
        >
          View all badges →
        </button>
      </div>

      {summary.earned.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {summary.earned.map((m) => {
            const palette = TONE_CLASSES[m.tone];
            return (
              <span
                key={m.id}
                title={`${m.title} (${m.requirementLabel}) — ${m.encouragement}`}
                className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold ${palette.earned}`}
              >
                <AchievementBadgeMark milestone={m} size="sm" />
                <span>{m.title}</span>
              </span>
            );
          })}
        </div>
      ) : (
        <p className={`text-xs ${textSecondary}`}>
          Your first badge unlocks as soon as you save a daily check-in, share a resource, or submit code.
        </p>
      )}

      {nextUp && (
        <div className={`px-2.5 py-1.5 rounded-lg border ${borderClass} ${subtleBgClass} flex items-center justify-between gap-2 text-xs`}>
          <span className={`inline-flex items-center gap-1.5 min-w-0 ${textSecondary}`}>
            <MilestoneIcon icon={nextUp.icon} className="w-3 h-3 shrink-0 text-[var(--accent-600)]" />
            <span className="truncate">
              Next: <strong className={textPrimary}>{nextUp.title}</strong> ({nextUp.requirementLabel})
            </span>
          </span>
          <span className={`font-mono tabular-nums shrink-0 ${textSecondary}`}>
            {nextUp.current}/{nextUp.target}
          </span>
        </div>
      )}
    </div>
  );
};

/**
 * Full milestone showcase for ProfileSection: one block that groups every
 * unlocked badge together, with gentle progress toward the rest.
 */
export const ProfileMilestonesCard = ({
  summary,
  cardClass,
  borderClass,
  textPrimary,
  textSecondary,
}: {
  summary: MilestoneSummary;
  cardClass: string;
  borderClass: string;
  subtleBgClass: string;
  textPrimary: string;
  textSecondary: string;
}) => {
  const earned = summary.milestones.filter((m) => m.earned);
  const remaining = summary.milestones.filter((m) => !m.earned);

  return (
    <div className={`${cardClass} p-6 sm:p-8 space-y-6`}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="space-y-1 min-w-0">
          <h3 className={`text-lg ${textPrimary}`}>Milestones and badges</h3>
          <p className={`text-sm max-w-[52ch] ${textSecondary}`}>
            Celebrating steady practice and helpful contributions, at your own pace.
          </p>
        </div>
        <p className={`font-display text-4xl tabular-nums leading-none ${textPrimary}`}>
          {summary.earnedCount}
          <span className={`text-base font-sans ml-1.5 ${textSecondary}`}>of {summary.totalCount} unlocked</span>
        </p>
      </div>

      <div
        role="img"
        aria-label={`${summary.earnedCount} of ${summary.totalCount} milestones unlocked`}
        className="flex gap-1"
      >
        {summary.milestones.map((m) => (
          <span
            key={m.id}
            className={`h-1.5 flex-1 rounded-full ${m.earned ? 'bg-[var(--accent-600)]' : 'bg-[var(--border-hairline)]'}`}
          />
        ))}
      </div>

      <div className="space-y-3">
        <h4 className={`text-sm font-semibold ${textPrimary}`}>Unlocked</h4>
        {earned.length > 0 ? (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {earned.map((m) => (
              <li
                key={m.id}
                className={`flex items-start gap-4 p-4 rounded-2xl ${TONE_CLASSES[m.tone].earned}`}
              >
                <AchievementBadgeMark milestone={m} size="lg" />
                <span className="min-w-0 space-y-0.5">
                  <span className={`block text-sm font-semibold ${textPrimary}`}>{m.title}</span>
                  <span className={`block text-sm leading-relaxed ${textSecondary}`}>{m.encouragement}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`text-sm ${textSecondary}`}>
            Your first badge unlocks when you save a daily check-in, share a resource, or submit code.
          </p>
        )}
      </div>

      {remaining.length > 0 && (
        <div className={`space-y-3 pt-5 border-t ${borderClass}`}>
          <h4 className={`text-sm font-semibold ${textPrimary}`}>Still to go</h4>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            {remaining.map((m) => {
              const pct = Math.min(100, Math.round((m.current / m.target) * 100));
              return (
                <li key={m.id} className="flex items-start gap-3">
                  <AchievementBadgeMark milestone={m} earned={false} size="md" />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`text-sm font-medium ${textPrimary}`}>{m.title}</span>
                      <span className={`text-sm font-mono tabular-nums shrink-0 ${textSecondary}`}>
                        {m.current}/{m.target}
                      </span>
                    </span>
                    <span className={`block text-sm leading-relaxed ${textSecondary}`}>{m.requirementLabel}</span>
                    <span className="block h-1.5 w-full rounded-full bg-[var(--border-hairline)] overflow-hidden">
                      <span className="block h-full rounded-full bg-[var(--spark)]" style={{ width: `${pct}%` }} />
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
