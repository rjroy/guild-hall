---
title: Lore directory restructure (work/ layout coexistence)
date: 2026-04-27
status: approved
tags: [architecture, lore, directory-structure, classification, refactor]
modules: [lib, daemon, web, cli, packages]
related:
  - .lore/issues/lore-directory-restructure-discovery.md
  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/specs/infrastructure/repository-layout.md
req-prefix: LDR
---

# Spec: Lore Directory Restructure

## Overview

The `lore-development` plugin now organizes `.lore/` into three top-level buckets: `work/<type>/` for in-flight planning and activity artifacts, `reference/` for distilled durable facts, and `learned/` for captured lessons. Guild Hall currently assumes a flat layout: each artifact type owns a top-level directory under `.lore/` (`specs/`, `plans/`, `issues/`, `commissions/`, `meetings/`, ...). Migration across projects will not be instantaneous, and existing artifacts must keep functioning during and after the transition.

This spec defines coexistence: `.lore/specs/foo.md` (flat) and `.lore/work/specs/bar.md` (new) may exist in the same project at the same time. Both surface as Specs. The same rule holds for every other in-flight type, including commissions and meetings. New writes go under `work/`. Reads accept either layout. Type classification peels a leading `work/` segment so a single canonical type drives every downstream consumer (UI grouping, smart-view filters, route prefix detection, recency lists). The discovery report at `.lore/issues/lore-directory-restructure-discovery.md` enumerates every assumption point this spec must close; treat it as the input artifact.

## Entry Points

- The lore-development plugin reorganized `.lore/` into `work/`, `reference/`, `learned/` buckets; Guild Hall hardcodes the flat layout in roughly thirty call sites (from discovery report)
- A new `learned/` artifact type was introduced and is not in `TYPE_LABELS` (from `lib/types.ts:357-371`)
- Migration across existing projects will not happen atomically; both layouts must be readable concurrently within a single project (user decision, 2026-04-27)
- New artifacts authored by Guild Hall (specs, plans, issues, commissions, meetings, ...) need a single decided write target; otherwise drift continues indefinitely (from discovery report §3, §9.1, §9.2)

## Goals

**Coexistence in a single project.** A spec at `.lore/specs/foo.md` and a spec at `.lore/work/specs/bar.md` are both Specs in the same project. Listing, grouping, smart-view filters, recency, and type-specific routes (issues, commissions, meetings, ...) merge results from both layouts. Consumers downstream of classification see one canonical type label, not two layout-tagged variants.

**Peel-based classification.** Layout is a path concern, not a typing concern. `artifactTypeSegment` peels a leading `work/` prefix before extracting the type segment, so `work/specs/foo.md` classifies as `Spec` exactly as `specs/foo.md` does. Single-axis classification keeps every existing consumer drop-in compatible. Layout group is not surfaced as a separate dimension.

**Write new under `work/`.** Every Guild Hall write of an in-flight artifact (commissions, meetings, issues, and any future artifact-creating routes or toolbox operations) targets `.lore/work/<type>/...`. The flat-layout write paths are removed from the write side; reads continue to accept both. New artifacts converge on a single home so the layout question stops accumulating call sites.

## Non-goals

- Migrating existing artifacts. Files at `.lore/specs/foo.md` stay where they are. No automated relocation tool, no batch rename, no scheduled cleanup. The system tolerates the flat layout indefinitely.
- Tooling to move artifacts between layouts. If a project chooses to reorganize, that work is manual and out of scope.
- Removing the flat layout. The flat layout is permanently supported on the read side. This spec does not deprecate it and does not schedule its removal.
- Introducing a layout-group axis. Classification stays single-axis (canonical type). Consumers do not learn about `work/` as a category; the prefix is peeled before they see paths.
- Reorganizing root-level lore (`heartbeat.md`, `lore-config.md`, `lore-agents.md`, `vision.md`) or `.lore/generated/`. These remain at their current locations.
- Reorganizing `_archive/`. Archive layout is not in scope; if archived artifacts are scanned, classification handles them by the same peel rule applied to `work/` (no archive-specific behavior is defined here).

## Requirements

### Classification (the choke point)

- REQ-LDR-1: `lib/types.ts:TYPE_LABELS` adds `learned: "Learned"`. Every other entry retains its current label and casing. `reference` stays unchanged.

- REQ-LDR-2: `lib/types.ts:artifactTypeSegment(relativePath)` peels a single leading `work/` segment before extracting the type segment. `work/specs/foo.md` returns `"Spec"`. `work/learned/lesson.md` returns `"Learned"`. `work/foo.md` (no second segment) returns `null`. `work/` is not a recognized type and never appears as a label.

- REQ-LDR-3: An unknown segment under `work/` (e.g., `work/unrecognized/foo.md`) returns the raw segment as-is (`"unrecognized"`). This matches the existing flat-layout behavior for unknown segments and avoids silently dropping artifacts. The label is non-canonical, but classification does not block listing.

- REQ-LDR-4: Root-level lore files (`.lore/heartbeat.md`, `.lore/lore-config.md`, `.lore/lore-agents.md`, `.lore/vision.md`) continue to return `null` from `artifactTypeSegment`. They are documented as "non-typed lore" and remain at the lore root regardless of layout. `.lore/generated/` continues to classify as the raw segment `"generated"` (no canonical label) and is not subject to the restructure.

### Path resolution

- REQ-LDR-5: A new helper resolves the canonical write path for a given artifact type and identifier. Commission writes resolve to `.lore/work/commissions/<id>.md`. Meeting writes resolve to `.lore/work/meetings/<id>.md`. Issue writes resolve to `.lore/work/issues/<filename>`. Every existing write-side site that hand-composes `path.join(..., ".lore", "commissions"|"meetings"|"issues", ...)` switches to this helper.

- REQ-LDR-6: `lib/paths.ts:commissionArtifactPath(projectPath, commissionId)` returns the new path under `.lore/work/commissions/`. Read-side resolution accepts both layouts: if the new path does not exist on disk, fall back to the flat path `.lore/commissions/<id>.md`. The fallback is read-only.

- REQ-LDR-7: An equivalent `meetingArtifactPath(projectPath, meetingId)` helper exists with the same dual-layout read behavior and writes to `.lore/work/meetings/<id>.md`.

- REQ-LDR-8: `resolveCommissionBasePath` and `resolveMeetingBasePath` in `lib/paths.ts` remain layout-neutral. Their callers compose paths through the new helpers (REQ-LDR-6, REQ-LDR-7), not by hand-joining subdirectory names.

### Discovery and listing

- REQ-LDR-9: `lib/artifacts.ts:scanArtifacts` continues to walk the entire `.lore/` tree recursively. No layout-specific exclusion. Artifacts under `work/` produce relative paths beginning with `work/` (e.g., `work/specs/foo.md`); type classification is handled by the updated `artifactTypeSegment` from REQ-LDR-2.

- REQ-LDR-10: `lib/artifacts.ts:recentArtifacts` filters by canonical type label, not by raw path segment. Commission and Meeting artifacts are excluded by `meta.type !== "Commission"` and `meta.type !== "Meeting"` regardless of layout. The literal `relativePath !== "heartbeat.md"` filter is preserved (root-level lore).

- REQ-LDR-11: `lib/commissions.ts:scanCommissions` reads from both `.lore/work/commissions/` and `.lore/commissions/`. Results are merged. Duplicate IDs (same commission written to both locations) prefer the `work/` copy; the flat copy is dropped from the merged list. The merge is at the listing level only; no rewrite occurs.

- REQ-LDR-12: `lib/meetings.ts:scanMeetings` follows the same dual-read merge rule as REQ-LDR-11.

- REQ-LDR-13: Daemon meeting routes (`apps/daemon/routes/meetings.ts`) and any other direct readers of `.lore/meetings/` resolve through the dual-read helpers from REQ-LDR-7 / REQ-LDR-12 rather than hand-joining the legacy path.

- REQ-LDR-14: Workspace issue list reads merge `.lore/issues/` and `.lore/work/issues/`. Workspace issue create writes to `.lore/work/issues/`. Workspace issue read accepts a relative path under either layout. The `.lore/work/issues/` directory is created lazily on first write.

### Artifact tree and grouping

- REQ-LDR-15: `lib/artifact-grouping.ts:groupKey(relativePath)` peels a leading `work/` segment before extracting the group key. `work/specs/foo.md` groups as `specs`, exactly as `specs/foo.md` does. The group key matches the raw segment used by `TYPE_LABELS`, so downstream display logic (`capitalize(name)`) keeps producing the same labels.

- REQ-LDR-16: `lib/artifact-grouping.ts:buildArtifactTree` peels `work/` at the top level. The tree shows Specs/Plans/Issues/etc. as top-level groups, never `Work` as a top-level group containing them. Commissions and meetings group as themselves regardless of layout. Within a group, the order of artifacts from the two layouts is determined by the existing sort rules; layout is not a sort key.

- REQ-LDR-17: `lib/artifact-smart-view.ts` continues to consume canonical labels from `artifactTypeSegment`. No layout-specific code lives in smart-view. The `EXCLUDED_DIRECTORIES`, `GENERATIVE_INVESTIGATION_SEGMENTS`, and `WORK_ITEM_SEGMENTS` sets are not extended with `work` (which would be incorrect because `work` is peeled, not classified).

### Daemon route prefix detection

- REQ-LDR-18: `apps/daemon/routes/artifacts.ts` prefix detection (currently lines 111-121) recognizes `work/meetings/` and `work/commissions/` alongside the flat `meetings/` and `commissions/` prefixes. The branch chosen by the prefix determines which worktree resolves the read; the path passed to `readArtifact` after that point is the original relative path (whether flat or under `work/`).

- REQ-LDR-19: Web UI prefix checks that route to live meeting views (`apps/web/app/projects/[name]/artifacts/[...path]/page.tsx`, `apps/web/components/dashboard/RecentArtifacts.tsx`, `apps/web/components/project/MeetingList.tsx`) recognize both `meetings/` and `work/meetings/`. Any logic that prepends `meetings/` to a meeting filename targets the new `work/meetings/` location for newly-created meetings while still accepting flat paths read back from disk.

### Daemon write paths

- REQ-LDR-20: Manager toolbox commission and meeting writes (`apps/daemon/services/manager/toolbox.ts`) target `.lore/work/commissions/` and `.lore/work/meetings/` via the helpers from REQ-LDR-5.

- REQ-LDR-21: Meeting record (`apps/daemon/services/meeting/record.ts`) writes to `.lore/work/meetings/<id>.md`.

- REQ-LDR-22: Commission orchestrator writes (`apps/daemon/services/commission/orchestrator.ts`, currently three call sites at lines 348, 653, 1019) target `.lore/work/commissions/`. The orchestrator does not retain knowledge of the flat path on the write side.

- REQ-LDR-23: Outcome triage (`apps/daemon/services/outcome-triage.ts`) computes its activity-type subdirectory under `.lore/work/` (`.lore/work/commissions/`, `.lore/work/meetings/`). Triage reads use the dual-read helpers; triage writes target the new location.

- REQ-LDR-24: Workspace issue create (`apps/daemon/routes/workspace-issue.ts`) creates `.lore/work/issues/` lazily and writes new issues there.

### Squash-merge auto-resolution and sparse checkout

- REQ-LDR-25: Squash-merge auto-resolution at `apps/daemon/lib/git.ts` and `apps/daemon/services/workspace.ts` (the `f.startsWith(".lore/")` rule) is layout-independent and continues to apply unchanged. Files under `.lore/work/` inherit the same auto-theirs policy as flat-layout files. The spec records this as confirmed behavior, not a code change.

- REQ-LDR-26: Sparse checkout in `apps/daemon/services/commission/orchestrator.ts` (currently `[".lore/"]`) is layout-independent and continues to apply unchanged. The `work/` subdirectory is included by the existing pattern. The spec records this as confirmed behavior, not a code change.

### LLM-facing strings

These are documentation-as-instruction surfaces. Workers read them to find files. Each must teach the new layout while remaining accurate about the dual-layout reality.

- REQ-LDR-27: The briefing prompt at `apps/daemon/services/briefing-generator.ts:80-83` enumerates the new layout. The list mentions `.lore/work/commissions/`, `.lore/work/meetings/`, `.lore/work/specs/`, `.lore/work/plans/`, `.lore/work/issues/`, `.lore/work/notes/`, `.lore/work/research/`, `.lore/work/retros/`, `.lore/work/brainstorm/`, `.lore/work/design/`, `.lore/reference/`, `.lore/learned/`, and the root files (`.lore/heartbeat.md`, `.lore/lore-config.md`, `.lore/lore-agents.md`, `.lore/vision.md`). It states that flat-layout artifacts (e.g., `.lore/specs/foo.md`) are still present and readable in some projects.

- REQ-LDR-28: Tool descriptions in `apps/daemon/services/meeting/toolbox.ts` (lines 48, 257) and `apps/daemon/services/manager/toolbox.ts` (multiple sites) reference `.lore/work/meetings/` and `.lore/work/commissions/` as the write target. Where these strings describe reading, they note that both layouts are accepted.

- REQ-LDR-29: The `add_heartbeat_entry` tool description in `apps/daemon/services/base-toolbox.ts:473` continues to name `.lore/heartbeat.md` (root-level, not subject to the restructure).

- REQ-LDR-30: Workspace issue operation `description` and `sideEffects` strings (`apps/daemon/routes/workspace-issue.ts:242-296`) reference `.lore/work/issues/` as the write target. Read-side descriptions note that both `.lore/issues/` and `.lore/work/issues/` are scanned.

- REQ-LDR-31: Worker postures are updated to reference the new layout where they currently name flat-layout paths:
  - `packages/guild-hall-writer/posture.md`
  - `packages/guild-hall-visionary/posture.md`
  - `packages/guild-hall-researcher/posture.md`
  - `packages/guild-hall-illuminator/posture.md`

  Each posture mentions `.lore/work/<type>/` for in-flight work and notes that flat-layout files remain readable. References to root-level lore (`.lore/vision.md`, `.lore/generated/`) stay unchanged.

- REQ-LDR-32: Worker skills are updated to teach the new layout:
  - `packages/guild-hall-writer/plugin/skills/cleanup-meetings/SKILL.md`
  - `packages/guild-hall-writer/plugin/skills/cleanup-commissions/SKILL.md`
  - `packages/guild-compendium/plugin/skills/propose-entry/SKILL.md`
  - `packages/guild-compendium/plugin/skills/consult-compendium/reference/commissions/*.md`

  Each skill scans both layouts (where it scans) and writes to the `work/` location (where it writes).

- REQ-LDR-33: CLI help and command-description strings update where they name flat-layout paths:
  - `apps/cli/surface.ts` (lines 450, 471, 486, 499, 689 in the discovery report)
  - `apps/cli/help.ts` (line 7)
  - `apps/cli/migrate-content-to-body.ts` (operational dual-layout scan: iterates `.lore/work/commissions/` and `.lore/commissions/` with `work/`-preferred dedup, consistent with REQ-LDR-11)

  Help text describes the new write target; examples may show either layout because reads accept both.

- REQ-LDR-34: The web "discuss artifact" prompt at `apps/web/components/meeting/CreateMeetingButton.tsx:26` continues to render `.lore/${initialArtifact}` verbatim. The string passed in is already a relative path under `.lore/`, so it works for both layouts without code change. The spec records this as confirmed behavior.

### Tests

- REQ-LDR-35: Existing flat-layout tests stay. They are the regression coverage for projects that have not migrated. Renaming or deleting flat-layout fixtures is out of scope.

- REQ-LDR-36: New tests cover the peel behavior in `lib/types.ts:artifactTypeSegment` (work prefix peeled, double-prefixed paths, unknown second segments, root-level files, `learned` label).

- REQ-LDR-37: New tests cover the dual-read merge in `lib/commissions.ts:scanCommissions`, `lib/meetings.ts:scanMeetings`, and the workspace issue list route. Fixtures contain artifacts in both layouts; assertions verify both surface and that duplicate IDs prefer the `work/` copy (REQ-LDR-11).

- REQ-LDR-38: New tests cover dual-write behavior at the daemon write sites: commission orchestrator, manager toolbox, meeting record, outcome triage, workspace issue create. Assertions verify the new path is written and the flat path is not.

- REQ-LDR-39: New tests cover `lib/artifact-grouping.ts:groupKey` and `buildArtifactTree` with mixed-layout artifact lists. The tree must show a single `Specs` group (not separate `Specs` and `Work` groups) when both `specs/foo.md` and `work/specs/bar.md` are present.

- REQ-LDR-40: New tests cover daemon route prefix detection for `work/meetings/` and `work/commissions/` (`apps/daemon/routes/artifacts.ts`).

## Acceptance Criteria

- [ ] `artifactTypeSegment("work/specs/foo.md")` returns `"Spec"`.
- [ ] `artifactTypeSegment("work/learned/lesson.md")` returns `"Learned"`.
- [ ] `artifactTypeSegment("specs/foo.md")` continues to return `"Spec"` (flat layout unchanged).
- [ ] `TYPE_LABELS.learned === "Learned"`.
- [ ] `scanArtifacts` returns artifacts from both `.lore/specs/` and `.lore/work/specs/` when both contain files, with `meta.type === "Spec"` on every result.
- [ ] `recentArtifacts` excludes commissions and meetings regardless of layout, and continues to exclude `heartbeat.md`.
- [ ] `groupKey("work/specs/foo.md") === "specs"`.
- [ ] `buildArtifactTree` produces no top-level `Work` group when given mixed-layout input.
- [ ] `commissionArtifactPath` and `meetingArtifactPath` return paths under `.lore/work/commissions/` and `.lore/work/meetings/` for new writes.
- [ ] A read for a commission ID present only at the flat path resolves successfully.
- [ ] A read for a commission ID present at both paths returns the `work/` copy.
- [ ] `scanCommissions` and `scanMeetings` merge results from both layouts; duplicate IDs prefer `work/`.
- [ ] Workspace issue list returns issues from both `.lore/issues/` and `.lore/work/issues/`.
- [ ] Workspace issue create writes to `.lore/work/issues/`.
- [ ] Daemon `routes/artifacts.ts` resolves `work/meetings/<id>.md` and `work/commissions/<id>.md` through the meeting and commission base-path resolvers, not the integration worktree.
- [ ] Daemon write sites (manager toolbox, commission orchestrator, meeting record, outcome triage) target `.lore/work/...` paths.
- [ ] Briefing prompt, manager and meeting toolbox descriptions, workspace-issue operation descriptions, listed worker postures, and listed worker skills name `.lore/work/<type>/` as the write target and acknowledge dual-layout reads.
- [ ] Squash-merge auto-resolution still applies to `.lore/work/...` files (verified: prefix is `.lore/`).
- [ ] Sparse checkout `.lore/` still includes `.lore/work/...` (verified: pattern matches recursively).
- [ ] All existing tests pass without modification.
- [ ] New tests for peel classification, dual-read merge, dual-write targets, prefix detection, and grouping pass.

## AI Validation

**Defaults apply** plus these custom checks:
- `grep -rn "TYPE_LABELS" lib/` shows `learned: "Learned"` added to the map.
- `grep -rn "work/" lib/types.ts` shows the peel logic in `artifactTypeSegment`.
- `grep -rn '"\.lore", "commissions"' apps/daemon/services/` returns zero hits at write sites (post-implementation).
- `grep -rn '"\.lore", "meetings"' apps/daemon/services/` returns zero hits at write sites.
- `grep -rn '\.lore/commissions/' apps/daemon/services/briefing-generator.ts` returns zero hits or a comment that documents the legacy fallback alongside the new layout.
- `grep -rn 'work/commissions\|work/meetings\|work/issues\|work/specs\|work/plans' apps/daemon/services/ apps/daemon/routes/ packages/` returns hits in the expected files (briefing prompt, toolbox descriptions, postures, skills).
- New files at `.lore/work/commissions/<id>.md` and `.lore/work/meetings/<id>.md` are produced by an end-to-end commission run and a meeting run, respectively.
- A project with a pre-existing `.lore/specs/foo.md` continues to surface `foo.md` as a Spec after the change lands.

## Constraints

- **Coexistence is permanent on the read side.** No phase of this work removes flat-layout reads. Projects that never migrate continue to function indefinitely.
- **Single canonical type label.** `work/` is peeled, not surfaced. UI consumers see one type per artifact, not a `(layoutGroup, type)` tuple.
- **Write-side convergence.** New writes go to `work/` only. The flat-layout write paths are removed at every Guild Hall write site listed in the requirements. Worker plugins that write through their skills are guided by the updated SKILL.md content (REQ-LDR-32) but are not enforced by the daemon write boundary; that is a worker-prompt concern, not a daemon-code concern.
- **Out of scope: archive and generated.** `_archive/` is not addressed. `.lore/generated/` continues to use its raw segment label.
- **Order of implementation matters.** The classification change (REQ-LDR-1, REQ-LDR-2) must land before any consumer change, or downstream filters silently misclassify `work/`-prefixed artifacts as `"work"`. Sequencing is a planning concern; this spec records it as a constraint so the plan honors it.
- **Worker prompt updates are part of the spec.** The LLM-facing strings (REQ-LDR-27 through REQ-LDR-33) are not deferred to a follow-up. A code-only implementation that omits them ships incorrect documentation to workers and produces silent path drift.

## Open Questions

None at draft time.

## References

- Discovery report: `.lore/issues/lore-directory-restructure-discovery.md` (catalogs every assumption point with file:line references)
- Daemon application boundary: `.lore/specs/infrastructure/daemon-application-boundary.md` (write-boundary rules; the daemon owns `.lore/` writes via routes and services)
- Repository layout: `.lore/specs/infrastructure/repository-layout.md` (existing precedent for path-shape specs that span `lib/`, `apps/`, and `packages/`)
