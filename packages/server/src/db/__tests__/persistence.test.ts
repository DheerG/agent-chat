import { describe, test } from 'vitest';

// These tests will be implemented in Plan 03 (Wave 2).

describe('Message persistence', () => {
  test.todo('message written to DB survives DB close and reopen');
  test.todo('ULID ordering: messages returned in lexicographic (insertion) order');
  test.todo('message metadata stored as JSON TEXT, parsed on read');
});
