---
title: "Commission: Heartbeat P1: Foundation (Config, Source Provenance, File Scaffolding)"
date: 2026-04-04
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 1 of the Heartbeat Commission Dispatch plan.\n\n**Plan**: `.lore/plans/heartbeat-commission-dispatch.md` — read Phase 1 in full.\n**Spec**: `.lore/specs/heartbeat-commission-dispatch.md` — reference for REQ IDs.\n\nThis phase has three steps, all in one commission:\n\n## Step 1: Config Schema and Types (REQ-HBT-28, REQ-HBT-28a, REQ-HBT-29)\n\n- `lib/types.ts`: Add `heartbeatIntervalMinutes?: number` and `heartbeatBackoffMinutes?: number` to `AppConfig`. Add `heartbeat?: string` to `SystemModels`.\n- `lib/config.ts`: Add validation to `appConfigSchema` (interval min 5, backoff min 60) and `systemModelsSchema` (heartbeat string).\n- Tests: config validation accepts valid values, rejects below minimums, handles omission.\n\n## Step 2: Commission Source Provenance (REQ-HBT-21, REQ-HBT-22, REQ-HBT-24, REQ-HBT-45)\n\n- `daemon/services/commission/orchestrator.ts`: Add `source?: { description: string }` to createCommission options. Write `source:` block in YAML frontmatter when present. Add source description to timeline entry. Do NOT remove `sourceSchedule`/`sourceTrigger` yet.\n- `daemon/services/commission/record.ts`: Add `CommissionSource` interface. Add `readSource(artifactPath)` to `CommissionRecordOps`.\n- Tests: roundtrip create-then-read with source, readSource returns null without source, timeline includes source description.\n\n## Step 3: Heartbeat File Scaffolding (REQ-HBT-1, REQ-HBT-2, REQ-HBT-25, REQ-HBT-26)\n\n- Create `daemon/services/heartbeat/heartbeat-file.ts`: Template content (instructional header + section headings for Standing Orders, Watch Items, Context Notes, Recent Activity). Export `ensureHeartbeatFile`, `repairHeartbeatHeader`, `readHeartbeatFile`, `hasContentBelowHeader`, `clearRecentActivity`, `appendToSection`.\n- `daemon/app.ts`: Call `ensureHeartbeatFile` for each project's integration worktree in `createProductionApp()`.\n- Tests: create where none exists, repair corrupted header preserving content, hasContentBelowHeader false for template-only, appendToSection adds under correct heading, appendToSection creates missing section before Recent Activity.\n\nAll tests must pass. Run `bun typecheck` and `bun test` before completing."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: opus

activity_timeline:
  - timestamp: 2026-04-04T00:52:14.395Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-04T00:52:14.398Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
