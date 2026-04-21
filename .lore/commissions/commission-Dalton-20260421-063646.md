---
title: "Commission: C3 — Gate 1 Fixes (M-1, m-2, m-3)"
date: 2026-04-21
status: completed
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix all three actionable findings from Thorne's Gate 1 review. Findings artifact: `.lore/commissions/commission-Thorne-20260420-215649.md`. Read it in full before starting.\n\n**Scope: M-1, m-2, m-3.** m-1 is deferred to Phase 5 by plan design. m-4 is flagged for Phase 3 and is out of scope here.\n\n**M-1 — Add `requestSchema` and `responseSchema` to all four new operations:**\n- `system.config.project.list` (`daemon/routes/admin.ts:442-451`)\n- `meeting.session.meeting.list` (`daemon/routes/meetings.ts:582-592`)\n- `workspace.issue.list` (`daemon/routes/workspace-issue.ts:221-235`)\n- `workspace.issue.read` (`daemon/routes/workspace-issue.ts:236-250`)\n\nFor each op:\n- Declare a Zod `requestSchema` that matches the actual request shape. For global-scope no-arg ops, `z.object({})` is correct. For ops with query params, model them precisely (e.g., `workspace.issue.list` has `projectName` required + `status` optional).\n- Declare a Zod `responseSchema` matching the documented response shape from the plan.\n- Wire the schemas through the op registration so that malformed requests fail validation and responses can be asserted against the schema in tests.\n- Update the existing tests for each op to assert at least one case where the schema validates a valid response. Add at least one negative test per op where a malformed request is rejected with a structured error (where applicable — the no-arg ops still need a shape test on the response).\n\n**m-2 — Declare `parameters: []` explicitly on the two ops that currently omit it:**\n- `system.config.project.list`\n- `meeting.session.meeting.list`\n\nMatches the plan wording. Don't change neighboring ops; keep the change local to the ones the plan says are Phase 1.\n\n**m-3 — Add an inline comment on the `workspace.issue.list` and `workspace.issue.read` operation blocks explaining the three-segment hierarchy exception:**\n- Brief one-liner pointing to REQ-CLI-AGENT-22a. Saves the next reader a trip to the spec.\n\n**Guardrails:**\n- No scope creep. Do not touch ops outside the four new ones (the Major finding is scoped to them; the project-wide practice of omitting schemas stays unchanged outside this set).\n- Tests alongside fixes. Every new schema needs at least one assertion.\n- Run `bun run typecheck`, `bun run lint`, `bun test`, `bun run build` before submitting. All green.\n- Do not touch Phase 3+ files (`cli/resolve.ts`, `cli/index.ts`, `cli/format.ts`, `cli/commission-format.ts`, `daemon/routes/help.ts`).\n\nReport back with the files changed, schemas added, tests added, and verification output."
dependencies: []
linked_artifacts:
  - daemon/routes/admin.ts

  - daemon/routes/meetings.ts
  - daemon/routes/workspace-issue.ts
  - tests/daemon/routes/admin.test.ts
  - tests/daemon/routes/meetings.test.ts
  - tests/daemon/routes/workspace-issue.test.ts
  - daemon/routes/meetings.ts
  - daemon/routes/workspace-issue.ts
  - tests/daemon/routes/admin.test.ts
  - tests/daemon/routes/meetings.test.ts
  - tests/daemon/routes/workspace-issue.test.ts
activity_timeline:
  - timestamp: 2026-04-21T13:36:46.736Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-21T13:36:46.738Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-21T13:36:46.788Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-21T13:42:02.647Z
    event: progress_report
    reason: "Added schemas + parameters: [] + REQ-CLI-AGENT-22a comments to all four ops. Added schema-assertion tests. Typecheck passes. Running lint/test/build next."
  - timestamp: 2026-04-21T13:43:30.716Z
    event: result_submitted
    reason: "Done. All three Gate 1 findings (M-1, m-2, m-3) fixed. Tests pass, types check, lint clean, build green.\n\n## Files Changed\n\n**daemon/routes/admin.ts**\n- Added `zod` import.\n- Exported `projectListRequestSchema` (`z.object({})`) and `projectListResponseSchema` (object with `projects` array of `{name, path, group?, status: \"registered\"}`).\n- Wired both schemas into `system.config.project.list` op. Added explicit `parameters: []`.\n\n**daemon/routes/meetings.ts**\n- Added `zod` import.\n- Exported `activeMeetingListRequestSchema` (`z.object({})`) and `activeMeetingListResponseSchema` (object with `sessions` array of `{meetingId, projectName, workerName, startedAt, status}`).\n- Wired both schemas into `meeting.session.meeting.list` op. Added explicit `parameters: []`.\n\n**daemon/routes/workspace-issue.ts**\n- Added `zod` import.\n- Exported `issueListRequestSchema` (`{projectName: z.string().min(1), status: z.string().optional()}`), `issueListResponseSchema`, `issueReadRequestSchema` (`{projectName: min(1), slug: min(1)}`), `issueReadResponseSchema`.\n- Wired all four schemas into the two ops.\n- Added inline comments on both op blocks pointing to REQ-CLI-AGENT-22a (three-segment verb-as-object exception).\n\n## Tests Added\n\n**tests/daemon/routes/admin.test.ts** (3 new tests in `GET /system/config/project/list`)\n- Response validates against `projectListResponseSchema` (positive, with real handler output).\n- Request schema: accepts `{}`, rejects non-object input.\n- Response schema: rejects rows missing `status` and rows with invalid status literal.\n\n**tests/daemon/routes/meetings.test.ts** (3 new tests in `GET /meeting/session/meeting/list`)\n- Response validates against `activeMeetingListResponseSchema`.\n- Request schema: accepts empty object, rejects non-object.\n- Response schema: rejects sessions missing required fields.\n\n**tests/daemon/routes/workspace-issue.test.ts** (5 new tests across list + read)\n- `list` response validates against `issueListResponseSchema`.\n- `list` request schema: rejects missing/empty `projectName`, accepts with optional `status`.\n- `read` response validates against `issueReadResponseSchema`.\n- `read` request schema: rejects missing `slug` or `projectName`, accepts both present.\n\n## Verification\n\n- `bun run typecheck`: clean (tsc --noEmit, no errors).\n- `bun run lint`: clean (eslint, no warnings).\n- `bun test`: **3595 pass / 4 skip / 0 fail** across 164 files (was 3584 pre-change; 11 new assertions added).\n- `bun run build`: clean (daemon + Next.js production build).\n\n## Scope Notes\n\n- No changes to ops outside the four Phase 1 additions.\n- No changes to Phase 3+ files (`cli/resolve.ts`, `cli/index.ts`, `cli/format.ts`, `cli/commission-format.ts`, `daemon/routes/help.ts`).\n- m-1 (live-registry linkage) deferred to Phase 5 per plan; not in scope here.\n- m-4 (parseStartedAtFromMeetingId empty-string signal) deferred to Phase 3 per plan; not in scope here.\n- The wider project-wide practice of omitting schemas on other ops is untouched, consistent with the scoped remediation."
  - timestamp: 2026-04-21T13:43:36.556Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Added schemas + parameters: [] + REQ-CLI-AGENT-22a comments to all four ops. Added schema-assertion tests. Typecheck passes. Running lint/test/build next."
projectName: guild-hall
---
Done. All three Gate 1 findings (M-1, m-2, m-3) fixed. Tests pass, types check, lint clean, build green.

## Files Changed

**daemon/routes/admin.ts**
- Added `zod` import.
- Exported `projectListRequestSchema` (`z.object({})`) and `projectListResponseSchema` (object with `projects` array of `{name, path, group?, status: "registered"}`).
- Wired both schemas into `system.config.project.list` op. Added explicit `parameters: []`.

**daemon/routes/meetings.ts**
- Added `zod` import.
- Exported `activeMeetingListRequestSchema` (`z.object({})`) and `activeMeetingListResponseSchema` (object with `sessions` array of `{meetingId, projectName, workerName, startedAt, status}`).
- Wired both schemas into `meeting.session.meeting.list` op. Added explicit `parameters: []`.

**daemon/routes/workspace-issue.ts**
- Added `zod` import.
- Exported `issueListRequestSchema` (`{projectName: z.string().min(1), status: z.string().optional()}`), `issueListResponseSchema`, `issueReadRequestSchema` (`{projectName: min(1), slug: min(1)}`), `issueReadResponseSchema`.
- Wired all four schemas into the two ops.
- Added inline comments on both op blocks pointing to REQ-CLI-AGENT-22a (three-segment verb-as-object exception).

## Tests Added

**tests/daemon/routes/admin.test.ts** (3 new tests in `GET /system/config/project/list`)
- Response validates against `projectListResponseSchema` (positive, with real handler output).
- Request schema: accepts `{}`, rejects non-object input.
- Response schema: rejects rows missing `status` and rows with invalid status literal.

**tests/daemon/routes/meetings.test.ts** (3 new tests in `GET /meeting/session/meeting/list`)
- Response validates against `activeMeetingListResponseSchema`.
- Request schema: accepts empty object, rejects non-object.
- Response schema: rejects sessions missing required fields.

**tests/daemon/routes/workspace-issue.test.ts** (5 new tests across list + read)
- `list` response validates against `issueListResponseSchema`.
- `list` request schema: rejects missing/empty `projectName`, accepts with optional `status`.
- `read` response validates against `issueReadResponseSchema`.
- `read` request schema: rejects missing `slug` or `projectName`, accepts both present.

## Verification

- `bun run typecheck`: clean (tsc --noEmit, no errors).
- `bun run lint`: clean (eslint, no warnings).
- `bun test`: **3595 pass / 4 skip / 0 fail** across 164 files (was 3584 pre-change; 11 new assertions added).
- `bun run build`: clean (daemon + Next.js production build).

## Scope Notes

- No changes to ops outside the four Phase 1 additions.
- No changes to Phase 3+ files (`cli/resolve.ts`, `cli/index.ts`, `cli/format.ts`, `cli/commission-format.ts`, `daemon/routes/help.ts`).
- m-1 (live-registry linkage) deferred to Phase 5 per plan; not in scope here.
- m-4 (parseStartedAtFromMeetingId empty-string signal) deferred to Phase 3 per plan; not in scope here.
- The wider project-wide practice of omitting schemas on other ops is untouched, consistent with the scoped remediation.
