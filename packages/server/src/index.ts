// packages/server — AgentChat HTTP + WebSocket Server
// Phase 2: Domain Services and HTTP API
// Phase 4: Real-Time WebSocket Delivery
// Phase 11: Team Inbox Ingestion
import { EventEmitter } from 'events';
import { join } from 'path';
import { homedir } from 'os';
import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import { createDb } from './db/index.js';
import { WriteQueue } from './db/queue.js';
import { createServices } from './services/index.js';
import { createApp } from './http/app.js';
import { WebSocketHub } from './ws/index.js';
import { TeamInboxWatcher } from './watcher/index.js';
import { AutoArchiveService } from './services/AutoArchiveService.js';

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

// Create team inbox watcher (Phase 11)
const teamsDir = process.env['TEAMS_DIR'] ?? join(homedir(), '.claude', 'teams');
const teamWatcher = new TeamInboxWatcher(services, teamsDir);
teamWatcher.start().then(() => {
  console.log(JSON.stringify({ event: 'team_inbox_watcher_started', teamsDir }));
}).catch((err) => {
  console.error(JSON.stringify({ event: 'team_inbox_watcher_error', error: String(err) }));
});

// Create auto-archive service (Phase 20)
const autoArchive = new AutoArchiveService(services);
autoArchive.start();
console.log(JSON.stringify({ event: 'auto_archive_service_started' }));

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
// Order: stop auto-archive → stop watcher → close WebSocket → stop HTTP → drain writes → close DB → exit
process.once('SIGTERM', () => {
  console.log(JSON.stringify({ event: 'graceful_shutdown_started' }));

  // 0. Stop auto-archive timer (stop scheduling new cleanups)
  autoArchive.stop();

  // 1. Stop team inbox watcher (stop generating new writes)
  teamWatcher.stop();

  // 2. Close all WebSocket connections
  hub.closeAll();
  wss.close();

  // 3. Close HTTP server (stop accepting new connections, drain in-flight)
  server.close(async () => {
    // 4. Poll until all pending queue writes complete
    while (queue.pendingCount > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    // 5. Close database
    instance.close();
    console.log(JSON.stringify({ event: 'graceful_shutdown_complete' }));
    process.exit(0);
  });
});
