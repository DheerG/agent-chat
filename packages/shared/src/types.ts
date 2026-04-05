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

export interface Message {
  id: string;
  conversationId: string;
  parentMessageId: string | null;
  senderId: string;
  senderName: string;
  senderType: 'agent' | 'human' | 'system';
  content: string;
  messageType: 'text' | 'status' | 'error' | 'input_request' | 'system';
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ─── Feed Items ─────────────────────────────────────────────────────

export interface FeedMessage {
  type: 'message';
  id: string;
  conversationId: string;
  parentMessageId: string | null;
  senderId: string;
  senderName: string;
  senderType: 'agent' | 'human' | 'system';
  content: string;
  messageType: 'text' | 'status' | 'error' | 'input_request' | 'system';
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type FeedItem = FeedMessage;

// ─── WebSocket Protocol ─────────────────────────────────────────────

// Client -> Server
export type WsClientMessage =
  | { type: 'subscribe'; conversationIds: string[] }
  | { type: 'subscribe_all' }
  | { type: 'unsubscribe'; conversationIds: string[] };

// Server -> Client
export type WsServerMessage =
  | { type: 'message'; conversationId: string; message: Message }
  | { type: 'summary_update'; conversationId: string; summary: ConversationSummary };

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
