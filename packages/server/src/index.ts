// AgentChat v2 — HTTP + WebSocket Server
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

const port = Number(process.env['PORT'] ?? 5555);

const instance = createDb();
const queue = new WriteQueue();
const emitter = new EventEmitter();
const services = createServices(instance, queue, emitter);
const app = createApp(services);

const hub = new WebSocketHub(services, emitter);

const teamsDir = process.env['TEAMS_DIR'] ?? join(homedir(), '.claude', 'teams');
const teamWatcher = new TeamInboxWatcher(services, teamsDir);
teamWatcher.start().then(() => {
  console.log(JSON.stringify({ event: 'team_inbox_watcher_started', teamsDir }));
}).catch((err) => {
  console.error(JSON.stringify({ event: 'team_inbox_watcher_error', error: String(err) }));
});

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(JSON.stringify({ event: 'server_started', port: info.port }));
});

// Global WebSocket — no tenant scoping
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '', `http://localhost:${port}`);

  if (url.pathname !== '/ws') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    hub.addClient(ws);

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

// Graceful shutdown
process.once('SIGTERM', () => {
  console.log(JSON.stringify({ event: 'graceful_shutdown_started' }));
  teamWatcher.stop();
  hub.closeAll();
  wss.close();

  server.close(async () => {
    while (queue.pendingCount > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    instance.close();
    console.log(JSON.stringify({ event: 'graceful_shutdown_complete' }));
    process.exit(0);
  });
});
