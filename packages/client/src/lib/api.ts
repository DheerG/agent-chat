import type { ConversationListItem, FeedItem, Session, ConversationSummary } from '@agent-chat/shared';

const BASE_URL = '/api';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// Conversations
export async function fetchConversations(tab: 'active' | 'recent' | 'all' = 'active', limit = 50): Promise<ConversationListItem[]> {
  const data = await fetchJson<{ conversations: ConversationListItem[] }>(
    `${BASE_URL}/conversations?tab=${tab}&limit=${limit}`
  );
  return data.conversations;
}

export async function fetchConversation(id: string): Promise<{
  conversation: ConversationListItem;
  summary: ConversationSummary;
  sessions: Session[];
}> {
  return fetchJson(`${BASE_URL}/conversations/${id}`);
}

// Feed (messages)
export async function fetchFeed(conversationId: string, opts?: { limit?: number; after?: string }): Promise<{
  items: FeedItem[];
  pagination: { hasMore: boolean; nextCursor: string | null };
}> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.after) params.set('after', opts.after);
  const qs = params.toString();
  return fetchJson(`${BASE_URL}/conversations/${conversationId}/feed${qs ? `?${qs}` : ''}`);
}
