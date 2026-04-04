---
title: "Commission: Heartbeat P4: Worker add_heartbeat_entry Tool"
date: 2026-04-04
status: pending
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 4 of the Heartbeat Commission Dispatch plan.\n\n**Plan**: `.lore/plans/heartbeat-commission-dispatch.md` — read Phase 4 in full.\n**Spec**: `.lore/specs/heartbeat-commission-dispatch.md` — reference for REQ IDs.\n\nPhase 1 (config, source provenance, heartbeat file scaffolding) is complete. Use `appendToSection` from `daemon/services/heartbeat/heartbeat-file.ts`.\n\n## Step 1: add_heartbeat_entry Tool (REQ-HBT-12, REQ-HBT-13)\n\nModify `daemon/services/base-toolbox.ts`: Add `add_heartbeat_entry` tool to the base toolbox (shared across all workers).\n\nParameters:\n- `prompt` (string): The entry text\n- `section` (string, one of \"Standing Orders\", \"Watch Items\", \"Context Notes\")\n\nImplementation: Derive integration worktree path from `deps.guildHallHome` + `deps.projectName` (e.g., `path.join(guildHallHome, \"projects\", projectName)`). Call `appendToSection` from heartbeat-file.ts on the heartbeat file at that path.\n\nIMPORTANT: The tool writes to the integration worktree, NOT the activity worktree. Workers operate in activity worktrees during commissions, but the heartbeat file lives in the integration worktree.\n\nTests: Call tool with each section name, verify entry appears as `- ` prefixed list item under correct heading. Call with section that doesn't exist, verify section is created. Verify tool is available to all workers (not restricted to manager).\n\nRun `bun typecheck` and `bun test` before completing."
dependencies:
  - commission-Dalton-20260403-175214
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-04-04T00:53:05.023Z
    event: created
    reason: "Commission created"
current_progress: ""
projectName: guild-hall
---
