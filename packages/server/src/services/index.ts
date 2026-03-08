import type { EventEmitter } from 'events';
import type { DbInstance } from '../db/index.js';
import type { WriteQueue } from '../db/queue.js';
import { createTenantQueries } from '../db/queries/tenants.js';
import { createChannelQueries } from '../db/queries/channels.js';
import { createMessageQueries } from '../db/queries/messages.js';
import { createPresenceQueries } from '../db/queries/presence.js';
import { createDocumentQueries } from '../db/queries/documents.js';
import { createCheckinQueries } from '../db/queries/checkins.js';
import { TenantService } from './TenantService.js';
import { ChannelService } from './ChannelService.js';
import { MessageService } from './MessageService.js';
import { PresenceService } from './PresenceService.js';
import { DocumentService } from './DocumentService.js';
import { CheckinService } from './CheckinService.js';

export { TenantService } from './TenantService.js';
export { ChannelService } from './ChannelService.js';
export { MessageService } from './MessageService.js';
export { PresenceService } from './PresenceService.js';
export { DocumentService } from './DocumentService.js';
export { CheckinService } from './CheckinService.js';
export type { PaginatedMessages, SendMessageData } from './MessageService.js';
export type { CreateDocumentData, UpdateDocumentData } from './DocumentService.js';

export interface Services {
  tenants: TenantService;
  channels: ChannelService;
  messages: MessageService;
  presence: PresenceService;
  documents: DocumentService;
  checkins: CheckinService;
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
  const documentQ = createDocumentQueries(instance, queue);
  const checkinQ = createCheckinQueries(instance, queue);
  return {
    tenants: new TenantService(tenantQ, channelQ),
    channels: new ChannelService(channelQ),
    messages: new MessageService(messageQ, emitter),
    presence: new PresenceService(presenceQ),
    documents: new DocumentService(documentQ, emitter),
    checkins: new CheckinService(checkinQ),
  };
}
