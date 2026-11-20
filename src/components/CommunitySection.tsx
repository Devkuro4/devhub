import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Bookmark,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  CornerUpLeft,
  Edit3,
  ExternalLink,
  EyeOff,
  Flag,
  Globe,
  Hash,
  HelpCircle,
  HeartHandshake,
  Library,
  Lightbulb,
  Loader2,
  Lock,
  Megaphone,
  MessageSquare,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Tag,
  ThumbsUp,
  Trash2,
  Trophy,
  Unlock,
  Users,
  X,
} from 'lucide-react';
import { Badge, EmptyState, Modal, PageHeader, SectionTabs, SkeletonBlock } from './ui';
import { getUrlError } from '../lib/url';
import { apiOpenDirectChat } from '../lib/communityClient';
import { requestGroundedSearch, type GroundedSource } from '../lib/aiClient';
import { StudyGroupChatPanel, useStudyGroupChat, type MentionCandidate } from './StudyGroupChat';
import { MentionPickerBar, MentionText, type ReportDraftTarget } from './CommunityModals';
import { StudyGroupsPanel } from './StudyGroupsPanel';
import type {
  CommunityEvent,
  CommunityPost,
  CommunityPostComment,
  MemberDirectoryProfile,
  ModerationState,
  OnboardingProfile,
  ReactionType,
  StudyChatMessage,
  StudyGroup,
} from '../types';

export type CommunitySubTab =
  | 'community-home'
  | 'study-chat'
  | 'community'
  | 'study-groups'
  | 'announcements'
  | 'resources'
  | 'events'
  | 'challenges'
  | 'pairing-help';

const QUICK_TAG_SUGGESTIONS = ['javascript', 'react', 'css', 'python', 'sql', 'git', 'debugging', 'beginners'];

/** Long posts collapse to a few lines so the feed stays easy to scan */
const PostBody = ({ text, className }: { text: string; className: string }) => {
  const [open, setOpen] = useState(false);
  const long = text.length > 320 || text.split('\n').length > 5;
  return (
    <div>
      <p className={`${className} whitespace-pre-wrap break-words ${long && !open ? 'line-clamp-4' : ''}`}>
        <MentionText text={text} />
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-1 min-h-[32px] text-sm font-medium text-[var(--accent-600)] hover:underline cursor-pointer"
        >
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
};

// Switching tabs remounts this section if parent switches keys; this preserves composer intent across Home -> Discussions.
let openComposerOnMount = false;
const openComposerOnDiscussions = (setSubTab: (t: CommunitySubTab) => void) => {
  openComposerOnMount = true;
  setSubTab('community');
};

export interface CommunityActionsProp {
  createPost: (input: {
    category: string;
    title: string;
    content: string;
    codeSnippet?: string;
    attachmentUrl?: string;
    tags?: string[];
    pinned?: boolean;
  }) => Promise<void> | void;
  updatePost: (
    postId: string,
    patch: { title?: string; content?: string; category?: string; tags?: string[]; codeSnippet?: string; attachmentUrl?: string }
  ) => Promise<void> | void;
  deletePost: (postId: string) => Promise<void> | void;
  moderatePost: (
    postId: string,
    action: { pinned?: boolean; locked?: boolean; hidden?: boolean; hiddenReason?: string }
  ) => Promise<void> | void;
  reactPost: (postId: string, type: ReactionType) => Promise<void> | void;
  addComment: (postId: string, input: { text: string; parentId?: string }) => Promise<void> | void;
  updateComment: (
    postId: string,
    commentId: string,
    patch: { text?: string; toggleHelpful?: boolean; hidden?: boolean }
  ) => Promise<void> | void;
  deleteComment: (postId: string, commentId: string) => Promise<void> | void;
  createStudyGroup: (input: {
    name: string;
    field: string;
    topic: string;
    description: string;
    level?: string;
    schedule?: string;
    maxMembers?: number;
  }) => Promise<StudyGroup | null | void>;
  toggleJoinStudyGroup: (groupId: string) => Promise<void> | void;
  removeStudyGroupMember: (groupId: string, memberId: string) => Promise<void> | void;
  updateStudyGroupWorkspace: (
    groupId: string,
    input: { addGoal?: string; toggleGoalId?: string; addLink?: { title: string; url: string } }
  ) => Promise<void> | void;
  createHelpRequest: (input: {
    field?: string;
    goal: string;
    attempted?: string;
    errorOrCode?: string;
    helpNeeded: string;
  }) => Promise<void> | void;
  replyHelpRequest: (helpId: string, text: string) => Promise<void> | void;
  toggleHelpResolved: (helpId: string) => Promise<void> | void;
  addResource: (input: {
    title: string;
    category: string;
    type: string;
    url: string;
    description?: string;
    tags?: string[];
  }) => Promise<void> | void;
  addEvent: (input: {
    title: string;
    type: string;
    topic?: string;
    dateTime: string;
    description?: string;
    resourceUrl?: string;
  }) => Promise<void> | void;
  toggleEventAction: (eventId: string, action: 'rsvp' | 'reminder') => Promise<void> | void;
}

export const CommunitySection = ({
  subTab,
  setSubTab,
  user,
  isAdminMode,
  profile,
  posts,
  setPosts,
  savedPostIds,
  setSavedPostIds,
  resources,
  setResources,
  presentations,
  setPresentations,
  challenges,
  setChallenges,
  helpRequests,
  setHelpRequests,
  studyGroups = [],
  teamRoster,
  memberProfiles = {},
  moderation,
  pairingState,
  communityLoading = false,
  communityError = '',
  onRetryCommunityLoad,
  focusedPostId,
  onClearFocusedPost,
  onOpenMemberProfile,
  onReportContent,
  actions,
  onNotify,
  styles,
}: {
  subTab: CommunitySubTab;
  setSubTab: (t: CommunitySubTab) => void;
  user: { id?: string; name: string; email: string };
  isAdminMode: boolean;
  profile: OnboardingProfile;
  posts: CommunityPost[];
  setPosts: (p: CommunityPost[]) => void;
  savedPostIds: string[];
  setSavedPostIds: (ids: string[]) => void;
  resources: any[];
  setResources: (r: any[]) => void;
  presentations: CommunityEvent[];
  setPresentations: (e: CommunityEvent[]) => void;
  challenges: any[];
  setChallenges: (c: any[]) => void;
  helpRequests: any[];
  setHelpRequests: (h: any[]) => void;
  studyGroups?: StudyGroup[];
  teamRoster: any[];
  memberProfiles?: Record<string, MemberDirectoryProfile>;
  moderation?: ModerationState;
  pairingState: any;
  communityLoading?: boolean;
  communityError?: string;
  onRetryCommunityLoad?: () => void;
  focusedPostId?: string | null;
  onClearFocusedPost?: () => void;
  onOpenMemberProfile?: (memberId: string, memberName?: string) => void;
  onReportContent?: (target: ReportDraftTarget) => void;
  actions?: CommunityActionsProp;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  styles: {
    cardClass: string;
    borderClass: string;
    subtleBgClass: string;
    textPrimary: string;
    textSecondary: string;
    inputClass: string;
    btnPrimary: string;
    btnSecondary: string;
    darkMode: boolean;
  };
}) => {
  const { cardClass, borderClass, subtleBgClass, textPrimary, textSecondary, inputClass, btnPrimary, btnSecondary } = styles;

  useEffect(() => {
    openComposerOnMount = false;
  }, []);

  const currentUserId = user.id || user.email || 'local-member';
  const currentUserName = user.name || profile.fullName || 'Member';
  const myMute = moderation?.mutedUserIds?.[currentUserId];
  const mutedReason = myMute?.reason;

  const { unreadCount: chatUnread, upsertRoomAndOpen } = useStudyGroupChat();
  const [memberSearch, setMemberSearch] = useState('');
  const [startingDm, setStartingDm] = useState<string | null>(null);

  const postDraftKey = `devhub_draft_${currentUserId}_community_post`;
  const helpDraftKey = `devhub_draft_${currentUserId}_community_help`;
  const readDraft = (key: string) => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const savedPostDraft = readDraft(postDraftKey);
  const savedHelpDraft = readDraft(helpDraftKey);

  // Unified Home Discovery search
  const [homeQuery, setHomeQuery] = useState('');

  // Discussions state
  const [postFilter, setPostFilter] = useState('All');
  const [tagFilter, setTagFilter] = useState('All');
  const [showPostModal, setShowPostModal] = useState(
    openComposerOnMount || Boolean(savedPostDraft && (savedPostDraft.postTitle || savedPostDraft.postBody))
  );
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null);
  const [postCat, setPostCat] = useState(savedPostDraft?.postCat || 'Question');
  const [postTitle, setPostTitle] = useState(savedPostDraft?.postTitle || '');
  const [postBody, setPostBody] = useState(savedPostDraft?.postBody || '');
  const [postTagsInput, setPostTagsInput] = useState(savedPostDraft?.postTagsInput || '');
  const [postCode, setPostCode] = useState(savedPostDraft?.postCode || '');
  const [postLink, setPostLink] = useState(savedPostDraft?.postLink || '');
  const [showPostExtras, setShowPostExtras] = useState(Boolean(savedPostDraft?.postCode || savedPostDraft?.postLink));
  const [confirmDeletePostId, setConfirmDeletePostId] = useState<string | null>(null);

  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyParentByPost, setReplyParentByPost] = useState<Record<string, CommunityPostComment | null>>({});
  const [editingComment, setEditingComment] = useState<{ postId: string; commentId: string; text: string } | null>(null);

  const [postSearch, setPostSearch] = useState('');
  const [postSort, setPostSort] = useState<'new' | 'helpful' | 'discussed' | 'unanswered'>('new');

  // Announcements composer & edit state (admin)
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [editingAnn, setEditingAnn] = useState<CommunityPost | null>(null);

  // Resources state
  const [resSearch, setResSearch] = useState('');
  const [resTypeFilter, setResTypeFilter] = useState('All');
  const [showAddRes, setShowAddRes] = useState(false);
  const [resTitle, setResTitle] = useState('');
  const [resCat, setResCat] = useState(profile.field || 'Frontend Development');
  const [resType, setResType] = useState('Guide');
  const [resUrl, setResUrl] = useState('');
  const [resDesc, setResDesc] = useState('');
  const [webSearchQuery, setWebSearchQuery] = useState('');
  const [webSearchBusy, setWebSearchBusy] = useState(false);
  const [webSearchResult, setWebSearchResult] = useState<{
    query: string;
    answer: string;
    sources: GroundedSource[];
  } | null>(null);

  // Events state
  const [evSearch, setEvSearch] = useState('');
  const [evTypeFilter, setEvTypeFilter] = useState('All');
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [evTitle, setEvTitle] = useState('');
  const [evType, setEvType] = useState('Study Session');
  const [evTopic, setEvTopic] = useState('');
  const [evTime, setEvTime] = useState('');
  const [evDesc, setEvDesc] = useState('');
  const [evUrl, setEvUrl] = useState('');

  // Challenges state
  const [challengeFilter, setChallengeFilter] = useState('All');
  const [submitChId, setSubmitChId] = useState<string | null>(null);
  const [chRepo, setChRepo] = useState('');
  const [chExplain, setChExplain] = useState('');
  const [chDiff, setChDiff] = useState('');
  const [chAiUsed, setChAiUsed] = useState('No — Written 100% independently');
  const [chAiVerify, setChAiVerify] = useState('');
  const [showSuggestCh, setShowSuggestCh] = useState(false);
  const [newChTitle, setNewChTitle] = useState('');
  const [newChCat, setNewChCat] = useState('Frontend');
  const [newChLevel, setNewChLevel] = useState('Beginner');
  const [newChDesc, setNewChDesc] = useState('');

  // Help Desk & Member directory state
  const [helpSearch, setHelpSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [helpGoal, setHelpGoal] = useState(savedHelpDraft?.helpGoal || '');
  const [helpTried, setHelpTried] = useState(savedHelpDraft?.helpTried || '');
  const [helpCode, setHelpCode] = useState(savedHelpDraft?.helpCode || '');
  const [helpAsk, setHelpAsk] = useState(savedHelpDraft?.helpAsk || '');
  const [helpReplyDrafts, setHelpReplyDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (editingPost) return;
    try {
      if (postTitle.trim() || postBody.trim() || postCode.trim() || postLink.trim() || postTagsInput.trim()) {
        sessionStorage.setItem(postDraftKey, JSON.stringify({ postCat, postTitle, postBody, postTagsInput, postCode, postLink }));
      } else {
        sessionStorage.removeItem(postDraftKey);
      }
    } catch {}
  }, [editingPost, postDraftKey, postCat, postTitle, postBody, postTagsInput, postCode, postLink]);

  useEffect(() => {
    try {
      if (helpGoal.trim() || helpTried.trim() || helpCode.trim() || helpAsk.trim()) {
        sessionStorage.setItem(helpDraftKey, JSON.stringify({ helpGoal, helpTried, helpCode, helpAsk }));
      } else {
        sessionStorage.removeItem(helpDraftKey);
      }
    } catch {}
  }, [helpDraftKey, helpGoal, helpTried, helpCode, helpAsk]);

  // Scroll to a focused post when navigated from Notifications or Member Profile
  useEffect(() => {
    if (subTab === 'community' && focusedPostId) {
      setPostFilter('All');
      setTagFilter('All');
      setPostSearch('');
      const timer = setTimeout(() => {
        const el = document.getElementById(`community-post-${focusedPostId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        onClearFocusedPost?.();
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [subTab, focusedPostId, onClearFocusedPost]);

  const postLinkError = getUrlError(postLink, 'https://developer.mozilla.org/...');
  const resUrlError = getUrlError(resUrl, 'https://developer.mozilla.org/...');
  const evUrlError = getUrlError(evUrl, 'https://meet.jit.si/devhub-study');
  const chRepoError = getUrlError(chRepo, 'https://github.com/your-name/challenge-solution');

  const directoryMembers = useMemo<MemberDirectoryProfile[]>(() => {
    const map = new Map<string, MemberDirectoryProfile>();
    for (const m of teamRoster || []) {
      const id = m.id || m.name;
      map.set(id, {
        id,
        name: m.name || 'Member',
        username: m.username || (m.name || 'member').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        role: m.role || 'Member',
        field: m.field || '',
        level: m.level || '',
        bio: m.bio || '',
        partner: m.partner || '',
        mentor: m.mentor || '',
        ...(memberProfiles[id] || {}),
      });
    }
    for (const [id, prof] of Object.entries(memberProfiles || {})) {
      if (!map.has(id)) map.set(id, prof);
    }
    return Array.from(map.values());
  }, [teamRoster, memberProfiles]);

  const mentionCandidates = useMemo<MentionCandidate[]>(
    () =>
      directoryMembers.map((m) => ({
        id: m.id,
        name: m.name,
        username: m.username,
      })),
    [directoryMembers]
  );

  const parseTagsInput = (raw: string) =>
    Array.from(
      new Set(
        raw
          .split(/[,\s]+/)
          .map((t) => t.trim().toLowerCase().replace(/^#/, '').replace(/[^a-z0-9.+#_-]/g, ''))
          .filter(Boolean)
      )
    ).slice(0, 6);

  const openEditPostModal = (post: CommunityPost) => {
    setEditingPost(post);
    setPostCat(post.category);
    setPostTitle(post.title);
    setPostBody(post.content);
    setPostTagsInput((post.tags || []).join(', '));
    setPostCode(post.codeSnippet || '');
    setPostLink(post.attachmentUrl || '');
    setShowPostExtras(Boolean(post.codeSnippet || post.attachmentUrl));
    setShowPostModal(true);
  };

  const resetPostModal = () => {
    setEditingPost(null);
    setPostCat('Question');
    setPostTitle('');
    setPostBody('');
    setPostTagsInput('');
    setPostCode('');
    setPostLink('');
    setShowPostExtras(false);
    setShowPostModal(false);
  };

  const handleCreateOrSavePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postTitle.trim() || !postBody.trim() || postLinkError) return;
    const tags = parseTagsInput(postTagsInput);

    if (editingPost) {
      if (actions) {
        await actions.updatePost(editingPost.id, {
          category: postCat,
          title: postTitle.trim(),
          content: postBody.trim(),
          tags,
          codeSnippet: postCode.trim() || undefined,
          attachmentUrl: postLink.trim() || undefined,
        });
      } else {
        setPosts(
          posts.map((p) =>
            p.id === editingPost.id
              ? {
                  ...p,
                  category: postCat,
                  title: postTitle.trim(),
                  content: postBody.trim(),
                  tags,
                  codeSnippet: postCode.trim() || undefined,
                  attachmentUrl: postLink.trim() || undefined,
                  updatedAt: new Date().toISOString(),
                }
              : p
          )
        );
        onNotify('Discussion updated.');
      }
      resetPostModal();
      return;
    }

    if (actions) {
      await actions.createPost({
        category: postCat,
        title: postTitle.trim(),
        content: postBody.trim(),
        tags,
        codeSnippet: postCode.trim() || undefined,
        attachmentUrl: postLink.trim() || undefined,
      });
    } else {
      const item: CommunityPost = {
        id: `post-${Date.now()}`,
        author: currentUserName,
        authorId: currentUserId,
        role: isAdminMode ? 'Community Admin' : 'Member',
        category: postCat,
        tags,
        pinned: false,
        timestamp: 'Just now',
        createdAt: new Date().toISOString(),
        title: postTitle.trim(),
        content: postBody.trim(),
        codeSnippet: postCode.trim() || undefined,
        attachmentUrl: postLink.trim() || undefined,
        likes: 0,
        reactions: {},
        comments: [],
      };
      setPosts([item, ...posts]);
      onNotify('Posted to Community Discussions!');
    }

    resetPostModal();
    try {
      sessionStorage.removeItem(postDraftKey);
    } catch {}
  };

  const handleCreateOrSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annBody.trim()) return;
    if (editingAnn) {
      if (actions) {
        await actions.updatePost(editingAnn.id, {
          title: annTitle.trim(),
          content: annBody.trim(),
          category: 'Announcement',
        });
      } else {
        setPosts(
          posts.map((p) =>
            p.id === editingAnn.id ? { ...p, title: annTitle.trim(), content: annBody.trim(), updatedAt: new Date().toISOString() } : p
          )
        );
        onNotify('Announcement updated.');
      }
      setEditingAnn(null);
      setAnnTitle('');
      setAnnBody('');
      return;
    }

    if (actions) {
      await actions.createPost({
        category: 'Announcement',
        title: annTitle.trim(),
        content: annBody.trim(),
        pinned: true,
      });
    } else {
      const item: CommunityPost = {
        id: `post-${Date.now()}`,
        author: currentUserName,
        authorId: currentUserId,
        role: 'Community Admin',
        category: 'Announcement',
        pinned: true,
        timestamp: 'Just now',
        createdAt: new Date().toISOString(),
        title: annTitle.trim(),
        content: annBody.trim(),
        likes: 0,
        reactions: {},
        comments: [],
      };
      setPosts([item, ...posts]);
      onNotify('Announcement published.');
    }
    setAnnTitle('');
    setAnnBody('');
  };

  const handleAddReply = async (postId: string) => {
    const text = (replyDrafts[postId] || '').trim();
    if (!text) return;
    const parent = replyParentByPost[postId];
    if (actions) {
      await actions.addComment(postId, { text, parentId: parent?.id });
    } else {
      setPosts(
        posts.map((p) =>
          p.id === postId
            ? {
                ...p,
                comments: [
                  ...p.comments,
                  {
                    id: `c-${Date.now()}`,
                    author: currentUserName,
                    authorId: currentUserId,
                    authorRole: isAdminMode ? 'Community Admin' : 'Member',
                    text,
                    parentId: parent?.id,
                    createdAt: new Date().toISOString(),
                    isHelpful: false,
                    helpfulBy: [],
                  },
                ],
              }
            : p
        )
      );
    }
    setReplyDrafts((prev) => ({ ...prev, [postId]: '' }));
    setReplyParentByPost((prev) => ({ ...prev, [postId]: null }));
  };

  const handleReaction = async (post: CommunityPost, type: ReactionType) => {
    if (actions) {
      await actions.reactPost(post.id, type);
      return;
    }
    const existing = post.reactions?.[type] || [];
    const has = existing.includes(currentUserId);
    const updatedList = has ? existing.filter((id) => id !== currentUserId) : [...existing, currentUserId];
    const nextReactions = { ...(post.reactions || {}), [type]: updatedList };
    const total = (['helpful', 'insightful', 'celebrate'] as ReactionType[]).reduce(
      (sum, key) => sum + ((nextReactions[key] || []).length),
      0
    );
    setPosts(posts.map((p) => (p.id === post.id ? { ...p, reactions: nextReactions, likes: total } : p)));
  };

  const toggleSavePost = (postId: string) => {
    if (savedPostIds.includes(postId)) {
      setSavedPostIds(savedPostIds.filter((id) => id !== postId));
    } else {
      setSavedPostIds([postId, ...savedPostIds]);
      onNotify('Saved to your bookmarks.');
    }
  };

  const handleAddResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resTitle.trim() || !resUrl.trim() || resUrlError) return;
    if (actions) {
      await actions.addResource({
        title: resTitle.trim(),
        category: resCat.trim() || 'General',
        type: resType,
        url: resUrl.trim(),
        description: resDesc.trim() || 'Shared by a community member.',
      });
    } else {
      const item = {
        id: `res-${Date.now()}`,
        title: resTitle.trim(),
        category: resCat.trim() || 'General',
        type: resType,
        url: resUrl.trim(),
        addedBy: currentUserName,
        addedById: currentUserId,
        description: resDesc.trim() || 'Shared by a community member.',
      };
      setResources([item, ...resources]);
      onNotify('Resource added to the community library.');
    }
    setResTitle('');
    setResUrl('');
    setResDesc('');
    setShowAddRes(false);
  };

  const handleWebResourceSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = webSearchQuery.trim();
    if (!q || webSearchBusy) return;
    setWebSearchBusy(true);
    try {
      const res = await requestGroundedSearch(
        {
          query: q,
          field: profile.field || 'Web Development',
          skillLevel: profile.skillLevel || 'Beginner',
        },
        user.id
      );
      setWebSearchResult({ query: res.query, answer: res.answer, sources: res.sources || [] });
    } catch (err: any) {
      onNotify(err?.message || 'Could not run the web search right now.', 'error');
    } finally {
      setWebSearchBusy(false);
    }
  };

  const handleSaveGroundedSource = async (src: GroundedSource) => {
    if (resources.some((r) => r.url === src.uri)) {
      onNotify('This link is already in the community library.');
      return;
    }
    if (actions) {
      await actions.addResource({
        title: src.title,
        category: profile.field || 'General',
        type: 'Documentation',
        url: src.uri,
        description: `Found via web search for "${webSearchResult?.query || 'study topic'}".`,
      });
    } else {
      const item = {
        id: `res-${Date.now()}`,
        title: src.title,
        category: profile.field || 'General',
        type: 'Documentation',
        url: src.uri,
        addedBy: currentUserName,
        description: `Found via web search for "${webSearchResult?.query || 'study topic'}".`,
      };
      setResources([item, ...resources]);
      onNotify(`Saved "${src.title}" to community resources.`);
    }
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evTitle.trim() || !evTime.trim() || evUrlError) return;
    if (actions) {
      await actions.addEvent({
        title: evTitle.trim(),
        topic: evTopic.trim() || 'Peer Learning',
        type: evType,
        dateTime: evTime.trim(),
        description: evDesc.trim() || 'Beginner-friendly live study session.',
        resourceUrl: evUrl.trim(),
      });
    } else {
      const item: CommunityEvent = {
        id: `pres-${Date.now()}`,
        title: evTitle.trim(),
        presenter: currentUserName,
        presenterId: currentUserId,
        topic: evTopic.trim() || 'Peer Learning',
        type: evType,
        dateTime: evTime.trim(),
        description: evDesc.trim() || 'Beginner-friendly live study session.',
        resourceUrl: evUrl.trim(),
        attendees: [currentUserName],
        attendeeIds: [currentUserId],
        reminders: [currentUserName],
        reminderIds: [currentUserId],
      };
      setPresentations([item, ...presentations]);
      onNotify('Session scheduled!');
    }
    setEvTitle('');
    setEvTopic('');
    setEvTime('');
    setEvDesc('');
    setEvUrl('');
    setShowAddEvent(false);
  };

  const toggleRsvp = async (eventId: string) => {
    if (actions) {
      await actions.toggleEventAction(eventId, 'rsvp');
      return;
    }
    setPresentations(
      presentations.map((ev) => {
        if (ev.id !== eventId) return ev;
        const going = ev.attendees.includes(currentUserName);
        return {
          ...ev,
          attendees: going ? ev.attendees.filter((a) => a !== currentUserName) : [...ev.attendees, currentUserName],
        };
      })
    );
  };

  const toggleReminder = async (eventId: string) => {
    if (actions) {
      await actions.toggleEventAction(eventId, 'reminder');
      return;
    }
    setPresentations(
      presentations.map((ev) => {
        if (ev.id !== eventId) return ev;
        const list = ev.reminders || [];
        const has = list.includes(currentUserName);
        onNotify(has ? 'Reminder turned off.' : 'We will remind you before this session.');
        return {
          ...ev,
          reminders: has ? list.filter((a) => a !== currentUserName) : [...list, currentUserName],
        };
      })
    );
  };

  const handleSubmitChallenge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitChId || !chExplain.trim() || chRepoError) return;
    setChallenges(
      challenges.map((c) =>
        c.id === submitChId
          ? {
              ...c,
              status: 'Completed',
              submission: {
                repoUrl: chRepo.trim(),
                explanation: chExplain.trim(),
                difficulties: chDiff.trim(),
                usedAi: chAiUsed,
                aiVerification: chAiVerify.trim(),
                feedback: 'Submitted cleanly! Great consistency.',
              },
            }
          : c
      )
    );
    setSubmitChId(null);
    setChRepo('');
    setChExplain('');
    setChDiff('');
    setChAiVerify('');
    onNotify('Challenge solution submitted!');
  };

  const handleSuggestChallenge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChTitle.trim() || !newChDesc.trim()) return;
    const item = {
      id: `ch-${Date.now()}`,
      title: newChTitle.trim(),
      category: newChCat,
      difficulty: newChLevel,
      deadline: 'Self-Paced',
      technologies: [newChCat],
      description: newChDesc.trim(),
      objectives: ['Build a small working version', 'Share what you learned or got stuck on'],
      status: 'Not Started',
      submission: null,
    };
    setChallenges([item, ...challenges]);
    setNewChTitle('');
    setNewChDesc('');
    setShowSuggestCh(false);
    onNotify('Challenge added for the community.');
  };

  const handleAskHelp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!helpGoal.trim() || !helpAsk.trim()) return;
    if (actions) {
      await actions.createHelpRequest({
        field: profile.field || 'General',
        goal: helpGoal.trim(),
        attempted: helpTried.trim() || 'Still exploring where the issue happens.',
        errorOrCode: helpCode.trim(),
        helpNeeded: helpAsk.trim(),
      });
    } else {
      const req = {
        id: `help-${Date.now()}`,
        author: currentUserName,
        authorId: currentUserId,
        field: profile.field || 'General',
        target: 'Community',
        status: 'Open',
        createdAt: 'Just now',
        goal: helpGoal.trim(),
        attempted: helpTried.trim() || 'Still exploring where the issue happens.',
        errorOrCode: helpCode.trim(),
        helpNeeded: helpAsk.trim(),
        responses: [],
      };
      setHelpRequests([req, ...helpRequests]);
      onNotify('Question posted to peers and mentors!');
    }
    setHelpGoal('');
    setHelpTried('');
    setHelpCode('');
    setHelpAsk('');
    try {
      sessionStorage.removeItem(helpDraftKey);
    } catch {}
  };

  const handleHelpReply = async (reqId: string) => {
    const text = (helpReplyDrafts[reqId] || '').trim();
    if (!text) return;
    if (actions) {
      await actions.replyHelpRequest(reqId, text);
    } else {
      setHelpRequests(
        helpRequests.map((h) =>
          h.id === reqId
            ? {
                ...h,
                status: h.status === 'Resolved' ? 'Resolved' : 'Being Helped',
                responses: [...(h.responses || []), { id: `hr-${Date.now()}`, responder: currentUserName, responderId: currentUserId, text }],
              }
            : h
        )
      );
      onNotify('Helpful response added.');
    }
    setHelpReplyDrafts((prev) => ({ ...prev, [reqId]: '' }));
  };

  const visiblePosts = useMemo(
    () => posts.filter((p) => isAdminMode || !p.hidden),
    [posts, isAdminMode]
  );

  const communityTabs: { id: CommunitySubTab; label: string; badge?: number }[] = [
    { id: 'community-home', label: 'Community Home' },
    { id: 'study-chat', label: 'Messages', badge: chatUnread },
    { id: 'study-groups', label: 'Study Groups', badge: studyGroups.length },
    { id: 'community', label: 'Discussions', badge: visiblePosts.length },
    { id: 'events', label: 'Events', badge: presentations.length },
    { id: 'resources', label: 'Resources', badge: resources.length },
    { id: 'pairing-help', label: 'Peer Help' },
  ];

  // Collect all tags used across visible posts
  const availableTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of visiblePosts) {
      for (const t of p.tags || []) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }, [visiblePosts]);

  const inCategory = (p: CommunityPost, cat: string) => {
    if (cat === 'Saved') return savedPostIds.includes(p.id);
    if (cat === 'All') return true;
    return p.category === cat;
  };

  const reactionTotal = (p: CommunityPost) => {
    if (!p.reactions) return p.likes || 0;
    const sum = (['helpful', 'insightful', 'celebrate'] as ReactionType[]).reduce(
      (s, k) => s + ((p.reactions?.[k] || []).length),
      0
    );
    return Math.max(sum, p.likes || 0);
  };

  const postQuery = postSearch.trim().toLowerCase();
  const discussionPosts = useMemo(() => {
    const list = visiblePosts
      .filter((p) => inCategory(p, postFilter))
      .filter((p) => tagFilter === 'All' || (p.tags || []).includes(tagFilter))
      .filter(
        (p) =>
          !postQuery ||
          p.title.toLowerCase().includes(postQuery) ||
          p.content.toLowerCase().includes(postQuery) ||
          p.author.toLowerCase().includes(postQuery) ||
          (p.tags || []).some((t) => t.includes(postQuery))
      )
      .filter((p) => postSort !== 'unanswered' || p.comments.filter((c) => !c.hidden).length === 0);

    const sorted = [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
      if (postSort === 'helpful') return reactionTotal(b) - reactionTotal(a);
      if (postSort === 'discussed') return b.comments.length - a.comments.length;
      return 0;
    });
    return sorted;
  }, [visiblePosts, postFilter, tagFilter, postQuery, postSort, savedPostIds]);

  const announcementsList = visiblePosts.filter((p) => p.category === 'Announcement' || p.pinned);

  const filteredResources = resources.filter((r) => {
    if (resTypeFilter !== 'All' && r.type !== resTypeFilter) return false;
    if (!resSearch.trim()) return true;
    const q = resSearch.toLowerCase();
    return (
      r.title.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      (r.tags || []).some((t: string) => t.toLowerCase().includes(q))
    );
  });

  const filteredEvents = presentations.filter((ev) => {
    if (evTypeFilter !== 'All' && ev.type !== evTypeFilter) return false;
    if (!evSearch.trim()) return true;
    const q = evSearch.toLowerCase();
    return (
      ev.title.toLowerCase().includes(q) ||
      ev.topic.toLowerCase().includes(q) ||
      ev.presenter.toLowerCase().includes(q) ||
      ev.description.toLowerCase().includes(q)
    );
  });

  const filteredChallenges =
    challengeFilter === 'All'
      ? challenges
      : challenges.filter((c) => c.category === challengeFilter || c.difficulty === challengeFilter);

  const latestAnnouncement = announcementsList[0] || visiblePosts[0];
  const openHelpList = helpRequests.filter(
    (h) =>
      h.status !== 'Resolved' &&
      (!helpSearch.trim() ||
        `${h.helpNeeded} ${h.goal} ${h.author} ${h.field}`.toLowerCase().includes(helpSearch.toLowerCase()))
  );
  const resolvedHelpList = helpRequests.filter(
    (h) =>
      h.status === 'Resolved' &&
      (!helpSearch.trim() ||
        `${h.helpNeeded} ${h.goal} ${h.author} ${h.field}`.toLowerCase().includes(helpSearch.toLowerCase()))
  );

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return directoryMembers;
    return directoryMembers.filter((m) =>
      `${m.name} ${m.username || ''} ${m.field} ${m.level} ${m.role} ${(m.languages || []).join(' ')}`
        .toLowerCase()
        .includes(q)
    );
  }, [directoryMembers, memberSearch]);

  // Unified Home Discovery search results across all community entities
  const homeDiscovery = useMemo(() => {
    const q = homeQuery.trim().toLowerCase();
    if (!q) return null;
    return {
      posts: visiblePosts.filter((p) => `${p.title} ${p.content} ${p.author} ${(p.tags || []).join(' ')}`.toLowerCase().includes(q)).slice(0, 4),
      groups: studyGroups.filter((g) => `${g.name} ${g.topic} ${g.field}`.toLowerCase().includes(q)).slice(0, 3),
      resources: resources.filter((r) => `${r.title} ${r.category} ${r.description}`.toLowerCase().includes(q)).slice(0, 3),
      events: presentations.filter((ev) => `${ev.title} ${ev.topic} ${ev.presenter}`.toLowerCase().includes(q)).slice(0, 3),
      help: helpRequests.filter((h) => `${h.helpNeeded} ${h.goal} ${h.author}`.toLowerCase().includes(q)).slice(0, 3),
      members: directoryMembers.filter((m) => `${m.name} ${m.field} ${m.role}`.toLowerCase().includes(q)).slice(0, 4),
    };
  }, [homeQuery, visiblePosts, studyGroups, resources, presentations, helpRequests, directoryMembers]);

  // Controls styling
  const commBtn =
    'inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-lg text-sm whitespace-nowrap cursor-pointer transition-colors disabled:opacity-60';
  const commPrimary = `${commBtn} font-semibold bg-[var(--accent-600)] text-white hover:bg-[var(--accent-700)]`;
  const commSecondary = `${commBtn} font-medium border border-[var(--border-strong)] bg-transparent text-[var(--ink-primary)] hover:bg-[var(--surface-subtle)]`;
  const commInput =
    'w-full px-3.5 py-2.5 text-base rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--accent-600)] transition-colors';

  const headerAction =
    subTab === 'community' || subTab === 'community-home' ? (
      <button
        type="button"
        disabled={Boolean(mutedReason)}
        onClick={() => {
          if (subTab === 'community') {
            setEditingPost(null);
            setShowPostModal(true);
          } else {
            openComposerOnDiscussions(setSubTab);
          }
        }}
        className={btnPrimary}
      >
        <Plus className="w-3.5 h-3.5" /> Start a Discussion
      </button>
    ) : subTab === 'resources' ? (
      <button type="button" disabled={Boolean(mutedReason)} onClick={() => setShowAddRes(true)} className={btnPrimary}>
        <Plus className="w-3.5 h-3.5" /> Share Resource
      </button>
    ) : subTab === 'events' ? (
      <button type="button" disabled={Boolean(mutedReason)} onClick={() => setShowAddEvent(true)} className={btnPrimary}>
        <Plus className="w-3.5 h-3.5" /> Host Study Session
      </button>
    ) : subTab === 'challenges' ? (
      <button type="button" onClick={() => setShowSuggestCh(true)} className={btnPrimary}>
        <Plus className="w-3.5 h-3.5" /> Suggest a Challenge
      </button>
    ) : undefined;

  const activeNavTab: CommunitySubTab =
    subTab === 'announcements' || subTab === 'challenges' ? 'community-home' : subTab;

  return (
    <div data-tour="community-section" className="space-y-6">
      <PageHeader
        title="Community"
        description="Learn together with friendly beginners and peers—chat live in study rooms, collaborate in study groups, ask questions, share guides, or join sessions."
        action={headerAction}
      />

      {mutedReason && (
        <div role="status" className="p-4 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] text-sm text-[var(--danger-ink)] flex items-center gap-3">
          <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Your posting and chat actions are currently muted by a community moderator ({mutedReason}). You can still read discussions and view your notifications.</span>
        </div>
      )}

      {communityError && (
        <div role="alert" className="p-4 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] text-sm text-[var(--danger-ink)] flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            {communityError}
          </span>
          {onRetryCommunityLoad && (
            <button type="button" onClick={onRetryCommunityLoad} className={btnSecondary}>
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Retry
            </button>
          )}
        </div>
      )}

      <SectionTabs tabs={communityTabs} active={activeNavTab} onChange={setSubTab} />

      {/* 0A. LIVE STUDY GROUP CHAT */}
      {subTab === 'study-chat' && (
        <div className="space-y-5">
          <section className={`${cardClass} p-5 sm:p-6 space-y-4`}>
            <div className="space-y-1">
              <h2 className={`text-lg font-semibold ${textPrimary}`}>Find a member</h2>
              <p className={`text-sm ${textSecondary}`}>Search the Dev Hub directory and start a private conversation.</p>
            </div>
            <div className="relative">
              <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${textSecondary}`} aria-hidden="true" />
              <input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Search by name, username, or skill..." className={`${inputClass} !pl-10 min-h-11 w-full`} />
            </div>
            {(() => {
              const q = memberSearch.trim().toLowerCase();
              const candidates = Object.values(memberProfiles).filter((m) => m.id !== currentUserId && (!q || [m.name, m.username, m.field, m.bio].join(' ').toLowerCase().includes(q))).slice(0, 8);
              return candidates.length ? <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{candidates.map((member) => (
                <div key={member.id} className={`flex items-center justify-between gap-3 rounded-xl border ${borderClass} p-3`}>
                  <button type="button" onClick={() => onOpenMemberProfile?.(member.id, member.name)} className="min-w-0 text-left">
                    <span className={`block font-medium truncate ${textPrimary}`}>{member.name}</span>
                    <span className={`block text-xs truncate ${textSecondary}`}>{member.field || member.username || 'Dev Hub member'}</span>
                  </button>
                  <button type="button" disabled={startingDm === member.id} onClick={async () => {
                    setStartingDm(member.id);
                    try {
                      const result = await apiOpenDirectChat({ userId: currentUserId, userName: currentUserName }, member.id, member.name);
                      upsertRoomAndOpen(result.room);
                    } catch (err: any) { onNotify(err?.message || 'Could not start conversation.', 'error'); }
                    finally { setStartingDm(null); }
                  }} className={`${btnSecondary} shrink-0 !min-h-9 !px-3`}><MessageSquare className="w-4 h-4" /> Message</button>
                </div>
              ))}</div> : <p className={`text-sm ${textSecondary}`}>{q ? 'No members match that search.' : 'Member profiles will appear here as people join Dev Hub.'}</p>;
            })()}
          </section>
          <StudyGroupChatPanel
          styles={styles}
          currentUserId={currentUserId}
          isAdmin={isAdminMode}
          mutedReason={mutedReason}
          mentionCandidates={mentionCandidates}
          onReportMessage={
            onReportContent
              ? (msg: StudyChatMessage) =>
                  onReportContent({
                    targetType: 'chat',
                    targetId: msg.id,
                    roomId: msg.roomId,
                    targetAuthorId: msg.senderId,
                    targetAuthorName: msg.senderName,
                    targetPreview: msg.text || msg.codeSnippet || '[Message]',
                  })
              : undefined
          }
          onSelectMember={(id, name) => onOpenMemberProfile?.(id, name)}
          />
        </div>
      )}

      {/* 0B. STUDY GROUPS */}
      {subTab === 'study-groups' && (
        <StudyGroupsPanel
          groups={studyGroups}
          loading={communityLoading}
          currentUserId={currentUserId}
          currentUserField={profile.field}
          mutedReason={mutedReason}
          onCreateGroup={async (input) => {
            if (actions) return actions.createStudyGroup(input);
            return null;
          }}
          onToggleJoinGroup={async (groupId) => {
            if (actions) await actions.toggleJoinStudyGroup(groupId);
          }}
          onRemoveMember={async (groupId, memberId) => {
            if (actions) await actions.removeStudyGroupMember(groupId, memberId);
          }}
          onUpdateWorkspace={async (groupId, input) => {
            if (actions) await actions.updateStudyGroupWorkspace(groupId, input);
          }}
          onOpenGroupChat={(group) => {
            upsertRoomAndOpen({
              id: group.roomId,
              name: group.name,
              topic: `${group.field} · ${group.topic}`,
              groupId: group.id,
            });
            setSubTab('study-chat');
          }}
          onSelectMember={(id, name) => onOpenMemberProfile?.(id, name)}
          styles={styles}
        />
      )}

      {/* 0. COMMUNITY HOME OVERVIEW */}
      {subTab === 'community-home' && (
        <div className="space-y-6">
          {/* Unified Discovery Search */}
          <div className="relative">
            <label htmlFor="community-global-search" className="sr-only">
              Search across discussions, study groups, resources, events, help questions, and members
            </label>
            <Search className={`w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 ${textSecondary}`} aria-hidden="true" />
            <input
              id="community-global-search"
              type="search"
              value={homeQuery}
              onChange={(e) => setHomeQuery(e.target.value)}
              placeholder="Search discussions, tags, study groups, resources, events, or members..."
              className={`${commInput} !pl-11 !h-12 !rounded-full`}
            />
          </div>

          {homeDiscovery ? (
            <div className={`${cardClass} p-6 space-y-5`}>
              <div className="flex items-center justify-between gap-2">
                <h2 className={`text-lg font-display ${textPrimary}`}>
                  Discovery results for “{homeQuery.trim()}”
                </h2>
                <button
                  type="button"
                  onClick={() => setHomeQuery('')}
                  className="text-xs font-medium text-[var(--accent-600)] hover:underline cursor-pointer"
                >
                  Clear search
                </button>
              </div>

              {homeDiscovery.posts.length === 0 &&
              homeDiscovery.groups.length === 0 &&
              homeDiscovery.resources.length === 0 &&
              homeDiscovery.events.length === 0 &&
              homeDiscovery.help.length === 0 &&
              homeDiscovery.members.length === 0 ? (
                <EmptyState
                  title="Nothing matches that search yet"
                  description="Try a shorter keyword like React, SQL, CSS, or a member's name."
                  actionLabel="Clear search"
                  onAction={() => setHomeQuery('')}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {homeDiscovery.posts.length > 0 && (
                    <div className="space-y-2">
                      <h3 className={`text-xs font-semibold uppercase tracking-wider ${textSecondary}`}>Discussions</h3>
                      <ul className="space-y-2">
                        {homeDiscovery.posts.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setPostSearch(homeQuery);
                                setSubTab('community');
                              }}
                              className={`w-full text-left p-3 rounded-xl ${subtleBgClass} hover:bg-[var(--accent-50)] cursor-pointer`}
                            >
                              <div className="text-xs font-semibold text-[var(--accent-600)]">{p.category} · {p.author}</div>
                              <div className={`text-sm font-medium ${textPrimary} truncate`}>{p.title}</div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {homeDiscovery.groups.length > 0 && (
                    <div className="space-y-2">
                      <h3 className={`text-xs font-semibold uppercase tracking-wider ${textSecondary}`}>Study Groups</h3>
                      <ul className="space-y-2">
                        {homeDiscovery.groups.map((g) => (
                          <li key={g.id}>
                            <button
                              type="button"
                              onClick={() => setSubTab('study-groups')}
                              className={`w-full text-left p-3 rounded-xl ${subtleBgClass} hover:bg-[var(--accent-50)] cursor-pointer`}
                            >
                              <div className="text-xs font-semibold text-[var(--accent-600)]">{g.field} · {g.memberIds.length} members</div>
                              <div className={`text-sm font-medium ${textPrimary} truncate`}>{g.name}</div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {homeDiscovery.members.length > 0 && (
                    <div className="space-y-2">
                      <h3 className={`text-xs font-semibold uppercase tracking-wider ${textSecondary}`}>Members</h3>
                      <ul className="space-y-2">
                        {homeDiscovery.members.map((m) => (
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() => onOpenMemberProfile?.(m.id, m.name)}
                              className={`w-full text-left p-3 rounded-xl ${subtleBgClass} hover:bg-[var(--accent-50)] cursor-pointer flex items-center justify-between`}
                            >
                              <span className={`text-sm font-medium ${textPrimary}`}>{m.name}</span>
                              <span className={`text-xs ${textSecondary}`}>{m.field || m.role}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(homeDiscovery.resources.length > 0 || homeDiscovery.events.length > 0 || homeDiscovery.help.length > 0) && (
                    <div className="space-y-2">
                      <h3 className={`text-xs font-semibold uppercase tracking-wider ${textSecondary}`}>Resources, Events & Help</h3>
                      <ul className="space-y-2">
                        {homeDiscovery.resources.map((r) => (
                          <li key={r.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setResSearch(homeQuery);
                                setSubTab('resources');
                              }}
                              className={`w-full text-left p-3 rounded-xl ${subtleBgClass} hover:bg-[var(--accent-50)] cursor-pointer`}
                            >
                              <div className="text-xs font-semibold text-[var(--accent-600)]">Resource · {r.type}</div>
                              <div className={`text-sm font-medium ${textPrimary} truncate`}>{r.title}</div>
                            </button>
                          </li>
                        ))}
                        {homeDiscovery.events.map((ev) => (
                          <li key={ev.id}>
                            <button
                              type="button"
                              onClick={() => setSubTab('events')}
                              className={`w-full text-left p-3 rounded-xl ${subtleBgClass} hover:bg-[var(--accent-50)] cursor-pointer`}
                            >
                              <div className="text-xs font-semibold text-[var(--accent-600)]">Event · {ev.dateTime}</div>
                              <div className={`text-sm font-medium ${textPrimary} truncate`}>{ev.title}</div>
                            </button>
                          </li>
                        ))}
                        {homeDiscovery.help.map((h) => (
                          <li key={h.id}>
                            <button
                              type="button"
                              onClick={() => setSubTab('pairing-help')}
                              className={`w-full text-left p-3 rounded-xl ${subtleBgClass} hover:bg-[var(--accent-50)] cursor-pointer`}
                            >
                              <div className="text-xs font-semibold text-[var(--accent-600)]">Help Desk · {h.status}</div>
                              <div className={`text-sm font-medium ${textPrimary} truncate`}>{h.helpNeeded}</div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : communityLoading ? (
            <div className="space-y-4">
              <SkeletonBlock className="h-28 w-full" />
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 space-y-3">
                  <SkeletonBlock className="h-24 w-full" />
                  <SkeletonBlock className="h-24 w-full" />
                </div>
                <div className="lg:col-span-4 space-y-3">
                  <SkeletonBlock className="h-36 w-full" />
                </div>
              </div>
            </div>
          ) : (
            <>
              {latestAnnouncement && (
                <button
                  type="button"
                  onClick={() => setSubTab('announcements')}
                  className={`${cardClass} studio-card-interactive w-full text-left flex items-start gap-4 p-5 cursor-pointer border-l-[6px] border-l-[var(--spark)]`}
                >
                  <Megaphone className="w-5 h-5 text-[var(--accent-600)] shrink-0 mt-1" />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className={`block text-xs ${textSecondary}`}>Pinned announcement · {latestAnnouncement.timestamp}</span>
                    <span className={`block text-lg font-display ${textPrimary}`}>{latestAnnouncement.title}</span>
                    <span className={`block text-sm line-clamp-2 max-w-[70ch] ${textSecondary}`}>{latestAnnouncement.content}</span>
                  </span>
                  <ArrowRight className="w-4 h-4 mt-1 shrink-0 text-[var(--accent-600)]" />
                </button>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Feed */}
                <section className="lg:col-span-8 space-y-4 min-w-0">
                  <div className="flex items-end justify-between">
                    <h2 className={`text-xl ${textPrimary}`}>Recent discussions</h2>
                    <button
                      type="button"
                      onClick={() => setSubTab('community')}
                      className="text-sm font-medium text-[var(--accent-600)] hover:underline cursor-pointer"
                    >
                      View all discussions
                    </button>
                  </div>
                  {visiblePosts.length === 0 && (
                    <EmptyState
                      title="No discussions yet"
                      description="Be the first to ask a question or share a small win."
                      actionLabel="Start a Discussion"
                      onAction={() => openComposerOnDiscussions(setSubTab)}
                    />
                  )}
                  <ul className="space-y-3 sm:space-y-4">
                    {visiblePosts.slice(0, 5).map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setSubTab('community')}
                          className={`${cardClass} studio-card-interactive w-full text-left p-4 flex gap-4 items-start cursor-pointer`}
                        >
                          <span aria-hidden="true" className="w-10 h-10 rounded-full bg-[var(--accent-100)] text-[var(--accent-700)] text-sm font-semibold flex items-center justify-center shrink-0">
                            {(p.author || '?').slice(0, 1).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-xs ${textSecondary}`}>
                              {p.pinned && <span className="font-semibold text-[var(--accent-600)] mr-1">Pinned ·</span>}
                              {p.author} posted in <span className="font-semibold text-[var(--accent-600)]">{p.category}</span> · {p.timestamp}
                            </span>
                            <span className={`block text-base font-semibold leading-snug mt-0.5 ${textPrimary}`}>{p.title}</span>
                          </span>
                          <span className={`inline-flex items-center gap-1 text-xs tabular-nums shrink-0 ${textSecondary}`}>
                            <MessageSquare className="w-3.5 h-3.5" /> {p.comments.filter((c) => !c.hidden).length}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* Rail */}
                <aside className="lg:col-span-4 space-y-4 min-w-0">
                  {presentations[0] && (
                    <section className={`${cardClass} p-5 sm:p-6 space-y-3`}>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-600)]">
                        <Calendar className="w-3.5 h-3.5" /> Next session · {presentations[0].dateTime}
                      </div>
                      <h3 className={`text-lg ${textPrimary}`}>{presentations[0].title}</h3>
                      <p className={`text-sm line-clamp-3 ${textSecondary}`}>{presentations[0].description}</p>
                      <button type="button" onClick={() => setSubTab('events')} className={btnSecondary}>
                        All events ({presentations.length})
                      </button>
                    </section>
                  )}

                  <section className={`${cardClass} p-5 sm:p-6 space-y-3`}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[var(--accent-600)] inline-flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" /> Study groups
                      </span>
                      <span className="tabular-nums text-[var(--ink-secondary)]">{studyGroups.length} active</span>
                    </div>
                    <h3 className={`text-lg ${textPrimary}`}>
                      {studyGroups[0] ? studyGroups[0].name : 'Collaborate in small groups'}
                    </h3>
                    <p className={`text-sm line-clamp-2 ${textSecondary}`}>
                      {studyGroups[0]
                        ? `${studyGroups[0].topic} · ${studyGroups[0].memberIds.length} members`
                        : 'Join or create a topic study circle with shared goals, links, and group chat.'}
                    </p>
                    <button type="button" onClick={() => setSubTab('study-groups')} className={btnSecondary}>
                      Browse study groups
                    </button>
                  </section>

                  {challenges[0] && (
                    <section className={`${cardClass} p-5 sm:p-6 space-y-3`}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[var(--accent-600)] inline-flex items-center gap-1.5">
                          <Trophy className="w-3.5 h-3.5" /> Weekly challenge
                        </span>
                        <span className={textSecondary}>{challenges[0].difficulty}</span>
                      </div>
                      <h3 className={`text-lg ${textPrimary}`}>{challenges[0].title}</h3>
                      <p className={`text-sm line-clamp-3 ${textSecondary}`}>{challenges[0].description}</p>
                      <button type="button" onClick={() => setSubTab('challenges')} className={btnSecondary}>
                        Try it
                      </button>
                    </section>
                  )}

                  <section className={`${cardClass} p-5 sm:p-6 space-y-4 bg-[var(--accent-50)]`}>
                    <div>
                      <h3 className={`text-lg ${textPrimary}`}>Peer help & study chat</h3>
                      <p className={`text-sm ${textSecondary}`}>
                        {openHelpList.length} open question{openHelpList.length === 1 ? '' : 's'} · {directoryMembers.length} members
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setSubTab('pairing-help')} className={btnPrimary}>
                        Ask or help
                      </button>
                      <button type="button" onClick={() => setSubTab('study-chat')} className={btnSecondary}>
                        Live study chat
                      </button>
                    </div>
                  </section>
                </aside>
              </div>
            </>
          )}
        </div>
      )}

      {/* 1. DISCUSSIONS */}
      {subTab === 'community' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <nav aria-label="Discussion categories" className="lg:col-span-3 lg:sticky lg:top-6 flex lg:flex-col gap-2 lg:gap-1.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1 lg:mx-0 lg:px-0">
            {['All', 'Announcement', 'Question', 'Small Win', 'Mistake & Lesson', 'Explain a Concept', 'Study Session Idea', 'Saved'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setPostFilter(cat)}
                aria-pressed={postFilter === cat}
                className={`px-3.5 min-h-[40px] rounded-full lg:rounded-lg text-sm font-medium cursor-pointer whitespace-nowrap shrink-0 text-left border lg:border-0 lg:border-l-4 transition-colors flex items-center justify-between gap-3 ${
                  postFilter === cat
                    ? 'bg-[var(--accent-50)] border-[var(--spark)] text-[var(--ink-primary)] font-semibold'
                    : `border-[var(--border-hairline)] lg:border-transparent hover:bg-[var(--surface-subtle)] ${textSecondary}`
                }`}
              >
                <span>{cat}</span>
                <span className={`text-xs tabular-nums ${postFilter === cat ? 'text-[var(--accent-700)]' : textSecondary}`}>
                  {visiblePosts.filter((p) => inCategory(p, cat)).length}
                </span>
              </button>
            ))}
          </nav>

          <div className="lg:col-span-9 space-y-4 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
              <label className="relative flex-1 min-w-0">
                <span className="sr-only">Search discussions</span>
                <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${textSecondary}`} aria-hidden="true" />
                <input
                  type="search"
                  value={postSearch}
                  onChange={(e) => setPostSearch(e.target.value)}
                  placeholder="Search discussions, tags, or authors..."
                  className={`${commInput} !pl-10 min-h-11`}
                />
              </label>
              <div role="group" aria-label="Sort discussions" className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 sm:mx-0 sm:px-0">
                {([
                  ['new', 'Newest'],
                  ['helpful', 'Most helpful'],
                  ['discussed', 'Most discussed'],
                  ['unanswered', 'Unanswered'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={postSort === id}
                    onClick={() => setPostSort(id)}
                    className={`shrink-0 px-3.5 min-h-[40px] rounded-full text-sm font-medium cursor-pointer border transition-colors ${
                      postSort === id
                        ? 'bg-[var(--accent-50)] border-[var(--spark)] text-[var(--ink-primary)] font-semibold'
                        : `border-[var(--border-hairline)] hover:bg-[var(--surface-subtle)] ${textSecondary}`
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {availableTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`inline-flex items-center gap-1 text-xs mr-1 ${textSecondary}`}>
                  <Tag className="w-3.5 h-3.5" aria-hidden="true" /> Tags:
                </span>
                <button
                  type="button"
                  onClick={() => setTagFilter('All')}
                  className={`px-2.5 min-h-[30px] rounded-md text-xs font-medium cursor-pointer transition-colors ${
                    tagFilter === 'All'
                      ? 'bg-[var(--accent-600)] text-white'
                      : 'bg-[var(--surface-subtle)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  All
                </button>
                {availableTags.slice(0, 12).map(({ tag, count }) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setTagFilter(tagFilter === tag ? 'All' : tag)}
                    className={`px-2.5 min-h-[30px] rounded-md text-xs font-medium cursor-pointer transition-colors ${
                      tagFilter === tag
                        ? 'bg-[var(--accent-600)] text-white'
                        : 'bg-[var(--surface-subtle)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                    }`}
                  >
                    #{tag} <span className="opacity-70 tabular-nums">{count}</span>
                  </button>
                ))}
                {(postFilter !== 'All' || tagFilter !== 'All' || postQuery || postSort !== 'new') && (
                  <button
                    type="button"
                    onClick={() => {
                      setPostFilter('All');
                      setTagFilter('All');
                      setPostSearch('');
                      setPostSort('new');
                    }}
                    className="ml-auto text-xs font-medium text-[var(--accent-600)] hover:underline cursor-pointer"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}

            {communityLoading ? (
              <div className="space-y-4">
                <SkeletonBlock className="h-44 w-full" />
                <SkeletonBlock className="h-44 w-full" />
              </div>
            ) : discussionPosts.length === 0 ? (
              <EmptyState
                title={postQuery || postSort === 'unanswered' || tagFilter !== 'All' ? 'Nothing matches yet' : 'No discussions here yet'}
                description={
                  postQuery || postSort === 'unanswered' || tagFilter !== 'All'
                    ? 'Try a different keyword, or clear the filters to see everything.'
                    : 'Start a friendly question, celebrate a small win, or share something you figured out today.'
                }
                actionLabel={postQuery || tagFilter !== 'All' ? 'Clear filters' : 'Start a Discussion'}
                onAction={() => {
                  if (postQuery || tagFilter !== 'All' || postSort !== 'new') {
                    setPostFilter('All');
                    setTagFilter('All');
                    setPostSearch('');
                    setPostSort('new');
                  } else {
                    setShowPostModal(true);
                  }
                }}
              />
            ) : (
              discussionPosts.map((post) => {
                const isSaved = savedPostIds.includes(post.id);
                const isAuthor = post.authorId === currentUserId || (!post.authorId && post.author === currentUserName);
                const canModify = isAuthor || isAdminMode;
                const helpfulList = post.reactions?.helpful || [];
                const insightfulList = post.reactions?.insightful || [];
                const celebrateList = post.reactions?.celebrate || [];
                const helpfulCount = Math.max(helpfulList.length, !post.reactions ? post.likes : 0);

                const allVisibleComments = post.comments.filter((c) => isAdminMode || !c.hidden);
                const topComments = allVisibleComments
                  .filter((c) => !c.parentId)
                  .sort((a, b) => Number(!!b.isHelpful) - Number(!!a.isHelpful));
                const repliesByParent = new Map<string, CommunityPostComment[]>();
                for (const c of allVisibleComments) {
                  if (c.parentId) {
                    const arr = repliesByParent.get(c.parentId) || [];
                    arr.push(c);
                    repliesByParent.set(c.parentId, arr);
                  }
                }
                const activeParentReply = replyParentByPost[post.id] || null;

                return (
                  <article
                    key={post.id}
                    id={`community-post-${post.id}`}
                    className={`${cardClass} p-5 sm:p-6 space-y-3.5 ${post.pinned ? 'border-l-4 !border-l-[var(--spark)]' : ''} ${post.hidden ? 'opacity-65' : ''}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        {post.pinned && (
                          <span className="inline-flex items-center gap-1 font-semibold text-[var(--accent-600)]">
                            <Pin className="w-3.5 h-3.5" aria-hidden="true" /> Pinned
                          </span>
                        )}
                        {post.locked && <Badge variant="warning"><Lock className="w-3 h-3" /> Locked</Badge>}
                        {post.hidden && <Badge variant="danger">Hidden by Moderator</Badge>}
                        <span className="font-semibold text-[var(--accent-600)]">{post.category}</span>
                        <span className={textSecondary}>
                          ·{' '}
                          <button
                            type="button"
                            onClick={() => onOpenMemberProfile?.(post.authorId || post.author, post.author)}
                            className="font-medium hover:text-[var(--accent-600)] hover:underline cursor-pointer"
                          >
                            {post.author}
                          </button>{' '}
                          ({post.role})
                        </span>
                        <span className={textSecondary}>· {post.timestamp}</span>
                        {post.updatedAt && <span className={textSecondary}>(edited)</span>}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleSavePost(post.id)}
                          aria-pressed={isSaved}
                          className={`inline-flex items-center gap-1 min-h-[32px] px-1.5 text-xs cursor-pointer ${
                            isSaved ? 'text-[var(--accent-600)] font-semibold' : textSecondary
                          }`}
                        >
                          <Bookmark className="w-3.5 h-3.5" /> {isSaved ? 'Saved' : 'Save'}
                        </button>

                        {canModify && !mutedReason && (
                          <button
                            type="button"
                            onClick={() => openEditPostModal(post)}
                            className={`inline-flex items-center gap-1 min-h-[32px] px-1.5 text-xs ${textSecondary} hover:text-[var(--accent-600)] cursor-pointer`}
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Edit
                          </button>
                        )}

                        {canModify && (
                          confirmDeletePostId === post.id ? (
                            <span className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (actions) await actions.deletePost(post.id);
                                  else setPosts(posts.filter((x) => x.id !== post.id));
                                  setConfirmDeletePostId(null);
                                }}
                                className="px-2 py-1 rounded text-xs font-semibold bg-[var(--danger-bg)] text-[var(--danger-ink)] cursor-pointer"
                              >
                                Confirm delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeletePostId(null)}
                                className={`text-xs ${textSecondary} cursor-pointer`}
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeletePostId(post.id)}
                              className={`inline-flex items-center gap-1 min-h-[32px] px-1.5 text-xs ${textSecondary} hover:text-[var(--danger-ink)] cursor-pointer`}
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                          )
                        )}

                        {!isAuthor && onReportContent && (
                          <button
                            type="button"
                            onClick={() =>
                              onReportContent({
                                targetType: 'post',
                                targetId: post.id,
                                targetAuthorId: post.authorId,
                                targetAuthorName: post.author,
                                targetPreview: `${post.title}: ${post.content}`,
                              })
                            }
                            className={`inline-flex items-center gap-1 min-h-[32px] px-1.5 text-xs ${textSecondary} hover:text-[var(--warning-ink)] cursor-pointer`}
                          >
                            <Flag className="w-3.5 h-3.5" /> Report
                          </button>
                        )}
                      </div>
                    </div>

                    <h2 className={`text-xl ${textPrimary}`}>{post.title}</h2>
                    <PostBody text={post.content} className={`text-sm leading-relaxed ${textSecondary}`} />

                    {post.tags && post.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {post.tags.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setTagFilter(tagFilter === t ? 'All' : t)}
                            className={`px-2 py-0.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                              tagFilter === t
                                ? 'bg-[var(--accent-600)] text-white'
                                : 'bg-[var(--surface-subtle)] text-[var(--accent-700)] hover:bg-[var(--accent-50)]'
                            }`}
                          >
                            #{t}
                          </button>
                        ))}
                      </div>
                    )}

                    {post.codeSnippet && (
                      <pre className={`p-3.5 rounded-lg border ${borderClass} ${subtleBgClass} font-mono text-xs overflow-x-auto ${textPrimary}`}>
                        {post.codeSnippet}
                      </pre>
                    )}

                    {post.attachmentUrl && (
                      <a
                        href={post.attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent-600)] hover:underline"
                      >
                        {post.attachmentUrl} <ExternalLink className="w-3 h-3" />
                      </a>
                    )}

                    {/* Multi-Reactions & Admin Moderation Strip */}
                    <div className={`pt-2 flex flex-wrap items-center justify-between gap-3 text-xs ${textSecondary}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleReaction(post, 'helpful')}
                          aria-pressed={helpfulList.includes(currentUserId)}
                          className={`inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-full border cursor-pointer tabular-nums transition-colors ${
                            helpfulList.includes(currentUserId)
                              ? 'border-[var(--accent-600)] bg-[var(--accent-50)] text-[var(--accent-700)] font-semibold'
                              : `${borderClass} hover:bg-[var(--surface-subtle)]`
                          }`}
                        >
                          <ThumbsUp className="w-3.5 h-3.5" /> Helpful ({helpfulCount})
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReaction(post, 'insightful')}
                          aria-pressed={insightfulList.includes(currentUserId)}
                          className={`inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-full border cursor-pointer tabular-nums transition-colors ${
                            insightfulList.includes(currentUserId)
                              ? 'border-[var(--accent-600)] bg-[var(--accent-50)] text-[var(--accent-700)] font-semibold'
                              : `${borderClass} hover:bg-[var(--surface-subtle)]`
                          }`}
                        >
                          <Lightbulb className="w-3.5 h-3.5" /> Insightful ({insightfulList.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReaction(post, 'celebrate')}
                          aria-pressed={celebrateList.includes(currentUserId)}
                          className={`inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-full border cursor-pointer tabular-nums transition-colors ${
                            celebrateList.includes(currentUserId)
                              ? 'border-[var(--accent-600)] bg-[var(--accent-50)] text-[var(--accent-700)] font-semibold'
                              : `${borderClass} hover:bg-[var(--surface-subtle)]`
                          }`}
                        >
                          <Sparkles className="w-3.5 h-3.5" /> Celebrate ({celebrateList.length})
                        </button>
                        <span className="inline-flex items-center gap-1.5 tabular-nums px-1">
                          <MessageSquare className="w-3.5 h-3.5" /> {allVisibleComments.length}{' '}
                          {allVisibleComments.length === 1 ? 'reply' : 'replies'}
                        </span>
                      </div>

                      {isAdminMode && actions && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => actions.moderatePost(post.id, { pinned: !post.pinned })}
                            className="px-2.5 min-h-[30px] rounded-md border border-[var(--border-hairline)] hover:bg-[var(--surface-subtle)] text-xs cursor-pointer inline-flex items-center gap-1"
                          >
                            <Pin className="w-3 h-3" /> {post.pinned ? 'Unpin' : 'Pin'}
                          </button>
                          <button
                            type="button"
                            onClick={() => actions.moderatePost(post.id, { locked: !post.locked })}
                            className="px-2.5 min-h-[30px] rounded-md border border-[var(--border-hairline)] hover:bg-[var(--surface-subtle)] text-xs cursor-pointer inline-flex items-center gap-1"
                          >
                            {post.locked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                            {post.locked ? 'Unlock' : 'Lock'}
                          </button>
                          <button
                            type="button"
                            onClick={() => actions.moderatePost(post.id, { hidden: !post.hidden })}
                            className="px-2.5 min-h-[30px] rounded-md border border-[var(--border-hairline)] hover:bg-[var(--surface-subtle)] text-xs cursor-pointer inline-flex items-center gap-1"
                          >
                            <EyeOff className="w-3 h-3" /> {post.hidden ? 'Restore' : 'Hide'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Replies & Nested Comments */}
                    <details open={allVisibleComments.length > 0 && allVisibleComments.length <= 4} className={`pt-3 border-t ${borderClass} group`}>
                      <summary className={`list-none cursor-pointer text-sm font-semibold flex items-center gap-1.5 [&::-webkit-details-marker]:hidden ${textPrimary}`}>
                        <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-[var(--accent-600)]" />
                        {allVisibleComments.length === 0
                          ? post.locked
                            ? 'Replies locked'
                            : 'Be the first to reply'
                          : `${allVisibleComments.length} repl${allVisibleComments.length === 1 ? 'y' : 'ies'}`}
                      </summary>

                      <div className="space-y-3 mt-3">
                        {topComments.map((c) => {
                          const childReplies = repliesByParent.get(c.id) || [];
                          const renderCommentRow = (comment: CommunityPostComment, isNested: boolean) => {
                            const isCommentAuthor =
                              comment.authorId === currentUserId || (!comment.authorId && comment.author === currentUserName);
                            const canModComment = isCommentAuthor || isAdminMode;
                            const isEditingThis =
                              editingComment?.postId === post.id && editingComment?.commentId === comment.id;

                            return (
                              <div
                                key={comment.id}
                                className={`py-2.5 px-3 rounded-lg ${subtleBgClass} space-y-1.5 ${
                                  isNested ? 'ml-6 border-l-2 border-[var(--accent-500)]/40' : ''
                                } ${comment.hidden ? 'opacity-60' : ''}`}
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2 text-xs">
                                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                                    <button
                                      type="button"
                                      onClick={() => onOpenMemberProfile?.(comment.authorId || comment.author, comment.author)}
                                      className={`font-semibold hover:text-[var(--accent-600)] hover:underline cursor-pointer ${textPrimary}`}
                                    >
                                      {comment.author}
                                    </button>
                                    {comment.authorRole === 'Community Admin' && <Badge variant="info">Admin</Badge>}
                                    {comment.isHelpful && <Badge variant="success">Helpful answer</Badge>}
                                    {comment.hidden && <Badge variant="danger">Hidden</Badge>}
                                    {comment.updatedAt && <span className={textSecondary}>(edited)</span>}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        if (actions) {
                                          await actions.updateComment(post.id, comment.id, { toggleHelpful: true });
                                        } else {
                                          setPosts(
                                            posts.map((p) =>
                                              p.id === post.id
                                                ? {
                                                    ...p,
                                                    comments: p.comments.map((x) =>
                                                      x.id === comment.id ? { ...x, isHelpful: !x.isHelpful } : x
                                                    ),
                                                  }
                                                : p
                                            )
                                          );
                                        }
                                      }}
                                      className={`text-xs font-medium cursor-pointer ${
                                        comment.isHelpful ? 'text-[var(--success-ink)]' : 'text-[var(--accent-600)] hover:underline'
                                      }`}
                                    >
                                      {comment.isHelpful
                                        ? `Helpful ✓${comment.helpfulBy?.length ? ` (${comment.helpfulBy.length})` : ''}`
                                        : 'Mark helpful'}
                                    </button>

                                    {!post.locked && !mutedReason && !isNested && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setReplyParentByPost((prev) => ({ ...prev, [post.id]: comment }))
                                        }
                                        className={`inline-flex items-center gap-1 ${textSecondary} hover:text-[var(--accent-600)] cursor-pointer`}
                                      >
                                        <CornerUpLeft className="w-3 h-3" /> Reply
                                      </button>
                                    )}

                                    {isCommentAuthor && !mutedReason && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setEditingComment({ postId: post.id, commentId: comment.id, text: comment.text })
                                        }
                                        className={`${textSecondary} hover:text-[var(--accent-600)] cursor-pointer`}
                                      >
                                        Edit
                                      </button>
                                    )}

                                    {canModComment && (
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          if (actions) await actions.deleteComment(post.id, comment.id);
                                          else
                                            setPosts(
                                              posts.map((p) =>
                                                p.id === post.id
                                                  ? { ...p, comments: p.comments.filter((x) => x.id !== comment.id) }
                                                  : p
                                              )
                                            );
                                        }}
                                        className={`${textSecondary} hover:text-[var(--danger-ink)] cursor-pointer`}
                                      >
                                        Delete
                                      </button>
                                    )}

                                    {!isCommentAuthor && onReportContent && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onReportContent({
                                            targetType: 'comment',
                                            targetId: comment.id,
                                            parentId: post.id,
                                            targetAuthorId: comment.authorId,
                                            targetAuthorName: comment.author,
                                            targetPreview: comment.text,
                                          })
                                        }
                                        className={`${textSecondary} hover:text-[var(--warning-ink)] cursor-pointer`}
                                      >
                                        Report
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {isEditingThis ? (
                                  <form
                                    onSubmit={async (e) => {
                                      e.preventDefault();
                                      if (!editingComment.text.trim()) return;
                                      if (actions) {
                                        await actions.updateComment(post.id, comment.id, { text: editingComment.text.trim() });
                                      }
                                      setEditingComment(null);
                                    }}
                                    className="flex flex-col sm:flex-row gap-2 pt-1"
                                  >
                                    <input
                                      value={editingComment.text}
                                      onChange={(e) =>
                                        setEditingComment((prev) => (prev ? { ...prev, text: e.target.value } : null))
                                      }
                                      className={`${inputClass} flex-1 text-xs`}
                                    />
                                    <button type="submit" className={btnPrimary}>Save</button>
                                    <button type="button" onClick={() => setEditingComment(null)} className={btnSecondary}>
                                      Cancel
                                    </button>
                                  </form>
                                ) : (
                                  <p className={`text-xs leading-relaxed ${textSecondary} whitespace-pre-wrap break-words`}>
                                    <MentionText text={comment.text} />
                                  </p>
                                )}
                              </div>
                            );
                          };

                          return (
                            <div key={c.id} className="space-y-2">
                              {renderCommentRow(c, false)}
                              {childReplies.map((child) => renderCommentRow(child, true))}
                            </div>
                          );
                        })}

                        {post.locked ? (
                          <p className={`text-xs flex items-center gap-1.5 ${textSecondary}`}>
                            <Lock className="w-3.5 h-3.5" /> This thread is locked by a moderator.
                          </p>
                        ) : mutedReason ? (
                          <p className="text-xs text-[var(--danger-ink)]">Replying is disabled while your account is muted.</p>
                        ) : (
                          <div className="space-y-1.5 pt-1">
                            {activeParentReply && (
                              <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[var(--accent-50)] text-xs text-[var(--accent-700)]">
                                <span>
                                  Replying to <strong>{activeParentReply.author}</strong>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setReplyParentByPost((prev) => ({ ...prev, [post.id]: null }))}
                                  className="hover:underline cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}

                            <MentionPickerBar
                              value={replyDrafts[post.id] || ''}
                              candidates={mentionCandidates}
                              onPick={(next) => setReplyDrafts((prev) => ({ ...prev, [post.id]: next }))}
                            />

                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                handleAddReply(post.id);
                              }}
                              className="flex flex-col sm:flex-row gap-2"
                            >
                              <label htmlFor={`reply-${post.id}`} className="sr-only">Write a reply</label>
                              <input
                                id={`reply-${post.id}`}
                                value={replyDrafts[post.id] || ''}
                                onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                                maxLength={1500}
                                placeholder={
                                  activeParentReply
                                    ? `Reply to ${activeParentReply.author}… (use @ to mention)`
                                    : 'Write a helpful reply… (use @ to mention)'
                                }
                                className={`${inputClass} flex-1 min-w-0`}
                              />
                              <button type="submit" disabled={!(replyDrafts[post.id] || '').trim()} className={btnSecondary}>
                                Reply
                              </button>
                            </form>
                          </div>
                        )}
                      </div>
                    </details>
                  </article>
                );
              })
            )}
          </div>

          {/* Start / Edit Discussion Modal */}
          <Modal open={showPostModal} onClose={resetPostModal} title={editingPost ? 'Edit Discussion' : 'Start a Discussion'}>
            <form onSubmit={handleCreateOrSavePost} className="space-y-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className={textSecondary}>Ask basic questions, celebrate small wins, or explain what you learned.</span>
                {!editingPost && (postTitle.trim() || postBody.trim() || postCode.trim() || postLink.trim()) && (
                  <button
                    type="button"
                    onClick={() => {
                      setPostTitle('');
                      setPostBody('');
                      setPostTagsInput('');
                      setPostCode('');
                      setPostLink('');
                      try {
                        sessionStorage.removeItem(postDraftKey);
                      } catch {}
                    }}
                    className={`text-xs underline ${textSecondary} hover:text-[var(--danger-ink)] cursor-pointer shrink-0`}
                  >
                    Clear draft
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <select value={postCat} onChange={(e) => setPostCat(e.target.value)} className={inputClass}>
                  <option>Question</option>
                  <option>Small Win</option>
                  <option>Mistake & Lesson</option>
                  <option>Explain a Concept</option>
                  <option>Study Session Idea</option>
                  {isAdminMode && <option>Announcement</option>}
                </select>
                <input
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  placeholder="Clear title..."
                  className={`${inputClass} sm:col-span-2`}
                  required
                />
              </div>

              <MentionPickerBar
                value={postBody}
                candidates={mentionCandidates}
                onPick={(next) => setPostBody(next)}
              />
              <textarea
                rows={4}
                value={postBody}
                onChange={(e) => setPostBody(e.target.value)}
                placeholder="Write your question, win, or lesson learned… (type @ to mention a member)"
                className={inputClass}
                required
              />

              <div className="space-y-2">
                <input
                  value={postTagsInput}
                  onChange={(e) => setPostTagsInput(e.target.value)}
                  placeholder="Optional tags (comma-separated, e.g. react, css, debugging)"
                  className={inputClass}
                />
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_TAG_SUGGESTIONS.map((tag) => {
                    const active = parseTagsInput(postTagsInput).includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          const current = parseTagsInput(postTagsInput);
                          const next = active ? current.filter((t) => t !== tag) : [...current, tag].slice(0, 6);
                          setPostTagsInput(next.join(', '));
                        }}
                        className={`px-2 py-0.5 rounded text-xs cursor-pointer ${
                          active
                            ? 'bg-[var(--accent-600)] text-white'
                            : 'bg-[var(--surface-subtle)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                        }`}
                      >
                        #{tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {showPostExtras && (
                <div className="space-y-3">
                  <textarea
                    rows={3}
                    value={postCode}
                    onChange={(e) => setPostCode(e.target.value)}
                    placeholder="Optional code snippet..."
                    className={`${inputClass} font-mono text-xs`}
                  />
                  <div>
                    <input
                      value={postLink}
                      onChange={(e) => setPostLink(e.target.value)}
                      placeholder="Optional link or resource URL..."
                      className={inputClass}
                    />
                    {postLinkError && <p className="text-xs text-[var(--danger-ink)] mt-1">{postLinkError}</p>}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPostExtras((v) => !v)}
                  className="text-xs font-medium text-[var(--accent-600)] hover:underline cursor-pointer inline-flex items-center gap-1"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  {showPostExtras ? 'Hide code/link' : 'Attach code or link'}
                </button>
                <div className="flex gap-2">
                  <button type="button" onClick={resetPostModal} className={btnSecondary}>Cancel</button>
                  <button type="submit" className={btnPrimary}>
                    <Send className="w-3.5 h-3.5" /> {editingPost ? 'Save Changes' : 'Post Discussion'}
                  </button>
                </div>
              </div>
            </form>
          </Modal>
        </div>
      )}

      {/* 2. ANNOUNCEMENTS */}
      {subTab === 'announcements' && (
        <div className="space-y-8 max-w-3xl">
          {isAdminMode && (
            <form onSubmit={handleCreateOrSaveAnnouncement} className={`${cardClass} p-6 sm:p-6 space-y-4`}>
              <div className="flex items-center justify-between">
                <h2 className={`text-lg flex items-center gap-2 ${textPrimary}`}>
                  <Megaphone className="w-4 h-4 text-[var(--accent-600)]" aria-hidden="true" />
                  {editingAnn ? 'Edit announcement' : 'Post an announcement'}
                </h2>
                {editingAnn && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAnn(null);
                      setAnnTitle('');
                      setAnnBody('');
                    }}
                    className="text-xs text-[var(--ink-secondary)] hover:underline cursor-pointer"
                  >
                    Cancel edit
                  </button>
                )}
              </div>
              <div>
                <label htmlFor="ann-title" className={`block text-sm font-medium mb-1.5 ${textPrimary}`}>Title</label>
                <input id="ann-title" value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} placeholder="What’s the update?" className={`${commInput} min-h-11`} required />
              </div>
              <div>
                <label htmlFor="ann-body" className={`block text-sm font-medium mb-1.5 ${textPrimary}`}>Message</label>
                <textarea id="ann-body" rows={3} value={annBody} onChange={(e) => setAnnBody(e.target.value)} placeholder="Write it in clear, welcoming language" className={commInput} required />
              </div>
              <button type="submit" className={commPrimary}>
                {editingAnn ? 'Save announcement' : 'Publish announcement'}
              </button>
            </form>
          )}

          {announcementsList.length === 0 ? (
            <EmptyState title="No announcements yet" description="Important community updates will show up here as soon as a team lead posts one." />
          ) : (
            (() => {
              const ordered = [...announcementsList.filter((a) => a.pinned), ...announcementsList.filter((a) => !a.pinned)];
              const [lead, ...rest] = ordered;
              const renderAdminAnnActions = (a: CommunityPost) =>
                isAdminMode && actions ? (
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAnn(a);
                        setAnnTitle(a.title);
                        setAnnBody(a.content);
                      }}
                      className="text-xs font-medium text-[var(--accent-600)] hover:underline cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => actions.moderatePost(a.id, { pinned: !a.pinned })}
                      className="text-xs font-medium text-[var(--ink-secondary)] hover:text-[var(--accent-600)] cursor-pointer"
                    >
                      {a.pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                      type="button"
                      onClick={() => actions.deletePost(a.id)}
                      className="text-xs font-medium text-[var(--danger-ink)] hover:underline cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                ) : null;

              return (
                <>
                  <article className={`${cardClass} p-6 sm:p-8 space-y-4 border-l-4 !border-l-[var(--spark)]`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-sm ${textSecondary}`}>
                        <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--accent-600)]">
                          <Pin className="w-3.5 h-3.5" aria-hidden="true" /> {lead.pinned ? 'Pinned' : lead.category}
                        </span>
                        <span>· {lead.author} · {lead.timestamp}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => handleReaction(lead, 'celebrate')}
                        className="text-xs font-medium text-[var(--accent-600)] hover:underline cursor-pointer"
                      >
                        Acknowledge ({(lead.reactions?.celebrate || []).length})
                      </button>
                    </div>
                    <h2 className={`font-display text-xl sm:text-2xl max-w-[40ch] ${textPrimary}`}>{lead.title}</h2>
                    <p className={`text-base leading-relaxed max-w-[66ch] whitespace-pre-wrap ${textPrimary}`}>{lead.content}</p>
                    {renderAdminAnnActions(lead)}
                  </article>

                  {rest.length > 0 && (
                    <section aria-labelledby="ann-earlier" className="space-y-1">
                      <h2 id="ann-earlier" className={`text-lg mb-2 ${textPrimary}`}>Earlier updates</h2>
                      <ul className={`divide-y ${borderClass} border-y ${borderClass}`}>
                        {rest.map((a) => (
                          <li key={a.id} className="py-5 space-y-2">
                            <p className={`flex flex-wrap items-center gap-x-2 text-sm ${textSecondary}`}>
                              {a.pinned && <Pin className="w-3.5 h-3.5 text-[var(--accent-600)]" aria-label="Pinned" />}
                              <span className="font-semibold text-[var(--accent-600)]">{a.category}</span>
                              <span>· {a.author} · {a.timestamp}</span>
                            </p>
                            <h3 className={`text-lg ${textPrimary}`}>{a.title}</h3>
                            <p className={`text-base leading-relaxed max-w-[66ch] ${textSecondary}`}>{a.content}</p>
                            {renderAdminAnnActions(a)}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </>
              );
            })()
          )}
        </div>
      )}

      {/* 3. LEARNING RESOURCES (WITH LIVE WEB SEARCH) */}
      {subTab === 'resources' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          <div className="lg:col-span-8 space-y-5 min-w-0">
            <div className="space-y-3">
              <label htmlFor="res-filter" className="sr-only">Filter the resource library</label>
              <div className="relative">
                <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${textSecondary}`} aria-hidden="true" />
                <input
                  id="res-filter"
                  type="search"
                  value={resSearch}
                  onChange={(e) => setResSearch(e.target.value)}
                  placeholder="Search the library by title, field or topic"
                  className={`${commInput} min-h-11 pl-10`}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {['All', 'Guide', 'Documentation', 'Video', 'Interactive'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setResTypeFilter(type)}
                      className={`px-3 min-h-[34px] rounded-full text-xs font-medium border cursor-pointer ${
                        resTypeFilter === type
                          ? 'bg-[var(--accent-50)] border-[var(--spark)] text-[var(--ink-primary)] font-semibold'
                          : `border-[var(--border-hairline)] ${textSecondary} hover:bg-[var(--surface-subtle)]`
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
                <p className={`text-xs tabular-nums ${textSecondary}`}>
                  {filteredResources.length} {filteredResources.length === 1 ? 'resource' : 'resources'}
                </p>
              </div>
            </div>

            {filteredResources.length === 0 ? (
              <EmptyState
                title={resSearch.trim() || resTypeFilter !== 'All' ? 'Nothing matches that search' : 'The library is empty'}
                description={
                  resSearch.trim() || resTypeFilter !== 'All'
                    ? 'Try a shorter word, clear filters, or search the web from the panel and save a good link.'
                    : 'Share the first guide, video or doc that helped you learn.'
                }
                actionLabel="Share a resource"
                onAction={() => setShowAddRes(true)}
              />
            ) : (
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredResources.map((r) => (
                  <li key={r.id} className={`${cardClass} p-5 flex flex-col justify-between gap-4`}>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`flex items-center gap-2 text-sm ${textSecondary}`}>
                          <Library className="w-4 h-4 text-[var(--accent-600)]" aria-hidden="true" />
                          <span className="font-semibold text-[var(--accent-600)]">{r.type}</span>
                          <span>· {r.category}</span>
                        </p>
                        {onReportContent && (
                          <button
                            type="button"
                            aria-label={`Report ${r.title}`}
                            onClick={() =>
                              onReportContent({
                                targetType: 'resource',
                                targetId: r.id,
                                targetAuthorId: r.addedById,
                                targetAuthorName: r.addedBy || 'Member',
                                targetPreview: `${r.title} (${r.url})`,
                              })
                            }
                            className={`text-xs ${textSecondary} hover:text-[var(--warning-ink)] cursor-pointer`}
                          >
                            <Flag className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <h2 className={`text-lg ${textPrimary}`}>{r.title}</h2>
                      <p className={`text-sm leading-relaxed ${textSecondary}`}>{r.description}</p>
                    </div>
                    <div className={`pt-3 border-t ${borderClass} flex items-center justify-between gap-3 text-sm`}>
                      <span className={`${textSecondary} truncate`}>Shared by {r.addedBy}</span>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 font-medium text-[var(--accent-600)] hover:underline shrink-0"
                      >
                        Open <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <aside className="lg:col-span-4 lg:sticky lg:top-6 min-w-0">
            <details className={`${cardClass} group`} open={webSearchResult ? true : undefined}>
              <summary className="flex items-center justify-between gap-3 p-5 min-h-11 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <span className="space-y-0.5">
                  <span className={`flex items-center gap-2 text-lg ${textPrimary}`}>
                    <Globe className="w-4 h-4 text-[var(--accent-600)]" aria-hidden="true" /> Search the web
                  </span>
                  <span className={`block text-sm ${textSecondary}`}>Find current docs and save good links to the library.</span>
                </span>
                <ChevronDown className={`w-4 h-4 shrink-0 transition-transform group-open:rotate-180 ${textSecondary}`} aria-hidden="true" />
              </summary>
              <form onSubmit={handleWebResourceSearch} className={`px-5 pb-5 pt-4 space-y-4 border-t ${borderClass}`}>
                <label htmlFor="web-search" className={`block text-sm font-medium ${textPrimary}`}>What do you want to find?</label>
                <input
                  id="web-search"
                  value={webSearchQuery}
                  onChange={(e) => setWebSearchQuery(e.target.value)}
                  placeholder="For example: Tailwind v4 setup"
                  className={`${commInput} min-h-11`}
                />
                <button type="submit" disabled={webSearchBusy || !webSearchQuery.trim()} className={`${commPrimary} w-full`}>
                  {webSearchBusy ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" /> : <Globe className="w-4 h-4" aria-hidden="true" />}
                  {webSearchBusy ? 'Searching…' : 'Search the web'}
                </button>

                {webSearchResult && (
                  <div className="pt-4 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className={`text-base ${textPrimary}`}>Results for “{webSearchResult.query}”</h3>
                      <button
                        type="button"
                        onClick={() => setWebSearchResult(null)}
                        className={`min-h-11 px-2 -mr-2 text-sm underline ${textSecondary} cursor-pointer`}
                      >
                        Close
                      </button>
                    </div>
                    <p className={`text-base leading-relaxed whitespace-pre-wrap ${textPrimary}`}>{webSearchResult.answer}</p>
                    {webSearchResult.sources.length > 0 && (
                      <div className={`space-y-3 pt-3 border-t ${borderClass}`}>
                        <div className={`text-sm font-semibold ${textPrimary}`}>Verified links</div>
                        <ul className="space-y-3">
                          {webSearchResult.sources.map((src, idx) => (
                            <li key={idx} className={`p-3 rounded-lg border ${borderClass} flex items-center justify-between gap-2`}>
                              <a
                                href={src.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-medium text-[var(--accent-600)] hover:underline inline-flex items-center gap-1.5 min-w-0"
                              >
                                <span className="truncate">{src.title}</span>
                                <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              </a>
                              <button type="button" onClick={() => handleSaveGroundedSource(src)} className={`${commSecondary} !px-3`}>
                                Save
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </form>
            </details>
          </aside>

          <Modal open={showAddRes} onClose={() => setShowAddRes(false)} title="Share a Helpful Resource">
            <form onSubmit={handleAddResource} className="space-y-3.5">
              <input value={resTitle} onChange={(e) => setResTitle(e.target.value)} placeholder="Resource title" className={inputClass} required />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input value={resCat} onChange={(e) => setResCat(e.target.value)} placeholder="Field (e.g., Frontend)" className={inputClass} />
                <select value={resType} onChange={(e) => setResType(e.target.value)} className={inputClass}>
                  <option>Guide</option>
                  <option>Documentation</option>
                  <option>Video</option>
                  <option>Interactive</option>
                </select>
              </div>
              <div>
                <input type="url" value={resUrl} onChange={(e) => setResUrl(e.target.value)} placeholder="https://..." className={inputClass} required />
                {resUrlError && <p className="text-xs text-[var(--danger-ink)] mt-1">{resUrlError}</p>}
              </div>
              <input value={resDesc} onChange={(e) => setResDesc(e.target.value)} placeholder="Why is this helpful for beginners?" className={inputClass} />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddRes(false)} className={btnSecondary}>Cancel</button>
                <button type="submit" className={btnPrimary}>Add Resource</button>
              </div>
            </form>
          </Modal>
        </div>
      )}

      {/* 4. EVENTS & STUDY SESSIONS */}
      {subTab === 'events' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="relative flex-1 min-w-[200px]">
              <span className="sr-only">Search events</span>
              <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${textSecondary}`} aria-hidden="true" />
              <input
                type="search"
                value={evSearch}
                onChange={(e) => setEvSearch(e.target.value)}
                placeholder="Search study sessions, workshops, or hosts..."
                className={`${commInput} !pl-10 min-h-11`}
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {['All', 'Study Session', 'Debugging Session', 'Workshop', 'Knowledge Sharing'].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setEvTypeFilter(type)}
                  className={`px-3 min-h-[38px] rounded-full text-xs font-medium border cursor-pointer ${
                    evTypeFilter === type
                      ? 'bg-[var(--accent-50)] border-[var(--spark)] text-[var(--ink-primary)] font-semibold'
                      : `border-[var(--border-hairline)] ${textSecondary} hover:bg-[var(--surface-subtle)]`
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {filteredEvents.length === 0 ? (
            <EmptyState
              title="No sessions match right now"
              description="Host a study session or debugging hour for peers to RSVP."
              actionLabel="Host Study Session"
              onAction={() => setShowAddEvent(true)}
            />
          ) : (
            <ol className="space-y-4">
              {filteredEvents.map((ev) => {
                const going = (ev.attendeeIds || []).includes(currentUserId) || ev.attendees.includes(currentUserName);
                const reminded = (ev.reminderIds || []).includes(currentUserId) || (ev.reminders || []).includes(currentUserName);
                const [day, ...rest] = String(ev.dateTime).split(' · ');
                return (
                  <li key={ev.id} className={`${cardClass} overflow-hidden flex flex-col sm:flex-row`}>
                    <div className={`sm:w-44 shrink-0 p-5 flex sm:flex-col justify-between sm:justify-center gap-1 ${going ? 'bg-[var(--spark)] text-[var(--on-spark)]' : 'bg-[var(--accent-50)]'} sm:border-r border-b sm:border-b-0 ${borderClass}`}>
                      <div className="font-display text-xl leading-tight">{day}</div>
                      <div className="text-sm tabular-nums">{rest.join(' · ') || ev.type}</div>
                    </div>
                    <div className="p-5 flex-1 min-w-0 space-y-4">
                      <div className="space-y-2">
                        <p className={`text-xs ${textSecondary}`}>
                          <span className="font-semibold text-[var(--accent-600)]">{ev.type}</span> · hosted by{' '}
                          <button
                            type="button"
                            onClick={() => onOpenMemberProfile?.(ev.presenterId || ev.presenter, ev.presenter)}
                            className="font-medium hover:text-[var(--accent-600)] hover:underline cursor-pointer"
                          >
                            {ev.presenter}
                          </button>{' '}
                          · <span className="tabular-nums">{ev.attendees.length}</span> going
                        </p>
                        <h2 className={`text-xl ${textPrimary}`}>{ev.title}</h2>
                        <p className={`text-sm leading-relaxed max-w-[62ch] ${textSecondary}`}>{ev.description}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => toggleRsvp(ev.id)} className={going ? btnPrimary : btnSecondary}>
                          {going ? (<><CheckCircle2 className="w-3.5 h-3.5" /> Going</>) : 'Join'}
                        </button>
                        <button type="button" onClick={() => toggleReminder(ev.id)} className={btnSecondary}>
                          <Bell className="w-3.5 h-3.5" /> {reminded ? 'Reminder on' : 'Remind me'}
                        </button>
                        {ev.resourceUrl && (
                          <a href={ev.resourceUrl} target="_blank" rel="noreferrer" className={btnSecondary}>
                            Link <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <Modal open={showAddEvent} onClose={() => setShowAddEvent(false)} title="Host a Study Session or Event">
            <form onSubmit={handleAddEvent} className="space-y-3.5">
              <input value={evTitle} onChange={(e) => setEvTitle(e.target.value)} placeholder="Session title (e.g., Let's practice JavaScript loops together)" className={inputClass} required />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <select value={evType} onChange={(e) => setEvType(e.target.value)} className={inputClass}>
                  <option>Study Session</option>
                  <option>Knowledge Sharing</option>
                  <option>Workshop</option>
                  <option>Debugging Session</option>
                </select>
                <input value={evTopic} onChange={(e) => setEvTopic(e.target.value)} placeholder="Topic (e.g., CSS Flexbox)" className={inputClass} />
              </div>
              <input value={evTime} onChange={(e) => setEvTime(e.target.value)} placeholder="When (e.g., Thu, Nov 19 · 17:00)" className={inputClass} required />
              <textarea rows={2} value={evDesc} onChange={(e) => setEvDesc(e.target.value)} placeholder="What will you cover together?" className={inputClass} />
              <div>
                <input value={evUrl} onChange={(e) => setEvUrl(e.target.value)} placeholder="Meeting / resource link (optional)" className={inputClass} />
                {evUrlError && <p className="text-xs text-[var(--danger-ink)] mt-1">{evUrlError}</p>}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddEvent(false)} className={btnSecondary}>Cancel</button>
                <button type="submit" className={btnPrimary}>Schedule Session</button>
              </div>
            </form>
          </Modal>
        </div>
      )}

      {/* 5. WEEKLY CODING CHALLENGES */}
      {subTab === 'challenges' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <nav aria-label="Challenge categories" className="lg:col-span-3 lg:sticky lg:top-6 flex lg:flex-col gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {['All', 'Beginner', 'Frontend', 'Backend', 'Git and GitHub'].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setChallengeFilter(f)}
                className={`px-3.5 py-2 rounded-lg text-sm font-medium cursor-pointer whitespace-nowrap shrink-0 text-left border-l-4 transition-colors ${
                  challengeFilter === f
                    ? 'bg-[var(--accent-50)] border-[var(--spark)] text-[var(--ink-primary)] font-semibold'
                    : `border-transparent hover:bg-[var(--surface-subtle)] ${textSecondary}`
                }`}
              >
                {f}
              </button>
            ))}
          </nav>

          <div className="lg:col-span-9 grid grid-cols-1 xl:grid-cols-2 gap-4 items-start min-w-0">
            {filteredChallenges.map((c) => (
              <div key={c.id} className={`${cardClass} p-6 space-y-3.5 flex flex-col justify-between`}>
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className={`text-xs ${textSecondary}`}>
                        {c.category} · {c.difficulty} · Due {c.deadline}
                      </div>
                      <h2 className={`font-display text-lg mt-0.5 ${textPrimary}`}>{c.title}</h2>
                    </div>
                    <Badge variant={c.status === 'Completed' ? 'success' : c.status === 'In Progress' ? 'info' : 'neutral'}>{c.status}</Badge>
                  </div>
                  <p className={`text-xs leading-relaxed ${textSecondary}`}>{c.description}</p>
                  <ul className={`space-y-1 text-xs ${textSecondary}`}>
                    {(c.objectives || []).map((obj: string, i: number) => (
                      <li key={i}>• {obj}</li>
                    ))}
                  </ul>
                </div>

                {submitChId === c.id ? (
                  <form onSubmit={handleSubmitChallenge} className={`pt-3 border-t ${borderClass} space-y-3`}>
                    <div>
                      <input value={chRepo} onChange={(e) => setChRepo(e.target.value)} placeholder="GitHub repo or snippet link (optional)" className={inputClass} />
                      {chRepoError && <p className="text-xs text-[var(--danger-ink)] mt-1">{chRepoError}</p>}
                    </div>
                    <textarea rows={2} value={chExplain} onChange={(e) => setChExplain(e.target.value)} placeholder="Explain what you built and how it works..." className={inputClass} required />
                    <input value={chDiff} onChange={(e) => setChDiff(e.target.value)} placeholder="Anything tricky or confusing? (optional)" className={inputClass} />
                    <select value={chAiUsed} onChange={(e) => setChAiUsed(e.target.value)} className={inputClass}>
                      <option>No — Written 100% independently</option>
                      <option>Yes — For concept hints & debugging</option>
                      <option>Yes — Reviewed AI suggestions carefully</option>
                    </select>
                    <input value={chAiVerify} onChange={(e) => setChAiVerify(e.target.value)} placeholder="How did you test that it works?" className={inputClass} />
                    <div className="flex gap-2">
                      <button type="submit" className={btnPrimary}>Submit Solution</button>
                      <button type="button" onClick={() => setSubmitChId(null)} className={btnSecondary}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <div className={`flex items-center justify-between pt-3 border-t ${borderClass}`}>
                    <span className={`text-xs ${textSecondary}`}>{c.submission ? 'Submitted' : 'Open for practice'}</span>
                    <button type="button" onClick={() => setSubmitChId(c.id)} className={btnSecondary}>
                      {c.submission ? 'Update Submission' : 'Submit Solution'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <Modal open={showSuggestCh} onClose={() => setShowSuggestCh(false)} title="Suggest a Community Challenge">
            <form onSubmit={handleSuggestChallenge} className="space-y-3.5">
              <input value={newChTitle} onChange={(e) => setNewChTitle(e.target.value)} placeholder="Challenge title" className={inputClass} required />
              <div className="grid grid-cols-2 gap-2.5">
                <select value={newChCat} onChange={(e) => setNewChCat(e.target.value)} className={inputClass}>
                  <option>Frontend</option>
                  <option>Backend</option>
                  <option>Git and GitHub</option>
                  <option>Algorithms</option>
                </select>
                <select value={newChLevel} onChange={(e) => setNewChLevel(e.target.value)} className={inputClass}>
                  <option>Beginner</option>
                  <option>Intermediate</option>
                </select>
              </div>
              <textarea rows={3} value={newChDesc} onChange={(e) => setNewChDesc(e.target.value)} placeholder="Describe what to build in plain words..." className={inputClass} required />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowSuggestCh(false)} className={btnSecondary}>Cancel</button>
                <button type="submit" className={btnPrimary}>Post Challenge</button>
              </div>
            </form>
          </Modal>
        </div>
      )}

      {/* 6. MEMBERS DIRECTORY & HELP DESK */}
      {subTab === 'pairing-help' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          <div className="lg:col-span-8 space-y-8 min-w-0">
            <label className="relative block">
              <span className="sr-only">Search peer help questions</span>
              <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${textSecondary}`} aria-hidden="true" />
              <input
                type="search"
                value={helpSearch}
                onChange={(e) => setHelpSearch(e.target.value)}
                placeholder="Search open or resolved help questions..."
                className={`${commInput} !pl-10 min-h-11`}
              />
            </label>

            {(() => {
              const renderReply = (h: any, label: string) =>
                mutedReason ? null : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleHelpReply(h.id);
                    }}
                    className="flex flex-col sm:flex-row gap-2"
                  >
                    <label htmlFor={`help-reply-${h.id}`} className="sr-only">{label}</label>
                    <input
                      id={`help-reply-${h.id}`}
                      value={helpReplyDrafts[h.id] || ''}
                      onChange={(e) => setHelpReplyDrafts((prev) => ({ ...prev, [h.id]: e.target.value }))}
                      placeholder={label}
                      className={`${commInput} min-h-11`}
                    />
                    <button type="submit" disabled={!(helpReplyDrafts[h.id] || '').trim()} className={commSecondary}>
                      Send answer
                    </button>
                  </form>
                );

              const renderResponses = (h: any) =>
                (h.responses || []).length > 0 && (
                  <ul className="space-y-3">
                    {(h.responses || []).map((r: any) => (
                      <li key={r.id} className="pl-4 py-1 border-l-4 border-[var(--accent-500)] text-base leading-relaxed max-w-[66ch]">
                        <button
                          type="button"
                          onClick={() => onOpenMemberProfile?.(r.responderId || r.responder, r.responder)}
                          className={`font-semibold hover:text-[var(--accent-600)] hover:underline cursor-pointer ${textPrimary}`}
                        >
                          {r.responder}
                        </button>
                        <span className={textSecondary}> · <MentionText text={r.text} /></span>
                      </li>
                    ))}
                  </ul>
                );

              return (
                <>
                  <section aria-labelledby="help-open" className="space-y-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 id="help-open" className={`text-xl ${textPrimary}`}>
                        Open questions <span className={`tabular-nums ${textSecondary}`}>({openHelpList.length})</span>
                      </h2>
                    </div>
                    {openHelpList.length === 0 ? (
                      <p className={`p-5 rounded-xl border border-dashed ${borderClass} text-base ${textSecondary}`}>
                        {helpSearch.trim()
                          ? 'No open questions match that search.'
                          : 'Every question has been answered. Ask your own below, or check back later.'}
                      </p>
                    ) : (
                      openHelpList.map((h) => {
                        const canResolve =
                          isAdminMode || h.authorId === currentUserId || (!h.authorId && h.author === currentUserName);
                        return (
                          <article key={h.id} className={`${cardClass} p-6 sm:p-6 space-y-4 border-l-4 !border-l-[var(--spark)]`}>
                            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                              <span className={textSecondary}>
                                <button
                                  type="button"
                                  onClick={() => onOpenMemberProfile?.(h.authorId || h.author, h.author)}
                                  className={`font-semibold hover:text-[var(--accent-600)] hover:underline cursor-pointer ${textPrimary}`}
                                >
                                  {h.author}
                                </button>{' '}
                                · {h.field} · {h.createdAt}
                              </span>
                              <div className="flex items-center gap-2">
                                <Badge variant="info">{h.status}</Badge>
                                {canResolve && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (actions) await actions.toggleHelpResolved(h.id);
                                      else
                                        setHelpRequests(
                                          helpRequests.map((x) => (x.id === h.id ? { ...x, status: 'Resolved' } : x))
                                        );
                                    }}
                                    className="text-xs font-medium text-[var(--accent-600)] hover:underline cursor-pointer"
                                  >
                                    Mark resolved
                                  </button>
                                )}
                                {onReportContent && h.authorId !== currentUserId && (
                                  <button
                                    type="button"
                                    aria-label="Report question"
                                    onClick={() =>
                                      onReportContent({
                                        targetType: 'help',
                                        targetId: h.id,
                                        targetAuthorId: h.authorId,
                                        targetAuthorName: h.author,
                                        targetPreview: h.helpNeeded,
                                      })
                                    }
                                    className={`text-xs ${textSecondary} hover:text-[var(--warning-ink)] cursor-pointer`}
                                  >
                                    <Flag className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                            <h3 className={`text-lg ${textPrimary}`}>{h.helpNeeded}</h3>
                            <p className={`text-base leading-relaxed max-w-[66ch] ${textSecondary}`}>
                              <strong className={`font-semibold ${textPrimary}`}>Goal:</strong> {h.goal}
                              {h.attempted ? (
                                <>
                                  <br />
                                  <strong className={`font-semibold ${textPrimary}`}>Tried:</strong> {h.attempted}
                                </>
                              ) : null}
                            </p>
                            {h.errorOrCode && (
                              <pre className={`p-3.5 ${subtleBgClass} text-sm overflow-x-auto ${textPrimary}`}>{h.errorOrCode}</pre>
                            )}
                            {renderResponses(h)}
                            {renderReply(h, 'Write an answer to help')}
                          </article>
                        );
                      })
                    )}
                  </section>

                  <form onSubmit={handleAskHelp} className={`${cardClass} p-6 sm:p-6 space-y-4`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className={`text-xl ${textPrimary}`}>Ask for help</h2>
                        <p className={`text-base mt-1 max-w-[56ch] ${textSecondary}`}>No question is too basic. Telling us what you tried helps peers guide you.</p>
                      </div>
                      {(helpGoal.trim() || helpTried.trim() || helpCode.trim() || helpAsk.trim()) && (
                        <button
                          type="button"
                          onClick={() => {
                            setHelpGoal('');
                            setHelpTried('');
                            setHelpCode('');
                            setHelpAsk('');
                            try {
                              sessionStorage.removeItem(helpDraftKey);
                            } catch {}
                          }}
                          className={`min-h-11 px-2 -mr-2 text-sm underline ${textSecondary} hover:text-[var(--danger-ink)] cursor-pointer`}
                        >
                          Clear draft
                        </button>
                      )}
                    </div>
                    <div>
                      <label htmlFor="help-goal" className={`block text-sm font-medium mb-1.5 ${textPrimary}`}>What are you trying to do?</label>
                      <input id="help-goal" value={helpGoal} onChange={(e) => setHelpGoal(e.target.value)} placeholder="For example: centre a button on the page" className={`${commInput} min-h-11`} required />
                    </div>
                    <div>
                      <label htmlFor="help-tried" className={`block text-sm font-medium mb-1.5 ${textPrimary}`}>What have you tried so far? <span className={`font-normal ${textSecondary}`}>(optional)</span></label>
                      <input id="help-tried" value={helpTried} onChange={(e) => setHelpTried(e.target.value)} placeholder="Even a small attempt helps" className={`${commInput} min-h-11`} />
                    </div>
                    <div>
                      <label htmlFor="help-code" className={`block text-sm font-medium mb-1.5 ${textPrimary}`}>Error message or code <span className={`font-normal ${textSecondary}`}>(optional)</span></label>
                      <textarea id="help-code" rows={3} spellCheck={false} value={helpCode} onChange={(e) => setHelpCode(e.target.value)} placeholder="Paste it here" className={`${commInput} font-mono text-sm`} />
                    </div>
                    <div>
                      <label htmlFor="help-ask" className={`block text-sm font-medium mb-1.5 ${textPrimary}`}>Your question</label>
                      <input id="help-ask" value={helpAsk} onChange={(e) => setHelpAsk(e.target.value)} placeholder="What do you need help with?" className={`${commInput} min-h-11`} required />
                    </div>
                    <button type="submit" disabled={Boolean(mutedReason)} className={commPrimary}>Post question</button>
                  </form>

                  {resolvedHelpList.length > 0 && (
                    <section aria-labelledby="help-resolved" className="space-y-4">
                      <h2 id="help-resolved" className={`text-xl ${textSecondary}`}>
                        Resolved <span className="tabular-nums">({resolvedHelpList.length})</span>
                      </h2>
                      {resolvedHelpList.map((h) => (
                        <article key={h.id} className={`${cardClass} p-6 space-y-4 opacity-75 hover:opacity-100 focus-within:opacity-100 transition-opacity`}>
                          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span className={textSecondary}>
                              <strong className={`font-semibold ${textPrimary}`}>{h.author}</strong> · {h.field} · {h.createdAt}
                            </span>
                            <Badge variant="success">{h.status}</Badge>
                          </div>
                          <h3 className={`text-base ${textPrimary}`}>{h.helpNeeded}</h3>
                          <details className="group">
                            <summary className="min-h-11 flex items-center gap-2 text-sm font-medium cursor-pointer list-none [&::-webkit-details-marker]:hidden text-[var(--accent-600)]">
                              <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                              {(h.responses || []).length} {(h.responses || []).length === 1 ? 'answer' : 'answers'} and details
                            </summary>
                            <div className="space-y-4 pt-2">
                              <p className={`text-base leading-relaxed max-w-[66ch] ${textSecondary}`}>
                                <strong className={`font-semibold ${textPrimary}`}>Goal:</strong> {h.goal}
                                {h.attempted ? (
                                  <>
                                    <br />
                                    <strong className={`font-semibold ${textPrimary}`}>Tried:</strong> {h.attempted}
                                  </>
                                ) : null}
                              </p>
                              {h.errorOrCode && (
                                <pre className={`p-3.5 ${subtleBgClass} text-sm overflow-x-auto ${textPrimary}`}>{h.errorOrCode}</pre>
                              )}
                              {renderResponses(h)}
                              {renderReply(h, 'Add another answer')}
                            </div>
                          </details>
                        </article>
                      ))}
                    </section>
                  )}
                </>
              );
            })()}
          </div>

          <div className="lg:col-span-4 lg:sticky lg:top-6 space-y-5 min-w-0">
            {pairingState?.partnerName && (
              <div className={`${cardClass} p-6 space-y-3 border-l-4 !border-l-[var(--spark)]`}>
                <h2 className={`text-lg ${textPrimary}`}>Your study buddy</h2>
                <p className={`text-base leading-relaxed ${textSecondary}`}>
                  Paired with <strong className={`font-semibold ${textPrimary}`}>{pairingState.partnerName}</strong> ({pairingState.partnerField || 'Fellow learner'}).
                </p>
                {pairingState.pairExercise && <p className={`text-base leading-relaxed ${textSecondary}`}>{pairingState.pairExercise}</p>}
              </div>
            )}

            <div className={`${cardClass} p-6 space-y-4`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <h2 className={`text-lg flex items-center gap-2 whitespace-nowrap ${textPrimary}`}>
                  <Users className="w-4 h-4 shrink-0 text-[var(--accent-600)]" aria-hidden="true" /> Member directory
                </h2>
                <span className={`text-sm tabular-nums whitespace-nowrap shrink-0 ${textSecondary}`}>{directoryMembers.length} members</span>
              </div>
              <input
                type="search"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Find members by name or stack..."
                className={`${commInput} text-sm min-h-10`}
              />
              <ul className={`divide-y ${borderClass}`}>
                {filteredMembers.map((m) => (
                  <li key={m.id} className="py-3 first:pt-1 last:pb-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenMemberProfile?.(m.id, m.name)}
                        className={`text-base font-semibold hover:text-[var(--accent-600)] hover:underline text-left cursor-pointer ${textPrimary}`}
                      >
                        {m.name}
                      </button>
                      <span className="text-xs font-medium text-[var(--accent-600)] shrink-0">{m.role || 'Member'}</span>
                    </div>
                    {(m.field || m.level) && (
                      <div className={`text-xs ${textSecondary}`}>{[m.field, m.level].filter(Boolean).join(' · ')}</div>
                    )}
                    {m.bio && <p className={`text-xs leading-relaxed line-clamp-2 ${textSecondary}`}>{m.bio}</p>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
