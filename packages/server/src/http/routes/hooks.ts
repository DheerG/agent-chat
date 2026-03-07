import { Hono } from 'hono';
import { z } from 'zod';
import type { Services } from '../../services/index.js';
import { dispatchHookEvent } from '../../hooks/handlers.js';

const HookPayloadSchema = z.object({
  session_id: z.string().min(1),
  cwd: z.string().min(1),
  hook_event_name: z.string().optional(),
  tool_name: z.string().optional(),
  tool_input: z.record(z.string(), z.unknown()).optional(),
  tool_output: z.unknown().optional(),
}).passthrough();  // Allow additional unknown fields from Claude Code

export function hookRoutes(services: Services): Hono {
  const router = new Hono();

  // POST /api/hooks/:eventType
  router.post('/:eventType', async (c) => {
    const eventType = c.req.param('eventType');

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, 400);
    }

    const result = HookPayloadSchema.safeParse(body);
    if (!result.success) {
      return c.json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: result.error.issues,
      }, 422);
    }

    const hookResult = await dispatchHookEvent(services, eventType, result.data);
    return c.json({ received: true, ...hookResult });
  });

  return router;
}
