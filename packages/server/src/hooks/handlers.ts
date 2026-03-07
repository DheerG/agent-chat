import type { Services } from '../services/index.js';

export interface HookPayload {
  session_id: string;
  cwd: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: unknown;
  [key: string]: unknown;  // Allow additional fields
}

export interface HookResult {
  handled: boolean;
  action?: string;
}

/**
 * Resolve tenant from cwd (codebase path). Auto-creates if missing.
 * Returns tenantId.
 */
async function resolveTenant(services: Services, cwd: string): Promise<string> {
  // Extract project name from cwd path for the tenant name
  const name = cwd.split('/').filter(Boolean).pop() ?? 'unknown';
  const tenant = await services.tenants.upsertByCodebasePath(name, cwd);
  return tenant.id;
}

export async function handleSessionStart(
  services: Services,
  payload: HookPayload
): Promise<HookResult> {
  const tenantId = await resolveTenant(services, payload.cwd);

  // Create session channel (AGNT-04: auto-create channel on SessionStart)
  const channelName = `session-${payload.session_id}`;
  const channel = await services.channels.create(tenantId, {
    name: channelName,
    sessionId: payload.session_id,
    type: 'session',
  });

  // Update presence to active
  await services.presence.upsert(tenantId, {
    agentId: payload.session_id,
    channelId: channel.id,
    status: 'active',
  });

  // Post system message noting session start
  await services.messages.send(tenantId, {
    channelId: channel.id,
    senderId: 'system',
    senderName: 'System',
    senderType: 'system',
    content: `Session started: ${payload.session_id}`,
    messageType: 'text',
  });

  return { handled: true, action: 'channel_created' };
}

export async function handleSessionEnd(
  services: Services,
  payload: HookPayload
): Promise<HookResult> {
  const tenantId = await resolveTenant(services, payload.cwd);

  // Find channels for this session
  const channels = services.channels.listByTenant(tenantId);
  const sessionChannel = channels.find(c => c.sessionId === payload.session_id);

  if (sessionChannel) {
    // Update presence to idle
    await services.presence.upsert(tenantId, {
      agentId: payload.session_id,
      channelId: sessionChannel.id,
      status: 'idle',
    });

    // Post system message noting session end
    await services.messages.send(tenantId, {
      channelId: sessionChannel.id,
      senderId: 'system',
      senderName: 'System',
      senderType: 'system',
      content: `Session ended: ${payload.session_id}`,
      messageType: 'text',
    });
  }

  return { handled: true, action: 'session_ended' };
}

export async function handlePreToolUse(
  services: Services,
  payload: HookPayload
): Promise<HookResult> {
  const tenantId = await resolveTenant(services, payload.cwd);

  // Find the session channel
  const channels = services.channels.listByTenant(tenantId);
  const sessionChannel = channels.find(c => c.sessionId === payload.session_id);

  if (!sessionChannel) {
    return { handled: false, action: 'no_channel' };
  }

  // Store as event message (AGNT-03, AGNT-05)
  await services.messages.send(tenantId, {
    channelId: sessionChannel.id,
    senderId: payload.session_id,
    senderName: `agent-${payload.session_id.slice(0, 8)}`,
    senderType: 'hook',
    content: `Tool call: ${payload.tool_name ?? 'unknown'}`,
    messageType: 'event',
    metadata: {
      tool_name: payload.tool_name ?? 'unknown',
      tool_input: payload.tool_input ?? {},
      phase: 'pre',
    },
  });

  return { handled: true, action: 'event_stored' };
}

export async function handlePostToolUse(
  services: Services,
  payload: HookPayload
): Promise<HookResult> {
  const tenantId = await resolveTenant(services, payload.cwd);

  const channels = services.channels.listByTenant(tenantId);
  const sessionChannel = channels.find(c => c.sessionId === payload.session_id);

  if (!sessionChannel) {
    return { handled: false, action: 'no_channel' };
  }

  // Truncate tool output for storage (keep first 1000 chars)
  const toolOutput = payload.tool_output != null
    ? String(payload.tool_output).slice(0, 1000)
    : '';

  await services.messages.send(tenantId, {
    channelId: sessionChannel.id,
    senderId: payload.session_id,
    senderName: `agent-${payload.session_id.slice(0, 8)}`,
    senderType: 'hook',
    content: `Tool result: ${payload.tool_name ?? 'unknown'}`,
    messageType: 'event',
    metadata: {
      tool_name: payload.tool_name ?? 'unknown',
      tool_input: payload.tool_input ?? {},
      tool_output_summary: toolOutput,
      phase: 'post',
    },
  });

  // Update presence (heartbeat)
  await services.presence.upsert(tenantId, {
    agentId: payload.session_id,
    channelId: sessionChannel.id,
    status: 'active',
  });

  return { handled: true, action: 'event_stored' };
}

export async function handleNotification(
  services: Services,
  payload: HookPayload
): Promise<HookResult> {
  const tenantId = await resolveTenant(services, payload.cwd);

  const channels = services.channels.listByTenant(tenantId);
  const sessionChannel = channels.find(c => c.sessionId === payload.session_id);

  if (!sessionChannel) {
    return { handled: false, action: 'no_channel' };
  }

  await services.messages.send(tenantId, {
    channelId: sessionChannel.id,
    senderId: payload.session_id,
    senderName: `agent-${payload.session_id.slice(0, 8)}`,
    senderType: 'hook',
    content: JSON.stringify(payload),
    messageType: 'hook',
  });

  return { handled: true, action: 'notification_stored' };
}

/**
 * Dispatch hook event to the appropriate handler.
 * Unknown event types return { handled: false } — they are acknowledged but not stored.
 */
export async function dispatchHookEvent(
  services: Services,
  eventType: string,
  payload: HookPayload
): Promise<HookResult> {
  switch (eventType) {
    case 'SessionStart':
      return handleSessionStart(services, payload);
    case 'SessionEnd':
      return handleSessionEnd(services, payload);
    case 'PreToolUse':
      return handlePreToolUse(services, payload);
    case 'PostToolUse':
      return handlePostToolUse(services, payload);
    case 'Notification':
      return handleNotification(services, payload);
    default:
      // Unknown event types are silently acknowledged (return 200 OK)
      return { handled: false, action: 'discarded' };
  }
}
