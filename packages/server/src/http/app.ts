import { Hono } from 'hono';
import type { Services } from '../services/index.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRoutes } from './routes/health.js';
import { tenantRoutes } from './routes/tenants.js';
import { channelRoutes } from './routes/channels.js';
import { messageRoutes } from './routes/messages.js';
import { hookRoutes } from './routes/hooks.js';

export function createApp(services: Services): Hono {
  const app = new Hono();

  // Middleware
  app.use('*', requestLogger());
  app.onError(errorHandler);

  // Routes
  app.route('/health', healthRoutes());
  app.route('/api/tenants', tenantRoutes(services));

  // Channel routes nested under tenants
  // Hono propagates :tenantId param to nested routers when mounted at parameterized paths
  app.route('/api/tenants/:tenantId/channels', channelRoutes(services));

  // Message routes nested under channels
  app.route('/api/tenants/:tenantId/channels/:channelId/messages', messageRoutes(services));

  // Hook receiver routes (Claude Code hooks POST here)
  app.route('/api/hooks', hookRoutes(services));

  return app;
}
