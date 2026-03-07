import { Hono } from 'hono';
import { z } from 'zod';
import type { Services } from '../../services/index.js';

const CreateTenantSchema = z.object({
  name: z.string().min(1),
  codebasePath: z.string().min(1),
});

export function tenantRoutes(services: Services): Hono {
  const router = new Hono();

  // GET /api/tenants — list all tenants
  router.get('/', (c) => {
    const tenantList = services.tenants.listAll();
    return c.json({ tenants: tenantList });
  });

  // POST /api/tenants — create or upsert tenant by codebasePath
  router.post('/', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, 400);
    }
    const result = CreateTenantSchema.safeParse(body);
    if (!result.success) {
      return c.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: result.error.issues }, 422);
    }
    const tenant = await services.tenants.upsertByCodebasePath(result.data.name, result.data.codebasePath);
    return c.json({ tenant }, 201);
  });

  // GET /api/tenants/:tenantId
  router.get('/:tenantId', (c) => {
    const tenant = services.tenants.getById(c.req.param('tenantId'));
    if (!tenant) return c.json({ error: 'Tenant not found', code: 'NOT_FOUND' }, 404);
    return c.json({ tenant });
  });

  return router;
}
