import { describe, test, expect } from 'vitest';
import { createDb } from '../../db/index.js';
import { WriteQueue } from '../../db/queue.js';
import { createServices } from '../../services/index.js';
import { createApp } from '../app.js';

function createTestApp() {
  const instance = createDb(':memory:');
  const queue = new WriteQueue();
  const services = createServices(instance, queue);
  return createApp(services);
}

describe('GET /health', () => {
  test('returns 200 with status ok and ISO8601 timestamp', async () => {
    const app = createTestApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; timestamp: string };
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
    // Verify it's a valid ISO 8601 timestamp
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});
