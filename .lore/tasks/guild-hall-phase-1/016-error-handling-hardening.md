---
title: Error handling and edge case hardening
date: 2026-02-11
status: complete
tags: [task]
source: .lore/plans/guild-hall-phase-1.md
sequence: 16
modules: [guild-hall]
related:
  - .lore/specs/guild-hall-phase-1.md
  - .lore/plans/guild-hall-phase-1.md
---

# Task: Error handling and edge case hardening

## What

Sweep through the implementation verifying that error paths work end-to-end, not just in isolation. Each prior task handles its own errors, but this task verifies the integration.

**Verify end-to-end flows**:

1. **Invalid manifest display** (REQ-GH1-26): Drop a malformed `guild-member.json` in the discovery directory. Verify it appears as an error card in the Roster on both the Dashboard and the Workshop sidebar. Error message should be visible and descriptive.

2. **MCP server crash mid-session**: Simulate a server process dying while a query is running. Verify: MCP manager detects it, emits error event, SSE delivers the error to the Workshop, Workshop displays the error. User can retry (server restarts).

3. **Expired SDK session full flow** (REQ-GH1-22): Simulate an expired session ID. Verify: query fails, status transitions to `expired`, SSE delivers status change, Workshop shows expired state with "Start Fresh" button, clicking it creates a new SDK session with context.md and messages preserved.

4. **SSE reconnection**: Simulate client disconnect during an active query (e.g., page refresh). Verify: new EventSource connection receives `status_change` with `running`, subsequent events are forwarded, query completion triggers full conversation fetch.

5. **Roster in Workshop** (REQ-GH1-9): Verify the Roster component renders correctly in the Workshop sidebar, shows the same guild members as the Dashboard, and updates status correctly.

6. **Filesystem errors**: Test behavior when session directory can't be created (permissions) or written to (disk full simulation). Errors should surface as descriptive messages, not crashes.

## Validation

- Invalid manifest produces an error card visible in both Dashboard Roster and Workshop Roster sidebar
- MCP server crash during query results in an error event delivered via SSE to the Workshop
- Expired session flow works end-to-end: detection, status transition, UI indication, fresh start
- SSE reconnection mid-query picks up from current point without replay
- Roster renders identically in Dashboard and Workshop contexts
- Filesystem permission errors produce descriptive error responses, not 500s or crashes

## Why

REQ-GH1-9: "The Roster is visible from both the dashboard and within the Workshop."

REQ-GH1-22: "When a stored SDK session ID is no longer valid, the session is marked expired."

REQ-GH1-26: "Invalid manifests produce a log entry and the guild member appears in the Roster with an error status."

## Files

- Modifications across `lib/` and `components/` as needed
- `tests/integration/error-handling.test.ts` (create)
