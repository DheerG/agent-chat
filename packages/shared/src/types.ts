// ─── Conversation ───────────────────────────────────────────────────

export interface Conversation {
  id: string;
  name: string;
  workspacePath: string | null;
  workspaceName: string | null;
  type: 'team' | 'solo';
  status: 'active' | 'idle' | 'completed' | 'inactive' | 'error';
  attentionNeeded: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface ConversationSummary {
  conversationId: string;
  totalEvents: number;
  totalErrors: number;
  filesTouchedCount: number;
  lastEventAt: string | null;
  totalMessages: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageSender: string | null;
  activeSessionCount: number;
  totalSessionCount: number;
  hasStopEvent: boolean;
  hasError: boolean;
  startedAt: string | null;
  endedAt: string | null;
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
  agentType: 'leader' | 'teammate' | 'sub-agent' | 'solo' | null;
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

// ─── Activity Event ─────────────────────────────────────────────────

export interface ActivityEvent {
  id: string;
  conversationId: string;
  sessionId: string;
  eventType: 'tool_use' | 'session_start' | 'session_end' | 'stop' | 'subagent_start' | 'subagent_stop' | 'user_prompt';
  toolName: string | null;
  filePaths: string[] | null;
  isError: boolean;
  summary: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ─── Document ───────────────────────────────────────────────────────

export interface Document {
  id: string;
  conversationId: string;
  title: string;
  content: string;
  contentType: 'text' | 'markdown' | 'json';
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
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

export interface FeedEventBatch {
  type: 'event_batch';
  id: string;
  conversationId: string;
  sessionId: string;
  count: number;
  toolNames: string[];
  startTime: string;
  endTime: string;
  firstEventId: string;
  lastEventId: string;
  errorCount: number;
}

export type FeedItem = FeedMessage | FeedEventBatch;

// ─── WebSocket Protocol ─────────────────────────────────────────────

// Client -> Server
export type WsClientMessage =
  | { type: 'subscribe'; conversationIds: string[] }
  | { type: 'subscribe_all' }
  | { type: 'unsubscribe'; conversationIds: string[] };

// Server -> Client
export type WsServerMessage =
  | { type: 'message'; conversationId: string; message: Message }
  | { type: 'activity'; conversationId: string; summary: ActivityBatchSummary }
  | { type: 'summary_update'; conversationId: string; summary: ConversationSummary }
  | { type: 'status_change'; conversationId: string; status: string; previousStatus: string }
  | { type: 'conversation_created'; conversation: ConversationListItem }
  | { type: 'conversation_lifecycle'; conversationId: string; action: 'archived' | 'restored' }
  | { type: 'session_event'; conversationId: string; sessionId: string; event: 'started' | 'stopped' | 'idle'; agentName?: string }
  | { type: 'attention_needed'; conversationId: string; sessionId: string; agentName: string; question: string; options?: string[] };

export interface ActivityBatchSummary {
  sessionId: string;
  eventCount: number;
  toolsUsed: string[];
  errorCount: number;
  lastTool: string | null;
  filesTouched: string[];
}

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
