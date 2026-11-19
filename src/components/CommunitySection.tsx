import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Bell,
  Bookmark,
  Calendar,
  CheckCircle2,
  Code2,
  ExternalLink,
  Globe,
  HelpCircle,
  Library,
  Loader2,
  Megaphone,
  MessageSquare,
  ChevronRight,
  Pin,
  ChevronDown,
  Plus,
  Search,
  Send,
  ThumbsUp,
  Trophy,
  Users,
} from 'lucide-react';
import { Badge, EmptyState, Modal, PageHeader, SectionTabs } from './ui';
import { getUrlError } from '../lib/url';
import { requestGroundedSearch, type GroundedSource } from '../lib/aiClient';
import { StudyGroupChatPanel, useStudyGroupChat } from './StudyGroupChat';
import type {
  CommunityEvent,
  CommunityPost,
  OnboardingProfile,
} from '../types';

export type CommunitySubTab =
  | 'community-home'
  | 'study-chat'
  | 'community'
  | 'announcements'
  | 'resources'
  | 'events'
  | 'challenges'
  | 'pairing-help';

/** Long posts collapse to a few lines so the feed stays easy to scan */
const PostBody = ({ text, className }: { text: string; className: string }) => {
  const [open, setOpen] = useState(false);
  const long = text.length > 320 || text.split('\n').length > 5;
  return (
    <div>
      <p className={`${className} whitespace-pre-wrap break-words ${long && !open ? 'line-clamp-4' : ''}`}>{text}</p>
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

// Switching tabs remounts this section, which would drop the modal state. Buttons on other Community
// tabs set this flag so the composer is already open when the Discussions tab appears.
let openComposerOnMount = false;
const openComposerOnDiscussions = (setSubTab: (t: CommunitySubTab) => void) => {
  openComposerOnMount = true;
  setSubTab('community');
};

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
  teamRoster,
  pairingState,
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
  teamRoster: any[];
  pairingState: any;
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

  const postDraftKey = `devhub_draft_${user.id || 'local'}_community_post`;
  const helpDraftKey = `devhub_draft_${user.id || 'local'}_community_help`;
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

  // Discussions state
  const [postFilter, setPostFilter] = useState('All');
  const [showPostModal, setShowPostModal] = useState(
    openComposerOnMount || Boolean(savedPostDraft && (savedPostDraft.postTitle || savedPostDraft.postBody))
  );
  const [postCat, setPostCat] = useState(savedPostDraft?.postCat || 'Question');
  const [postTitle, setPostTitle] = useState(savedPostDraft?.postTitle || '');
  const [postBody, setPostBody] = useState(savedPostDraft?.postBody || '');
  const [postCode, setPostCode] = useState(savedPostDraft?.postCode || '');
  const [postLink, setPostLink] = useState(savedPostDraft?.postLink || '');
  const [showPostExtras, setShowPostExtras] = useState(Boolean(savedPostDraft?.postCode || savedPostDraft?.postLink));
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [postSearch, setPostSearch] = useState('');
  const [postSort, setPostSort] = useState<'new' | 'helpful' | 'unanswered'>('new');
  const { unreadCount: chatUnread } = useStudyGroupChat();

  // "Helpful" is one per person and can be taken back
  const likedKey = `devhub_liked_${user.id || 'local'}`;
  const [likedPostIds, setLikedPostIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(likedKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(likedKey, JSON.stringify(likedPostIds));
    } catch {}
  }, [likedKey, likedPostIds]);

  // Announcements composer (admin)
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');

  // Resources state
  const [resSearch, setResSearch] = useState('');
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

  // Help Desk state
  const [helpGoal, setHelpGoal] = useState(savedHelpDraft?.helpGoal || '');
  const [helpTried, setHelpTried] = useState(savedHelpDraft?.helpTried || '');
  const [helpCode, setHelpCode] = useState(savedHelpDraft?.helpCode || '');
  const [helpAsk, setHelpAsk] = useState(savedHelpDraft?.helpAsk || '');
  const [helpReplyDrafts, setHelpReplyDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      if (postTitle.trim() || postBody.trim() || postCode.trim() || postLink.trim()) {
        sessionStorage.setItem(postDraftKey, JSON.stringify({ postCat, postTitle, postBody, postCode, postLink }));
      } else {
        sessionStorage.removeItem(postDraftKey);
      }
    } catch {}
  }, [postDraftKey, postCat, postTitle, postBody, postCode, postLink]);

  useEffect(() => {
    try {
      if (helpGoal.trim() || helpTried.trim() || helpCode.trim() || helpAsk.trim()) {
        sessionStorage.setItem(helpDraftKey, JSON.stringify({ helpGoal, helpTried, helpCode, helpAsk }));
      } else {
        sessionStorage.removeItem(helpDraftKey);
      }
    } catch {}
  }, [helpDraftKey, helpGoal, helpTried, helpCode, helpAsk]);

  const postLinkError = getUrlError(postLink, 'https://developer.mozilla.org/...');
  const resUrlError = getUrlError(resUrl, 'https://developer.mozilla.org/...');
  const evUrlError = getUrlError(evUrl, 'https://meet.jit.si/devhub-study');
  const chRepoError = getUrlError(chRepo, 'https://github.com/your-name/challenge-solution');

  const currentUserName = user.name || profile.fullName || 'Member';

  const handleCreatePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!postTitle.trim() || !postBody.trim() || postLinkError) return;
    const item: CommunityPost = {
      id: `post-${Date.now()}`,
      author: currentUserName,
      role: isAdminMode ? 'Community Admin' : 'Member',
      category: postCat,
      pinned: false,
      timestamp: 'Just now',
      title: postTitle.trim(),
      content: postBody.trim(),
      codeSnippet: postCode.trim() || undefined,
      attachmentUrl: postLink.trim() || undefined,
      likes: 1,
      comments: [],
    };
    setPosts([item, ...posts]);
    setPostTitle('');
    setPostBody('');
    setPostCode('');
    setPostLink('');
    setShowPostExtras(false);
    setShowPostModal(false);
    try {
      sessionStorage.removeItem(postDraftKey);
    } catch {}
    onNotify('Posted to Community Discussions!');
  };

  const handleCreateAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annBody.trim()) return;
    const item: CommunityPost = {
      id: `post-${Date.now()}`,
      author: currentUserName,
      role: 'Community Admin',
      category: 'Announcement',
      pinned: true,
      timestamp: 'Just now',
      title: annTitle.trim(),
      content: annBody.trim(),
      likes: 1,
      comments: [],
    };
    setPosts([item, ...posts]);
    setAnnTitle('');
    setAnnBody('');
    onNotify('Announcement published.');
  };

  const handleAddReply = (postId: string) => {
    const text = (replyDrafts[postId] || '').trim();
    if (!text) return;
    setPosts(
      posts.map((p) =>
        p.id === postId
          ? {
              ...p,
              comments: [...p.comments, { id: `c-${Date.now()}`, author: currentUserName, text, isHelpful: false }],
            }
          : p
      )
    );
    setReplyDrafts((prev) => ({ ...prev, [postId]: '' }));
  };

  const toggleHelpfulComment = (postId: string, commentId: string) => {
    setPosts(
      posts.map((p) =>
        p.id === postId
          ? {
              ...p,
              comments: p.comments.map((c) => (c.id === commentId ? { ...c, isHelpful: !c.isHelpful } : c)),
            }
          : p
      )
    );
  };

  const toggleLikePost = (postId: string) => {
    const liked = likedPostIds.includes(postId);
    setLikedPostIds(liked ? likedPostIds.filter((id) => id !== postId) : [...likedPostIds, postId]);
    setPosts(posts.map((p) => (p.id === postId ? { ...p, likes: Math.max(0, p.likes + (liked ? -1 : 1)) } : p)));
  };

  const toggleSavePost = (postId: string) => {
    if (savedPostIds.includes(postId)) {
      setSavedPostIds(savedPostIds.filter((id) => id !== postId));
    } else {
      setSavedPostIds([postId, ...savedPostIds]);
      onNotify('Saved to your bookmarks.');
    }
  };

  const handleAddResource = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resTitle.trim() || !resUrl.trim() || resUrlError) return;
    const item = {
      id: `res-${Date.now()}`,
      title: resTitle.trim(),
      category: resCat.trim() || 'General',
      type: resType,
      url: resUrl.trim(),
      addedBy: currentUserName,
      description: resDesc.trim() || 'Shared by a community member.',
    };
    setResources([item, ...resources]);
    setResTitle('');
    setResUrl('');
    setResDesc('');
    setShowAddRes(false);
    onNotify('Resource added to the community library.');
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

  const handleSaveGroundedSource = (src: GroundedSource) => {
    if (resources.some((r) => r.url === src.uri)) {
      onNotify('This link is already in the community library.');
      return;
    }
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
  };

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!evTitle.trim() || !evTime.trim() || evUrlError) return;
    const item: CommunityEvent = {
      id: `pres-${Date.now()}`,
      title: evTitle.trim(),
      presenter: currentUserName,
      topic: evTopic.trim() || 'Peer Learning',
      type: evType,
      dateTime: evTime.trim(),
      description: evDesc.trim() || 'Beginner-friendly live study session.',
      resourceUrl: evUrl.trim(),
      attendees: [currentUserName],
      reminders: [currentUserName],
    };
    setPresentations([item, ...presentations]);
    setEvTitle('');
    setEvTopic('');
    setEvTime('');
    setEvDesc('');
    setEvUrl('');
    setShowAddEvent(false);
    onNotify('Session scheduled!');
  };

  const toggleRsvp = (eventId: string) => {
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

  const toggleReminder = (eventId: string) => {
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

  const handleAskHelp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!helpGoal.trim() || !helpAsk.trim()) return;
    const req = {
      id: `help-${Date.now()}`,
      author: currentUserName,
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
    setHelpGoal('');
    setHelpTried('');
    setHelpCode('');
    setHelpAsk('');
    try {
      sessionStorage.removeItem(helpDraftKey);
    } catch {}
    onNotify('Question posted to peers and mentors!');
  };

  const handleHelpReply = (reqId: string) => {
    const text = (helpReplyDrafts[reqId] || '').trim();
    if (!text) return;
    setHelpRequests(
      helpRequests.map((h) =>
        h.id === reqId
          ? {
              ...h,
              status: 'Being Helped',
              responses: [...(h.responses || []), { id: `hr-${Date.now()}`, responder: currentUserName, text }],
            }
          : h
      )
    );
    setHelpReplyDrafts((prev) => ({ ...prev, [reqId]: '' }));
    onNotify('Helpful response added.');
  };

  const communityTabs: { id: CommunitySubTab; label: string; badge?: number }[] = [
    { id: 'community-home', label: 'Community Home' },
    { id: 'study-chat', label: 'Study Chat', badge: chatUnread },
    { id: 'community', label: 'Discussions', badge: posts.length },
    { id: 'events', label: 'Events', badge: presentations.length },
    { id: 'resources', label: 'Resources', badge: resources.length },
    { id: 'pairing-help', label: 'Peer Help' },
  ];

  const inCategory = (p: CommunityPost, cat: string) => {
    if (cat === 'Saved') return savedPostIds.includes(p.id);
    if (cat === 'All') return true;
    return p.category === cat;
  };
  const postQuery = postSearch.trim().toLowerCase();
  const discussionPosts = (() => {
    const list = posts
      .filter((p) => inCategory(p, postFilter))
      .filter(
        (p) =>
          !postQuery ||
          p.title.toLowerCase().includes(postQuery) ||
          p.content.toLowerCase().includes(postQuery) ||
          p.author.toLowerCase().includes(postQuery)
      )
      .filter((p) => postSort !== 'unanswered' || p.comments.length === 0);
    return postSort === 'helpful' ? [...list].sort((a, b) => b.likes - a.likes) : list;
  })();

  const announcementsList = posts.filter((p) => p.category === 'Announcement' || p.pinned);

  const filteredResources = resources.filter((r) => {
    if (!resSearch.trim()) return true;
    const q = resSearch.toLowerCase();
    return (
      r.title.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q)
    );
  });

  const filteredChallenges =
    challengeFilter === 'All'
      ? challenges
      : challenges.filter((c) => c.category === challengeFilter || c.difficulty === challengeFilter);

  const latestAnnouncement = announcementsList[0] || posts[0];
  const openHelpList = helpRequests.filter((h) => h.status !== 'Resolved');

  // Controls for these three tabs: 44px targets, variable-driven for light and dark
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
        onClick={() => {
          if (subTab === 'community') setShowPostModal(true);
          else openComposerOnDiscussions(setSubTab);
        }}
        className={btnPrimary}
      >
        <Plus className="w-3.5 h-3.5" /> Start a Discussion
      </button>
    ) : subTab === 'resources' ? (
      <button type="button" onClick={() => setShowAddRes(true)} className={btnPrimary}>
        <Plus className="w-3.5 h-3.5" /> Share Resource
      </button>
    ) : subTab === 'events' ? (
      <button type="button" onClick={() => setShowAddEvent(true)} className={btnPrimary}>
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
        description="Learn together with friendly beginners and peers—chat live in study rooms, ask questions, share helpful guides, or join sessions."
        action={headerAction}
      />

      <SectionTabs tabs={communityTabs} active={activeNavTab} onChange={setSubTab} />

      {/* 0A. LIVE STUDY GROUP CHAT */}
      {subTab === 'study-chat' && (
        <StudyGroupChatPanel styles={styles} currentUserId={user.id || user.email || 'me'} />
      )}

      {/* 0. COMMUNITY HOME OVERVIEW */}
      {subTab === 'community-home' && (
        <div className="space-y-6">
          {latestAnnouncement && (
            <button type="button" onClick={() => setSubTab('announcements')} className={`${cardClass} studio-card-interactive w-full text-left flex items-start gap-4 p-5 cursor-pointer border-l-[6px] border-l-[var(--spark)]`}>
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
            {/* Feed: the main reason to be here */}
            <section className="lg:col-span-8 space-y-4 min-w-0">
              <div className="flex items-end justify-between">
                <h2 className={`text-xl ${textPrimary}`}>Recent discussions</h2>
                <button type="button" onClick={() => setSubTab('community')} className="text-sm font-medium text-[var(--accent-600)] hover:underline cursor-pointer">View all discussions</button>
              </div>
              {posts.length === 0 && (
                <EmptyState
                  title="No discussions yet"
                  description="Be the first to ask a question or share a small win."
                  actionLabel="Start a Discussion"
                  onAction={() => openComposerOnDiscussions(setSubTab)}
                />
              )}
              <ul className="space-y-3 sm:space-y-4">
                {posts.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => setSubTab('community')} className={`${cardClass} studio-card-interactive w-full text-left p-4 flex gap-4 items-start cursor-pointer`}>
                      <span aria-hidden="true" className="w-10 h-10 rounded-full bg-[var(--accent-100)] text-[var(--accent-700)] text-sm font-semibold flex items-center justify-center shrink-0">
                        {(p.author || '?').slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-xs ${textSecondary}`}>{p.author} posted in <span className="font-semibold text-[var(--accent-600)]">{p.category}</span> · {p.timestamp}</span>
                        <span className={`block text-base font-semibold leading-snug mt-0.5 ${textPrimary}`}>{p.title}</span>
                      </span>
                      <span className={`inline-flex items-center gap-1 text-xs tabular-nums shrink-0 ${textSecondary}`}>
                        <MessageSquare className="w-3.5 h-3.5" /> {p.comments.length}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {/* Rail: things with a date or a task attached */}
            <aside className="lg:col-span-4 space-y-4 min-w-0">
              {presentations[0] && (
                <section className={`${cardClass} p-5 sm:p-6 space-y-3`}>
                  <div className={`flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-600)]`}><Calendar className="w-3.5 h-3.5" /> Next session · {presentations[0].dateTime}</div>
                  <h3 className={`text-lg ${textPrimary}`}>{presentations[0].title}</h3>
                  <p className={`text-sm line-clamp-3 ${textSecondary}`}>{presentations[0].description}</p>
                  <button type="button" onClick={() => setSubTab('events')} className={btnSecondary}>All events ({presentations.length})</button>
                </section>
              )}
              {challenges[0] && (
                <section className={`${cardClass} p-5 sm:p-6 space-y-3`}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--accent-600)] inline-flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" /> Weekly challenge</span>
                    <span className={textSecondary}>{challenges[0].difficulty}</span>
                  </div>
                  <h3 className={`text-lg ${textPrimary}`}>{challenges[0].title}</h3>
                  <p className={`text-sm line-clamp-3 ${textSecondary}`}>{challenges[0].description}</p>
                  <button type="button" onClick={() => setSubTab('challenges')} className={btnSecondary}>Try it</button>
                </section>
              )}
              <section className={`${cardClass} p-5 sm:p-6 space-y-4 bg-[var(--accent-50)]`}>
                <div>
                  <h3 className={`text-lg ${textPrimary}`}>Peer help & study chat</h3>
                  <p className={`text-sm ${textSecondary}`}>{openHelpList.length} open question{openHelpList.length === 1 ? '' : 's'} · {teamRoster.length} members</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setSubTab('pairing-help')} className={btnPrimary}>Ask or help</button>
                  <button type="button" onClick={() => setSubTab('study-chat')} className={btnSecondary}>Live study chat</button>
                </div>
              </section>
            </aside>
          </div>
        </div>
      )}

      {/* 1. DISCUSSIONS */}
      {subTab === 'community' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <nav aria-label="Discussion categories" className="lg:col-span-3 lg:sticky lg:top-6 flex lg:flex-col gap-2 lg:gap-1.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1 lg:mx-0 lg:px-0">
            {['All', 'Question', 'Small Win', 'Mistake & Lesson', 'Explain a Concept', 'Study Session Idea', 'Saved'].map((cat) => (
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
                  {posts.filter((p) => inCategory(p, cat)).length}
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
                  placeholder="Search discussions"
                  className={`${commInput} !pl-10 min-h-11`}
                />
              </label>
              <div role="group" aria-label="Sort discussions" className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 sm:mx-0 sm:px-0">
                {([['new', 'Newest'], ['helpful', 'Most helpful'], ['unanswered', 'Unanswered']] as const).map(([id, label]) => (
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
            {discussionPosts.length === 0 ? (
              <EmptyState
                title={postQuery || postSort === 'unanswered' ? 'Nothing matches yet' : 'No discussions here yet'}
                description={
                  postQuery || postSort === 'unanswered'
                    ? 'Try a different word, or clear the filters to see everything.'
                    : 'Start a friendly question, celebrate a small win, or share something you figured out today.'
                }
                actionLabel="Start a Discussion"
                onAction={() => setShowPostModal(true)}
              />
            ) : (
              discussionPosts.map((post) => {
                const isSaved = savedPostIds.includes(post.id);
                return (
                  <div key={post.id} className={`${cardClass} p-5 sm:p-6 space-y-3.5`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        {post.pinned && <Pin className="w-3.5 h-3.5 text-[var(--accent-600)]" />}
                        <span className="font-semibold text-[var(--accent-600)]">{post.category}</span>
                        <span className={textSecondary}>· {post.author} ({post.role})</span>
                        <span className={textSecondary}>· {post.timestamp}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleSavePost(post.id)}
                        aria-pressed={isSaved}
                        className={`inline-flex items-center gap-1 min-h-[36px] px-1 -mr-1 text-xs cursor-pointer ${
                          isSaved ? 'text-[var(--accent-600)] font-semibold' : textSecondary
                        }`}
                      >
                        <Bookmark className="w-3.5 h-3.5" /> {isSaved ? 'Saved' : 'Save'}
                      </button>
                    </div>

                    <h2 className={`text-xl ${textPrimary}`}>{post.title}</h2>
                    <PostBody text={post.content} className={`text-sm leading-relaxed ${textSecondary}`} />

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

                    <div className={`pt-2 flex items-center gap-5 text-xs ${textSecondary}`}>
                      <button
                        type="button"
                        onClick={() => toggleLikePost(post.id)}
                        aria-pressed={likedPostIds.includes(post.id)}
                        className={`inline-flex items-center gap-1.5 min-h-[36px] cursor-pointer tabular-nums ${
                          likedPostIds.includes(post.id) ? 'text-[var(--accent-600)] font-semibold' : 'hover:text-[var(--accent-600)]'
                        }`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" /> Helpful ({post.likes})
                      </button>
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <MessageSquare className="w-3.5 h-3.5" /> {post.comments.length} {post.comments.length === 1 ? 'reply' : 'replies'}
                      </span>
                    </div>

                    {/* Replies */}
                    <details open={post.comments.length > 0 && post.comments.length <= 2} className={`pt-3 border-t ${borderClass} group`}>
                    <summary className={`list-none cursor-pointer text-sm font-semibold flex items-center gap-1.5 [&::-webkit-details-marker]:hidden ${textPrimary}`}>
                      <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-[var(--accent-600)]" />
                      {post.comments.length === 0 ? 'Be the first to reply' : `${post.comments.length} repl${post.comments.length === 1 ? 'y' : 'ies'}`}
                    </summary>
                    <div className="space-y-3 mt-3">

                      {[...post.comments].sort((a, b) => Number(!!b.isHelpful) - Number(!!a.isHelpful)).map((c) => (
                        <div key={c.id} className={`py-2.5 px-3 rounded-lg ${subtleBgClass} flex items-start justify-between gap-3`}>
                          <div className="space-y-0.5 text-xs min-w-0">
                            <div className="flex items-center gap-2">
                              <strong className={textPrimary}>{c.author}</strong>
                              {c.isHelpful && <Badge variant="success">Helpful answer</Badge>}
                            </div>
                            <p className={`${textSecondary} whitespace-pre-wrap break-words`}>{c.text}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleHelpfulComment(post.id, c.id)}
                            className={`text-xs font-medium shrink-0 min-h-[36px] cursor-pointer ${
                              c.isHelpful ? 'text-[var(--success-ink)]' : 'text-[var(--accent-600)] hover:underline'
                            }`}
                          >
                            {c.isHelpful ? 'Helpful ✓' : 'Mark helpful'}
                          </button>
                        </div>
                      ))}

                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleAddReply(post.id);
                        }}
                        className="flex flex-col sm:flex-row gap-2 pt-1"
                      >
                        <label htmlFor={`reply-${post.id}`} className="sr-only">Write a reply</label>
                        <input
                          id={`reply-${post.id}`}
                          value={replyDrafts[post.id] || ''}
                          onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                          maxLength={1000}
                          placeholder="Write a helpful reply..."
                          className={`${inputClass} flex-1 min-w-0`}
                        />
                        <button type="submit" disabled={!(replyDrafts[post.id] || '').trim()} className={btnSecondary}>
                          Reply
                        </button>
                      </form>
                    </div>
                    </details>
                  </div>
                );
              })
            )}
          </div>

          {/* Start Discussion Modal */}
          <Modal open={showPostModal} onClose={() => setShowPostModal(false)} title="Start a Discussion">
            <form onSubmit={handleCreatePost} className="space-y-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className={textSecondary}>Ask basic questions, celebrate small wins, or explain what you learned.</span>
                {(postTitle.trim() || postBody.trim() || postCode.trim() || postLink.trim()) && (
                  <button
                    type="button"
                    onClick={() => {
                      setPostTitle('');
                      setPostBody('');
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
                </select>
                <input
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  placeholder="Clear title..."
                  className={`${inputClass} sm:col-span-2`}
                  required
                />
              </div>
              <textarea
                rows={4}
                value={postBody}
                onChange={(e) => setPostBody(e.target.value)}
                placeholder="Write your question, win, or lesson learned..."
                className={inputClass}
                required
              />
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
                  <button type="button" onClick={() => setShowPostModal(false)} className={btnSecondary}>Cancel</button>
                  <button type="submit" className={btnPrimary}>
                    <Send className="w-3.5 h-3.5" /> Post Discussion
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
            <form onSubmit={handleCreateAnnouncement} className={`${cardClass} p-6 sm:p-6 space-y-4`}>
              <h2 className={`text-lg flex items-center gap-2 ${textPrimary}`}>
                <Megaphone className="w-4 h-4 text-[var(--accent-600)]" aria-hidden="true" /> Post an announcement
              </h2>
              <div>
                <label htmlFor="ann-title" className={`block text-sm font-medium mb-1.5 ${textPrimary}`}>Title</label>
                <input id="ann-title" value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} placeholder="What’s the update?" className={`${commInput} min-h-11`} required />
              </div>
              <div>
                <label htmlFor="ann-body" className={`block text-sm font-medium mb-1.5 ${textPrimary}`}>Message</label>
                <textarea id="ann-body" rows={3} value={annBody} onChange={(e) => setAnnBody(e.target.value)} placeholder="Write it in clear, welcoming language" className={commInput} required />
              </div>
              <button type="submit" className={commPrimary}>Publish announcement</button>
            </form>
          )}

          {announcementsList.length === 0 ? (
            <EmptyState title="No announcements yet" description="Important community updates will show up here as soon as a team lead posts one." />
          ) : (
            (() => {
              const ordered = [...announcementsList.filter((a) => a.pinned), ...announcementsList.filter((a) => !a.pinned)];
              const [lead, ...rest] = ordered;
              return (
                <>
                  <article className={`${cardClass} p-6 sm:p-8 space-y-4 border-l-4 !border-l-[var(--spark)]`}>
                    <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-sm ${textSecondary}`}>
                      <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--accent-600)]">
                        <Pin className="w-3.5 h-3.5" aria-hidden="true" /> Pinned
                      </span>
                      <span>· {lead.author} · {lead.timestamp}</span>
                    </p>
                    <h2 className={`font-display text-xl sm:text-2xl max-w-[40ch] ${textPrimary}`}>{lead.title}</h2>
                    <p className={`text-base leading-relaxed max-w-[66ch] ${textPrimary}`}>{lead.content}</p>
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
          {/* The library leads */}
          <div className="lg:col-span-8 space-y-5 min-w-0">
            <div>
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
              <p className={`mt-2 text-sm tabular-nums ${textSecondary}`}>
                {filteredResources.length} {filteredResources.length === 1 ? 'resource' : 'resources'}
                {resSearch.trim() ? ' match your search' : ' shared by the community'}
              </p>
            </div>

            {filteredResources.length === 0 ? (
              <EmptyState
                title={resSearch.trim() ? 'Nothing matches that search' : 'The library is empty'}
                description={
                  resSearch.trim()
                    ? 'Try a shorter word, or search the web from the panel and save a good link.'
                    : 'Share the first guide, video or doc that helped you learn.'
                }
                actionLabel="Share a resource"
                onAction={() => setShowAddRes(true)}
              />
            ) : (
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredResources.map((r) => (
                  <li key={r.id} className="flex">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`${cardClass} studio-card-interactive p-5 flex flex-col justify-between gap-4 w-full`}
                    >
                      <div className="space-y-3">
                        <p className={`flex items-center gap-2 text-sm ${textSecondary}`}>
                          <Library className="w-4 h-4 text-[var(--accent-600)]" aria-hidden="true" />
                          <span className="font-semibold text-[var(--accent-600)]">{r.type}</span>
                          <span>· {r.category}</span>
                        </p>
                        <h2 className={`text-lg ${textPrimary}`}>{r.title}</h2>
                        <p className={`text-base leading-relaxed ${textSecondary}`}>{r.description}</p>
                      </div>
                      <div className={`pt-3 border-t ${borderClass} flex items-center justify-between gap-3 text-sm`}>
                        <span className={`${textSecondary} truncate`}>Shared by {r.addedBy}</span>
                        <span className="inline-flex items-center gap-1.5 font-medium text-[var(--accent-600)] shrink-0">
                          Open <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                          <span className="sr-only">{r.title} in a new tab</span>
                        </span>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Web search tucked away until you need it */}
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
          <ol className="space-y-4">
            {presentations.map((ev) => {
              const going = ev.attendees.includes(currentUserName);
              const reminded = (ev.reminders || []).includes(currentUserName);
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
                        <span className="font-semibold text-[var(--accent-600)]">{ev.type}</span> · hosted by {ev.presenter} · <span className="tabular-nums">{ev.attendees.length}</span> going
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
            {/* Open questions come first */}
            {(() => {
              const resolvedList = helpRequests.filter((h) => h.status === 'Resolved');
              const renderReply = (h: any, label: string) => (
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
                      <li key={r.id} className={`pl-4 py-1 border-l-4 border-[var(--accent-500)] text-base leading-relaxed max-w-[66ch]`}>
                        <strong className={`font-semibold ${textPrimary}`}>{r.responder}</strong>
                        <span className={textSecondary}> · {r.text}</span>
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
                        Every question has been answered. Ask your own below, or check back later.
                      </p>
                    ) : (
                      openHelpList.map((h) => (
                        <article key={h.id} className={`${cardClass} p-6 sm:p-6 space-y-4 border-l-4 !border-l-[var(--spark)]`}>
                          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span className={textSecondary}>
                              <strong className={`font-semibold ${textPrimary}`}>{h.author}</strong> · {h.field} · {h.createdAt}
                            </span>
                            <Badge variant="info">{h.status}</Badge>
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
                      ))
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
                    <button type="submit" className={commPrimary}>Post question</button>
                  </form>

                  {resolvedList.length > 0 && (
                    <section aria-labelledby="help-resolved" className="space-y-4">
                      <h2 id="help-resolved" className={`text-xl ${textSecondary}`}>
                        Resolved <span className="tabular-nums">({resolvedList.length})</span>
                      </h2>
                      {resolvedList.map((h) => (
                        <article key={h.id} className={`${cardClass} p-6 space-y-4 opacity-70 hover:opacity-100 focus-within:opacity-100 transition-opacity`}>
                          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span className={textSecondary}>
                              <strong className={`font-semibold ${textPrimary}`}>{h.author}</strong> · {h.field} · {h.createdAt}
                            </span>
                            <Badge variant="success">{h.status}</Badge>
                          </div>
                          <h3 className={`text-base ${textPrimary}`}>{h.helpNeeded}</h3>
                          <details className="group">
                            <summary className={`min-h-11 flex items-center gap-2 text-sm font-medium cursor-pointer list-none [&::-webkit-details-marker]:hidden text-[var(--accent-600)]`}>
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
                <span className={`text-sm tabular-nums whitespace-nowrap shrink-0 ${textSecondary}`}>{teamRoster.length} members</span>
              </div>
              <p className={`text-sm ${textSecondary}`}>Everyone here is learning and helping each other grow.</p>
              <ul className={`divide-y ${borderClass}`}>
                {teamRoster.map((m) => (
                  <li key={m.id} className="py-3 first:pt-1 last:pb-1 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-base font-semibold ${textPrimary}`}>{m.name}</span>
                      <span className="text-sm font-medium text-[var(--accent-600)]">{m.role || 'Member'}</span>
                    </div>
                    {(m.field || m.level) && <div className={`text-sm ${textSecondary}`}>{[m.field, m.level].filter(Boolean).join(' · ')}</div>}
                    {m.bio && <p className={`text-sm leading-relaxed ${textSecondary}`}>{m.bio}</p>}
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
