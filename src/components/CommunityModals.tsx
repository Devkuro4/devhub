import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AtSign,
  Award,
  Bell,
  Calendar,
  Check,
  CheckCheck,
  ExternalLink,
  Flame,
  Flag,
  FolderGit2,
  Globe,
  HelpCircle,
  Lock,
  Megaphone,
  MessageSquare,
  Shield,
  ShieldAlert,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { Badge, Modal } from './ui';
import type {
  CommunityNotification,
  CommunityPost,
  MemberDirectoryProfile,
  ReportTargetType,
  ShowcaseProject,
} from '../types';

const initialsOf = (name: string) =>
  (name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || '?';

const formatRelativeTime = (iso?: string) => {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

/** Highlight @mentions in discussion text cleanly using Dev Hub accent color */
export const MentionText: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => {
  const parts = String(text || '').split(/(@[a-zA-Z0-9._-]{2,32})/g);
  return (
    <span className={className}>
      {parts.map((part, idx) =>
        part.startsWith('@') && part.length > 2 ? (
          <span key={idx} className="font-semibold text-[var(--accent-600)]">
            {part}
          </span>
        ) : (
          <React.Fragment key={idx}>{part}</React.Fragment>
        )
      )}
    </span>
  );
};

export interface MentionPickItem {
  id: string;
  name: string;
  username?: string;
}

/** Inline mention helper bar for discussion/comment inputs */
export const MentionPickerBar: React.FC<{
  value: string;
  candidates: MentionPickItem[];
  onPick: (nextValue: string) => void;
}> = ({ value, candidates, onPick }) => {
  const match = value.match(/(?:^|\s)@([a-z0-9._-]{0,24})$/i);
  const hits = useMemo(() => {
    if (!match || candidates.length === 0) return [];
    const q = match[1].toLowerCase();
    return candidates
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.username && c.username.toLowerCase().includes(q)))
      .slice(0, 5);
  }, [match, candidates]);

  if (hits.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 py-1">
      <span className="text-[11px] text-[var(--ink-muted)] inline-flex items-center gap-1">
        <AtSign className="w-3 h-3" aria-hidden="true" /> Mention:
      </span>
      {hits.map((c) => {
        const handle = c.username || c.name.replace(/\s+/g, '');
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(value.replace(/(^|\s)@[a-z0-9._-]{0,24}$/i, `$1@${handle} `))}
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--accent-50)] text-[var(--accent-700)] hover:bg-[var(--accent-100)] cursor-pointer"
          >
            @{handle} <span className="opacity-70">({c.name})</span>
          </button>
        );
      })}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Notification Bell & Popover                                                */
/* -------------------------------------------------------------------------- */

const notifIcon = (type: CommunityNotification['type']) => {
  switch (type) {
    case 'mention':
      return AtSign;
    case 'reply':
      return MessageSquare;
    case 'reaction':
      return Sparkles;
    case 'help_answer':
      return HelpCircle;
    case 'announcement':
      return Megaphone;
    case 'study_group':
      return Users;
    case 'event':
      return Calendar;
    case 'moderation':
    case 'report':
      return ShieldAlert;
    default:
      return Bell;
  }
};

export const NotificationBell: React.FC<{
  notifications: CommunityNotification[];
  loading?: boolean;
  compact?: boolean;
  onMarkRead: (notifId: string) => void;
  onMarkAllRead: () => void;
  onSelectNotification: (n: CommunityNotification) => void;
}> = ({ notifications, loading, compact, onMarkRead, onMarkAllRead, onSelectNotification }) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'mentions'>('all');
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const visible = useMemo(() => {
    return notifications.filter((n) => {
      if (filter === 'unread') return !n.read;
      if (filter === 'mentions') return n.type === 'mention';
      return true;
    });
  }, [notifications, filter]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        className={`relative inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-subtle)] text-[var(--ink-primary)] cursor-pointer transition-colors ${
          compact ? 'min-h-[44px] min-w-[44px] p-2' : 'min-h-[40px] px-3 py-1.5 text-sm font-medium'
        }`}
      >
        <Bell className="w-4 h-4 text-[var(--accent-600)] shrink-0" aria-hidden="true" />
        {!compact && <span className="hidden sm:inline">Notifications</span>}
        {unreadCount > 0 && (
          <span
            className={`px-1.5 py-0.5 rounded-full bg-[var(--accent-600)] text-white text-[11px] font-bold tabular-nums leading-none ${
              compact ? 'absolute -top-1 -right-1' : ''
            }`}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Community notifications"
          className="fixed sm:absolute right-3 sm:right-0 left-3 sm:left-auto top-16 sm:top-full sm:mt-2 z-50 sm:w-[390px] studio-card shadow-[var(--shadow-lg)] overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[var(--ink-primary)]">Notifications</h2>
              <p className="text-xs text-[var(--ink-secondary)]">
                {unreadCount > 0 ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}` : 'All caught up'}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="inline-flex items-center gap-1 px-2.5 min-h-[32px] rounded-md text-xs font-medium text-[var(--accent-600)] hover:bg-[var(--accent-50)] cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" /> Mark all read
                </button>
              )}
              <button
                type="button"
                aria-label="Close notifications"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md text-[var(--ink-secondary)] hover:bg-[var(--surface-subtle)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="px-4 py-2 border-b border-[var(--border-hairline)] flex items-center gap-1.5 bg-[var(--surface-subtle)]">
            {([
              ['all', 'All'],
              ['unread', `Unread (${unreadCount})`],
              ['mentions', 'Mentions'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`px-2.5 min-h-[30px] rounded-full text-xs font-medium cursor-pointer transition-colors ${
                  filter === id
                    ? 'bg-[var(--surface-elevated)] text-[var(--ink-primary)] shadow-[var(--shadow-sm)] border border-[var(--border-hairline)]'
                    : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-[360px] overflow-y-auto divide-y divide-[var(--border-hairline)]">
            {loading ? (
              <div className="p-6 text-center text-sm text-[var(--ink-secondary)]">Loading notifications…</div>
            ) : visible.length === 0 ? (
              <div className="p-8 text-center space-y-1.5">
                <Bell className="w-6 h-6 mx-auto text-[var(--ink-muted)] opacity-60" aria-hidden="true" />
                <p className="text-sm font-medium text-[var(--ink-primary)]">
                  {filter === 'unread' ? 'No unread notifications' : filter === 'mentions' ? 'No @mentions yet' : 'No notifications yet'}
                </p>
                <p className="text-xs text-[var(--ink-secondary)]">
                  Replies, @mentions, announcements, study group updates, and event activity appear here.
                </p>
              </div>
            ) : (
              visible.slice(0, 30).map((n) => {
                const Icon = notifIcon(n.type);
                return (
                  <div
                    key={n.id}
                    className={`p-3.5 flex items-start gap-3 transition-colors ${
                      !n.read ? 'bg-[var(--accent-50)]/45' : 'hover:bg-[var(--surface-subtle)]'
                    }`}
                  >
                    <span className="w-8 h-8 rounded-full bg-[var(--accent-50)] text-[var(--accent-700)] flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (!n.read) onMarkRead(n.id);
                        setOpen(false);
                        onSelectNotification(n);
                      }}
                      className="min-w-0 flex-1 text-left cursor-pointer space-y-0.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-semibold truncate ${!n.read ? 'text-[var(--ink-primary)]' : 'text-[var(--ink-secondary)]'}`}>
                          {n.title}
                        </span>
                        <span className="text-[11px] text-[var(--ink-muted)] shrink-0">{formatRelativeTime(n.createdAt)}</span>
                      </div>
                      <p className="text-xs text-[var(--ink-secondary)] line-clamp-2 leading-relaxed">{n.body}</p>
                    </button>
                    {!n.read && (
                      <button
                        type="button"
                        aria-label="Mark notification as read"
                        title="Mark as read"
                        onClick={() => onMarkRead(n.id)}
                        className="p-1 rounded-md text-[var(--accent-600)] hover:bg-[var(--accent-100)] cursor-pointer shrink-0"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Member Profile Modal                                                       */
/* -------------------------------------------------------------------------- */

export const MemberProfileModal: React.FC<{
  open: boolean;
  onClose: () => void;
  member: MemberDirectoryProfile | null;
  currentUserId: string;
  isAdminMode: boolean;
  isMuted?: boolean;
  mutedReason?: string;
  memberPosts: CommunityPost[];
  memberShowcase: ShowcaseProject[];
  onStartDirectChat: (member: MemberDirectoryProfile) => void;
  onOpenPost?: (postId: string) => void;
  onToggleMute?: (member: MemberDirectoryProfile, muted: boolean, reason?: string) => void;
}> = ({
  open,
  onClose,
  member,
  currentUserId,
  isAdminMode,
  isMuted,
  mutedReason,
  memberPosts,
  memberShowcase,
  onStartDirectChat,
  onOpenPost,
  onToggleMute,
}) => {
  const [muteNote, setMuteNote] = useState('');

  if (!member) return null;
  const isSelf = member.id === currentUserId;
  const skills = [...(member.languages || []), ...(member.frameworks || [])];

  return (
    <Modal open={open} onClose={onClose} title="Member Profile">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-14 h-14 rounded-full bg-[var(--panel-deep)] text-white font-display text-xl font-semibold flex items-center justify-center shrink-0">
              {initialsOf(member.name)}
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-xl text-[var(--ink-primary)] truncate">{member.name}</h3>
                {member.role === 'Community Admin' ? (
                  <Badge variant="info">
                    <Shield className="w-3 h-3" aria-hidden="true" /> Community Admin
                  </Badge>
                ) : (
                  <Badge variant="neutral">{member.role || 'Member'}</Badge>
                )}
                {isMuted && <Badge variant="danger">Muted</Badge>}
              </div>
              <p className="text-xs text-[var(--ink-secondary)]">
                {member.username ? `@${member.username}` : ''}
                {member.username && (member.field || member.level) ? ' · ' : ''}
                {[member.field, member.level].filter(Boolean).join(' · ') || 'Community Learner'}
              </p>
            </div>
          </div>

          {!isSelf && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onStartDirectChat(member);
              }}
              className="inline-flex items-center gap-2 px-4 min-h-10 rounded-[10px] bg-[var(--accent-600)] hover:bg-[var(--accent-700)] text-white text-sm font-semibold cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" aria-hidden="true" /> Message
            </button>
          )}
        </div>

        {member.bio && (
          <p className="text-sm leading-relaxed text-[var(--ink-secondary)] bg-[var(--surface-subtle)] p-3.5 rounded-xl border border-[var(--border-hairline)]">
            {member.bio}
          </p>
        )}

        {(typeof member.streakDays === 'number' || typeof member.badgesCount === 'number' || member.partner || member.mentor) && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
            {typeof member.streakDays === 'number' && (
              <div className="soft-card px-3.5 py-2.5 flex items-center gap-2">
                <Flame className="w-4 h-4 text-[var(--accent-600)] shrink-0" aria-hidden="true" />
                <span><strong className="text-[var(--ink-primary)] tabular-nums">{member.streakDays}</strong> day streak</span>
              </div>
            )}
            {typeof member.badgesCount === 'number' && (
              <div className="soft-card px-3.5 py-2.5 flex items-center gap-2">
                <Award className="w-4 h-4 text-[var(--accent-600)] shrink-0" aria-hidden="true" />
                <span><strong className="text-[var(--ink-primary)] tabular-nums">{member.badgesCount}</strong> badges</span>
              </div>
            )}
            {(member.partner || member.mentor) && (
              <div className="soft-card px-3.5 py-2.5 col-span-2 sm:col-span-1 flex items-center gap-2 truncate">
                <Users className="w-4 h-4 text-[var(--accent-600)] shrink-0" aria-hidden="true" />
                <span className="truncate">{member.partner ? `Buddy: ${member.partner}` : `Mentor: ${member.mentor}`}</span>
              </div>
            )}
          </div>
        )}

        {skills.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">Stack & Skills</div>
            <div className="flex flex-wrap gap-1.5">
              {skills.map((s) => (
                <span key={s} className="px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--surface-subtle)] border border-[var(--border-hairline)] text-[var(--ink-primary)]">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {(member.githubUrl || member.portfolioUrl || member.linkedinUrl) && (
          <div className="flex flex-wrap gap-3 text-xs">
            {member.githubUrl && (
              <a href={member.githubUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-[var(--accent-600)] hover:underline">
                <FolderGit2 className="w-3.5 h-3.5" aria-hidden="true" /> GitHub <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {member.portfolioUrl && (
              <a href={member.portfolioUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-[var(--accent-600)] hover:underline">
                <Globe className="w-3.5 h-3.5" aria-hidden="true" /> Portfolio <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {member.linkedinUrl && (
              <a href={member.linkedinUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-[var(--accent-600)] hover:underline">
                LinkedIn <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        <div className="space-y-2 pt-2 border-t border-[var(--border-hairline)]">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
            Recent Community Posts ({memberPosts.length})
          </div>
          {memberPosts.length === 0 ? (
            <p className="text-xs text-[var(--ink-secondary)]">No discussions posted yet.</p>
          ) : (
            <ul className="space-y-2">
              {memberPosts.slice(0, 4).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenPost?.(p.id);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg bg-[var(--surface-subtle)] hover:bg-[var(--accent-50)] transition-colors cursor-pointer"
                  >
                    <div className="text-xs font-semibold text-[var(--accent-600)]">{p.category} · {p.timestamp}</div>
                    <div className="text-sm font-medium text-[var(--ink-primary)] truncate">{p.title}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {memberShowcase.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-[var(--border-hairline)]">
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
              Showcase Projects ({memberShowcase.length})
            </div>
            <ul className="space-y-2">
              {memberShowcase.slice(0, 3).map((proj) => (
                <li key={proj.id} className="px-3 py-2 rounded-lg bg-[var(--surface-subtle)] text-xs space-y-0.5">
                  <div className="font-semibold text-[var(--ink-primary)]">{proj.title}</div>
                  <div className="text-[var(--ink-secondary)] line-clamp-1">{proj.summary}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isAdminMode && !isSelf && member.role !== 'Community Admin' && onToggleMute && (
          <div className="pt-3 border-t border-[var(--border-hairline)] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--ink-primary)] inline-flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[var(--warning-ink)]" aria-hidden="true" />
                Admin Moderation
              </span>
              {isMuted && mutedReason && <span className="text-xs text-[var(--danger-ink)]">Reason: {mutedReason}</span>}
            </div>
            {isMuted ? (
              <button
                type="button"
                onClick={() => onToggleMute(member, false)}
                className="min-h-10 px-4 rounded-lg border border-[var(--border-strong)] text-xs font-semibold text-[var(--ink-primary)] hover:bg-[var(--surface-subtle)] cursor-pointer"
              >
                Unmute Member
              </button>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={muteNote}
                  onChange={(e) => setMuteNote(e.target.value)}
                  placeholder="Optional reason for muting..."
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)]"
                />
                <button
                  type="button"
                  onClick={() => {
                    onToggleMute(member, true, muteNote.trim() || 'Community guidelines reminder');
                    setMuteNote('');
                  }}
                  className="min-h-10 px-4 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger-border)] text-[var(--danger-ink)] text-xs font-semibold cursor-pointer hover:opacity-90"
                >
                  Mute Member
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

/* -------------------------------------------------------------------------- */
/* Report Content Modal                                                       */
/* -------------------------------------------------------------------------- */

export interface ReportDraftTarget {
  targetType: ReportTargetType;
  targetId: string;
  parentId?: string;
  roomId?: string;
  targetAuthorId?: string;
  targetAuthorName: string;
  targetPreview: string;
}

const REPORT_REASONS = [
  'Spam or self-promotion',
  'Unkind or disrespectful tone',
  'Off-topic or misleading code',
  'Exposed API key or personal info',
  'Other concern',
];

export const ReportModal: React.FC<{
  open: boolean;
  target: ReportDraftTarget | null;
  onClose: () => void;
  onSubmit: (target: ReportDraftTarget, reason: string, details: string) => Promise<void> | void;
}> = ({ open, target, onClose, onSubmit }) => {
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setReason(REPORT_REASONS[0]);
      setDetails('');
      setBusy(false);
    }
  }, [open]);

  if (!target) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await onSubmit(target, reason, details.trim());
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Report to Community Moderators">
      <form onSubmit={submit} className="space-y-4">
        <div className="p-3.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-hairline)] space-y-1 text-xs">
          <div className="font-semibold text-[var(--ink-primary)] inline-flex items-center gap-1.5">
            <Flag className="w-3.5 h-3.5 text-[var(--warning-ink)]" aria-hidden="true" />
            Reporting {target.targetType} by {target.targetAuthorName}
          </div>
          <p className="text-[var(--ink-secondary)] line-clamp-2">{target.targetPreview}</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="report-reason" className="block text-sm font-semibold text-[var(--ink-primary)]">
            What’s the issue?
          </label>
          <select
            id="report-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3.5 py-2.5 text-sm rounded-[10px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)]"
          >
            {REPORT_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="report-details" className="block text-sm font-semibold text-[var(--ink-primary)]">
            Additional context <span className="font-normal text-[var(--ink-secondary)]">(optional)</span>
          </label>
          <textarea
            id="report-details"
            rows={3}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Share anything helpful for a community admin reviewing this..."
            className="w-full px-3.5 py-2.5 text-sm rounded-[10px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)]"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 px-4 rounded-[10px] border border-[var(--border-strong)] text-sm font-medium text-[var(--ink-primary)] hover:bg-[var(--surface-subtle)] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="min-h-10 px-5 rounded-[10px] bg-[var(--accent-600)] hover:bg-[var(--accent-700)] text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
          >
            {busy ? 'Submitting…' : 'Submit Report'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
