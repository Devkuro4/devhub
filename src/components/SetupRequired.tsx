import React from 'react';
import { Code2 } from 'lucide-react';

/**
 * Shown on a published site that is not connected to Supabase yet.
 * Without it, every visitor would silently get a private demo copy of the app.
 */
export const SetupRequired = () => (
  <div className="hub-root min-h-screen flex items-center justify-center px-5 py-10 bg-[var(--canvas-bg)] text-[var(--ink-primary)]">
    <main className="w-full max-w-lg space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg rounded-bl-sm bg-[var(--spark)] text-[var(--on-spark)] flex items-center justify-center">
          <Code2 className="w-5 h-5" aria-hidden="true" />
        </div>
        <span className="font-display text-lg font-semibold">Dev Hub</span>
      </div>
      <h1 className="text-2xl">This site isn’t connected to its database yet</h1>
      <p className="text-sm text-[var(--ink-secondary)] leading-relaxed">
        Dev Hub needs a Supabase project so that accounts, progress and community posts are saved for everyone.
        Until that is set up, the app stays closed so nobody ends up with data that disappears.
      </p>
      <div className="studio-card p-5 space-y-3">
        <h2 className="text-base">If you run this site (team lead)</h2>
        <ol className="list-decimal pl-5 space-y-1.5 text-sm text-[var(--ink-secondary)] leading-relaxed">
          <li>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your hosting settings.</li>
          <li>Run <code>supabase/schema.sql</code> in the Supabase SQL Editor.</li>
          <li><strong>Redeploy</strong>. These values are built into the site, so they only take effect on a new build.</li>
        </ol>
        <p className="text-xs text-[var(--ink-muted)]">Full steps are in LAUNCH.md in the project.</p>
      </div>
      <p className="text-sm text-[var(--ink-secondary)]">If you’re a member, please let your team lead know. It isn’t something you did.</p>
    </main>
  </div>
);
