---
title: "Plan: Heartbeat Commission Dispatch"
date: 2026-04-03
status: approved
tags: [plan, commissions, heartbeat, scheduling, automation, haiku, simplification, removal]
modules: [daemon-heartbeat, manager-toolbox, commission-orchestrator, event-bus, lib-config, lib-commissions, web-dashboard, web-commission]
related:
  - .lore/specs/heartbeat-commission-dispatch.md
  - .lore/brainstorm/heartbeat-commission-dispatch.md
  - .lore/issues/redo-schedule-trigger-commissions.md
  - .lore/specs/commissions/guild-hall-scheduled-commissions.md
  - .lore/specs/commissions/triggered-commissions.md
---

# Plan: Heartbeat Commission Dispatch

## Spec Reference

**Spec**: `.lore/specs/heartbeat-commission-dispatch.md`
**Brainstorm**: `.lore/brainstorm/heartbeat-commission-dispatch.md`

Requirements addressed:

- REQ-HBT-1: Heartbeat file per project → Phase 1, Step 3
- REQ-HBT-2: File sections (Standing Orders, Watch Items, Context Notes, Recent Activity) → Phase 1, Step 3
- REQ-HBT-3: No structural parsing beyond header check → Phase 2, Step 1
- REQ-HBT-4: Daemon heartbeat loop → Phase 2, Step 1
- REQ-HBT-5: Post-completion scheduling pattern → Phase 2, Step 1
- REQ-HBT-6: Per-project error handling for non-rate-limit errors, no retry → Phase 2, Step 1
- REQ-HBT-6a: Rate-limit error handling with loop abort and backoff scheduling → Phase 2, Step 1
- REQ-HBT-7: Startup after briefing refresh, no catch-up → Phase 2, Step 1
- REQ-HBT-8: GM session via prepareSdkSession + runSdkSession on Haiku → Phase 2, Step 2
- REQ-HBT-9: System prompt constraints (dispatcher mode) → Phase 2, Step 2
- REQ-HBT-10: GM coordination tools (create/dispatch/initiate) → Phase 2, Step 2
- REQ-HBT-11: Heartbeat file as user prompt, maxTurns 30, unique contextId → Phase 2, Step 2
- REQ-HBT-12: add_heartbeat_entry tool parameters → Phase 4, Step 1
- REQ-HBT-13: Tool in base toolbox, accessible to all workers → Phase 4, Step 1
- REQ-HBT-14: EventBus subscriber for activity summaries → Phase 3, Step 1
- REQ-HBT-15: Condensed event types (terminal status, result, meeting_ended) → Phase 3, Step 1
- REQ-HBT-16: Timestamp-prefixed markdown list items → Phase 3, Step 1
- REQ-HBT-17: Write to integration worktree → Phase 3, Step 1
- REQ-HBT-18: Project scoping via event projectName or state lookup → Phase 3, Step 1
- REQ-HBT-19: Cross-project filtering → Phase 3, Step 1
- REQ-HBT-20: Clear Recent Activity after tick → Phase 2, Step 1
- REQ-HBT-21: createCommission gains `source` option → Phase 1, Step 2
- REQ-HBT-22: Source in YAML frontmatter → Phase 1, Step 2
- REQ-HBT-23: No mechanical loop prevention → Phase 2, Step 2 (system prompt)
- REQ-HBT-24: Timeline entry with source description → Phase 1, Step 2
- REQ-HBT-25: Scaffolding on project initialization → Phase 1, Step 3
- REQ-HBT-26: Scaffolded file content (header + empty sections) → Phase 1, Step 3
- REQ-HBT-27: Dashboard [Tick Now] button + standing order count → Phase 5, Step 2
- REQ-HBT-28: heartbeatIntervalMinutes config → Phase 1, Step 1
- REQ-HBT-28a: heartbeatBackoffMinutes config → Phase 1, Step 1
- REQ-HBT-29: systemModels.heartbeat config → Phase 1, Step 1
- REQ-HBT-30: POST /heartbeat/{projectName}/tick → Phase 5, Step 1
- REQ-HBT-31: GET /heartbeat/{projectName}/status → Phase 5, Step 1
- REQ-HBT-32: Remove scheduler files → Phase 6, Step 1
- REQ-HBT-33: Remove trigger files → Phase 6, Step 2
- REQ-HBT-34: Remove types from daemon/types.ts → Phase 7, Step 1
- REQ-HBT-35: Remove schedule/trigger record ops → Phase 7, Step 1
- REQ-HBT-36: Remove manager toolbox tools → Phase 7, Step 1
- REQ-HBT-37: Remove scheduler/trigger wiring from daemon/app.ts → Phase 7, Step 2
- REQ-HBT-38: Remove schedule/trigger routes from commissions.ts → Phase 7, Step 1
- REQ-HBT-39: Remove createScheduledCommission/createTriggeredCommission → Phase 7, Step 1
- REQ-HBT-40: Remove schedule_spawned event type → Phase 7, Step 1
- REQ-HBT-41: Remove schedule/trigger UI from CommissionView, List, Header, Form → Phase 6, Step 3
- REQ-HBT-41a: Replace sourceSchedule/sourceTrigger with source in lib/commissions.ts → Phase 7, Step 1
- REQ-HBT-41b: Remove schedule/trigger from commission detail page → Phase 6, Step 3
- REQ-HBT-42: Remove CommissionType union → Phase 7, Step 1
- REQ-HBT-43: Remove readType, dead type branches → Phase 7, Step 1
- REQ-HBT-44: Historical artifacts left in place → Phase 7, Step 1 (no action needed)
- REQ-HBT-45: readSource method on CommissionRecordOps → Phase 1, Step 2
- REQ-HBT-46: No automatic schedule migration → Phase 8 (migration guide)
- REQ-HBT-47: No automatic trigger migration → Phase 8 (migration guide)
- REQ-HBT-48: Move superseded specs to _abandoned/ → Phase 8, Step 1
- REQ-HBT-49: Heartbeat service wired in createProductionApp() → Phase 2, Step 3
- REQ-HBT-50: Condensation subscriber owned by heartbeat service → Phase 3, Step 1

## Codebase Context

### Patterns to Follow

**Post-completion scheduling.** `daemon/services/briefing-refresh.ts` (73 lines) implements the exact loop pattern: `start()`/`stop()`, per-project iteration, error-per-project with skip, `setTimeout` after all projects complete. The heartbeat loop copies this structure.

**SDK session for GM.** `daemon/services/briefing-generator.ts` uses `prepareSdkSession` + `runSdkSession` with `makeBriefingResolveToolSet` to strip system toolboxes and provide a custom tool set. The heartbeat session follows the same pattern but with manager coordination tools instead of briefing tools.

**DI factory for routes.** All route factories take deps as parameters. `createCommissionRoutes(deps)` in `daemon/routes/commissions.ts`. New heartbeat routes follow the same pattern and wire through `daemon/app.ts`.

**EventBus subscription.** The triage service and notification service subscribe to the EventBus at daemon startup. The condensation subscriber registers the same way.

### Files to Remove (Verified)

All daemon service files, web components, and API routes listed in REQ-HBT-32 and REQ-HBT-33 exist and are confirmed present.

**Spec correction:** The spec lists 6 test files for removal that do not exist in the repository:
- `tests/daemon/services/scheduler/scheduler.test.ts` (not found)
- `tests/daemon/services/scheduler/cron.test.ts` (not found)
- `tests/daemon/services/scheduler/schedule-lifecycle.test.ts` (not found)
- `tests/daemon/services/trigger-evaluator.test.ts` (not found)
- `tests/daemon/services/trigger-evaluator-service.test.ts` (not found)
- `tests/components/trigger-form-data.test.ts` (not found)

These were likely planned but never written, or were removed in a prior cleanup. The plan accounts for their absence.

### Dependency: croner

The `croner` package is imported only by `daemon/services/scheduler/cron.ts`. No other code imports it. Safe to remove from `package.json` after scheduler removal.

### Existing Schedule/Trigger Plans to Retire

These plan artifacts reference the superseded systems and should be noted as historical after implementation:
- `.lore/plans/commissions/guild-hall-scheduled-commissions.md`
- `.lore/plans/commissions/triggered-commissions-core.md`
- `.lore/plans/commissions/triggered-commissions-tools.md`
- `.lore/plans/commissions/triggered-commissions-ui.md`
- `.lore/plans/ui/triggered-commission-creation-ux.md`

---

## Phase 1: Foundation (Config, Types, Source Provenance, File Scaffolding)

Everything else depends on these primitives. Config schema, the `source` field on commissions, and the heartbeat file template.

### Step 1: Config Schema and Types

**Addresses**: REQ-HBT-28, REQ-HBT-28a, REQ-HBT-29

**Files modified**:
- `lib/types.ts`: Add `heartbeatIntervalMinutes?: number` and `heartbeatBackoffMinutes?: number` to `AppConfig` interface. Add `heartbeat?: string` to `SystemModels` interface.
- `lib/config.ts`: Add `heartbeatIntervalMinutes: z.number().int().min(5).optional()` and `heartbeatBackoffMinutes: z.number().int().min(60).optional()` to `appConfigSchema`. Add `heartbeat: z.string().min(1).optional()` to `systemModelsSchema`.

**Testing**: Unit tests for config validation (accepts valid interval, rejects < 5, defaults to undefined when omitted). Test that backoff defaults to 300 minutes, accepts values ≥ 60, and rejects values < 60. Test that systemModels.heartbeat parses correctly.

### Step 2: Commission Source Provenance

**Addresses**: REQ-HBT-21, REQ-HBT-22, REQ-HBT-24, REQ-HBT-45

**Files modified**:
- `daemon/services/commission/orchestrator.ts`: Add `source?: { description: string }` to the `createCommission` options type. When present, write a `source:` block in the commission's YAML frontmatter. Add `"Commission created ({source description})"` to the activity_timeline entry. Do NOT remove `sourceSchedule`/`sourceTrigger` yet (that's Phase 7).
- `daemon/services/commission/record.ts`: Add `CommissionSource` interface (`{ description: string }`). Add `readSource(artifactPath: string): Promise<CommissionSource | null>` to `CommissionRecordOps` interface and implementation. Reads the `source` YAML block from frontmatter.

**Testing**: Roundtrip test: create commission with `source` option, read artifact, verify `source.description` matches. Test `readSource` returns null for commissions without source. Test timeline entry includes source description.

### Step 3: Heartbeat File Scaffolding

**Addresses**: REQ-HBT-1, REQ-HBT-2, REQ-HBT-25, REQ-HBT-26

**Files created**:
- `daemon/services/heartbeat/heartbeat-file.ts`: Module containing the template content (instructional header + section headings), `ensureHeartbeatFile(projectPath)` function (creates file if missing), and `repairHeartbeatHeader(projectPath)` function (replaces everything before first `##` with template header, preserving section content). Also exports helper functions used later: `readHeartbeatFile(path)`, `hasContentBelowHeader(content)`, `clearRecentActivity(path)`, `appendToSection(path, section, entry)`.

**Files modified**:
- `daemon/app.ts`: In the integration worktree setup loop (the per-project iteration in `createProductionApp()` that reads configs and sets up worktrees), call `ensureHeartbeatFile` for each project's integration worktree path.

**Testing**: Create file where none exists, verify template content. Create file with corrupted header + section content, verify header is repaired and section content preserved. Verify `hasContentBelowHeader` returns false for template-only files. Test `appendToSection` adds list items under correct heading. Test `appendToSection` creates section if missing (placed before `## Recent Activity`).

**Worker**: Dalton (Opus)
**Risk**: The "repair header" logic needs to handle edge cases: files with no `##` headings at all, files where users added content before the first `##`. The spec says "replaces everything before the first `##`" which is clear, but test both cases.

---

## Phase 2: Heartbeat Service Core (Daemon Loop + GM Session)

The central mechanism. Depends on Phase 1 for config, source provenance, and file operations.

### Step 1: Heartbeat Loop

**Addresses**: REQ-HBT-3, REQ-HBT-4, REQ-HBT-5, REQ-HBT-6, REQ-HBT-6a, REQ-HBT-7, REQ-HBT-20

**Files created**:
- `daemon/services/heartbeat/index.ts`: The `HeartbeatService` with `start()`/`stop()` lifecycle. Follows the `briefing-refresh.ts` post-completion pattern. Iterates registered projects sequentially. For each project: reads heartbeat file, checks for content below header, runs GM session (Step 2), clears Recent Activity on success. Two error paths: (1) non-rate-limit errors: log at warn, skip project, preserve activity, continue to next project; (2) rate-limit errors: abort the loop immediately, preserve activity for all remaining (unevaluated) projects, and schedule the next tick after the configured backoff duration (`heartbeatBackoffMinutes`, default 300 minutes) rather than the normal interval. Starts after briefing refresh, first tick after configured interval (no catch-up). Exports `tickProject(projectName)` for the manual tick route (Phase 5).

**Testing**: Mock SDK session. Verify loop iterates all projects. Verify empty files are skipped (no session started). Verify activity cleared after successful tick. Verify activity preserved after non-rate-limit error (loop continues to next project). Verify rate-limit error on project 2 of 3 stops the loop, preserves activity for project 2 and 3, and schedules next tick at backoff interval (not normal interval). Verify next tick is scheduled after all projects complete (post-completion, not fixed interval). Verify `commissionsCreatedLastTick` count is tracked per project (consumed by Phase 5's `/status` route).

### Step 2: Heartbeat GM Session

**Addresses**: REQ-HBT-8, REQ-HBT-9, REQ-HBT-10, REQ-HBT-11, REQ-HBT-23

**Files created**:
- `daemon/services/heartbeat/session.ts`: Builds and runs the GM session. Uses `prepareSdkSession` + `runSdkSession`. Model from `systemModels.heartbeat` (default `"haiku"`). System prompt constrains GM to dispatcher mode (per REQ-HBT-9 behavioral rules). Tool set: strip system toolboxes (same approach as `makeBriefingResolveToolSet`), provide manager coordination tools (`create_commission`, `dispatch_commission`, `initiate_meeting`) plus read-only tools (`read_memory`, `project_briefing`). User prompt: heartbeat file content. `maxTurns: 30`. `contextId: "heartbeat-{projectName}-{tickTimestamp}"`.

**Note on `initiate_meeting`**: Despite the spec's phrasing about "meeting write dependencies," `initiate_meeting` in `daemon/services/manager/toolbox.ts` writes a meeting request artifact file using `deps.guildHallHome` and `deps.getProjectConfig`. It does not call into a meeting orchestrator. This is simpler than it sounds: the heartbeat service just needs the standard `ManagerToolboxDeps` fields.

**Testing**: Mock SDK. Verify session is started with correct model, system prompt, tool set, maxTurns, and contextId. Verify heartbeat file content is passed as user prompt. Verify commission creation uses `source` option (Phase 1) with description identifying the standing order.

### Step 3: Production Wiring

**Addresses**: REQ-HBT-49

**Files modified**:
- `daemon/app.ts`: Wire `HeartbeatService` in `createProductionApp()`. Construct after briefing refresh, before outcome triage. Pass: SDK `queryFn` and `prepDeps`, discovered packages, `AppConfig`, `guildHallHome`, `EventBus`, `CommissionSessionForRoutes`, meeting write dependencies, `Log`. Call `heartbeatService.start()` in startup sequence, `heartbeatService.stop()` in shutdown.

**Testing**: Verify service is constructed and started in the production app. Integration-level: daemon starts without errors when heartbeat config is present.

**Worker**: Dalton (Opus)
**Risk**: The wiring needs to provide the heartbeat session with the same `ManagerToolboxDeps` fields that the manager toolbox uses. Since `initiate_meeting` writes a file (not a service call), this is simpler than it appears. The main integration concern is threading `CommissionSessionForRoutes` for `create_commission` and `dispatch_commission`.

---

## Phase 3: Event Condensation

The EventBus subscriber that feeds activity context to the heartbeat. Depends on Phase 1 (file operations) but can be built and tested independently of Phase 2.

### Step 1: Condensation Subscriber

**Addresses**: REQ-HBT-14, REQ-HBT-15, REQ-HBT-16, REQ-HBT-17, REQ-HBT-18, REQ-HBT-19, REQ-HBT-50

**Files created**:
- `daemon/services/heartbeat/condensation.ts`: EventBus subscriber. Filters to event types that produce activity lines: `commission_status` (terminal only: completed, failed, cancelled, abandoned), `commission_result`, `meeting_ended`. Formats each as a timestamp-prefixed markdown list item (`- HH:MM {summary}`). Writes to integration worktree's `heartbeat.md` under `## Recent Activity`. Scopes by `projectName` from event data; for events without `projectName` (like `meeting_ended`), looks up project via meeting/commission ID in state files. Drops events where project can't be determined. Serializes writes per project (queue or mutex) to prevent concurrent append corruption.

**Files modified**:
- `daemon/services/heartbeat/index.ts`: The `HeartbeatService` constructor registers the condensation subscriber on the EventBus (REQ-HBT-50: service owns both loop and condensation).

**Testing**: Emit `commission_status` (completed) event, verify summary line in Recent Activity. Emit `commission_result`, verify truncated summary (200 char limit). Emit `meeting_ended`, verify summary. Emit non-terminal `commission_status` (in_progress), verify no line written. Emit event for wrong project, verify not written to other project's file. Verify timestamp format (HH:MM). Verify concurrent events don't corrupt the file (serialization test).

**Worker**: Dalton (Opus)
**Risk**: The per-project write serialization is important. Rapid event sequences (e.g., multiple commissions completing at once) could race on file appends. Use a `Map<string, Promise<void>>` promise chain: each append awaits the previous promise for that project before writing, then stores its own promise. Five lines, no external dependencies.

---

## Phase 4: Worker Heartbeat Entry Tool

Lets any worker add entries to `heartbeat.md` during sessions. Depends on Phase 1 (file operations).

### Step 1: add_heartbeat_entry Tool

**Addresses**: REQ-HBT-12, REQ-HBT-13

**Files modified**:
- `daemon/services/base-toolbox.ts`: Add `add_heartbeat_entry` tool to the base toolbox (shared across all workers). Parameters: `prompt` (string, the entry text), `section` (string, one of `"Standing Orders"`, `"Watch Items"`, `"Context Notes"`). Implementation derives the integration worktree path from `deps.guildHallHome` + `deps.projectName` (e.g., `path.join(guildHallHome, "projects", projectName)`), then calls `appendToSection` from `heartbeat-file.ts` on the heartbeat file at that path.

**Testing**: Call tool with each section name, verify entry appears as `- ` prefixed list item under correct heading. Call with section that doesn't exist, verify section is created. Verify tool is available to all workers (not restricted to manager).

**Worker**: Dalton (Sonnet)
**Risk**: Low complexity. The main thing to verify is that the tool writes to the integration worktree, not the activity worktree. Workers operate in activity worktrees during commissions, but the heartbeat file lives in the integration worktree.

---

## Phase 5: Daemon Routes and Dashboard UI

The HTTP surface and dashboard integration. Depends on Phase 2 (heartbeat service core).

### Step 1: Heartbeat Routes

**Addresses**: REQ-HBT-30, REQ-HBT-31

**Files created**:
- `daemon/routes/heartbeat.ts`: DI factory `createHeartbeatRoutes(deps)`. Two routes:
  - `POST /heartbeat/:projectName/tick`: Calls `heartbeatService.tickProject(projectName)`. Returns `{ triggered: true }` on success, `{ error: "..." }` on failure.
  - `GET /heartbeat/:projectName/status`: Returns `{ hasContent, standingOrderCount, lastTick, commissionsCreatedLastTick, intervalMinutes }`. Last-tick state is in-memory (acceptable, lost on restart).

**Files modified**:
- `daemon/app.ts`: Mount heartbeat routes. Wire deps.

**Testing**: POST /tick triggers evaluation, returns success. POST /tick for nonexistent project returns error. GET /status returns correct standing order count (count `- ` lines under `## Standing Orders`). GET /status reflects last tick timestamp after a tick.

### Step 2: Dashboard [Tick Now] Button

**Addresses**: REQ-HBT-27

**Files modified**:
- `web/app/page.tsx` (or the project row component): Add `[Tick Now]` button alongside existing project actions. Button calls `POST /heartbeat/{projectName}/tick` via the daemon API proxy. Disabled while tick is in progress (optimistic UI). Shows standing order count indicator (fetched from `GET /heartbeat/{projectName}/status`). No indicator when count is zero.
- `web/app/api/heartbeat/[projectName]/tick/route.ts`: API proxy route to daemon.
- `web/app/api/heartbeat/[projectName]/status/route.ts`: API proxy route to daemon.

**Testing**: Verify button renders. Verify button disabled state during tick. Verify standing order count displays correctly. Verify zero count hides indicator.

**Worker**: Dalton (Opus for routes, Sonnet for UI)
**Risk**: The dashboard project row component structure needs checking at implementation time. The spec says "project row" but the exact component varies. The implementer should read the current dashboard layout before adding the button.

---

## Phase 6: Removal of Standalone Files

Delete scheduler files, trigger files, and their UI components. These are complete file deletions with no salvageable code. Depends on Phases 1-5 being complete and tested (the heartbeat must be working before we remove what it replaces).

### Step 1: Remove Scheduler Files

**Addresses**: REQ-HBT-32 (partial)

**Files removed**:
- `daemon/services/scheduler/index.ts`
- `daemon/services/scheduler/cron.ts`
- `daemon/services/scheduler/schedule-lifecycle.ts`
- `web/app/api/commissions/[commissionId]/schedule-status/route.ts`

(The spec also lists 3 test files, but they don't exist in the repo. No action needed.)

After removal, delete the `daemon/services/scheduler/` directory.

### Step 2: Remove Trigger Files

**Addresses**: REQ-HBT-33 (partial)

**Files removed**:
- `daemon/services/trigger-evaluator.ts`
- `daemon/services/commission/trigger-lifecycle.ts`
- `web/app/api/commissions/[commissionId]/trigger-status/route.ts`

(The spec also lists 3 test files, but they don't exist in the repo. No action needed.)

### Step 3: Remove Schedule/Trigger UI Components

**Addresses**: REQ-HBT-32 (UI portion), REQ-HBT-33 (UI portion), REQ-HBT-41, REQ-HBT-41b

**Files removed**:
- `web/components/commission/CommissionScheduleInfo.tsx`
- `web/components/commission/CommissionScheduleInfo.module.css`
- `web/components/commission/CommissionScheduleActions.tsx`
- `web/components/commission/CommissionScheduleActions.module.css`
- `web/components/commission/TriggerInfo.tsx`
- `web/components/commission/TriggerInfo.module.css`
- `web/components/commission/TriggerActions.tsx`
- `web/components/commission/TriggerActions.module.css`
- `web/components/commission/trigger-form-data.ts`

**Files modified** (remove references to deleted components):
- `web/components/commission/CommissionView.tsx`: Remove imports of `CommissionScheduleInfo`, `CommissionScheduleActions`, `TriggerInfo`, `TriggerActions`. Remove `ScheduleInfo` and `TriggerInfoData` interfaces. Remove conditional rendering blocks for schedule/trigger panels.
- `web/components/commission/CommissionList.tsx`: Remove "Recurring" and "Trigger" labels, remove `source_schedule` and `triggered_by` link rendering.
- `web/components/commission/CommissionHeader.tsx`: Remove schedule/trigger-specific header content (cron display, trigger status).
- `web/components/commission/CommissionForm.tsx` and `CommissionForm.module.css`: Remove schedule/trigger creation tabs and form fields.
- `web/app/projects/[name]/commissions/[id]/page.tsx`: Remove `scheduleInfo` and `triggerInfo` build blocks. Remove conditional rendering that passes these to deleted components. Optionally add display of `source.description` if commission has one.

**Testing**: `bun typecheck` passes. `bun test` passes. Visual check: commission detail page renders without schedule/trigger panels. Commission form has only one-shot creation (no tabs).

**Worker**: Dalton (Opus)
**Risk**: The web component modifications are the messiest part of the removal. Each component has its own interface for schedule/trigger data. Work through them methodically: delete the standalone files first, then fix each importing file's compilation errors. Do not try to do this across multiple commissions; it's one atomic unit.

---

## Phase 7: Shared Infrastructure Cleanup

Remove schedule/trigger types, record operations, orchestrator methods, toolbox tools, route handlers, event types, and commission parsing. This is the surgical removal from shared files. Depends on Phase 6 (standalone files already deleted, so broken imports surface immediately).

### Step 1: Type and Service Cleanup

**Addresses**: REQ-HBT-34, REQ-HBT-35, REQ-HBT-36, REQ-HBT-38, REQ-HBT-39, REQ-HBT-40, REQ-HBT-41a, REQ-HBT-42, REQ-HBT-43

**Files modified**:
- `daemon/types.ts`: Remove `CommissionType` union, `TriggeredBy` interface, `TriggerBlock` interface, `ScheduledCommissionStatus` type.
- `daemon/services/commission/record.ts`: Remove `ScheduleMetadata` interface, `readScheduleMetadata`, `writeScheduleFields`, `readTriggerMetadata`, `writeTriggerFields`, `readTriggeredBy`, `readType`. Remove imports of `TriggerBlock`, `TriggeredBy` from daemon/types.
- `daemon/services/commission/orchestrator.ts`: Remove `createScheduledCommission` method and YAML template. Remove `createTriggeredCommission` method and YAML template. Remove `sourceSchedule` and `sourceTrigger` from createCommission options. Remove `sourceScheduleLine` and `triggeredByBlock` construction. Remove import of `isValidCron`. Remove import of `TRIGGER_STATUS_TRANSITIONS`. Remove `scheduleLifecycleRef` and `triggerEvaluatorRef` from deps. Remove `updateScheduleStatus` and `updateTriggerStatus` from `CommissionSessionForRoutes`.
- `daemon/services/manager/toolbox.ts`: Remove `create_scheduled_commission`, `update_schedule`, `create_triggered_commission`, `update_trigger` tool handlers and schemas. Also remove the `scheduleLifecycle?: ScheduleLifecycle` and `triggerEvaluator?: TriggerEvaluator` optional fields from `ManagerToolboxDeps` (lines 106-107), as their only consumers are the removed handlers.
- `daemon/routes/commissions.ts`: Remove `POST /commission/schedule/commission/update` route. Remove `POST /commission/trigger/commission/update` route. Remove schedule info parsing. Remove trigger info parsing. Remove import of `nextOccurrence`. Remove `type === "scheduled"` and `type === "triggered"` branches in POST handler.
- `daemon/lib/event-bus.ts`: Remove `schedule_spawned` from `SystemEvent` union.
- `lib/types.ts`: Remove `schedule_spawned` from `SYSTEM_EVENT_TYPES`. Remove `scheduleId` from `OperationContext` if present.
- `lib/commissions.ts`: Remove `sourceSchedule` and `sourceTrigger` fields from `CommissionMeta`. Remove `extractSourceTrigger` function. Remove parsing of `source_schedule` and `triggered_by` frontmatter. Add `source: { description: string } | null` field and parse from `source` frontmatter.
- `package.json`: Remove `croner` dependency.

**Testing**: `bun typecheck` must pass (this is the primary gate). `bun test` must pass. Any test that referenced removed types or functions needs updating or removal. Run the full test suite.

### Step 2: App Wiring Cleanup

**Addresses**: REQ-HBT-37

**Files modified**:
- `daemon/app.ts`: Remove `scheduleLifecycleRef` and its wiring. Remove `triggerEvaluatorRef` and its wiring. Remove dynamic imports of `scheduler/schedule-lifecycle`, `scheduler/index`, `trigger-evaluator`. Remove `scheduler.catchUp()`, `scheduler.start()`, `scheduler.stop()` calls. Remove `triggerEvaluator.initialize()`, `triggerEvaluator.shutdown()` calls.

**Testing**: Daemon starts cleanly. No scheduler/trigger references in startup logs.

**Worker**: Dalton (Opus)
**Risk**: This phase touches the most files and has the highest chance of cascading type errors. The key is to work methodically: remove types first, then fix every compilation error before running tests. The `bun typecheck` gate catches everything. Do not split this phase across multiple commissions. It's one atomic operation because partially-removed types leave the codebase in a broken state.

---

## Phase 8: Spec Retirement and Migration Guide

Housekeeping. Move superseded specs, document migration for existing users.

### Step 1: Retire Superseded Specs

**Addresses**: REQ-HBT-48

**Files moved**:
- `.lore/specs/commissions/guild-hall-scheduled-commissions.md` → `.lore/specs/_abandoned/guild-hall-scheduled-commissions.md` (update status to `superseded`)
- `.lore/specs/commissions/triggered-commissions.md` → `.lore/specs/_abandoned/triggered-commissions.md` (update status to `superseded`)
- `.lore/specs/ui/triggered-commission-creation-ux.md` → `.lore/specs/_abandoned/triggered-commission-creation-ux.md` (update status to `superseded`)

Add a note to each file's frontmatter: `superseded_by: .lore/specs/heartbeat-commission-dispatch.md`

**Worker**: Octavia (this is documentation work)

---

## Review Checkpoints

1. **After Phase 2** (heartbeat service core): Thorne review. The GM session wiring, tool set construction, and system prompt are the most critical pieces. A review here catches tool access issues before building on top of them.

2. **After Phase 6 + 7** (all removal complete): Thorne review. The removal touches ~25 files across daemon, lib, and web. A fresh-context review verifies nothing was missed and no dead code lingers.

## Phase Dependencies

```
Phase 1 (Foundation)
  ├── Phase 2 (Heartbeat Core) ← depends on Phase 1
  │     └── Phase 5 (Routes + UI) ← depends on Phase 2
  ├── Phase 3 (Event Condensation) ← depends on Phase 1
  └── Phase 4 (Worker Entry Tool) ← depends on Phase 1

Phase 6 (File Removal) ← depends on Phases 1-5 ALL complete
  └── Phase 7 (Shared Cleanup) ← depends on Phase 6

Phase 8 (Spec Retirement) ← depends on Phase 7
```

Phases 2, 3, and 4 can run in parallel after Phase 1 completes. Phase 5 requires Phase 2. Phases 6 and 7 are strictly sequential and require everything before them. Phase 8 is last.

## Estimated Commission Count

| Phase | Commissions | Worker | Model |
|-------|-------------|--------|-------|
| 1: Foundation | 1 (all three steps together) | Dalton | Opus |
| 2: Heartbeat Core | 1 (loop + session + wiring) | Dalton | Opus |
| 2: Review | 1 | Thorne | Opus |
| 3: Event Condensation | 1 | Dalton | Opus |
| 4: Worker Entry Tool | 1 | Dalton | Sonnet |
| 5: Routes | 1 | Dalton | Opus |
| 5: Dashboard UI | 1 | Dalton | Sonnet |
| 6+7: Removal (combined) | 2 (files + shared cleanup) | Dalton | Opus |
| 6+7: Review | 1 | Thorne | Opus |
| 8: Spec Retirement | 1 | Octavia | Sonnet |

**Total: 11 commissions** (8 implementation, 2 review, 1 documentation)

Phases 6 and 7 could be combined into a single commission if the implementer is disciplined about order (delete standalone files first, then clean shared files). This reduces to 10 commissions. They could also be three separate commissions (file removal, shared cleanup, app wiring) if the blast radius feels too large. Use judgment at dispatch time.

## Migration Guide

After all phases are complete, the user needs to:

1. **Convert active schedules to standing orders.** Open existing commission artifacts with `type: scheduled` and `status: active`. For each, read the prompt and cron expression, then write an equivalent standing order in `.lore/heartbeat.md`:
   - `cron: "0 9 * * 1"` with prompt "Review open issues" → Standing order: `- Review open issues every Monday`

2. **Convert active triggers to standing orders.** Open existing commission artifacts with `type: triggered` and `status: active`. For each, read the match rule and prompt, then write an equivalent standing order:
   - Match `commission_status` where `commissionId: "commission-Dalton-*"` and `status: completed` → Standing order: `- After any Dalton commission completes, dispatch a Thorne review`

3. **Verify heartbeat is working.** After adding standing orders, click `[Tick Now]` on the dashboard for the project. Check that the GM session evaluates the orders and creates appropriate commissions.

4. **Clean up historical artifacts.** Existing commission artifacts with `type: scheduled` or `type: triggered` remain in place. The `type` field is harmless (ignored by gray-matter). If the user wants to clean them up, they can remove or edit the `type` field manually. A future `tend` sweep could flag these.

## Open Questions

1. **Standing order count indicator component.** REQ-HBT-27 describes a count indicator on the `[Tick Now]` button. The spec doesn't specify what "small indicator" means visually. The implementer should match existing badge/count patterns in the dashboard (e.g., how commission counts are shown). If no precedent exists, a simple parenthetical like `[Tick Now] (3)` is sufficient.

2. **Source display on commission detail.** REQ-HBT-41b says "optionally add display of `source.description`." This is a minor UI addition. The implementer should add it during Phase 6 Step 3 (when modifying the commission detail page anyway) rather than deferring it.
