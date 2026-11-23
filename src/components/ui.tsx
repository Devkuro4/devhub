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
import { ADMIN_CODE, ADMIN_SITE, MEMBER_SITE_URL } from '../data/seedData';


export const DarkCtx = createContext(false);

/** Four-point sparkle: the one decorative shape used on banners and the sign-in panel */
export const Sparkle = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" aria-hidden="true" className={className}>
    <path d="M50 0C54 30 70 46 100 50C70 54 54 70 50 100C46 70 30 54 0 50C30 46 46 30 50 0Z" fill="currentColor" />
  </svg>
);

/** The Dev Hub logo mark: a compact code tile with the product brackets. */
export const LogoMark = ({ size = 40 }: { size?: number }) => (
  <span
    aria-hidden="true"
    style={{ width: size, height: size, borderRadius: Math.max(6, Math.round(size * 0.2)) }}
    className="bg-[var(--panel-deep)] text-white flex items-center justify-center shrink-0 dark:border dark:border-[var(--border-strong)]"
  >
    <svg viewBox="0 0 24 24" style={{ width: size * 0.5, height: size * 0.5 }} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 7.5 4 12l4.5 4.5M15.5 7.5 20 12l-4.5 4.5" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </svg>
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
    <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 lg:gap-8 pb-1 lg:pb-2 border-b border-[var(--border-hairline)]">
      <div className="space-y-3 max-w-2xl min-w-0">
        <h1 className="font-display text-[var(--ink-primary)]">{title}</h1>
        <p className="text-base leading-relaxed max-w-[62ch] text-[var(--ink-secondary)]">{description}</p>
      </div>
      {action && <div className="page-header-actions flex flex-wrap items-center gap-2.5 lg:gap-3 lg:shrink-0 pb-4 lg:pb-3">{action}</div>}
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
  const tabListRef = React.useRef<HTMLDivElement>(null);
  // Only when the active tab changes, and only sideways inside the tab row (never moves the page)
  useEffect(() => {
    const list = tabListRef.current;
    const el = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !el || list.scrollWidth <= list.clientWidth) return;
    list.scrollTo({ left: el.offsetLeft - (list.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
  }, [active]);
  // Fade the edge that has more tabs hidden past it, so a clipped tab reads as "scroll" not "broken"
  const [edges, setEdges] = useState({ start: false, end: false });
  useEffect(() => {
    const list = tabListRef.current;
    if (!list) return;
    const measure = () =>
      setEdges({
        start: list.scrollLeft > 4,
        end: list.scrollLeft + list.clientWidth < list.scrollWidth - 4,
      });
    measure();
    list.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      list.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [tabs.length]);
  return (
    <div
      role="tablist"
      ref={tabListRef}
      data-fade-start={edges.start || undefined}
      data-fade-end={edges.end || undefined}
      className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar w-full max-w-full border-b border-[var(--border-hairline)] snap-x overscroll-x-contain"
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
            className={`relative px-4 sm:px-5 py-3.5 text-[0.9375rem] font-medium whitespace-nowrap shrink-0 snap-start cursor-pointer min-h-[52px] flex items-center gap-2 transition-colors ${
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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
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
        className={`studio-card w-full max-w-xl p-6 sm:p-8 max-h-[90dvh] overflow-y-auto overscroll-contain space-y-5 shadow-[var(--shadow-lg)] ${
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
      <div className="relative hidden lg:flex lg:col-span-6 xl:col-span-6 flex-col justify-between p-12 xl:p-16 bg-[var(--pastel-aqua)] text-[var(--ink-primary)] overflow-hidden">
        <Sparkle className="absolute -right-16 -bottom-20 w-[26rem] text-[var(--pastel-pink)] opacity-80" />
        <Sparkle className="absolute right-24 top-24 w-24 text-[var(--pastel-yellow)] opacity-90" />
        <Sparkle className="absolute right-12 top-56 w-12 text-[var(--ink-primary)] opacity-10" />

        <div className="relative z-10 flex items-center gap-3">
          <LogoMark />
          <span className="font-display text-xl font-bold whitespace-nowrap">{brand}</span>
        </div>

        <div className="relative z-10 max-w-xl space-y-10">
          <div className="space-y-5">
            <h2 className="font-display text-4xl xl:text-5xl font-semibold leading-[1.08] tracking-tight [text-wrap:balance] text-[var(--ink-primary)]">
              {ADMIN_SITE ? 'Support members consistently, one week at a time.' : 'Turn the courses you follow into skills you can use.'}
            </h2>
            <p className="text-lg text-[var(--ink-secondary)] leading-relaxed max-w-[46ch]">
              {ADMIN_SITE
                ? 'Keep the community friendly, publish challenges and study sessions, and monitor the AI learning tools.'
                : 'Practise every day, get clear feedback on your code, and build real projects alongside people who are learning too.'}
            </p>
          </div>

          <ol className="space-y-5">
            {trail.map((t) => (
              <li key={t.name} className="flex gap-4">
                <span aria-hidden="true" className="mt-2.5 w-2 h-2 rounded-full bg-[var(--ink-primary)] shrink-0" />
                <div className="text-base leading-snug">
                  <span className="font-semibold text-[var(--ink-primary)]">{t.name}.</span>{' '}
                  <span className="text-[var(--ink-secondary)]">{t.note}</span>
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

export const LoginScreen = ({
  onLogin,
}: {
  onLogin: (u: { id: string; name: string; email: string; isAdmin: boolean; adminCode?: string }) => void;
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [wantAdmin, setWantAdmin] = useState(ADMIN_SITE);
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  const isAdminLogin = ADMIN_SITE || wantAdmin;
  const needsCode = isAdminLogin && !!ADMIN_CODE;
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
    const cleanEmail = email.trim().toLowerCase();
    const id = isAdminLogin ? `admin:${cleanEmail}` : `member:${cleanEmail}`;
    onLogin({
      id,
      name: name.trim(),
      email: cleanEmail,
      isAdmin: isAdminLogin,
      adminCode: isAdminLogin ? code : undefined,
    });
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
        {!ADMIN_SITE && (
          <label className="flex items-center gap-2.5 text-sm text-[var(--ink-secondary)] cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={wantAdmin}
              onChange={(e) => setWantAdmin(e.target.checked)}
              className="rounded border-[var(--border-strong)]"
            />
            <span>Sign in as Community Admin (demo)</span>
          </label>
        )}
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
