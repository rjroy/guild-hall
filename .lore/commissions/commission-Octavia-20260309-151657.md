---
title: "Commission: Plan: copy artifact path button"
date: 2026-03-09
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Plan a small UI feature: a \"copy path\" button on artifact views that copies the artifact's relative path (e.g., `.lore/specs/infrastructure/guild-hall-system.md`) to the clipboard.\n\nThe use case: when the user wants to reference an artifact in a meeting or conversation with the Guild Master, they can click the button and paste the path directly instead of typing the title and forcing a search.\n\nStart by reading:\n1. The views spec: `.lore/specs/ui/guild-hall-views.md`\n2. The artifact catch-all route: `web/app/projects/[name]/artifacts/[...path]/page.tsx`\n3. Any existing artifact detail components in `web/components/`\n4. `web/app/globals.css` for design tokens and styling conventions\n5. Existing copy-to-clipboard patterns in the codebase (if any)\n\nThen write a plan to `.lore/plans/` that covers:\n- Where the button should appear (artifact header, breadcrumb area, etc.)\n- The component changes needed\n- How to compute the relative path from the route params\n- Clipboard interaction (navigator.clipboard API)\n- Visual feedback on copy (brief \"Copied!\" state)\n- Styling that fits the existing fantasy chrome\n\nKeep it small. This is a single-button feature, not an architecture change."
dependencies: []
linked_artifacts:
  - .lore/plans/ui/artifact-copy-path-button.md

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
  - timestamp: 2026-03-09T22:16:57.457Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-09T22:17:04.334Z
    event: progress_report
    reason: "Starting research phase: reading views spec, artifact route, components, globals.css, and searching for existing clipboard patterns."
  - timestamp: 2026-03-09T22:18:55.880Z
    event: progress_report
    reason: "Research complete. Writing plan to .lore/plans/ui/artifact-copy-path-button.md"
  - timestamp: 2026-03-09T22:19:47.506Z
    event: result_submitted
    reason: "Plan written to .lore/plans/ui/artifact-copy-path-button.md. Four implementation steps, small scope, no architectural changes.\n\n**What the plan covers:**\n- **Placement:** In the `ArtifactProvenance` header bar, right-aligned on the same row as the breadcrumb. The breadcrumb is where REQ-VIEW-36 puts path context; the button belongs there, not in the content toolbar or sidebar.\n- **New component:** `CopyPathButton` — a `\"use client\"` component with `navigator.clipboard.writeText()` and a 2-second \"Copied!\" state transition. Brass styling matches the existing Edit button.\n- **Path computation:** `relativePath` is already computed in the page (`pathSegments.join(\"/\")`). The button receives `.lore/${relativePath}` as its `path` prop — one string template in `ArtifactProvenance`.\n- **Files changed:** 2 new (CopyPathButton component + CSS), 3 modified (ArtifactProvenance.tsx, ArtifactProvenance.module.css, artifact page.tsx).\n- **Tests:** New `tests/components/artifact-provenance.test.ts` verifying path prop threading, following the JSX inspection pattern from `metadata-sidebar.test.ts`."
  - timestamp: 2026-03-09T22:19:55.300Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Research complete. Writing plan to .lore/plans/ui/artifact-copy-path-button.md"
projectName: guild-hall
---
Plan written to .lore/plans/ui/artifact-copy-path-button.md. Four implementation steps, small scope, no architectural changes.

**What the plan covers:**
- **Placement:** In the `ArtifactProvenance` header bar, right-aligned on the same row as the breadcrumb. The breadcrumb is where REQ-VIEW-36 puts path context; the button belongs there, not in the content toolbar or sidebar.
- **New component:** `CopyPathButton` — a `"use client"` component with `navigator.clipboard.writeText()` and a 2-second "Copied!" state transition. Brass styling matches the existing Edit button.
- **Path computation:** `relativePath` is already computed in the page (`pathSegments.join("/")`). The button receives `.lore/${relativePath}` as its `path` prop — one string template in `ArtifactProvenance`.
- **Files changed:** 2 new (CopyPathButton component + CSS), 3 modified (ArtifactProvenance.tsx, ArtifactProvenance.module.css, artifact page.tsx).
- **Tests:** New `tests/components/artifact-provenance.test.ts` verifying path prop threading, following the JSX inspection pattern from `metadata-sidebar.test.ts`.
