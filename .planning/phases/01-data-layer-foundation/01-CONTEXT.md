# Phase 1: Data Layer Foundation - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

SQLite schema with WAL mode, write serialization queue, and tenant isolation. Every other component depends on this layer being correct. No network code, no HTTP, no WebSocket — just the data model and persistence layer.

Requirements: INFRA-01, INFRA-02, MSG-02, MSG-05

</domain>

<decisions>
## Implementation Decisions

### Project Structure
- Monorepo with `packages/` directory: `packages/server`, `packages/client`, `packages/mcp`, `packages/shared`
- `packages/shared` holds TypeScript types, schemas, and constants used across server/client/MCP
- `packages/server` contains the data layer, HTTP server, WebSocket hub (built incrementally across phases)
- Use pnpm workspaces for monorepo management
- Single `tsconfig.json` at root with project references

### ID Strategy
- ULIDs (Universally Unique Lexicographically Sortable Identifiers) for all entities
- ULIDs sort chronologically without a separate timestamp index — critical for message ordering
- String type in SQLite (26 chars) — no binary encoding complexity
- Use `ulid` npm package

### Schema Shape
- **tenants**: id, name, codebase_path (unique), created_at
- **channels**: id, tenant_id, name, session_id (nullable), type (session|manual), created_at, updated_at
- **messages**: id, channel_id, tenant_id (denormalized for query efficiency), parent_message_id (nullable, for threads), sender_id, sender_name, sender_type (agent|human|system|hook), content, message_type (text|event|hook), metadata (JSON), created_at
- **presence**: agent_id, tenant_id, channel_id, status (active|idle), last_seen_at
- All tables have tenant_id — enforced at the query layer, not just by FK
- Composite indexes on (tenant_id, channel_id, created_at) for message queries
- Append-only messages — no UPDATE or DELETE on messages table (immutability is a feature)

### Write Serialization
- Application-level write queue wrapping better-sqlite3
- better-sqlite3 is synchronous — queue serializes access from async callers
- WAL mode enabled at database initialization
- busy_timeout set to 5000ms as fallback

### Tenant Isolation
- Row-level scoping with mandatory tenant_id on all queries
- TypeScript query layer enforces tenant_id as required parameter — can't forget it
- No cross-tenant queries by design — all query functions take tenant_id as first argument

### Claude's Discretion
- Exact Drizzle schema definition syntax
- Migration strategy (drizzle-kit push for dev, migration files for stability)
- Test fixture patterns
- Error types and error handling approach

</decisions>

<specifics>
## Specific Ideas

- Use better-sqlite3 (synchronous) over async alternatives — research confirmed it's the right fit for write queue pattern
- Drizzle ORM for type-safe schema definition and queries
- Messages are append-only (immutability for audit trail) — no soft delete, no edit
- Event/hook messages use the same messages table with message_type discriminator

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None — this phase establishes the foundational patterns

### Integration Points
- Data layer will be imported by: HTTP server (Phase 2), MCP server (Phase 3), WebSocket hub (Phase 4)
- Schema types from `packages/shared` will be used by client (Phase 5)

</code_context>

<deferred>
## Deferred Ideas

- FTS5 full-text search index — v2 feature, add when search requirement is validated
- Document/canvas tables — Phase 6, separate from messaging schema
- Message reactions table — v2 feature (AGNT-08)

</deferred>

---

*Phase: 01-data-layer-foundation*
*Context gathered: 2026-03-07*
