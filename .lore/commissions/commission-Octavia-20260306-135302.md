---
title: "Commission: Spec: Worker Identity and Personality in Packages"
date: 2026-03-06
status: completed
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a specification for how worker identity and personality are defined in worker packages.\n\n**Approach:** Excavate the codebase first. Don't assume what worker identity means — read the code and find out.\n\n1. **Excavate the current state.** Read the code that loads, resolves, and uses worker packages. Understand:\n   - How worker packages are structured (directory layout, manifest files, config)\n   - What identity fields exist today (name, display name, portrait, description, posture, etc.)\n   - How identity information flows from package definition to daemon session to UI display\n   - Where personality/posture is injected into agent sessions (system prompts, CLAUDE.md, instructions)\n   - What the Guild Master's built-in identity looks like vs. package-defined workers\n   - How the roster spec and worker packages relate\n\n2. **Identify gaps and opportunities.** Based on what exists:\n   - What identity fields are missing or underspecified?\n   - Is personality (tone, voice, behavioral guidelines) well-separated from capability (tools, permissions)?\n   - Can workers customize their appearance (portrait, colors, titles) cleanly?\n   - How does identity interact with the fantasy guild aesthetic?\n\n3. **Write a spec** covering:\n   - Required and optional identity fields for worker packages\n   - How personality/posture is defined and injected\n   - How identity data flows from package to UI\n   - Validation requirements (what happens with missing/malformed identity)\n   - Requirements with REQ IDs following existing project conventions\n\nGround everything in what the code says. Reference file paths and line numbers. Check `.lore/specs/` for any existing worker or roster specs that this should align with."
dependencies: []
linked_artifacts:
  - .lore/specs/worker-identity-and-personality.md

activity_timeline:
  - timestamp: 2026-03-06T21:53:02.056Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T21:53:02.057Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-06T21:53:02.091Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-06T21:53:09.233Z
    event: progress_report
    reason: "Beginning excavation of worker identity and personality systems. Starting with directory structure, existing specs, and package manifests."
  - timestamp: 2026-03-06T21:54:25.639Z
    event: progress_report
    reason: "Excavated core files: all 5 worker packages (package.json, posture.md, index.ts), lib/packages.ts (discovery + Zod schemas), lib/types.ts (WorkerMetadata, ActivationContext, WorkerIdentity), packages/shared/worker-activation.ts (prompt assembly), daemon/services/manager/worker.ts (built-in manager). Now tracing how identity flows through daemon dispatch and into the UI."
  - timestamp: 2026-03-06T21:55:13.749Z
    event: progress_report
    reason: "Completed full codebase excavation. Read all five worker packages, lib/packages.ts (discovery + Zod schemas), lib/types.ts (WorkerMetadata, ActivationContext, WorkerIdentity types), packages/shared/worker-activation.ts (system prompt assembly), daemon/services/manager/worker.ts (built-in manager with inline posture), daemon/routes/workers.ts (REST API serving identity to UI), daemon/services/commission/orchestrator.ts (identity flow during dispatch), daemon/lib/agent-sdk/sdk-runner.ts (session preparation), web/components/ui/WorkerPicker.tsx and WorkerPortrait.tsx (UI display), and .lore/research/soul-md-personality-techniques.md (design research). Also found the existing draft spec at .lore/specs/worker-identity-and-personality.md. Now verifying the draft against code findings."
  - timestamp: 2026-03-06T21:57:17.939Z
    event: progress_report
    reason: "Verification complete. The existing draft spec is well-grounded in the codebase with accurate file references and type descriptions. Found several gaps to address: (1) Manager activation path bypasses shared pattern entirely - needs explicit acknowledgment, (2) SDK runner's ActivationContext construction needs soul field passed, (3) Claude Code preset interaction with personality, (4) Missing line number references in the spec for code claims. Now updating the spec with these findings and adding code-grounded evidence."
  - timestamp: 2026-03-06T22:00:26.811Z
    event: result_submitted
    reason: "Completed specification for worker identity and personality at `.lore/specs/worker-identity-and-personality.md`.\n\n**What I did:**\n\n1. **Full codebase excavation.** Read 16 source files across all layers of the identity system: 5 worker packages (package.json, posture.md, index.ts each), `lib/packages.ts` (discovery + Zod schemas), `lib/types.ts` (WorkerMetadata, ActivationContext, WorkerIdentity), `packages/shared/worker-activation.ts` (system prompt assembly), `daemon/services/manager/worker.ts` (built-in manager), `daemon/lib/agent-sdk/sdk-runner.ts` (session preparation), `daemon/routes/workers.ts` (REST API), `daemon/services/commission/orchestrator.ts` (dispatch flow), `daemon/services/meeting/orchestrator.ts` (meeting flow), `web/components/ui/WorkerPicker.tsx` and `WorkerPortrait.tsx` (UI rendering), plus existing specs and research.\n\n2. **Verified the existing draft spec** against every code claim. The draft was well-written and accurate on its core design. I found four gaps and addressed them.\n\n3. **Gaps addressed in the update:**\n   - Added a **Current State** section with file:line references grounding every claim in the actual codebase (identity flow traced through 6 system layers from discovery to UI)\n   - Expanded **REQ-WID-14** to include the SDK runner (`sdk-runner.ts:237-249`) as the site where ActivationContext is constructed and where `soul` must be passed\n   - Expanded **REQ-WID-15** with concrete implementation detail: `activateManager()` is a separate code path that doesn't use identity metadata at all, requiring three specific changes (split constant, update assembly order, add identity)\n   - Added **REQ-WID-12** to include the Zod schema update (`workerMetadataSchema`) alongside the TypeScript type change\n   - Added Exit Point for `sdk-runner.ts` session preparation\n   - Added constraints about Claude Code preset interaction and soul's invisibility in the UI\n   - Added Views spec cross-references (REQ-VIEW-3, REQ-VIEW-28, REQ-VIEW-37) confirming identity metadata is unaffected\n   - Added full implementation context section with 16 file:line references verified against current code\n\n**Spec summary (17 requirements, WID-1 through WID-17):**\n- Introduces `soul.md` per worker package with three sections: Character (identity framing), Voice (anti-examples + calibration pairs), Vibe (metaphorical gestalt)\n- Clean split test: \"would this content survive a role change?\" = soul; otherwise = posture\n- Posture loses its Vibe line; retains Principles/Workflow/Quality Standards\n- Discovery loads soul.md optionally (graceful degradation for third-party packages)\n- System prompt assembly reordered: soul → identity → posture → memory → context\n- Soul is stable, versioned, not configurable per commission/project/user (reinforces REQ-WKR-4)\n- Rejects SOUL.md self-modification, continuity-in-personality, and full multi-file system"
  - timestamp: 2026-03-06T22:00:32.220Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Verification complete. The existing draft spec is well-grounded in the codebase with accurate file references and type descriptions. Found several gaps to address: (1) Manager activation path bypasses shared pattern entirely - needs explicit acknowledgment, (2) SDK runner's ActivationContext construction needs soul field passed, (3) Claude Code preset interaction with personality, (4) Missing line number references in the spec for code claims. Now updating the spec with these findings and adding code-grounded evidence."
projectName: guild-hall
---
Completed specification for worker identity and personality at `.lore/specs/worker-identity-and-personality.md`.

**What I did:**

1. **Full codebase excavation.** Read 16 source files across all layers of the identity system: 5 worker packages (package.json, posture.md, index.ts each), `lib/packages.ts` (discovery + Zod schemas), `lib/types.ts` (WorkerMetadata, ActivationContext, WorkerIdentity), `packages/shared/worker-activation.ts` (system prompt assembly), `daemon/services/manager/worker.ts` (built-in manager), `daemon/lib/agent-sdk/sdk-runner.ts` (session preparation), `daemon/routes/workers.ts` (REST API), `daemon/services/commission/orchestrator.ts` (dispatch flow), `daemon/services/meeting/orchestrator.ts` (meeting flow), `web/components/ui/WorkerPicker.tsx` and `WorkerPortrait.tsx` (UI rendering), plus existing specs and research.

2. **Verified the existing draft spec** against every code claim. The draft was well-written and accurate on its core design. I found four gaps and addressed them.

3. **Gaps addressed in the update:**
   - Added a **Current State** section with file:line references grounding every claim in the actual codebase (identity flow traced through 6 system layers from discovery to UI)
   - Expanded **REQ-WID-14** to include the SDK runner (`sdk-runner.ts:237-249`) as the site where ActivationContext is constructed and where `soul` must be passed
   - Expanded **REQ-WID-15** with concrete implementation detail: `activateManager()` is a separate code path that doesn't use identity metadata at all, requiring three specific changes (split constant, update assembly order, add identity)
   - Added **REQ-WID-12** to include the Zod schema update (`workerMetadataSchema`) alongside the TypeScript type change
   - Added Exit Point for `sdk-runner.ts` session preparation
   - Added constraints about Claude Code preset interaction and soul's invisibility in the UI
   - Added Views spec cross-references (REQ-VIEW-3, REQ-VIEW-28, REQ-VIEW-37) confirming identity metadata is unaffected
   - Added full implementation context section with 16 file:line references verified against current code

**Spec summary (17 requirements, WID-1 through WID-17):**
- Introduces `soul.md` per worker package with three sections: Character (identity framing), Voice (anti-examples + calibration pairs), Vibe (metaphorical gestalt)
- Clean split test: "would this content survive a role change?" = soul; otherwise = posture
- Posture loses its Vibe line; retains Principles/Workflow/Quality Standards
- Discovery loads soul.md optionally (graceful degradation for third-party packages)
- System prompt assembly reordered: soul → identity → posture → memory → context
- Soul is stable, versioned, not configurable per commission/project/user (reinforces REQ-WKR-4)
- Rejects SOUL.md self-modification, continuity-in-personality, and full multi-file system
