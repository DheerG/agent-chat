// packages/server — AgentChat HTTP + WebSocket Server
// Phase 2: Domain Services and HTTP API
// Phase 4: Real-Time WebSocket Delivery
import { EventEmitter } from 'events';
import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import { createDb } from './db/index.js';
import { WriteQueue } from './db/queue.js';
import { createServices } from './services/index.js';
import { createApp } from './http/app.js';
import { WebSocketHub } from './ws/index.js';

const port = Number(process.env['PORT'] ?? 5555);

// Initialize data layer
const instance = createDb();
const queue = new WriteQueue();

// Event bus for real-time delivery
const emitter = new EventEmitter();

// Initialize services (with emitter for WebSocket broadcast)
const services = createServices(instance, queue, emitter);
const app = createApp(services);

// Create WebSocket hub
const hub = new WebSocketHub(services, emitter);

// Start HTTP server
const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(JSON.stringify({ event: 'server_started', port: info.port }));
});

// WebSocket server in noServer mode — we handle upgrade manually
const wss = new WebSocketServer({ noServer: true });

// Handle WebSocket upgrade requests
server.on('upgrade', (req, socket, head) => {
  // Parse tenantId from URL query string: /ws?tenantId=xxx
  const url = new URL(req.url ?? '', `http://localhost:${port}`);

  if (url.pathname !== '/ws') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  const tenantId = url.searchParams.get('tenantId');
  if (!tenantId) {
    socket.write('HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\n\r\nMissing tenantId query parameter');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    // Register the client with the hub
    hub.addClient(ws, tenantId);

    // Forward messages and disconnects to the hub
    ws.on('message', (data) => {
      hub.handleMessage(ws, data.toString());
    });

    ws.on('close', () => {
      hub.handleDisconnect(ws);
    });

    ws.on('error', () => {
      hub.handleDisconnect(ws);
    });

    wss.emit('connection', ws, req);
  });
});

// Graceful shutdown on SIGTERM
// Order: close WebSocket connections → stop accepting new HTTP → drain writes → close DB → exit
process.once('SIGTERM', () => {
  console.log(JSON.stringify({ event: 'graceful_shutdown_started' }));

  // 1. Close all WebSocket connections
  hub.closeAll();
  wss.close();

  // 2. Close HTTP server (stop accepting new connections, drain in-flight)
  server.close(async () => {
    // 3. Poll until all pending queue writes complete
    while (queue.pendingCount > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    // 4. Close database
    instance.close();
    console.log(JSON.stringify({ event: 'graceful_shutdown_complete' }));
    process.exit(0);
  });
});
