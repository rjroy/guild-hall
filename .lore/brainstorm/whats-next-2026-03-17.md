---
title: "What's Next: Guild Hall Survey (March 2026)"
date: 2026-03-17
status: resolved
author: Celeste
tags: [brainstorm, survey, roadmap]
---

# What's Next: Guild Hall Survey

**Vision status:** `active` (v1, drafted 2026-03-17). Not yet approved by the user. `approved_by: null`. The vision was created by an excavation commission and has principles, anti-goals, tension resolution, and constraints documented. Review trigger: "after major architectural changes or quarterly."

**Context scanned:** Vision document, 4 open issues (maxTurns recovery, meeting agenda attention, meetings list preview, package distribution), 5 existing brainstorms (3 resolved), 28 retros, CHANGELOG, all 9 packages, daemon services, web layer, recent git history (PRs #93-#118).

**Recent brainstorm check:** Two open brainstorms exist: `claude-code-over-github-copilot.md` (experimental proxy idea, no new evidence to revisit) and `commission-maxturns-recovery.md` (surfacing failure reasons, halted state). Neither is repeated here.

---

## Proposal 1: Commission Outcomes to Project Memory

### Evidence

The `agent-memory-systems.md` research document (lines 286-309) identifies "commission outcomes as automatic memory writes" as Component 2 of the recommended memory strategy. The retro `commission-cleanup-2026-03-15.md` (line 28-30) explicitly flags this as an unimplemented recommendation with no spec, plan, or issue tracking it.

Right now, when a commission completes, `submit_result` writes the summary to the commission artifact frontmatter (`daemon/services/commission/orchestrator.ts:2108`). That summary stays in the artifact. When the next worker activates on the same project, it gets briefing context from `briefing-generator.ts` which scans `.lore/` artifacts, but the briefing is a generalist summary, not a structured feed of "here's what your colleagues just finished."

The memory injector (`daemon/services/memory-injector.ts`) already loads project-scoped memory files at activation. The pipeline exists. Nothing writes to it automatically.

### Proposal

When `handleSessionCompletion` runs for a completed commission (not failed, not cancelled), extract a structured entry from the `submit_result` summary and write it to `~/.guild-hall/memory/projects/{projectName}/commission-outcome-{id}.md`. The entry should contain: commission ID, worker name, date, what was done, and artifact paths. The memory injector already picks these up at next activation without changes.

This turns commission outcomes from dead artifacts into living context that informs future work. The research document calls it "the gravity": workers immediately benefit from previous commissions' outcomes.

### Rationale

Workers currently start each commission with no knowledge of what other workers recently completed, unless the briefing generator happens to mention it or the user includes context in the prompt. Commission artifacts exist but aren't in the memory injection path. The gap between "outcomes are recorded" and "outcomes are used" is a single file write at the right moment.

### Scope

Small. One file write added to the completion handler. Memory injector and compaction handle the rest. No new infrastructure needed.

---

## Proposal 2: CHANGELOG Catch-up

### Evidence

The CHANGELOG has two entries under `[Unreleased]` (commission status tool, commit .lore from web). The git history since `[1.0.0]` (2026-03-08) shows at least 10 merged PRs with substantive changes:

- #105: Sandboxed Execution Environments
- #106: Worker canUseToolRules declarations
- #108: Daemon Application Boundary migration
- #109: CLI progressive discovery (package skill handlers)
- #110: Injectable daemon logger
- #112: Commission filtering, artifact meeting requests, lore commits
- #113: Commission filter readability fix
- #114: Meeting status visibility fix
- #115: Commission tree list and status tool
- #116: Dashboard selection model, tool input fix
- #117: Commission halted state, briefing tuning
- #118: Updated images

The compacted memory explicitly tracks this: "CHANGELOG gap: PRs #101-#110 and recent features not documented."

### Proposal

Commission Octavia to backfill the CHANGELOG from git history. Each merged PR should be classified (Added, Changed, Fixed) and summarized in the Common Changelog format the project already uses. Include PR links. The existing 1.0.0 section demonstrates the target format.

### Rationale

The CHANGELOG is the user's release narrative. When the user prepares a release or reviews what changed, this is the document they check. Right now it tells them two things changed since 1.0.0 when the real number is closer to twenty. The longer it drifts, the harder the catch-up.

### Scope

Small. One commission, reading git history and writing text. No code changes.

---

## Proposal 3: Meeting Layer Separation

### Evidence

The commission service uses a 5-layer architecture (`daemon/services/commission/`) that enforces clear boundaries: RecordOps, Lifecycle, WorkspaceOps, SDK runner, and Orchestrator. The CLAUDE.md describes this as an explicit design decision (Five Concerns table). The orchestrator coordinates layers without embedding their logic.

The meeting service (`daemon/services/meeting/orchestrator.ts`, 1,562 lines) uses the older monolithic pattern. Record ops, lifecycle state, workspace management, SDK session running, and orchestration all live in one file. The CLAUDE.md acknowledges this: "Meetings still use the older monolithic pattern."

The commission layer separation worked well. The retro `unified-sdk-runner.md` (line 31) credits it with removing ~650 lines and fixing a silent memory compaction gap. The `dispatch-hardening.md` retro cites "duplicate interface definitions" as "drift timebombs," which is what happens when one service evolves its boundaries and another doesn't follow.

### Proposal

Extract the meeting orchestrator into the same layer pattern: `meeting/record.ts` (already exists), `meeting/lifecycle.ts` (state machine), `meeting/workspace.ts` (branch/worktree provisioning), and `meeting/orchestrator.ts` (coordination only). The existing `meeting/registry.ts`, `meeting/transcript.ts`, and `meeting/notes-generator.ts` stay as they are.

### Rationale

This isn't about the meeting service being broken. It works. But the commission and meeting services are structural peers, and having one follow the layer pattern while the other doesn't creates a teaching problem for every new commission that touches session infrastructure. "How does the system work?" has two answers depending on which service you look at.

### Scope

Medium. The layers exist implicitly in the monolithic file. Extraction is mechanical, not creative. The commission extraction provides a template. Tests exist for the meeting orchestrator, so regressions are detectable.

---

## Proposal 4: Artifact Provenance Tracking

### Evidence

`web/components/artifact/ArtifactProvenance.tsx` (line 14) contains a stub comment: "The provenance line is stubbed for Phase 1 and will display the worker who created or last modified this artifact once sessions and worker tracking are in place."

The reference document `project-view.md` (line 114) confirms: "Worker provenance tracking (which worker created or last modified an artifact) is planned but not yet implemented."

Commission artifacts already record `worker` in frontmatter. But general artifacts (specs, plans, retros, brainstorms) don't track which worker created them or which commission produced them. When browsing `.lore/`, there's no way to know if a spec was written by Dalton during a commission, by Octavia during documentation, or by the user directly.

### Proposal

When a commission creates or modifies an artifact via the toolbox write path, stamp the artifact frontmatter with `created_by` (worker name) and `commission_id` (source commission). The ArtifactProvenance component can then display "Created by Dalton via commission-Dalton-20260315-121010" instead of "Source information unavailable." The write path already passes worker identity through the toolbox context.

### Rationale

Vision Principle 1 says "artifacts are the work." When the user browses artifacts months later, knowing who wrote it and why matters for evaluating trust, context, and whether to revisit the decision. This is especially true for specs: a spec written by Verity during research carries different weight than one written by Dalton during implementation.

### Scope

Small. Frontmatter stamping at the write boundary, one component update to read and display it.

---

## Proposal 5: Vision Approval Ceremony

### Evidence

The vision document (`.lore/vision.md`) was created on 2026-03-17 by an excavation commission (`commission-Octavia-20260317-074419`). Its `status` is `active` with `approved_by: null` and `approved_date: null`.

The vision's own instructions (Celeste's posture) say: "When `.lore/vision.md` has `status: approved`, run the four-step alignment analysis on each proposal." Right now, no alignment analysis happens because the vision isn't approved. Every brainstorm operates in unfiltered mode.

The vision document is substantive. It has 6 principles, 5 anti-goals, a tension resolution table, and 3 current constraints. It reads like a finished document, not a draft. But without the user's explicit approval, it's advisory rather than authoritative.

### Proposal

This isn't a code proposal. It's a prompt: the user should read the vision document, decide if it represents their intent, and either approve it (setting `approved_by` and `approved_date`) or mark it for revision. Once approved, future brainstorms apply alignment analysis against it, which makes proposals higher quality because they're evaluated against declared direction rather than floating in open space.

The mechanical change is one line: `status: approved`. The real work is the user reading the document and deciding.

### Rationale

A vision that exists but isn't approved is a compass that isn't calibrated. It's probably pointing the right direction (it was excavated from the actual codebase), but nobody has confirmed that. Every brainstorm since will say "no approved vision exists" and skip alignment analysis, which defeats the purpose of having a vision document.

### Scope

Small. One frontmatter field change after user review.

---

## Proposal 6: Web-to-Daemon Migration Completed (Constraint Removal)

### Evidence

The vision's Current Constraints section states: "Web reads from filesystem. The web layer still reads some data directly from the filesystem rather than through the daemon API." It adds: "The constraint expires when the migration is complete."

The web layer exploration found zero direct filesystem imports. Every page in `web/app/` uses `fetchDaemon()` from `web/lib/daemon-api.ts` for all data operations. The client components make API calls to Next.js API routes, which in turn call the daemon. No `fs.readFile`, no `path.resolve`, no direct integration worktree reads.

This constraint appears to already be resolved. PRs #108 (DAB migration) and #112 (various UI features) were the final moves.

### Proposal

Remove or update the "Web reads from filesystem" constraint in `.lore/vision.md`. Replace it with a note that the migration was completed, with reference to the PRs that finished it. This prevents future workers from treating it as an active constraint and spending time looking for filesystem reads that don't exist.

### Rationale

A constraint that's been resolved but still listed as active creates false urgency. Workers reading the vision see "each feature should move toward daemon API reads" and might add unnecessary daemon endpoints for reads that are already routed correctly. Cleaning this up is one sentence of documentation work with outsized clarity benefit.

### Scope

Small. One paragraph change in the vision document.
