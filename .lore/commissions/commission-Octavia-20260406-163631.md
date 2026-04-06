---
title: "Commission: Plan: HTML mockup preview implementation"
date: 2026-04-06
status: dispatched
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write an implementation plan for the HTML mockup preview spec at `.lore/specs/ui/html-mockup-preview.md`.\n\nRead the spec thoroughly. Then read the existing code it references to understand the current patterns:\n- `lib/artifacts.ts` (scanner, validators, MIME types)\n- `lib/types.ts` (Artifact type, artifactType union)\n- `daemon/routes/artifacts.ts` (image serving route)\n- `web/app/api/artifacts/image/route.ts` (image proxy)\n- `web/app/projects/[name]/artifacts/[...path]/page.tsx` (catch-all route)\n\nThe plan should break this into commission-sized phases. Consider the dependency chain: types and scanning need to land before routes, routes before UI.\n\nFollow the existing plan conventions in `.lore/plans/`. Write the plan to `.lore/plans/html-mockup-preview.md`."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-06T23:36:31.644Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-06T23:36:31.645Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
