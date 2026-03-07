// Tenant — represents one codebase/project workspace
export interface Tenant {
  id: string;          // ULID
  name: string;
  codebasePath: string; // unique — the project root path
  createdAt: string;   // ISO 8601
}

// Channel — a conversation thread within a tenant
export interface Channel {
  id: string;          // ULID
  tenantId: string;
  name: string;
  sessionId: string | null;  // nullable — null for manual channels
  type: 'session' | 'manual';
  createdAt: string;
  updatedAt: string;
}

// Message — append-only, immutable after insert
export interface Message {
  id: string;          // ULID
  channelId: string;
  tenantId: string;    // denormalized for query efficiency
  parentMessageId: string | null;  // null = top-level, non-null = thread reply
  senderId: string;
  senderName: string;
  senderType: 'agent' | 'human' | 'system' | 'hook';
  content: string;
  messageType: 'text' | 'event' | 'hook';
  metadata: Record<string, unknown>;  // parsed from JSON TEXT
  createdAt: string;   // ISO 8601
}

// Presence — current agent status in a channel
export interface Presence {
  agentId: string;
  tenantId: string;
  channelId: string;
  status: 'active' | 'idle';
  lastSeenAt: string;  // ISO 8601
}

// Query options
export interface PaginationOpts {
  limit?: number;     // default 50
  before?: string;    // cursor (message ULID) for pagination
  after?: string;     // cursor (message ULID) for pagination
}
