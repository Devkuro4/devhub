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
    <section className={`${cardClass} p-5 space-y-4`} aria-label="Independence">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className={`font-display text-lg flex items-center gap-2 ${textPrimary}`}>
            <Compass className="w-4 h-4 text-[var(--accent-600)]" /> Your independence
          </h2>
          <p className={`text-xs mt-1 ${textSecondary}`}>
            Dev Hub measures whether you can do it yourself, not how many videos you watched. Last 30 days.
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className={`font-display text-3xl font-bold leading-none ${textPrimary}`}>{score === null ? '–' : score}</div>
          <div className={`text-xs mt-1 ${textSecondary}`}>{label}</div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.name} className={`rounded-xl border ${borderClass} ${subtleBgClass} p-3 space-y-2`}>
            <div className="flex items-center justify-between text-xs">
              <span className={`font-medium ${textPrimary}`}>{r.name}</span>
              <span className={textSecondary}>{r.value === null ? 'No data yet' : `${r.value}%`}</span>
            </div>
            <ProgressBar value={r.value ?? 0} />
            <p className={`text-[11px] leading-snug ${textSecondary}`}>{r.note}</p>
          </div>
        ))}
      </div>

      <div>
        <p className={`text-xs font-medium mb-2 ${textPrimary}`}>Your journey</p>
        <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {stages.map((s) => (
            <li
              key={s.id}
              className={`rounded-lg border ${borderClass} px-2.5 py-2 text-xs flex items-start gap-1.5 ${
                s.reached ? subtleBgClass : ''
              }`}
              title={s.hint}
            >
              {s.reached ? (
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--success-ink)]" />
              ) : (
                <Circle className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${textSecondary}`} />
              )}
              <span className={s.reached ? textPrimary : textSecondary}>{s.label}</span>
            </li>
          ))}
        </ol>
        {nextStage && (
          <p className={`text-xs mt-2 ${textSecondary}`}>
            Next: <span className={textPrimary}>{nextStage.label}</span>. {nextStage.hint}.
          </p>
        )}
      </div>

      <div className={`rounded-xl border ${borderClass} ${subtleBgClass} p-3 text-xs ${textSecondary}`}>
        <p className={textPrimary}>{tip}</p>
        <p className="mt-1.5">
          This month: {workDone} finished {workDone === 1 ? 'task' : 'tasks'}. Mentor help: {helpByLevel[1]} nudge
          {helpByLevel[1] === 1 ? '' : 's'}, {helpByLevel[2]} hint{helpByLevel[2] === 1 ? '' : 's'},{' '}
          {helpByLevel[3]} walkthrough{helpByLevel[3] === 1 ? '' : 's'}.
          {onOpenMentor && (
            <>
              {' '}
              <button type="button" onClick={onOpenMentor} className="text-[var(--accent-600)] hover:underline cursor-pointer">
                Open mentor
              </button>
            </>
          )}
        </p>
      </div>
    </section>
  );
};
