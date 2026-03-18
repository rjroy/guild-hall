---
title: "Commission: Spec: vision document format and creation paths"
date: 2026-03-17
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for the Guild Hall vision document — the artifact that anchors the self-evolution system.\n\n**Context:** We're building a self-evolution capability where a brainstorming worker regularly proposes improvements. It needs a vision statement as its north star. There are two paths to creating one:\n\n1. **Existing project (excavation):** A worker reads the codebase, lore, issues, and memory, then drafts a vision statement. The user reviews, corrects what's wrong, and approves. The system already has implicit vision baked into its decisions — this path surfaces it.\n\n2. **New project (guided creation):** A guided prompt walks the user through intent, audience, constraints, and aspirations. The worker synthesizes responses into a vision statement. The user refines and approves.\n\n**What the spec should cover:**\n- The vision document format and where it lives (likely `.lore/vision.md` or similar)\n- Requirements for both creation paths (excavation and guided)\n- How the document gets used downstream (a brainstorming worker evaluates proposals against it)\n- How the vision gets updated over time without losing its anchoring function\n- The approval flow — the user must sign off on the vision before it becomes authoritative\n\n**Dependencies:** Verity is researching what makes a machine-readable vision statement effective (commission running in parallel). You don't need to wait for that — write the spec from the product/workflow angle. The research will inform the final document structure, which can be reconciled later.\n\n**Output:** A spec in `.lore/specs/` with clear requirements (REQ IDs) covering the vision document lifecycle."
dependencies:
  - commission-Verity-20260316-202238
linked_artifacts:
  - .lore/specs/infrastructure/vision-document.md

activity_timeline:
  - timestamp: 2026-03-17T03:22:56.381Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-17T03:22:56.383Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-17T03:27:45.031Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-17T03:27:45.033Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-17T03:27:45.067Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-17T03:27:54.255Z
    event: progress_report
    reason: "Starting context gathering: reading existing specs for format conventions, checking for vision-related artifacts, and reviewing Verity's parallel research commission."
  - timestamp: 2026-03-17T03:28:39.327Z
    event: progress_report
    reason: "Context gathering complete. Read Verity's research on vision statements as AI decision filters, existing spec conventions (frontmatter format, REQ ID patterns, section structure), scheduled commissions spec, worker identity spec, and system spec. Now drafting the vision document lifecycle spec."
  - timestamp: 2026-03-17T03:34:18.989Z
    event: progress_report
    reason: "Spec written and reviewed. Applied fixes from fresh-eyes review: defined the approval mechanism (manual frontmatter edit), resolved revision-in-progress behavior (treat as no approved vision), connected behavioral framing rule to creation paths, clarified principle priority ordering, added review-trigger staleness check to brainstorming worker, defined revision initiation paths, explained omitted modules field. Doing final read-through."
  - timestamp: 2026-03-17T03:34:43.776Z
    event: result_submitted
    reason: "Spec written at `.lore/specs/infrastructure/vision-document.md` with 25 requirements (REQ-VIS-1 through REQ-VIS-25) covering the vision document lifecycle.\n\n**What the spec defines:**\n\n- **Document format** (VIS-1 through VIS-6): `.lore/vision.md`, one per project. Four required sections: Vision paragraph, ordered Principles with behavioral examples, Anti-Goals with rationale, Tension Resolution table. Optional Current Constraints section. Behavioral framing rule enforced on principles.\n\n- **Approval flow** (VIS-7 through VIS-9): Manual frontmatter edit (status: draft to approved). No worker can approve. During revision windows, consumers treat the project as having no approved vision (no git-history recovery complexity).\n\n- **Excavation path** (VIS-10 through VIS-12): Commission reads codebase, lore, CLAUDE.md, memory, git history. Surfaces implicit values from existing decisions. Must not invent unsupported principles. Sparse drafts allowed when evidence is thin.\n\n- **Guided creation path** (VIS-13 through VIS-15): Meeting walks user through five question areas (identity, values, rejections, tensions, constraints). Worker synthesizes responses into draft with real-time refinement. Meeting because it's inherently interactive.\n\n- **Brainstorming worker usage** (VIS-16 through VIS-18): Four-step evaluation sequence (anti-goal check, principle alignment, tension resolution, constraint check). Vision alignment section required in output. Staleness check against review_trigger. Visible note when no approved vision exists.\n\n- **Review and evolution** (VIS-19 through VIS-22): Human-readable review triggers. Three revision initiation paths (user edit, commissioned update, brainstorming worker flag). Changelog required for principle removal. Conservative evolution principle.\n\n- **Artifact relationships** (VIS-23 through VIS-25): Vision sits above specs in hierarchy. Optional reading for non-brainstorming workers. CLAUDE.md documentation map entry recommended.\n\n**Informed by:** Verity's completed research at `.lore/research/vision-statements-as-ai-decision-filters.md` (Claude's constitution, OpenAI model spec, C3AI framework patterns). The spec was reviewed by a fresh-context reviewer and all priority findings were addressed.\n\n**Open questions:** (1) Excavation as commission vs. meeting, (2) brainstorming worker identity deferred to self-evolution spec, (3) edge case of projects with codebase but no lore history."
  - timestamp: 2026-03-17T03:34:47.240Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Spec written and reviewed. Applied fixes from fresh-eyes review: defined the approval mechanism (manual frontmatter edit), resolved revision-in-progress behavior (treat as no approved vision), connected behavioral framing rule to creation paths, clarified principle priority ordering, added review-trigger staleness check to brainstorming worker, defined revision initiation paths, explained omitted modules field. Doing final read-through."
projectName: guild-hall
---
Spec written at `.lore/specs/infrastructure/vision-document.md` with 25 requirements (REQ-VIS-1 through REQ-VIS-25) covering the vision document lifecycle.

**What the spec defines:**

- **Document format** (VIS-1 through VIS-6): `.lore/vision.md`, one per project. Four required sections: Vision paragraph, ordered Principles with behavioral examples, Anti-Goals with rationale, Tension Resolution table. Optional Current Constraints section. Behavioral framing rule enforced on principles.

- **Approval flow** (VIS-7 through VIS-9): Manual frontmatter edit (status: draft to approved). No worker can approve. During revision windows, consumers treat the project as having no approved vision (no git-history recovery complexity).

- **Excavation path** (VIS-10 through VIS-12): Commission reads codebase, lore, CLAUDE.md, memory, git history. Surfaces implicit values from existing decisions. Must not invent unsupported principles. Sparse drafts allowed when evidence is thin.

- **Guided creation path** (VIS-13 through VIS-15): Meeting walks user through five question areas (identity, values, rejections, tensions, constraints). Worker synthesizes responses into draft with real-time refinement. Meeting because it's inherently interactive.

- **Brainstorming worker usage** (VIS-16 through VIS-18): Four-step evaluation sequence (anti-goal check, principle alignment, tension resolution, constraint check). Vision alignment section required in output. Staleness check against review_trigger. Visible note when no approved vision exists.

- **Review and evolution** (VIS-19 through VIS-22): Human-readable review triggers. Three revision initiation paths (user edit, commissioned update, brainstorming worker flag). Changelog required for principle removal. Conservative evolution principle.

- **Artifact relationships** (VIS-23 through VIS-25): Vision sits above specs in hierarchy. Optional reading for non-brainstorming workers. CLAUDE.md documentation map entry recommended.

**Informed by:** Verity's completed research at `.lore/research/vision-statements-as-ai-decision-filters.md` (Claude's constitution, OpenAI model spec, C3AI framework patterns). The spec was reviewed by a fresh-context reviewer and all priority findings were addressed.

**Open questions:** (1) Excavation as commission vs. meeting, (2) brainstorming worker identity deferred to self-evolution spec, (3) edge case of projects with codebase but no lore history.
