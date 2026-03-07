// packages/server — AgentChat HTTP Server
// Phase 2: Domain Services and HTTP API
import { serve } from '@hono/node-server';
import { createDb } from './db/index.js';
import { WriteQueue } from './db/queue.js';
import { createServices } from './services/index.js';
import { createApp } from './http/app.js';

const port = Number(process.env['PORT'] ?? 3000);

// Initialize data layer
const instance = createDb();
const queue = new WriteQueue();

// Initialize services and HTTP app
const services = createServices(instance, queue);
const app = createApp(services);

// Start HTTP server
const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(JSON.stringify({ event: 'server_started', port: info.port }));
});

// Graceful shutdown on SIGTERM
// Order: stop accepting new connections → drain in-flight writes → close DB → exit
process.once('SIGTERM', () => {
  console.log(JSON.stringify({ event: 'graceful_shutdown_started' }));
  server.close(async () => {
    // Poll until all pending queue writes complete (typically < 10ms per write)
    while (queue.pendingCount > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    instance.close();
    console.log(JSON.stringify({ event: 'graceful_shutdown_complete' }));
    process.exit(0);
  });
});
