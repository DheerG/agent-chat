import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { serve } from '@hono/node-server';
import { WebSocketServer, WebSocket } from 'ws';
import { createDb, type DbInstance } from '../../db/index.js';
import { WriteQueue } from '../../db/queue.js';
import { createServices, type Services } from '../../services/index.js';
import { createApp } from '../../http/app.js';
import { WebSocketHub } from '../index.js';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import type { Server } from 'http';
import type { Message } from '@agent-chat/shared';

// Test harness state
let instance: DbInstance;
let services: Services;
let hub: WebSocketHub;
let httpServer: Server;
let wss: WebSocketServer;
let port: number;
const clients: WebSocket[] = [];

function getBaseUrl() {
  return `http://localhost:${port}`;
}

function getWsUrl(tenantId: string) {
  return `ws://localhost:${port}/ws?tenantId=${tenantId}`;
}

async function connectWs(tenantId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(getWsUrl(tenantId));
    ws.on('open', () => {
      clients.push(ws);
      resolve(ws);
    });
    ws.on('error', reject);
  });
}

function waitForMessage(
  ws: WebSocket,
  type: string,
  timeoutMs = 2000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timeout waiting for '${type}' message`)),
      timeoutMs,
    );
    const handler = (data: WebSocket.Data) => {
      const parsed = JSON.parse(data.toString()) as Record<string, unknown>;
      if (parsed.type === type) {
        clearTimeout(timeout);
        ws.removeListener('message', handler);
        resolve(parsed);
      }
    };
    ws.on('message', handler);
  });
}

async function seedTenant(name: string, path: string) {
  const res = await fetch(`${getBaseUrl()}/api/tenants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, codebasePath: path }),
  });
  const body = (await res.json()) as { tenant: { id: string } };
  return body.tenant;
}

async function seedChannel(tenantId: string, name: string) {
  const res = await fetch(
    `${getBaseUrl()}/api/tenants/${tenantId}/channels`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    },
  );
  const body = (await res.json()) as { channel: { id: string } };
  return body.channel;
}

async function postMessage(
  tenantId: string,
  channelId: string,
  content: string,
  parentMessageId?: string,
) {
  const reqBody: Record<string, unknown> = {
    senderId: 'agent-test',
    senderName: 'Test Agent',
    senderType: 'agent',
    content,
  };
  if (parentMessageId) reqBody.parentMessageId = parentMessageId;
  const res = await fetch(
    `${getBaseUrl()}/api/tenants/${tenantId}/channels/${channelId}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    },
  );
  const result = (await res.json()) as { message: Message };
  return result.message;
}

beforeEach(async () => {
  instance = createDb(':memory:');
  const queue = new WriteQueue();
  const emitter = new EventEmitter();
  services = createServices(instance, queue, emitter);
  const app = createApp(services);
  hub = new WebSocketHub(services, emitter);

  wss = new WebSocketServer({ noServer: true });

  await new Promise<void>((resolve) => {
    httpServer = serve({ fetch: app.fetch, port: 0 }, (info) => {
      port = info.port;
      resolve();
    }) as unknown as Server;

    httpServer.on(
      'upgrade',
      (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const url = new URL(req.url ?? '', `http://localhost:${port}`);
        if (url.pathname !== '/ws') {
          socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
          socket.destroy();
          return;
        }
        const tenantId = url.searchParams.get('tenantId');
        if (!tenantId) {
          socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          hub.addClient(ws, tenantId);
          ws.on('message', (data) => hub.handleMessage(ws, data.toString()));
          ws.on('close', () => hub.handleDisconnect(ws));
          wss.emit('connection', ws, req);
        });
      },
    );
  });
});

afterEach(async () => {
  // Close all WebSocket clients
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.close();
  }
  clients.length = 0;
  hub.closeAll();
  wss.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  instance.close();
});

describe('SC-1: Sub-second message delivery', () => {
  test('message posted via REST appears on WebSocket client within 1 second', async () => {
    const tenant = await seedTenant('t1', '/test/sc1');
    const channel = await seedChannel(tenant.id, 'general');

    const ws = await connectWs(tenant.id);
    ws.send(JSON.stringify({ type: 'subscribe', channelId: channel.id }));
    await waitForMessage(ws, 'subscribed');

    const start = Date.now();
    const messagePromise = waitForMessage(ws, 'message', 1000);
    await postMessage(tenant.id, channel.id, 'hello real-time');
    const received = await messagePromise;
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(1000);
    expect((received.message as Message).content).toBe('hello real-time');
  });

  test('multiple clients all receive the broadcast', async () => {
    const tenant = await seedTenant('t-multi', '/test/multi');
    const channel = await seedChannel(tenant.id, 'general');

    const ws1 = await connectWs(tenant.id);
    const ws2 = await connectWs(tenant.id);
    ws1.send(JSON.stringify({ type: 'subscribe', channelId: channel.id }));
    ws2.send(JSON.stringify({ type: 'subscribe', channelId: channel.id }));
    await waitForMessage(ws1, 'subscribed');
    await waitForMessage(ws2, 'subscribed');

    const p1 = waitForMessage(ws1, 'message');
    const p2 = waitForMessage(ws2, 'message');
    await postMessage(tenant.id, channel.id, 'broadcast test');
    const [r1, r2] = await Promise.all([p1, p2]);

    expect((r1.message as Message).content).toBe('broadcast test');
    expect((r2.message as Message).content).toBe('broadcast test');
  });

  test('unsubscribed client does not receive messages', async () => {
    const tenant = await seedTenant('t-unsub', '/test/unsub');
    const channel = await seedChannel(tenant.id, 'general');

    const wsSub = await connectWs(tenant.id);
    const wsNoSub = await connectWs(tenant.id);
    wsSub.send(
      JSON.stringify({ type: 'subscribe', channelId: channel.id }),
    );
    await waitForMessage(wsSub, 'subscribed');
    // wsNoSub does NOT subscribe

    // Set up listener on unsubscribed client to track any received messages
    const unsubReceived: unknown[] = [];
    wsNoSub.on('message', (data) => {
      unsubReceived.push(JSON.parse(data.toString()));
    });

    const subPromise = waitForMessage(wsSub, 'message');
    await postMessage(tenant.id, channel.id, 'should not arrive on unsub');
    await subPromise; // Wait for subscribed client to receive

    // Give some time for any potential delivery to unsub client
    await new Promise((r) => setTimeout(r, 100));
    expect(unsubReceived.length).toBe(0);
  });

  test('tenant isolation - cross-tenant messages not delivered', async () => {
    const tenantA = await seedTenant('tA', '/test/tenantA');
    const tenantB = await seedTenant('tB', '/test/tenantB');
    const channelA = await seedChannel(tenantA.id, 'ch-a');
    const channelB = await seedChannel(tenantB.id, 'ch-b');

    const wsA = await connectWs(tenantA.id);
    const wsB = await connectWs(tenantB.id);
    wsA.send(
      JSON.stringify({ type: 'subscribe', channelId: channelA.id }),
    );
    wsB.send(
      JSON.stringify({ type: 'subscribe', channelId: channelB.id }),
    );
    await waitForMessage(wsA, 'subscribed');
    await waitForMessage(wsB, 'subscribed');

    // Track messages received by tenant B's client
    const bReceived: unknown[] = [];
    wsB.on('message', (data) => {
      bReceived.push(JSON.parse(data.toString()));
    });

    // Post to tenant A's channel
    const pA = waitForMessage(wsA, 'message');
    await postMessage(tenantA.id, channelA.id, 'tenant-a-msg');
    const rA = await pA;
    expect((rA.message as Message).content).toBe('tenant-a-msg');

    // wsB should not have received it
    await new Promise((r) => setTimeout(r, 100));
    expect(bReceived.length).toBe(0);
  });
});

describe('SC-2: Reconnect catch-up', () => {
  test('client with lastSeenId receives missed messages as catchup, then live', async () => {
    const tenant = await seedTenant('t-reconnect', '/test/reconnect');
    const channel = await seedChannel(tenant.id, 'general');

    // Post some messages before client connects
    await postMessage(tenant.id, channel.id, 'before-disconnect-1');
    const msg2 = await postMessage(
      tenant.id,
      channel.id,
      'before-disconnect-2',
    );
    await postMessage(tenant.id, channel.id, 'missed-1');
    await postMessage(tenant.id, channel.id, 'missed-2');

    // Client connects and subscribes with lastSeenId = msg2.id
    const ws = await connectWs(tenant.id);

    // Set up listeners BEFORE sending subscribe so we don't miss fast responses
    const catchupPromise = waitForMessage(ws, 'catchup');
    const subscribedPromise = waitForMessage(ws, 'subscribed');

    ws.send(
      JSON.stringify({
        type: 'subscribe',
        channelId: channel.id,
        lastSeenId: msg2.id,
      }),
    );

    // Should receive both catchup and subscribed
    const catchup = await catchupPromise;
    expect(Array.isArray(catchup.messages)).toBe(true);
    const catchupMsgs = catchup.messages as Message[];
    expect(catchupMsgs.length).toBe(2);
    expect(catchupMsgs[0].content).toBe('missed-1');
    expect(catchupMsgs[1].content).toBe('missed-2');

    await subscribedPromise;

    // Now post a new message - should arrive live
    const livePromise = waitForMessage(ws, 'message');
    await postMessage(tenant.id, channel.id, 'live-after-reconnect');
    const live = await livePromise;
    expect((live.message as Message).content).toBe('live-after-reconnect');
  });

  test('catchup with no missed messages returns empty array', async () => {
    const tenant = await seedTenant('t-no-miss', '/test/no-miss');
    const channel = await seedChannel(tenant.id, 'general');

    const msg = await postMessage(tenant.id, channel.id, 'latest');

    const ws = await connectWs(tenant.id);
    const catchupPromise = waitForMessage(ws, 'catchup');
    ws.send(
      JSON.stringify({
        type: 'subscribe',
        channelId: channel.id,
        lastSeenId: msg.id,
      }),
    );

    const catchup = await catchupPromise;
    expect((catchup.messages as Message[]).length).toBe(0);
    expect(catchup.hasMore).toBe(false);
  });
});

describe('SC-3: Threaded reply delivery', () => {
  test('thread reply is delivered in real-time with parentMessageId', async () => {
    const tenant = await seedTenant('t-thread', '/test/thread');
    const channel = await seedChannel(tenant.id, 'general');

    const ws = await connectWs(tenant.id);
    ws.send(
      JSON.stringify({ type: 'subscribe', channelId: channel.id }),
    );
    await waitForMessage(ws, 'subscribed');

    // Post parent message
    const parentPromise = waitForMessage(ws, 'message');
    const parent = await postMessage(
      tenant.id,
      channel.id,
      'parent message',
    );
    await parentPromise;

    // Post thread reply
    const replyPromise = waitForMessage(ws, 'message');
    await postMessage(tenant.id, channel.id, 'thread reply', parent.id);
    const replyFrame = await replyPromise;

    const reply = replyFrame.message as Message;
    expect(reply.content).toBe('thread reply');
    expect(reply.parentMessageId).toBe(parent.id);
    expect(reply.channelId).toBe(channel.id);
  });
});
