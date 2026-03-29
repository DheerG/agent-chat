import type { Services } from '../services/index.js';
import { extractFilePaths, detectError } from '../services/ActivityEventService.js';

export interface HookPayload {
  session_id: string;
  cwd: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: unknown;
  stop_reason?: string;
  [key: string]: unknown;
}

export interface HookResult {
  handled: boolean;
  action?: string;
  conversationId?: string;
}

// ─── Pending Sessions ───────────────────────────────────────────────
// Sessions that arrive before team discovery. 30s TTL.

interface PendingSession {
  sessionId: string;
  cwd: string;
  eventCount: number;
  hasError: boolean;
  hasDocument: boolean;
  createdAt: number;
  timer: ReturnType<typeof setTimeout>;
}

const pendingSessions = new Map<string, PendingSession>();
const PENDING_TTL_MS = 30_000;
const MATERIALIZATION_THRESHOLD = 5;
const MATERIALIZATION_MIN_AGE_MS = 60_000;

function clearPending(sessionId: string): void {
  const pending = pendingSessions.get(sessionId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingSessions.delete(sessionId);
  }
}

export function getPendingSessions(): Map<string, PendingSession> {
  return pendingSessions;
}

async function resolveConversation(
  services: Services,
  sessionId: string,
  cwd: string,
): Promise<string | null> {
  // 1. Check if session already has a conversation
  const session = services.sessions.getById(sessionId);
  if (session?.conversationId) return session.conversationId;

  // 2. Session exists but no conversation — still pending
  // 3. Session doesn't exist — create pending
  return null;
}

async function materializeSoloConversation(
  services: Services,
  sessionId: string,
  cwd: string,
): Promise<string> {
  const workspaceName = cwd.split('/').filter(Boolean).pop() ?? 'unknown';
  const shortId = sessionId.slice(0, 8);
  const conversation = await services.conversations.create({
    name: `session-${shortId}`,
    workspacePath: cwd,
    workspaceName,
    type: 'solo',
  });

  await services.sessions.upsert({
    id: sessionId,
    conversationId: conversation.id,
    agentType: 'solo',
    cwd,
  });

  await services.conversations.incrementSessionCount(conversation.id);

  clearPending(sessionId);
  return conversation.id;
}

function checkMaterialization(services: Services, sessionId: string, cwd: string): void {
  const pending = pendingSessions.get(sessionId);
  if (!pending) return;

  const shouldMaterialize =
    pending.hasError ||
    pending.hasDocument ||
    (pending.eventCount >= MATERIALIZATION_THRESHOLD &&
     Date.now() - pending.createdAt >= MATERIALIZATION_MIN_AGE_MS);

  if (shouldMaterialize) {
    void materializeSoloConversation(services, sessionId, cwd);
  }
}

// ─── Event Handlers ─────────────────────────────────────────────────

export async function handleSessionStart(
  services: Services,
  payload: HookPayload,
): Promise<HookResult> {
  const { session_id, cwd } = payload;

  // Register session
  await services.sessions.upsert({ id: session_id, cwd, status: 'active' });

  // Try to resolve conversation
  const conversationId = await resolveConversation(services, session_id, cwd);

  if (conversationId) {
    await services.sessions.upsert({ id: session_id, conversationId });
    await services.conversations.incrementSessionCount(conversationId);

    await services.activityEvents.record({
      conversationId, sessionId: session_id,
      eventType: 'session_start', summary: `Session started`,
    });

    await services.messages.send(conversationId, {
      senderId: 'system', senderName: 'System', senderType: 'system',
      content: `Session started: ${session_id.slice(0, 8)}`,
      messageType: 'system',
    });

    return { handled: true, action: 'session_started', conversationId };
  }

  // No conversation yet — create pending session with TTL
  const timer = setTimeout(() => {
    checkMaterialization(services, session_id, cwd);
  }, PENDING_TTL_MS);

  pendingSessions.set(session_id, {
    sessionId: session_id, cwd,
    eventCount: 0, hasError: false, hasDocument: false,
    createdAt: Date.now(), timer,
  });

  return { handled: true, action: 'session_pending' };
}

export async function handleSessionEnd(
  services: Services,
  payload: HookPayload,
): Promise<HookResult> {
  const { session_id } = payload;

  await services.sessions.markStopped(session_id);

  const session = services.sessions.getById(session_id);
  if (session?.conversationId) {
    await services.conversations.decrementActiveSessionCount(session.conversationId);
    await services.conversations.setStopEvent(session.conversationId);

    await services.activityEvents.record({
      conversationId: session.conversationId, sessionId: session_id,
      eventType: 'session_end', summary: 'Session ended',
    });

    await services.messages.send(session.conversationId, {
      senderId: 'system', senderName: 'System', senderType: 'system',
      content: `Session ended: ${session_id.slice(0, 8)}`,
      messageType: 'system',
    });

    return { handled: true, action: 'session_ended', conversationId: session.conversationId };
  }

  clearPending(session_id);
  return { handled: true, action: 'session_ended' };
}

export async function handleStop(
  services: Services,
  payload: HookPayload,
): Promise<HookResult> {
  const { session_id, stop_reason } = payload;

  await services.sessions.markStopped(session_id);

  const session = services.sessions.getById(session_id);
  if (session?.conversationId) {
    await services.conversations.decrementActiveSessionCount(session.conversationId);
    await services.conversations.setStopEvent(session.conversationId);

    await services.activityEvents.record({
      conversationId: session.conversationId, sessionId: session_id,
      eventType: 'stop', summary: `Stopped: ${stop_reason ?? 'unknown'}`,
      metadata: { stop_reason },
    });

    await services.messages.send(session.conversationId, {
      senderId: 'system', senderName: 'System', senderType: 'system',
      content: `Session stopped: ${session_id.slice(0, 8)} (${stop_reason ?? 'unknown'})`,
      messageType: 'system',
    });

    return { handled: true, action: 'session_stopped', conversationId: session.conversationId };
  }

  clearPending(session_id);
  return { handled: true, action: 'session_stopped' };
}

export async function handlePreToolUse(
  services: Services,
  payload: HookPayload,
): Promise<HookResult> {
  const { session_id, tool_name, tool_input, cwd } = payload;

  // Skip MCP tools
  if (services.activityEvents.isMcpTool(tool_name)) {
    return { handled: false, action: 'mcp_tool_skipped' };
  }

  const session = services.sessions.getById(session_id);
  const conversationId = session?.conversationId;

  if (conversationId) {
    const filePaths = extractFilePaths(tool_name ?? '', (tool_input ?? {}) as Record<string, unknown>);

    await services.activityEvents.record({
      conversationId, sessionId: session_id,
      eventType: 'tool_use',
      toolName: tool_name,
      filePaths: filePaths.length > 0 ? filePaths : undefined,
      summary: `Tool: ${tool_name ?? 'unknown'}`,
      metadata: { tool_input: tool_input ?? {}, phase: 'pre' },
    });

    await services.conversations.incrementEvents(conversationId, false);
    return { handled: true, action: 'event_stored', conversationId };
  }

  // Pending session — increment counter
  const pending = pendingSessions.get(session_id);
  if (pending) {
    pending.eventCount++;
    checkMaterialization(services, session_id, cwd);
  }

  return { handled: true, action: 'event_buffered' };
}

export async function handlePostToolUse(
  services: Services,
  payload: HookPayload,
): Promise<HookResult> {
  const { session_id, tool_name, tool_input, tool_output, cwd } = payload;

  if (services.activityEvents.isMcpTool(tool_name)) {
    return { handled: false, action: 'mcp_tool_skipped' };
  }

  const session = services.sessions.getById(session_id);
  const conversationId = session?.conversationId;
  const isError = detectError(tool_output);

  if (conversationId) {
    const filePaths = extractFilePaths(tool_name ?? '', (tool_input ?? {}) as Record<string, unknown>);

    await services.activityEvents.record({
      conversationId, sessionId: session_id,
      eventType: 'tool_use',
      toolName: tool_name,
      filePaths: filePaths.length > 0 ? filePaths : undefined,
      isError,
      summary: `Tool result: ${tool_name ?? 'unknown'}`,
      metadata: {
        tool_input: tool_input ?? {},
        tool_output_summary: tool_output != null ? String(tool_output).slice(0, 500) : '',
        phase: 'post',
      },
    });

    await services.conversations.incrementEvents(conversationId, isError);

    if (isError) {
      await services.conversations.updateStatus(conversationId, 'error');
    }

    return { handled: true, action: 'event_stored', conversationId };
  }

  // Pending session
  const pending = pendingSessions.get(session_id);
  if (pending) {
    pending.eventCount++;
    if (isError) pending.hasError = true;
    checkMaterialization(services, session_id, cwd);
  }

  return { handled: true, action: 'event_buffered' };
}

export async function handleSubagentStart(
  services: Services,
  payload: HookPayload,
): Promise<HookResult> {
  const { session_id, cwd } = payload;
  const parentSessionId = (payload['parent_session_id'] as string) ?? session_id;

  const parentSession = services.sessions.getById(parentSessionId);
  const conversationId = parentSession?.conversationId;

  await services.sessions.upsert({
    id: session_id, conversationId: conversationId ?? undefined,
    agentType: 'sub-agent', cwd, parentSessionId,
  });

  if (conversationId) {
    await services.conversations.incrementSessionCount(conversationId);
    await services.activityEvents.record({
      conversationId, sessionId: session_id,
      eventType: 'subagent_start', summary: `Sub-agent started`,
    });
    return { handled: true, action: 'subagent_registered', conversationId };
  }

  return { handled: true, action: 'subagent_registered' };
}

export async function handleSubagentStop(
  services: Services,
  payload: HookPayload,
): Promise<HookResult> {
  const { session_id } = payload;

  await services.sessions.markStopped(session_id);

  const session = services.sessions.getById(session_id);
  if (session?.conversationId) {
    await services.conversations.decrementActiveSessionCount(session.conversationId);
    await services.activityEvents.record({
      conversationId: session.conversationId, sessionId: session_id,
      eventType: 'subagent_stop', summary: 'Sub-agent stopped',
    });
    return { handled: true, action: 'subagent_stopped', conversationId: session.conversationId };
  }

  return { handled: true, action: 'subagent_stopped' };
}

export async function handleUserPromptSubmit(
  services: Services,
  payload: HookPayload,
): Promise<HookResult> {
  const { session_id } = payload;

  const session = services.sessions.getById(session_id);
  if (session?.conversationId) {
    await services.activityEvents.record({
      conversationId: session.conversationId, sessionId: session_id,
      eventType: 'user_prompt',
      summary: 'User submitted prompt',
      metadata: { prompt: payload['prompt'] ?? '' },
    });
    return { handled: true, action: 'user_prompt_recorded', conversationId: session.conversationId };
  }

  return { handled: true, action: 'user_prompt_recorded' };
}

export async function handleNotification(
  services: Services,
  payload: HookPayload,
): Promise<HookResult> {
  const { session_id } = payload;

  const session = services.sessions.getById(session_id);
  if (session?.conversationId) {
    await services.messages.send(session.conversationId, {
      senderId: session_id, senderName: `agent-${session_id.slice(0, 8)}`,
      senderType: 'system', content: JSON.stringify(payload),
      messageType: 'system',
    });
    return { handled: true, action: 'notification_stored', conversationId: session.conversationId };
  }

  return { handled: false, action: 'discarded' };
}

export async function dispatchHookEvent(
  services: Services,
  eventType: string,
  payload: HookPayload,
): Promise<HookResult> {
  switch (eventType) {
    case 'SessionStart': return handleSessionStart(services, payload);
    case 'SessionEnd': return handleSessionEnd(services, payload);
    case 'Stop': return handleStop(services, payload);
    case 'PreToolUse': return handlePreToolUse(services, payload);
    case 'PostToolUse': return handlePostToolUse(services, payload);
    case 'SubagentStart': return handleSubagentStart(services, payload);
    case 'SubagentStop': return handleSubagentStop(services, payload);
    case 'UserPromptSubmit': return handleUserPromptSubmit(services, payload);
    case 'Notification': return handleNotification(services, payload);
    default: return { handled: false, action: 'discarded' };
  }
}
