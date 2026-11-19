import fs from 'node:fs';
import path from 'node:path';
import { AUTH_ENABLED } from './auth.ts';
import {
  INITIAL_HELP_REQUESTS,
  INITIAL_POSTS,
  INITIAL_PRESENTATIONS,
  INITIAL_RESOURCES,
  LAUNCH_POSTS,
  LAUNCH_RESOURCES,
  TEAM_ROSTER,
} from '../src/data/seedData.ts';
import type {
  CommunityEvent,
  CommunityNotification,
  CommunityPost,
  CommunityPostComment,
  ContentReport,
  MemberDirectoryProfile,
  ModerationState,
  NotificationType,
  ReactionType,
  ReportTargetType,
  StudyChatMessage,
  StudyChatRoom,
  StudyGroup,
} from '../src/types.ts';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_PATH = path.join(DATA_DIR, 'community-store.json');

export const DEFAULT_CHAT_ROOMS: StudyChatRoom[] = [
  { id: 'general', name: 'General Study Hall', topic: 'Daily check-ins, study accountability & beginner Q&A' },
  { id: 'frontend', name: 'Frontend & UI', topic: 'HTML, CSS, Flexbox, JavaScript, React & responsive design' },
  { id: 'backend', name: 'Backend & Databases', topic: 'APIs, Node.js, SQL, authentication & architecture' },
  { id: 'ai-python', name: 'Python & AI Builders', topic: 'Python scripts, prompts, structured outputs & ML tools' },
  { id: 'projects', name: 'Project Pairings', topic: 'Find teammates, share repos & review each other’s builds' },
];

export interface PersistedCommunityStore {
  posts: CommunityPost[];
  resources: any[];
  presentations: CommunityEvent[];
  helpRequests: any[];
  studyGroups: StudyGroup[];
  teamRoster: any[];
  memberProfiles: Record<string, MemberDirectoryProfile>;
  notifications: CommunityNotification[];
  reports: ContentReport[];
  moderation: ModerationState;
  chatRooms: StudyChatRoom[];
  chatMessages: Record<string, StudyChatMessage[]>;
}

export type StoreBroadcastEvent =
  | { type: 'community:sync'; reason: string; updatedAt: string }
  | { type: 'notification:new'; recipientId: string; notification: CommunityNotification }
  | { type: 'chat:rooms'; rooms: StudyChatRoom[] }
  | { type: 'chat:message:updated'; roomId: string; message: StudyChatMessage };

type StoreListener = (ev: StoreBroadcastEvent) => void;
const listeners = new Set<StoreListener>();

export function subscribeCommunityEvents(fn: StoreListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(ev: StoreBroadcastEvent) {
  for (const fn of listeners) {
    try {
      fn(ev);
    } catch {
      /* ignore listener errors */
    }
  }
}

function createInitialStore(): PersistedCommunityStore {
  const isClean = AUTH_ENABLED;
  const roster = isClean ? [] : TEAM_ROSTER.map((m) => ({ ...m }));
  const memberProfiles: Record<string, MemberDirectoryProfile> = {};
  for (const m of roster) {
    memberProfiles[m.id] = {
      id: m.id,
      name: m.name,
      username: m.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      role: m.role || 'Member',
      field: m.field || '',
      level: m.level || '',
      bio: m.bio || '',
      partner: m.partner || '',
      mentor: m.mentor || '',
    };
  }

  const chatMessages: Record<string, StudyChatMessage[]> = {};
  for (const r of DEFAULT_CHAT_ROOMS) {
    chatMessages[r.id] = [];
  }

  return {
    posts: isClean
      ? LAUNCH_POSTS.map((p) => ({ ...p, reactions: p.reactions || {} }))
      : INITIAL_POSTS.map((p) => ({ ...p, reactions: p.reactions || {} })),
    resources: isClean ? LAUNCH_RESOURCES.map((r) => ({ ...r })) : INITIAL_RESOURCES.map((r) => ({ ...r })),
    presentations: isClean ? [] : INITIAL_PRESENTATIONS.map((e) => ({ ...e })),
    helpRequests: isClean ? [] : INITIAL_HELP_REQUESTS.map((h) => ({ ...h })),
    studyGroups: [],
    teamRoster: roster,
    memberProfiles,
    notifications: [],
    reports: [],
    moderation: { mutedUserIds: {} },
    chatRooms: DEFAULT_CHAT_ROOMS.map((r) => ({ ...r })),
    chatMessages,
  };
}

function loadStore(): PersistedCommunityStore {
  const base = createInitialStore();
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return base;
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const chatRooms: StudyChatRoom[] = Array.isArray(parsed.chatRooms) && parsed.chatRooms.length > 0
      ? parsed.chatRooms
      : base.chatRooms;
    const chatMessages: Record<string, StudyChatMessage[]> = { ...(parsed.chatMessages || {}) };
    for (const r of chatRooms) {
      if (!Array.isArray(chatMessages[r.id])) chatMessages[r.id] = [];
    }
    return {
      posts: Array.isArray(parsed.posts) ? parsed.posts : base.posts,
      resources: Array.isArray(parsed.resources) ? parsed.resources : base.resources,
      presentations: Array.isArray(parsed.presentations) ? parsed.presentations : base.presentations,
      helpRequests: Array.isArray(parsed.helpRequests) ? parsed.helpRequests : base.helpRequests,
      studyGroups: Array.isArray(parsed.studyGroups) ? parsed.studyGroups : [],
      teamRoster: Array.isArray(parsed.teamRoster) ? parsed.teamRoster : base.teamRoster,
      memberProfiles: parsed.memberProfiles && typeof parsed.memberProfiles === 'object' ? parsed.memberProfiles : base.memberProfiles,
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      reports: Array.isArray(parsed.reports) ? parsed.reports : [],
      moderation: parsed.moderation?.mutedUserIds ? parsed.moderation : { mutedUserIds: {} },
      chatRooms,
      chatMessages,
    };
  } catch {
    return base;
  }
}

let store: PersistedCommunityStore = loadStore();

function saveStore() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmpPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmpPath, STORE_PATH);
  } catch (err) {
    console.warn('[communityStore] failed to persist store:', err);
  }
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function sanitizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const clean = String(item || '')
      .trim()
      .toLowerCase()
      .replace(/^#/, '')
      .replace(/[^a-z0-9.+#_-]/g, '')
      .slice(0, 24);
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
    if (out.length >= 6) break;
  }
  return out;
}

export function isUserAdmin(userId: string): boolean {
  if (!userId) return false;
  const profile = store.memberProfiles[userId];
  if (profile?.role === 'Community Admin') return true;
  const rosterHit = store.teamRoster.find((m) => m.id === userId);
  if (rosterHit?.role === 'Community Admin') return true;
  return userId === 'tm-5' || userId === 'admin' || userId.startsWith('admin:');
}

export function getMemberRole(userId: string): string {
  if (!userId) return 'Member';
  const profile = store.memberProfiles[userId];
  if (profile?.role) return profile.role;
  const rosterHit = store.teamRoster.find((m) => m.id === userId);
  if (rosterHit?.role) return rosterHit.role;
  if (userId.startsWith('admin:') || userId === 'admin') return 'Community Admin';
  return 'Member';
}

export function isUserMuted(userId: string): { muted: boolean; reason?: string } {
  const entry = store.moderation?.mutedUserIds?.[userId];
  if (!entry) return { muted: false };
  return { muted: true, reason: entry.reason };
}

export function getAdminUserIds(): string[] {
  const ids = new Set<string>();
  for (const [id, prof] of Object.entries(store.memberProfiles)) {
    if (prof.role === 'Community Admin') ids.add(id);
  }
  for (const m of store.teamRoster) {
    if (m.role === 'Community Admin' && m.id) ids.add(m.id);
  }
  return Array.from(ids);
}

export function registerOrUpdateMemberProfile(input: {
  id: string;
  name: string;
  role?: string;
  username?: string;
  field?: string;
  level?: string;
  bio?: string;
  languages?: string[];
  frameworks?: string[];
  interests?: string[];
  githubUrl?: string;
  portfolioUrl?: string;
  linkedinUrl?: string;
  badgesCount?: number;
  streakDays?: number;
  allowRoleOverride?: boolean;
}): MemberDirectoryProfile {
  const id = String(input.id || '').trim().slice(0, 120);
  const existing = store.memberProfiles[id];
  const resolvedRole = input.allowRoleOverride && input.role
    ? input.role
    : existing?.role || (id.startsWith('admin:') ? 'Community Admin' : input.role || 'Member');

  const name = String(input.name || existing?.name || 'Member').trim().slice(0, 80) || 'Member';
  const username = String(
    input.username ?? existing?.username ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  )
    .trim()
    .slice(0, 48);

  const next: MemberDirectoryProfile = {
    id,
    name,
    username,
    role: resolvedRole,
    field: input.field !== undefined ? String(input.field).slice(0, 80) : existing?.field || '',
    level: input.level !== undefined ? String(input.level).slice(0, 60) : existing?.level || '',
    bio: input.bio !== undefined ? String(input.bio).slice(0, 400) : existing?.bio || '',
    languages: Array.isArray(input.languages) ? input.languages.slice(0, 12) : existing?.languages || [],
    frameworks: Array.isArray(input.frameworks) ? input.frameworks.slice(0, 12) : existing?.frameworks || [],
    interests: Array.isArray(input.interests) ? input.interests.slice(0, 12) : existing?.interests || [],
    githubUrl: input.githubUrl !== undefined ? String(input.githubUrl).slice(0, 200) : existing?.githubUrl || '',
    portfolioUrl: input.portfolioUrl !== undefined ? String(input.portfolioUrl).slice(0, 200) : existing?.portfolioUrl || '',
    linkedinUrl: input.linkedinUrl !== undefined ? String(input.linkedinUrl).slice(0, 200) : existing?.linkedinUrl || '',
    partner: existing?.partner || '',
    mentor: existing?.mentor || '',
    badgesCount: typeof input.badgesCount === 'number' ? input.badgesCount : existing?.badgesCount,
    streakDays: typeof input.streakDays === 'number' ? input.streakDays : existing?.streakDays,
    joinedAt: existing?.joinedAt || new Date().toISOString(),
    muted: Boolean(store.moderation.mutedUserIds[id]),
    mutedReason: store.moderation.mutedUserIds[id]?.reason,
  };

  store.memberProfiles[id] = next;

  const rosterIdx = store.teamRoster.findIndex((m) => m.id === id);
  const rosterEntry = {
    id,
    name: next.name,
    username: next.username,
    role: next.role,
    field: next.field,
    level: next.level,
    bio: next.bio,
    partner: next.partner,
    mentor: next.mentor,
    githubUrl: next.githubUrl,
    portfolioUrl: next.portfolioUrl,
    linkedinUrl: next.linkedinUrl,
    languages: next.languages,
    frameworks: next.frameworks,
    badgesCount: next.badgesCount,
    streakDays: next.streakDays,
    muted: next.muted,
    mutedReason: next.mutedReason,
  };
  if (rosterIdx >= 0) {
    store.teamRoster[rosterIdx] = { ...store.teamRoster[rosterIdx], ...rosterEntry };
  } else {
    store.teamRoster.push(rosterEntry);
  }

  saveStore();
  emit({ type: 'community:sync', reason: 'member_profile', updatedAt: new Date().toISOString() });
  return next;
}

function getAllKnownMembers(): { id: string; name: string; username?: string }[] {
  const byId = new Map<string, { id: string; name: string; username?: string }>();
  for (const m of store.teamRoster) {
    if (m?.id && m?.name) byId.set(m.id, { id: m.id, name: m.name, username: m.username });
  }
  for (const p of Object.values(store.memberProfiles)) {
    byId.set(p.id, { id: p.id, name: p.name, username: p.username });
  }
  return Array.from(byId.values());
}

export function resolveMemberIdByName(nameOrId?: string): string | null {
  if (!nameOrId) return null;
  const target = nameOrId.trim().toLowerCase();
  if (!target) return null;
  if (store.memberProfiles[nameOrId]) return nameOrId;
  for (const m of getAllKnownMembers()) {
    if (m.id.toLowerCase() === target || m.name.toLowerCase() === target || (m.username && m.username.toLowerCase() === target)) {
      return m.id;
    }
  }
  return null;
}

export function extractMentionRecipients(text: string, actorId: string): { id: string; name: string }[] {
  if (!text || !text.includes('@')) return [];
  const lower = text.toLowerCase();
  const hits: { id: string; name: string }[] = [];
  const seen = new Set<string>();

  for (const m of getAllKnownMembers()) {
    if (m.id === actorId || seen.has(m.id)) continue;
    const candidates = [
      m.username ? `@${m.username.toLowerCase()}` : '',
      `@${m.name.toLowerCase()}`,
      `@${m.name.toLowerCase().replace(/\s+/g, '')}`,
      `@${m.name.toLowerCase().split(/\s+/)[0]}`,
    ].filter((c) => c.length > 2);

    const matched = candidates.some((token) => {
      const idx = lower.indexOf(token);
      if (idx === -1) return false;
      const before = idx === 0 ? ' ' : lower[idx - 1];
      const after = idx + token.length >= lower.length ? ' ' : lower[idx + token.length];
      return /[\s(\[{,.:;!?]/.test(before) && /[\s)\]}.,:;!?]/.test(after);
    });

    if (matched) {
      seen.add(m.id);
      hits.push({ id: m.id, name: m.name });
    }
  }
  return hits;
}

export function createNotification(input: {
  recipientId: string;
  actorId: string;
  actorName: string;
  type: NotificationType;
  title: string;
  body: string;
  targetTab: string;
  targetId?: string;
  roomId?: string;
}): CommunityNotification | null {
  if (!input.recipientId || input.recipientId === input.actorId) return null;
  const note: CommunityNotification = {
    id: uid('notif'),
    recipientId: input.recipientId,
    actorId: input.actorId,
    actorName: input.actorName,
    type: input.type,
    title: input.title.slice(0, 140),
    body: input.body.slice(0, 280),
    targetTab: input.targetTab,
    targetId: input.targetId,
    roomId: input.roomId,
    createdAt: new Date().toISOString(),
    read: false,
  };
  store.notifications = [note, ...store.notifications].slice(0, 600);
  saveStore();
  emit({ type: 'notification:new', recipientId: note.recipientId, notification: note });
  return note;
}

export function listNotificationsForUser(userId: string): CommunityNotification[] {
  return store.notifications.filter((n) => n.recipientId === userId);
}

export function markNotificationRead(userId: string, notifId: string) {
  let changed = false;
  store.notifications = store.notifications.map((n) => {
    if (n.id === notifId && n.recipientId === userId && !n.read) {
      changed = true;
      return { ...n, read: true };
    }
    return n;
  });
  if (changed) saveStore();
  return listNotificationsForUser(userId);
}

export function markAllNotificationsRead(userId: string) {
  let changed = false;
  store.notifications = store.notifications.map((n) => {
    if (n.recipientId === userId && !n.read) {
      changed = true;
      return { ...n, read: true };
    }
    return n;
  });
  if (changed) saveStore();
  return listNotificationsForUser(userId);
}

export function getCommunityBootstrap(userId: string, isAdmin: boolean) {
  const visiblePosts = isAdmin ? store.posts : store.posts.filter((p) => !p.hidden);
  return {
    posts: visiblePosts.map((p) => ({
      ...p,
      comments: isAdmin ? p.comments : (p.comments || []).filter((c) => !c.hidden),
    })),
    resources: store.resources,
    presentations: store.presentations,
    helpRequests: store.helpRequests,
    studyGroups: store.studyGroups,
    teamRoster: store.teamRoster.map((m) => ({
      ...m,
      muted: Boolean(store.moderation.mutedUserIds[m.id]),
      mutedReason: store.moderation.mutedUserIds[m.id]?.reason,
    })),
    memberProfiles: store.memberProfiles,
    notifications: listNotificationsForUser(userId),
    reports: isAdmin ? store.reports : [],
    moderation: store.moderation,
    chatRooms: listChatRoomsForUser(userId),
  };
}

// ============================================================================
// POSTS, COMMENTS & REACTIONS
// ============================================================================
export function createPost(
  actor: { userId: string; userName: string; isAdmin: boolean },
  input: {
    category: string;
    title: string;
    content: string;
    codeSnippet?: string;
    attachmentUrl?: string;
    tags?: string[];
    pinned?: boolean;
  }
): { ok: true; post: CommunityPost } | { ok: false; status: number; error: string } {
  const mute = isUserMuted(actor.userId);
  if (mute.muted) {
    return { ok: false, status: 403, error: `You are currently muted${mute.reason ? ` (${mute.reason})` : ''}.` };
  }
  const category = String(input.category || 'Question').trim();
  if (category === 'Announcement' && !actor.isAdmin) {
    return { ok: false, status: 403, error: 'Only community admins can publish announcements.' };
  }
  const title = String(input.title || '').trim().slice(0, 180);
  const content = String(input.content || '').trim().slice(0, 5000);
  if (!title || !content) {
    return { ok: false, status: 400, error: 'Title and content are required.' };
  }

  const now = new Date().toISOString();
  const pinned = Boolean(input.pinned && actor.isAdmin);
  const post: CommunityPost = {
    id: uid('post'),
    author: actor.userName,
    authorId: actor.userId,
    role: getMemberRole(actor.userId),
    category,
    tags: sanitizeTags(input.tags),
    pinned,
    pinnedAt: pinned ? now : undefined,
    locked: false,
    hidden: false,
    timestamp: 'Just now',
    createdAt: now,
    title,
    content,
    codeSnippet: input.codeSnippet ? String(input.codeSnippet).trim().slice(0, 4000) : undefined,
    attachmentUrl: input.attachmentUrl ? String(input.attachmentUrl).trim().slice(0, 500) : undefined,
    likes: 0,
    reactions: { helpful: [], insightful: [], celebrate: [] },
    comments: [],
  };

  store.posts = [post, ...store.posts];

  if (category === 'Announcement') {
    for (const m of getAllKnownMembers()) {
      if (m.id !== actor.userId) {
        createNotification({
          recipientId: m.id,
          actorId: actor.userId,
          actorName: actor.userName,
          type: 'announcement',
          title: `New announcement: ${post.title}`,
          body: post.content,
          targetTab: 'announcements',
          targetId: post.id,
        });
      }
    }
  }

  const mentions = extractMentionRecipients(`${post.title} ${post.content}`, actor.userId);
  for (const hit of mentions) {
    createNotification({
      recipientId: hit.id,
      actorId: actor.userId,
      actorName: actor.userName,
      type: 'mention',
      title: `${actor.userName} mentioned you in a discussion`,
      body: post.title,
      targetTab: 'community',
      targetId: post.id,
    });
  }

  saveStore();
  emit({ type: 'community:sync', reason: 'post_created', updatedAt: now });
  return { ok: true, post };
}

export function updatePost(
  actor: { userId: string; userName: string; isAdmin: boolean },
  postId: string,
  patch: {
    title?: string;
    content?: string;
    category?: string;
    tags?: string[];
    codeSnippet?: string;
    attachmentUrl?: string;
  }
): { ok: true; post: CommunityPost } | { ok: false; status: number; error: string } {
  const idx = store.posts.findIndex((p) => p.id === postId);
  if (idx < 0) return { ok: false, status: 404, error: 'Post not found.' };
  const existing = store.posts[idx];
  const isOwner = existing.authorId === actor.userId || (!existing.authorId && existing.author === actor.userName);
  if (!isOwner && !actor.isAdmin) {
    return { ok: false, status: 403, error: 'You can only edit your own posts.' };
  }
  if (patch.category === 'Announcement' && !actor.isAdmin) {
    return { ok: false, status: 403, error: 'Only community admins can set Announcement category.' };
  }
  const now = new Date().toISOString();
  const updated: CommunityPost = {
    ...existing,
    title: patch.title !== undefined ? String(patch.title).trim().slice(0, 180) || existing.title : existing.title,
    content: patch.content !== undefined ? String(patch.content).trim().slice(0, 5000) || existing.content : existing.content,
    category: patch.category !== undefined ? String(patch.category).trim() : existing.category,
    tags: patch.tags !== undefined ? sanitizeTags(patch.tags) : existing.tags,
    codeSnippet: patch.codeSnippet !== undefined ? (String(patch.codeSnippet).trim().slice(0, 4000) || undefined) : existing.codeSnippet,
    attachmentUrl: patch.attachmentUrl !== undefined ? (String(patch.attachmentUrl).trim().slice(0, 500) || undefined) : existing.attachmentUrl,
    updatedAt: now,
  };
  store.posts[idx] = updated;
  saveStore();
  emit({ type: 'community:sync', reason: 'post_updated', updatedAt: now });
  return { ok: true, post: updated };
}

export function deletePost(
  actor: { userId: string; userName: string; isAdmin: boolean },
  postId: string
): { ok: true } | { ok: false; status: number; error: string } {
  const existing = store.posts.find((p) => p.id === postId);
  if (!existing) return { ok: false, status: 404, error: 'Post not found.' };
  const isOwner = existing.authorId === actor.userId || (!existing.authorId && existing.author === actor.userName);
  if (!isOwner && !actor.isAdmin) {
    return { ok: false, status: 403, error: 'You can only delete your own posts.' };
  }
  store.posts = store.posts.filter((p) => p.id !== postId);
  saveStore();
  emit({ type: 'community:sync', reason: 'post_deleted', updatedAt: new Date().toISOString() });
  return { ok: true };
}

export function moderatePost(
  actor: { userId: string; userName: string; isAdmin: boolean },
  postId: string,
  action: { pinned?: boolean; locked?: boolean; hidden?: boolean; hiddenReason?: string }
): { ok: true; post: CommunityPost } | { ok: false; status: number; error: string } {
  if (!actor.isAdmin) {
    return { ok: false, status: 403, error: 'Only community admins can moderate posts.' };
  }
  const idx = store.posts.findIndex((p) => p.id === postId);
  if (idx < 0) return { ok: false, status: 404, error: 'Post not found.' };
  const existing = store.posts[idx];
  const now = new Date().toISOString();
  const updated: CommunityPost = {
    ...existing,
    pinned: action.pinned !== undefined ? action.pinned : existing.pinned,
    pinnedAt: action.pinned === true ? now : action.pinned === false ? undefined : existing.pinnedAt,
    locked: action.locked !== undefined ? action.locked : existing.locked,
    hidden: action.hidden !== undefined ? action.hidden : existing.hidden,
    hiddenReason: action.hidden ? (action.hiddenReason || 'Hidden by moderator') : undefined,
  };
  store.posts[idx] = updated;

  const targetAuthorId = existing.authorId || resolveMemberIdByName(existing.author);
  if (targetAuthorId && targetAuthorId !== actor.userId && (action.hidden || action.locked)) {
    createNotification({
      recipientId: targetAuthorId,
      actorId: actor.userId,
      actorName: actor.userName,
      type: 'moderation',
      title: action.hidden ? 'Your post was hidden by a moderator' : 'Replies were locked on your post',
      body: action.hiddenReason || existing.title,
      targetTab: 'community',
      targetId: existing.id,
    });
  }

  saveStore();
  emit({ type: 'community:sync', reason: 'post_moderated', updatedAt: now });
  return { ok: true, post: updated };
}

export function togglePostReaction(
  actor: { userId: string; userName: string },
  postId: string,
  reactionType: ReactionType
): { ok: true; post: CommunityPost } | { ok: false; status: number; error: string } {
  const idx = store.posts.findIndex((p) => p.id === postId);
  if (idx < 0) return { ok: false, status: 404, error: 'Post not found.' };
  const post = store.posts[idx];
  const reactions: Partial<Record<ReactionType, string[]>> = {
    helpful: [...(post.reactions?.helpful || [])],
    insightful: [...(post.reactions?.insightful || [])],
    celebrate: [...(post.reactions?.celebrate || [])],
  };
  const current = reactions[reactionType] || [];
  const has = current.includes(actor.userId);
  reactions[reactionType] = has ? current.filter((id) => id !== actor.userId) : [...current, actor.userId];

  const totalDelta = reactionType === 'helpful' ? (has ? -1 : 1) : 0;
  const nextLikes = Math.max(0, (post.likes || 0) + totalDelta);

  const updated: CommunityPost = { ...post, reactions, likes: nextLikes };
  store.posts[idx] = updated;

  if (!has) {
    const recipientId = post.authorId || resolveMemberIdByName(post.author);
    if (recipientId && recipientId !== actor.userId) {
      createNotification({
        recipientId,
        actorId: actor.userId,
        actorName: actor.userName,
        type: 'reaction',
        title: `${actor.userName} reacted (${reactionType}) to your post`,
        body: post.title,
        targetTab: 'community',
        targetId: post.id,
      });
    }
  }

  saveStore();
  emit({ type: 'community:sync', reason: 'post_reaction', updatedAt: new Date().toISOString() });
  return { ok: true, post: updated };
}

export function addPostComment(
  actor: { userId: string; userName: string; isAdmin: boolean },
  postId: string,
  input: { text: string; parentId?: string }
): { ok: true; post: CommunityPost; comment: CommunityPostComment } | { ok: false; status: number; error: string } {
  const mute = isUserMuted(actor.userId);
  if (mute.muted) {
    return { ok: false, status: 403, error: `You are currently muted${mute.reason ? ` (${mute.reason})` : ''}.` };
  }
  const idx = store.posts.findIndex((p) => p.id === postId);
  if (idx < 0) return { ok: false, status: 404, error: 'Post not found.' };
  const post = store.posts[idx];
  if (post.locked && !actor.isAdmin) {
    return { ok: false, status: 403, error: 'Replies are locked on this discussion.' };
  }
  const text = String(input.text || '').trim().slice(0, 2000);
  if (!text) return { ok: false, status: 400, error: 'Reply cannot be empty.' };

  const now = new Date().toISOString();
  const comment: CommunityPostComment = {
    id: uid('c'),
    author: actor.userName,
    authorId: actor.userId,
    authorRole: getMemberRole(actor.userId),
    text,
    createdAt: now,
    parentId: input.parentId || undefined,
    isHelpful: false,
    helpfulBy: [],
  };

  const updated: CommunityPost = {
    ...post,
    comments: [...(post.comments || []), comment],
  };
  store.posts[idx] = updated;

  const notified = new Set<string>([actor.userId]);
  if (comment.parentId) {
    const parentComment = post.comments.find((c) => c.id === comment.parentId);
    const parentAuthorId = parentComment?.authorId || resolveMemberIdByName(parentComment?.author);
    if (parentAuthorId && !notified.has(parentAuthorId)) {
      notified.add(parentAuthorId);
      createNotification({
        recipientId: parentAuthorId,
        actorId: actor.userId,
        actorName: actor.userName,
        type: 'reply',
        title: `${actor.userName} replied to your comment`,
        body: text,
        targetTab: 'community',
        targetId: post.id,
      });
    }
  }

  const postAuthorId = post.authorId || resolveMemberIdByName(post.author);
  if (postAuthorId && !notified.has(postAuthorId)) {
    notified.add(postAuthorId);
    createNotification({
      recipientId: postAuthorId,
      actorId: actor.userId,
      actorName: actor.userName,
      type: 'reply',
      title: `${actor.userName} replied to “${post.title}”`,
      body: text,
      targetTab: 'community',
      targetId: post.id,
    });
  }

  const mentions = extractMentionRecipients(text, actor.userId);
  for (const hit of mentions) {
    if (!notified.has(hit.id)) {
      notified.add(hit.id);
      createNotification({
        recipientId: hit.id,
        actorId: actor.userId,
        actorName: actor.userName,
        type: 'mention',
        title: `${actor.userName} mentioned you in a reply`,
        body: text,
        targetTab: 'community',
        targetId: post.id,
      });
    }
  }

  saveStore();
  emit({ type: 'community:sync', reason: 'comment_added', updatedAt: now });
  return { ok: true, post: updated, comment };
}

export function updateOrModerateComment(
  actor: { userId: string; userName: string; isAdmin: boolean },
  postId: string,
  commentId: string,
  action: { text?: string; toggleHelpful?: boolean; hidden?: boolean; delete?: boolean }
): { ok: true; post: CommunityPost } | { ok: false; status: number; error: string } {
  const idx = store.posts.findIndex((p) => p.id === postId);
  if (idx < 0) return { ok: false, status: 404, error: 'Post not found.' };
  const post = store.posts[idx];
  const cIdx = (post.comments || []).findIndex((c) => c.id === commentId);
  if (cIdx < 0) return { ok: false, status: 404, error: 'Comment not found.' };
  const comment = post.comments[cIdx];
  const isOwner = comment.authorId === actor.userId || (!comment.authorId && comment.author === actor.userName);

  if (action.delete) {
    if (!isOwner && !actor.isAdmin) {
      return { ok: false, status: 403, error: 'You can only delete your own comments.' };
    }
    const nextComments = post.comments.filter((c) => c.id !== commentId && c.parentId !== commentId);
    store.posts[idx] = { ...post, comments: nextComments };
    saveStore();
    emit({ type: 'community:sync', reason: 'comment_deleted', updatedAt: new Date().toISOString() });
    return { ok: true, post: store.posts[idx] };
  }

  if (action.hidden !== undefined && !actor.isAdmin) {
    return { ok: false, status: 403, error: 'Only community admins can hide comments.' };
  }
  if (action.text !== undefined && !isOwner && !actor.isAdmin) {
    return { ok: false, status: 403, error: 'You can only edit your own comments.' };
  }

  let nextComment: CommunityPostComment = { ...comment };
  if (action.text !== undefined) {
    const clean = String(action.text).trim().slice(0, 2000);
    if (!clean) return { ok: false, status: 400, error: 'Reply cannot be empty.' };
    nextComment.text = clean;
    nextComment.updatedAt = new Date().toISOString();
  }
  if (action.toggleHelpful) {
    const list = [...(nextComment.helpfulBy || [])];
    const has = list.includes(actor.userId);
    nextComment.helpfulBy = has ? list.filter((id) => id !== actor.userId) : [...list, actor.userId];
    nextComment.isHelpful = nextComment.helpfulBy.length > 0;
  }
  if (action.hidden !== undefined) {
    nextComment.hidden = action.hidden;
  }

  const nextComments = [...post.comments];
  nextComments[cIdx] = nextComment;
  store.posts[idx] = { ...post, comments: nextComments };
  saveStore();
  emit({ type: 'community:sync', reason: 'comment_updated', updatedAt: new Date().toISOString() });
  return { ok: true, post: store.posts[idx] };
}

// ============================================================================
// STUDY GROUPS & PERSISTENT GROUP CHAT ROOMS
// ============================================================================
export function createStudyGroup(
  actor: { userId: string; userName: string },
  input: {
    name: string;
    field: string;
    topic: string;
    description: string;
    level?: string;
    schedule?: string;
    maxMembers?: number;
  }
): { ok: true; group: StudyGroup; room: StudyChatRoom } | { ok: false; status: number; error: string } {
  const mute = isUserMuted(actor.userId);
  if (mute.muted) {
    return { ok: false, status: 403, error: 'Muted members cannot create study groups.' };
  }
  const name = String(input.name || '').trim().slice(0, 80);
  const topic = String(input.topic || '').trim().slice(0, 140);
  if (!name || !topic) {
    return { ok: false, status: 400, error: 'Group name and focus topic are required.' };
  }
  const groupId = uid('sg');
  const roomId = `group-${groupId}`;
  const now = new Date().toISOString();

  const room: StudyChatRoom = {
    id: roomId,
    name,
    topic,
    groupId,
    createdBy: actor.userId,
  };

  const group: StudyGroup = {
    id: groupId,
    name,
    field: String(input.field || 'General').trim().slice(0, 80),
    topic,
    description: String(input.description || '').trim().slice(0, 500) || topic,
    level: String(input.level || 'Beginner-friendly').trim().slice(0, 50),
    schedule: String(input.schedule || 'Flexible / Async').trim().slice(0, 80),
    creatorId: actor.userId,
    creatorName: actor.userName,
    memberIds: [actor.userId],
    memberNames: [actor.userName],
    roomId,
    goals: [],
    sharedLinks: [],
    createdAt: now,
    maxMembers: input.maxMembers && input.maxMembers > 1 ? Math.min(50, input.maxMembers) : 12,
  };

  store.studyGroups = [group, ...store.studyGroups];
  store.chatRooms = [...store.chatRooms, room];
  store.chatMessages[roomId] = [];

  saveStore();
  emit({ type: 'chat:rooms', rooms: store.chatRooms });
  emit({ type: 'community:sync', reason: 'study_group_created', updatedAt: now });
  return { ok: true, group, room };
}

export function toggleJoinStudyGroup(
  actor: { userId: string; userName: string },
  groupId: string
): { ok: true; group: StudyGroup; joined: boolean } | { ok: false; status: number; error: string } {
  const idx = store.studyGroups.findIndex((g) => g.id === groupId);
  if (idx < 0) return { ok: false, status: 404, error: 'Study group not found.' };
  const group = store.studyGroups[idx];
  const isMember = group.memberIds.includes(actor.userId);

  if (!isMember && group.maxMembers && group.memberIds.length >= group.maxMembers) {
    return { ok: false, status: 400, error: 'This study group is currently full.' };
  }

  const nextIds = isMember
    ? group.memberIds.filter((id) => id !== actor.userId)
    : [...group.memberIds, actor.userId];
  const nextNames = isMember
    ? group.memberNames.filter((_, i) => group.memberIds[i] !== actor.userId)
    : [...group.memberNames, actor.userName];

  const updated: StudyGroup = {
    ...group,
    memberIds: nextIds,
    memberNames: nextNames,
  };
  store.studyGroups[idx] = updated;

  if (!isMember && group.creatorId !== actor.userId) {
    createNotification({
      recipientId: group.creatorId,
      actorId: actor.userId,
      actorName: actor.userName,
      type: 'study_group',
      title: `${actor.userName} joined ${group.name}`,
      body: `Your study group now has ${nextIds.length} member${nextIds.length === 1 ? '' : 's'}.`,
      targetTab: 'study-groups',
      targetId: group.id,
    });
  }

  saveStore();
  emit({ type: 'community:sync', reason: 'study_group_membership', updatedAt: new Date().toISOString() });
  return { ok: true, group: updated, joined: !isMember };
}

export function updateStudyGroupWorkspace(
  actor: { userId: string; userName: string; isAdmin: boolean },
  groupId: string,
  input: { addGoal?: string; toggleGoalId?: string; addLink?: { title: string; url: string } }
): { ok: true; group: StudyGroup } | { ok: false; status: number; error: string } {
  const idx = store.studyGroups.findIndex((g) => g.id === groupId);
  if (idx < 0) return { ok: false, status: 404, error: 'Study group not found.' };
  const group = store.studyGroups[idx];
  if (!group.memberIds.includes(actor.userId) && !actor.isAdmin) {
    return { ok: false, status: 403, error: 'Join this study group to collaborate on goals and links.' };
  }
  const updated: StudyGroup = {
    ...group,
    goals: [...(group.goals || [])],
    sharedLinks: [...(group.sharedLinks || [])],
  };
  if (input.addGoal?.trim()) {
    updated.goals.push({ id: uid('goal'), title: input.addGoal.trim().slice(0, 140), done: false });
  }
  if (input.toggleGoalId) {
    updated.goals = updated.goals.map((g) => (g.id === input.toggleGoalId ? { ...g, done: !g.done } : g));
  }
  if (input.addLink?.title?.trim() && input.addLink?.url?.trim()) {
    updated.sharedLinks.unshift({
      id: uid('slink'),
      title: input.addLink.title.trim().slice(0, 100),
      url: input.addLink.url.trim().slice(0, 400),
      addedBy: actor.userName,
    });
  }
  store.studyGroups[idx] = updated;
  saveStore();
  emit({ type: 'community:sync', reason: 'study_group_updated', updatedAt: new Date().toISOString() });
  return { ok: true, group: updated };
}

// ============================================================================
// PEER HELP, RESOURCES & EVENTS
// ============================================================================
export function createHelpRequest(
  actor: { userId: string; userName: string },
  input: { field?: string; goal: string; attempted?: string; errorOrCode?: string; helpNeeded: string }
) {
  const mute = isUserMuted(actor.userId);
  if (mute.muted) return { ok: false as const, status: 403, error: 'Muted members cannot post help requests.' };
  if (!input.goal?.trim() || !input.helpNeeded?.trim()) {
    return { ok: false as const, status: 400, error: 'Goal and question are required.' };
  }
  const item = {
    id: uid('help'),
    author: actor.userName,
    authorId: actor.userId,
    field: String(input.field || 'General').trim(),
    target: 'Community',
    status: 'Open',
    createdAt: 'Just now',
    createdIso: new Date().toISOString(),
    goal: input.goal.trim().slice(0, 600),
    attempted: String(input.attempted || 'Still exploring where the issue happens.').trim().slice(0, 600),
    errorOrCode: String(input.errorOrCode || '').trim().slice(0, 3000),
    helpNeeded: input.helpNeeded.trim().slice(0, 400),
    responses: [],
  };
  store.helpRequests = [item, ...store.helpRequests];
  saveStore();
  emit({ type: 'community:sync', reason: 'help_created', updatedAt: new Date().toISOString() });
  return { ok: true as const, helpRequest: item };
}

export function replyToHelpRequest(
  actor: { userId: string; userName: string },
  helpId: string,
  text: string
) {
  const mute = isUserMuted(actor.userId);
  if (mute.muted) return { ok: false as const, status: 403, error: 'Muted members cannot reply.' };
  const idx = store.helpRequests.findIndex((h) => h.id === helpId);
  if (idx < 0) return { ok: false as const, status: 404, error: 'Help request not found.' };
  const clean = String(text || '').trim().slice(0, 2000);
  if (!clean) return { ok: false as const, status: 400, error: 'Answer cannot be empty.' };

  const req = store.helpRequests[idx];
  const resp = { id: uid('hr'), responder: actor.userName, responderId: actor.userId, text: clean, createdAt: new Date().toISOString() };
  const updated = {
    ...req,
    status: req.status === 'Resolved' ? 'Resolved' : 'Being Helped',
    responses: [...(req.responses || []), resp],
  };
  store.helpRequests[idx] = updated;

  const authorId = req.authorId || resolveMemberIdByName(req.author);
  if (authorId && authorId !== actor.userId) {
    createNotification({
      recipientId: authorId,
      actorId: actor.userId,
      actorName: actor.userName,
      type: 'help_answer',
      title: `${actor.userName} answered your help question`,
      body: clean,
      targetTab: 'pairing-help',
      targetId: req.id,
    });
  }

  for (const hit of extractMentionRecipients(clean, actor.userId)) {
    if (hit.id !== authorId) {
      createNotification({
        recipientId: hit.id,
        actorId: actor.userId,
        actorName: actor.userName,
        type: 'mention',
        title: `${actor.userName} mentioned you in Peer Help`,
        body: clean,
        targetTab: 'pairing-help',
        targetId: req.id,
      });
    }
  }

  saveStore();
  emit({ type: 'community:sync', reason: 'help_replied', updatedAt: new Date().toISOString() });
  return { ok: true as const, helpRequest: updated };
}

export function toggleHelpResolved(
  actor: { userId: string; userName: string; isAdmin: boolean },
  helpId: string
) {
  const idx = store.helpRequests.findIndex((h) => h.id === helpId);
  if (idx < 0) return { ok: false as const, status: 404, error: 'Help request not found.' };
  const req = store.helpRequests[idx];
  const isOwner = req.authorId === actor.userId || (!req.authorId && req.author === actor.userName);
  if (!isOwner && !actor.isAdmin) {
    return { ok: false as const, status: 403, error: 'Only the question author or an admin can resolve this question.' };
  }
  const nextStatus = req.status === 'Resolved' ? 'Open' : 'Resolved';
  store.helpRequests[idx] = { ...req, status: nextStatus };
  saveStore();
  emit({ type: 'community:sync', reason: 'help_resolved', updatedAt: new Date().toISOString() });
  return { ok: true as const, helpRequest: store.helpRequests[idx] };
}

export function addResourceItem(
  actor: { userId: string; userName: string },
  input: { title: string; category: string; type: string; url: string; description?: string; tags?: string[] }
) {
  const mute = isUserMuted(actor.userId);
  if (mute.muted) return { ok: false as const, status: 403, error: 'Muted members cannot add resources.' };
  if (!input.title?.trim() || !input.url?.trim()) {
    return { ok: false as const, status: 400, error: 'Title and URL are required.' };
  }
  const item = {
    id: uid('res'),
    title: input.title.trim().slice(0, 160),
    category: String(input.category || 'General').trim().slice(0, 80),
    type: String(input.type || 'Guide').trim().slice(0, 40),
    url: input.url.trim().slice(0, 500),
    addedBy: actor.userName,
    addedById: actor.userId,
    description: String(input.description || 'Shared by a community member.').trim().slice(0, 400),
    tags: sanitizeTags(input.tags),
  };
  store.resources = [item, ...store.resources];
  saveStore();
  emit({ type: 'community:sync', reason: 'resource_added', updatedAt: new Date().toISOString() });
  return { ok: true as const, resource: item };
}

export function addEventItem(
  actor: { userId: string; userName: string },
  input: { title: string; type: string; topic?: string; dateTime: string; description?: string; resourceUrl?: string }
) {
  const mute = isUserMuted(actor.userId);
  if (mute.muted) return { ok: false as const, status: 403, error: 'Muted members cannot schedule sessions.' };
  if (!input.title?.trim() || !input.dateTime?.trim()) {
    return { ok: false as const, status: 400, error: 'Title and date/time are required.' };
  }
  const item: CommunityEvent = {
    id: uid('pres'),
    title: input.title.trim().slice(0, 160),
    presenter: actor.userName,
    presenterId: actor.userId,
    topic: String(input.topic || 'Peer Learning').trim().slice(0, 80),
    type: String(input.type || 'Study Session').trim().slice(0, 50),
    dateTime: input.dateTime.trim().slice(0, 80),
    description: String(input.description || 'Beginner-friendly live study session.').trim().slice(0, 400),
    resourceUrl: String(input.resourceUrl || '').trim().slice(0, 400),
    attendees: [actor.userName],
    attendeeIds: [actor.userId],
    reminders: [actor.userName],
    reminderIds: [actor.userId],
  };
  store.presentations = [item, ...store.presentations];
  saveStore();
  emit({ type: 'community:sync', reason: 'event_added', updatedAt: new Date().toISOString() });
  return { ok: true as const, event: item };
}

export function toggleEventAction(
  actor: { userId: string; userName: string },
  eventId: string,
  action: 'rsvp' | 'reminder'
) {
  const idx = store.presentations.findIndex((e) => e.id === eventId);
  if (idx < 0) return { ok: false as const, status: 404, error: 'Event not found.' };
  const ev = store.presentations[idx];
  if (action === 'rsvp') {
    const attendeeIds = ev.attendeeIds || [];
    const going = attendeeIds.includes(actor.userId) || ev.attendees.includes(actor.userName);
    const updated: CommunityEvent = {
      ...ev,
      attendees: going ? ev.attendees.filter((a) => a !== actor.userName) : [...ev.attendees, actor.userName],
      attendeeIds: going ? attendeeIds.filter((id) => id !== actor.userId) : [...attendeeIds, actor.userId],
    };
    store.presentations[idx] = updated;
    if (!going) {
      const hostId = ev.presenterId || resolveMemberIdByName(ev.presenter);
      if (hostId && hostId !== actor.userId) {
        createNotification({
          recipientId: hostId,
          actorId: actor.userId,
          actorName: actor.userName,
          type: 'event',
          title: `${actor.userName} joined “${ev.title}”`,
          body: ev.dateTime,
          targetTab: 'events',
          targetId: ev.id,
        });
      }
    }
  } else {
    const reminders = ev.reminders || [];
    const reminderIds = ev.reminderIds || [];
    const has = reminderIds.includes(actor.userId) || reminders.includes(actor.userName);
    store.presentations[idx] = {
      ...ev,
      reminders: has ? reminders.filter((r) => r !== actor.userName) : [...reminders, actor.userName],
      reminderIds: has ? reminderIds.filter((id) => id !== actor.userId) : [...reminderIds, actor.userId],
    };
  }
  saveStore();
  emit({ type: 'community:sync', reason: 'event_updated', updatedAt: new Date().toISOString() });
  return { ok: true as const, event: store.presentations[idx] };
}

// ============================================================================
// CHAT ROOMS, DMs & MESSAGES
// ============================================================================
export function listChatRoomsForUser(userId?: string): StudyChatRoom[] {
  return store.chatRooms.filter((r) => {
    if (!r.isDirect) return true;
    if (!userId) return false;
    return (r.participantIds || []).includes(userId);
  });
}

export function getChatHistoryForRoom(roomId: string): StudyChatMessage[] {
  return store.chatMessages[roomId] || [];
}

export function getOrCreateDirectRoom(
  actor: { userId: string; userName: string },
  peerId: string,
  peerName: string
): { ok: true; room: StudyChatRoom } | { ok: false; status: number; error: string } {
  const cleanPeerId = String(peerId || '').trim();
  if (!cleanPeerId || cleanPeerId === actor.userId) {
    return { ok: false, status: 400, error: 'Select another member to message.' };
  }
  const pair = [actor.userId, cleanPeerId].sort();
  const roomId = `dm-${Buffer.from(pair.join('::')).toString('base64url').slice(0, 28)}`;
  const existing = store.chatRooms.find((r) => r.id === roomId);
  if (existing) return { ok: true, room: existing };

  const room: StudyChatRoom = {
    id: roomId,
    name: `${actor.userName} & ${peerName}`,
    topic: 'Direct peer study message',
    isDirect: true,
    participantIds: pair,
    participantNames: [actor.userName, peerName],
    createdBy: actor.userId,
  };
  store.chatRooms = [...store.chatRooms, room];
  store.chatMessages[roomId] = [];
  saveStore();
  emit({ type: 'chat:rooms', rooms: store.chatRooms });
  return { ok: true, room };
}

export function appendChatMessage(msg: StudyChatMessage): { ok: true; message: StudyChatMessage } | { ok: false; error: string } {
  const mute = isUserMuted(msg.senderId);
  if (mute.muted) {
    return { ok: false, error: `You are currently muted${mute.reason ? ` (${mute.reason})` : ''}.` };
  }
  const room = store.chatRooms.find((r) => r.id === msg.roomId);
  if (!room) return { ok: false, error: 'Room does not exist.' };
  if (room.isDirect && !(room.participantIds || []).includes(msg.senderId)) {
    return { ok: false, error: 'You do not have access to this direct room.' };
  }

  const list = store.chatMessages[msg.roomId] || [];
  if (list.some((m) => m.id === msg.id && m.senderId === msg.senderId)) {
    return { ok: true, message: list.find((m) => m.id === msg.id)! };
  }

  const mentions = extractMentionRecipients(msg.text, msg.senderId);
  const fullMsg: StudyChatMessage = {
    ...msg,
    mentions: mentions.map((m) => m.name),
  };

  list.push(fullMsg);
  if (list.length > 300) list.splice(0, list.length - 300);
  store.chatMessages[msg.roomId] = list;

  for (const hit of mentions) {
    createNotification({
      recipientId: hit.id,
      actorId: msg.senderId,
      actorName: msg.senderName,
      type: 'mention',
      title: `${msg.senderName} mentioned you in #${room.name}`,
      body: msg.text,
      targetTab: 'study-chat',
      roomId: room.id,
      targetId: fullMsg.id,
    });
  }

  if (room.isDirect) {
    for (const pid of room.participantIds || []) {
      if (pid !== msg.senderId) {
        createNotification({
          recipientId: pid,
          actorId: msg.senderId,
          actorName: msg.senderName,
          type: 'mention',
          title: `New message from ${msg.senderName}`,
          body: msg.text,
          targetTab: 'study-chat',
          roomId: room.id,
          targetId: fullMsg.id,
        });
      }
    }
  }

  saveStore();
  return { ok: true, message: fullMsg };
}

export function deleteOrHideChatMessage(
  actor: { userId: string; isAdmin: boolean },
  roomId: string,
  messageId: string,
  hideReason?: string
): { ok: true; message: StudyChatMessage } | { ok: false; status: number; error: string } {
  const list = store.chatMessages[roomId] || [];
  const idx = list.findIndex((m) => m.id === messageId);
  if (idx < 0) return { ok: false, status: 404, error: 'Message not found.' };
  const msg = list[idx];
  const isOwner = msg.senderId === actor.userId;
  if (!isOwner && !actor.isAdmin) {
    return { ok: false, status: 403, error: 'You can only remove your own messages.' };
  }
  const updated: StudyChatMessage = {
    ...msg,
    deleted: isOwner && !hideReason,
    hidden: Boolean(hideReason) || actor.isAdmin,
    text: hideReason ? '[Removed by moderator]' : '[Message deleted]',
    codeSnippet: undefined,
  };
  list[idx] = updated;
  store.chatMessages[roomId] = list;
  saveStore();
  emit({ type: 'chat:message:updated', roomId, message: updated });
  return { ok: true, message: updated };
}

// ============================================================================
// CONTENT REPORTING & ADMIN MODERATION
// ============================================================================
export function submitContentReport(
  actor: { userId: string; userName: string },
  input: {
    targetType: ReportTargetType;
    targetId: string;
    parentId?: string;
    roomId?: string;
    targetAuthorId?: string;
    targetAuthorName: string;
    targetPreview: string;
    reason: string;
    details?: string;
  }
): { ok: true; report: ContentReport } | { ok: false; status: number; error: string } {
  const reason = String(input.reason || '').trim().slice(0, 120);
  if (!reason || !input.targetId) {
    return { ok: false, status: 400, error: 'Please select a reason for this report.' };
  }
  const duplicate = store.reports.find(
    (r) =>
      r.status === 'open' &&
      r.reporterId === actor.userId &&
      r.targetType === input.targetType &&
      r.targetId === input.targetId
  );
  if (duplicate) {
    return { ok: false, status: 409, error: 'You have already reported this item. A community admin will review it.' };
  }

  const report: ContentReport = {
    id: uid('rep'),
    targetType: input.targetType,
    targetId: input.targetId,
    parentId: input.parentId,
    roomId: input.roomId,
    targetAuthorId: input.targetAuthorId,
    targetAuthorName: String(input.targetAuthorName || 'Member').slice(0, 80),
    targetPreview: String(input.targetPreview || '').slice(0, 220),
    reason,
    details: input.details ? String(input.details).trim().slice(0, 600) : undefined,
    reporterId: actor.userId,
    reporterName: actor.userName,
    createdAt: new Date().toISOString(),
    status: 'open',
  };

  store.reports = [report, ...store.reports];

  for (const adminId of getAdminUserIds()) {
    if (adminId !== actor.userId) {
      createNotification({
        recipientId: adminId,
        actorId: actor.userId,
        actorName: actor.userName,
        type: 'report',
        title: `New ${report.targetType} report: ${report.reason}`,
        body: report.targetPreview || `Reported by ${actor.userName}`,
        targetTab: 'admin-support',
        targetId: report.id,
      });
    }
  }

  saveStore();
  emit({ type: 'community:sync', reason: 'report_submitted', updatedAt: new Date().toISOString() });
  return { ok: true, report };
}

export function resolveContentReport(
  actor: { userId: string; userName: string; isAdmin: boolean },
  reportId: string,
  input: {
    status: 'resolved' | 'dismissed';
    action?: 'none' | 'hide' | 'delete' | 'lock' | 'mute_author';
    note?: string;
  }
): { ok: true; report: ContentReport } | { ok: false; status: number; error: string } {
  if (!actor.isAdmin) {
    return { ok: false, status: 403, error: 'Only community admins can resolve reports.' };
  }
  const idx = store.reports.findIndex((r) => r.id === reportId);
  if (idx < 0) return { ok: false, status: 404, error: 'Report not found.' };
  const rep = store.reports[idx];
  const nextStatus: 'resolved' | 'dismissed' = input.status === 'dismissed' ? 'dismissed' : 'resolved';
  const now = new Date().toISOString();

  if (nextStatus === 'resolved' && input.action && input.action !== 'none') {
    if (rep.targetType === 'post') {
      if (input.action === 'delete') deletePost(actor, rep.targetId);
      else if (input.action === 'hide') moderatePost(actor, rep.targetId, { hidden: true, hiddenReason: input.note || rep.reason });
      else if (input.action === 'lock') moderatePost(actor, rep.targetId, { locked: true });
    } else if (rep.targetType === 'comment' && rep.parentId) {
      if (input.action === 'delete') updateOrModerateComment(actor, rep.parentId, rep.targetId, { delete: true });
      else if (input.action === 'hide') updateOrModerateComment(actor, rep.parentId, rep.targetId, { hidden: true });
    } else if (rep.targetType === 'chat' && rep.roomId) {
      if (input.action === 'hide' || input.action === 'delete') {
        deleteOrHideChatMessage(actor, rep.roomId, rep.targetId, input.note || rep.reason);
      }
    } else if (rep.targetType === 'help' && (input.action === 'delete' || input.action === 'hide')) {
      store.helpRequests = store.helpRequests.filter((h) => h.id !== rep.targetId);
    } else if (rep.targetType === 'resource' && (input.action === 'delete' || input.action === 'hide')) {
      store.resources = store.resources.filter((r) => r.id !== rep.targetId);
    }

    if (input.action === 'mute_author') {
      const targetUserId = rep.targetAuthorId || resolveMemberIdByName(rep.targetAuthorName);
      if (targetUserId && !isUserAdmin(targetUserId)) {
        setMemberMuted(actor, targetUserId, true, input.note || rep.reason);
      }
    }
  }

  const updated: ContentReport = {
    ...rep,
    status: nextStatus,
    resolutionAction: input.action || 'none',
    resolutionNote: input.note ? input.note.trim().slice(0, 400) : undefined,
    resolvedBy: actor.userName,
    resolvedAt: now,
  };
  store.reports[idx] = updated;
  saveStore();
  emit({ type: 'community:sync', reason: 'report_resolved', updatedAt: now });
  return { ok: true, report: updated };
}

export function setMemberMuted(
  actor: { userId: string; userName: string; isAdmin: boolean },
  targetUserId: string,
  muted: boolean,
  reason = 'Community guideline violation'
): { ok: true } | { ok: false; status: number; error: string } {
  if (!actor.isAdmin) {
    return { ok: false, status: 403, error: 'Only community admins can mute or unmute members.' };
  }
  if (isUserAdmin(targetUserId) && muted) {
    return { ok: false, status: 400, error: 'Community admins cannot be muted.' };
  }
  if (muted) {
    store.moderation.mutedUserIds[targetUserId] = {
      reason: reason.slice(0, 160),
      mutedBy: actor.userName,
      mutedAt: new Date().toISOString(),
    };
    createNotification({
      recipientId: targetUserId,
      actorId: actor.userId,
      actorName: actor.userName,
      type: 'moderation',
      title: 'Posting permissions temporarily muted',
      body: reason,
      targetTab: 'community-home',
    });
  } else {
    delete store.moderation.mutedUserIds[targetUserId];
    createNotification({
      recipientId: targetUserId,
      actorId: actor.userId,
      actorName: actor.userName,
      type: 'moderation',
      title: 'Your posting permissions were restored',
      body: 'You can now post in discussions and study chat again.',
      targetTab: 'community-home',
    });
  }
  if (store.memberProfiles[targetUserId]) {
    store.memberProfiles[targetUserId] = {
      ...store.memberProfiles[targetUserId],
      muted,
      mutedReason: muted ? reason : undefined,
    };
  }
  saveStore();
  emit({ type: 'community:sync', reason: 'moderation_updated', updatedAt: new Date().toISOString() });
  return { ok: true };
}

export function setMemberRole(
  actor: { userId: string; userName: string; isAdmin: boolean },
  targetUserId: string,
  role: string
): { ok: true } | { ok: false; status: number; error: string } {
  if (!actor.isAdmin) {
    return { ok: false, status: 403, error: 'Only community admins can change member roles.' };
  }
  const allowed = ['Member', 'Learning Coordinator', 'Field Lead', 'Community Admin'];
  if (!allowed.includes(role)) {
    return { ok: false, status: 400, error: 'Invalid role.' };
  }
  if (store.memberProfiles[targetUserId]) {
    store.memberProfiles[targetUserId] = { ...store.memberProfiles[targetUserId], role };
  }
  store.teamRoster = store.teamRoster.map((m) => (m.id === targetUserId ? { ...m, role } : m));
  saveStore();
  emit({ type: 'community:sync', reason: 'role_updated', updatedAt: new Date().toISOString() });
  return { ok: true };
}
