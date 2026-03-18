---
title: "Email package refactor: shared core with dual factory exports"
date: 2026-03-17
status: draft
tags: [refactor, operations, toolbox, email, architecture, pattern]
modules: [guild-hall-email, daemon]
related:
  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/design/package-operation-handler.md
  - .lore/specs/workers/guild-hall-mail-reader-toolbox.md
  - .lore/specs/infrastructure/cli-progressive-discovery.md
---

# Plan: Email Package Refactor (Shared Core, Dual Factory Exports)

## Goal

Refactor `packages/guild-hall-email/` so that core email logic (JMAP calls, response formatting) lives in format-agnostic functions. Two thin adapter layers wrap those functions: `toolboxFactory` returns MCP `ToolResult` content blocks for agent sessions, `operationFactory` returns `OperationHandlerResult` JSON for REST/CLI consumers. Both are exported from `index.ts`.

This establishes the reference pattern for how all domain toolbox packages expose both surfaces from shared internals. REQ-DAB-20 governs the relationship: toolboxes and operations serve different audiences through the same daemon boundary; packages extend both surfaces independently.

**Not in scope:** The package author decides which capabilities appear on each surface (they don't have to be 1:1). This plan makes all four current tools available on both surfaces because the email package is read-only and all operations are useful from both sides. Future packages may choose differently.

## Codebase Context

### Current state of guild-hall-email

The package has four files beyond `package.json`:

- **`index.ts`** (165 lines): Exports `toolboxFactory`. Builds an MCP server with four tools (`search_emails`, `read_email`, `list_mailboxes`, `get_thread`). Has two code paths: unconfigured (no token) and configured (with `JmapClient`).
- **`tools.ts`** (350 lines): Four maker functions (`makeSearchEmailsHandler`, `makeReadEmailHandler`, `makeListMailboxesHandler`, `makeGetThreadHandler`). Each accepts a `JmapClient`, returns an async handler that produces `ToolResult`. Contains JMAP call construction, response mapping, and error wrapping all in one function.
- **`jmap-client.ts`** (347 lines): `JmapClient` class. Stateful: session management, mailbox cache, reconnection logic. This file needs no changes.
- **`html-to-text.ts`** (110 lines): Pure utility. No changes needed.

### The coupling problem in tools.ts

Each handler in `tools.ts` does three things that should be separate:

1. **JMAP orchestration**: Constructs method calls, sends them via `client.request()`, extracts response data. This is the domain logic.
2. **Data formatting**: Maps JMAP response structures into clean result objects (resolving mailbox names, extracting body text, building attachment metadata).
3. **MCP wrapping**: Serializes the result to `ToolResult` via `textResult()` / `errorResult()` / `toToolError()`. This is presentation.

Steps 1 and 2 are shared. Step 3 is MCP-specific. The refactor extracts 1+2 into core functions that return plain data objects, then builds thin wrappers for MCP and REST.

### Operation system infrastructure

The daemon already supports `operationFactory` as a package export:

- **`daemon/services/operation-types.ts`**: Defines `OperationFactory`, `OperationFactoryDeps`, `PackageOperation`, `OperationHandlerResult`, `OperationHandlerError`, `OperationHandlerContext`.
- **`daemon/services/operations-loader.ts`**: `loadPackageOperations()` iterates discovered packages, imports entry points, calls `operationFactory` if present, validates output.
- **`daemon/routes/package-operations.ts`**: `createPackageOperationRoutes()` generates Hono routes from `PackageOperation[]` with context validation, parameter extraction, error handling.
- Tests exist for both the loader (10 tests) and routes (18 tests).

No package currently exports `operationFactory`. The email package will be the first.

### Resolved architectural tension

An earlier issue proposed deriving `operationFactory` from `toolboxFactory` (auto-generating REST handlers from MCP tool definitions). A Dalton commission attempted this and abandoned it with the note "this was a bad idea." REQ-DAB-20 confirms the correct approach: independent factories, shared core. This plan follows that.

**Terminology note:** The design document at `.lore/design/package-operation-handler.md` uses the old "skill" terminology throughout (`SkillFactory`, `SkillHandlerContext`, etc.). It has a rename note at the top. Use `daemon/services/operation-types.ts` as the authoritative source for current type names.

## Implementation Steps

### Step 1: Extract core functions into `core.ts`

**Files**: `packages/guild-hall-email/core.ts` (new), `packages/guild-hall-email/tools.ts` (modified)

Create `core.ts` with four async functions that accept a `JmapClient` and operation-specific arguments, return plain data objects (no `ToolResult`, no `OperationHandlerResult`):

- `searchEmails(client, args)` returns `{ emails: EmailSummary[], total: number }`
- `readEmail(client, emailId)` returns `EmailDetail` (or throws)
- `listMailboxes(client)` returns `{ mailboxes: Mailbox[] }`
- `getThread(client, threadId)` returns `{ threadId, emails: EmailSummary[], total: number }` (or throws)

Define result types as interfaces in `core.ts`: `EmailSummary`, `EmailDetail`, `SearchEmailsArgs`. These represent the domain data, not presentation format.

Error handling: core functions throw domain errors (e.g., "Email not found", "Thread not found", auth errors). They don't catch and wrap. The adapters decide how to present errors.

**Behavioral change note:** In the current `tools.ts`, the not-found cases in `readEmail` and `getThread` use an inline `return errorResult(...)` inside the handler's try block rather than throwing. The extraction converts these to thrown errors (e.g., `throw new Error("Email not found: ...")`). This is intentional: the MCP adapter in Step 2 catches these via `toToolError()`, producing the same `ToolResult` with `isError: true`. Existing tests that check `result.isError` and error message content will still pass. The REST adapter in Step 3 catches and maps to `OperationHandlerError` with status 404.

The extraction is mechanical for `searchEmails` and `listMailboxes`. For `readEmail` and `getThread`, replace the inline `errorResult` returns with throws before extracting.

### Step 2: Rewrite `tools.ts` to use core functions

**Files**: `packages/guild-hall-email/tools.ts`

Each maker function becomes a thin wrapper:

```
makeSearchEmailsHandler(client) → async (args) => {
  try {
    const result = await searchEmails(client, args);
    return textResult(result);
  } catch (err) {
    return toToolError(err);
  }
}
```

The `textResult`, `errorResult`, and `toToolError` helpers stay in `tools.ts` because they produce MCP-specific `ToolResult` types. `tools.ts` shrinks significantly. `index.ts` stays unchanged at this step (still imports from `tools.ts`, still exports only `toolboxFactory`).

### Step 3: Add `operations.ts` with REST adapter

**Files**: `packages/guild-hall-email/operations.ts` (new)

Create the REST-facing adapter. This file imports core functions from `core.ts` and wraps them in `PackageOperation` objects:

- Each operation has an `OperationDefinition` (operationId, description, invocation path/method, context, hierarchy).
- Each operation has a `handler` that calls the corresponding core function and returns `OperationHandlerResult`.
- Error handling: catch domain errors, convert to `OperationHandlerError` with appropriate HTTP status codes (404 for not-found, 401 for auth failures, 500 for others).

Operation definitions for the four operations:

| operationId | method | path | name |
|-------------|--------|------|------|
| `email.inbox.search` | POST | `/email/inbox/search` | `search` |
| `email.inbox.read` | GET | `/email/inbox/read` | `read` |
| `email.inbox.mailboxes` | GET | `/email/inbox/mailboxes` | `mailboxes` |
| `email.inbox.thread` | GET | `/email/inbox/thread` | `thread` |

All four operations share these `OperationDefinition` fields: `version: "1"`, `readOnly: true`, `idempotent: true`, `sideEffects: ""`, `context: {}`, `hierarchy: { root: "email", feature: "inbox" }`. The `search` operation is POST because it has a complex filter body. The others are GET with query params.

The `operationFactory` function in this file:
1. Reads `FASTMAIL_API_TOKEN` from `process.env` (same as `toolboxFactory`).
2. If unconfigured, returns `{ operations: [] }`. No REST operations without a token. (Unlike MCP tools, which return a configuration error message, REST operations simply don't appear. An unconfigured package shouldn't pollute the CLI help tree.)
3. If configured, creates a `JmapClient`, kicks off background connection, returns operations that use it.

The `JmapClient` instance is created inside the factory closure, captured by handlers. Same lifecycle pattern as the MCP side.

### Step 4: Export `operationFactory` from `index.ts`

**Files**: `packages/guild-hall-email/index.ts`

Add the export:

```typescript
export { operationFactory } from "./operations";
```

This is a one-line change. The `toolboxFactory` export and the MCP server construction stay exactly where they are. The two factories are independent exports per REQ-DAB-20.

### Step 5: Add Zod request schemas for operations

**Files**: `packages/guild-hall-email/operations.ts`

`requestSchema` is optional on `OperationDefinition`, so Step 3 produces valid, compilable code without schemas. This step fills them in for parameter validation by the route factory. Define Zod schemas that match the argument types:

- `searchEmailsSchema`: from/to/subject/text/after/before/in_mailbox/has_attachment/limit (all optional)
- `readEmailSchema`: email_id (required string)
- `listMailboxesSchema`: empty object
- `getThreadSchema`: thread_id (required string)

These schemas serve double duty: they validate REST parameters and they document the API contract in the help system.

### Step 6: Write tests for core functions

**Files**: `tests/packages/guild-hall-email/core.test.ts` (new)

Test each core function in isolation with a mocked `JmapClient`:

- `searchEmails`: filter construction, response mapping, limit clamping, mailbox name resolution
- `readEmail`: body extraction (text vs HTML fallback), attachment metadata, not-found error
- `listMailboxes`: returns cached mailbox list
- `getThread`: chronological sorting, not-found error

These tests verify the domain logic that was previously only testable through the MCP wrapper. The mock client approach already exists in the email package's test suite.

### Step 7: Write tests for operation handlers

**Files**: `tests/packages/guild-hall-email/operations.test.ts` (new)

Test the `operationFactory` output:

- Factory returns empty operations when `FASTMAIL_API_TOKEN` is unset
- Factory returns four operations when token is set
- Each operation's handler calls the corresponding core function and returns `OperationHandlerResult`
- Error mapping: domain errors become `OperationHandlerError` with correct status codes
- Operation definitions have correct operationId, method, path, hierarchy

### Step 8: Update existing MCP tool tests

**Files**: `tests/packages/guild-hall-email/tools.test.ts` (existing, if any)

Verify existing tests still pass after the `tools.ts` refactor. If the test file calls maker functions directly, the tests should work without changes since the external interface (`makeXxxHandler` returning `Promise<ToolResult>`) is unchanged.

### Step 9: Validate against goal

Launch a sub-agent that reads this plan's Goal section, reviews the implementation, and flags anything that doesn't match. Specifically verify:

- Both `toolboxFactory` and `operationFactory` are exported from `index.ts`
- Core logic in `core.ts` has no imports from `@/daemon/types` (no MCP types) or `operation-types` (no REST types)
- `tools.ts` and `operations.ts` are thin wrappers (each handler body is under ~10 lines)
- The `operations-loader` successfully discovers and loads the email package's `operationFactory`
- All tests pass

## Delegation Guide

Steps 1-5 are straightforward refactoring. No specialized expertise needed beyond familiarity with the codebase patterns.

- **Steps 6-7** (tests): Standard test writing. The implementer should use the mock `JmapClient` pattern from existing email package tests at `tests/packages/guild-hall-email/`.
- **Step 9** (validation): Use a fresh-context sub-agent to verify. Consult `.lore/lore-agents.md` if available; otherwise use a general-purpose code review agent.

## Open Questions

- **Should the two factories share a single `JmapClient` instance?** Currently they can't because they're called independently by different daemon subsystems (toolbox resolver vs. operations loader). Each factory creates its own client. This means two JMAP sessions per configured email package. In practice, the session is lightweight (one HTTP call to fetch the session resource). If this becomes a concern, the daemon could pass a shared client via deps, but that would require adding JMAP-specific knowledge to the daemon's generic factory deps. Not worth it now.

- **Operation hierarchy naming.** The hierarchy `{ root: "email", feature: "inbox" }` places all email operations under `email > inbox` in the CLI help tree. If a future package adds email-adjacent operations (calendar, contacts), they'd be `email > calendar`, etc. This hierarchy can be changed later without breaking anything.
