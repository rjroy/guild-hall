---
title: "Commission: Plan: Worker Identity and Personality in Packages"
date: 2026-03-06
status: completed
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "The spec for Worker Identity and Personality is complete at `.lore/specs/worker-identity-and-personality.md`. Do NOT update or rewrite the spec. The spec is done.\n\nYour job is to write an **implementation plan** in `.lore/plans/`.\n\n**Instructions:**\n\n1. Read the completed spec. Understand every REQ ID.\n\n2. Read the implementation surfaces the spec references (the file paths and line numbers it cites). Understand what code needs to change.\n\n3. Write a plan in `.lore/plans/worker-identity-and-personality.md` that covers:\n   - Ordered implementation steps with clear scope per step\n   - Which files each step touches\n   - Which REQ IDs each step satisfies\n   - Test strategy for each step\n   - Review strategy (delegation guide: which steps need careful review)\n   - Any open questions or decisions\n\nFollow the format of existing plans in `.lore/plans/`. Keep steps sized so each is independently verifiable.\n\n**Output:** A plan file in `.lore/plans/`. Nothing else. Do not modify the spec."
dependencies: []
linked_artifacts:
  - .lore/plans/worker-identity-and-personality.md

activity_timeline:
  - timestamp: 2026-03-06T22:04:45.797Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T22:04:45.798Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-06T22:04:45.833Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-06T22:04:53.993Z
    event: progress_report
    reason: "Starting plan development. Reading the spec, existing plans for format reference, and implementation surfaces."
  - timestamp: 2026-03-06T22:05:55.929Z
    event: progress_report
    reason: "Finished reading all implementation surfaces. Now writing the plan. Have read: spec (all 17 REQ IDs), existing plan format (worker-posture-to-markdown, project-scoped-meetings), and all code paths: lib/types.ts, lib/packages.ts, packages/shared/worker-activation.ts, daemon/services/manager/worker.ts, daemon/lib/agent-sdk/sdk-runner.ts, plus all relevant test files."
  - timestamp: 2026-03-06T22:12:04.572Z
    event: result_submitted
    reason: "Created implementation plan at `.lore/plans/worker-identity-and-personality.md`. Nine steps covering all 17 REQ-WID-* requirements:\n\n1. Add soul field to types and Zod schema (REQ-WID-12, WID-14)\n2. Load soul.md in package discovery (REQ-WID-11)\n3. Update system prompt assembly order to soul/identity/posture/memory/context (REQ-WID-13)\n4. Wire soul through session preparation (REQ-WID-14)\n5. Remove Vibe lines from posture files (REQ-WID-7, WID-8)\n6. Create soul.md files for five roster workers (REQ-WID-1 through WID-6)\n7. Split manager posture into soul and posture (REQ-WID-15)\n8. Update smoke and roster tests\n9. Full suite verification and fresh-eyes review\n\nIncludes delegation guide (writer for Step 6, developer for infrastructure, reviewer for Step 9), test strategy per step, and three open questions about backward-compatibility. Plan was reviewed by a fresh-context plan-reviewer sub-agent; three findings were addressed before commit."
  - timestamp: 2026-03-06T22:12:19.731Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
  - timestamp: 2026-03-06T22:12:19.936Z
    event: status_completed
    reason: "Execution completed"
current_progress: "Finished reading all implementation surfaces. Now writing the plan. Have read: spec (all 17 REQ IDs), existing plan format (worker-posture-to-markdown, project-scoped-meetings), and all code paths: lib/types.ts, lib/packages.ts, packages/shared/worker-activation.ts, daemon/services/manager/worker.ts, daemon/lib/agent-sdk/sdk-runner.ts, plus all relevant test files."
projectName: guild-hall
---
Created implementation plan at `.lore/plans/worker-identity-and-personality.md`. Nine steps covering all 17 REQ-WID-* requirements:

1. Add soul field to types and Zod schema (REQ-WID-12, WID-14)
2. Load soul.md in package discovery (REQ-WID-11)
3. Update system prompt assembly order to soul/identity/posture/memory/context (REQ-WID-13)
4. Wire soul through session preparation (REQ-WID-14)
5. Remove Vibe lines from posture files (REQ-WID-7, WID-8)
6. Create soul.md files for five roster workers (REQ-WID-1 through WID-6)
7. Split manager posture into soul and posture (REQ-WID-15)
8. Update smoke and roster tests
9. Full suite verification and fresh-eyes review

Includes delegation guide (writer for Step 6, developer for infrastructure, reviewer for Step 9), test strategy per step, and three open questions about backward-compatibility. Plan was reviewed by a fresh-context plan-reviewer sub-agent; three findings were addressed before commit.
