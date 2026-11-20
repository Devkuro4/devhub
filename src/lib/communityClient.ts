import { supabase } from './supabase';
import type {
  CommunityEvent,
  CommunityNotification,
  CommunityPost,
  ContentReport,
  MemberDirectoryProfile,
  ModerationState,
  ReactionType,
  ReportTargetType,
  StudyChatMessage,
  StudyChatRoom,
  StudyGroup,
} from '../types';

const API_BASE = String((import.meta as any).env?.VITE_API_URL || '')
  .trim()
  .replace(/^['"]|['"]$/g, '')
  .replace(/\/+$/, '');

export interface CommunityActorRef {
  userId?: string;
  userName?: string;
}

async function buildHeaders(actor?: CommunityActorRef): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (actor?.userId) headers['X-Devhub-User'] = actor.userId;
  if (actor?.userName) headers['X-Devhub-Name'] = encodeURIComponent(actor.userName);
  return headers;
}

async function apiReq<T>(method: string, url: string, actor?: CommunityActorRef, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: await buildHeaders(actor),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface CommunityBootstrapResponse {
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
}

export function registerLocalSession(actor: CommunityActorRef, wantAdmin: boolean, adminCode?: string) {
  return apiReq<{ profile: MemberDirectoryProfile; isAdmin: boolean }>(
    'POST',
    '/api/community/session',
    actor,
    { name: actor.userName, wantAdmin, adminCode }
  );
}

export function fetchCommunityBootstrap(actor: CommunityActorRef) {
  return apiReq<CommunityBootstrapResponse>('GET', '/api/community/bootstrap', actor);
}

export function syncDirectoryProfile(
  actor: CommunityActorRef,
  profile: Partial<MemberDirectoryProfile> & { fullName?: string; skillLevel?: string }
) {
  return apiReq<{ profile: MemberDirectoryProfile }>('PUT', '/api/community/profile', actor, profile);
}

export function apiCreatePost(
  actor: CommunityActorRef,
  input: {
    category: string;
    title: string;
    content: string;
    codeSnippet?: string;
    attachmentUrl?: string;
    tags?: string[];
    pinned?: boolean;
  }
) {
  return apiReq<{ post: CommunityPost }>('POST', '/api/community/posts', actor, input);
}

export function apiUpdatePost(
  actor: CommunityActorRef,
  postId: string,
  patch: {
    title?: string;
    content?: string;
    category?: string;
    tags?: string[];
    codeSnippet?: string;
    attachmentUrl?: string;
  }
) {
  return apiReq<{ post: CommunityPost }>('PATCH', `/api/community/posts/${encodeURIComponent(postId)}`, actor, patch);
}

export function apiDeletePost(actor: CommunityActorRef, postId: string) {
  return apiReq<{ ok: true }>('DELETE', `/api/community/posts/${encodeURIComponent(postId)}`, actor);
}

export function apiModeratePost(
  actor: CommunityActorRef,
  postId: string,
  action: { pinned?: boolean; locked?: boolean; hidden?: boolean; hiddenReason?: string }
) {
  return apiReq<{ post: CommunityPost }>('POST', `/api/community/posts/${encodeURIComponent(postId)}/moderate`, actor, action);
}

export function apiReactPost(actor: CommunityActorRef, postId: string, type: ReactionType) {
  return apiReq<{ post: CommunityPost }>('POST', `/api/community/posts/${encodeURIComponent(postId)}/react`, actor, { type });
}

export function apiAddComment(actor: CommunityActorRef, postId: string, input: { text: string; parentId?: string }) {
  return apiReq<{ post: CommunityPost }>('POST', `/api/community/posts/${encodeURIComponent(postId)}/comments`, actor, input);
}

export function apiUpdateComment(
  actor: CommunityActorRef,
  postId: string,
  commentId: string,
  patch: { text?: string; toggleHelpful?: boolean; hidden?: boolean }
) {
  return apiReq<{ post: CommunityPost }>(
    'PATCH',
    `/api/community/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
    actor,
    patch
  );
}

export function apiDeleteComment(actor: CommunityActorRef, postId: string, commentId: string) {
  return apiReq<{ post: CommunityPost }>(
    'DELETE',
    `/api/community/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
    actor
  );
}

export function apiCreateStudyGroup(
  actor: CommunityActorRef,
  input: { name: string; field: string; topic: string; description: string; level?: string; schedule?: string; maxMembers?: number }
) {
  return apiReq<{ group: StudyGroup; room: StudyChatRoom }>('POST', '/api/community/study-groups', actor, input);
}

export function apiToggleJoinStudyGroup(actor: CommunityActorRef, groupId: string) {
  return apiReq<{ group: StudyGroup; joined: boolean }>('POST', `/api/community/study-groups/${encodeURIComponent(groupId)}/join`, actor);
}

export function apiUpdateStudyGroupWorkspace(
  actor: CommunityActorRef,
  groupId: string,
  input: { addGoal?: string; toggleGoalId?: string; addLink?: { title: string; url: string } }
) {
  return apiReq<{ group: StudyGroup }>('PATCH', `/api/community/study-groups/${encodeURIComponent(groupId)}`, actor, input);
}

export function apiCreateHelpRequest(
  actor: CommunityActorRef,
  input: { field?: string; goal: string; attempted?: string; errorOrCode?: string; helpNeeded: string }
) {
  return apiReq<{ helpRequest: any }>('POST', '/api/community/help', actor, input);
}

export function apiReplyHelpRequest(actor: CommunityActorRef, helpId: string, text: string) {
  return apiReq<{ helpRequest: any }>('POST', `/api/community/help/${encodeURIComponent(helpId)}/reply`, actor, { text });
}

export function apiToggleHelpResolved(actor: CommunityActorRef, helpId: string) {
  return apiReq<{ helpRequest: any }>('POST', `/api/community/help/${encodeURIComponent(helpId)}/resolve`, actor);
}

export function apiAddResource(
  actor: CommunityActorRef,
  input: { title: string; category: string; type: string; url: string; description?: string; tags?: string[] }
) {
  return apiReq<{ resource: any }>('POST', '/api/community/resources', actor, input);
}

export function apiAddEvent(
  actor: CommunityActorRef,
  input: { title: string; type: string; topic?: string; dateTime: string; description?: string; resourceUrl?: string }
) {
  return apiReq<{ event: CommunityEvent }>('POST', '/api/community/events', actor, input);
}

export function apiToggleEventAction(actor: CommunityActorRef, eventId: string, action: 'rsvp' | 'reminder') {
  return apiReq<{ event: CommunityEvent }>('POST', `/api/community/events/${encodeURIComponent(eventId)}/${action}`, actor);
}

export function apiMarkNotificationRead(actor: CommunityActorRef, notifId: string) {
  return apiReq<{ notifications: CommunityNotification[] }>('POST', `/api/community/notifications/${encodeURIComponent(notifId)}/read`, actor);
}

export function apiMarkAllNotificationsRead(actor: CommunityActorRef) {
  return apiReq<{ notifications: CommunityNotification[] }>('POST', '/api/community/notifications/read-all', actor);
}

export function apiSubmitReport(
  actor: CommunityActorRef,
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
) {
  return apiReq<{ report: ContentReport }>('POST', '/api/community/reports', actor, input);
}

export function apiResolveReport(
  actor: CommunityActorRef,
  reportId: string,
  input: { status: 'resolved' | 'dismissed'; action?: 'none' | 'hide' | 'delete' | 'lock' | 'mute_author'; note?: string }
) {
  return apiReq<{ report: ContentReport }>('POST', `/api/community/reports/${encodeURIComponent(reportId)}/resolve`, actor, input);
}

export function apiSetMemberMuted(actor: CommunityActorRef, userId: string, muted: boolean, reason?: string) {
  return apiReq<{ ok: true }>('POST', '/api/community/moderation/mute', actor, { userId, muted, reason });
}

export function apiSetMemberRole(actor: CommunityActorRef, userId: string, role: string) {
  return apiReq<{ ok: true }>('POST', `/api/community/members/${encodeURIComponent(userId)}/role`, actor, { role });
}

export function apiOpenDirectChat(actor: CommunityActorRef, peerId: string, peerName: string) {
  return apiReq<{ room: StudyChatRoom }>('POST', '/api/chat/dm', actor, { peerId, peerName });
}

export function apiDeleteChatMessage(actor: CommunityActorRef, roomId: string, messageId: string, reason?: string) {
  return apiReq<{ message: StudyChatMessage }>(
    'DELETE',
    `/api/chat/messages/${encodeURIComponent(roomId)}/${encodeURIComponent(messageId)}`,
    actor,
    reason ? { reason } : undefined
  );
}


// Admin announcement actions. The server enforces admin permissions for these operations.
export function apiPublishAnnouncement(actor: CommunityActorRef, input: { title: string; content: string; category: string; tags?: string[] }) {
  return apiReq<{ post: CommunityPost }>('POST', '/api/community/posts', actor, {
    ...input, category: 'Announcement', tags: [input.category, ...(input.tags || [])], pinned: true,
  });
}
