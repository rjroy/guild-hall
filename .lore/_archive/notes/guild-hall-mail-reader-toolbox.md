---
title: Implementation notes guild-hall-mail-reader-toolbox
date: 2026-03-08
status: complete
tags: [toolbox, email, jmap]
related: [.lore/specs/workers/guild-hall-mail-reader-toolbox.md, .lore/plans/workers/guild-hall-mail-reader-toolbox.md]
source: .lore/plans/workers/guild-hall-mail-reader-toolbox.md
modules: [packages, toolbox-resolver]
---

# Implementation Notes: Guild Hall Mail Reader Toolbox

Built the first real domain toolbox package: 5 source files, 5 test files, 75 package tests pass, full suite 2094/2096 (2 pre-existing timing failures). Six phases, no divergences.

## Progress
- [x] Phase 1: Package scaffold and resolver integration
- [x] Phase 2: JMAP client
- [x] Phase 3: HTML-to-text utility
- [x] Phase 4: Tool implementations
- [x] Phase 5: Factory wiring with initialization states
- [x] Phase 6: Validate against spec (24/25 PASS, 1 fixed)

## Log

### Phase 1: Package scaffold and resolver integration
- Result: Created `packages/guild-hall-email/` with package.json, index.ts (placeholder factory), README.md
- Tests: 3 integration tests pass. Metadata validates, resolver loads the real package, worker without email toolbox doesn't see it.

### Phase 2: JMAP client
- Result: Created `packages/guild-hall-email/jmap-client.ts` with JmapClient class.
- Key details: ensureConnected() manages connection promise with retry-on-failure. connect() does session fetch + mailbox cache. request() handles 401 retry, 429 rate limit, JMAP-level errors. Only jmap:core and jmap:mail capabilities (REQ-EMT-11).
- Tests: 17 tests pass. All use injected fetchFn, no global mocking.

### Phase 3: HTML-to-text utility
- Result: Created `packages/guild-hall-email/html-to-text.ts`. Pipeline: remove style/script, convert links, newlines for block elements, strip remaining tags, decode entities, normalize whitespace.
- Tests: 21 tests pass.

### Phase 4: Tool implementations
- Result: Created `packages/guild-hall-email/tools.ts` with four handler maker functions.
- search_emails: batched Email/query + Email/get with #ids back-reference. Clamped to 100.
- read_email: fetchTextBodyValues + fetchHTMLBodyValues, HTML fallback through htmlToText. Attachment metadata without content.
- list_mailboxes: returns cached mailbox data.
- get_thread: batched Thread/get + Email/get, sorted chronologically.
- Auth errors mapped to "Check FASTMAIL_API_TOKEN" message. Token never in responses.
- Tests: 23 tests pass.

### Phase 5: Factory wiring with initialization states
- Result: Replaced placeholder factory in index.ts with three-state implementation (unconfigured, connected, degraded).
- Tests: 11 factory tests pass.
- Review: Code reviewer found a race condition bug: `void client.connect()` bypassed the connection promise tracking in `ensureConnected()`, causing duplicate network requests. Fixed by changing to `void client.ensureConnected()` and making `connect()` private.

### Phase 6: Validate against spec
- Result: 24/25 requirements passed on first check. One gap: REQ-EMT-4 missing `isFlagged` status in read_email response. Fixed by adding `isFlagged` derived from `$flagged` keyword to all three relevant handlers.
- The `workerPortraitUrl` removal in toolbox-types.ts is unrelated to this toolbox (pre-existing change from another branch).

## Divergence
(None)
