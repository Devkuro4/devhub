import React from 'react';
import { CheckCircle2, Circle, Compass } from 'lucide-react';
import { ProgressBar } from './ui';
import type { IndependenceSummary } from '../lib/independence';

/**
 * Shows the member's independence score, the journey from your vision
 * (Learn, Practise, Demonstrate, Build, Collaborate, Independent), and one clear next tip.
 */
export const IndependenceCard = ({
  summary,
  styles,
  onOpenMentor,
}: {
  summary: IndependenceSummary;
  styles: {
    cardClass: string;
    borderClass: string;
    subtleBgClass: string;
    textPrimary: string;
    textSecondary: string;
  };
  onOpenMentor?: () => void;
}) => {
  const { cardClass, borderClass, subtleBgClass, textPrimary, textSecondary } = styles;
  const { score, label, tip, components, stages, helpByLevel, workDone } = summary;
  const nextStage = stages.find((s) => !s.reached);

  const rows: { name: string; value: number | null; note: string }[] = [
    { name: 'Self-reliance', value: components.selfReliance, note: 'Finished work compared with AI help' },
    { name: 'Understanding', value: components.understanding, note: 'Quiz results and explaining your code' },
    { name: 'Building', value: components.building, note: 'Projects submitted, not just started' },
  ];

  return (
    <section className={`${cardClass} p-6 space-y-6`} aria-label="Your independence">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h2 className={`font-display text-xl ${textPrimary}`}>Your independence</h2>
          <p className={`text-sm ${textSecondary}`}>
            Can you do it yourself? Based on your last 30 days.
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-display text-4xl font-bold leading-none tabular-nums text-[var(--signal-ink)] dark:text-[var(--signal)]">
            {score === null ? '–' : score}
          </div>
          <div className={`text-sm mt-1.5 ${textSecondary}`}>{label}</div>
        </div>
      </div>

      <ul className="space-y-5">
        {rows.map((r) => (
          <li key={r.name} className="space-y-3">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={`font-semibold ${textPrimary}`}>{r.name}</span>
              <span className={`tabular-nums ${textSecondary}`}>{r.value === null ? 'No data yet' : `${r.value}%`}</span>
            </div>
            <ProgressBar value={r.value ?? 0} />
            <p className={`text-sm leading-snug ${textSecondary}`}>{r.note}</p>
          </li>
        ))}
      </ul>

      <div className={`pt-5 border-t ${borderClass}`}>
        <h3 className={`text-base font-semibold mb-3 ${textPrimary}`}>Your journey</h3>
        <ol className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {stages.map((s) => (
            <li key={s.id} className="flex items-center gap-2.5 text-sm" title={s.hint}>
              {s.reached ? (
                <CheckCircle2 className="w-[18px] h-[18px] shrink-0 text-[var(--success-ink)]" aria-label="Reached" />
              ) : (
                <Circle className={`w-[18px] h-[18px] shrink-0 ${textSecondary}`} aria-label="Not yet" />
              )}
              <span className={s.reached ? `font-medium ${textPrimary}` : textSecondary}>{s.label}</span>
            </li>
          ))}
        </ol>
        {nextStage && (
          <p className={`text-sm mt-4 ${textSecondary}`}>
            Next: <span className={`font-medium ${textPrimary}`}>{nextStage.label}</span>. {nextStage.hint}.
          </p>
        )}
      </div>

      <div className={`rounded-[12px] ${subtleBgClass} p-4 text-sm leading-relaxed ${textSecondary} space-y-3`}>
        <p className={textPrimary}>{tip}</p>
        <p>
          This month: {workDone} finished {workDone === 1 ? 'task' : 'tasks'}. Mentor help: {helpByLevel[1]} nudge
          {helpByLevel[1] === 1 ? '' : 's'}, {helpByLevel[2]} hint{helpByLevel[2] === 1 ? '' : 's'},{' '}
          {helpByLevel[3]} walkthrough{helpByLevel[3] === 1 ? '' : 's'}.
          {onOpenMentor && (
            <>
              {' '}
              <button type="button" onClick={onOpenMentor} className="font-medium text-[var(--accent-700)] dark:text-[var(--accent-600)] underline underline-offset-4 cursor-pointer">
                Open mentor
              </button>
            </>
          )}
        </p>
      </div>
    </section>
  );
};
