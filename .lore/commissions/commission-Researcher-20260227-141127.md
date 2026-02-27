---
title: "Commission: Audit: projectPath vs integrationPath usage across codebase"
date: 2026-02-27
status: completed
tags: [commission]
worker: Researcher
workerDisplayTitle: "Guild Researcher"
prompt: "Audit every call site in the codebase that resolves a project path for reads or writes. For each, determine whether it's using the correct path given its execution context (daemon route handler, commission worker, meeting session, Next.js page load).

## Context

The project has a three-tier branch strategy with integration worktrees per project and activity worktrees per commission/meeting. The path selection rule is:
- Outside active work (Next.js page loads, daemon route handlers serving UI): use `integrationWorktreePath()` or `projectPath`
- Inside a commission or meeting context: use the activity worktree path

A violation means reads could miss changes on the activity branch, and writes could land in the wrong tree, corrupting the branching model.

## What to Audit

1. Every call to path resolution functions in `lib/paths.ts`: `integrationWorktreePath()`, `activityWorktreeRoot()`, `commissionWorktreePath()`, `meetingWorktreePath()`, `resolveCommissionBasePath()`, `resolveMeetingBasePath()`, `projectLorePath()`
2. Every place a `projectPath` or similar variable is used for file reads or writes in `daemon/services/` and `daemon/routes/`
3. Every place Next.js server components resolve paths for reading artifacts, meetings, commissions

## Deliverable

Write your findings to `.lore/audits/path-resolution-audit.md`. For each call site:
- File and line number
- Which path it uses
- Whether it's correct given the execution context
- If incorrect, what the fix should be

Also note whether type-level guards (branded path types) could prevent future regressions.

Reference the issue: `.lore/issues/path-resolution-audit.md`"
dependencies: []
linked_artifacts:
  - project memory: audits/path-resolution-audit.md

activity_timeline:
  - timestamp: 2026-02-27T22:11:27.692Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-02-27T22:11:27.726Z
    event: status_dispatched
    reason: "Commission dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-02-27T22:11:27.763Z
    event: status_in_progress
    reason: "Commission session started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-02-27T22:11:35.280Z
    event: progress_report
    reason: "Starting path resolution audit. Reading lib/paths.ts and the referenced issue file to understand the path functions and known concerns."
  - timestamp: 2026-02-27T22:12:36.747Z
    event: progress_report
    reason: "Read lib/paths.ts (12 path functions) and the issue file. Now searching all call sites across lib/, daemon/, app/, and cli/ directories."
  - timestamp: 2026-02-27T22:14:00.890Z
    event: progress_report
    reason: "Completed reading all critical source files. Now analyzing findings across all execution contexts: Next.js pages (5), API routes (2), daemon services (commission-session, meeting-session, toolbox-resolver, meeting-toolbox, commission-toolbox, notes-generator, briefing-generator, manager-toolbox), and daemon app.ts. Preparing to write the audit document."
  - timestamp: 2026-02-27T22:14:35.926Z
    event: progress_report
    reason: "All source files read and analyzed. Writing the audit document now. Found no major violations but several areas worth documenting including the propose_followup write path, the projectPath parameter in runCommissionSession, and the notes-generator's reliance on caller-provided projectPath."
  - timestamp: 2026-02-27T22:16:27.360Z
    event: question
    reason: "Write tool is denied in don't-ask mode for this commission. Cannot create .lore/audits/path-resolution-audit.md directly. The audit content is complete and will be included in the submission result. The file will need to be created manually or via a commit."
  - timestamp: 2026-02-27T22:17:59.231Z
    event: result_submitted
    reason: "Completed comprehensive path resolution audit across the entire Guild Hall codebase. Audited 50+ call sites across 5 Next.js pages, 2 API routes, 8 daemon services, 2 CLI tools, and 3 shared lib modules.\n\n**Result: No path selection violations found.** Every call site uses the correct path for its execution context. The Phase 5 integration worktree migration was thorough and consistent.\n\n**4 structural fragility points identified** (not bugs, but areas where future changes could introduce violations):\n1. Artifact helper functions accept bare `string` paths with no type distinction between integration/activity/project paths\n2. `runCommissionSession` receives the user's project dir, correct today but would be wrong if anyone adds direct file I/O with it\n3. `notes-generator.ts` trusts its caller to provide the correct path\n4. `MeetingToolboxDeps.projectPath` fallback could corrupt the branching model if `worktreeDir` invariant breaks\n\n**Recommendation on branded path types:** Yes, they would prevent the most dangerous class of mistakes. Proposed `IntegrationPath`, `ActivityPath`, and `ProjectPath` branded types with constructors in lib/paths.ts. Moderate implementation cost, worthwhile if the path layer continues to evolve.\n\nNote: The Write tool was denied in don't-ask mode, so the full audit document was written to project memory at `project/audits/path-resolution-audit.md` instead of `.lore/audits/path-resolution-audit.md`. The content is identical to what would have been committed."
  - timestamp: 2026-02-27T22:18:06.222Z
    event: status_completed
    reason: "Worker completed successfully"
    from: "in_progress"
    to: "completed"
current_progress: "All source files read and analyzed. Writing the audit document now. Found no major violations but several areas worth documenting including the propose_followup write path, the projectPath parameter in runCommissionSession, and the notes-generator's reliance on caller-provided projectPath."
result_summary: "Completed comprehensive path resolution audit across the entire Guild Hall codebase. Audited 50+ call sites across 5 Next.js pages, 2 API routes, 8 daemon services, 2 CLI tools, and 3 shared lib modules.\n\n**Result: No path selection violations found.** Every call site uses the correct path for its execution context. The Phase 5 integration worktree migration was thorough and consistent.\n\n**4 structural fragility points identified** (not bugs, but areas where future changes could introduce violations):\n1. Artifact helper functions accept bare `string` paths with no type distinction between integration/activity/project paths\n2. `runCommissionSession` receives the user's project dir, correct today but would be wrong if anyone adds direct file I/O with it\n3. `notes-generator.ts` trusts its caller to provide the correct path\n4. `MeetingToolboxDeps.projectPath` fallback could corrupt the branching model if `worktreeDir` invariant breaks\n\n**Recommendation on branded path types:** Yes, they would prevent the most dangerous class of mistakes. Proposed `IntegrationPath`, `ActivityPath`, and `ProjectPath` branded types with constructors in lib/paths.ts. Moderate implementation cost, worthwhile if the path layer continues to evolve.\n\nNote: The Write tool was denied in don't-ask mode, so the full audit document was written to project memory at `project/audits/path-resolution-audit.md` instead of `.lore/audits/path-resolution-audit.md`. The content is identical to what would have been committed."
projectName: guild-hall
---
