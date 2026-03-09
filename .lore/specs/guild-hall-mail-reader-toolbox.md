---
title: Guild Hall Mail Reader Toolbox
date: 2026-03-08
status: approved
tags: [architecture, toolbox, email, fastmail, jmap, packages]
modules: [packages, toolbox-resolver]
related:
  - .lore/specs/guild-hall-workers.md
  - .lore/specs/guild-hall-worker-roster.md
  - .lore/research/fastmail-jmap-integration.md
req-prefix: EMT
---

# Spec: Guild Hall Mail Reader Toolbox

## Overview

A domain toolbox package that gives workers read-only access to the user's email inbox via Fastmail's JMAP API. Workers use it to search, read, and navigate email as part of their commissions and meetings, the same way they use filesystem tools to read code.

This spec defines the toolbox's tools, configuration, security model, and how workers opt in. The JMAP protocol details, authentication mechanics, and TypeScript implementation patterns are covered in the [research document](.lore/research/fastmail-jmap-integration.md); this spec consumes those findings without repeating them.

**Naming note:** Guild Hall already has a "mail" system (worker-to-worker communication, REQ-MAIL in [Spec: Worker-to-Worker Communication](worker-communication.md)). This spec uses "email" for the external inbox toolbox to avoid confusion. The package is `guild-hall-email`, the MCP server name is `guild-hall-email`, and the tools are prefixed accordingly. "Mail" in this document refers only to worker-to-worker mail when explicitly stated.

## Entry Points

- Worker package declares `domainToolboxes: ["guild-hall-email"]` in package metadata (from [Spec: guild-hall-workers](guild-hall-workers.md), REQ-WKR-2)
- Toolbox resolver loads the package and calls `toolboxFactory(deps)` at activation time (REQ-WKR-12)
- Worker calls email tools during a commission or meeting session

## Requirements

### Package Structure

- REQ-EMT-1: The email toolbox is a domain toolbox package at `packages/guild-hall-email/`. It declares toolbox metadata in `package.json` under `guildHall`, following the existing package API (REQ-WKR-5, REQ-WKR-6). The `toolboxMetadataSchema` at `lib/packages.ts:61-65` requires three fields:

  ```json
  {
    "guildHall": {
      "type": "toolbox",
      "name": "guild-hall-email",
      "description": "Read-only access to the user's Fastmail inbox via JMAP."
    }
  }
  ```

- REQ-EMT-2: The package exports a `toolboxFactory` function conforming to the `ToolboxFactory` signature (`daemon/services/toolbox-types.ts:34`). The factory receives `GuildHallToolboxDeps`, reads `FASTMAIL_API_TOKEN` from the environment to create a JMAP client, and returns a `ToolboxOutput` with the MCP server. The factory pattern matches what the toolbox resolver expects (REQ-WKR-6a).

- REQ-EMT-3: The package contains a thin JMAP client wrapper (no external JMAP library dependency). The client uses `fetch()` with typed interfaces, following the pattern established by existing Fastmail integrations and documented in the research. The client handles session bootstrap, request batching, and response parsing.

### Tool Definitions

- REQ-EMT-4: The toolbox exposes four read-only tools via an in-process MCP server named `guild-hall-email`:

  **search_emails**: Search for emails matching filter criteria.
  - Parameters:
    - `from` (string, optional): Sender email address or name. Single value; passed directly to JMAP's filter as a substring match.
    - `to` (string, optional): Recipient email address or name. Single value; same matching behavior as `from`.
    - `subject` (string, optional): Subject line text to match (substring).
    - `text` (string, optional): Full-text search across email content.
    - `after` (string, optional): Only emails received after this UTC datetime (ISO 8601).
    - `before` (string, optional): Only emails received before this UTC datetime (ISO 8601).
    - `in_mailbox` (string, optional): Mailbox name (not ID) to search within. The tool resolves names to JMAP mailbox IDs internally, so workers don't need to call `list_mailboxes` first for common folders like "Inbox" or "Sent".
    - `has_attachment` (boolean, optional): Filter to emails with/without attachments.
    - `limit` (number, optional, default 20): Maximum results to return. Capped at 100.
  - Returns: Array of email summaries (id, threadId, from, to, subject, receivedAt, preview, hasAttachment, isUnread). Results sorted by receivedAt descending.

  **read_email**: Read the full content of a specific email by ID.
  - Parameters:
    - `email_id` (string, required): The email ID from a `search_emails` result.
  - Returns: Full email content (id, threadId, from, to, cc, replyTo, subject, sentAt, receivedAt, textBody, htmlBody as plain text with HTML stripped, attachments metadata, mailbox names, read/flagged status).

  **list_mailboxes**: List all mailboxes (folders) in the account.
  - Parameters: none.
  - Returns: Array of mailboxes (id, name, role, parentId, totalEmails, unreadEmails). Roles identify system mailboxes (inbox, drafts, sent, trash, junk, archive).

  **get_thread**: Get all emails in a conversation thread.
  - Parameters:
    - `thread_id` (string, required): The thread ID from a `search_emails` or `read_email` result.
  - Returns: Array of email summaries (same shape as `search_emails` results) for all emails in the thread, sorted chronologically.

- REQ-EMT-5: All tool responses include structured error messages when operations fail. JMAP error responses (type, description) are mapped to readable tool error text. Authentication failures specifically report "Email toolbox authentication failed. Check FASTMAIL_API_TOKEN." without exposing the token value.

- REQ-EMT-6: The toolbox is strictly read-only. No tools for sending, deleting, moving, flagging, or modifying emails in any way. This constraint is enforced at the tool definition level (no write operations exist in the MCP server) and should be reinforced at the Fastmail token level (token created with read-only scope).

  > **Rationale:** Read-only limits blast radius. An AI worker with send capability could email arbitrary addresses. The research recommends starting read-only, and there is no current use case that requires write access.

### JMAP Client

- REQ-EMT-7: The JMAP client fetches the session resource once during factory initialization and caches the result in memory for the lifetime of the MCP server instance. The session provides the `apiUrl` for subsequent method calls, the `primaryAccounts` mapping, and the `downloadUrl` template.

  The session URL defaults to `https://api.fastmail.com/jmap/session` but is injectable via constructor parameter, enabling integration tests to point at a local mock server without mocking `fetch` globally. The `FASTMAIL_SESSION_URL` environment variable may override the default for testing or alternative deployments.

  Session re-fetch happens only on authentication error (HTTP 401) during a method call, as a single retry. If the retry also fails, the error propagates to the tool caller.

  The client has three initialization states: **unconfigured** (no token, REQ-EMT-13), **connected** (session cached, normal operation), and **degraded** (session fetch failed, REQ-EMT-25). All three are valid states that the factory can produce; only "connected" enables successful tool calls.

- REQ-EMT-8: The client uses JMAP's request batching to minimize round-trips. `search_emails` batches `Email/query` and `Email/get` in a single HTTP POST using back-references. This is a protocol feature, not an optimization hack.

- REQ-EMT-9: `search_emails` resolves the `in_mailbox` parameter from a mailbox name to a JMAP mailbox ID by querying `Mailbox/get` and matching on the `name` field (case-insensitive). The mailbox list is cached alongside the session to avoid repeated lookups. The cache reflects the account state at toolbox initialization time; there is no refresh mechanism. If mailbox names change during a session, workers will see an error listing available names (from the stale cache). If no mailbox matches, the tool returns an error listing available mailbox names.

- REQ-EMT-10: `read_email` fetches `bodyValues` for both text and HTML body parts. HTML content is converted to plain text before returning (strip tags, preserve structure). Workers receive readable text, not raw HTML. The `maxBodyValueBytes` is set to 256,000 (256KB), which covers the vast majority of emails without returning excessively large payloads.

- REQ-EMT-11: The client declares only the JMAP capabilities it uses: `urn:ietf:params:jmap:core` and `urn:ietf:params:jmap:mail`. It does not request `urn:ietf:params:jmap:submission` or any Fastmail extensions. This matches the read-only constraint (REQ-EMT-6).

### Configuration

- REQ-EMT-12: The Fastmail API token is read from the `FASTMAIL_API_TOKEN` environment variable. The daemon process must have this variable set for the toolbox to function. The token is never logged, never written to disk by the toolbox, and never included in tool responses.

- REQ-EMT-13: If `FASTMAIL_API_TOKEN` is not set when the toolbox factory is called, the factory still returns a valid MCP server. All tools return an error message: "Email toolbox is not configured. Set the FASTMAIL_API_TOKEN environment variable." This avoids crashing worker activation when the token is absent. Workers that declare the toolbox can still activate; they just can't use email tools until the token is configured.

  > **Rationale:** Hard failure during `resolveToolSet` would prevent the worker from running at all, even for commissions that don't need email access. Soft failure per tool call is more forgiving while remaining clear about the problem.

- REQ-EMT-14: The API token requires a Fastmail Individual plan ($6/mo) or higher. The token is created at Fastmail Settings > Privacy & Security > Manage API tokens with read-only scope. These are prerequisites documented in the package README, not enforced by code.

- REQ-EMT-15: No Guild Hall config.yaml changes are required. The toolbox reads its configuration from the environment. If future configuration needs arise (e.g., overriding the session URL for testing), they should be added as environment variables, not config.yaml fields. The email toolbox is optional infrastructure, not a core Guild Hall setting.

### Security Model

- REQ-EMT-16: Access control has two layers:

  **Layer 1 (Fastmail token scope):** The API token itself is scoped at creation time. A read-only token prevents write operations at the API level regardless of what the toolbox code attempts. This is the hard security boundary.

  **Layer 2 (Toolbox tool definitions):** The toolbox only defines read operations. Even if a token has write scope, the toolbox provides no tools to exercise it. This is defense in depth, not the primary control.

- REQ-EMT-17: Workers gain email access by declaring `domainToolboxes: ["guild-hall-email"]` in their package metadata. The toolbox resolver loads and provides it per the existing resolution flow (REQ-WKR-12). Workers that don't declare it never see email tools. There is no additional permission gate beyond the existing toolbox declaration model.

  This means access is a deployment decision: which workers get email tools is determined by their package.json, not by runtime configuration. The user controls this by editing worker package metadata.

- REQ-EMT-18: The API token is shared across all workers that declare the email toolbox. All workers see the same inbox. There is no per-worker token isolation. This is appropriate for a single-user system where the user owns both the Fastmail account and all worker configurations.

- REQ-EMT-19: Tool responses may contain sensitive information (email bodies, sender addresses, subject lines). Workers process this content within their session context. The standard Guild Hall security model applies: workers run with full tool permissions within their declared set (REQ-WKR-17), and the user trusts their workers with the tools they configure.

  Workers should not write raw email content to project memory or artifacts unless the commission explicitly requests it. This is a posture concern (encoded in worker instructions when email tools are relevant), not a system enforcement.

### Worker Integration

- REQ-EMT-20: Any worker can declare `guild-hall-email` in its `domainToolboxes`. There is no role restriction. Typical use cases by roster worker:

  | Worker | Use Case |
  |--------|----------|
  | Researcher | Search emails for context relevant to a research question. Find prior discussions, decisions, or reference material. |
  | Writer | Pull email content as source material for documentation or summaries. |
  | Manager | Check for messages related to active commissions or blocked work. |
  | Developer | Find specification emails, bug reports, or requirements shared via email. |
  | Reviewer | Look up email threads referenced in code comments or commit messages. |

  The spec does not prescribe which workers should have email access. That is a per-deployment configuration choice.

- REQ-EMT-21: Workers interact with the email toolbox the same way they interact with any domain toolbox: through tool calls during their session. No special activation, no additional prompt injection, no lifecycle hooks. The toolbox is present in the tool set if declared; absent if not.

- REQ-EMT-22: The email toolbox does not inject any content into the worker's system prompt. Workers discover the tools through the SDK's tool listing. Tool descriptions (REQ-EMT-4) are self-documenting. If a commission prompt wants the worker to use email, it says so in the agentic prompt (e.g., "Search for emails from engineering@example.com about the API migration").

### Error Handling

- REQ-EMT-23: Network errors (fetch failures, timeouts) return tool errors with the HTTP status code and a human-readable message. The underlying error details (response body, headers) are not exposed to the worker to avoid leaking server internals.

- REQ-EMT-24: Rate limiting (HTTP 429 or JMAP-level `tooManyRequests`) returns a tool error: "Rate limited by Fastmail. Try again in a moment." The toolbox does not automatically retry. Workers can retry the tool call if their commission logic warrants it.

- REQ-EMT-25: If the JMAP session fetch fails during factory initialization, the client enters a degraded state where all tool calls return "Email toolbox failed to connect to Fastmail: [error]." A subsequent tool call triggers one re-attempt to establish the session before returning the error.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Worker package metadata updates | A roster worker needs email access added to its `domainToolboxes` | Worker package.json in `packages/` |
| Write capability expansion | Use cases emerge for sending email or managing mailbox state | Future spec (not this one) |

## Success Criteria

- [ ] `guild-hall-email` package exists in `packages/` with `type: "toolbox"` metadata
- [ ] Package exports `toolboxFactory` conforming to `ToolboxFactory` signature
- [ ] `search_emails` returns email summaries matching filter criteria
- [ ] `search_emails` resolves mailbox names to IDs transparently
- [ ] `read_email` returns full email content with HTML converted to plain text
- [ ] `list_mailboxes` returns all mailboxes with role identification
- [ ] `get_thread` returns all emails in a thread sorted chronologically
- [ ] Session fetch occurs once per toolbox factory instantiation; subsequent tool calls do not make additional session fetch requests
- [ ] All tools return clear error messages when `FASTMAIL_API_TOKEN` is not set
- [ ] All tools return clear error messages on authentication failure
- [ ] No write operations exist in the toolbox (no send, delete, move, flag tools)
- [ ] Workers declaring `domainToolboxes: ["guild-hall-email"]` receive email tools during activation
- [ ] Workers not declaring the toolbox do not see email tools
- [ ] The toolbox loads successfully even when `FASTMAIL_API_TOKEN` is absent (soft failure)
- [ ] Toolbox resolver handles the package like any other domain toolbox (no special-casing)

## AI Validation

**Defaults:**
- Unit tests with mocked `fetch()` for JMAP API calls
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- JMAP client test: session fetch, caching, and re-fetch on 401
- Search tool test: filter combinations produce correct JMAP method calls with back-references
- Mailbox name resolution test: name-to-ID lookup with cache, case-insensitive match, error on unknown name
- HTML stripping test: HTML email body converted to readable plain text
- Token-absent test: factory returns server, all tools return configuration error
- Integration test: toolbox resolver loads `guild-hall-email` package, calls factory, produces valid MCP server
- Thread retrieval test: `get_thread` with a valid thread ID returns all emails sorted chronologically; unknown thread ID returns a clear error
- Error mapping test: JMAP errors, HTTP errors, network failures all produce readable tool errors

## Constraints

- Read-only. No write operations, no sending, no mailbox management. This is a deliberate scope limitation, not a technical one.
- Single Fastmail account. One token, one inbox, shared across all workers. Multi-account support is not in scope.
- No push notifications. Workers query email on demand during tool calls. The JMAP EventSource/SSE mechanism for real-time push is not used. Workers don't need to be notified of new email; they search when a commission asks them to.
- No attachment content retrieval. `read_email` returns attachment metadata (filename, size, content type) but not the attachment bytes. Downloading and processing attachments is a separate concern with its own storage and security implications.
- Fastmail-specific. The JMAP client targets Fastmail's session endpoint. Other JMAP providers would require a different session URL configuration. Generalizing to arbitrary JMAP providers is not in scope.
- The email toolbox does not change the toolbox resolver, `GuildHallToolboxDeps`, or any system toolbox. It plugs into the existing domain toolbox infrastructure without modification.

## Context

- [Research: Fastmail JMAP Integration](.lore/research/fastmail-jmap-integration.md): Protocol details, authentication, TypeScript patterns, feasibility assessment. Establishes that JMAP is HTTP + JSON with no library needed, API tokens via bearer header, and ~200 lines of client wrapper.
- [Spec: Guild Hall Workers](guild-hall-workers.md): Toolbox package API (REQ-WKR-5, REQ-WKR-6, REQ-WKR-6a), toolbox resolution (REQ-WKR-12, REQ-WKR-13), `domainToolboxes` declaration model.
- [Spec: Worker Domain Plugins](worker-domain-plugins.md): Analogous pattern for plugin resolution. The `domainToolboxes` model this spec uses was established first; domain plugins mirror it.
- [Spec: Worker-to-Worker Communication](worker-communication.md): The existing "mail" system in Guild Hall. This spec's "email" toolbox is unrelated. The naming distinction (email vs. mail) is intentional.
- [Spec: Guild Hall Worker Roster](guild-hall-worker-roster.md): The five roster workers that could declare this toolbox.
- Toolbox resolver: `daemon/services/toolbox-resolver.ts` implements the resolution flow. Domain toolboxes are loaded via dynamic import of the package's `index.ts`, which must export `toolboxFactory`.
- Toolbox types: `daemon/services/toolbox-types.ts` defines `ToolboxFactory`, `ToolboxOutput`, and `GuildHallToolboxDeps`. The email toolbox factory receives these deps but only uses `eventBus` minimally (no events to emit for read-only operations).
