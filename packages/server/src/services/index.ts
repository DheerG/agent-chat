import type { EventEmitter } from 'events';
import type { DbInstance } from '../db/index.js';
import type { WriteQueue } from '../db/queue.js';
import { createTenantQueries } from '../db/queries/tenants.js';
import { createChannelQueries } from '../db/queries/channels.js';
import { createMessageQueries } from '../db/queries/messages.js';
import { createPresenceQueries } from '../db/queries/presence.js';
import { TenantService } from './TenantService.js';
import { ChannelService } from './ChannelService.js';
import { MessageService } from './MessageService.js';
import { PresenceService } from './PresenceService.js';

export { TenantService } from './TenantService.js';
export { ChannelService } from './ChannelService.js';
export { MessageService } from './MessageService.js';
export { PresenceService } from './PresenceService.js';
export type { PaginatedMessages, SendMessageData } from './MessageService.js';

export interface Services {
  tenants: TenantService;
  channels: ChannelService;
  messages: MessageService;
  presence: PresenceService;
}

export function createServices(
  instance: DbInstance,
  queue: WriteQueue,
  emitter?: EventEmitter,
): Services {
  const tenantQ = createTenantQueries(instance, queue);
  const channelQ = createChannelQueries(instance, queue);
  const messageQ = createMessageQueries(instance, queue);
  const presenceQ = createPresenceQueries(instance, queue);
  return {
    tenants: new TenantService(tenantQ),
    channels: new ChannelService(channelQ),
    messages: new MessageService(messageQ, emitter),
    presence: new PresenceService(presenceQ),
  };
}
