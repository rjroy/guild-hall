---
title: CLI Commission Commands
date: 2026-03-20
status: implemented
tags: [cli, commissions, lifecycle, daemon-client, operations]
modules: [cli, daemon/routes/commissions]
related:
  - .lore/specs/infrastructure/cli-progressive-discovery.md
  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/specs/commissions/guild-hall-commissions.md
  - .lore/_abandoned/specs/commission-halted-continuation.md
  - .lore/specs/commissions/triggered-commissions.md
req-prefix: CLI-COM
---

# Spec: CLI Commission Commands

## Overview

The daemon exposes a full commission REST API (create, list, read, dispatch, continue, save, cancel, abandon, redispatch). The CLI discovers these operations through the daemon's `GET /help/operations` endpoint and can already resolve them as commands. But the current state has gaps that make commission management from the terminal awkward or broken:

1. **Incomplete parameter declarations.** Several operation definitions don't declare all their required parameters. The CLI's `buildBody` function maps positional arguments to declared parameters, so undeclared parameters can't be set from the command line. For example, `create` declares only `projectName` but the route requires `title`, `workerName`, and `prompt`. `abandon` declares only `commissionId` but the route requires `reason`.

2. **No filtering on commission list.** The list endpoint accepts only `projectName`. Users can't filter by status (show me all halted commissions) or by worker (show me what Dalton is working on). Every list query returns everything, and the user has to scan visually.

3. **No commission-specific output formatting.** The CLI's generic `formatResponse` renders commission data as raw key-value pairs or tables with every field. A commission list should show a concise summary (ID, status, worker, title). A commission detail should highlight progress, status, and timeline, not dump the full frontmatter.

4. **Verbose command paths.** The capability-oriented path grammar produces commands like `guild-hall commission request commission list`. The `request` and `commission` intermediate segments serve the daemon's navigation hierarchy but add friction for terminal use. This is a structural consequence of the hierarchy design and outside the scope of this spec, but it informs decisions about which operations to prioritize and how to document them.

This spec defines what the CLI commission experience should be: which operations matter, what their parameter contracts look like, how output should be formatted, and how errors should be handled.

## Entry Points

- User runs `guild-hall commission help` to discover commission commands
- User runs `guild-hall commission request commission list <projectName>` to see commissions
- User runs `guild-hall commission run dispatch <commissionId>` to start a commission
- User runs `guild-hall commission run continue <commissionId>` to resume a halted commission
- Automation script uses `guild-hall --json commission request commission list <projectName>` to get machine-readable output
- User runs a commission lifecycle command against a daemon that is not running

## Requirements

### Operation Parameter Completeness

- REQ-CLI-COM-1: Every commission operation definition must declare all parameters that the route handler requires for a valid request. The CLI depends on these declarations to map positional arguments to request fields. An undeclared required parameter means the CLI sends an incomplete request that the daemon rejects.

  Current gaps (verified against `daemon/routes/commissions.ts`):

  | Operation | Currently declared | Missing |
  |-----------|-------------------|---------|
  | `commission.request.commission.create` | `projectName` | `title`, `workerName`, `prompt` |
  | `commission.request.commission.update` | `commissionId` | (none required, optional params are fine) |
  | `commission.request.commission.note` | `commissionId` | `content` |
  | `commission.run.abandon` | `commissionId` | `reason` |
  | `commission.schedule.commission.update` | `commissionId` | `status` |
  | `commission.trigger.commission.update` | `commissionId` | `status`, `projectName` |

  Parameters like `dependencies`, `resourceOverrides`, `type`, `cron`, `repeat`, `match`, `approval`, and `maxDepth` on `create` are optional and don't need CLI parameter declarations for the minimum viable experience. Users who need those can use `--json` input or the web UI.

- REQ-CLI-COM-2: Parameter order in the operation definition determines positional argument mapping. The order should follow natural command phrasing. For `create`: `projectName`, `workerName`, `title`, `prompt`. This produces: `guild-hall commission request commission create <project> <worker> <title> <prompt>`.

  For `abandon`: `commissionId`, `reason`. This produces: `guild-hall commission run abandon <commissionId> <reason>`.

  For `note`: `commissionId`, `content`. This produces: `guild-hall commission request commission note <commissionId> <content>`.

  For `schedule update`: `commissionId`, `status`. This produces: `guild-hall commission schedule commission update <commissionId> <status>`.

  For `trigger update`: `commissionId`, `status`. This produces: `guild-hall commission trigger commission update <commissionId> <status>`. The `projectName` parameter is optional and only needed when re-registering an active trigger's event subscription.

### Commission List Filtering

- REQ-CLI-COM-3: The commission list operation accepts optional `status` and `worker` query parameters for filtering. The route handler reads these as `c.req.query("status")` and `c.req.query("worker")`. When `status` is provided, only commissions matching that status are returned. When `worker` is provided, only commissions assigned to that worker are returned. Both filters can be combined. Empty string values are treated as absent (no filter applied).

  Valid status values match the commission lifecycle states: `pending`, `blocked`, `dispatched`, `in_progress`, `completed`, `failed`, `cancelled`, `abandoned`, `halted`.

  Worker filtering matches against the `worker` field in `CommissionMeta` (the worker package name, e.g., `guild-hall-developer`).

- REQ-CLI-COM-4: The list operation definition declares `status` and `worker` as optional query parameters with `in: "query"`. The CLI's `buildQueryString` maps positional arguments to these. Invocation: `guild-hall commission request commission list <projectName> [status] [worker]`.

  The CLI omits empty-string positional arguments from the query string rather than sending them as empty values. This lets users skip `status` to filter by worker only: `guild-hall commission request commission list myproject "" guild-hall-developer`. The empty string for `status` is dropped, and only `worker` is sent. This requires a small change to `buildQueryString` in `cli/resolve.ts` to skip empty values.

  Future work could add named flags (`--status=halted --worker=guild-hall-developer`), but that requires CLI infrastructure changes outside this spec's scope.

- REQ-CLI-COM-5: Filtering is applied server-side in the list route handler, not client-side. The daemon scans commissions and filters before returning results. This keeps the CLI thin and the filtering logic in one place.

### Output Formatting

- REQ-CLI-COM-6: Commission list output in human-readable mode (default when stdout is a TTY) shows a compact table with columns: `ID`, `STATUS`, `WORKER`, `TITLE`. The `ID` column shows the full commission ID. `STATUS` uses the raw status value. `WORKER` shows the `workerDisplayTitle` field from `CommissionMeta` (e.g., "Developer"), which is already populated by the daemon's `scanCommissions` function from worker package metadata. `TITLE` is truncated to fit the terminal width if needed.

  Example:
  ```
  ID                                          STATUS       WORKER      TITLE
  ------------------------------------------  -----------  ----------  -------------------------
  commission-Dalton-20260320-200023           in_progress  Developer   Fix login validation bug
  commission-Octavia-20260320-201208          halted       Chronicler  Write CLI commission spec
  commission-Thorne-20260319-143022           completed    Reviewer    Review auth module
  ```

- REQ-CLI-COM-7: Commission list output in JSON mode (`--json` flag or non-TTY stdout) returns the raw daemon response: `{ "commissions": [...] }`. No transformation. This is what the generic `formatResponse` already does for JSON mode, so no special handling is needed.

- REQ-CLI-COM-8: Commission detail output (from the `read` operation) in human-readable mode shows a structured summary:
  - Header: commission ID, status, worker, date (always shown)
  - Progress: current progress (shown only if non-empty)
  - Result: result summary (shown only if non-empty)
  - Timeline: most recent 5 timeline entries, most recent first, formatted as `[timestamp] event: reason`

  Sections with no content (no progress, no result) are omitted from the output rather than shown empty. The header and timeline are always present.

  Scheduled commission detail additionally shows schedule info (cron description, runs completed, next run) between the header and progress sections.

  Triggered commission detail additionally shows trigger info (match pattern, approval mode, runs completed, last triggered) between the header and progress sections.

  Example:
  ```
  commission-Dalton-20260320-200023
  Status:   in_progress
  Worker:   Developer (guild-hall-developer)
  Created:  2026-03-20

  Progress: Implementing the login validation changes. Tests passing.

  Timeline:
    [2026-03-20 20:15:32] status_in_progress: Dispatched to worker
    [2026-03-20 20:01:00] status_dispatched: Commission dispatched
    [2026-03-20 20:00:23] status_pending: Commission created
  ```

- REQ-CLI-COM-9: Commission detail output in JSON mode returns the raw daemon response unchanged.

- REQ-CLI-COM-10: Action commands (dispatch, continue, save, cancel, abandon, redispatch) in human-readable mode print a single confirmation line. Examples:
  - dispatch: `Dispatched: commission-Dalton-20260320-200023`
  - continue: `Continued: commission-Octavia-20260320-201208`
  - save: `Saved: commission-Octavia-20260320-201208`
  - cancel: `Cancelled: commission-Dalton-20260320-200023`
  - abandon: `Abandoned: commission-Dalton-20260320-200023`
  - redispatch: `Redispatched: commission-Thorne-20260319-143022`

  The confirmation line uses the commission ID. For dispatch and redispatch, the `commissionId` field from the response body is used. For other actions (save, cancel, abandon), the ID comes from the request since the response is a status acknowledgment.

  Although `redispatch` is listed as a secondary operation (REQ-CLI-COM-17), the confirmation pattern applies to all action commands regardless of priority tier. The confirmation formatter is trivial (one line per operation) and provides a consistent UX across all lifecycle actions.

### Error Handling

- REQ-CLI-COM-11: When the daemon is not running, all commission commands produce the existing error: `Daemon is not running. Start the daemon first: bun run dev:daemon`. This behavior already works through `daemonFetch` and the CLI's error handling in `main()`.

- REQ-CLI-COM-12: When a commission is not found (HTTP 404), the CLI prints: `Commission not found: <commissionId>`. The daemon's error response body contains the error message.

- REQ-CLI-COM-13: When a state transition is invalid (HTTP 409), the CLI prints the daemon's error message, which already describes the invalid transition (e.g., `Cannot continue: commission status must be "halted"`). No CLI-side rewriting needed.

- REQ-CLI-COM-14: When the daemon is at capacity for `continue` (HTTP 429), the CLI prints: `At capacity, cannot continue commission. Try again later.`

- REQ-CLI-COM-15: All error output goes to stderr. The exit code is 1 for any error. This matches the existing CLI error handling pattern.

- REQ-CLI-COM-15a: When required positional arguments are missing, the CLI prints an error naming the missing parameter(s) and a usage line showing the full command with `<required>` and `[optional]` placeholders. This behavior already exists in `validateArgs` at `cli/resolve.ts:133-148` and applies to all operations, including commission operations, without commission-specific code.

### Operation Priority

- REQ-CLI-COM-16: The following operations are essential for CLI commission management. All must have complete parameter declarations and commission-specific formatting:

  | Operation | CLI invocation | Purpose |
  |-----------|---------------|---------|
  | `list` | `commission request commission list <project>` | See all commissions for a project |
  | `read` | `commission request commission read <project> <id>` | Check commission detail and status |
  | `dispatch` | `commission run dispatch <id>` | Start a pending commission |
  | `continue` | `commission run continue <id>` | Resume a halted commission |
  | `save` | `commission run save <id> [reason]` | Save partial work from halted |
  | `cancel` | `commission run cancel <id>` | Cancel a pending/running commission |
  | `abandon` | `commission run abandon <id> <reason>` | Abandon with reason |

  Operations with incomplete parameter declarations (per REQ-CLI-COM-1 gap table) must be fixed before formatting work is meaningful. Currently, `abandon` in this list has a missing `reason` parameter declaration.

- REQ-CLI-COM-17: The following operations are secondary. They should work correctly (complete parameters) but don't need custom list/detail formatters. Action commands in this list still use the confirmation pattern from REQ-CLI-COM-10:

  | Operation | CLI invocation | Purpose |
  |-----------|---------------|---------|
  | `create` | `commission request commission create <project> <worker> <title> <prompt>` | Create a new commission |
  | `redispatch` | `commission run redispatch <id>` | Re-dispatch failed/cancelled |
  | `update` | `commission request commission update <id>` | Update pending commission |
  | `note` | `commission request commission note <id> <content>` | Add user note |
  | `schedule update` | `commission schedule commission update <id> <status>` | Pause/resume schedule |
  | `trigger update` | `commission trigger commission update <id> <status>` | Pause/resume/complete trigger |
  | `dependency check` | `commission dependency project check <project>` | Trigger dependency transitions |

  `create` is secondary because creating commissions from the CLI requires many optional parameters (dependencies, resource overrides, scheduling) that don't map well to positional arguments. The web UI and meetings with the Guild Master handle the full creation workflow better. The CLI `create` covers the simple case: one-shot commission with required fields only.

### Format Infrastructure

- REQ-CLI-COM-18: Commission-specific formatting is implemented as a response formatter keyed on the operation's invocation path. The CLI checks whether a custom formatter exists for the resolved operation before falling back to the generic `formatResponse`. This approach keeps the formatting logic close to the domain without modifying the generic formatter.

- REQ-CLI-COM-19: The formatter registry is a simple map from invocation path to formatter function. Commission formatters are registered for the `list` and `read` paths. All other commission operations use the generic formatter or the action confirmation pattern (REQ-CLI-COM-10).

### JSON Mode

- REQ-CLI-COM-20: JSON mode (`--json` flag or piped output) bypasses all custom formatting and returns the raw daemon response. This is already the behavior for the generic formatter, and custom formatters must preserve it. JSON mode is the scripting interface. Human-readable mode is the terminal interface.

- REQ-CLI-COM-21: JSON mode output for all commission operations follows the daemon's response shape exactly. No wrapping, no field renaming, no omission. Scripts that parse this output can rely on the daemon's API contract.

## Success Criteria

- [ ] All commission operation definitions declare their required parameters
- [ ] `guild-hall commission request commission list <project>` shows a compact table of commissions
- [ ] `guild-hall commission request commission list <project>` with `--json` returns raw JSON
- [ ] `guild-hall commission request commission read <project> <id>` shows formatted commission detail
- [ ] `guild-hall commission run dispatch <id>` prints a confirmation line
- [ ] `guild-hall commission run continue <id>` prints a confirmation line
- [ ] `guild-hall commission run save <id>` prints a confirmation line
- [ ] `guild-hall commission run abandon <id> <reason>` prints a confirmation line
- [ ] List filtering by status works: `guild-hall commission request commission list <project> halted`
- [ ] List filtering by worker works: `guild-hall commission request commission list <project> "" guild-hall-developer`
- [ ] Missing required positional arguments produce an error naming the missing parameter and a usage line
- [ ] Daemon-not-running produces the standard error message
- [ ] Invalid state transitions show the daemon's error message
- [ ] All errors go to stderr with exit code 1

## AI Validation

**Defaults:**
- Unit tests with mocked daemon responses
- 90%+ coverage on new formatting code
- Code review by fresh-context sub-agent

**Custom:**
- Parameter completeness test: For each commission operation definition, verify that every parameter required by the route handler is declared in the operation's `parameters` array.
- List formatting test: Given a mock daemon response with commissions in various states, verify the human-readable table output matches the expected format (columns, truncation, alignment).
- Detail formatting test: Given a mock daemon response with timeline entries and schedule info, verify the formatted output includes all sections.
- Action confirmation test: For each action command (dispatch, continue, save, cancel, abandon, redispatch), verify the confirmation line format.
- Filter test: Verify list with `status=halted` returns only halted commissions, list with `worker=guild-hall-developer` returns only that worker's commissions, and combined filters intersect correctly.
- JSON passthrough test: Verify that `--json` mode returns the raw daemon response for both list and detail operations.
- Error formatting test: Verify 404, 409, and 429 responses produce the correct stderr messages.
- Positional argument validation test: Verify that missing required arguments produce usage messages with the correct parameter names.

## Constraints

- This spec does not add new daemon route handlers. Filtering (REQ-CLI-COM-3 through REQ-CLI-COM-5) requires the list route handler to accept and apply `status` and `worker` query parameters. This is a small enhancement to the existing handler, not a new endpoint. The route handler change is a prerequisite for this spec's filtering requirements.
- This spec does not change the capability-oriented path grammar. The verbose command paths (`commission request commission list`) are a consequence of the hierarchy design (REQ-DAB-5). If shorter aliases are desired (e.g., `commission list` as shorthand for `commission request commission list`), that's a separate feature requiring CLI-level alias support.
- The `create` command handles only simple one-shot commissions with required fields. Creating scheduled commissions, triggered commissions, specifying dependencies, or setting resource overrides requires the web UI, a meeting with the Guild Master, or a raw `curl` call. Expanding CLI `create` to support the full creation surface is future work.
- Custom formatters live in the CLI, not the daemon. The daemon returns the same JSON regardless of the client. The CLI is responsible for human-readable presentation.

## Context

The CLI already works as a thin daemon client (`.lore/specs/infrastructure/cli-progressive-discovery.md`). It fetches operation definitions from `GET /help/operations`, resolves commands via greedy longest-prefix match (`cli/resolve.ts`), and formats responses generically (`cli/format.ts`). Commission operations are already registered in the daemon's `OperationsRegistry` via `daemon/routes/commissions.ts`.

The gap this spec addresses is not "commission commands don't exist" but "commission commands don't work well enough for terminal use." The operations are discoverable and theoretically invocable, but incomplete parameter declarations prevent the CLI from constructing valid requests, and the generic formatter doesn't produce useful output for commission data.

Commission lifecycle states and transitions are defined in the main commissions spec (`guild-hall-commissions.md`, REQ-COM-5, REQ-COM-6), the halted continuation spec (`commission-halted-continuation.md`, REQ-COM-33 through REQ-COM-50), and the triggered commissions spec (`triggered-commissions.md`). Triggered commissions add a `trigger` hierarchy (`commission.trigger.commission.update`) for managing trigger status alongside the existing `schedule` hierarchy. This spec takes the lifecycle as given and focuses on exposing it through the CLI.
