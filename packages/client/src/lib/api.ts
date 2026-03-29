import type { ConversationListItem, Message, FeedItem, Document, Session, ConversationSummary } from '@agent-chat/shared';

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

// Feed (interleaved messages + event batches)
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

// Events (for expanding batches)
export async function fetchEvents(conversationId: string, opts?: { after?: string; before?: string; limit?: number }): Promise<{
  events: Array<{ id: string; eventType: string; toolName: string | null; summary: string | null; isError: boolean; createdAt: string; metadata: Record<string, unknown> }>;
}> {
  const params = new URLSearchParams();
  if (opts?.after) params.set('after', opts.after);
  if (opts?.before) params.set('before', opts.before);
  if (opts?.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return fetchJson(`${BASE_URL}/conversations/${conversationId}/events${qs ? `?${qs}` : ''}`);
}

// Messages
export async function sendMessage(conversationId: string, content: string, parentMessageId?: string): Promise<Message> {
  const data = await fetchJson<{ message: Message }>(`${BASE_URL}/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, parentMessageId }),
  });
  return data.message;
}

// Documents
export async function fetchDocuments(conversationId: string): Promise<Document[]> {
  const data = await fetchJson<{ documents: Document[] }>(`${BASE_URL}/conversations/${conversationId}/documents`);
  return data.documents;
}

// Archive/Restore
export async function archiveConversation(id: string): Promise<void> {
  await fetchJson(`${BASE_URL}/conversations/${id}/archive`, { method: 'PATCH' });
}

export async function restoreConversation(id: string): Promise<void> {
  await fetchJson(`${BASE_URL}/conversations/${id}/restore`, { method: 'PATCH' });
}
