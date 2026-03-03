---
title: Audit of executed plans without dedicated specs
date: 2026-03-02
status: active
tags: [audit, specs, cleanup]
---

# Executed Plans Without Dedicated Specs

Seven executed plans have no dedicated spec file. Each needs its changes reflected in existing specs.

## 1. cancel-commission-tool

**What changed:** Added `cancel_commission` tool to the Guild Master's manager toolbox. Threaded an optional `reason` parameter through `cancelCommission()`.

**Spec impact:** guild-hall-commissions.md and guild-hall-workers.md. The spec already defined the cancel semantics (REQ-COM-5, REQ-COM-6). The new tool is the manager-side implementation of what was already allowed. Specs may need the tool listed explicitly in the manager toolbox capabilities.

## 2. commission-meeting-state-ownership

**What changed:** Closed five implementation gaps in the state ownership model: write path routing audit, integration worktree commit before merge, Guild Master escalation on merge conflict, state file cleanup after merge, state file schema narrowing. Added `createMeetingRequestFn` callback to commission and meeting deps for conflict escalation.

**Spec impact:** guild-hall-system.md (REQ-SYS-26b/c), guild-hall-commissions.md (REQ-COM-12), guild-hall-meetings.md (REQ-MTG-2a). Plan says specs were already correct and implementation caught up. Verify specs mention state file removal and conflict escalation explicitly.

## 3. extract-finalize-activity

**What changed:** Created `finalizeActivity()` in `daemon/lib/git.ts` to unify the commit-merge-cleanup sequence used by both commissions and meetings. Pure refactor, no behavior change.

**Spec impact:** Minimal. Internal architecture. If system spec documents the merge sequence, it should reference the unified function. No requirement changes.

## 4. extract-query-runner

**What changed:** Extracted SDK query execution pipeline from `meeting-session.ts` into `daemon/services/query-runner.ts`. Moved `runQueryAndTranslate`, `truncateTranscript`, `isSessionExpiryError`, and related types. Pure refactor.

**Spec impact:** None. Internal module boundary, no behavior change.

## 5. fix-duplicate-tool-notifications

**What changed:** Added `id` field to `tool_use` events and `toolUseId` to `tool_result` events. Suppressed duplicate tool_use emissions from finalized assistant messages. Changed client-side tool matching from name-only to ID-based with name fallback.

**Spec impact:** If guild-hall-system.md or guild-hall-views.md documents the GuildHallEvent types or SSE event schema, the new `id`/`toolUseId` fields need documenting. Otherwise minimal.

## 6. in-process-commissions

**What changed:** Replaced subprocess-based commission workers with in-process async sessions. Removed IPC routes, heartbeat monitoring, PID tracking, SIGTERM/SIGKILL cancellation. Added AbortController-based cancellation. Commission toolbox switched from HTTP callbacks to injected function callbacks. Simplified daemon restart recovery (fail in-progress commissions instead of PID reattachment).

**Spec impact:** Major. guild-hall-commissions.md needs updates:
- REQ-COM-10 (one OS process per commission) is explicitly replaced
- Heartbeat/liveness monitoring removed (any REQ referencing it)
- Cancellation mechanism changed from signals to AbortController
- Recovery model changed (no PID reattachment)
- IPC routes removed (progress/result/question endpoints)

## 7. multiline-tool-display-on-reopen

**What changed:** Fixed transcript serialization to blockquote-prefix every line of multiline tool results, not just the first. Both daemon and Next.js parsers already handled the correct format.

**Spec impact:** Minimal. If any spec documents transcript format, the multiline blockquote rule should be noted. Otherwise a bug fix with no requirement changes.

## Priority Order for Spec Updates

1. ~~**in-process-commissions**~~ - done, swept REQ-COM-6/11/13/14/19/28, success criteria, AI validation, constraints
2. **commission-meeting-state-ownership** - verify existing REQs match implementation
3. **cancel-commission-tool** - add manager tool to capability docs
4. **fix-duplicate-tool-notifications** - document event schema changes if covered
5. **extract-finalize-activity** - minor architectural note
6. **multiline-tool-display-on-reopen** - format detail only
7. **extract-query-runner** - no spec impact
