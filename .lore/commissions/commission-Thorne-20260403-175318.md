---
title: "Commission: Heartbeat P2 Review: Heartbeat Service Core"
date: 2026-04-04
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the Heartbeat Service Core implementation (Phase 2 of the Heartbeat Commission Dispatch plan).\n\n**Plan**: `.lore/plans/heartbeat-commission-dispatch.md` — read Phase 2 for requirements.\n**Spec**: `.lore/specs/heartbeat-commission-dispatch.md` — reference for REQ IDs.\n\nPhase 1 (config, source provenance, heartbeat file scaffolding) and Phase 2 (heartbeat loop, GM session, production wiring) have been implemented. Review ALL of the following:\n\n## Files to Review\n\nNew files:\n- `daemon/services/heartbeat/index.ts` (HeartbeatService)\n- `daemon/services/heartbeat/session.ts` (GM session builder)\n- `daemon/services/heartbeat/heartbeat-file.ts` (file operations, from Phase 1)\n\nModified files:\n- `daemon/app.ts` (production wiring)\n- `daemon/services/commission/orchestrator.ts` (source provenance)\n- `daemon/services/commission/record.ts` (readSource)\n- `lib/types.ts` (config types)\n- `lib/config.ts` (config validation)\n\nTest files for all of the above.\n\n## Critical Review Points\n\n1. **GM session tool set**: Are the right tools exposed? Are system toolboxes properly stripped? The heartbeat GM should only have create_commission, dispatch_commission, initiate_meeting, read_memory, project_briefing.\n2. **System prompt**: Does it properly constrain GM to dispatcher mode per REQ-HBT-9?\n3. **Error handling**: Rate-limit vs non-rate-limit paths. Rate limit should abort the loop and schedule backoff. Non-rate-limit should skip the project and continue.\n4. **Post-completion scheduling**: Next tick schedules after all projects complete, not on a fixed interval.\n5. **Source provenance**: source field written to YAML correctly, timeline entry includes source description.\n6. **Production wiring**: All deps threaded correctly in createProductionApp().\n\nReport ALL findings. Do not downgrade anything. Present every issue with its impact."
dependencies:
  - commission-Dalton-20260403-175237
linked_artifacts:
  - .lore/specs/heartbeat-commission-dispatch.md

  - .lore/plans/heartbeat-commission-dispatch.md
  - daemon/services/heartbeat/index.ts
  - daemon/services/heartbeat/session.ts
  - daemon/services/heartbeat/heartbeat-file.ts
  - daemon/services/heartbeat/condensation.ts
  - daemon/app.ts
  - daemon/services/commission/orchestrator.ts
  - daemon/services/commission/record.ts
  - lib/types.ts
  - lib/config.ts
  - .lore/plans/heartbeat-commission-dispatch.md
  - daemon/services/heartbeat/index.ts
  - daemon/services/heartbeat/session.ts
  - daemon/services/heartbeat/heartbeat-file.ts
  - daemon/services/heartbeat/condensation.ts
  - daemon/app.ts
  - daemon/services/commission/orchestrator.ts
  - daemon/services/commission/record.ts
  - lib/types.ts
  - lib/config.ts
resource_overrides:
  model: opus

activity_timeline:
  - timestamp: 2026-04-04T00:53:18.073Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-04T00:59:31.177Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-04-04T01:52:11.809Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-04T01:52:11.867Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-04T01:52:18.260Z
    event: progress_report
    reason: "Starting review. Reading plan (Phase 2) and spec for requirements context."
  - timestamp: 2026-04-04T01:52:48.887Z
    event: progress_report
    reason: "Read all implementation files. Now reading condensation module, test files, and reference patterns (briefing-refresh, briefing-generator resolve tool set)."
  - timestamp: 2026-04-04T01:56:14.297Z
    event: progress_report
    reason: "Finished reading all source and test files. Analyzing findings against spec requirements. Compiling review."
  - timestamp: 2026-04-04T01:58:14.178Z
    event: progress_report
    reason: "All findings recorded. Compiling final review with priority ordering."
  - timestamp: 2026-04-04T01:59:15.068Z
    event: result_submitted
    reason: "## Heartbeat Service Core Review (Phase 1 + Phase 2)\n\nReviewed: `daemon/services/heartbeat/index.ts`, `session.ts`, `heartbeat-file.ts`, `condensation.ts`, `daemon/app.ts`, `daemon/services/commission/orchestrator.ts`, `daemon/services/commission/record.ts`, `lib/types.ts`, `lib/config.ts`, and all four test files.\n\n### Findings by Priority\n\n---\n\n**F1. HIGH: No heartbeat-specific system prompt (REQ-HBT-9 violation)**\n\nFile: `daemon/services/heartbeat/session.ts:121`\n\nThe session uses the standard Guild Master prompt via `activateManager()` with `activationExtras: { managerContext: \"\" }`. REQ-HBT-9 requires 8 specific behavioral constraints that constrain the GM to \"heartbeat dispatcher mode\":\n\n1. Read standing orders and recent activity\n2. For each order, decide whether it warrants a new commission right now\n3. Consider watch items and context notes when making decisions\n4. If an order is ambiguous, skip it entirely\n5. If no standing orders exist, take no action\n6. Do not propose architectural changes or expand scope\n7. Check recent activity for evidence that an order has already been acted on (deduplication)\n8. If the heartbeat file has grown unwieldy, commission a cleanup\n\nNone of these constraints are injected. The GM receives its normal operational posture (\"When the user agrees on work to be done, create and dispatch commissions immediately\"), but in heartbeat mode the standing orders are the user prompt, not an interactive user. Without the dispatcher-mode constraints, the GM may behave unpredictably: creating commissions for watch items, ignoring deduplication, expanding scope beyond standing orders.\n\nThe briefing generator (the reference pattern) bypasses `prepareSdkSession` entirely and sets `systemPrompt` directly. The heartbeat session should either: (a) override `options.systemPrompt` after `prepareSdkSession` returns, or (b) inject heartbeat constraints through `activationExtras` as a dedicated context section.\n\n**Impact**: The GM will run without behavioral guardrails specific to heartbeat evaluation. Deduplication (REQ-HBT-23), ambiguity handling, scope constraints, and cleanup commissioning are all absent from the system prompt.\n\n---\n\n**F2. MEDIUM: Tool set includes unintended write capabilities (REQ-HBT-10 partial violation)**\n\nFile: `daemon/services/heartbeat/session.ts:170-195`\n\nREQ-HBT-10 specifies: \"the manager toolbox's coordination tools plus read-only project state tools (`read_memory`, `project_briefing`).\" The implementation correctly provides coordination tools (create_commission, dispatch_commission, initiate_meeting) and correctly strips system toolboxes. However, the base toolbox also exposes:\n\n- `edit_memory` (can modify project/worker/global memory)\n- `record_decision` (writes to commission decision log)\n- `report_progress` (writes progress updates)\n- `submit_result` (writes commission results)\n\nThe spec says \"read-only project state tools\" but the base toolbox includes write tools. The heartbeat GM could modify memory or record decisions during its evaluation, which is not the intended behavior for a lightweight Haiku dispatcher session.\n\n**Impact**: The heartbeat GM has write access to the memory system and commission state tools that could produce unexpected side effects. Low probability (Haiku is unlikely to spontaneously use these), but the surface area is wider than specified.\n\n---\n\n**F3. MEDIUM: Session tests are structural, not behavioral**\n\nFile: `tests/daemon/services/heartbeat/heartbeat-session.test.ts:167-183`\n\nTwo tests contain only `expect(true).toBe(true)`:\n- `\"constrains GM to dispatcher mode\"` (line 167-173)\n- `\"create_commission tool schema includes source_description\"` (line 177-183)\n\nThese provide zero behavioral coverage. The comments claim compile-time verification, but that's a separate concern. No tests verify:\n- The actual system prompt content (directly relevant to F1)\n- Tool set composition (the MCP server contains the right tools)\n- maxTurns is set to 30 (REQ-HBT-11)\n- contextId format is `heartbeat-{projectName}-{tickTimestamp}` (tested structurally but not through the actual session function)\n- The create_commission tool handler's auto-dispatch behavior\n- The create_commission tool handler's source injection\n- Error paths in the tool handlers\n\nThe rate-limit detection test (line 142-163) has a meaningful assertion but doesn't verify the `isRateLimit` flag on the result because the error propagates through `prepareSdkSession`, not through the session's catch block.\n\n**Impact**: The most critical module (the GM session builder) has the weakest test coverage. If F1 is fixed by adding a system prompt, there would be no test to verify the prompt content is correct.\n\n---\n\n**F4. LOW: `repairHeartbeatHeader` fails on files starting with `##`**\n\nFile: `daemon/services/heartbeat/heartbeat-file.ts:84`\n\n`content.indexOf(\"\\n##\")` requires a newline before the first `##`. A file that starts directly with `## Standing Orders\\n- Do stuff` would:\n1. Return `firstSectionIndex === -1` (no `\\n##` found at the start)\n2. Replace the entire file with the template, losing section content\n\nIf the file is `## Standing Orders\\n- Do stuff\\n## Watch Items\\n- Item`, the `indexOf(\"\\n##\")` finds `\\n## Watch Items` (not the first heading). The code then treats everything before that as \"header\", discarding `## Standing Orders\\n- Do stuff\\n`.\n\nThis only affects manually created files that lack a header. Normal operation (file created by `ensureHeartbeatFile`) always has a header. Low risk but the repair function's contract (\"preserves section content\") is violated.\n\n**Impact**: Content loss for edge-case files. Fix: change to a regex that matches `##` at line start: `content.match(/^## /m)`.\n\n---\n\n**F5. LOW: `commissionsCreatedLastTick` tracking not implemented**\n\nFile: `daemon/services/heartbeat/index.ts`\n\nThe plan (Phase 2, Step 1, Testing section) says: \"Verify `commissionsCreatedLastTick` count is tracked per project (consumed by Phase 5's `/status` route).\" The current implementation has no per-project state tracking for commission counts.\n\nThis is a reasonable deferral since the `/status` route is Phase 5, but Phase 5 will need to add this tracking retroactively, which means modifying `tickSingleProject` or `runHeartbeatSession` to return a count.\n\n**Impact**: Phase 5 will require changes to the heartbeat service internals, not just adding routes.\n\n---\n\n### Requirements Checklist\n\n| REQ | Status | Notes |\n|-----|--------|-------|\n| REQ-HBT-1 | Satisfied | heartbeat.md at .lore/heartbeat.md |\n| REQ-HBT-2 | Satisfied | Four sections with correct headings |\n| REQ-HBT-3 | Satisfied | No structural parsing, only content-below-header check |\n| REQ-HBT-4 | Satisfied | Loop iterates all projects sequentially |\n| REQ-HBT-5 | Satisfied | Post-completion scheduling pattern |\n| REQ-HBT-6 | Satisfied | Non-rate-limit errors skip project, continue loop |\n| REQ-HBT-6a | Satisfied | Rate-limit aborts loop, schedules backoff |\n| REQ-HBT-7 | Satisfied | Starts after briefing refresh, first tick after interval |\n| REQ-HBT-8 | Satisfied | Uses prepareSdkSession + runSdkSession, model from config |\n| REQ-HBT-9 | **Not satisfied** | No dispatcher-mode system prompt (F1) |\n| REQ-HBT-10 | **Partially satisfied** | Coordination tools correct, extra write tools exposed (F2) |\n| REQ-HBT-11 | Satisfied | maxTurns: 30, contextId format correct |\n| REQ-HBT-20 | Satisfied | clearRecentActivity works correctly |\n| REQ-HBT-21 | Satisfied | source option on createCommission |\n| REQ-HBT-22 | Satisfied | source block in YAML frontmatter |\n| REQ-HBT-23 | **Not satisfied** | System prompt should instruct deduplication (depends on F1) |\n| REQ-HBT-24 | Satisfied | Timeline entry includes source description |\n| REQ-HBT-25 | Satisfied | ensureHeartbeatFile on project initialization |\n| REQ-HBT-26 | Satisfied | Template content matches spec exactly |\n| REQ-HBT-28 | Satisfied | Config schema validates correctly |\n| REQ-HBT-28a | Satisfied | Backoff config validates correctly |\n| REQ-HBT-29 | Satisfied | systemModels.heartbeat parses correctly |\n| REQ-HBT-45 | Satisfied | readSource method implemented and tested |\n| REQ-HBT-49 | Satisfied | Production wiring correct |\n| REQ-HBT-50 | Satisfied | Condensation subscriber owned by service |\n\n### What to fix before proceeding\n\n1. **F1 is the blocking issue.** The heartbeat session without dispatcher-mode constraints will produce unpredictable behavior. Add the system prompt text from REQ-HBT-9 either as a post-prep override or as an activation extra.\n2. **F3 should be addressed alongside F1.** When adding the system prompt, add tests that verify the prompt content and tool set composition.\n3. **F2 and F4 can be deferred** but should be tracked as issues."
  - timestamp: 2026-04-04T01:59:25.557Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All findings recorded. Compiling final review with priority ordering."
projectName: guild-hall
---
## Heartbeat Service Core Review (Phase 1 + Phase 2)

Reviewed: `daemon/services/heartbeat/index.ts`, `session.ts`, `heartbeat-file.ts`, `condensation.ts`, `daemon/app.ts`, `daemon/services/commission/orchestrator.ts`, `daemon/services/commission/record.ts`, `lib/types.ts`, `lib/config.ts`, and all four test files.

### Findings by Priority

---

**F1. HIGH: No heartbeat-specific system prompt (REQ-HBT-9 violation)**

File: `daemon/services/heartbeat/session.ts:121`

The session uses the standard Guild Master prompt via `activateManager()` with `activationExtras: { managerContext: "" }`. REQ-HBT-9 requires 8 specific behavioral constraints that constrain the GM to "heartbeat dispatcher mode":

1. Read standing orders and recent activity
2. For each order, decide whether it warrants a new commission right now
3. Consider watch items and context notes when making decisions
4. If an order is ambiguous, skip it entirely
5. If no standing orders exist, take no action
6. Do not propose architectural changes or expand scope
7. Check recent activity for evidence that an order has already been acted on (deduplication)
8. If the heartbeat file has grown unwieldy, commission a cleanup

None of these constraints are injected. The GM receives its normal operational posture ("When the user agrees on work to be done, create and dispatch commissions immediately"), but in heartbeat mode the standing orders are the user prompt, not an interactive user. Without the dispatcher-mode constraints, the GM may behave unpredictably: creating commissions for watch items, ignoring deduplication, expanding scope beyond standing orders.

The briefing generator (the reference pattern) bypasses `prepareSdkSession` entirely and sets `systemPrompt` directly. The heartbeat session should either: (a) override `options.systemPrompt` after `prepareSdkSession` returns, or (b) inject heartbeat constraints through `activationExtras` as a dedicated context section.

**Impact**: The GM will run without behavioral guardrails specific to heartbeat evaluation. Deduplication (REQ-HBT-23), ambiguity handling, scope constraints, and cleanup commissioning are all absent from the system prompt.

---

**F2. MEDIUM: Tool set includes unintended write capabilities (REQ-HBT-10 partial violation)**

File: `daemon/services/heartbeat/session.ts:170-195`

REQ-HBT-10 specifies: "the manager toolbox's coordination tools plus read-only project state tools (`read_memory`, `project_briefing`)." The implementation correctly provides coordination tools (create_commission, dispatch_commission, initiate_meeting) and correctly strips system toolboxes. However, the base toolbox also exposes:

- `edit_memory` (can modify project/worker/global memory)
- `record_decision` (writes to commission decision log)
- `report_progress` (writes progress updates)
- `submit_result` (writes commission results)

The spec says "read-only project state tools" but the base toolbox includes write tools. The heartbeat GM could modify memory or record decisions during its evaluation, which is not the intended behavior for a lightweight Haiku dispatcher session.

**Impact**: The heartbeat GM has write access to the memory system and commission state tools that could produce unexpected side effects. Low probability (Haiku is unlikely to spontaneously use these), but the surface area is wider than specified.

---

**F3. MEDIUM: Session tests are structural, not behavioral**

File: `tests/daemon/services/heartbeat/heartbeat-session.test.ts:167-183`

Two tests contain only `expect(true).toBe(true)`:
- `"constrains GM to dispatcher mode"` (line 167-173)
- `"create_commission tool schema includes source_description"` (line 177-183)

These provide zero behavioral coverage. The comments claim compile-time verification, but that's a separate concern. No tests verify:
- The actual system prompt content (directly relevant to F1)
- Tool set composition (the MCP server contains the right tools)
- maxTurns is set to 30 (REQ-HBT-11)
- contextId format is `heartbeat-{projectName}-{tickTimestamp}` (tested structurally but not through the actual session function)
- The create_commission tool handler's auto-dispatch behavior
- The create_commission tool handler's source injection
- Error paths in the tool handlers

The rate-limit detection test (line 142-163) has a meaningful assertion but doesn't verify the `isRateLimit` flag on the result because the error propagates through `prepareSdkSession`, not through the session's catch block.

**Impact**: The most critical module (the GM session builder) has the weakest test coverage. If F1 is fixed by adding a system prompt, there would be no test to verify the prompt content is correct.

---

**F4. LOW: `repairHeartbeatHeader` fails on files starting with `##`**

File: `daemon/services/heartbeat/heartbeat-file.ts:84`

`content.indexOf("\n##")` requires a newline before the first `##`. A file that starts directly with `## Standing Orders\n- Do stuff` would:
1. Return `firstSectionIndex === -1` (no `\n##` found at the start)
2. Replace the entire file with the template, losing section content

If the file is `## Standing Orders\n- Do stuff\n## Watch Items\n- Item`, the `indexOf("\n##")` finds `\n## Watch Items` (not the first heading). The code then treats everything before that as "header", discarding `## Standing Orders\n- Do stuff\n`.

This only affects manually created files that lack a header. Normal operation (file created by `ensureHeartbeatFile`) always has a header. Low risk but the repair function's contract ("preserves section content") is violated.

**Impact**: Content loss for edge-case files. Fix: change to a regex that matches `##` at line start: `content.match(/^## /m)`.

---

**F5. LOW: `commissionsCreatedLastTick` tracking not implemented**

File: `daemon/services/heartbeat/index.ts`

The plan (Phase 2, Step 1, Testing section) says: "Verify `commissionsCreatedLastTick` count is tracked per project (consumed by Phase 5's `/status` route)." The current implementation has no per-project state tracking for commission counts.

This is a reasonable deferral since the `/status` route is Phase 5, but Phase 5 will need to add this tracking retroactively, which means modifying `tickSingleProject` or `runHeartbeatSession` to return a count.

**Impact**: Phase 5 will require changes to the heartbeat service internals, not just adding routes.

---

### Requirements Checklist

| REQ | Status | Notes |
|-----|--------|-------|
| REQ-HBT-1 | Satisfied | heartbeat.md at .lore/heartbeat.md |
| REQ-HBT-2 | Satisfied | Four sections with correct headings |
| REQ-HBT-3 | Satisfied | No structural parsing, only content-below-header check |
| REQ-HBT-4 | Satisfied | Loop iterates all projects sequentially |
| REQ-HBT-5 | Satisfied | Post-completion scheduling pattern |
| REQ-HBT-6 | Satisfied | Non-rate-limit errors skip project, continue loop |
| REQ-HBT-6a | Satisfied | Rate-limit aborts loop, schedules backoff |
| REQ-HBT-7 | Satisfied | Starts after briefing refresh, first tick after interval |
| REQ-HBT-8 | Satisfied | Uses prepareSdkSession + runSdkSession, model from config |
| REQ-HBT-9 | **Not satisfied** | No dispatcher-mode system prompt (F1) |
| REQ-HBT-10 | **Partially satisfied** | Coordination tools correct, extra write tools exposed (F2) |
| REQ-HBT-11 | Satisfied | maxTurns: 30, contextId format correct |
| REQ-HBT-20 | Satisfied | clearRecentActivity works correctly |
| REQ-HBT-21 | Satisfied | source option on createCommission |
| REQ-HBT-22 | Satisfied | source block in YAML frontmatter |
| REQ-HBT-23 | **Not satisfied** | System prompt should instruct deduplication (depends on F1) |
| REQ-HBT-24 | Satisfied | Timeline entry includes source description |
| REQ-HBT-25 | Satisfied | ensureHeartbeatFile on project initialization |
| REQ-HBT-26 | Satisfied | Template content matches spec exactly |
| REQ-HBT-28 | Satisfied | Config schema validates correctly |
| REQ-HBT-28a | Satisfied | Backoff config validates correctly |
| REQ-HBT-29 | Satisfied | systemModels.heartbeat parses correctly |
| REQ-HBT-45 | Satisfied | readSource method implemented and tested |
| REQ-HBT-49 | Satisfied | Production wiring correct |
| REQ-HBT-50 | Satisfied | Condensation subscriber owned by service |

### What to fix before proceeding

1. **F1 is the blocking issue.** The heartbeat session without dispatcher-mode constraints will produce unpredictable behavior. Add the system prompt text from REQ-HBT-9 either as a post-prep override or as an activation extra.
2. **F3 should be addressed alongside F1.** When adding the system prompt, add tests that verify the prompt content and tool set composition.
3. **F2 and F4 can be deferred** but should be tracked as issues.

## Decisions

**Does the heartbeat GM session have a dispatcher-mode system prompt per REQ-HBT-9?**
FINDING: No heartbeat-specific system prompt exists. The session uses the standard Guild Master prompt via activateManager() with activationExtras: { managerContext: "" }. REQ-HBT-9 requires 8 specific behavioral constraints (skip ambiguous orders, check recent activity for deduplication, commission cleanup of unwieldy files, etc.) that are not injected anywhere.
*Reasoning: session.ts line 121 sets activationExtras: { managerContext: "" }, which clears the manager context but does not inject heartbeat-specific constraints. The activateManager() function in daemon/services/manager/worker.ts builds the system prompt from MANAGER_SOUL + MANAGER_POSTURE_BASE + model guidance + memory guidance. None of these contain heartbeat dispatcher constraints. The spec explicitly lists: skip ambiguous orders, no scope expansion, check recent activity for prior action, commission cleanup if file is unwieldy. The briefing generator (the reference pattern) bypasses prepareSdkSession entirely and provides its own systemPrompt string directly. The heartbeat session should either override options.systemPrompt after prepareSdkSession returns, or inject the constraints through activationExtras.*

**Does the heartbeat session expose the correct tool set per REQ-HBT-10?**
FINDING: The tool set is partially correct but includes unintended write tools. REQ-HBT-10 specifies coordination tools (create_commission, dispatch_commission, initiate_meeting) + read-only tools (read_memory, project_briefing). The implementation correctly provides the coordination tools via a custom MCP server and correctly strips system toolboxes. However, the base toolbox also provides edit_memory, record_decision, and report_progress, which are write tools the heartbeat GM should not have per spec.
*Reasoning: The base toolbox (daemon/services/base-toolbox.ts) always includes read_memory, edit_memory, record_decision, report_progress, project_briefing, and submit_result. The heartbeat session strips system toolboxes (line 178: systemToolboxes: []) but keeps the base toolbox. REQ-HBT-10 says "read-only project state tools (read_memory, project_briefing)" - it specifically names only two read-only tools. edit_memory allows the heartbeat GM to modify project/worker memory. record_decision and report_progress are session-management tools that may not make sense in a heartbeat context (no active commission to report progress on).*

**Are the heartbeat session tests adequate for the session module (session.ts)?**
FINDING: Session tests are largely structural, not behavioral. Two tests assert true === true without verifying any behavior. The test "constrains GM to dispatcher mode" (line 167-173) and "create_commission tool schema includes source_description" (line 177-183) each just do expect(true).toBe(true). There are no tests that verify: the actual system prompt content, that tools are correctly assembled, that the tool server handles edge cases (dispatch failure, create failure), or that maxTurns is set to 30.
*Reasoning: heartbeat-session.test.ts lines 167-173 and 177-183 contain tests that assert `expect(true).toBe(true)`. These provide no test coverage. The comments claim they "verify at compile time" but type-checking is a separate concern from behavior testing. REQ-HBT-11 (maxTurns: 30, contextId format), REQ-HBT-8 (model selection), and REQ-HBT-10 (tool set composition) all lack behavioral verification. The tool server's create_commission handler has complex logic (auto-dispatch, source injection, error handling) with no test coverage.*

**Is the error handling correct for rate-limit vs non-rate-limit paths (REQ-HBT-6, REQ-HBT-6a)?**
FINDING: The error handling structure is correct. Rate-limit errors abort the loop and schedule at backoff interval. Non-rate-limit errors skip the project and continue. Activity is preserved on failure. The double-schedule guard (line 140: pendingTimer === null check) correctly prevents both the rate-limit path and the post-completion path from scheduling simultaneously. One concern: isRateLimitError() in session.ts uses string matching on error messages, which is brittle but standard for SDK error handling.
*Reasoning: index.ts runCycle() (lines 101-131): iterates projects, catches errors per-project. On rate limit (result.isRateLimit), sets pendingTimer to backoff interval and returns early (stops loop). On non-rate-limit failure, logs warning and continues to next project. The scheduleNext() function (lines 133-146) only schedules the next tick if pendingTimer is still null (meaning the rate-limit path didn't already schedule). Activity clearing (line 92) only happens on success. REQ-HBT-6 and REQ-HBT-6a are both satisfied.*

**Is the source provenance implementation correct per REQ-HBT-21, REQ-HBT-22, REQ-HBT-24, REQ-HBT-45?**
FINDING: Source provenance is correctly implemented. The createCommission options type includes source?: { description: string }. The YAML template emits source: block (orchestrator.ts line 1105-1107). The timeline reason includes source description (lines 1109-1113). readSource in record.ts parses the YAML correctly. Tests verify roundtrip. One note: the spec says sourceSchedule/sourceTrigger should NOT be removed yet (that's Phase 7), and the implementation correctly retains them alongside the new source field.
*Reasoning: Orchestrator grep shows source block construction (line 1105-1107): `\nsource:\n  description: "${escapeYamlValue(options.source.description)}"`. Timeline reason (lines 1109-1113) correctly prioritizes sourceTrigger over source for the reason string. record.ts readSource (lines 453-472) uses gray-matter to parse the source block and returns CommissionSource | null. Tests in record.test.ts (line 1261+) and orchestrator.test.ts (line 2486+) verify roundtrip. sourceSchedule and sourceTrigger remain in the options type (lines 1103, 1101), correctly deferred to Phase 7.*

**Is the production wiring in daemon/app.ts correct per REQ-HBT-49?**
FINDING: Production wiring is correct in structure and ordering. The heartbeat service is constructed after briefing refresh (line 482, REQ-HBT-7), receives all required deps (sessionDeps with queryFn, prepDeps, packages, config, guildHallHome, commissionSession, eventBus, gitOps, getProjectConfig), and is started/stopped in the lifecycle. heartbeatService.stop() is called in shutdown (line 691). The ensureHeartbeatFile loop (lines 220-227) runs during project initialization as required by REQ-HBT-25.
*Reasoning: app.ts lines 481-505: HeartbeatService is created after briefingRefresh.start() (line 479). SessionDeps includes queryFn!, prepDeps, allPackages, config, guildHallHome, commissionSession, eventBus, git, getProjectConfig. The service is started at line 505. Stop is at line 691 in the shutdown function. ensureHeartbeatFile is called per-project at lines 220-227, before the sync loop. All REQ-HBT-49 deps are threaded.*

**Does the post-completion scheduling pattern match the briefing-refresh reference (REQ-HBT-5)?**
FINDING: The pattern correctly implements post-completion scheduling. start() sets a timer for the first tick (no immediate evaluation, REQ-HBT-7). scheduleNext() runs the cycle, then schedules the next tick after the configured interval. The pattern matches briefing-refresh.ts. One structural difference: the rate-limit path in runCycle() schedules its own timer at the backoff interval, and scheduleNext() checks pendingTimer === null to avoid double-scheduling. This is well-designed.
*Reasoning: index.ts start() (lines 148-155): setTimeout with intervalMs, calls scheduleNext(). scheduleNext() (lines 133-146): runs runCycle(), then if running && pendingTimer === null, schedules next at intervalMs. The pendingTimer null-check is the coordination mechanism between normal and rate-limit scheduling paths. This follows the same basic pattern as briefing-refresh.ts but adds the rate-limit branching correctly.*

**Is the event condensation subscriber correctly implemented per REQ-HBT-14 through REQ-HBT-20?**
FINDING: Condensation is well-implemented. Terminal status filtering (REQ-HBT-15), timestamp formatting (REQ-HBT-16), integration worktree writes (REQ-HBT-17), project scoping via event data or state file lookup (REQ-HBT-18/19), and write serialization via promise chains all work correctly. Test coverage is thorough with 11 integration tests. One note: REQ-HBT-50 (service owns condensation) is correctly wired - the subscriber registers in the HeartbeatService constructor and unsubscribes in stop().
*Reasoning: condensation.ts: TERMINAL_STATUSES Set covers completed/failed/cancelled/abandoned (REQ-HBT-15). formatEventLine handles commission_status, commission_result (with 200-char truncation), meeting_ended, returns null for everything else. formatTimestamp produces HH:MM (REQ-HBT-16). resolveProjectNameForEvent checks event.projectName first, falls back to state file lookup (REQ-HBT-18). Write serialization via Map<string, Promise<void>> (lines 48-63) prevents concurrent corruption. Tests cover all event types, cross-project filtering, concurrent writes, and unsubscribe behavior.*

**Does repairHeartbeatHeader handle the edge case where a file starts with ## (no preceding newline)?**
FINDING: repairHeartbeatHeader has a minor edge case. It searches for "\n##" (line 84), which requires a newline before the first ##. A file that starts directly with "## Standing Orders" (no header at all) would match firstSectionIndex === -1, causing the entire file to be replaced with the template, losing any section content. This is a real bug for files that start with a section heading, though it's unlikely in normal operation since ensureHeartbeatFile always writes a header first.
*Reasoning: heartbeat-file.ts line 84: content.indexOf("\n##"). If a file is "## Standing Orders\n- Do stuff\n## Watch Items\n- Item", indexOf("\n##") returns the position of "\n## Watch Items", not the first heading. The code would then keep the corrupted header (empty string up to the newline before ## Watch Items) and prepend the template header, losing "## Standing Orders\n- Do stuff\n". This is a content-loss bug for manually created files that don't have a standard header.*

**Is the config validation for heartbeat fields correct per REQ-HBT-28, REQ-HBT-28a, REQ-HBT-29?**
FINDING: Config validation is correct. heartbeatIntervalMinutes uses z.number().int().min(5).optional() (REQ-HBT-28). heartbeatBackoffMinutes uses z.number().int().min(60).optional() (REQ-HBT-28a). systemModels.heartbeat uses z.string().min(1).optional() (REQ-HBT-29). Types in lib/types.ts include heartbeat?: string in SystemModels and heartbeatIntervalMinutes/heartbeatBackoffMinutes in AppConfig. Test coverage in config.test.ts is comprehensive: valid values, minimums, rejections, defaults, and YAML roundtrip.
*Reasoning: lib/config.ts lines 135-136: schema definitions match spec exactly. lib/types.ts lines 39 (SystemModels.heartbeat), 50-51 (AppConfig fields). Tests at config.test.ts lines 924-1049 cover: valid interval (60), minimum interval (5), below-minimum rejection (4), non-integer rejection (10.5), undefined default, valid backoff (300), minimum backoff (60), below-minimum rejection (59), undefined default, heartbeat model string, empty string rejection, YAML roundtrip.*

**Does the heartbeat file scaffolding match REQ-HBT-26?**
FINDING: Scaffolding content matches the spec exactly. The HEARTBEAT_HEADER constant in heartbeat-file.ts matches REQ-HBT-26's template content verbatim: instructional header explaining the four section types, followed by ## Standing Orders, ## Watch Items, ## Context Notes, ## Recent Activity as bare headings.
*Reasoning: heartbeat-file.ts lines 16-43: HEARTBEAT_HEADER matches the spec's template. SECTION_HEADINGS array contains all four headings. TEMPLATE_CONTENT joins them with double newlines. The spec's example at REQ-HBT-26 matches the code output. Tests in heartbeat-file.test.ts verify all four headings are present.*

**Does the heartbeat service track commissionsCreatedLastTick per the plan?**
FINDING: The plan (Phase 2, Step 1) specifies that commissionsCreatedLastTick should be tracked per project for the Phase 5 /status route. This tracking is not implemented in the current code. The HeartbeatService has no per-project state tracking for commission counts. This is acceptable since the /status route is Phase 5 work, but it means Phase 5 will need to add this tracking retroactively.
*Reasoning: index.ts has no commissionsCreatedLastTick field or tracking logic. The tickSingleProject function returns success/error but doesn't count commissions created. The plan says "Verify commissionsCreatedLastTick count is tracked per project (consumed by Phase 5's /status route)" in Phase 2 Step 1's testing section. The implementation defers this tracking to Phase 5, which is a reasonable scope decision since the /status route doesn't exist yet.*
