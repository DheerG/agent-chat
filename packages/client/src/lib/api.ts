import type { Tenant, Channel, Message, Presence, PaginationOpts } from '@agent-chat/shared';

const BASE_URL = '/api';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchTenants(): Promise<Tenant[]> {
  const data = await fetchJson<{ tenants: Tenant[] }>(`${BASE_URL}/tenants`);
  return data.tenants;
}

export async function fetchChannels(tenantId: string): Promise<Channel[]> {
  const data = await fetchJson<{ channels: Channel[] }>(`${BASE_URL}/tenants/${tenantId}/channels`);
  return data.channels;
}

export async function fetchMessages(
  tenantId: string,
  channelId: string,
  opts?: PaginationOpts
): Promise<{ messages: Message[]; pagination: { hasMore: boolean; nextCursor?: string; prevCursor?: string } }> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.before) params.set('before', opts.before);
  if (opts?.after) params.set('after', opts.after);
  const qs = params.toString();
  return fetchJson(`${BASE_URL}/tenants/${tenantId}/channels/${channelId}/messages${qs ? `?${qs}` : ''}`);
}

export async function sendMessage(
  tenantId: string,
  channelId: string,
  content: string,
  parentMessageId?: string
): Promise<Message> {
  const data = await fetchJson<{ message: Message }>(
    `${BASE_URL}/tenants/${tenantId}/channels/${channelId}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: 'human-user',
        senderName: 'Human',
        senderType: 'human' as const,
        content,
        messageType: 'text' as const,
        ...(parentMessageId ? { parentMessageId } : {}),
      }),
    }
  );
  return data.message;
}

export async function fetchPresence(tenantId: string, channelId: string): Promise<Presence[]> {
  const data = await fetchJson<{ presence: Presence[] }>(
    `${BASE_URL}/tenants/${tenantId}/channels/${channelId}/presence`
  );
  return data.presence;
}
