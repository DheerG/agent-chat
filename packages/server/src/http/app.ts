import { Hono } from 'hono';
import type { Services } from '../services/index.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRoutes } from './routes/health.js';
import { conversationRoutes } from './routes/conversations.js';
import { hookRoutes } from './routes/hooks.js';

export function createApp(services: Services): Hono {
  const app = new Hono();

  app.use('*', requestLogger());
  app.onError(errorHandler);

  app.route('/health', healthRoutes());
  app.route('/api/conversations', conversationRoutes(services));
  app.route('/api/events', hookRoutes(services));

  // Backward compat: v1 hooks endpoint
  app.route('/api/hooks', hookRoutes(services));

  return app;
}
