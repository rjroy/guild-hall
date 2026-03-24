---
title: "Commission: Guild Compendium: Worker declarations and posture updates (Step 5)"
date: 2026-03-24
status: abandoned
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Step 5 from the approved plan at `.lore/plans/packages/guild-compendium.md`.\n\nUpdate six worker packages to declare the guild-compendium domain plugin and add posture guidance lines.\n\n**package.json changes** (3 patterns):\n\n1. `packages/guild-hall-writer/package.json`: Already has `\"domainPlugins\": [\"guild-hall-writer\"]`. Append to make `[\"guild-hall-writer\", \"guild-compendium\"]`.\n2. `packages/guild-hall-illuminator/package.json` and `packages/guild-hall-visionary/package.json`: Already have `\"domainPlugins\": []`. Replace with `[\"guild-compendium\"]`.\n3. `packages/guild-hall-reviewer/package.json`, `packages/guild-hall-developer/package.json`, `packages/guild-hall-steward/package.json`: No `domainPlugins` field. Add `\"domainPlugins\": [\"guild-compendium\"]`.\n\n**Posture line additions** (read each posture.md first to find the right insertion point):\n\n| Worker | Posture line |\n|--------|-------------|\n| Octavia (writer) | \"Before writing a spec, plan, or documentation artifact, check the compendium for relevant craft guidance.\" |\n| Thorne (reviewer) | \"Before starting a code review, check the compendium for relevant review practices and finding calibration.\" |\n| Dalton (developer) | \"Before starting implementation from a plan, check the compendium for relevant implementation patterns and testing practices.\" |\n| Edmund (steward) | \"Before starting maintenance or cleanup work, check the compendium for relevant practices.\" |\n| Sienna (illuminator) | \"Before starting visual work, read the reference entries in the guild compendium's `reference/` directory for relevant visual craft guidance and style references.\" |\n| Celeste (visionary) | \"Before starting strategic analysis or vision work, check the compendium for relevant analysis patterns.\" |\n\nNote: Sienna's line uses explicit file-read language because she lacks the Skill tool. All other workers use \"check the compendium\" which maps to the skill invocation.\n\nDo NOT modify `packages/guild-hall-researcher/` (Verity is deliberately excluded per REQ-CMP-24).\n\nAll tests must pass: `bun test`"
dependencies:
  - commission-Dalton-20260323-225538
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T05:56:54.555Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T05:57:39.836Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-24T07:21:39.270Z
    event: status_abandoned
    reason: "Something is wrong need start over."
    from: "blocked"
    to: "abandoned"
current_progress: ""
projectName: guild-hall
---
