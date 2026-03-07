# Stack Research

**Domain:** Local multi-tenant real-time messaging service for AI agent teams (Claude Code)
**Researched:** 2026-03-07
**Confidence:** HIGH (core stack), MEDIUM (MCP transport specifics)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22.x LTS | Runtime | LTS, required by Hono node server adapter; Bun is tempting but adds risk for a greenfield project that needs ecosystem stability |
| TypeScript | 5.5+ | Language | Required by project; Zod 4 requires TS 5.5+; enables full type inference across server and client |
| Hono | 4.12.x | HTTP + WebSocket server | 3x faster than Express, first-class TypeScript, native WebSocket helper, has official MCP adapter (`@modelcontextprotocol/hono`); perfect for local service that needs both REST and WS on one port |
| @hono/node-server | 1.19.x | Node.js adapter for Hono | Required bridge between Hono (Web Standards) and Node.js runtime |
| @hono/node-ws | latest | WebSocket on Node.js | Official Hono adapter that enables `upgradeWebSocket` on Node.js; wraps `ws` under the hood |
| @modelcontextprotocol/sdk | 1.27.x (v1, not v2) | MCP server implementation | Official Anthropic SDK; v1 is production-stable; v2 is pre-alpha with Q1 2026 target — do NOT use v2 yet |
| better-sqlite3 | 12.4.x | SQLite persistence | Synchronous API is a feature, not a bug — no async complexity for a local tool; 12.4.1 is latest; significantly more mature than Bun's built-in SQLite for complex queries |
| Drizzle ORM | 0.45.x (stable) | Database schema + queries | TypeScript-native, SQL-close ORM; `drizzle-kit push` enables zero-migration schema sync for local dev; lighter than Prisma (no Rust binary, no Prisma Client engine) |
| drizzle-kit | 0.30.x | Schema migrations CLI | Companion CLI for Drizzle ORM; `drizzle-kit push` for dev, `drizzle-kit migrate` for staged changes |
| Zod | 4.x | Schema validation + types | Required peer dependency of `@modelcontextprotocol/sdk`; validates all message payloads, MCP tool inputs, and API request bodies from one shared schema source |
| React | 19.x | Web UI framework | Standard in 2025/2026; shadcn/ui and TanStack libraries target React 19 |
| Vite | 6.x | Frontend build tool | De-facto standard for React SPAs; near-instant HMR; native TypeScript |
| TanStack Query | 5.90.x | Server state management | Integrates with WebSocket for real-time cache invalidation; handles polling, error states, loading states; v5 requires React 18+ (React 19 is compatible) |
| TanStack Router | 1.x | Client-side routing | Type-safe routes with inferred params and search state; better TypeScript story than React Router v7 for SPAs without a framework |
| react-use-websocket | 4.x | WebSocket React hook | Handles reconnect logic, queueing, and message parsing in the frontend; avoids writing reconnect state machines by hand |
| Tailwind CSS | 4.x | Utility CSS | v4 is stable; pairs with shadcn/ui components; zero runtime, just classes |
| shadcn/ui | latest | Component primitives | Copy-paste components built on Radix UI + Tailwind; no black-box dependency; updated for Tailwind v4 and React 19 |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/better-sqlite3 | 7.6.x | TypeScript types for better-sqlite3 | Always — installed as devDependency alongside better-sqlite3 |
| tsx | 4.x | TypeScript executor for Node.js | Running `src/server.ts` directly in dev without a compile step; replaces ts-node with ESBuild speed |
| tsup | 8.x | TypeScript bundler for server code | Building the MCP server binary and HTTP server for production/distribution; zero-config, ESM + CJS output |
| vitest | 3.x | Test runner | Jest-compatible, Vite-native; fastest option for TypeScript tests; use for unit testing message logic, MCP tool handlers, DB queries |
| @modelcontextprotocol/inspector | latest | MCP dev tool | Visual UI for testing MCP server tools; run via `npx @modelcontextprotocol/inspector` — no install needed |
| concurrently | 9.x | Dev process orchestration | Run server + Vite frontend simultaneously in one terminal during development |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| TypeScript strict mode | Type safety enforcement | Enable `"strict": true` in tsconfig.json — catches entire classes of bugs at compile time, especially around null handling in message processing |
| ESLint + @typescript-eslint | Linting | Use `@typescript-eslint/recommended-type-checked` ruleset for rules that require type information |
| Prettier | Code formatting | Single formatter, no debates; configure with `semi: false`, `singleQuote: true` for modern TS style |
| drizzle-kit push | Schema sync | Use `drizzle-kit push` in dev (instant schema sync without migration files); switch to `drizzle-kit generate` + `drizzle-kit migrate` only if you need reproducible migration history |

---

## Installation

```bash
# Server runtime
npm install hono @hono/node-server @hono/node-ws
npm install @modelcontextprotocol/sdk
npm install better-sqlite3
npm install drizzle-orm
npm install zod

# Frontend
npm install react react-dom
npm install @tanstack/react-query @tanstack/react-router
npm install react-use-websocket

# Dev dependencies (server)
npm install -D typescript tsx tsup vitest
npm install -D @types/node @types/better-sqlite3
npm install -D drizzle-kit
npm install -D eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser
npm install -D concurrently

# Frontend dev
npm install -D vite @vitejs/plugin-react
npm install -D tailwindcss @tailwindcss/vite
npm install -D @tanstack/router-devtools @tanstack/react-query-devtools
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Hono + @hono/node-server | Fastify | If you need Fastify's plugin ecosystem (e.g., OpenAPI autogeneration, authentication plugins) and don't care about edge portability. Fastify is more mature but has weaker TypeScript ergonomics. |
| Hono + @hono/node-server | Express | Never for new projects. Express has no native TypeScript support, poor performance vs. Hono, and is functionally unmaintained for modern features. |
| better-sqlite3 | Bun native SQLite (`bun:sqlite`) | Only if you commit to Bun as the runtime. Bun's SQLite is 3-6x faster but locks you into Bun and has missing features (no affected row count from `run()`). For a Node.js service, better-sqlite3 is the right choice. |
| Drizzle ORM | Prisma | If your team prefers declarative schema files and is comfortable with Prisma's Rust-based query engine overhead. Prisma adds ~40MB binary; Drizzle is pure TypeScript with no binary. For a local tool, Drizzle's simplicity wins. |
| Drizzle ORM | Kysely (raw query builder) | If you want zero abstraction over SQL and write every query manually. Fine for experts, but Drizzle's type inference saves significant debugging time with complex joins. |
| TanStack Router | React Router v7 | If you're using a framework like Remix/React Router framework mode. For a pure client-side SPA, TanStack Router's type inference is superior — routes, params, and search params are all type-checked at compile time. |
| @modelcontextprotocol/sdk v1.27.x | v2 pre-alpha | When v2 hits stable release (anticipated Q1 2026). v2 introduces `@modelcontextprotocol/hono` adapter, but the pre-alpha status makes it unsuitable for a shipping product today. |
| react-use-websocket | Custom useEffect + WebSocket | Only if you want zero dependencies for simple cases. For a messaging app, the reconnect and message queue logic in react-use-websocket saves ~200 lines of error-prone boilerplate. |
| shadcn/ui | MUI / Ant Design / Chakra | If you want a managed component library with opinions baked in. shadcn/ui gives full code ownership — you copy components into your project and own them. For a developer tool UI, this is the right tradeoff. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Socket.io | Adds a non-standard protocol layer on top of WebSocket; agent clients would need the Socket.io client library to connect — can't use raw WebSocket. MCP agents shouldn't depend on Socket.io. | Native `WebSocket` on client + `@hono/node-ws` on server |
| Express | No native TypeScript support; middleware types require `@types/express`; 2.3x slower than Hono on benchmarks; no Web Standards compatibility. | Hono + @hono/node-server |
| Sequelize or TypeORM | Both have poor TypeScript inference — TypeORM queries are stringly-typed, Sequelize types lag behind. Both require significant boilerplate for simple schemas. | Drizzle ORM |
| @modelcontextprotocol/sdk v2 (pre-alpha) | Pre-alpha as of 2026-03-07; API is not stable; production use not recommended by Anthropic until stable v2 release. v1.x receives ongoing bug and security fixes. | @modelcontextprotocol/sdk v1.27.x |
| Next.js | Overkill for a local developer tool; adds SSR/RSC complexity that's irrelevant when the "server" is localhost; slower HMR than Vite for a SPA. | React + Vite |
| Prisma | Rust binary dependency (~40MB); slow cold start; overkill for a local SQLite-backed service. | Drizzle ORM |
| NestJS | Heavy class-based framework with decorator magic that fights TypeScript inference. The DI container and module system are appropriate for large enterprise APIs, not a single-developer local tool. | Hono (lightweight, functional, explicit) |
| Mongoose / MongoDB | No reason to run a separate DB process for a local tool. SQLite is file-based, zero-install, and sufficient for the message volumes a developer tool will generate. | better-sqlite3 + Drizzle |

---

## Stack Patterns by Variant

**MCP transport — this project uses stdio (not HTTP):**
- The MCP server runs as a stdio process that Claude Code spawns as a child process
- The `McpServer` from `@modelcontextprotocol/sdk` connects to `StdioServerTransport`
- CRITICAL: Under stdio, `stdout` is reserved for JSON-RPC protocol messages — never `console.log()` in the MCP server process; use `console.error()` or a file logger instead
- The HTTP/WebSocket server is a SEPARATE process from the MCP stdio server; they communicate via the SQLite database or an internal event bus

**Architecture split — two processes:**
- Process 1: MCP stdio server (launched by Claude Code as a child process)
- Process 2: HTTP + WebSocket server (long-running background service, serves the web UI and real-time updates)
- Both processes share the same SQLite file for message persistence
- This separation is intentional: MCP stdio cannot serve HTTP

**Monorepo vs. flat project:**
- For a local tool of this size, a flat project with two entry points (`src/mcp/index.ts`, `src/server/index.ts`) is sufficient
- Avoid a full Turborepo/Nx monorepo — the overhead isn't justified until the codebase grows beyond ~5K lines

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| @modelcontextprotocol/sdk@1.27.x | zod@4.x | SDK v1 migrated to Zod v4 as peer dependency; ensure zod is v4, not v3 |
| React@19.x | @tanstack/react-query@5.x | TanStack Query v5 requires React 18+; React 19 is fully compatible |
| React@19.x | @tanstack/router@1.x | TanStack Router targets React 18+; React 19 compatible |
| Tailwind CSS@4.x | shadcn/ui | shadcn/ui has updated all components for Tailwind v4; use `npx shadcn@latest init` which auto-detects v4 |
| Hono@4.x | @hono/node-server@1.19.x | Always pin both to compatible minor versions; they release in tandem |
| drizzle-orm@0.45.x | drizzle-kit@0.30.x | Drizzle ORM and drizzle-kit must be version-compatible; check drizzle.team/docs/latest-releases when upgrading |
| Node.js@22.x | better-sqlite3@12.4.x | better-sqlite3 is a native addon; must match Node.js major version; pre-built binaries available for Node 22 |

---

## Sources

- [MCP TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk) — v1.27.1 confirmed as latest stable; v2 pre-alpha warning sourced here; Zod v4 peer dependency confirmed
- [Hono npm](https://www.npmjs.com/package/hono) — v4.12.5 confirmed as latest
- [@hono/node-server npm](https://www.npmjs.com/package/@hono/node-server) — v1.19.11 confirmed as latest
- [Hono WebSocket docs](https://hono.dev/docs/helpers/websocket) — @hono/node-ws requirement for Node.js confirmed
- [better-sqlite3 npm](https://www.npmjs.com/package/better-sqlite3) — v12.4.1 confirmed as latest
- [Drizzle ORM npm releases](https://orm.drizzle.team/docs/latest-releases) — 0.45.x confirmed stable; v1.0.0-beta.2 exists but use stable
- [@tanstack/react-query npm](https://www.npmjs.com/package/@tanstack/react-query) — v5.90.21 confirmed as latest (March 2026)
- [react-use-websocket npm](https://www.npmjs.com/package/react-use-websocket) — reconnect and queue behavior confirmed
- [zod npm](https://www.npmjs.com/package/zod) — v4.x confirmed as latest; requires TypeScript 5.5+
- WebSearch: Hono vs Fastify vs Express benchmarks (2025) — MEDIUM confidence; multiple sources agree on performance ordering
- WebSearch: TanStack Router vs React Router v7 comparison (2025/2026) — MEDIUM confidence; multiple articles confirm TanStack Router's TypeScript-first advantage for SPAs

---

*Stack research for: AgentChat — local multi-tenant AI agent messaging service*
*Researched: 2026-03-07*
