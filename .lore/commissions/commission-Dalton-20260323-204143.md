---
title: "Commission: Dalton soul and posture revision (steps 1-4)"
date: 2026-03-24
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the Dalton soul and posture revision from `.lore/plans/workers/dalton-soul-revision.md`.\n\n**Steps 1-4 only.** Do not touch Sable's package or the roster spec.\n\n1. Replace `packages/guild-hall-developer/soul.md` with the revised content from the plan's \"Revised Soul.md (Full Draft)\" section.\n2. Replace `packages/guild-hall-developer/posture.md` with the revised content from the plan's \"Revised Posture.md (Full Draft)\" section.\n3. Verify the soul file stays under 80 lines (REQ-WID-6 from the worker identity spec).\n4. Run the full test suite. If any tests snapshot or assert on soul/posture content or structure, update those assertions to match the new content. These are intentional content changes, not regressions."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T03:41:43.160Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T03:41:50.196Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
