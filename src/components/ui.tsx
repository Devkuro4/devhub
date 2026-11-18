import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Code2,
  Compass,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Shield,
  Sparkles,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { lookupOfficialRoadmap, requestAiRoadmap } from '../lib/aiClient';
import { ADMIN_CODE, ADMIN_SITE, MEMBER_SITE_URL } from '../data/seedData';
import type { OnboardingProfile, RoadmapItem } from '../types';

export const DarkCtx = createContext(false);

/** Four-point sparkle: the one decorative shape used on banners and the sign-in panel */
export const Sparkle = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" aria-hidden="true" className={className}>
    <path d="M50 0C54 30 70 46 100 50C70 54 54 70 50 100C46 70 30 54 0 50C30 46 46 30 50 0Z" fill="currentColor" />
  </svg>
);

/** The round blue logo mark */
export const LogoMark = ({ size = 40 }: { size?: number }) => (
  <span
    aria-hidden="true"
    style={{ width: size, height: size }}
    className="rounded-full bg-[var(--spark)] text-[var(--on-spark)] flex items-center justify-center shrink-0"
  >
    <Sparkles style={{ width: size * 0.5, height: size * 0.5 }} />
  </span>
);

export const PageHeader = ({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) => {
  return (
    <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 pb-2">
      <div className="space-y-4 max-w-2xl">
        <h1 className="font-display text-[var(--ink-primary)]">{title}</h1>
        <p className="text-base leading-relaxed max-w-[62ch] text-[var(--ink-secondary)]">{description}</p>
      </div>
      {action && <div className="flex flex-wrap items-center gap-3 shrink-0">{action}</div>}
    </header>
  );
};

export const SectionTabs = <T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; badge?: string | number }[];
  active: T;
  onChange: (id: T) => void;
}) => {
  return (
    <div
      role="tablist"
      className="flex items-center gap-1 overflow-x-auto no-scrollbar w-full max-w-full border-b border-[var(--border-hairline)]"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`relative px-4 py-3 text-[0.9375rem] font-medium whitespace-nowrap shrink-0 cursor-pointer min-h-[48px] flex items-center gap-2 transition-colors ${
              isActive
                ? 'text-[var(--ink-primary)] font-semibold'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge !== 0 && (
              <span className="text-xs font-semibold tabular-nums min-w-[1.5rem] text-center rounded-full px-1.5 py-0.5 leading-none bg-[var(--accent-50)] text-[var(--accent-700)]">
                {tab.badge}
              </span>
            )}
            {isActive && <span aria-hidden="true" className="absolute left-3 right-3 -bottom-px h-[3px] rounded-t-full bg-[var(--spark)]" />}
          </button>
        );
      })}
    </div>
  );
};

export const Modal = ({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) => {
  const dark = useContext(DarkCtx);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto overscroll-contain"
      onClick={onClose}
    >
      <div
        className={`studio-card w-full max-w-xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto space-y-5 shadow-[var(--shadow-lg)] ${
          'text-[var(--ink-primary)]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between pb-3 border-b ${'border-[var(--border-hairline)]'}`}>
          <h2 className="font-display text-xl">{title}</h2>
          <button
            type="button"
            aria-label="Close modal"
            onClick={onClose}
            className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
              'text-[var(--ink-secondary)] hover:bg-[var(--surface-subtle)]'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const SkeletonBlock = ({ className = 'h-20 w-full' }: { className?: string }) => {
  const dark = useContext(DarkCtx);
  return <div aria-hidden="true" className={`rounded-xl ${'bg-[var(--surface-subtle)]'} ${className}`} />;
};

export const Badge = ({
  children,
  variant = 'neutral',
}: {
  children: React.ReactNode;
  variant?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) => {
  const styles = {
    neutral: 'bg-[var(--surface-subtle)] text-[var(--ink-secondary)]',
    success: 'bg-[var(--success-bg)] text-[var(--success-ink)]',
    warning: 'bg-[var(--warning-bg)] text-[var(--warning-ink)]',
    danger: 'bg-[var(--danger-bg)] text-[var(--danger-ink)]',
    info: 'bg-[var(--accent-50)] text-[var(--accent-700)]',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap shrink-0 ${styles[variant]}`}>
      {variant === 'success' && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
      {variant === 'warning' && <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
      {variant === 'danger' && <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
      {children}
    </span>
  );
};

export const ProgressBar = ({ value }: { value: number }) => {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="w-full h-2 rounded-full overflow-hidden bg-[var(--surface-subtle)]"
    >
      <div className="h-full rounded-full transition-all duration-500 bg-[var(--signal)]" style={{ width: `${pct}%` }} />
    </div>
  );
};

export const EmptyState = ({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) => {
  return (
    <div className="studio-card p-8 sm:p-12 text-center space-y-4 border-dashed">
      <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center bg-[var(--accent-50)] text-[var(--accent-700)]">
        <Compass className="w-6 h-6" aria-hidden="true" />
      </div>
      <div className="max-w-md mx-auto space-y-3">
        <h3 className="font-display text-lg text-[var(--ink-primary)]">{title}</h3>
        <p className="text-base leading-relaxed text-[var(--ink-secondary)] mx-auto">{description}</p>
      </div>
      {actionLabel && onAction && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[var(--accent-600)] hover:bg-[var(--accent-700)] text-[var(--on-spark)] text-sm font-semibold cursor-pointer whitespace-nowrap active:scale-[0.985] transition-transform"
          >
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Shared bits for the sign-in family of screens
// ---------------------------------------------------------------------------
const EMAIL_RE = /^\S+@\S+\.\S+$/;

const authInputCls = (invalid: boolean) =>
  `w-full h-12 px-4 rounded-xl border bg-[var(--surface-elevated)] text-[var(--ink-primary)] text-base placeholder:text-[var(--ink-muted)] focus:outline-none transition-colors ${
    invalid ? 'border-[var(--danger-ink)]' : 'border-[var(--border-strong)] focus:border-[var(--accent-600)]'
  }`;

const AuthField = ({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div>
    <label htmlFor={id} className="block text-sm font-semibold text-[var(--ink-primary)] mb-2">
      {label}
    </label>
    {children}
    {error ? (
      <p id={`${id}-msg`} className="flex items-start gap-1.5 mt-1.5 text-sm text-[var(--danger-ink)]">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        <span>{error}</span>
      </p>
    ) : hint ? (
      <p id={`${id}-msg`} className="mt-1.5 text-sm text-[var(--ink-secondary)]">
        {hint}
      </p>
    ) : null}
  </div>
);

const AuthNotice = ({ tone, children }: { tone: 'danger' | 'success' | 'warning'; children: React.ReactNode }) => {
  const cls = {
    danger: 'bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger-ink)]',
    success: 'bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-ink)]',
    warning: 'bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning-ink)]',
  }[tone];
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`flex items-start gap-2.5 p-3 rounded-lg border text-sm leading-relaxed ${cls}`}>
      <Icon className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
};

const primaryBtn =
  'w-full min-h-12 px-4 rounded-[10px] bg-[var(--accent-600)] hover:bg-[var(--accent-700)] disabled:opacity-60 text-[var(--on-spark)] text-base font-semibold cursor-pointer transition-colors';
const secondaryBtn =
  'min-h-12 px-4 rounded-[10px] border border-[var(--border-strong)] bg-transparent hover:bg-[var(--surface-subtle)] disabled:opacity-50 text-[var(--ink-primary)] text-sm font-medium cursor-pointer whitespace-nowrap';

const MEMBER_TRAIL = [
  { name: 'Learn', note: 'Short lessons from the courses you already follow.' },
  { name: 'Practise', note: 'One daily exercise, with a mentor on hand.' },
  { name: 'Submit', note: 'Share your code and how you solved it.' },
  { name: 'Review', note: 'Clear, kind feedback on what to fix next.' },
  { name: 'Quiz', note: 'Check what stuck before you move on.' },
];
const ADMIN_TRAIL = [
  { name: 'Support', note: 'Answer members and keep the community friendly.' },
  { name: 'Organise', note: 'Publish challenges and study sessions.' },
  { name: 'Monitor', note: 'Keep an eye on the AI learning tools.' },
];

/** True when the visitor's device prefers a dark theme. Used on screens that render before sign-in. */
export const useSystemDark = () => {
  const [dark, setDark] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return dark;
};

export const AuthShell = ({ children, onBack }: { children: React.ReactNode; onBack?: () => void }) => {
  const dark = useSystemDark();
  const brand = ADMIN_SITE ? 'Dev Hub Admin' : 'Dev Hub';
  const trail = ADMIN_SITE ? ADMIN_TRAIL : MEMBER_TRAIL;
  return (
    <div className={`hub-root ${dark ? 'dark' : ''} ${ADMIN_SITE ? 'admin-theme' : ''} min-h-screen grid grid-cols-1 lg:grid-cols-12 text-[var(--ink-primary)]`}>
      {/* Desktop: the story panel */}
      <div className="relative hidden lg:flex lg:col-span-6 xl:col-span-6 flex-col justify-between p-12 xl:p-16 bg-[#0A0A0A] text-white overflow-hidden">
        <Sparkle className="absolute -right-16 -bottom-20 w-[26rem] text-[#3B82F6] opacity-20" />
        <Sparkle className="absolute right-24 top-24 w-24 text-[#3B82F6] opacity-30" />
        <Sparkle className="absolute right-12 top-56 w-12 text-white opacity-10" />

        <div className="relative z-10 flex items-center gap-3">
          <LogoMark />
          <span className="font-display text-xl font-bold whitespace-nowrap">{brand}</span>
        </div>

        <div className="relative z-10 max-w-xl space-y-10">
          <div className="space-y-5">
            <h2 className="font-display text-4xl xl:text-5xl font-semibold leading-[1.08] tracking-tight [text-wrap:balance] text-white">
              {ADMIN_SITE ? 'Support members consistently, one week at a time.' : 'Turn the courses you follow into skills you can use.'}
            </h2>
            <p className="text-lg text-white/80 leading-relaxed max-w-[46ch]">
              {ADMIN_SITE
                ? 'Keep the community friendly, publish challenges and study sessions, and monitor the AI learning tools.'
                : 'Practise every day, get clear feedback on your code, and build real projects alongside people who are learning too.'}
            </p>
          </div>

          <ol className="space-y-5">
            {trail.map((t) => (
              <li key={t.name} className="flex gap-4">
                <span aria-hidden="true" className="mt-2.5 w-2 h-2 rounded-full bg-[#3B82F6] shrink-0" />
                <div className="text-base leading-snug">
                  <span className="font-semibold text-white">{t.name}.</span>{' '}
                  <span className="text-white/75">{t.note}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Form side */}
      <div className="lg:col-span-6 flex flex-col bg-[var(--surface-bg)]">
        {/* Phones and tablets: a compact brand bar instead of the panel */}
        <div className="lg:hidden flex items-center justify-between gap-3 px-5 sm:px-10 py-4 border-b border-[var(--border-hairline)] bg-[var(--surface-bg)]">
          <div className="flex items-center gap-3 min-w-0">
            <LogoMark size={36} />
            <span className="font-display text-lg font-bold whitespace-nowrap">{brand}</span>
          </div>
          {onBack && (
            <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] cursor-pointer">
              <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back
            </button>
          )}
        </div>

        <div className="flex-1 flex flex-col px-5 sm:px-10 xl:px-16 py-8 sm:py-12">
          {onBack && (
            <div className="hidden lg:block mb-8">
              <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] cursor-pointer">
                <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to home
              </button>
            </div>
          )}
          <div className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-[440px]">
              <div className="studio-card p-6 sm:p-9">{children}</div>
              <p className="mt-6 text-sm text-center text-[var(--ink-muted)]">
                Learn together. Build together. Grow together.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const LoginScreen = ({ onLogin }: { onLogin: (u: { name: string; email: string; isAdmin: boolean }) => void }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  const needsCode = ADMIN_SITE && !!ADMIN_CODE;
  const errors = {
    name: !name.trim() ? 'Enter your full name so we know what to call you.' : '',
    email: !email.trim()
      ? 'Enter your email address.'
      : !EMAIL_RE.test(email.trim())
        ? 'That email looks incomplete. Use a format like you@example.com.'
        : '',
    code: needsCode && code !== ADMIN_CODE ? (code ? 'That team lead code isn’t right. Check it and try again.' : 'Enter the team lead code.') : '',
  };
  const show = (k: 'name' | 'email' | 'code') => (touched[k] || submitted ? errors[k] : '');
  const blur = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const first = (['name', 'email', 'code'] as const).find((k) => errors[k]);
    if (first) {
      document.getElementById(`demo-${first}`)?.focus();
      return;
    }
    onLogin({ name: name.trim(), email: email.trim(), isAdmin: ADMIN_SITE });
  };

  return (
    <AuthShell>
      <div className="mb-6">
        <h1 className="font-display text-[var(--ink-primary)]">{ADMIN_SITE ? 'Sign in to the admin console' : 'Welcome to Dev Hub'}</h1>
        <p className="text-base text-[var(--ink-secondary)] mt-2 leading-relaxed">
          {ADMIN_SITE ? 'Enter your name, email and team lead code.' : 'Tell us who you are and we’ll open your learning workspace.'}
        </p>
      </div>
      <form onSubmit={submit} noValidate className="space-y-4">
        <AuthField id="demo-name" label="Full name" error={show('name')}>
          <input
            id="demo-name"
            className={authInputCls(!!show('name'))}
            placeholder="Your full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => blur('name')}
            autoComplete="name"
            aria-invalid={!!show('name')}
            aria-describedby={show('name') ? 'demo-name-msg' : undefined}
          />
        </AuthField>
        <AuthField id="demo-email" label="Email address" error={show('email')}>
          <input
            id="demo-email"
            className={authInputCls(!!show('email'))}
            placeholder="you@example.com"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => blur('email')}
            autoComplete="email"
            aria-invalid={!!show('email')}
            aria-describedby={show('email') ? 'demo-email-msg' : undefined}
          />
        </AuthField>
        {needsCode && (
          <AuthField id="demo-code" label="Team lead code" error={show('code')}>
            <input
              id="demo-code"
              className={authInputCls(!!show('code'))}
              placeholder="Enter your code"
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onBlur={() => blur('code')}
              aria-invalid={!!show('code')}
              aria-describedby={show('code') ? 'demo-code-msg' : undefined}
            />
          </AuthField>
        )}
        <button type="submit" className={primaryBtn}>
          Open my workspace
        </button>
      </form>
    </AuthShell>
  );
};

export const NotAuthorized = ({ onSignOut }: { onSignOut: () => void }) => (
  <AuthShell>
    <div className="space-y-5">
      <div className="w-11 h-11 rounded-xl bg-[var(--warning-bg)] border border-[var(--warning-border)] text-[var(--warning-ink)] flex items-center justify-center">
        <Shield className="w-5 h-5" aria-hidden="true" />
      </div>
      <div>
        <h1 className="font-display text-[var(--ink-primary)]">Team lead access needed</h1>
        <p className="text-base text-[var(--ink-secondary)] mt-2 leading-relaxed">
          This account doesn’t have admin permissions yet. Ask a community admin to promote your profile, or go to the member hub instead.
        </p>
      </div>
      <div className="flex flex-wrap gap-3 pt-1">
        {MEMBER_SITE_URL && (
          <a
            href={MEMBER_SITE_URL}
            className="inline-flex items-center justify-center min-h-11 px-5 rounded-lg bg-[var(--accent-600)] hover:bg-[var(--accent-700)] text-white text-sm font-semibold whitespace-nowrap"
          >
            Go to the member hub
          </a>
        )}
        <button type="button" onClick={onSignOut} className={secondaryBtn}>
          Sign out
        </button>
      </div>
    </div>
  </AuthShell>
);

export const LoadingScreen = ({ error, onSignOut }: { error?: boolean; onSignOut?: () => void }) => (
  <div className={`hub-root ${ADMIN_SITE ? 'admin-theme' : ''} min-h-screen flex items-center justify-center studio-canvas text-[var(--ink-primary)] p-6`}>
    {error ? (
      <div className="studio-card max-w-md w-full p-7 sm:p-8 space-y-5">
        <div className="w-11 h-11 rounded-xl bg-[var(--danger-bg)] border border-[var(--danger-border)] text-[var(--danger-ink)] flex items-center justify-center">
          <AlertCircle className="w-5 h-5" aria-hidden="true" />
        </div>
        <div role="alert">
          <h1 className="font-display text-[var(--ink-primary)]">We couldn’t load your workspace</h1>
          <p className="text-base text-[var(--ink-secondary)] mt-2 leading-relaxed">
            Check your internet connection and try again. If it keeps happening, sign out and sign back in.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 px-5 rounded-lg bg-[var(--accent-600)] hover:bg-[var(--accent-700)] text-white text-sm font-semibold cursor-pointer whitespace-nowrap"
          >
            Try again
          </button>
          {onSignOut && (
            <button type="button" onClick={onSignOut} className={secondaryBtn}>
              Sign out
            </button>
          )}
        </div>
      </div>
    ) : (
      <div role="status" className="flex flex-col items-center gap-4">
        <LogoMark size={48} />
        <div className="w-28 h-[3px] bg-[var(--border-hairline)] overflow-hidden" aria-hidden="true">
          <span className="block h-full w-1/3 bg-[var(--spark)] motion-safe:animate-pulse" />
        </div>
        <p className="text-base text-[var(--ink-secondary)]">Opening your workspace…</p>
      </div>
    )}
  </div>
);

const formatAuthError = (msg?: string) => {
  if (!msg) return 'Sign-in failed. Please try again.';
  if (/invalid login credentials/i.test(msg)) return 'Incorrect email or password. If you haven’t created an account yet, switch to Create account.';
  if (/email not confirmed/i.test(msg)) return 'Your email isn’t confirmed yet. Check your inbox for the confirmation link.';
  if (/invalid path specified in request url/i.test(msg)) return 'Supabase URL configuration error. Check that VITE_SUPABASE_URL is set to https://<project-ref>.supabase.co (without /rest/v1).';
  if (/failed to fetch|networkerror/i.test(msg)) return 'Could not reach Supabase. Verify VITE_SUPABASE_URL and your internet connection.';
  if (/email rate limit exceeded|over_email_send_rate_limit/i.test(msg)) return 'Too many signup/confirmation emails were sent recently (Supabase’s built-in mailer allows only 2/hour). Wait up to an hour, or configure Custom SMTP / disable email confirmation in Supabase Auth settings.';
  return msg;
};

export const AuthScreen = ({ initialMode = 'in', onBack }: { initialMode?: 'in' | 'up'; onBack?: () => void }) => {
  const [mode, setMode] = useState<'in' | 'up'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const redirectErr = search.get('error_description') || hash.get('error_description') || search.get('error') || hash.get('error');
    if (redirectErr) {
      setErr(formatAuthError(decodeURIComponent(redirectErr.replace(/\+/g, ' '))));
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const validEmail = () => EMAIL_RE.test(email.trim());

  const errors = {
    name: mode === 'up' && !name.trim() ? 'Enter your full name so we know what to call you.' : '',
    email: !email.trim()
      ? 'Enter your email address.'
      : !validEmail()
        ? 'That email looks incomplete. Use a format like you@example.com.'
        : '',
    password: !password
      ? mode === 'up'
        ? 'Choose a password with at least 6 characters.'
        : 'Enter your password.'
      : password.length < 6
        ? mode === 'up'
          ? `Use at least 6 characters. You have ${password.length} so far.`
          : 'Passwords have at least 6 characters. Check for a typo.'
        : '',
  };
  const show = (k: 'name' | 'email' | 'password') => (touched[k] || submitted ? errors[k] : '');
  const blur = (k: string) => setTouched((t) => ({ ...t, [k]: true }));
  const focusField = (k: string) => document.getElementById(`auth-${k}`)?.focus();

  const switchMode = (m: 'in' | 'up') => {
    setMode(m);
    setErr('');
    setInfo('');
    setTouched({});
    setSubmitted(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr('');
    setInfo('');
    setSubmitted(true);
    const first = (['name', 'email', 'password'] as const).find((k) => errors[k]);
    if (first) return focusField(first);
    setBusy(true);
    try {
      const res: any =
        mode === 'up'
          ? await supabase!.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() }, emailRedirectTo: window.location.origin } })
          : await supabase!.auth.signInWithPassword({ email: email.trim(), password });
      if (res.error) return setErr(formatAuthError(res.error.message));
      if (mode === 'up' && !res.data?.session) setInfo('Confirmation email sent. Open the link in your inbox to verify and sign in.');
    } catch (error: any) {
      setErr(formatAuthError(error?.message));
    } finally {
      setBusy(false);
    }
  };

  const magicLink = async () => {
    if (busy) return;
    setErr('');
    setInfo('');
    if (errors.email) {
      blur('email');
      return focusField('email');
    }
    setBusy(true);
    try {
      const { error } = await supabase!.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } });
      error ? setErr(formatAuthError(error.message)) : setInfo('Sign-in link sent to your inbox. You can use it instead of a password.');
    } catch (error: any) {
      setErr(formatAuthError(error?.message));
    } finally {
      setBusy(false);
    }
  };

  const tabCls = (active: boolean) =>
    `relative min-h-11 px-3 text-sm font-semibold rounded-[8px] transition-colors cursor-pointer whitespace-nowrap ${
      active ? 'bg-[var(--surface-elevated)] text-[var(--ink-primary)] shadow-[var(--shadow-sm)] border border-[var(--border-hairline)]' : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] border border-transparent'
    }`;

  return (
    <AuthShell onBack={onBack}>
      {!ADMIN_SITE && (
        <div role="tablist" aria-label="Sign in or create an account" className="grid grid-cols-2 gap-1 p-1 rounded-[10px] bg-[var(--surface-subtle)] mb-7">
          <button type="button" role="tab" aria-selected={mode === 'in'} onClick={() => switchMode('in')} className={tabCls(mode === 'in')}>
                        Sign in
          </button>
          <button type="button" role="tab" aria-selected={mode === 'up'} onClick={() => switchMode('up')} className={tabCls(mode === 'up')}>
                        Create account
          </button>
        </div>
      )}

      <div className="mb-6">
        <h1 className="font-display text-[var(--ink-primary)]">
          {ADMIN_SITE ? 'Community admin' : mode === 'in' ? 'Welcome back' : 'Join Dev Hub'}
        </h1>
        <p className="text-base text-[var(--ink-secondary)] mt-2 leading-relaxed">
          {ADMIN_SITE
            ? 'Sign in to support members and manage activities.'
            : mode === 'in'
              ? 'Pick up your learning where you left off.'
              : 'Name, email and a password. Then a one-minute setup builds your learning plan.'}
        </p>
      </div>

      <form onSubmit={submit} noValidate className="space-y-4">
        {mode === 'up' && (
          <AuthField id="auth-name" label="Full name" error={show('name')}>
            <input
              id="auth-name"
              className={authInputCls(!!show('name'))}
              placeholder="Your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => blur('name')}
              autoComplete="name"
              aria-invalid={!!show('name')}
              aria-describedby={show('name') ? 'auth-name-msg' : undefined}
            />
          </AuthField>
        )}
        <AuthField id="auth-email" label="Email address" error={show('email')}>
          <input
            id="auth-email"
            className={authInputCls(!!show('email'))}
            placeholder="you@example.com"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => blur('email')}
            autoComplete="email"
            aria-invalid={!!show('email')}
            aria-describedby={show('email') ? 'auth-email-msg' : undefined}
          />
        </AuthField>
        <AuthField id="auth-password" label="Password" error={show('password')} hint={mode === 'up' ? 'At least 6 characters.' : undefined}>
          <div className="relative">
            <input
              id="auth-password"
              className={`${authInputCls(!!show('password'))} pr-12`}
              placeholder={mode === 'up' ? 'Choose a password' : 'Enter your password'}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => blur('password')}
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              aria-invalid={!!show('password')}
              aria-describedby={show('password') || mode === 'up' ? 'auth-password-msg' : undefined}
            />
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-0 top-0 h-12 w-12 flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
            </button>
          </div>
        </AuthField>

        {err && <AuthNotice tone="danger">{err}</AuthNotice>}
        {info && <AuthNotice tone="success">{info}</AuthNotice>}

        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create my account'}
        </button>
      </form>

      <div className="relative my-5" aria-hidden="true">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[var(--border-hairline)]" /></div>
        <div className="relative flex justify-center text-sm"><span className="bg-[var(--surface-elevated)] px-3 text-[var(--ink-muted)]">or</span></div>
      </div>

      <button type="button" disabled={busy} onClick={magicLink} className={`${secondaryBtn} w-full`}>
        Email me a one-time sign-in link
      </button>

      {ADMIN_SITE && (
        <p className="text-sm text-[var(--ink-secondary)] text-center mt-5">
          Admin accounts are set up by existing team leads.
        </p>
      )}
    </AuthShell>
  );
};

// ============================================================================
// 7-STEP ONE-QUESTION-PER-SCREEN MEMBER ONBOARDING WIZARD
// ============================================================================
const ONBOARDING_FIELDS = [
  'Frontend Development',
  'Backend Development',
  'Full-Stack Development',
  'Mobile Development',
  'AI Engineering',
  'Machine Learning',
  'Data Science',
  'Cybersecurity',
  'Cloud Computing',
  'DevOps',
  'Blockchain Development',
  'UI/UX Design',
  'Other',
];

const ONBOARDING_LEVELS = [
  {
    value: 'Complete beginner',
    desc: 'I am brand new to coding or have only tried a tiny bit so far.',
  },
  {
    value: 'Beginner',
    desc: 'I know a few basics like variables or simple HTML/CSS and want guided practice.',
  },
  {
    value: 'Intermediate',
    desc: 'I have built small projects and want to strengthen core concepts and independence.',
  },
  {
    value: 'Advanced',
    desc: 'I already write apps comfortably and want architectural review and harder challenges.',
  },
];

const ONBOARDING_GOALS = [
  'Get a job in tech',
  'Become a freelancer',
  'Build my own products',
  'Become a better developer',
  'Explore a new field',
];

const ONBOARDING_TIMES = [
  '20–30 minutes per day',
  '45–60 minutes per day',
  '1–2 hours per day',
  '3–5 hours per week',
  '6–10 hours per week',
];

const ONBOARDING_STEP_NAMES = ['Welcome', 'Focus area', 'Current level', 'What you know', 'Your goal', 'Study time', 'Roadmap'];

const OnboardingOption = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`relative w-full min-h-11 pl-5 pr-4 py-3 rounded-lg border text-left transition-colors cursor-pointer ${
      active
        ? 'border-[var(--accent-600)] bg-[var(--accent-50)]'
        : 'border-[var(--border-hairline)] bg-[var(--surface-elevated)] hover:border-[var(--border-strong)]'
    }`}
  >
    {active && <span aria-hidden="true" className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-[var(--spark)]" />}
    {children}
  </button>
);

const resultPanel = 'p-5 rounded-xl border border-[var(--border-hairline)] border-l-4 bg-[var(--surface-subtle)] space-y-3.5';
const resultSecondaryBtn =
  'inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--surface-elevated)] disabled:opacity-60 text-sm font-medium text-[var(--ink-primary)] cursor-pointer';
const resultPrimaryBtn =
  'inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-lg bg-[var(--accent-600)] hover:bg-[var(--accent-700)] disabled:opacity-60 text-white text-sm font-semibold cursor-pointer';

export const OnboardingWizard = ({
  initialProfile,
  userId,
  onComplete,
  onSkipToHome,
}: {
  initialProfile: OnboardingProfile;
  userId?: string;
  onComplete: (result: {
    profilePatch: Partial<OnboardingProfile>;
    selectedRoadmapId: string;
    customRoadmap?: RoadmapItem;
  }) => void;
  onSkipToHome?: () => void;
}) => {
  const [step, setStep] = useState(1);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstStepRender = useRef(true);
  const [selectedField, setSelectedField] = useState(initialProfile.field || 'Frontend Development');
  const [customField, setCustomField] = useState('');
  const [skillLevel, setSkillLevel] = useState(initialProfile.skillLevel || 'Complete beginner');
  const [knownSkills, setKnownSkills] = useState(initialProfile.knownSkills || '');
  const [goal, setGoal] = useState(initialProfile.goal || 'Become a better developer');
  const [studyTime, setStudyTime] = useState(initialProfile.studyTime || '45–60 minutes per day');

  const [lookupBusy, setLookupBusy] = useState(false);
  const [roadmapResult, setRoadmapResult] = useState<any>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiGeneratedRoadmap, setAiGeneratedRoadmap] = useState<RoadmapItem | null>(null);

  // Move focus to the new question when the step changes (keyboard and screen reader users)
  useEffect(() => {
    if (firstStepRender.current) {
      firstStepRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const effectiveField = selectedField === 'Other' ? (customField.trim() || 'Software Development') : selectedField;

  const runRoadmapLookup = async (fieldQuery: string) => {
    setLookupBusy(true);
    setAiError('');
    try {
      const res = await lookupOfficialRoadmap(fieldQuery);
      setRoadmapResult(res);
    } catch {
      setRoadmapResult({ found: false, source: 'none', field: fieldQuery });
    } finally {
      setLookupBusy(false);
    }
  };

  useEffect(() => {
    if (step === 7) {
      runRoadmapLookup(effectiveField);
    }
  }, [step, effectiveField]);

  const handleGenerateAiRoadmap = async () => {
    setAiBusy(true);
    setAiError('');
    try {
      const { data } = await requestAiRoadmap(
        {
          field: effectiveField,
          skillLevel,
          knownSkills,
          goal,
          studyTime,
        },
        userId
      );
      const stages = (data.stages || []).map((st, idx) => ({
        id: `ai-st-${idx + 1}`,
        title: st.stageName,
        description: st.description,
        topics: (st.topics || []).map((tp, tIdx) => ({
          id: `ai-tp-${idx + 1}-${tIdx + 1}`,
          name: tp.name,
          summary: tp.whyItMatters,
          stageTitle: st.stageName,
        })),
      }));
      const flatTopics = stages.flatMap((s) => s.topics);
      const custom: RoadmapItem = {
        id: `rm-custom-${Date.now()}`,
        source: 'ai',
        title: data.title || `${effectiveField} Learning Path`,
        field: effectiveField,
        officialUrl: '',
        summary: data.summary || `Personalized ${effectiveField} roadmap built for your level.`,
        stages,
        topics: flatTopics,
      };
      setAiGeneratedRoadmap(custom);
    } catch (err: any) {
      setAiError(err?.message || 'AI generation is unavailable right now. You can build a custom path cleanly in My Roadmap.');
    } finally {
      setAiBusy(false);
    }
  };

  const finishOnboarding = (useAiRoadmap = false) => {
    if (useAiRoadmap && aiGeneratedRoadmap) {
      onComplete({
        profilePatch: { field: effectiveField, skillLevel, knownSkills, goal, studyTime },
        selectedRoadmapId: aiGeneratedRoadmap.id,
        customRoadmap: aiGeneratedRoadmap,
      });
      return;
    }

    if (roadmapResult?.found && roadmapResult?.id) {
      onComplete({
        profilePatch: { field: effectiveField, skillLevel, knownSkills, goal, studyTime },
        selectedRoadmapId: roadmapResult.id,
      });
      return;
    }

    const fallbackCustom: RoadmapItem = aiGeneratedRoadmap || {
      id: `rm-custom-${Date.now()}`,
      source: 'custom',
      title: `${effectiveField} Starter Path`,
      field: effectiveField,
      officialUrl: '',
      summary: `Step-by-step ${effectiveField} roadmap tailored for a ${skillLevel.toLowerCase()} learner.`,
      stages: [
        {
          id: 'c-s1',
          title: 'Stage 1: Core Fundamentals',
          description: 'Start with the core concepts and small daily exercises.',
          topics: [
            { id: `c-1-${Date.now()}`, name: `${effectiveField} Basics & Setup`, summary: 'Learn key terms and set up your workspace.' },
            { id: `c-2-${Date.now()}`, name: 'First Small Practice Project', summary: 'Apply basics in a small real task.' },
          ],
        },
      ],
      topics: [
        { id: `c-1-${Date.now()}`, name: `${effectiveField} Basics & Setup`, stageTitle: 'Stage 1: Core Fundamentals' },
        { id: `c-2-${Date.now()}`, name: 'First Small Practice Project', stageTitle: 'Stage 1: Core Fundamentals' },
      ],
    };

    onComplete({
      profilePatch: { field: effectiveField, skillLevel, knownSkills, goal, studyTime },
      selectedRoadmapId: fallbackCustom.id,
      customRoadmap: fallbackCustom,
    });
  };

  const totalSteps = 7;
  const stepName = ONBOARDING_STEP_NAMES[step - 1];
  const answers: Record<number, string> = {
    2: effectiveField,
    3: skillLevel,
    4: knownSkills.trim() || 'Starting fresh',
    5: goal,
    6: studyTime,
  };
  const heading = 'font-display text-2xl sm:text-[1.75rem] text-[var(--ink-primary)] outline-none';
  const sub = 'text-base mt-2 leading-relaxed max-w-[60ch] text-[var(--ink-secondary)]';

  return (
    <div className="max-w-4xl mx-auto py-2 sm:py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
      {/* Desktop: the trail of steps, with your answers so far */}
      <nav aria-label="Setup steps" className="hidden lg:block lg:col-span-4">
        <ol className="lg:sticky lg:top-6 space-y-1">
          {ONBOARDING_STEP_NAMES.map((n, i) => {
            const num = i + 1;
            const done = num < step;
            const current = num === step;
            return (
              <li
                key={n}
                aria-current={current ? 'step' : undefined}
                className={`relative flex gap-3 py-2.5 pl-4 ${current ? 'text-[var(--ink-primary)]' : done ? 'text-[var(--ink-primary)]' : 'text-[var(--ink-muted)]'}`}
              >
                {current && <span aria-hidden="true" className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-[var(--spark)]" />}
                <span
                  aria-hidden="true"
                  className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold tabular-nums border ${
                    done
                      ? 'bg-[var(--accent-600)] border-[var(--accent-600)] text-white'
                      : current
                        ? 'border-[var(--ink-primary)] text-[var(--ink-primary)]'
                        : 'border-[var(--border-strong)]'
                  }`}
                >
                  {done ? <Check className="w-3.5 h-3.5" /> : num}
                </span>
                <span className="min-w-0">
                  <span className={`block text-base leading-6 ${current ? 'font-semibold' : ''}`}>{n}</span>
                  {done && answers[num] && <span className="block text-sm text-[var(--ink-secondary)] truncate">{answers[num]}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>

      <section className="lg:col-span-8 studio-card p-6 sm:p-8 space-y-6" aria-labelledby="onboarding-heading">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="font-semibold tabular-nums text-[var(--ink-primary)]">
              Step {step} of {totalSteps}
              <span className="font-normal text-[var(--ink-secondary)]"> · {stepName}</span>
            </p>
            {onSkipToHome && step === 1 && (
              <button
                type="button"
                onClick={onSkipToHome}
                className="min-h-11 px-2 -mr-2 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] underline underline-offset-2 cursor-pointer"
              >
                Skip for now
              </button>
            )}
          </div>
          <div
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={1}
            aria-valuemax={totalSteps}
            aria-valuenow={step}
            aria-valuetext={`Step ${step} of ${totalSteps}`}
            className="flex gap-1"
          >
            {Array.from({ length: totalSteps }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full ${i + 1 < step ? 'bg-[var(--accent-600)]' : i + 1 === step ? 'bg-[var(--spark)]' : 'bg-[var(--border-hairline)]'}`}
              />
            ))}
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-5 py-1">
            <div>
              <h1 id="onboarding-heading" ref={headingRef} tabIndex={-1} className="font-display text-[var(--ink-primary)] outline-none [text-wrap:balance]">
                Let’s build your developer journey
              </h1>
              <p className={sub}>
                Answer a few quick questions and we’ll shape a learning plan around your goals. It takes about a minute, one question at a time.
              </p>
            </div>
            <ul className="space-y-3 text-base text-[var(--ink-secondary)]">
              {['Pick what you want to learn', 'Tell us where you are today', 'Choose a pace that feels realistic', 'Get a roadmap to follow'].map((t) => (
                <li key={t} className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[var(--spark)] shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex items-center justify-center gap-2 min-h-11 px-6 rounded-lg bg-[var(--accent-600)] hover:bg-[var(--accent-700)] text-white text-base font-semibold cursor-pointer"
            >
              Get started <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 id="onboarding-heading" ref={headingRef} tabIndex={-1} className={heading}>What do you want to learn?</h2>
              <p className={sub}>Pick the area you want to focus on first. You can change this later.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ONBOARDING_FIELDS.map((field) => (
                <OnboardingOption key={field} active={selectedField === field} onClick={() => setSelectedField(field)}>
                  <span className="text-base font-medium">{field}</span>
                </OnboardingOption>
              ))}
            </div>
            {selectedField === 'Other' && (
              <div>
                <label htmlFor="onboarding-custom-field" className="block text-sm font-medium text-[var(--ink-primary)] mb-1.5">
                  Your field or topic
                </label>
                <input
                  id="onboarding-custom-field"
                  type="text"
                  value={customField}
                  onChange={(e) => setCustomField(e.target.value)}
                  placeholder="For example: game development or Python automation"
                  className={authInputCls(false)}
                  aria-describedby="onboarding-custom-field-msg"
                />
                <p id="onboarding-custom-field-msg" className="mt-1.5 text-sm text-[var(--ink-secondary)]">
                  {customField.trim() ? 'We’ll look for a roadmap that matches this.' : 'Leave this empty and we’ll use “Software Development”.'}
                </p>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 id="onboarding-heading" ref={headingRef} tabIndex={-1} className={heading}>What is your current level?</h2>
              <p className={sub}>Be honest. Dev Hub adjusts exercises and explanations to meet you where you are.</p>
            </div>
            <div className="space-y-3">
              {ONBOARDING_LEVELS.map((lvl) => (
                <OnboardingOption key={lvl.value} active={skillLevel === lvl.value} onClick={() => setSkillLevel(lvl.value)}>
                  <div className="text-base font-semibold">{lvl.value}</div>
                  <div className="text-sm mt-0.5 text-[var(--ink-secondary)]">{lvl.desc}</div>
                </OnboardingOption>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h2 id="onboarding-heading" ref={headingRef} tabIndex={-1} className={heading}>What do you already know?</h2>
              <p className={sub}>List any languages, tools or courses you’ve tried. Leave it blank if you’re starting from zero.</p>
            </div>
            <div>
              <label htmlFor="onboarding-known" className="sr-only">What you already know</label>
              <textarea
                id="onboarding-known"
                rows={4}
                value={knownSkills}
                onChange={(e) => setKnownSkills(e.target.value)}
                placeholder="For example: a bit of HTML and CSS, two Python videos, or completely new"
                className={`${authInputCls(false)} h-auto py-2.5 leading-relaxed`}
              />
            </div>
            <div>
              <p className="text-sm text-[var(--ink-secondary)] mb-2">Quick add</p>
              <div className="flex flex-wrap gap-2">
                {['Starting from scratch', 'Basic HTML & CSS', 'Some JavaScript', 'Some Python', 'Git basics'].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setKnownSkills((prev) => (prev ? `${prev}, ${chip}` : chip))}
                    className="min-h-11 sm:min-h-9 px-3.5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-subtle)] text-sm text-[var(--ink-primary)] cursor-pointer"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-5">
            <div>
              <h2 id="onboarding-heading" ref={headingRef} tabIndex={-1} className={heading}>What is your goal?</h2>
              <p className={sub}>Knowing what you’re aiming for helps us pick practical exercises and projects.</p>
            </div>
            <div className="space-y-3">
              {ONBOARDING_GOALS.map((g) => (
                <OnboardingOption key={g} active={goal === g} onClick={() => setGoal(g)}>
                  <span className="text-base font-medium">{g}</span>
                </OnboardingOption>
              ))}
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-5">
            <div>
              <h2 id="onboarding-heading" ref={headingRef} tabIndex={-1} className={heading}>How much time can you learn?</h2>
              <p className={sub}>A small steady habit beats cramming. Pick what feels realistic right now.</p>
            </div>
            <div className="space-y-3">
              {ONBOARDING_TIMES.map((t) => (
                <OnboardingOption key={t} active={studyTime === t} onClick={() => setStudyTime(t)}>
                  <span className="text-base font-medium">{t}</span>
                </OnboardingOption>
              ))}
            </div>
          </div>
        )}

        {step === 7 && (
          <div className="space-y-5">
            <div>
              <h2 id="onboarding-heading" ref={headingRef} tabIndex={-1} className={heading}>Create your learning roadmap</h2>
              <p className={sub}>
                {lookupBusy ? 'Checking roadmap.sh for ' : 'Here’s what we found for '}
                <strong className="font-semibold text-[var(--ink-primary)]">{effectiveField}</strong>
                {lookupBusy ? '…' : '.'}
              </p>
            </div>

            {lookupBusy ? (
              <div role="status" className="py-6 flex items-center gap-3 text-base text-[var(--ink-secondary)]">
                <Loader2 className="w-4 h-4 motion-safe:animate-spin text-[var(--accent-600)]" aria-hidden="true" />
                <span>Looking for a matching roadmap…</span>
              </div>
            ) : aiGeneratedRoadmap ? (
              <div className={`${resultPanel} border-l-[var(--spark)]`}>
                <Badge variant="info">AI-generated learning path</Badge>
                <h3 className="font-display text-lg text-[var(--ink-primary)]">{aiGeneratedRoadmap.title}</h3>
                <p className="text-base leading-relaxed text-[var(--ink-secondary)] max-w-[60ch]">{aiGeneratedRoadmap.summary}</p>
                <ul className="space-y-2 text-base">
                  {(aiGeneratedRoadmap.stages || []).map((s) => (
                    <li key={s.id} className="flex gap-2.5">
                      <span aria-hidden="true" className="w-1.5 h-1.5 mt-2.5 rounded-full bg-[var(--spark)] shrink-0" />
                      <span>{s.title} <span className="text-[var(--ink-secondary)]">({s.topics.length} topics)</span></span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2.5 pt-2">
                  <button type="button" onClick={() => finishOnboarding(true)} className={resultPrimaryBtn}>
                    Use this learning path
                  </button>
                  <button type="button" onClick={() => setAiGeneratedRoadmap(null)} className={resultSecondaryBtn}>
                    Back to roadmap search
                  </button>
                </div>
              </div>
            ) : roadmapResult?.found ? (
              <div className={`${resultPanel} border-l-[var(--accent-600)]`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="success">Matched on roadmap.sh</Badge>
                  <a
                    href={roadmapResult.officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 min-h-11 text-sm font-medium text-[var(--accent-600)] hover:underline"
                  >
                    View original on roadmap.sh <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  </a>
                </div>
                <div>
                  <h3 className="font-display text-lg text-[var(--ink-primary)]">{roadmapResult.title}</h3>
                  <p className="text-base mt-1.5 leading-relaxed text-[var(--ink-secondary)] max-w-[60ch]">{roadmapResult.summary}</p>
                </div>
                {roadmapResult.whatYouWillLearn?.length > 0 && (
                  <div className="space-y-2 text-base">
                    <div className="font-semibold">What you will learn</div>
                    <ul className="space-y-1">
                      {roadmapResult.whatYouWillLearn.map((item: string, idx: number) => (
                        <li key={idx} className="flex gap-2.5 text-[var(--ink-secondary)]">
                          <span aria-hidden="true" className="w-1.5 h-1.5 mt-2.5 rounded-full bg-[var(--spark)] shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {roadmapResult.stages?.length > 0 && (
                  <div className="space-y-3 text-base">
                    <div className="font-semibold">Main stages</div>
                    <div className="flex flex-wrap gap-2">
                      {roadmapResult.stages.map((st: any) => (
                        <span key={st.id} className="px-3 py-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-elevated)] text-sm">
                          {st.title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2.5 pt-2">
                  <button type="button" onClick={() => finishOnboarding(false)} className={resultPrimaryBtn}>
                    Use this roadmap
                  </button>
                  <button type="button" onClick={() => setStep(2)} className={resultSecondaryBtn}>
                    Explore another field
                  </button>
                  <button type="button" disabled={aiBusy} onClick={handleGenerateAiRoadmap} className={resultSecondaryBtn}>
                    {aiBusy ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
                    Create an AI alternative
                  </button>
                </div>
              </div>
            ) : (
              <div className={`${resultPanel} border-l-[var(--spark)]`}>
                <h3 className="font-display text-lg text-[var(--ink-primary)]">We don’t have a roadmap for this field yet</h3>
                <p className="text-base leading-relaxed text-[var(--ink-secondary)] max-w-[60ch]">
                  We won’t pretend an unrelated roadmap matches “{effectiveField}”. Let AI draft a learning path around the skills you need, or begin with a starter path you can change at any time.
                </p>
                <div className="flex flex-wrap gap-2.5 pt-1">
                  <button type="button" disabled={aiBusy} onClick={handleGenerateAiRoadmap} className={resultPrimaryBtn}>
                    {aiBusy ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
                    Generate my learning path with AI
                  </button>
                  <button type="button" onClick={() => finishOnboarding(false)} className={resultSecondaryBtn}>
                    Start with a starter path
                  </button>
                </div>
              </div>
            )}

            {aiError && <AuthNotice tone="warning">{aiError}</AuthNotice>}
          </div>
        )}

        {step > 1 && (
          <div className="pt-5 border-t border-[var(--border-hairline)] flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--surface-subtle)] text-sm font-medium text-[var(--ink-primary)] cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back
            </button>

            {step < 7 && (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(7, s + 1))}
                className="inline-flex items-center gap-1.5 min-h-11 px-6 rounded-lg bg-[var(--accent-600)] hover:bg-[var(--accent-700)] text-white text-sm font-semibold cursor-pointer"
              >
                Continue <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
