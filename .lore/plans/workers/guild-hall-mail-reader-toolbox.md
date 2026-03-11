---
title: Guild Hall Mail Reader Toolbox
date: 2026-03-08
status: executed
tags: [toolbox, email, fastmail, jmap, packages]
modules: [packages, toolbox-resolver]
related:
  - .lore/specs/workers/guild-hall-mail-reader-toolbox.md
  - .lore/research/fastmail-jmap-integration.md
  - .lore/plans/workers/worker-domain-plugins.md
  - .lore/retros/worker-domain-plugins.md
---

# Plan: Guild Hall Mail Reader Toolbox

## Spec Reference

**Spec**: `.lore/specs/workers/guild-hall-mail-reader-toolbox.md`
**Research**: `.lore/research/fastmail-jmap-integration.md`

Requirements addressed:
- REQ-EMT-1, EMT-2: Package structure and factory export -> Step 1
- REQ-EMT-3: JMAP client wrapper -> Step 2
- REQ-EMT-7, EMT-8, EMT-9, EMT-10, EMT-11: JMAP client behavior (session, batching, mailbox resolution, body values, capabilities) -> Step 2
- REQ-EMT-4, EMT-5, EMT-6: Tool definitions, error messages, read-only constraint -> Step 4
- REQ-EMT-12, EMT-13, EMT-14, EMT-15: Configuration, soft failure, and README -> Steps 1, 5
- REQ-EMT-16, EMT-17, EMT-18, EMT-19: Security model -> Steps 1, 5 (REQ-EMT-18 enforced by design: single token, no per-worker dispatch)
- REQ-EMT-20, EMT-21, EMT-22: Worker integration -> Step 1 (resolver integration test)
- REQ-EMT-23, EMT-24, EMT-25: Error handling -> Steps 2, 4, 5
- All REQs: Validation -> Step 6

## Codebase Context

**Toolbox resolver** (`daemon/services/toolbox-resolver.ts`): Domain toolboxes load via `loadDomainToolbox()` at lines 150-174. It dynamically imports the package's `index.ts`, verifies a `toolboxFactory` export exists, and calls it with `GuildHallToolboxDeps`. The returned `ToolboxOutput.server` is pushed into `mcpServers[]`. No changes needed here.

**ToolboxFactory signature** (`daemon/services/toolbox-types.ts:34`): `(deps: GuildHallToolboxDeps) => ToolboxOutput`. Synchronous return. The email toolbox's JMAP session fetch is async, so the factory starts the fetch as a background promise and tool calls await it. This matches the cached-promise pattern in `createToolboxResources()` at `daemon/services/commission/toolbox.ts:77-86` where `writePathPromise` is created once and awaited by all handlers.

**MCP server creation**: All existing toolboxes use `createSdkMcpServer()` from `@anthropic-ai/claude-agent-sdk` with `tool()` for each tool definition and `z` from `zod/v4` for parameter schemas. Follow this pattern exactly.

**Package discovery** (`lib/packages.ts`): `discoverPackages()` scans `packages/` and `~/.guild-hall/packages/` for subdirectories with `package.json` containing a `guildHall` key. `toolboxMetadataSchema` validates toolbox packages: `type: "toolbox"`, `name: string`, `description: string`. The email package metadata must pass this schema.

**Existing worker packages** (e.g., `packages/guild-hall-writer/package.json`): All five roster workers have `domainToolboxes: []`. The email toolbox is the first domain toolbox that will actually be loaded by the resolver. The resolver code supports it (tested with fixtures in `tests/daemon/toolbox-resolver.test.ts:519-693`), but it has never been exercised with a real package in production.

**No existing package tests**: Worker packages contain config and markdown, not testable TypeScript. The email toolbox would be the first package with unit-testable code. Tests go in `tests/packages/guild-hall-email/` following the `tests/<path-matching-source>/` convention.

**No changes to daemon/app.ts**: The production wiring already passes `packages` (from `discoverPackages()`) to session preparation. Adding a new package in `packages/` is sufficient; no DI seam changes needed.

## Implementation Steps

### Step 1: Package scaffold and resolver integration

**Files**: `packages/guild-hall-email/package.json`, `packages/guild-hall-email/index.ts`, `packages/guild-hall-email/README.md`
**Addresses**: REQ-EMT-1, EMT-2, EMT-14, EMT-17, EMT-20, EMT-21, EMT-22

Create the package directory with the metadata the toolbox resolver expects. This step validates the filesystem convention before building any JMAP logic (lesson from domain plugins retro: convention mismatches found late require widespread fixes).

**package.json**: Standard npm package with `guildHall` metadata block:
```json
{
  "name": "guild-hall-email",
  "version": "0.1.0",
  "guildHall": {
    "type": "toolbox",
    "name": "guild-hall-email",
    "description": "Read-only access to the user's Fastmail inbox via JMAP."
  }
}
```

**index.ts**: Export a `toolboxFactory` function conforming to the `ToolboxFactory` signature from `daemon/services/toolbox-types.ts`. For this step, the factory returns a placeholder MCP server named `guild-hall-email` (this name must match exactly, since the resolver builds `allowedTools` entries as `mcp__${server.name}__*`). No tools yet. This proves the resolver can discover, import, and load the package end-to-end. Note: the `ToolboxFactory` return type is synchronous. The TypeScript compiler will reject an async factory. All async work (JMAP session fetch) must happen inside tool handlers, not the factory itself.

**README.md** (REQ-EMT-14): Document the prerequisites: Fastmail Individual plan ($6/mo) or higher, API token creation at Settings > Privacy & Security > Manage API tokens with read-only scope, and the `FASTMAIL_API_TOKEN` environment variable. This is a deliverable the spec names explicitly.

Tests (`tests/packages/guild-hall-email/integration.test.ts`):
- Package metadata validates against `toolboxMetadataSchema`
- `resolveToolSet` with a worker declaring `domainToolboxes: ["guild-hall-email"]` finds the package, calls the factory, and includes the server in `mcpServers[]` and `mcp__guild-hall-email__*` in `allowedTools`
- Worker without `domainToolboxes: ["guild-hall-email"]` does not see email tools

The integration test should point at the real `packages/guild-hall-email/` directory (not a temporary fixture) so it validates the actual package structure the resolver will encounter.

### Step 2: JMAP client

**Files**: `packages/guild-hall-email/jmap-client.ts`
**Addresses**: REQ-EMT-3, EMT-7, EMT-8, EMT-9, EMT-10, EMT-11, EMT-23, EMT-24, EMT-25

Build a thin JMAP client wrapper using `fetch()` with typed interfaces. No external JMAP library. The research document (`.lore/research/fastmail-jmap-integration.md`, section 5) provides TypeScript code examples for the operations, but **do not copy the `using` array from the research template verbatim**. The research's `FastmailClient.request()` example includes `urn:ietf:params:jmap:submission` in the `using` array, which violates REQ-EMT-11. Use only `jmap:core` and `jmap:mail`.

**Types**: Define interfaces for `JmapSession`, `JmapRequest`, `JmapResponse`, and `MethodCall` (the `[methodName, arguments, callId]` triple). These are internal to the client; they don't need to be exported.

**Class**: `JmapClient` with:
- Constructor takes `token: string` and optional `sessionUrl: string` (defaults to `https://api.fastmail.com/jmap/session`, injectable for tests per REQ-EMT-7). Also accepts an optional `fetchFn` parameter (defaults to global `fetch`) for dependency injection in tests.
- `connect()`: Makes two HTTP calls: (1) `GET sessionUrl` to fetch the JMAP session resource, then (2) `POST apiUrl` with a `Mailbox/get` call to populate the mailbox cache. Both results are cached. Returns a resolved client state. On failure at either step, throws with a descriptive error (REQ-EMT-25 degraded state).
- `ensureConnected()`: The public API that tool handlers call. Returns a promise that encapsulates the full connection lifecycle: if connected, resolves immediately; if never connected, calls `connect()`; if `connect()` previously failed (degraded state), attempts one re-connect and either resolves or throws. This keeps re-connect logic entirely within the client. Tool handlers call `await client.ensureConnected()` and then proceed with JMAP calls. They never manage connection state themselves.
- `request(methodCalls)`: POSTs batched JMAP method calls to `apiUrl`. On HTTP 401, attempts one session re-fetch and retries (REQ-EMT-7). On other HTTP errors, throws with status code and readable message (REQ-EMT-23). On 429 or JMAP `tooManyRequests`, throws with rate limit message (REQ-EMT-24).
- `accountId` getter: Returns the primary mail account ID from the cached session.
- `resolveMailboxName(name: string)`: Case-insensitive lookup on the cached mailbox list, returns the JMAP mailbox ID. On no match, throws an error listing available mailbox names.
- `resolveMailboxId(id: string)`: Reverse lookup on the cached mailbox list, returns the mailbox name. Used by `read_email` (Step 4) to translate `mailboxIds` keys to human-readable names.
- Capabilities declared in requests: only `urn:ietf:params:jmap:core` and `urn:ietf:params:jmap:mail` (REQ-EMT-11). No submission or Fastmail extensions.

**Session promise pattern**: The factory (Step 5) creates the `JmapClient` and calls `client.connect()`, storing the returned promise without awaiting it (the factory is synchronous). Each tool handler calls `await client.ensureConnected()` before making JMAP calls. The `ensureConnected()` method awaits the stored promise. If it rejected, it attempts one re-connect. This pattern keeps all connection lifecycle logic in the client, not spread across factory and tools.

Tests (`tests/packages/guild-hall-email/jmap-client.test.ts`):
- Session fetch succeeds: client caches session, subsequent calls use cached `apiUrl`
- Session fetch fails: client is in degraded state, tool-level re-attempt triggers one retry
- 401 during request: client re-fetches session and retries the request once
- 401 during retry: error propagates (no infinite loop)
- HTTP error (e.g., 500): error includes status code and readable message
- Rate limit (429): error says "Rate limited by Fastmail. Try again in a moment."
- JMAP-level error in response: mapped to readable error text
- Request batching: multiple method calls sent in single POST with correct structure
- Mailbox name resolution: case-insensitive match, returns ID
- Mailbox name not found: error lists available mailbox names
- Capabilities: request body contains only `jmap:core` and `jmap:mail`

All tests mock `fetch` via the injected `fetchFn` parameter. No global mocking.

### Step 3: HTML-to-text utility

**Files**: `packages/guild-hall-email/html-to-text.ts`
**Addresses**: REQ-EMT-10

Strip HTML tags from email body content while preserving readable structure. No external library. This is a focused utility: block elements (`<p>`, `<div>`, `<br>`, `<li>`, headings) become newlines, inline elements are removed, HTML entities are decoded, and consecutive whitespace is collapsed.

This doesn't need to handle every HTML edge case. Email HTML is constrained by email client rendering engines, so the common patterns are: paragraphs, line breaks, links (extract href text), lists, headings, and basic formatting tags. Aim for readable output, not perfect fidelity.

Tests (`tests/packages/guild-hall-email/html-to-text.test.ts`):
- `<p>` tags produce paragraph breaks
- `<br>` produces line breaks
- `<a href="url">text</a>` produces `text (url)` or just `text`
- Nested tags (`<div><p><strong>text</strong></p></div>`) produce clean text
- HTML entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`, `&nbsp;`) decode correctly
- Empty/whitespace-only HTML returns empty string
- Plain text (no HTML) passes through unchanged
- Consecutive whitespace/newlines collapse to single newline

### Step 4: Tool implementations

**Files**: `packages/guild-hall-email/tools.ts`
**Addresses**: REQ-EMT-4, EMT-5, EMT-6

Build handler functions for all four tools. Each handler receives the `JmapClient` and returns a tool handler function matching the signature expected by `tool()` from the SDK.

**search_emails**:
- Builds a JMAP filter object from the optional parameters (`from`, `to`, `subject`, `text`, `after`, `before`, `in_mailbox`, `has_attachment`). Only includes filter properties that were provided.
- When `in_mailbox` is set, calls `client.resolveMailboxName()` to convert the name to a JMAP mailbox ID before adding it to the filter.
- Uses request batching: `Email/query` + `Email/get` with a back-reference (`#ids` referencing the query result) in a single HTTP POST (REQ-EMT-8).
- `Email/get` requests properties: `id`, `threadId`, `from`, `to`, `subject`, `receivedAt`, `preview`, `hasAttachment`, `keywords`, `mailboxIds`.
- Sorts by `receivedAt` descending. Clamps `limit` to 100 max.
- Returns: Array of email summaries with `isUnread` derived from absence of `$seen` in `keywords`.

**read_email**:
- Single `Email/get` call with `fetchTextBodyValues: true`, `fetchHTMLBodyValues: true`, `maxBodyValueBytes: 256000` (REQ-EMT-10).
- Properties: `id`, `threadId`, `from`, `to`, `cc`, `replyTo`, `subject`, `sentAt`, `receivedAt`, `bodyValues`, `textBody`, `htmlBody`, `attachments`, `keywords`, `mailboxIds`.
- Returns text body directly. If only HTML body exists, runs it through the HTML-to-text utility (Step 3).
- Includes attachment metadata (filename, size, content type) but not content (spec constraint).
- Resolves `mailboxIds` keys to mailbox names using `client.resolveMailboxId()` (the reverse of `resolveMailboxName()`, both defined in Step 2).

**list_mailboxes**:
- Returns the client's cached mailbox list (fetched during session bootstrap in Step 2).
- Each entry: `id`, `name`, `role`, `parentId`, `totalEmails`, `unreadEmails`.

**get_thread**:
- `Thread/get` to retrieve the thread's email IDs, then `Email/get` with back-reference for email summaries.
- Returns emails sorted chronologically (ascending `receivedAt`).
- Same summary shape as `search_emails`.

**Error handling** (REQ-EMT-5): Each handler wraps its logic in try/catch. JMAP errors, HTTP errors, and network failures are caught and returned as tool errors (`isError: true`) with readable messages. Auth failures specifically return "Email toolbox authentication failed. Check FASTMAIL_API_TOKEN." (REQ-EMT-5) without exposing the token value.

**Read-only enforcement** (REQ-EMT-6): No write operations are defined. This is enforced by the tool definitions themselves: only four read tools exist in the MCP server. No `Email/set`, no `EmailSubmission/set`, no mailbox management tools.

Tests (`tests/packages/guild-hall-email/tools.test.ts`):
- `search_emails` with various filter combinations produces correct JMAP method calls
- `search_emails` with `in_mailbox: "Inbox"` resolves name to ID via mailbox cache
- `search_emails` with unknown mailbox name returns error listing available names
- `search_emails` clamping: `limit: 200` becomes `limit: 100`
- `read_email` with text body returns text directly
- `read_email` with HTML-only body runs through HTML stripping
- `read_email` includes attachment metadata
- `list_mailboxes` returns cached mailbox data with roles
- `get_thread` returns emails sorted chronologically
- `get_thread` response shape matches `search_emails` summaries (same fields, including `isUnread`)
- `get_thread` with unknown thread ID returns clear error
- JMAP error in response produces readable tool error
- Network failure produces tool error with message (no internals leaked)
- Auth failure produces specific "Check FASTMAIL_API_TOKEN" message

All tests inject a mock `JmapClient` or mock its `fetchFn`. Tools are tested as pure handler functions, not through the MCP server layer.

### Step 5: Factory wiring with initialization states

**Files**: `packages/guild-hall-email/index.ts`
**Addresses**: REQ-EMT-2, EMT-12, EMT-13, EMT-25

Replace the placeholder factory from Step 1 with the real implementation. The factory has three initialization paths:

1. **Unconfigured** (REQ-EMT-13): `FASTMAIL_API_TOKEN` is not set (or empty). Return an MCP server where all four tools exist but each returns: "Email toolbox is not configured. Set the FASTMAIL_API_TOKEN environment variable." The server still loads, the worker still activates.

2. **Connected** (normal path): Token is present, session fetch succeeds. Return an MCP server with live tool handlers wired to the `JmapClient`.

3. **Degraded** (REQ-EMT-25): Token is present but session fetch fails during the background connect. Tool calls attempt one re-connect. If that also fails, return: "Email toolbox failed to connect to Fastmail: [error]."

**Implementation**: The factory reads `process.env.FASTMAIL_API_TOKEN`. If absent, builds the unconfigured server immediately (synchronous, no async needed). If present, creates a `JmapClient`, calls `client.connect()` (storing the promise), and builds the MCP server with tool handlers that `await` the connection promise before calling into the client. The `FASTMAIL_SESSION_URL` env var overrides the session URL for testing (REQ-EMT-7).

The MCP server name is `guild-hall-email` in all three states. Tool names (`search_emails`, `read_email`, `list_mailboxes`, `get_thread`) are the same in all states. The difference is the handler behavior.

The factory does not emit EventBus events. Read-only operations have no state changes worth broadcasting (per spec: "the email toolbox [...] only uses `eventBus` minimally (no events to emit for read-only operations)"). The `deps.eventBus` is available but unused.

**Shared token** (REQ-EMT-18): The factory reads a single `FASTMAIL_API_TOKEN`. All workers that declare the email toolbox see the same inbox. There is no per-worker token dispatch or isolation logic. This is enforced by the factory's design: one env var read, one client instance per factory call, no routing.

Tests (`tests/packages/guild-hall-email/factory.test.ts`):
- Factory with no `FASTMAIL_API_TOKEN` returns server where all tools return configuration error
- Factory with valid token and successful session produces working tools
- Factory with valid token but session failure produces degraded-state tools
- Token value is never present in any tool response or error message
- `FASTMAIL_SESSION_URL` overrides default session URL
- MCP server name is `guild-hall-email` in all states

### Step 6: Validate against spec

Launch a sub-agent that reads the spec at `.lore/specs/workers/guild-hall-mail-reader-toolbox.md`, reviews the implementation against all 25 requirements, and flags any that are not met. This step is not optional.

Two things the validator should specifically check:
1. No write operations exist anywhere in the package (REQ-EMT-6)
2. The toolbox resolver loads the package without modification (no changes to `daemon/services/toolbox-resolver.ts`, `daemon/services/toolbox-types.ts`, or `daemon/app.ts`)

## Delegation Guide

No steps require specialized expertise beyond the codebase patterns already in use. The JMAP client is HTTP + JSON with typed interfaces; the MCP server follows the exact pattern of `daemon/services/commission/toolbox.ts` and `daemon/services/mail/toolbox.ts`; the HTML stripping is self-contained.

**Review strategy**: Run `plan-reviewer` after saving this plan (per `/prep-plan` process). During implementation, use fresh-eyes code review after Step 5 completes (before validation). The domain plugins retro and commission batch cleanup retro both confirm the implement-review-fix cycle as the strongest quality signal.

## Open Questions

- **Token scope verification**: The spec notes (REQ-EMT-14) that Fastmail tokens can be scoped to read-only, but the research flags uncertainty about whether "read-only" covers all read methods. The first real test against Fastmail's API will confirm. If a method fails due to scope, the error handling (REQ-EMT-5) will surface it clearly.
- **HTML stripping fidelity**: The utility in Step 3 handles common email HTML patterns. Unusual HTML (heavily styled newsletters, embedded CSS) may produce messy output. This is acceptable for the first version; the stripping logic can be refined based on real-world email content.
- **First domain toolbox in production**: This is the first real domain toolbox package. The resolver code is tested with fixtures but has never loaded a real package at runtime. The integration test in Step 1 covers this gap, but watch for edge cases during the first actual commission that uses email tools.
