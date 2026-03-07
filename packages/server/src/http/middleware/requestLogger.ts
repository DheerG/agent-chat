import type { MiddlewareHandler } from 'hono';

export function requestLogger(): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    console.log(JSON.stringify({
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration_ms: duration,
    }));
  };
}
