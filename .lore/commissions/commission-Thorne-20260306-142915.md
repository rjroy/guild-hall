---
title: "Commission: Review: Worker Identity and Personality in Packages"
date: 2026-03-06
status: dispatched
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the implementation of Worker Identity and Personality in Packages.\n\n**Reference documents:**\n- Spec: `.lore/specs/worker-identity-and-personality.md`\n- Plan: `.lore/plans/worker-identity-and-personality.md`\n\n**What to review:**\n\nThe plan's Step 9 defines the fresh-eyes review checklist. Use it as your primary guide:\n\n1. **Wiring completeness**: Trace the soul field from discovery (`lib/packages.ts`) through `sdk-runner.ts` session preparation into `buildSystemPrompt()` assembly. No gap in the chain.\n2. **Assembly order correctness**: Both `buildSystemPrompt()` (in `packages/shared/worker-activation.ts`) and `activateManager()` (in `daemon/services/manager/worker.ts`) must follow the same order: soul -> identity -> posture -> memory -> context.\n3. **Boundary enforcement**: Soul files contain only personality content (Character, Voice, Vibe). Posture files contain only operational content (Principles, Workflow, Quality Standards). No cross-contamination.\n4. **Graceful degradation**: A worker package without `soul.md` should activate successfully, falling back to identity -> posture -> memory -> context.\n5. **Manager parity**: The manager's prompt assembly now includes identity metadata and follows the shared assembly order. Verify this is wired correctly.\n6. **No stale references**: Grep for \"Vibe:\" in posture files (should find nothing). Check that the old assembly order (posture-first) is gone from prompt assembly code.\n7. **Test coverage**: Tests cover soul discovery (present/absent), prompt order (with/without soul), manager soul split, roster soul file structure, and smoke tests.\n8. **Soul file quality**: Each of the five roster `soul.md` files has the three required sections (Character, Voice, Vibe), is under 80 lines, and contains personality content appropriate to the role.\n\nRead the spec's REQ-WID-* IDs and verify each one is satisfied. Read the actual files, not just test results."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-06T22:29:15.599Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T22:29:15.600Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
