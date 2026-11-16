import React from 'react';
import {
  Award,
  CalendarCheck2,
  ClipboardCheck,
  Code2,
  Compass,
  HeartHandshake,
  Library,
  Rocket,
  Sprout,
} from 'lucide-react';
import type { MemberMilestone, MilestoneSummary, MilestoneTone } from '../types';

// All badge tones share one palette so the Home strip matches the Profile block.
const EARNED = {
  earned: 'border-[var(--accent-500)]/30 bg-[var(--accent-50)] text-[var(--ink-primary)]',
  iconWrap: 'bg-[var(--accent-100)] text-[var(--accent-600)]',
};
const TONE_CLASSES: Record<MilestoneTone, { earned: string; iconWrap: string }> = {
  emerald: EARNED,
  amber: EARNED,
  sky: EARNED,
  violet: EARNED,
  rose: EARNED,
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
    default:
      return <Award className={className} />;
  }
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
    <div className={`pt-3 border-t ${borderClass} space-y-2.5`}>
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
          className="text-[11px] font-medium text-[var(--accent-600)] hover:underline cursor-pointer"
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
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium ${palette.earned}`}
              >
                <span className={`w-4 h-4 rounded flex items-center justify-center ${palette.iconWrap}`}>
                  <MilestoneIcon icon={m.icon} className="w-3 h-3" />
                </span>
                <span>{m.title}</span>
              </span>
            );
          })}
        </div>
      ) : (
        <p className={`text-[11px] ${textSecondary}`}>
          Your first badge unlocks as soon as you save a daily check-in, share a resource, or submit code.
        </p>
      )}

      {nextUp && (
        <div className={`px-2.5 py-1.5 rounded-lg border ${borderClass} ${subtleBgClass} flex items-center justify-between gap-2 text-[11px]`}>
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
    <div className={`${cardClass} p-5 sm:p-8 space-y-6`}>
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

      <div className="space-y-2.5">
        <h4 className={`text-sm font-semibold ${textPrimary}`}>Unlocked</h4>
        {earned.length > 0 ? (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {earned.map((m) => (
              <li
                key={m.id}
                className={`flex items-start gap-3 p-3.5 rounded-lg border ${borderClass} border-l-4 !border-l-[var(--accent-600)] bg-[var(--accent-50)]`}
              >
                <span className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center bg-[var(--accent-100)] text-[var(--accent-600)]">
                  <MilestoneIcon icon={m.icon} className="w-4 h-4" />
                </span>
                <span className="min-w-0 space-y-0.5">
                  <span className={`block text-sm font-semibold ${textPrimary}`}>{m.title}</span>
                  <span className={`block text-[13px] leading-relaxed ${textSecondary}`}>{m.encouragement}</span>
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
        <div className={`space-y-2.5 pt-5 border-t ${borderClass}`}>
          <h4 className={`text-sm font-semibold ${textPrimary}`}>Still to go</h4>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            {remaining.map((m) => {
              const pct = Math.min(100, Math.round((m.current / m.target) * 100));
              return (
                <li key={m.id} className="flex items-start gap-3">
                  <span className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center bg-[var(--surface-subtle)] text-[var(--ink-secondary)]">
                    <MilestoneIcon icon={m.icon} className="w-4 h-4" />
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`text-sm font-medium ${textPrimary}`}>{m.title}</span>
                      <span className={`text-[13px] font-mono tabular-nums shrink-0 ${textSecondary}`}>
                        {m.current}/{m.target}
                      </span>
                    </span>
                    <span className={`block text-[13px] leading-relaxed ${textSecondary}`}>{m.requirementLabel}</span>
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
