---
title: "Plan: CLI Commission Commands"
date: 2026-03-23
status: executed
tags: [cli, commissions, lifecycle, daemon-client, operations, formatting]
modules: [cli, daemon/routes/commissions]
related:
  - .lore/specs/commissions/cli-commission-commands.md
  - .lore/specs/infrastructure/cli-progressive-discovery.md
  - .lore/plans/infrastructure/cli-progressive-discovery.md
  - .lore/plans/infrastructure/cli-rewrite-thin-daemon-client.md
---

# Plan: CLI Commission Commands

## Spec Reference

**Spec**: `.lore/specs/commissions/cli-commission-commands.md`

Requirements addressed:
- REQ-CLI-COM-1, REQ-CLI-COM-2: Operation parameter completeness and ordering → Phase 1
- REQ-CLI-COM-3, REQ-CLI-COM-4, REQ-CLI-COM-5: Commission list filtering → Phase 2
- REQ-CLI-COM-6, REQ-CLI-COM-7: List output formatting → Phase 3
- REQ-CLI-COM-8, REQ-CLI-COM-9: Detail output formatting → Phase 3
- REQ-CLI-COM-10: Action confirmation formatting → Phase 3
- REQ-CLI-COM-11 through REQ-CLI-COM-15a: Error handling → Phase 4
- REQ-CLI-COM-16: Primary operation priority → All phases
- REQ-CLI-COM-17: Secondary operation priority → Phase 1 (parameters only)
- REQ-CLI-COM-18, REQ-CLI-COM-19: Format infrastructure (formatter registry) → Phase 3
- REQ-CLI-COM-20, REQ-CLI-COM-21: JSON mode passthrough → Phase 3

## Pre-implementation Finding: Missing `continue` and `save` Routes

The spec lists `continue` and `save` as primary operations (REQ-CLI-COM-16). These operations don't exist as daemon REST endpoints. The halted continuation spec (`.lore/specs/commissions/commission-halted-continuation.md`) defined REQ-COM-39 through REQ-COM-44 for these actions, and the plan (`.lore/plans/commissions/commission-halted-continuation.md`) assigned them to Phase 3 and Phase 4. The orchestrator has `halted` state detection in recovery (`orchestrator.ts:869-872`) but no `continueCommission()` or `saveCommission()` methods exist on `CommissionSessionForRoutes`.

**Impact on this plan:** The CLI can't format or invoke operations that don't exist. This plan covers everything the spec requires for operations that currently have daemon routes. Adding `continue` and `save` routes is a prerequisite that belongs to the halted continuation implementation, not this plan. Once those routes and operation definitions are added, this plan's Phase 3 formatter (action confirmation pattern) applies to them without additional work.

The spec's constraint "This spec does not add new daemon route handlers" is consistent with this interpretation: the spec assumes these operations exist but defers their creation to the halted continuation spec.

**Blocked success criteria:** Two items from the spec's success criteria list depend on these missing routes:
- `guild-hall commission run continue <id>` prints a confirmation line
- `guild-hall commission run save <id>` prints a confirmation line

These will pass automatically once the routes are added, since the action confirmation formatter is forward-compatible.

## Codebase Context

### CLI Architecture

The CLI (`cli/index.ts`) is a thin daemon client. It fetches all operation definitions from `GET /help/operations`, resolves user input against invocation paths via greedy longest-prefix match (`cli/resolve.ts:54-90`), maps positional arguments to declared parameters (`buildBody` for POST, `buildQueryString` for GET), and formats responses generically (`cli/format.ts:24-42`).

Three functions handle parameter mapping:
- `buildQueryString` (`resolve.ts:95-109`): Maps positional args to `in: "query"` parameters. Currently sends all values including empty strings.
- `buildBody` (`resolve.ts:114-127`): Maps positional args to `in: "body"` parameters. Constructs a JSON object.
- `validateArgs` (`resolve.ts:133-148`): Checks that all required parameters have values. Produces usage messages with `<required>` and `[optional]` placeholders.

### Operation Definitions

Commission operations are defined in `daemon/routes/commissions.ts:557-714`. Each `OperationDefinition` includes a `parameters` array of `OperationParameter` objects (`{ name, required, in }`). The spec identifies six operations with incomplete parameter declarations (REQ-CLI-COM-1). Verified against the route handlers:

| Operation | Currently declared | Missing (verified against route handler) |
|-----------|-------------------|---------|
| `create` (line 569) | `projectName` | `workerName`, `title`, `prompt` (handler checks all four at line 70) |
| `note` (line 595) | `commissionId` | `content` (handler checks at line 414) |
| `abandon` (line 673) | `commissionId` | `reason` (handler checks at line 303) |
| `schedule update` (line 686) | `commissionId` | `status` (handler checks at line 341) |
| `trigger update` (line 698) | `commissionId` | `status` (handler checks at line 379; `projectName` is optional) |
| `update` (line 582) | `commissionId` | None required (spec confirms this) |

### List Route Handler

`daemon/routes/commissions.ts:430-453`. Currently accepts only `projectName` as a query parameter. Calls `scanCommissions()` which returns `CommissionMeta[]`. No filtering logic. Adding `status` and `worker` query parameter reads and array filtering is straightforward.

### Response Formatting

`cli/format.ts` has four functions: `formatResponse` (generic dispatcher), `formatTable` (array-of-objects to aligned columns), `formatKeyValue` (object to `key: value` lines), and `formatHelpTree`/`formatOperationHelp` (help display). The generic `formatResponse` is called from `cli/index.ts:169`. No mechanism exists for operation-specific formatters.

The CLI entry point at `cli/index.ts:159-169` reads the response and calls `formatResponse(data, jsonMode)`. The formatter registry needs to intercept here, checking whether a custom formatter exists for the resolved operation before falling back to the generic path.

### Error Handling

`cli/index.ts:154-167` handles non-OK responses. It reads `error` from the response body and prints it to stderr. This covers REQ-CLI-COM-12 (404 already returns `Commission not found: <id>` from the daemon) and REQ-CLI-COM-13 (409 returns the transition error message). REQ-CLI-COM-14 (429 for capacity) isn't produced by any current commission route; the `continue` route would be the one to return it. REQ-CLI-COM-11 (daemon not running) is handled at `cli/index.ts:66-71`. REQ-CLI-COM-15 (stderr + exit code 1) is the existing pattern.

Most error handling requirements are already satisfied by the existing CLI error flow. The only gap is REQ-CLI-COM-14 (429 message), which depends on the `continue` route existing.

## Implementation Steps

### Phase 1: Operation Parameter Completeness

**Files**: `daemon/routes/commissions.ts`
**Addresses**: REQ-CLI-COM-1, REQ-CLI-COM-2, REQ-CLI-COM-16 (partially), REQ-CLI-COM-17 (partially)

Fix the `parameters` arrays in the six operation definitions identified in the spec's gap table. Parameter order follows the spec's natural command phrasing (REQ-CLI-COM-2).

Changes to the `operations` array in `daemon/routes/commissions.ts`:

1. **`create`** (line 569): Change from `[{ name: "projectName", required: true, in: "body" }]` to:
   ```typescript
   [
     { name: "projectName", required: true, in: "body" },
     { name: "workerName", required: true, in: "body" },
     { name: "title", required: true, in: "body" },
     { name: "prompt", required: true, in: "body" },
   ]
   ```

2. **`note`** (line 595): Add `content` parameter:
   ```typescript
   [
     { name: "commissionId", required: true, in: "body" },
     { name: "content", required: true, in: "body" },
   ]
   ```

3. **`abandon`** (line 673): Add `reason` parameter:
   ```typescript
   [
     { name: "commissionId", required: true, in: "body" },
     { name: "reason", required: true, in: "body" },
   ]
   ```

4. **`schedule update`** (line 686): Add `status` parameter:
   ```typescript
   [
     { name: "commissionId", required: true, in: "body" },
     { name: "status", required: true, in: "body" },
   ]
   ```

5. **`trigger update`** (line 698): Add `status` (required) and `projectName` (optional):
   ```typescript
   [
     { name: "commissionId", required: true, in: "body" },
     { name: "status", required: true, in: "body" },
     { name: "projectName", required: false, in: "body" },
   ]
   ```

6. **`list`** (line 608): Add optional `status` and `worker` query parameters (prepares for Phase 2 filtering):
   ```typescript
   [
     { name: "projectName", required: true, in: "query" },
     { name: "status", required: false, in: "query" },
     { name: "worker", required: false, in: "query" },
   ]
   ```

No route handler changes. This phase only fixes operation metadata so the CLI can construct valid requests.

**Tests**:
- For each modified operation definition, verify that every parameter required by the route handler appears in the `parameters` array.
- Verify parameter order matches the spec's command phrasing.
- Existing operation registry tests continue to pass.

**Delegation**: Dalton. Review: Thorne.

### Phase 2: Server-side List Filtering

**Files**: `daemon/routes/commissions.ts`, `cli/resolve.ts`
**Addresses**: REQ-CLI-COM-3, REQ-CLI-COM-4, REQ-CLI-COM-5
**Depends on**: Phase 1 (list operation needs `status` and `worker` parameters declared)

Two changes:

#### 2a. Route handler filtering (REQ-CLI-COM-3, REQ-CLI-COM-5)

In the list route handler (`commissions.ts:430-453`), after `scanCommissions` returns `CommissionMeta[]`, apply filters:

```typescript
const statusFilter = c.req.query("status");
const workerFilter = c.req.query("worker");

let filtered = commissions;
if (statusFilter) {
  filtered = filtered.filter((c) => c.status === statusFilter);
}
if (workerFilter) {
  filtered = filtered.filter((c) => c.worker === workerFilter);
}

return c.json({ commissions: filtered });
```

Filter by `status` against `CommissionMeta.status` and by `worker` against `CommissionMeta.worker` (the package name, e.g., `guild-hall-developer`). Both filters can combine (intersection). Empty string values are treated as absent (the existing `c.req.query()` returns `undefined` for missing params, and the truthy check handles empty strings).

#### 2b. CLI empty-string filtering in buildQueryString (REQ-CLI-COM-4)

In `cli/resolve.ts:95-109`, modify `buildQueryString` to skip empty string values:

```typescript
for (let i = 0; i < params.length && i < positionalArgs.length; i++) {
  if (positionalArgs[i] === "") continue; // Skip empty values
  pairs.push(
    `${encodeURIComponent(params[i].name)}=${encodeURIComponent(positionalArgs[i])}`,
  );
}
```

This lets users skip the `status` filter to filter by worker only: `guild-hall commission request commission list myproject "" guild-hall-developer`.

This change is global to `buildQueryString`, affecting all GET operations. Verified safe: the only existing GET operations with multiple query parameters are the commission `list` (one required, adding two optional) and `read` (two required). Required parameters always have values (validated by `validateArgs` before `buildQueryString` runs), so skipping empty strings only affects optional trailing parameters. No existing GET operation relies on sending empty strings as valid values.

**Tests**:
- List with `status=halted` returns only halted commissions (mock `scanCommissions` returning mixed statuses).
- List with `worker=guild-hall-developer` returns only that worker's commissions.
- Combined `status=completed&worker=guild-hall-developer` returns the intersection.
- List with no filters returns all commissions (existing behavior preserved).
- Empty string status filter is treated as absent (all statuses returned).
- `buildQueryString` skips empty-string positional arguments.

**Delegation**: Dalton. Review: Thorne.

### Phase 3: Commission-specific Output Formatting

**Files**: `cli/format.ts` (new functions), `cli/commission-format.ts` (new file), `cli/index.ts` (formatter registry integration)
**Addresses**: REQ-CLI-COM-6 through REQ-CLI-COM-10, REQ-CLI-COM-18 through REQ-CLI-COM-21
**Depends on**: Phase 1 (parameters must be correct for operations to return usable data)

Three sub-steps:

#### 3a. Formatter registry (REQ-CLI-COM-18, REQ-CLI-COM-19)

Add a formatter registry to the CLI. A simple map from invocation path to formatter function:

```typescript
// cli/commission-format.ts
type ResponseFormatter = (data: unknown) => string;

const COMMISSION_FORMATTERS: Record<string, ResponseFormatter> = {
  "/commission/request/commission/list": formatCommissionList,
  "/commission/request/commission/read": formatCommissionDetail,
};

// Action confirmation paths (includes future continue/save for forward compatibility)
const COMMISSION_ACTION_PATHS = new Set([
  "/commission/run/dispatch",
  "/commission/run/cancel",
  "/commission/run/abandon",
  "/commission/run/redispatch",
  "/commission/run/continue",
  "/commission/run/save",
]);
```

In `cli/index.ts`, modify the response handling at line 169. Before calling `formatResponse`, check the registry. The `positionalArgs` variable (destructured from `resolved.command` at line 119) provides the commission ID for action confirmations:

```typescript
if (!jsonMode) {
  const customFormatter = getCommissionFormatter(skill.invocation.path);
  if (customFormatter) {
    console.log(customFormatter(data));
    return;
  }
  if (isCommissionAction(skill.invocation.path)) {
    console.log(formatActionConfirmation(data, skill, positionalArgs));
    return;
  }
}
console.log(formatResponse(data, jsonMode));
```

JSON mode bypasses all custom formatting (REQ-CLI-COM-20, REQ-CLI-COM-21).

#### 3b. List formatter (REQ-CLI-COM-6, REQ-CLI-COM-7)

Format the `{ commissions: CommissionMeta[] }` response as a compact table with four columns: `ID`, `STATUS`, `WORKER`, `TITLE`.

```typescript
function formatCommissionList(data: unknown): string {
  const { commissions } = data as { commissions: Array<{
    commissionId: string;
    status: string;
    workerDisplayTitle: string;
    title: string;
  }> };

  if (commissions.length === 0) return "(no commissions)";

  // Build table with ID, STATUS, WORKER, TITLE columns
  // Use workerDisplayTitle (e.g., "Developer") not the package name
  // Truncate TITLE to fit terminal width if needed
}
```

The `workerDisplayTitle` field is already populated by `scanCommissions` → `parseCommissionData` in `lib/commissions.ts:90-91`.

#### 3c. Detail formatter (REQ-CLI-COM-8, REQ-CLI-COM-9)

Format the `{ commission, timeline, scheduleInfo, triggerInfo }` response as a structured summary. The read route at `commissions.ts:548` returns `{ commission: CommissionMeta, timeline: TimelineEntry[], rawContent: string, scheduleInfo?: {...}, triggerInfo?: {...} }`.

The `TimelineEntry` type (`lib/commissions.ts:43-48`) has: `{ timestamp: string, event: string, reason: string }`. The timeline format is `[timestamp] event: reason`.

The `CommissionMeta` type provides: `commissionId`, `title`, `status`, `type`, `date`, `worker`, `workerDisplayTitle`, `current_progress`, `result_summary`.

Section ordering (matches spec example at lines 113-126):
1. Header: commission ID, status, worker (display title + package name), date. Always shown.
2. Schedule info: cron description, runs completed, next run. Shown only for scheduled commissions (`scheduleInfo` present).
3. Trigger info: match pattern, approval mode, runs completed, last triggered. Shown only for triggered commissions (`triggerInfo` present).
4. Progress: `current_progress` text. Omitted if empty.
5. Result: `result_summary` text. Omitted if empty.
6. Timeline: most recent 5 entries from `timeline` array, most recent first, formatted as `[timestamp] event: reason`. Always shown.

#### 3d. Action confirmation formatter (REQ-CLI-COM-10)

Maps operation paths to confirmation verb:
- `/commission/run/dispatch` → `Dispatched: <commissionId>`
- `/commission/run/cancel` → `Cancelled: <commissionId>`
- `/commission/run/abandon` → `Abandoned: <commissionId>`
- `/commission/run/redispatch` → `Redispatched: <commissionId>`
- `/commission/run/continue` → `Continued: <commissionId>` (when route exists)
- `/commission/run/save` → `Saved: <commissionId>` (when route exists)

For `dispatch` and `redispatch`, the commission ID comes from the response body (`data.commissionId`). For other actions, it comes from the request's positional args (first arg is the commission ID).

**Tests**:
- List formatting: Given mock response with commissions in various states, verify table format (columns, alignment).
- Detail formatting: Given mock response with timeline, schedule info, and trigger info, verify all sections appear correctly. Verify sections with empty content are omitted.
- Action confirmation: For each action path, verify the confirmation line format.
- JSON passthrough: Verify `--json` mode returns raw response for both list and detail.
- Empty list: Verify `(no commissions)` message.

**Delegation**: Dalton. Review: Thorne.

### Phase 4: Error Formatting Verification

**Files**: Mostly test-only. Potentially `cli/index.ts` for the 429 message.
**Addresses**: REQ-CLI-COM-11 through REQ-CLI-COM-15a

Most error handling already works through the existing CLI error flow at `cli/index.ts:154-167`:
- **REQ-CLI-COM-11** (daemon not running): Handled at `cli/index.ts:66-71`. No change needed.
- **REQ-CLI-COM-12** (404 not found): Daemon returns `{ error: "Commission not found: <id>" }`. CLI prints it. No change needed.
- **REQ-CLI-COM-13** (409 invalid transition): Daemon returns descriptive error. CLI prints it. No change needed.
- **REQ-CLI-COM-14** (429 capacity): The existing error handler prints the daemon's error message for any non-OK response, but the spec wants a specific message: `At capacity, cannot continue commission. Try again later.` This requires checking `result.status === 429` in the error handler. However, no commission route currently returns 429. The `continue` route would be the one to return it (capacity check). This can be added when the `continue` route is implemented, or preemptively in the error handler.
- **REQ-CLI-COM-15** (stderr + exit code 1): Already the pattern. No change needed.
- **REQ-CLI-COM-15a** (missing positional args): Already implemented by `validateArgs` at `resolve.ts:133-148`. No change needed.

**Decision**: Add a 429-specific message to the error handler now, even though no route currently returns it. This is one line of code and prevents a gap when `continue` is implemented:

```typescript
if (result.status === 429) {
  console.error("At capacity, cannot continue commission. Try again later.");
  process.exit(1);
}
```

The remaining work is test-only: verify each error scenario produces the correct output.

**Tests**:
- 404 response prints the daemon's `Commission not found: <id>` message to stderr.
- 409 response prints the daemon's transition error message to stderr.
- 429 response prints the capacity message to stderr.
- Missing required args produce usage message with parameter names.
- All errors exit with code 1.

**Delegation**: Dalton (implementation is one line + tests). Review: Thorne.

## Phase Dependency Graph

```
Phase 1 (parameters) ─┬─→ Phase 2 (filtering)
                       │
                       └─→ Phase 3 (formatting)

Phase 4 (errors) has no dependencies; can run in parallel with any phase.
```

Phase 1 must go first because Phases 2 and 3 depend on correct parameter declarations. Phase 4 is independent and can be done in parallel with anything else.

## Risks

1. **Missing `continue`/`save` routes.** The spec lists these as primary operations but they don't exist as daemon endpoints. This plan works around it by including them in the formatter's action confirmation map (they'll work when the routes are added) and noting the dependency. The implementer should not attempt to create these routes as part of this plan.

2. **`buildBody` sends all positional args as strings.** The `buildBody` function at `resolve.ts:114-127` maps all positional args to string values. The `create` command's `prompt` parameter is the last positional arg. If the user's prompt contains spaces, they need to quote it: `guild-hall commission request commission create myproject guild-hall-developer "Fix the bug" "The login form crashes when..."`. This is standard shell behavior and not a CLI limitation, but it's worth noting because `prompt` values are typically multi-word.

3. **`scanCommissions` scans all commission files.** Filtering happens after the full scan. For projects with hundreds of commissions, this could be slow. The spec explicitly chooses server-side filtering over client-side (REQ-CLI-COM-5), which is correct architecturally, but the scan is still O(n) regardless of filter. This is acceptable for current scale and matches the web UI's behavior.

4. **Terminal width for list table.** REQ-CLI-COM-6 says `TITLE` should truncate to fit terminal width. The current `formatTable` in `cli/format.ts` doesn't handle terminal width. The commission list formatter will need to read `process.stdout.columns` (or default to 80) and calculate available width after the fixed columns. This is a small amount of additional logic but worth calling out.

## File Summary

| File | Change type | Phase |
|------|-------------|-------|
| `daemon/routes/commissions.ts` | Edit (operation parameters + list filter) | 1, 2 |
| `cli/resolve.ts` | Edit (skip empty strings in buildQueryString) | 2 |
| `cli/commission-format.ts` | New (commission formatters) | 3 |
| `cli/index.ts` | Edit (formatter registry integration) | 3 |
| `tests/cli/commission-format.test.ts` | New (formatter tests) | 3 |
| `tests/daemon/routes/commissions-filter.test.ts` | New or extend existing (filter tests) | 2 |
| `tests/cli/resolve.test.ts` | Edit (buildQueryString empty string test) | 2 |
