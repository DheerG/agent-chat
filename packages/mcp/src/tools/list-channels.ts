import type { Services } from '@agent-chat/server';
import type { Channel } from '@agent-chat/shared';

export interface ListChannelsResult {
  channels: Array<{
    id: string;
    name: string;
    type: string;
    sessionId: string | null;
    createdAt: string;
  }>;
}

export function handleListChannels(
  services: Services,
  tenantId: string
): ListChannelsResult {
  const channels = services.channels.listByTenant(tenantId);

  return {
    channels: channels.map((ch: Channel) => ({
      id: ch.id,
      name: ch.name,
      type: ch.type,
      sessionId: ch.sessionId,
      createdAt: ch.createdAt,
    })),
  };
}
