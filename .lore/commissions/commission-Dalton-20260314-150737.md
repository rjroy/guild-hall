---
title: "Commission: Fix broken portrait in meeting view"
date: 2026-03-14
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "The meeting page portrait image is broken. The symptom: worker portraits show initials fallback instead of the actual portrait image in meeting views.\n\n**Root cause hypothesis (verify before fixing):**\n\nIn `web/app/projects/[name]/meetings/[id]/page.tsx` line 82, the worker lookup does:\n```\nconst workerInfo = workers.find((w) => w.name === workerName);\n```\n\nThe daemon endpoint `GET /system/packages/worker/list` returns `name` as the package name (e.g., `\"guild-hall-developer\"`) while `workerName` comes from meeting frontmatter `worker` field which stores the identity name (e.g., `\"Dalton\"`). The match should likely use `w.displayName` instead of `w.name`.\n\n**Your job:**\n1. Verify this is actually the cause. Check the daemon endpoint response shape and the meeting frontmatter `worker` field values to confirm the mismatch.\n2. Check if this same mismatch exists in any other pages that fetch from this endpoint (commission page, dashboard cards, etc.).\n3. Fix all affected locations.\n4. Verify existing tests cover this, or add tests if they don't."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-14T22:07:37.008Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T22:07:37.010Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
