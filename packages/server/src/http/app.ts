import { Hono } from 'hono';
import type { Services } from '../services/index.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRoutes } from './routes/health.js';
import { conversationRoutes } from './routes/conversations.js';

export function createApp(services: Services): Hono {
  const app = new Hono();

  app.use('*', requestLogger());
  app.onError(errorHandler);

  app.route('/health', healthRoutes());
  app.route('/api/conversations', conversationRoutes(services));

  return app;
}
