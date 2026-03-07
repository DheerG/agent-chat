import { describe, test } from 'vitest';

// These tests will be implemented in Plan 03 (Wave 2) when query layer exists.

describe('Tenant isolation', () => {
  test.todo('message written under tenant A is invisible when queried under tenant B');
  test.todo('channel created under tenant A is not returned in tenant B channel list');
  test.todo('tenant_id is required parameter — TypeScript enforces at compile time');
});
