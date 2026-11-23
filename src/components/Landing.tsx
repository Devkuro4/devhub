import React, { useState } from 'react';
import { Check, Code2, TimerReset } from 'lucide-react';
import { LogoMark, useSystemDark } from './ui';

/* Public front door for visitors who are not signed in.
   One memorable thing: the path from beginner to independent developer draws itself once on load.
   Everything else stays quiet. */

const STAGES = [
  { name: 'Add a course', note: 'Bring what you use' },
  { name: 'Check in', note: 'Log real progress' },
  { name: 'Save code', note: 'Keep proof of practice' },
  { name: 'Quick quiz', note: 'Check what stuck' },
  { name: 'See patterns', note: 'Know what needs work' },
  { name: 'Keep growing', note: 'Stay consistent' },
];

const W = 1000;
const H = 300;
const POINTS: [number, number][] = [
  [40, 200],
  [210, 165],
  [380, 175],
  [550, 115],
  [720, 90],
  [900, 40],
];

const smoothPath = (pts: [number, number][]) => {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
};

const Trail = () => (
  <div>
    {/* Wide screens: the path draws itself */}
    <div className="hidden md:block relative" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full overflow-visible" aria-hidden="true">
        <path d={smoothPath(POINTS)} fill="none" stroke="var(--border-strong)" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 8" />
        <path
          d={smoothPath(POINTS)}
          pathLength={1}
          className="trail-line"
          fill="none"
          stroke="var(--spark)"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        {POINTS.map(([x, y], i) => {
          const last = i === POINTS.length - 1;
          return (
            <g key={i} className="trail-dot" style={{ animationDelay: `${0.35 + i * 0.3}s`, transformOrigin: `${x}px ${y}px` }}>
              <circle cx={x} cy={y} r={last ? 15 : 10} fill="var(--surface-bg)" stroke={last ? 'var(--spark)' : 'var(--spark)'} strokeWidth="4" />
              {last && <circle cx={x} cy={y} r="6" fill="var(--spark)" />}
            </g>
          );
        })}
      </svg>
      <ol className="absolute inset-0">
        {STAGES.map((s, i) => (
          <li
            key={s.name}
            className="absolute w-36 text-center"
            style={{ left: `${(POINTS[i][0] / W) * 100}%`, top: `${(POINTS[i][1] / H) * 100}%`, transform: 'translate(-50%, 26px)' }}
          >
            <div className={`font-display text-base font-semibold ${i === STAGES.length - 1 ? 'text-[var(--spark)]' : 'text-[var(--ink-primary)]'}`}>{s.name}</div>
            <div className="text-sm text-[var(--ink-muted)] leading-snug">{s.note}</div>
          </li>
        ))}
      </ol>
    </div>

    {/* Phones: the same path, standing up */}
    <ol className="md:hidden relative space-y-6 pl-9">
      <span aria-hidden="true" className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-[var(--border-strong)]" />
      {STAGES.map((s, i) => {
        const last = i === STAGES.length - 1;
        return (
          <li key={s.name} className="relative">
            <span
              aria-hidden="true"
              className={`absolute -left-9 top-1 w-6 h-6 rounded-full border-4 bg-[var(--surface-bg)] ${last ? 'border-[var(--spark)]' : 'border-[var(--spark)]'}`}
            />
            <div className={`font-display text-lg font-semibold leading-tight ${last ? 'text-[var(--spark)]' : ''}`}>{s.name}</div>
            <div className="text-base text-[var(--ink-secondary)]">{s.note}</div>
          </li>
        );
      })}
    </ol>
  </div>
);

const LOOP = [
  {
    title: 'Bring the course you already chose',
    text: 'Add a YouTube playlist, online course, class or personal study plan. Dev Hub keeps the useful details together without replacing it.',
  },
  {
    title: 'Record what actually happened',
    text: 'Log time, completed modules and private code evidence. Your progress reflects the work you did, not made-up activity.',
  },
  {
    title: 'Make each day feel finishable',
    text: 'A short daily flow turns a big course into a calm next step: study, save evidence, check understanding and close the day.',
  },
  {
    title: 'Notice what is sticking',
    text: 'Small quizzes and progress summaries reveal strong topics, weak spots and the best place to continue tomorrow.',
  },
  {
    title: 'Get support without losing ownership',
    text: 'Ask the Groq-powered mentor for a hint, learn with the community and celebrate milestones while your work stays yours.',
  },
];

const HINTS = [
  {
    label: 'Just a nudge',
    impact: 'Best for your independence score',
    reply: 'What is the last index in an array of three items? Compare that with the last value i takes in your loop.',
  },
  {
    label: 'A bigger hint',
    impact: 'Good for your independence score',
    reply: 'Your loop runs one time too many. Look at the condition: you compare i with items.length using <=. Which operator would stop at the last valid index instead?',
  },
  {
    label: 'Walk me through it',
    impact: 'Always there when you are truly stuck',
    reply:
      'Arrays start at 0, so items has indexes 0, 1 and 2. items.length is 3, and i <= 3 lets i reach 3, where items[3] is undefined. Change the condition to i < items.length. Now try it yourself: write a loop that prints the items in reverse.',
  },
];

const MentorDemo = () => {
  const [level, setLevel] = useState(0);
  const hint = HINTS[level];
  return (
    <div className="studio-card overflow-hidden shadow-[var(--shadow-md)]">
      <div className="p-5 sm:p-6 border-b border-[var(--border-hairline)] space-y-4">
        <p className="text-base font-semibold">“My loop prints undefined at the end. Why?”</p>
        <pre className="text-sm overflow-x-auto" aria-label="Example code"><code>{`const items = ['a', 'b', 'c'];
for (let i = 0; i <= items.length; i++) {
  console.log(items[i]);
}`}</code></pre>
      </div>
      <div className="p-5 sm:p-6 space-y-5">
        <div role="radiogroup" aria-label="How much help do you want?" className="flex flex-wrap gap-2">
          {HINTS.map((h, i) => (
            <button
              key={h.label}
              type="button"
              role="radio"
              aria-checked={level === i}
              onClick={() => setLevel(i)}
              className={`px-4 py-2.5 min-h-11 rounded-lg text-sm font-medium border cursor-pointer transition-colors ${
                level === i
                  ? 'bg-[var(--accent-600)] border-[var(--accent-600)] text-[var(--on-spark)] font-semibold'
                  : 'border-[var(--border-strong)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-subtle)]'
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>
        <div aria-live="polite" className="rounded-[14px] bg-[var(--surface-subtle)] p-4 sm:p-5 space-y-3 min-h-[11rem]">
          <p className="text-base leading-relaxed">{hint.reply}</p>
          <p className="text-sm text-[var(--ink-muted)]">{hint.impact}</p>
        </div>
      </div>
    </div>
  );
};

const COMMUNITY = [
  { title: 'Weekly challenges', text: 'A small problem each week, at a few difficulty levels.' },
  { title: 'Events and workshops', text: 'Study sessions and show-and-tells, with dates you can see in one place.' },
  { title: 'Help desk', text: 'Ask a question and get answers from peers who just solved it.' },
  { title: 'Project showcase', text: 'Share what you built and read how others solved the same problem.' },
  { title: 'Git and GitHub together', text: 'Learn version control by collaborating on real group projects.' },
  { title: 'Announcements and resources', text: 'The community’s best links and updates, kept in one place.' },
];

export const Landing = ({ onSignIn, onJoin }: { onSignIn: () => void; onJoin: () => void }) => {
  const dark = useSystemDark();
  const wrap = 'max-w-6xl mx-auto px-5 sm:px-8 lg:px-12';
  const primaryAction =
    'inline-flex items-center justify-center px-6 min-h-12 rounded-full bg-[var(--ink-primary)] text-[var(--surface-elevated)] text-base font-semibold cursor-pointer hover:opacity-90';
  const secondaryAction =
    'inline-flex items-center justify-center min-h-12 px-6 rounded-full border border-[var(--ink-primary)]/20 bg-[var(--surface-elevated)]/75 text-[var(--ink-primary)] text-base font-medium cursor-pointer hover:bg-[var(--surface-elevated)]';

  return (
    <div className={`hub-root ${dark ? 'dark' : ''} app-backdrop min-h-screen sm:p-6`}>
      <div className="app-frame min-h-[calc(100vh-3rem)]">
      <a href="#hero" className="skip-link">Skip to main content</a>

      <header className="sticky top-0 z-30 border-b border-[var(--border-hairline)] bg-[var(--surface-bg)]/94 backdrop-blur">
        <div className={`${wrap} h-[72px] flex items-center justify-between gap-4`}>
          <a href="#hero" className="flex items-center gap-3">
            <LogoMark size={36} />
            <span className="font-display text-xl font-bold">Dev Hub</span>
          </a>
          <nav aria-label="Sections" className="hidden md:flex items-center gap-8 text-[0.9375rem] font-medium text-[var(--ink-secondary)]">
            <a href="#how" className="hover:text-[var(--ink-primary)]">How it works</a>
            <a href="#mentor" className="hover:text-[var(--ink-primary)]">AI mentor</a>
            <a href="#community" className="hover:text-[var(--ink-primary)]">Community</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <button type="button" onClick={onSignIn} className="px-3 sm:px-4 min-h-11 text-[0.9375rem] font-medium text-[var(--ink-primary)] hover:bg-[var(--surface-subtle)] rounded-lg cursor-pointer">
              Sign in
            </button>
            <button type="button" onClick={onJoin} className="px-4 sm:px-5 min-h-11 rounded-lg bg-[var(--accent-600)] hover:bg-[var(--accent-700)] text-[var(--on-spark)] text-[0.9375rem] font-semibold cursor-pointer transition-colors whitespace-nowrap">
              Join Dev Hub
            </button>
          </div>
        </div>
      </header>

      <main id="hero">
        {/* Hero */}
        <section className={`${wrap} pt-8 sm:pt-12 pb-12 sm:pb-16`}>
          <div className="product-banner px-6 py-8 sm:px-10 sm:py-12 lg:px-14 lg:py-14 grid gap-10 lg:grid-cols-12 lg:items-center">
            <div className="relative lg:col-span-7">
              <span className="inline-flex rounded-full bg-[var(--surface-elevated)]/75 px-3 py-1.5 text-sm font-semibold text-[var(--ink-secondary)]">Your learning, finally visible</span>
              <h1 className="mt-5 !font-display !text-[clamp(2.25rem,1.5rem_+_3.8vw,4.25rem)] !leading-[1.02] !tracking-[-0.04em] font-semibold text-[var(--ink-primary)]">
                Keep the course. Make the progress yours.
              </h1>
              <p className="mt-6 text-lg sm:text-xl leading-relaxed text-[var(--ink-secondary)] max-w-[42ch]">
                Dev Hub helps you track external courses, save code evidence, check what you understood and stay consistent—with an AI mentor and community when you need support.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <button type="button" onClick={onJoin} className={primaryAction}>
                  Start tracking free
                </button>
                <button type="button" onClick={onSignIn} className={secondaryAction}>
                  Sign in
                </button>
              </div>
            </div>
            <div className="relative lg:col-span-5 rounded-[26px] bg-[var(--surface-elevated)]/88 p-5 sm:p-6 shadow-[var(--shadow-md)] border border-[var(--ink-primary)]/5">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-sm font-medium text-[var(--ink-muted)]">Current course</p><h2 className="mt-1 !text-xl">Frontend foundations</h2></div>
                <span className="rounded-full pastel-aqua px-3 py-1 text-sm font-bold">68%</span>
              </div>
              <div className="mt-5 h-2 rounded-full bg-[var(--border-hairline)] overflow-hidden"><span className="block h-full w-[68%] rounded-full bg-[var(--ink-primary)]" /></div>
              <div className="mt-6 grid grid-cols-3 gap-2">
                {[{ icon: TimerReset, value: '42m', label: 'studied' }, { icon: Code2, value: '2', label: 'code saves' }, { icon: Check, value: '4/5', label: 'today' }].map(({ icon: Icon, value, label }, index) => (
                  <div key={label} className={`rounded-2xl p-3 ${index === 0 ? 'pastel-aqua' : index === 1 ? 'pastel-pink' : 'pastel-lilac'}`}>
                    <Icon className="w-4 h-4" aria-hidden="true" /><p className="mt-3 font-display text-xl font-bold">{value}</p><p className="text-xs text-[var(--ink-secondary)]">{label}</p>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm text-[var(--ink-secondary)]">Next: log what you practised, then take a 3-minute check-in quiz.</p>
            </div>
          </div>

          <div className="mt-16 sm:mt-20">
            <h2 className="text-xl sm:text-2xl mb-8 sm:mb-4 max-w-[30ch]">A simple rhythm that keeps your learning moving</h2>
            <Trail />
          </div>
        </section>

        {/* How it works */}
        <section id="how">
          <div className={`${wrap} py-20 sm:py-28 grid gap-12 lg:grid-cols-12`}>
            <div className="lg:col-span-5">
              <div className="lg:sticky lg:top-28 space-y-5">
                <h2 className="!text-[clamp(1.75rem,1.3rem_+_1.8vw,2.5rem)] !leading-[1.1]">One calm loop for the course you already use</h2>
                <p className="text-lg text-[var(--ink-secondary)] leading-relaxed max-w-[44ch]">
                  Dev Hub does not pretend to teach your course. It helps you see the work, understand your pace and know what to do next.
                </p>
              </div>
            </div>
            <ul className="lg:col-span-7 soft-card px-6 sm:px-8 divide-y divide-[var(--border-hairline)]">
              {LOOP.map((l) => (
                <li key={l.title} className="py-7 sm:py-8">
                  <h3 className="text-xl">{l.title}</h3>
                  <p className="mt-2 text-base leading-relaxed text-[var(--ink-secondary)] max-w-[58ch]">{l.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* AI mentor */}
        <section id="mentor">
          <div className={`${wrap} py-20 sm:py-28 grid gap-12 lg:grid-cols-2 lg:gap-16 items-center`}>
            <div className="space-y-5">
              <h2 className="!text-[clamp(1.75rem,1.3rem_+_1.8vw,2.5rem)] !leading-[1.1]">An AI mentor that makes you do the thinking</h2>
              <p className="text-lg text-[var(--ink-secondary)] leading-relaxed max-w-[46ch]">
                You choose how much help you get. Smaller hints keep your independence score high, and a full walkthrough is always one tap away when you are truly stuck.
              </p>
              <p className="text-base text-[var(--ink-secondary)] leading-relaxed max-w-[46ch]">
                Your independence score reflects what you finish on your own, what you understand in quizzes and the projects you submit over the last 30 days. It is a mirror, not a grade.
              </p>
            </div>
            <MentorDemo />
          </div>
        </section>

        {/* Community */}
        <section id="community">
          <div className={`${wrap} py-20 sm:py-28`}>
            <div className="max-w-2xl space-y-5">
              <h2 className="!text-[clamp(1.75rem,1.3rem_+_1.8vw,2.5rem)] !leading-[1.1]">Learn with people, not alone</h2>
              <p className="text-lg text-[var(--ink-secondary)] leading-relaxed">
                Growing as a developer is easier when someone is a step ahead of you and someone else is a step behind.
              </p>
            </div>
            <dl className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {COMMUNITY.map((c) => (
                <div key={c.title} className="soft-card p-5 sm:p-6">
                  <dt className="font-display text-lg font-semibold">{c.title}</dt>
                  <dd className="mt-2 text-base leading-relaxed text-[var(--ink-secondary)]">{c.text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Closing call */}
        <section className={`${wrap} pb-16 sm:pb-24`}>
          <div className="product-banner px-7 py-14 sm:px-14 sm:py-16 grid gap-10 lg:grid-cols-12 items-center">
            <div className="relative lg:col-span-7 space-y-5">
              <h2 className="!text-[clamp(1.75rem,1.3rem_+_1.8vw,2.5rem)] !leading-[1.1] text-[var(--ink-primary)]">Ready to make your effort visible?</h2>
              <p className="text-lg text-[var(--ink-secondary)] leading-relaxed max-w-[50ch]">
                Add the course you are taking, choose your pace and get a personal tracker in about two minutes.
              </p>
              <div className="pt-3 flex flex-wrap items-center gap-3">
                <button type="button" onClick={onJoin} className={primaryAction}>
                  Create my tracker
                </button>
                <button type="button" onClick={onSignIn} className={secondaryAction}>
                  I already have an account
                </button>
              </div>
            </div>
            <p className="relative lg:col-span-5 font-display text-3xl sm:text-4xl font-semibold leading-[1.15] tracking-tight">
              Learn together.
              <br />
              Build together.
              <br />
              Grow together.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border-hairline)]">
        <div className={`${wrap} py-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-sm text-[var(--ink-muted)]`}>
          <div className="flex items-center gap-3">
            <LogoMark size={28} />
            <span>Dev Hub. A community for developers growing together.</span>
          </div>
          <button type="button" onClick={onSignIn} className="self-start sm:self-auto font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] underline underline-offset-4 cursor-pointer">
            Sign in
          </button>
        </div>
      </footer>
      </div>
    </div>
  );
};
