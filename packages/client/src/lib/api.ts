import type { ConversationListItem, FeedItem, Session, ConversationSummary, MemberCoverage } from '@agent-chat/shared';

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
  coverage: MemberCoverage[];
  messageCounts: Record<string, number>;
}> {
  return fetchJson(`${BASE_URL}/conversations/${id}`);
}

// Build version + update check (powers the update-available banner)
export interface VersionInfo {
  version: string;
  repo: string;
}

export async function fetchVersion(): Promise<VersionInfo> {
  return fetchJson(`${BASE_URL}/version`);
}

/**
 * Latest published (non-draft, non-prerelease) release tag from GitHub, or null
 * if it can't be determined. GitHub's /releases/latest already excludes drafts.
 */
export async function fetchLatestReleaseTag(repo: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string };
    return data.tag_name ?? null;
  } catch {
    return null;
  }
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

/** Fetch the ENTIRE feed by paging forward. Used by resync after a dropped-event
 *  backfill, where replacing with just the first page would lose live messages
 *  already shown and still miss the dropped ones. Bounded defensively. */
export async function fetchAllFeed(conversationId: string): Promise<FeedItem[]> {
  const all: FeedItem[] = [];
  let after: string | undefined;
  for (let i = 0; i < 1000; i++) {
    const page = await fetchFeed(conversationId, { limit: 200, after });
    all.push(...page.items);
    if (!page.pagination.hasMore || !page.pagination.nextCursor) break;
    after = page.pagination.nextCursor;
  }
  return all;
}
