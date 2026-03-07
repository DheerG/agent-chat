import { describe, test, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { createDb, type DbInstance } from '../../db/index.js';
import { WriteQueue } from '../../db/queue.js';
import { createServices, type Services } from '../../services/index.js';
import { WebSocketHub } from '../WebSocketHub.js';
import type { WebSocket } from 'ws';
import type { Message } from '@agent-chat/shared';

// Mock WebSocket that captures sent data
interface MockWebSocket extends WebSocket {
  sent: string[];
  closeCalled: boolean;
}

function createMockWs(): MockWebSocket {
  const sent: string[] = [];
  const mock = {
    sent,
    closeCalled: false,
    send(data: string) {
      sent.push(data);
    },
    close(_code?: number, _reason?: string) {
      mock.closeCalled = true;
    },
    readyState: 1, // WebSocket.OPEN
  } as unknown as MockWebSocket;
  return mock;
}

function parseSent(ws: MockWebSocket): Array<Record<string, unknown>> {
  return ws.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
}

let instance: DbInstance;
let services: Services;
let emitter: EventEmitter;
let hub: WebSocketHub;

beforeEach(() => {
  instance = createDb(':memory:');
  const queue = new WriteQueue();
  emitter = new EventEmitter();
  services = createServices(instance, queue, emitter);
  hub = new WebSocketHub(services, emitter);
});

async function seedTenantAndChannel(codebasePath: string) {
  const tenant = await services.tenants.upsertByCodebasePath('test', codebasePath);
  const channel = await services.channels.create(tenant.id, { name: 'general' });
  return { tenant, channel };
}

describe('WebSocketHub', () => {
  test('subscribe adds client to channel and sends subscribed confirmation', async () => {
    const { tenant, channel } = await seedTenantAndChannel('/test/sub');
    const ws = createMockWs();
    hub.addClient(ws, tenant.id);

    hub.handleMessage(ws, JSON.stringify({ type: 'subscribe', channelId: channel.id }));

    const messages = parseSent(ws);
    expect(messages).toContainEqual({ type: 'subscribed', channelId: channel.id });
  });

  test('unsubscribe removes client from channel and sends unsubscribed confirmation', async () => {
    const { tenant, channel } = await seedTenantAndChannel('/test/unsub');
    const ws = createMockWs();
    hub.addClient(ws, tenant.id);

    hub.handleMessage(ws, JSON.stringify({ type: 'subscribe', channelId: channel.id }));
    hub.handleMessage(ws, JSON.stringify({ type: 'unsubscribe', channelId: channel.id }));

    const messages = parseSent(ws);
    expect(messages).toContainEqual({ type: 'unsubscribed', channelId: channel.id });
  });

  test('ping returns pong', () => {
    const ws = createMockWs();
    hub.addClient(ws, 'any-tenant');

    hub.handleMessage(ws, JSON.stringify({ type: 'ping' }));

    const messages = parseSent(ws);
    expect(messages).toContainEqual({ type: 'pong' });
  });

  test('tenant isolation — subscribe to channel of different tenant returns error', async () => {
    const { channel: channelA } = await seedTenantAndChannel('/test/tenantA');
    const tenantB = await services.tenants.upsertByCodebasePath('B', '/test/tenantB');

    const ws = createMockWs();
    hub.addClient(ws, tenantB.id); // Connected as tenant B

    hub.handleMessage(ws, JSON.stringify({ type: 'subscribe', channelId: channelA.id }));

    const messages = parseSent(ws);
    const errorMsg = messages.find((m) => m.type === 'error');
    expect(errorMsg).toBeDefined();
    expect(errorMsg!.code).toBe('CHANNEL_NOT_FOUND');
  });

  test('broadcast sends to subscribed clients only', async () => {
    const { tenant, channel } = await seedTenantAndChannel('/test/broadcast');

    const wsSub = createMockWs();
    const wsNotSub = createMockWs();
    hub.addClient(wsSub, tenant.id);
    hub.addClient(wsNotSub, tenant.id);

    hub.handleMessage(wsSub, JSON.stringify({ type: 'subscribe', channelId: channel.id }));
    // wsNotSub does NOT subscribe

    // Clear sent arrays to only capture broadcast
    wsSub.sent.length = 0;
    wsNotSub.sent.length = 0;

    // Emit a message:created event
    const fakeMessage: Message = {
      id: 'test-msg-id',
      channelId: channel.id,
      tenantId: tenant.id,
      parentMessageId: null,
      senderId: 'agent-1',
      senderName: 'Agent',
      senderType: 'agent',
      content: 'Hello broadcast',
      messageType: 'text',
      metadata: {},
      createdAt: new Date().toISOString(),
    };
    emitter.emit('message:created', fakeMessage);

    // Subscribed client should have received the message
    const subMessages = parseSent(wsSub);
    expect(subMessages.length).toBe(1);
    expect(subMessages[0].type).toBe('message');
    expect((subMessages[0].message as Message).content).toBe('Hello broadcast');

    // Non-subscribed client should NOT have received anything
    expect(wsNotSub.sent.length).toBe(0);
  });

  test('disconnect cleans up all subscriptions', async () => {
    const { tenant, channel } = await seedTenantAndChannel('/test/disconnect');

    const ws = createMockWs();
    hub.addClient(ws, tenant.id);
    hub.handleMessage(ws, JSON.stringify({ type: 'subscribe', channelId: channel.id }));

    expect(hub.clientCount).toBe(1);

    hub.handleDisconnect(ws);

    expect(hub.clientCount).toBe(0);

    // After disconnect, broadcast should not crash and should not deliver
    const fakeMessage: Message = {
      id: 'test-msg-id',
      channelId: channel.id,
      tenantId: tenant.id,
      parentMessageId: null,
      senderId: 'agent-1',
      senderName: 'Agent',
      senderType: 'agent',
      content: 'after disconnect',
      messageType: 'text',
      metadata: {},
      createdAt: new Date().toISOString(),
    };
    // Should not throw
    emitter.emit('message:created', fakeMessage);
  });

  test('invalid JSON from client returns parse error', () => {
    const ws = createMockWs();
    hub.addClient(ws, 'any-tenant');

    hub.handleMessage(ws, 'not valid json{{{');

    const messages = parseSent(ws);
    const errorMsg = messages.find((m) => m.type === 'error');
    expect(errorMsg).toBeDefined();
    expect(errorMsg!.code).toBe('PARSE_ERROR');
  });

  test('subscribe with lastSeenId triggers catch-up message delivery', async () => {
    const { tenant, channel } = await seedTenantAndChannel('/test/catchup');

    // Insert some messages
    const msg1 = await services.messages.send(tenant.id, {
      channelId: channel.id,
      senderId: 'agent-1',
      senderName: 'Agent',
      senderType: 'agent',
      content: 'old message',
    });
    await new Promise((r) => setTimeout(r, 2));
    await services.messages.send(tenant.id, {
      channelId: channel.id,
      senderId: 'agent-1',
      senderName: 'Agent',
      senderType: 'agent',
      content: 'missed message 1',
    });
    await new Promise((r) => setTimeout(r, 2));
    await services.messages.send(tenant.id, {
      channelId: channel.id,
      senderId: 'agent-1',
      senderName: 'Agent',
      senderType: 'agent',
      content: 'missed message 2',
    });

    const ws = createMockWs();
    hub.addClient(ws, tenant.id);

    // Subscribe with lastSeenId = msg1.id (should get missed messages after msg1)
    hub.handleMessage(ws, JSON.stringify({
      type: 'subscribe',
      channelId: channel.id,
      lastSeenId: msg1.id,
    }));

    const messages = parseSent(ws);
    const catchup = messages.find((m) => m.type === 'catchup');
    expect(catchup).toBeDefined();
    const catchupMessages = catchup!.messages as Message[];
    expect(catchupMessages.length).toBe(2);
    expect(catchupMessages[0].content).toBe('missed message 1');
    expect(catchupMessages[1].content).toBe('missed message 2');

    // Should also have subscribed confirmation
    const subscribed = messages.find((m) => m.type === 'subscribed');
    expect(subscribed).toBeDefined();
  });

  test('closeAll sends close to all clients', async () => {
    const { tenant } = await seedTenantAndChannel('/test/closeall');
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    hub.addClient(ws1, tenant.id);
    hub.addClient(ws2, tenant.id);

    expect(hub.clientCount).toBe(2);

    hub.closeAll();

    expect(hub.clientCount).toBe(0);
    expect(ws1.closeCalled).toBe(true);
    expect(ws2.closeCalled).toBe(true);
  });
});
