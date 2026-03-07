---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/client/package.json
  - packages/client/src/components/MessageContent.tsx
  - packages/client/src/components/MessageContent.css
  - packages/client/src/components/MessageItem.tsx
  - packages/client/src/components/MessageItem.css
  - packages/client/src/__tests__/MessageContent.test.tsx
  - packages/client/src/__tests__/MessageFeed.test.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "Markdown in agent messages renders as formatted HTML (bold, italic, code, links, lists, headings)"
    - "Code blocks render with monospace font and distinct background"
    - "Inline code renders with background highlight"
    - "Plain text messages still render correctly"
    - "Existing tests pass (with any needed adjustments)"
    - "No XSS vulnerabilities from rendered HTML"
  artifacts:
    - path: "packages/client/src/components/MessageContent.tsx"
      provides: "Markdown-to-HTML rendering component"
      exports: ["MessageContent"]
    - path: "packages/client/src/components/MessageContent.css"
      provides: "Styling for rendered markdown elements"
    - path: "packages/client/src/__tests__/MessageContent.test.tsx"
      provides: "Tests for markdown rendering"
  key_links:
    - from: "packages/client/src/components/MessageItem.tsx"
      to: "packages/client/src/components/MessageContent.tsx"
      via: "replaces raw {message.content} with <MessageContent>"
      pattern: "<MessageContent"
---

<objective>
Add markdown rendering to message content in the chat UI. Agent messages commonly contain markdown (code blocks, bold, links, lists, headings) that currently displays as raw text. Replace plain text rendering with a sanitized markdown-to-HTML pipeline.

Purpose: Messages from Claude agents are rich with markdown formatting. Rendering them properly makes conversations readable and useful, especially for code snippets and structured content.
Output: A MessageContent component that renders markdown safely, with proper styling using the existing design token system.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/client/src/components/MessageItem.tsx
@packages/client/src/components/MessageItem.css
@packages/client/src/components/MessageFeed.tsx
@packages/client/src/__tests__/MessageFeed.test.tsx
@packages/client/src/App.css
@packages/client/package.json
@packages/client/vitest.config.ts

<interfaces>
<!-- Current rendering in MessageItem.tsx line 86 — this is what we replace -->
```tsx
<div className="message-text">{message.content}</div>
```

<!-- Design tokens from App.css that markdown styles should use -->
```css
--color-bg-code: #f8f8fa;
--color-text-body: #2d3748;
--color-text-primary: #1a1a2e;
--color-border: #e2e8f0;
--color-accent: #667eea;
```

<!-- MessageItem interface — MessageContent will receive the content string -->
```tsx
interface MessageItemProps {
  message: Message;  // message.content is the string to render
  presenceStatus?: 'active' | 'idle' | null;
  threadReplyCount?: number;
  onThreadOpen?: (parentMessage: Message) => void;
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install marked + dompurify and create MessageContent component</name>
  <files>
    packages/client/package.json
    packages/client/src/components/MessageContent.tsx
    packages/client/src/components/MessageContent.css
    packages/client/src/__tests__/MessageContent.test.tsx
  </files>
  <action>
1. Install dependencies in the client package:
   - `marked` (lightweight markdown parser, pure ESM, ~40KB) for markdown-to-HTML conversion
   - `dompurify` + `@types/dompurify` for XSS sanitization of rendered HTML
   Run: `npm install --workspace=packages/client marked dompurify` and `npm install --workspace=packages/client -D @types/dompurify`

2. Create `packages/client/src/components/MessageContent.tsx`:
   - Export a `MessageContent` component with props: `{ content: string }`
   - Use `marked.parse(content, { breaks: true, gfm: true })` to convert markdown to HTML string
     - `breaks: true` converts single newlines to `<br>` (chat messages don't use double-newline paragraphs)
     - `gfm: true` enables GitHub-flavored markdown (tables, strikethrough, task lists)
   - Configure the marked renderer to add `target="_blank" rel="noopener noreferrer"` to all links
   - Sanitize the HTML output through `DOMPurify.sanitize()` before rendering
   - Render via `<div className="message-content-rendered" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />`
   - Memoize the parsed result with `useMemo` keyed on `content` to avoid re-parsing on every render
   - Handle edge cases: empty string returns empty div, content with no markdown renders as plain text wrapped in `<p>` tags

3. Create `packages/client/src/components/MessageContent.css`:
   - Scope all styles under `.message-content-rendered` to avoid leaking
   - Style rendered elements using existing CSS custom properties from App.css:
     - `p`: margin 0, use `--color-text-body` for color. Adjacent `p + p` gets `margin-top: 0.5em`
     - `code` (inline): `background: var(--color-bg-code)`, `padding: 2px 5px`, `border-radius: 3px`, `font-size: 0.85em`, font-family monospace
     - `pre`: `background: var(--color-bg-code)`, `padding: 12px 16px`, `border-radius: 6px`, `overflow-x: auto`, `margin: 8px 0`, `border: 1px solid var(--color-border)`
     - `pre code`: reset the inline code styles (no extra background/padding since pre already has them)
     - `a`: `color: var(--color-accent)`, `text-decoration: none`, hover underline
     - `strong`: `font-weight: 600`
     - `ul, ol`: `padding-left: 1.5em`, `margin: 4px 0`
     - `li`: `margin: 2px 0`
     - `blockquote`: `border-left: 3px solid var(--color-border)`, `padding-left: 12px`, `color: var(--color-text-muted)`, `margin: 8px 0`
     - `h1-h6`: `font-weight: 600`, `margin: 8px 0 4px 0`. h1: `font-size: 1.2em`, h2: `1.1em`, h3-h6: `1em`
     - `table`: `border-collapse: collapse`, `margin: 8px 0`, `width: 100%`
     - `th, td`: `border: 1px solid var(--color-border)`, `padding: 6px 10px`, `text-align: left`
     - `th`: `background: var(--color-bg-code)`, `font-weight: 600`
     - `hr`: `border: none`, `border-top: 1px solid var(--color-border)`, `margin: 12px 0`
   - Keep `white-space: pre-wrap` and `word-break: break-word` on the root `.message-content-rendered` to preserve whitespace behavior for non-markdown content
   - Set `line-height: 1.5` on root, matching existing `.message-text` style

4. Create `packages/client/src/__tests__/MessageContent.test.tsx`:
   - Test: plain text renders (no markdown) — content appears in the DOM
   - Test: bold text renders — `**bold**` produces a `<strong>` element
   - Test: inline code renders — `` `code` `` produces a `<code>` element
   - Test: code block renders — triple backtick block produces a `<pre><code>` element
   - Test: links render — `[text](url)` produces an `<a>` with href and target="_blank"
   - Test: list renders — `- item` produces `<ul><li>` elements
   - Test: XSS is sanitized — `<script>alert('xss')</script>` does NOT produce a script element
   - Test: empty content renders empty div without errors
  </action>
  <verify>
    <automated>cd /Users/dheer/code/personal/agent-chat && npx vitest run --project client src/__tests__/MessageContent.test.tsx 2>/dev/null || npm run --workspace=packages/client test -- --run src/__tests__/MessageContent.test.tsx</automated>
  </verify>
  <done>MessageContent component exists, renders markdown to sanitized HTML, all 8 tests pass, styles use design tokens</done>
</task>

<task type="auto">
  <name>Task 2: Integrate MessageContent into MessageItem and fix existing tests</name>
  <files>
    packages/client/src/components/MessageItem.tsx
    packages/client/src/components/MessageItem.css
    packages/client/src/__tests__/MessageFeed.test.tsx
  </files>
  <action>
1. Update `packages/client/src/components/MessageItem.tsx`:
   - Import `MessageContent` from `./MessageContent`
   - Replace line 86 (`<div className="message-text">{message.content}</div>`) with:
     `<MessageContent content={message.content} />`
   - Keep the `message-text` class wrapper around it for layout compatibility:
     `<div className="message-text"><MessageContent content={message.content} /></div>`
   - Do NOT change system messages (line 51) — those should stay as plain text since they are short status messages
   - Do NOT change event/hook messages — those already use EventCard

2. Update `packages/client/src/components/MessageItem.css`:
   - In `.message-text`, remove `white-space: pre-wrap` (MessageContent.css handles this internally)
   - Keep `font-size: 0.9rem`, `line-height: 1.5`, `color: var(--color-text-body)`, `word-break: break-word`
   - These outer styles still apply and MessageContent inherits font-size/color

3. Update `packages/client/src/__tests__/MessageFeed.test.tsx`:
   - The test on line 43 uses `screen.getByText('First message')` — this should still work since marked wraps plain text in `<p>` tags and getByText searches through child elements
   - If any tests fail due to text being wrapped in `<p>` elements inside the rendered markdown, update the assertions to use `screen.getByText('First message')` which searches recursively, or use `{ exact: false }` option
   - Run the full test suite to verify: `npm run --workspace=packages/client test`
   - The event card test (line 75-92) should be unaffected since event messages bypass MessageContent
   - The system message test should be unaffected since system messages bypass MessageContent
  </action>
  <verify>
    <automated>cd /Users/dheer/code/personal/agent-chat && npm run --workspace=packages/client test</automated>
  </verify>
  <done>MessageItem renders markdown content via MessageContent component, system and event messages unchanged, all existing client tests pass (57+ tests), no regressions</done>
</task>

</tasks>

<verification>
1. Run full client test suite: `npm run --workspace=packages/client test` — all tests pass
2. Run TypeScript type check: `npm run --workspace=packages/client typecheck` — no type errors
3. Build check: `npm run --workspace=packages/client build` — builds without errors
</verification>

<success_criteria>
- Markdown content in messages renders as formatted HTML (headings, bold, italic, code blocks, inline code, links, lists, tables, blockquotes)
- Code blocks have distinct monospace styling with background color
- Links open in new tabs (target="_blank" with rel="noopener noreferrer")
- HTML in messages is sanitized (no XSS via script injection)
- System messages remain as plain text
- Event/hook messages remain as EventCard
- All client tests pass (existing 57+ and new MessageContent tests)
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/1-improve-rendering-of-messages-in-the-ui-/1-SUMMARY.md`
</output>
