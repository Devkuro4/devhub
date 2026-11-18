import type { MentorChatMessage, MentorChatStore, MentorConversation } from '../types';

export const MAX_CHATS = 50;
export const MAX_MESSAGES_PER_CHAT = 200;

export const EMPTY_STORE: MentorChatStore = { activeId: null, chats: [] };

/**
 * Accepts whatever was saved before and returns the current shape.
 * - new shape: { activeId, chats }
 * - old shape (one long conversation): an array of messages, turned into a single chat
 * - nothing / garbage: an empty store
 */
export function normalizeStore(raw: unknown): MentorChatStore {
  if (Array.isArray(raw)) {
    const messages = raw.filter((m: any) => m && typeof m.text === 'string') as MentorChatMessage[];
    if (!messages.length) return EMPTY_STORE;
    const first = messages.find((m) => m.sender === 'user');
    const at = messages[0]?.at || new Date().toISOString();
    const chat: MentorConversation = {
      id: 'c-imported',
      title: chatTitle(first?.text || 'Earlier chat'),
      createdAt: at,
      updatedAt: messages[messages.length - 1]?.at || at,
      messages,
    };
    return { activeId: chat.id, chats: [chat] };
  }
  if (raw && typeof raw === 'object' && Array.isArray((raw as any).chats)) {
    const r = raw as MentorChatStore;
    return { activeId: r.activeId ?? null, chats: r.chats.filter((c) => c && Array.isArray(c.messages)) };
  }
  return EMPTY_STORE;
}

// A short title taken from the first thing the member asked, like ChatGPT does.
export function chatTitle(text: string): string {
  const clean = text.replace(/```[\s\S]*?```/g, ' code ').replace(/\s+/g, ' ').trim();
  if (!clean) return 'New chat';
  return clean.length > 42 ? `${clean.slice(0, 42).trim()}…` : clean;
}

// Groups chats the way a chat sidebar does: Today, Yesterday, Previous 7 days, Older.
export function groupChats(chats: MentorConversation[]): { label: string; items: MentorConversation[] }[] {
  const sorted = [...chats].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const day = 24 * 60 * 60 * 1000;
  const buckets: Record<string, MentorConversation[]> = { Today: [], Yesterday: [], 'Previous 7 days': [], Older: [] };
  sorted.forEach((c) => {
    const t = new Date(c.updatedAt).getTime();
    if (t >= startOfToday.getTime()) buckets.Today.push(c);
    else if (t >= startOfToday.getTime() - day) buckets.Yesterday.push(c);
    else if (t >= startOfToday.getTime() - 7 * day) buckets['Previous 7 days'].push(c);
    else buckets.Older.push(c);
  });
  return Object.entries(buckets)
    .filter(([, items]) => items.length)
    .map(([label, items]) => ({ label, items }));
}
