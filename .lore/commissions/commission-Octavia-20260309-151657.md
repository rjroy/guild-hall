---
title: "Commission: Plan: copy artifact path button"
date: 2026-03-09
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Plan a small UI feature: a \"copy path\" button on artifact views that copies the artifact's relative path (e.g., `.lore/specs/guild-hall-system.md`) to the clipboard.\n\nThe use case: when the user wants to reference an artifact in a meeting or conversation with the Guild Master, they can click the button and paste the path directly instead of typing the title and forcing a search.\n\nStart by reading:\n1. The views spec: `.lore/specs/guild-hall-views.md`\n2. The artifact catch-all route: `web/app/projects/[name]/artifacts/[...path]/page.tsx`\n3. Any existing artifact detail components in `web/components/`\n4. `web/app/globals.css` for design tokens and styling conventions\n5. Existing copy-to-clipboard patterns in the codebase (if any)\n\nThen write a plan to `.lore/plans/` that covers:\n- Where the button should appear (artifact header, breadcrumb area, etc.)\n- The component changes needed\n- How to compute the relative path from the route params\n- Clipboard interaction (navigator.clipboard API)\n- Visual feedback on copy (brief \"Copied!\" state)\n- Styling that fits the existing fantasy chrome\n\nKeep it small. This is a single-button feature, not an architecture change."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-09T22:16:57.425Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T22:16:57.426Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
