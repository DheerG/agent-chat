// ─── Conversation ──────────────────────────────────────────────────���

export interface Conversation {
  id: string;
  name: string;
  workspacePath: string | null;
  workspaceName: string | null;
  type: 'team';
  status: 'active' | 'idle' | 'completed' | 'inactive' | 'error';
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface ConversationSummary {
  conversationId: string;
  totalMessages: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageSender: string | null;
  activeSessionCount: number;
  totalSessionCount: number;
  startedAt: string | null;
  status: string;
}

export interface ConversationListItem extends Conversation {
  summary: ConversationSummary;
}

// ─── Session ────────────────────────────────────────────────────────

export interface Session {
  id: string;
  conversationId: string | null;
  agentName: string | null;
  agentType: 'leader' | 'teammate' | 'sub-agent' | null;
  model: string | null;
  cwd: string | null;
  status: 'pending' | 'active' | 'idle' | 'stopped';
  startedAt: string;
  endedAt: string | null;
  parentSessionId: string | null;
}

// ─── Message ────────────────────────────────────────────────────────

export type SenderType = 'agent' | 'human' | 'system' | 'lead';
export type MessageType =
  | 'text'
  | 'status'
  | 'error'
  | 'input_request'
  | 'system'
  | 'human'
  | 'lead';

export interface Message {
  id: string;
  conversationId: string;
  parentMessageId: string | null;
  senderId: string;
  senderName: string;
  senderType: SenderType;
  content: string;
  messageType: MessageType;
  metadata: Record<string, unknown>;
  createdAt: string;
  /** Real send/delivery time from the transcript; feed is ordered by this. */
  eventTime?: string | null;
}

// ─── Feed Items ─────────────────────────────────────────────────────

export interface FeedMessage {
  type: 'message';
  id: string;
  conversationId: string;
  parentMessageId: string | null;
  senderId: string;
  senderName: string;
  senderType: SenderType;
  content: string;
  messageType: MessageType;
  metadata: Record<string, unknown>;
  createdAt: string;
  eventTime?: string | null;
}

export type FeedItem = FeedMessage;

/** Per-member capture coverage — the completeness signal. */
export interface MemberCoverage {
  ownerName: string;
  byteOffset: number;
  fileSize: number;
  lastEventAt: string | null;
  updatedAt: string;
}

// ─── WebSocket Protocol ─────────────────────────────────────────────

// Client -> Server
export type WsClientMessage =
  | { type: 'subscribe'; conversationIds: string[] }
  | { type: 'subscribe_all' }
  | { type: 'unsubscribe'; conversationIds: string[] };

// Server -> Client
export type WsServerMessage =
  | { type: 'message'; conversationId: string; message: Message }
  | { type: 'summary_update'; conversationId: string; summary: ConversationSummary }
  // Sent when the server dropped broadcast events under load (a large backfill):
  // the client should refetch, since an open feed can't recover the gap live.
  | { type: 'resync' };

// ─── Pagination ─────────────────────────────────────────────────────

export interface PaginationOpts {
  limit?: number;
  before?: string;
  after?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}
