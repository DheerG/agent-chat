import type { EventEmitter } from 'events';
import type { ActivityEvent } from '@agent-chat/shared';
import type { createActivityEventQueries } from '../db/queries/activity-events.js';

type ActivityQueries = ReturnType<typeof createActivityEventQueries>;

// MCP tool names that should NOT be recorded as activity events
const MCP_TOOL_NAMES = new Set([
  'send_message', 'read_conversation', 'list_conversations',
  'create_document', 'read_document', 'update_document', 'list_documents',
  'get_team_context', 'get_agent_activity', 'checkin', 'get_team_members',
  'report_status', 'report_error', 'request_input',
]);

export class ActivityEventService {
  constructor(
    private q: ActivityQueries,
    private emitter?: EventEmitter,
  ) {}

  isMcpTool(toolName: string | undefined): boolean {
    return toolName ? MCP_TOOL_NAMES.has(toolName) : false;
  }

  async record(data: {
    conversationId: string;
    sessionId: string;
    eventType: ActivityEvent['eventType'];
    toolName?: string;
    filePaths?: string[];
    isError?: boolean;
    summary?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ActivityEvent> {
    const event = await this.q.insert(data);
    this.emitter?.emit('activity:created', event);
    return event;
  }

  getByConversation(conversationId: string, opts?: { after?: string; before?: string; limit?: number }): ActivityEvent[] {
    return this.q.getByConversation(conversationId, opts);
  }

  getBySession(sessionId: string, opts?: { after?: string; limit?: number }): ActivityEvent[] {
    return this.q.getBySession(sessionId, opts);
  }

  async backfillConversation(sessionIds: string[], conversationId: string): Promise<number> {
    return this.q.backfillConversation(sessionIds, conversationId);
  }

  getEventCountSince(conversationId: string, since: string): { total: number; errors: number } {
    return this.q.getEventCountSince(conversationId, since);
  }
}

export function extractFilePaths(toolName: string, toolInput: Record<string, unknown>): string[] {
  const paths: string[] = [];
  switch (toolName) {
    case 'Read':
    case 'Write':
    case 'Edit':
      if (typeof toolInput['file_path'] === 'string') paths.push(toolInput['file_path']);
      break;
    case 'Glob':
      if (typeof toolInput['pattern'] === 'string') paths.push(toolInput['pattern']);
      break;
    case 'Grep':
      if (typeof toolInput['path'] === 'string') paths.push(toolInput['path']);
      break;
  }
  return paths;
}

export function detectError(toolOutput: unknown): boolean {
  if (toolOutput == null) return false;
  const str = String(toolOutput);
  if (str.length > 2000) return false; // Skip large outputs
  const lower = str.toLowerCase();
  return lower.includes('error:') || lower.includes('exception') ||
    lower.includes('failed') || lower.includes('enoent') ||
    lower.includes('permission denied');
}
