---
title: "Commission: Review: Implement Portrait Display-Time Resolution"
date: 2026-03-09
status: completed
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the completed work from commission `commission-Dalton-20260308-201837` (Implement Portrait Display-Time Resolution).\n\n**What changed:** Portrait URLs were removed from meeting artifact frontmatter and are now resolved at display time from worker package metadata. This touches the full stack: daemon services, SDK runner, toolbox resolver, Next.js server components, and dashboard.\n\n**Plan:** `.lore/plans/meetings/portrait-display-time-resolution.md`\n**Spec:** `.lore/specs/workers/worker-identity-and-personality.md`\n**Related issues:** `.lore/issues/meeting-portrait-not-displayed.md`, `.lore/issues/worker-display-title-hardcoded-to-name.md`\n\n**Files changed (from commission artifact):**\n- `lib/packages.ts` — new `resolveWorkerPortraits()` helper\n- `daemon/services/meeting/record.ts` — removed `workerPortraitUrl` from `writeMeetingArtifact()`\n- `daemon/services/meeting/orchestrator.ts` — removed portrait args from three callers\n- `daemon/services/meeting/toolbox.ts` — removed portrait from `MeetingToolboxDeps` and followup template\n- `daemon/services/toolbox-resolver.ts` and `daemon/services/toolbox-types.ts` — removed `workerPortraitUrl` from context/deps\n- `daemon/lib/agent-sdk/sdk-runner.ts` — removed portrait from context passed to `resolveToolSet()`\n- `web/app/projects/[name]/meetings/[id]/page.tsx` — resolves portrait from packages instead of frontmatter\n- `web/app/page.tsx` — calls `resolveWorkerPortraits()` for dashboard\n- `web/components/dashboard/PendingAudiences.tsx` — accepts and threads `workerPortraits` prop\n- `web/components/dashboard/MeetingRequestCard.tsx` — renders `WorkerPortrait` component\n- Tests: `tests/lib/packages.test.ts`, `tests/daemon/services/meeting/record.test.ts`, `tests/daemon/meeting-toolbox.test.ts`, `tests/components/pending-audiences.test.tsx`\n\n**Review focus:**\n1. Verify all `workerPortraitUrl` references are removed from daemon code (no stale threading)\n2. Verify `resolveWorkerPortraits()` correctly maps worker names to portrait paths\n3. Check server/client component boundary: Maps don't serialize across it, should be converted to `Record<string, string>`\n4. Verify spec compliance against REQ-WID-10, REQ-VIEW-3, REQ-VIEW-28, REQ-VIEW-12 zone 5\n5. Check test coverage: old assertions removed, new tests for the helper and graceful degradation\n6. Look for any missed consumers of portrait data that still expect it from frontmatter"
dependencies: []
linked_artifacts:
  - .lore/commissions/commission-Dalton-20260308-201837.md

activity_timeline:
  - timestamp: 2026-03-09T04:31:47.883Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T04:31:47.884Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-09T04:31:47.917Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-09T04:31:55.666Z
    event: progress_report
    reason: "Starting review. Reading plan, spec, and related issues to establish requirements baseline."
  - timestamp: 2026-03-09T04:32:13.354Z
    event: progress_report
    reason: "Requirements baseline established. Now reading all changed implementation files to verify independently."
  - timestamp: 2026-03-09T04:33:05.700Z
    event: progress_report
    reason: "All changed files read. No workerPortraitUrl remains in daemon/. Web prop chain is intact and expected. Now checking manager toolbox for the initiate_meeting path and running grep for any other portrait consumers."
  - timestamp: 2026-03-09T04:33:44.110Z
    event: progress_report
    reason: "All code read, grep complete, tests verified (2021 pass, 0 fail). Compiling findings report."
  - timestamp: 2026-03-09T04:34:27.369Z
    event: result_submitted
    reason: "# Review: Portrait Display-Time Resolution (commission-Dalton-20260308-201837)\n\n## Verdict\n\nThe implementation is clean, complete within its stated scope, and structurally sound. All plan steps are satisfied. 2021 tests pass. Three findings follow, one of which matters.\n\n---\n\n## Finding 1: `propose_followup` writes identity name as display title\n\n**Severity:** Defect (pre-existing, now more visible)\n**File:** `daemon/services/meeting/toolbox.ts:134`\n**Also:** `daemon/services/manager/toolbox.ts:340`\n\nThe `propose_followup` template writes `workerDisplayTitle: \"${deps.workerName}\"`, which is the identity name (e.g., \"Octavia\"), not the display title (e.g., \"Guild Chronicler\"). The manager's `initiate_meeting` handler has the same bug at line 340: `workerDisplayTitle: \"${args.workerName}\"`.\n\nThis is the bug documented in `.lore/issues/worker-display-title-hardcoded-to-name.md`. It was listed as related context in the plan but not scoped for this commission. The same structural argument that justified display-time portrait resolution applies here: resolve `workerDisplayTitle` at display time from worker identity metadata. The `worker` field in frontmatter provides the lookup key.\n\n**Impact:** Meeting request cards on the dashboard show the identity name where they should show the display title. The primary `writeMeetingArtifact` path in `record.ts` gets this right (it receives the display title from the orchestrator), so only follow-up and manager-initiated meetings are affected.\n\n**Action:** Fix in a follow-up commission. Either resolve display title at display time (same pattern as portrait) or fix both templates to look up the worker package. The display-time approach is more robust since it eliminates the need for every creation path to carry the title.\n\n---\n\n## Finding 2: `resolveWorkerPortraits()` returns `Map`, dashboard correctly converts to `Record`\n\n**Severity:** No defect (verification)\n\nThe plan explicitly called out that Maps don't serialize across the server/client component boundary. The implementation handles this:\n\n- `web/app/page.tsx:56-57`: `Object.fromEntries(portraitMap)` converts to `Record<string, string>` before passing to `PendingAudiences`.\n- `web/app/projects/[name]/meetings/[id]/page.tsx:107-108`: Uses `portraits.get(workerName)` directly in the server component and passes the result as a string prop. No Map crosses the boundary.\n\nBoth approaches are correct. No issue here.\n\n---\n\n## Finding 3: Dashboard calls `resolveWorkerPortraits()` on every page load\n\n**Severity:** Observation (performance, not a defect)\n\n`resolveWorkerPortraits()` calls `discoverPackages()`, which reads every subdirectory in `~/.guild-hall/packages/`, parses each `package.json`, and reads `posture.md` and `soul.md` for every worker. The meeting page does the same. For a small roster (5 workers), this is negligible. If the roster grows or the packages directory is on a slow filesystem, this becomes a per-request cost.\n\nThe same cost exists everywhere `discoverPackages()` is called (daemon startup, session preparation, worker list API). This is not a regression from this commission; it's an existing pattern. Noting it because the commission added two new callsites (dashboard and meeting page) that didn't previously call `discoverPackages()`.\n\n**Action:** None required now. If performance becomes an issue, cache the result. The data changes rarely (package installs, not per-request).\n\n---\n\n## Spec Compliance\n\n| Requirement | Status | Evidence |\n|-------------|--------|----------|\n| REQ-WID-10: Identity in package.json is single source of truth | **PASS** | No portrait stored in artifacts. `resolveWorkerPortraits()` reads from `package.json` via `discoverPackages()`. |\n| REQ-VIEW-3: Worker identity rendered consistently (portrait, name, title) | **PASS** | Meeting page and dashboard both resolve portrait from packages. Meeting page: `page.tsx:107-108`. Dashboard: `page.tsx:56-57`, `PendingAudiences.tsx:26`, `MeetingRequestCard.tsx:232-236`. |\n| REQ-VIEW-28: Worker portrait displayed prominently in Meeting view | **PASS** | `page.tsx:108` resolves portrait, passes as `workerPortraitUrl` to `MeetingHeader` and `MeetingView`. Prop chain through `ChatInterface`, `MessageBubble`, `StreamingMessage` is intact. |\n| REQ-VIEW-12 zone 5: Pending audiences show worker portrait | **PASS** | `MeetingRequestCard.tsx:232-236` renders `WorkerPortrait` with `portraitUrl` prop. Portraits flow from `page.tsx` through `PendingAudiences` to each card. |\n\n## Orphan Check\n\n- `daemon/`: Zero references to `workerPortraitUrl`. Clean removal.\n- `web/`: References exist in the meeting component prop chain (`MeetingHeader`, `MeetingView`, `ChatInterface`, `MessageBubble`, `StreamingMessage`). These are display-layer props, not artifact storage. The prop name `workerPortraitUrl` is the display-layer convention. The source of the value changed from frontmatter to packages; the prop name is unchanged. This is correct.\n- `lib/`: Zero references. Clean.\n- `tests/`: Two test files reference the prop in display component tests (`meeting-view.test.tsx`). Two test files assert absence of portrait in artifacts (`record.test.ts:410-411`, `meeting-toolbox.test.ts:306`). All correct.\n\n## Test Coverage\n\n| Test | What it verifies |\n|------|-----------------|\n| `packages.test.ts:901-976` | `resolveWorkerPortraits()`: workers with portraits, without portraits, missing directory, multiple workers, toolbox filtering |\n| `record.test.ts:396-413` | `writeMeetingArtifact()` output contains no `workerPortraitUrl` or `portraitUrl` |\n| `meeting-toolbox.test.ts:290-307` | Follow-up artifact contains no `workerPortraitUrl` |\n| `pending-audiences.test.tsx:161-175` | `portraitUrl` flows from `workerPortraits` record to `MeetingRequestCard` props |\n\nAll 2021 tests pass. No failures."
  - timestamp: 2026-03-09T04:34:32.857Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All code read, grep complete, tests verified (2021 pass, 0 fail). Compiling findings report."
projectName: guild-hall
---
# Review: Portrait Display-Time Resolution (commission-Dalton-20260308-201837)

## Verdict

The implementation is clean, complete within its stated scope, and structurally sound. All plan steps are satisfied. 2021 tests pass. Three findings follow, one of which matters.

---

## Finding 1: `propose_followup` writes identity name as display title

**Severity:** Defect (pre-existing, now more visible)
**File:** `daemon/services/meeting/toolbox.ts:134`
**Also:** `daemon/services/manager/toolbox.ts:340`

The `propose_followup` template writes `workerDisplayTitle: "${deps.workerName}"`, which is the identity name (e.g., "Octavia"), not the display title (e.g., "Guild Chronicler"). The manager's `initiate_meeting` handler has the same bug at line 340: `workerDisplayTitle: "${args.workerName}"`.

This is the bug documented in `.lore/issues/worker-display-title-hardcoded-to-name.md`. It was listed as related context in the plan but not scoped for this commission. The same structural argument that justified display-time portrait resolution applies here: resolve `workerDisplayTitle` at display time from worker identity metadata. The `worker` field in frontmatter provides the lookup key.

**Impact:** Meeting request cards on the dashboard show the identity name where they should show the display title. The primary `writeMeetingArtifact` path in `record.ts` gets this right (it receives the display title from the orchestrator), so only follow-up and manager-initiated meetings are affected.

**Action:** Fix in a follow-up commission. Either resolve display title at display time (same pattern as portrait) or fix both templates to look up the worker package. The display-time approach is more robust since it eliminates the need for every creation path to carry the title.

---

## Finding 2: `resolveWorkerPortraits()` returns `Map`, dashboard correctly converts to `Record`

**Severity:** No defect (verification)

The plan explicitly called out that Maps don't serialize across the server/client component boundary. The implementation handles this:

- `web/app/page.tsx:56-57`: `Object.fromEntries(portraitMap)` converts to `Record<string, string>` before passing to `PendingAudiences`.
- `web/app/projects/[name]/meetings/[id]/page.tsx:107-108`: Uses `portraits.get(workerName)` directly in the server component and passes the result as a string prop. No Map crosses the boundary.

Both approaches are correct. No issue here.

---

## Finding 3: Dashboard calls `resolveWorkerPortraits()` on every page load

**Severity:** Observation (performance, not a defect)

`resolveWorkerPortraits()` calls `discoverPackages()`, which reads every subdirectory in `~/.guild-hall/packages/`, parses each `package.json`, and reads `posture.md` and `soul.md` for every worker. The meeting page does the same. For a small roster (5 workers), this is negligible. If the roster grows or the packages directory is on a slow filesystem, this becomes a per-request cost.

The same cost exists everywhere `discoverPackages()` is called (daemon startup, session preparation, worker list API). This is not a regression from this commission; it's an existing pattern. Noting it because the commission added two new callsites (dashboard and meeting page) that didn't previously call `discoverPackages()`.

**Action:** None required now. If performance becomes an issue, cache the result. The data changes rarely (package installs, not per-request).

---

## Spec Compliance

| Requirement | Status | Evidence |
|-------------|--------|----------|
| REQ-WID-10: Identity in package.json is single source of truth | **PASS** | No portrait stored in artifacts. `resolveWorkerPortraits()` reads from `package.json` via `discoverPackages()`. |
| REQ-VIEW-3: Worker identity rendered consistently (portrait, name, title) | **PASS** | Meeting page and dashboard both resolve portrait from packages. Meeting page: `page.tsx:107-108`. Dashboard: `page.tsx:56-57`, `PendingAudiences.tsx:26`, `MeetingRequestCard.tsx:232-236`. |
| REQ-VIEW-28: Worker portrait displayed prominently in Meeting view | **PASS** | `page.tsx:108` resolves portrait, passes as `workerPortraitUrl` to `MeetingHeader` and `MeetingView`. Prop chain through `ChatInterface`, `MessageBubble`, `StreamingMessage` is intact. |
| REQ-VIEW-12 zone 5: Pending audiences show worker portrait | **PASS** | `MeetingRequestCard.tsx:232-236` renders `WorkerPortrait` with `portraitUrl` prop. Portraits flow from `page.tsx` through `PendingAudiences` to each card. |

## Orphan Check

- `daemon/`: Zero references to `workerPortraitUrl`. Clean removal.
- `web/`: References exist in the meeting component prop chain (`MeetingHeader`, `MeetingView`, `ChatInterface`, `MessageBubble`, `StreamingMessage`). These are display-layer props, not artifact storage. The prop name `workerPortraitUrl` is the display-layer convention. The source of the value changed from frontmatter to packages; the prop name is unchanged. This is correct.
- `lib/`: Zero references. Clean.
- `tests/`: Two test files reference the prop in display component tests (`meeting-view.test.tsx`). Two test files assert absence of portrait in artifacts (`record.test.ts:410-411`, `meeting-toolbox.test.ts:306`). All correct.

## Test Coverage

| Test | What it verifies |
|------|-----------------|
| `packages.test.ts:901-976` | `resolveWorkerPortraits()`: workers with portraits, without portraits, missing directory, multiple workers, toolbox filtering |
| `record.test.ts:396-413` | `writeMeetingArtifact()` output contains no `workerPortraitUrl` or `portraitUrl` |
| `meeting-toolbox.test.ts:290-307` | Follow-up artifact contains no `workerPortraitUrl` |
| `pending-audiences.test.tsx:161-175` | `portraitUrl` flows from `workerPortraits` record to `MeetingRequestCard` props |

All 2021 tests pass. No failures.
