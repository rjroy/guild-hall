---
title: "Commission: Fix: scheduled commission worker discovery in meetings"
date: 2026-03-09
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix a bug where `create_scheduled_commission` fails with \"Worker not found in discovered packages\" when used during a Guild Master meeting.\n\n## Root Cause\n\nIn `daemon/services/meeting/orchestrator.ts` around line 456, the manager's `services` are wired with only `commissionSession` and `gitOps`:\n\n```typescript\nservices: isManager && deps.commissionSession\n  ? { commissionSession: deps.commissionSession, gitOps: git }\n  : undefined,\n```\n\nBut the `create_scheduled_commission` handler in `daemon/services/manager/toolbox.ts` (line 650) needs `deps.packages` to validate the worker name:\n\n```typescript\nconst workerPkg = getWorkerByName(deps.packages ?? [], args.workerName);\n```\n\nSince `packages` is never wired into the services object for meetings, it's always an empty array, and every worker lookup fails.\n\nThe `scheduleLifecycle` and `recordOps` fields are also missing from the meeting wiring, which means `update_schedule` likely has the same problem.\n\n## Fix\n\n1. In `daemon/services/meeting/orchestrator.ts`, add `packages`, `scheduleLifecycle`, and `recordOps` to the `MeetingSessionDeps` interface (packages is already there at line 99, but check the others).\n\n2. Wire them into the services object around line 456:\n```typescript\nservices: isManager && deps.commissionSession\n  ? {\n      commissionSession: deps.commissionSession,\n      gitOps: git,\n      packages: deps.packages,\n      scheduleLifecycle: deps.scheduleLifecycle,\n      recordOps: deps.recordOps,\n    }\n  : undefined,\n```\n\n3. Add `scheduleLifecycle` and `recordOps` as optional fields on `MeetingSessionDeps` if not already present.\n\n4. In `daemon/app.ts`, wire the new deps into `createMeetingSession()` (around line 262). You'll need to pass `scheduleLifecycle` and `recordOps` from the production wiring. Check what's already being passed and add the missing fields.\n\n5. Write tests that verify:\n   - The services object includes packages when a manager meeting is wired\n   - The scheduled commission tool resolves worker names correctly during meetings\n\nRun typecheck, lint, and tests after the fix."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-09T22:12:14.487Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T22:12:14.489Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
