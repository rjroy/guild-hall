---
title: "Commission: Fix: Guild Master portrait always wrong"
date: 2026-03-10
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "The Guild Master's portrait is always wrong in the UI. A recent fix ensured packaged workers always show the correct portrait regardless of how a meeting was started (manual or by request), but the Guild Master portrait is broken.\n\n## Investigation\n\n1. Find the recent fix for worker portraits (likely in meeting-related code or worker resolution). Understand what it changed and why the manager is excluded from the fix.\n2. Trace how the Guild Master's portrait is resolved vs. how packaged workers' portraits are resolved. The manager is a built-in worker (`daemon/services/manager/worker.ts`), not a package on disk, so its portrait resolution path may differ.\n3. Check the meeting artifact creation and the UI components that render portraits to find where the disconnect happens.\n\n## Fix\n\nOnce you understand the root cause, fix it so the Guild Master portrait is correct in all contexts (meetings started manually, meetings started by request, the dashboard, etc.). Make sure tests cover the fix."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-10T07:57:23.342Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T07:57:23.343Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
