---
title: "Plan: Mail System Removal"
date: 2026-03-20
status: executed
tags: [email, removal, cleanup, architecture]
modules: [mail, commission-orchestrator, toolbox-resolver, context-type-registry, lifecycle, capacity, event-bus, config]
related:
  - .lore/brainstorm/worker-sub-agents-and-mail-removal.md
  - .lore/specs/workers/worker-communication.md
  - .lore/specs/workers/guild-hall-mail-reader-toolbox.md
  - .lore/plans/workers/worker-communication.md
  - .lore/plans/workers/guild-hall-mail-reader-toolbox.md
---

# Plan: Mail System Removal

## Goal

Remove the mail system entirely. No commission has ever used `send_mail`. The system adds dead code, a `sleeping` commission status, mail-specific fields in the toolbox resolver, capacity management, event types, and config schema pollution. Every change in this plan is a deletion or simplification. No new code is introduced.

Source: `.lore/brainstorm/worker-sub-agents-and-mail-removal.md`, Proposal 1.

## Codebase Context

**Mail service** (`daemon/services/mail/`): Four files (orchestrator.ts, toolbox.ts, record.ts, types.ts). The orchestrator handles sleep/wake flows, reader activation, capacity management, and daemon restart recovery. The toolbox provides the `reply` tool for mail readers. The record module handles mail file I/O. Total: ~500 lines of implementation.

**Commission orchestrator** (`daemon/services/commission/orchestrator.ts`): Imports `createMailOrchestrator` and `SleepingCommissionState`. Uses the mail orchestrator for: sleep handling on `commission_mail_sent` events (lines 2104-2178), sleeping commission recovery during startup (lines 1187-1248), `cancelSleepingCommission` helper for cancel/abandon flows (lines 860-935), and shutdown (line 2848). The cancel flow (line 2624) and abandon flow (line 2694) both branch on `sleeping` status.

**Commission toolbox** (`daemon/services/commission/toolbox.ts`): Exports `send_mail` tool, `makeSendMailHandler`, `SessionState.mailSent` flag, `SessionCallbacks.onMailSent` callback, and `MailRecordOps` import. The `submit_result` handler checks `sessionState.mailSent` for mutual exclusion.

**Commission lifecycle** (`daemon/services/commission/lifecycle.ts`): `TRANSITIONS` table includes `sleeping` as both a source and target state. `in_progress` can transition to `sleeping`; `sleeping` can transition to `in_progress`, `cancelled`, `abandoned`, `failed`.

**Commission capacity** (`daemon/services/commission/capacity.ts`): `isMailReaderAtCapacity()` and `DEFAULT_MAIL_READER_CAP` (lines 59-69).

**Context type registry** (`daemon/services/context-type-registry.ts`): Registers `"mail"` context type with `mailToolboxFactory` (lines 20-24). `ContextTypeName` union includes `"mail"`.

**Toolbox types** (`daemon/services/toolbox-types.ts`): `GuildHallToolboxDeps` has `mailFilePath?` and `commissionId?` fields (lines 26-27).

**Toolbox resolver** (`daemon/services/toolbox-resolver.ts`): `ToolboxResolverContext` has `mailFilePath?` and `commissionId?` fields (lines 41-43). These are passed through to `GuildHallToolboxDeps` (lines 98-99).

**SDK runner** (`daemon/lib/agent-sdk/sdk-runner.ts`): `SessionPrepSpec` has `mailFilePath?` and `commissionId?` (lines 100-103). `SessionPrepDeps.resolveToolSet` context parameter includes them (lines 119-120). Both are passed to the toolbox resolver at lines 347-348.

**Event bus** (`daemon/lib/event-bus.ts`): `SystemEvent` union includes `commission_mail_sent` and `mail_reply_received` variants (lines 22-23).

**Shared types** (`lib/types.ts`): `AppConfig.maxConcurrentMailReaders?` (line 41). `ActivationContext.mailContext?` (line 281). `SYSTEM_EVENT_TYPES` includes `"commission_mail_sent"` and `"mail_reply_received"` (lines 365-366).

**Config schema** (`lib/config.ts`): `appConfigSchema` includes `maxConcurrentMailReaders` (line 129).

**Commission sorting** (`lib/commissions.ts`): `STATUS_GROUP` maps `sleeping` to group 1 (line 256). `extractRelevantDate` maps `sleeping` to `status_sleeping` (line 304).

**Manager context** (`daemon/services/manager/context.ts`): `buildCommissionSection` filters for `sleeping` as active (line 150).

**Manager toolbox** (`daemon/services/manager/toolbox.ts`): `SUMMARY_GROUP` maps `sleeping` to `"active"` (line 1061).

**Scheduler** (`daemon/services/scheduler/index.ts`): `isSpawnedCommissionActive` treats `sleeping` as active (line 519).

**Commission filter** (`web/components/commission/commission-filter.ts`): `DEFAULT_STATUSES` includes `"sleeping"` (line 9). `FILTER_GROUPS` Active group includes `"sleeping"` (line 19).

**Base toolbox** (`daemon/services/base-toolbox.ts`): `list_guild_capabilities` tool description mentions `send_mail` (line 441).

**Worker packages**: `packages/guild-hall-steward/posture.md` (line 81) and `packages/guild-hall-illuminator/posture.md` (line 64) reference `send_mail` in their posture text.

**Daemon types** (`daemon/types.ts`): `CommissionStatus` union includes `"sleeping"` (line 44).

## Scope of Deletion

### Files to delete entirely

| File | Reason |
|------|--------|
| `daemon/services/mail/orchestrator.ts` | Mail orchestration |
| `daemon/services/mail/toolbox.ts` | Mail reader toolbox (reply tool) |
| `daemon/services/mail/record.ts` | Mail file I/O |
| `daemon/services/mail/types.ts` | Mail types (PendingMail, SleepingCommissionState, etc.) |
| `tests/daemon/services/mail/orchestrator.test.ts` | Mail orchestrator tests (~124K) |
| `tests/daemon/services/mail/record.test.ts` | Mail record tests |
| `tests/daemon/services/mail/toolbox.test.ts` | Mail toolbox tests |
| `.lore/specs/workers/worker-communication.md` | Mail spec (archive, status: removed) |
| `.lore/specs/workers/guild-hall-mail-reader-toolbox.md` | Mail reader toolbox spec (archive, status: removed) |
| `.lore/plans/workers/worker-communication.md` | Mail implementation plan (archive, status: removed) |
| `.lore/plans/workers/guild-hall-mail-reader-toolbox.md` | Mail reader toolbox plan (archive, status: removed) |

### Files requiring surgical edits

**Daemon core types and config:**

| File | Change |
|------|--------|
| `daemon/types.ts:44` | Remove `"sleeping"` from `CommissionStatus` |
| `lib/types.ts:41` | Remove `maxConcurrentMailReaders?` from `AppConfig` |
| `lib/types.ts:281-285` | Remove `mailContext?` from `ActivationContext` |
| `lib/types.ts:365-366` | Remove `"commission_mail_sent"` and `"mail_reply_received"` from `SYSTEM_EVENT_TYPES` |
| `lib/config.ts:129` | Remove `maxConcurrentMailReaders` from `appConfigSchema` |

**Event bus:**

| File | Change |
|------|--------|
| `daemon/lib/event-bus.ts:22-23` | Remove `commission_mail_sent` and `mail_reply_received` from `SystemEvent` union |

**Context type registry:**

| File | Change |
|------|--------|
| `daemon/services/context-type-registry.ts:4` | Remove `mailToolboxFactory` import |
| `daemon/services/context-type-registry.ts:6` | Remove `"mail"` from `ContextTypeName` |
| `daemon/services/context-type-registry.ts:20-24` | Remove `"mail"` registration block |

**Toolbox types and resolver:**

| File | Change |
|------|--------|
| `daemon/services/toolbox-types.ts:26-27` | Remove `mailFilePath?` and `commissionId?` from `GuildHallToolboxDeps` |
| `daemon/services/toolbox-resolver.ts:40-43` | Remove `mailFilePath?` and `commissionId?` (and their comments) from `ToolboxResolverContext` |
| `daemon/services/toolbox-resolver.ts:98-99` | Remove `mailFilePath` and `commissionId` from deps object construction |

**Worker activation:**

| File | Change |
|------|--------|
| `packages/shared/worker-activation.ts:36-52` | Remove the `if (context.mailContext) { ... }` block from `buildSystemPrompt` |

**SDK runner:**

| File | Change |
|------|--------|
| `daemon/lib/agent-sdk/sdk-runner.ts:100-103` | Remove `mailFilePath?` and `commissionId?` from `SessionPrepSpec` |
| `daemon/lib/agent-sdk/sdk-runner.ts:119-120` | Remove from `SessionPrepDeps.resolveToolSet` context parameter |
| `daemon/lib/agent-sdk/sdk-runner.ts:347-348` | Remove from toolbox resolver call site |

**Commission toolbox:**

| File | Change |
|------|--------|
| `daemon/services/commission/toolbox.ts:7` | Update module doc: remove `send_mail` from tool list, remove mutual exclusion note |
| `daemon/services/commission/toolbox.ts:30-31` | Remove `createMailRecordOps` and `MailRecordOps` imports |
| `daemon/services/commission/toolbox.ts:44` | Remove `onMailSent?` from `SessionCallbacks` |
| `daemon/services/commission/toolbox.ts:51-54` | Simplify `SessionState`: remove `mailSent`, keep only `resultSubmitted` (or inline the boolean) |
| `daemon/services/commission/toolbox.ts:72-73,79` | Remove `mailRecordOps` from `ToolboxResources` and its creation |
| `daemon/services/commission/toolbox.ts:117,139-149` | Remove `mailSent` check from `makeSubmitResultHandler` |
| `daemon/services/commission/toolbox.ts:182-253` | Delete `makeSendMailHandler` entirely |
| `daemon/services/commission/toolbox.ts:271,275` | Remove `sessionState.mailSent` init and `sendMail` handler creation |
| `daemon/services/commission/toolbox.ts:297-306` | Remove `send_mail` tool registration |
| `daemon/services/commission/toolbox.ts:334-341` | Remove `onMailSent` callback from `commissionToolboxFactory` |

**Commission orchestrator:**

| File | Change |
|------|--------|
| `daemon/services/commission/orchestrator.ts:84-85` | Remove `createMailOrchestrator` and `MailOrchestrator` imports |
| `daemon/services/commission/orchestrator.ts:86` | Remove `SleepingCommissionState` import |
| `daemon/services/commission/orchestrator.ts:189-191` | Remove `mailOrchestrator` from deps interface |
| `daemon/services/commission/orchestrator.ts:239-241` | Remove `mailOrchestrator` variable declaration |
| `daemon/services/commission/orchestrator.ts:365-377` | Remove mail orchestrator creation |
| `daemon/services/commission/orchestrator.ts:860-935` | Delete `cancelSleepingCommission` helper entirely |
| `daemon/services/commission/orchestrator.ts:1187-1248` | Remove sleeping commission recovery block from startup |
| `daemon/services/commission/orchestrator.ts:2104-2178` | Remove `commission_mail_sent` event handler and sleep flow from session completion |
| `daemon/services/commission/orchestrator.ts:2624-2625` | Remove `sleeping` branch from cancel flow |
| `daemon/services/commission/orchestrator.ts:2694-2695` | Remove `sleeping` branch from abandon flow |
| `daemon/services/commission/orchestrator.ts:2848` | Remove `mailOrchestrator.shutdownReaders()` from shutdown |

**Commission lifecycle:**

| File | Change |
|------|--------|
| `daemon/services/commission/lifecycle.ts:53` | Remove `"sleeping"` from `in_progress` transitions |
| `daemon/services/commission/lifecycle.ts:54` | Delete the `sleeping` entry from `TRANSITIONS` table |

**Commission capacity:**

| File | Change |
|------|--------|
| `daemon/services/commission/capacity.ts:59-69` | Delete `DEFAULT_MAIL_READER_CAP` and `isMailReaderAtCapacity` |

**Commission sorting and helpers:**

| File | Change |
|------|--------|
| `lib/commissions.ts:256` | Remove `sleeping: 1` from `STATUS_GROUP` |
| `lib/commissions.ts:304` | Remove `sleeping: "status_sleeping"` from `targetEvent` |

**Manager context and toolbox:**

| File | Change |
|------|--------|
| `daemon/services/manager/context.ts:150` | Remove `sleeping` from active commission filter |
| `daemon/services/manager/toolbox.ts:1061` | Remove `sleeping: "active"` from `SUMMARY_GROUP` |

**Scheduler:**

| File | Change |
|------|--------|
| `daemon/services/scheduler/index.ts:519` | Remove `sleeping` from `isSpawnedCommissionActive` check |

**Web components:**

| File | Change |
|------|--------|
| `web/components/commission/commission-filter.ts:9` | Remove `"sleeping"` from `DEFAULT_STATUSES` |
| `web/components/commission/commission-filter.ts:19` | Remove `"sleeping"` from Active filter group |

**Base toolbox:**

| File | Change |
|------|--------|
| `daemon/services/base-toolbox.ts:441` | Update `list_guild_capabilities` description: remove "via send_mail" reference. Change to something like "Use this to discover who can be consulted." |

**Worker packages:**

| File | Change |
|------|--------|
| `packages/guild-hall-steward/posture.md:81` | Remove the paragraph about sending mail to the Guild Master via `send_mail`. Replace with a simpler escalation instruction (e.g., "Document the finding and its qualification in your commission result.") |
| `packages/guild-hall-illuminator/posture.md:64` | Remove `send_mail` reference. Replace with equivalent guidance that doesn't reference mail. |

**CLAUDE.md:**

| File | Change |
|------|--------|
| `CLAUDE.md:28` | Remove "worker-to-worker mail" from "What exists" list |
| `CLAUDE.md:64` | Remove `mail/` row from daemon services table |
| `CLAUDE.md:67` | Remove mail-related entries from services table |
| `CLAUDE.md:114` | Remove "Worker mail" paragraph entirely |
| `CLAUDE.md:127-129` | Remove mail references from config description if applicable |

### Tests requiring surgical edits

| File | Change |
|------|--------|
| `tests/daemon/commission-toolbox.test.ts:445-607` | Delete `send_mail` tool tests and mutual exclusion tests. Keep `report_progress` and `submit_result` tests. Simplify `SessionState` usage in remaining tests. |
| `tests/daemon/services/commission/lifecycle.test.ts:825-906` | Delete sleeping state transition tests (sleep/wake/wake and sleeping-to-cancelled/abandoned/failed) |
| `tests/daemon/services/commission/capacity.test.ts:2,110-134` | Delete mail reader capacity tests and `isMailReaderAtCapacity` import |
| `tests/daemon/toolbox-resolver.test.ts:260-375` | Delete mail context toolbox resolution tests |
| `tests/daemon/services/sdk-runner.test.ts:570-589` | Delete `mailFilePath` and `commissionId` session parameter tests |
| `tests/packages/worker-activation.test.ts` | Delete mail context rendering test suites (the `describe("mail context rendering")` blocks). Note: this block appears duplicated in the test file. Delete both instances. |
| `tests/lib/types.test.ts:31` | Remove `sleeping` from status sorting test data (if it appears in test fixtures) |
| `tests/lib/commissions.test.ts:268-300` | Remove `sleeping` from commission sorting test data |
| `tests/components/commission-list.test.tsx:43` | Remove `sleeping` status from test fixture |
| `tests/packages/guild-hall-steward/integration.test.ts:216` | Update or remove the test that checks posture contains `send_mail` |

### Lore docs requiring surgical edits

These specs and plans mention mail in passing (a status list, a context type enumeration, or a related-docs link). Each needs its `sleeping` and `mail` references removed:

**Specs (update in place, not archive):**

| File | Nature of reference |
|------|-------------------|
| `.lore/specs/commissions/guild-hall-commissions.md` | `sleeping` in lifecycle, `send_mail` in toolbox, mail transitions |
| `.lore/specs/commissions/commission-halted-continuation.md` | `sleeping` in status lists |
| `.lore/specs/commissions/commission-status-tool.md` | `sleeping` in status mapping |
| `.lore/specs/commissions/guild-hall-scheduled-commissions.md` | `sleeping` in active status checks |
| `.lore/specs/workers/guild-hall-workers.md` | `mail` context type, `[STUB: worker-communication]` |
| `.lore/specs/workers/worker-tool-rules.md` | `send_mail` in tool lists |
| `.lore/specs/workers/guild-hall-steward-worker.md` | `send_mail` in posture/escalation |
| `.lore/specs/workers/guild-hall-visionary-worker.md` | `send_mail` if referenced |
| `.lore/specs/workers/art-director-worker.md` | `send_mail` if referenced |
| `.lore/specs/workers/guild-capabilities-discovery.md` | `send_mail` in capability description |
| `.lore/specs/infrastructure/context-type-registry.md` | `mail` context type registration |
| `.lore/specs/infrastructure/event-router.md` | `commission_mail_sent`, `mail_reply_received` event types |
| `.lore/specs/infrastructure/daemon-application-boundary.md` | Mail references in service listing |
| `.lore/specs/infrastructure/meeting-layer-separation.md` | Mail as comparison point |
| `.lore/specs/infrastructure/model-selection.md` | REQ-MODEL-12 describes mail reader model behavior. Remove the requirement. Rename "Meetings and Mail" section to "Meetings". Remove `maxConcurrentMailReaders` in config. |
| `.lore/specs/infrastructure/local-model-support.md` | `maxConcurrentMailReaders` in config |
| `.lore/specs/ui/commission-list-filtering.md` | `sleeping` in filter groups |
| `.lore/specs/ui/dashboard-selection-model.md` | `sleeping` in status lists |

**Plans (update in place):**

| File | Nature of reference |
|------|-------------------|
| `.lore/plans/commissions/commission-halted-continuation.md` | `sleeping` references |
| `.lore/plans/commissions/commission-status-gem-and-sort-fix.md` | `sleeping` in status groups |
| `.lore/plans/commissions/guild-hall-scheduled-commissions.md` | `sleeping` in active checks |
| `.lore/plans/workers/guild-capabilities-discovery.md` | `send_mail` in description |
| `.lore/plans/workers/steward-worker-mvp.md` | `send_mail` in posture |
| `.lore/plans/ui/commission-list-filtering.md` | `sleeping` in filter |
| `.lore/plans/infrastructure/daemon-application-boundary.md` | Mail in service listing |
| `.lore/plans/infrastructure/replicate-native-toolbox.md` | Mail references if present |

**Design docs:**

| File | Nature of reference |
|------|-------------------|
| `.lore/design/operation-contract.md` | Indirect (email/steward reference, not mail system) |

## Implementation Steps

### Phase 1: Delete mail service and tests

**Files**: Delete `daemon/services/mail/` (4 files) and `tests/daemon/services/mail/` (3 files).

No other file imports from `daemon/services/mail/` except:
- `daemon/services/commission/orchestrator.ts` (imports `createMailOrchestrator`, `MailOrchestrator`, `SleepingCommissionState`)
- `daemon/services/commission/toolbox.ts` (imports `createMailRecordOps`, `MailRecordOps`)
- `daemon/services/context-type-registry.ts` (imports `mailToolboxFactory`)

These three consumer files must be edited in the same phase to keep the build passing.

**Edits in commission orchestrator** (`daemon/services/commission/orchestrator.ts`):
1. Remove `createMailOrchestrator` and `MailOrchestrator` imports.
2. Remove `SleepingCommissionState` import.
3. Remove `mailOrchestrator` from deps type, local variable, and creation.
4. Remove `cancelSleepingCommission` helper function entirely.
5. Remove the sleeping commission recovery block from the startup/recovery function. When a state file has `status: "sleeping"`, transition it to `failed` with reason "Mail system removed. Commission was sleeping and cannot resume." This is the safe path: there are no sleeping commissions in production, but recovery code should not crash on orphaned state files.
6. Remove the `commission_mail_sent` event handler from the session completion flow. The `else if (event.type === "commission_mail_sent")` branch and the entire sleep-handling block get deleted.
7. Remove the `sleeping` branch from cancel and abandon flows. These become dead paths since nothing enters `sleeping`.
8. Remove `mailOrchestrator.shutdownReaders()` from the shutdown function.

**Edits in commission toolbox** (`daemon/services/commission/toolbox.ts`):
1. Remove `createMailRecordOps` and `MailRecordOps` imports.
2. Remove `onMailSent?` from `SessionCallbacks`.
3. Remove `mailSent` from `SessionState`. If `resultSubmitted` is the only remaining field, consider inlining it as a boolean rather than keeping the type.
4. Remove `mailRecordOps` from `ToolboxResources` and its creation in `createToolboxResources`.
5. Remove the `sessionState.mailSent` check from `makeSubmitResultHandler`.
6. Delete `makeSendMailHandler` entirely.
7. Remove `sendMail` from `createCommissionToolboxWithCallbacks`: the variable, the handler creation, and the `send_mail` tool registration.
8. Remove `onMailSent` callback from `commissionToolboxFactory`.
9. Update the module doc comment to reflect two tools, not three.

**Edits in context type registry** (`daemon/services/context-type-registry.ts`):
1. Remove `mailToolboxFactory` import.
2. Remove `"mail"` from `ContextTypeName` union.
3. Remove the `registry.set("mail", ...)` block.

**Verification**: `bun run typecheck && bun test` must pass. The deleted test files won't run; the edited source files must compile without the deleted imports.

### Phase 2: Remove sleeping status from types and lifecycle

**Files**: `daemon/types.ts`, `daemon/services/commission/lifecycle.ts`

**Edits in daemon/types.ts**:
1. Remove `"sleeping"` from `CommissionStatus` union.

**Edits in lifecycle.ts**:
1. Remove `"sleeping"` from the `in_progress` transition targets.
2. Delete the `sleeping` entry from `TRANSITIONS`.

**Edits in lifecycle tests** (`tests/daemon/services/commission/lifecycle.test.ts`):
1. Delete all sleeping transition tests (the block testing `in_progress -> sleeping`, `sleeping -> in_progress`, `sleeping -> cancelled`, `sleeping -> abandoned`, `sleeping -> failed`).

**Verification**: `bun run typecheck && bun test`. TypeScript will surface any remaining `"sleeping"` references via type narrowing failures.

### Phase 3: Remove mail fields from shared types and config

**Files**: `lib/types.ts`, `lib/config.ts`, `daemon/lib/event-bus.ts`, `daemon/services/toolbox-types.ts`, `daemon/services/toolbox-resolver.ts`, `daemon/lib/agent-sdk/sdk-runner.ts`, `daemon/services/commission/capacity.ts`, `packages/shared/worker-activation.ts`

**Edits in lib/types.ts**:
1. Remove `maxConcurrentMailReaders?` from `AppConfig`.
2. Remove `mailContext?` from `ActivationContext`.
3. Remove `"commission_mail_sent"` and `"mail_reply_received"` from `SYSTEM_EVENT_TYPES`.

**Edits in lib/config.ts**:
1. Remove `maxConcurrentMailReaders` from `appConfigSchema`.

**Edits in daemon/lib/event-bus.ts**:
1. Remove `commission_mail_sent` and `mail_reply_received` from `SystemEvent` union.

**Edits in daemon/services/toolbox-types.ts**:
1. Remove `mailFilePath?` and `commissionId?` from `GuildHallToolboxDeps`.

**Edits in daemon/services/toolbox-resolver.ts**:
1. Remove `mailFilePath?` and `commissionId?` from `ToolboxResolverContext`.
2. Remove their passthrough in the deps construction (lines 98-99).

**Edits in daemon/lib/agent-sdk/sdk-runner.ts**:
1. Remove `mailFilePath?` and `commissionId?` from `SessionPrepSpec`.
2. Remove them from the `SessionPrepDeps.resolveToolSet` context type.
3. Remove them from the call site that passes context to `resolveToolSet`.

**Edits in packages/shared/worker-activation.ts**:
1. Remove the `if (context.mailContext) { ... }` block from `buildSystemPrompt` (lines 36-52). This block renders the mail consultation prompt sections. Without it, the `mailContext` type removal in `lib/types.ts` would break the build.

**Edits in daemon/services/commission/capacity.ts**:
1. Delete `DEFAULT_MAIL_READER_CAP` and `isMailReaderAtCapacity`.

**Test edits** (surgical):
- `tests/daemon/services/commission/capacity.test.ts`: Delete mail reader capacity tests. Keep commission capacity tests.
- `tests/daemon/toolbox-resolver.test.ts`: Delete mail context resolution tests. Keep commission and meeting context tests.
- `tests/daemon/services/sdk-runner.test.ts`: Delete `mailFilePath`/`commissionId` session parameter tests.
- `tests/packages/worker-activation.test.ts`: Delete the `describe("mail context rendering")` suites. Note: this block is duplicated in the file. Delete both instances.
- `tests/lib/types.test.ts`: Remove `sleeping` from any test fixtures.
- `tests/daemon/commission-toolbox.test.ts`: Delete `send_mail` tests and mutual exclusion tests. Simplify `SessionState` in remaining tests to remove `mailSent`.

**Verification**: `bun run typecheck && bun test`.

### Phase 4: Remove sleeping from downstream consumers

**Files**: `lib/commissions.ts`, `daemon/services/manager/context.ts`, `daemon/services/manager/toolbox.ts`, `daemon/services/scheduler/index.ts`, `web/components/commission/commission-filter.ts`, `daemon/services/base-toolbox.ts`

**Edits in lib/commissions.ts**:
1. Remove `sleeping: 1` from `STATUS_GROUP`.
2. Remove `sleeping: "status_sleeping"` from `targetEvent`.

**Edits in daemon/services/manager/context.ts**:
1. Remove `c.status === "sleeping"` from the active commission filter condition.

**Edits in daemon/services/manager/toolbox.ts**:
1. Remove `sleeping: "active"` from `SUMMARY_GROUP`.

**Edits in daemon/services/scheduler/index.ts**:
1. Remove `status === "sleeping"` from `isSpawnedCommissionActive`.

**Edits in web/components/commission/commission-filter.ts**:
1. Remove `"sleeping"` from `DEFAULT_STATUSES`.
2. Remove `"sleeping"` from the Active group in `FILTER_GROUPS`.

**Edits in daemon/services/base-toolbox.ts**:
1. Change `list_guild_capabilities` description from "Use this to discover who you can contact via send_mail" to "List all guild workers with their titles and capabilities. Use this to discover available workers. Returns names, titles, and descriptions. Read-only."

**Test edits** (surgical):
- `tests/lib/commissions.test.ts`: Remove `sleeping` from test fixtures and sorting tests.
- `tests/components/commission-list.test.tsx`: Remove `sleeping` from test fixture data.

**Verification**: `bun run typecheck && bun test`.

### Phase 5: Update worker packages

**Files**: `packages/guild-hall-steward/posture.md`, `packages/guild-hall-illuminator/posture.md`

**Edits in steward posture** (line 81):
Remove the paragraph instructing the worker to send mail to the Guild Master via `send_mail`. Replace with: "Document the finding and its qualification in your commission result so the Guild Master can triage."

**Edits in illuminator posture** (line 64):
Remove `send_mail` reference. Replace the escalation guidance with: "Document the issue in your commission result for the Guild Master."

**Test edits**:
- `tests/packages/guild-hall-steward/integration.test.ts:216`: Update the test that checks posture contains `send_mail`. Change the assertion to match the new escalation text (e.g., check for "commission result" or "Guild Master").

**Verification**: `bun run typecheck && bun test`.

### Phase 6: Update CLAUDE.md

**File**: `CLAUDE.md`

1. Remove "worker-to-worker mail" from the "What exists" summary (line 28 area).
2. Remove `mail/` entry from daemon services table (line 64 area).
3. Remove the "Worker mail" paragraph from Key Patterns (line 114 area, the full paragraph starting with "**Worker mail.**").
4. In the Five Concerns section, check if mail is mentioned and remove.
5. In any config references, remove `maxConcurrentMailReaders`.

**No test changes needed for this phase.**

**Verification**: Read through the edited CLAUDE.md for coherence.

### Phase 7: Archive and update lore docs

This is the documentation cleanup pass. Split into two sub-phases for manageability.

#### Phase 7a: Archive mail-specific lore

Archive these files by changing their `status` frontmatter to `removed` and adding a note at the top of each:

- `.lore/specs/workers/worker-communication.md` (status: implemented -> removed)
- `.lore/specs/workers/guild-hall-mail-reader-toolbox.md` (status -> removed)
- `.lore/plans/workers/worker-communication.md` (status -> removed)
- `.lore/plans/workers/guild-hall-mail-reader-toolbox.md` (status -> removed)

Add to each: `removal_note: "Mail system removed. See .lore/brainstorm/worker-sub-agents-and-mail-removal.md, Proposal 1."`

#### Phase 7b: Surgical lore edits

Edit each of these files to remove mail references. The nature of each edit is small: removing `sleeping` from a status list, removing `mail` from a context type list, removing `send_mail` from a tool list, removing `commission_mail_sent`/`mail_reply_received` from event lists.

**Specs to edit** (17 files, listed in "Lore docs requiring surgical edits" above).

**Plans to edit** (8 files, listed above).

**Additional files:**

| File | Nature of reference |
|------|-------------------|
| `.lore/lore-config.md:4,27` | `sleeping` in `custom_directories.commissions` list and prose description. Remove from both. |

The edits are formulaic: find the mail reference, remove it, ensure the surrounding text still reads correctly. No structural changes to the documents.

**Verification**: Grep for `sleeping`, `send_mail`, `mailFilePath`, `mailContext`, `MailOrchestrator`, `commission_mail_sent`, `mail_reply_received`, `maxConcurrentMailReaders` across the full repo. Any remaining hits should be only in the brainstorm (which stays as historical record), the archived specs/plans (which have `status: removed`), and CHANGELOG.md (historical record, left as-is).

## Delegation Guide

| Phase | Implementer | Reviewer | Notes |
|-------|-------------|----------|-------|
| 1 | Dalton | Thorne | Highest risk phase: three files must change atomically with the deletions. Thorne should verify no orphan imports survive. |
| 2 | Dalton | Thorne | Small phase but lifecycle changes affect many tests. Thorne verifies transition table completeness. |
| 3 | Dalton | Thorne | Wide surface area (7 files + tests). Thorne should grep for any remaining mail-specific fields after changes. |
| 4 | Dalton | Thorne | Lower risk: downstream consumers. Each edit is a line removal. |
| 5 | Dalton | Thorne | Posture edits are judgment calls. Thorne should verify the replacement text still makes sense for the worker's role. |
| 6 | Octavia | (self-review) | CLAUDE.md is documentation. Octavia owns it. |
| 7a | Octavia | (self-review) | Archiving is mechanical. |
| 7b | Octavia | (self-review) | Lore edits are Octavia's domain. High volume, low risk per edit. |

Phases 1-5 are a single implementation commission for Dalton with Thorne reviewing after all five complete. The five phases are ordered for build safety: each leaves the codebase compiling. But they can be implemented as one continuous session since each phase is small and the dependency chain is linear.

Phases 6-7 are a separate documentation commission for Octavia, or can be done in-session after Dalton's work merges.

## Risks

**Orphaned state files.** If any `~/.guild-hall/state/commissions/*.json` files exist with `status: "sleeping"`, the recovery code in Phase 1 must handle them gracefully (transition to `failed`). There are no sleeping commissions in practice, but defensive coding prevents daemon crashes on restart.

**Grep sweep matters.** The mail system touched ~50 files. A post-implementation grep sweep for `sleeping`, `send_mail`, `mailContext`, `MailOrchestrator`, `mail_reply_received`, `commission_mail_sent`, `mailFilePath`, `commissionId` (in toolbox context), and `maxConcurrentMailReaders` is the final safety net.

**Verify after each phase.** Run `bun run typecheck && bun test` after each phase, not just at the end. Phase 1 is the highest-risk phase. An early typecheck failure there is the most valuable signal.
