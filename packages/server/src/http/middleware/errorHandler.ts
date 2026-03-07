import type { ErrorHandler } from 'hono';

export const errorHandler: ErrorHandler = (err, c) => {
  console.error(JSON.stringify({ event: 'unhandled_error', message: err.message, stack: err.stack }));
  return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
};
