---
title: "Lore directory restructure: discovery"
date: 2026-04-27
status: open
---

## Summary

Today's `.lore/` layout is flat: each artifact type owns a top-level directory (`.lore/specs/`, `.lore/plans/`, `.lore/issues/`, ...). The proposal is to support a second layout where work-in-flight is bucketed under `.lore/work/<type>/...` while the flat layout continues to exist (root-level docs, `.lore/heartbeat.md`, `.lore/commissions/`, `.lore/meetings/`, `.lore/generated/`, etc.). This discovery report catalogues every site in the codebase that assumes the flat layout, so the spec author can decide where to introduce abstraction, where to special-case, and where to let raw paths remain.

The single largest source of layout assumptions is `lib/types.ts:357-378` (`TYPE_LABELS` whitelist + `artifactTypeSegment`). It encodes "first path segment names the type." Roughly thirty other call sites depend on that contract, either by reading the segment, by writing into a hardcoded type subdirectory, or by mentioning the path to the LLM in a tool description or prompt. Fixing the contract in one place propagates; introducing a parallel contract requires updating every consumer.

A secondary cluster is the **commission/meeting** path family. These artifacts are special: their location is computed from a commission/meeting ID, the daemon writes them, and the worker reads them through an activity worktree. Their paths are wired in through `lib/paths.ts`, `lib/commissions.ts`, `lib/meetings.ts`, daemon services and routes, prompts, and the squash-merge auto-resolution logic that treats `.lore/` files as activity-owned.

Findings are presented by category, with sites grouped by which question they raise (path resolution, listing, writing, classification, UI, CLI, toolbox, tests).

Confidence levels:
- **Verified**: I read the source. The line-and-column references are accurate as of the worktree at HEAD.
- **Inferred**: I read enough to understand the role but did not exhaustively trace callers.

---

## 1. Path resolution

These are the central helpers that build filesystem paths into `.lore/`. They are the natural seam for any "old layout vs. new layout" routing.

### 1.1 `lib/paths.ts:83-88` — `commissionArtifactPath(projectPath, commissionId)`

Returns `<projectPath>/.lore/commissions/<commissionId>.md`. **Verified.**

- Assumes commissions live at flat `.lore/commissions/`.
- Used by daemon services that write the commission artifact and by routes that read it.
- Proposed handling: route through a single resolver that knows whether the commission is "work-in-flight" (under `.lore/work/commissions/`) or legacy (`.lore/commissions/`), or keep commissions flat and document them as not subject to the restructure.

### 1.2 `lib/paths.ts:130-146` — `resolveCommissionBasePath`

Picks between integration worktree and the activity worktree. Does not encode `.lore/` itself, but every caller appends `.lore/commissions/<id>.md` to its result. **Verified.**

- Layout-neutral as written, but every caller currently composes the legacy path.
- Proposed handling: add a `commissionRelativePath(commissionId)` companion that returns the relative path within the worktree, so callers stop hand-composing.

### 1.3 `lib/paths.ts:155-171` — `resolveMeetingBasePath`

Same shape as 1.2 for meetings. **Verified.**

### 1.4 `apps/daemon/services/manager/context.ts:296` — `lorePath = path.join(deps.integrationPath, ".lore")`

Roots a generic lore-scan helper. **Verified.**

- Layout-neutral. Listed because callers of this helper layer subdirectory names on top.

### 1.5 `apps/daemon/services/heartbeat/heartbeat-file.ts:223` — `path.join(projectPath, ".lore", "heartbeat.md")`

Heartbeat is a root-level lore file. **Verified.**

- Documented behavior (REQ-HEARTBEAT-…). Proposed handling: leave at root; codify "root-level lore files are not subject to the restructure" in the spec.

### 1.6 `packages/guild-hall-replicate/output.ts:40` — `path.join(basePath, ".lore", "generated")`

Generated images go to a flat root-level directory. **Verified.**

- Same status as heartbeat: root-level, not type-segmented.

---

## 2. Artifact discovery / listing

These sites enumerate the `.lore/` tree and decide what to surface where. They are the second-largest cluster after path resolution.

### 2.1 `lib/artifacts.ts:116-222` — `scanArtifacts(lorePath)`

Recursively walks the lore directory and parses frontmatter. Each result records `relativePath` from the lore root. **Verified.**

- The walk itself is layout-agnostic; it would happily descend into `.lore/work/specs/foo.md` and produce `relativePath: "work/specs/foo.md"`.
- Type classification happens downstream via `artifactTypeSegment`, which only sees the first segment. So a nested file under `.lore/work/` would be classified as type "Work" or fall through to `null`.
- Proposed handling: extend `artifactTypeSegment` to peel a `work/` prefix before extracting the type segment, or restructure classification around a `(layoutGroup, type)` tuple.

### 2.2 `lib/artifacts.ts:299-313` — `recentArtifacts`

Filters out commissions, meetings, and `heartbeat.md` from "recent scrolls." **Verified.**

- Filter uses `meta.type !== "Commission"` (after `artifactTypeSegment`) and the literal `relativePath !== "heartbeat.md"`.
- If new layout introduces e.g. `work/heartbeat.md` or `work/commissions/`, both filters miss.
- Proposed handling: filter by canonical type label, not by raw segment, after fixing classification.

### 2.3 `lib/artifact-grouping.ts:8-12, 45-66, 177-212` — `groupKey`, `groupArtifacts`, `buildArtifactTree`

Grouping is "first path segment as group key." **Verified.**

- A `.lore/work/specs/foo.md` file would produce a top-level "work" group containing every nested artifact, which is probably not what the UI wants.
- Proposed handling: teach the tree builder about a `work/` prefix layer (render `Work/` as a parent directory and continue the existing per-type grouping inside it), or normalize at the `groupKey` boundary.

### 2.4 `lib/artifact-smart-view.ts:18-21` — `EXCLUDED_DIRECTORIES`, `GENERATIVE_INVESTIGATION_SEGMENTS`, `WORK_ITEM_SEGMENTS`

Smart-view filtering relies on `artifactTypeSegment` returning canonical labels (`"Spec"`, `"Plan"`, `"Brainstorm"`, ...). **Verified.**

- Will silently misclassify any artifact whose first segment is `work` if `artifactTypeSegment` is not updated to peel that segment.

### 2.5 `lib/commissions.ts:181` — `scanCommissions` reads `path.join(projectLorePath, "commissions")`

**Verified.**

- Hardcoded to flat `.lore/commissions/`.
- Proposed handling: keep flat (commissions are activity artifacts, not work-in-flight) or thread a "commissions root" path through.

### 2.6 `lib/meetings.ts:127` — `scanMeetings` reads `path.join(projectLorePath, "meetings")`

Same as 2.5. **Verified.**

### 2.7 `apps/daemon/routes/meetings.ts:333, 366` — direct reads under `.lore/meetings/`

**Verified.** Same shape as 2.6, surfaced through route handlers.

### 2.8 `apps/daemon/routes/workspace-issue.ts:115-121, 161-162, 213-214`

Issue list/read/create routes hardcode `path.join(worktreePath, ".lore", "issues")`. **Verified.**

- All three operations read or write into the flat `.lore/issues/` directory.
- Operation `description` strings (lines 242, 244, 261, 279, 296) repeat the path verbatim. These strings are surfaced to the LLM via the operation registry, so they double as a soft contract with workers.

### 2.9 `apps/daemon/routes/artifacts.ts:111-121` — prefix-based base path resolution

Routes choose `meetingsWorktree` vs `commissionsWorktree` vs `integrationWorktree` based on whether the artifact path starts with `meetings/` or `commissions/`. **Verified.**

- Any new layout that prepends `work/` would skip the prefix branches entirely and resolve through the integration worktree, which is incorrect for commission/meeting artifacts under that layout.
- Proposed handling: either keep commission/meeting paths flat or normalize the artifact-path argument before prefix matching.

### 2.10 `apps/daemon/services/briefing-generator.ts:80-83` — prompt mentions

Briefing prompt enumerates the layout to the LLM:
```
- .lore/commissions/ for active and completed commissions
- .lore/plans/ for implementation plans
- .lore/issues/ for known issues
- .lore/notes/ for context on current work
```
**Verified.**

- This is documentation-as-instruction. Adding a `work/` layout requires updating the prompt or the worker will not find files where it looks.

---

## 3. Artifact writing

Sites that produce new files in `.lore/`. They are the riskiest to leave alone because they decide what the new layout actually contains.

### 3.1 `apps/daemon/services/manager/toolbox.ts:418, 664, 698`

Manager toolbox writes meeting and commission artifacts into hardcoded `.lore/meetings/` / `.lore/commissions/`. **Verified.**

### 3.2 `apps/daemon/services/meeting/record.ts:44`

Returns `path.join(projectPath, ".lore", "meetings", `${meetingId}.md`)`. **Verified.**

### 3.3 `apps/daemon/services/commission/orchestrator.ts:348, 653, 1019`

Three sites build `path.join(iPath, ".lore", "commissions")`. **Verified.**

### 3.4 `apps/daemon/services/outcome-triage.ts:206, 212, 232`

Computes `subdir = activityType === "commission" ? "commissions" : "meetings"` and joins onto `.lore/`. **Verified.**

### 3.5 `apps/daemon/services/meeting/toolbox.ts:48, 257`

LLM-facing tool descriptions mention `.lore/` paths. **Verified.** Same documentation-as-instruction concern as 2.10 and 2.8.

### 3.6 `apps/daemon/routes/workspace-issue.ts:118` — `mkdir` of `.lore/issues/`

**Verified.** Issue-create route owns directory creation. If new layout splits issues across `work/issues/` and root `issues/`, this site decides which one.

### 3.7 `apps/daemon/services/base-toolbox.ts:473`

Heartbeat `add_heartbeat_entry` tool description names `.lore/heartbeat.md` to the LLM. **Verified.**

### 3.8 `packages/guild-hall-writer/plugin/skills/cleanup-meetings/SKILL.md`, `cleanup-commissions/SKILL.md`

Worker skills tell the LLM to scan, write retros into, and delete files under `.lore/meetings/`, `.lore/commissions/`, `.lore/issues/`, `.lore/specs/`, `.lore/retros/`. **Verified.**

- These are LLM instructions, not code paths. They will produce wrong behavior if the directory contract changes silently.

### 3.9 `packages/guild-compendium/plugin/skills/propose-entry/SKILL.md`, `consult-compendium/reference/commissions/*.md`

Compendium skills point workers at `.lore/issues/`, `.lore/research/`, `.lore/plans/`, `.lore/commissions/`. **Verified.**

### 3.10 `packages/guild-hall-writer/posture.md:5`, `guild-hall-visionary/posture.md:4-23`, `guild-hall-researcher/posture.md:11-19`, `guild-hall-illuminator/posture.md:4-41`

Worker postures reference `.lore/brainstorm/`, `.lore/issues/`, `.lore/research/`, `.lore/retros/`, `.lore/vision.md`, `.lore/generated/`. **Verified.**

- Postures are persona-level instructions read by the SDK at session start.

---

## 4. Type classification

The choke point. If the contract here changes, the bulk of UI and filtering follows.

### 4.1 `lib/types.ts:357-378` — `TYPE_LABELS`, `artifactTypeSegment`

Whitelists thirteen top-level directories: `specs`, `plans`, `brainstorm`, `issues`, `research`, `retros`, `design`, `reference`, `notes`, `tasks`, `diagrams`, `meetings`, `commissions`. **Verified.**

- Returns `null` for files at root.
- Returns the raw segment for unknown segments (so a new `work/` segment would yield `"work"` as the label, not `"Spec"` or similar).
- Every UI surface that asks "what type is this artifact?" funnels through here.

**Open structural question (see §9):** does `work/` become a recognized top-level segment that translates to a layout-group label, or does the function peel `work/` and look at the second segment?

### 4.2 `lib/artifact-smart-view.ts:18-24, 27-48`

Sets that depend on canonical labels from `artifactTypeSegment`. See 2.4. **Verified.**

### 4.3 `lib/artifact-grouping.ts:8-12`

Group key uses the raw first segment. See 2.3. **Verified.**

### 4.4 Root-level lore files: `.lore/heartbeat.md`, `.lore/lore-config.md`, `.lore/lore-agents.md`, `.lore/vision.md`

`artifactTypeSegment` returns `null` for these (no slash). **Verified by reading 4.1; confirmed by Grep across the repo.**

- The current code special-cases each of them by literal filename in the few places they matter.
- Proposed handling: spec should declare these "non-typed lore" and codify the rule, since the new layout will need to either preserve them at root or relocate them.

### 4.5 `.lore/reference/`, `.lore/learned/`

`reference` is in `TYPE_LABELS` and treated as a type. `learned` is not in `TYPE_LABELS`. **Verified.**

- `learned` artifacts (if any exist) would get the raw segment `"learned"` as label, not a canonical name. Whether that is a bug or intentional should be answered by the spec.

---

## 5. UI surfaces

Most UI consumes the lib helpers above and inherits whatever contract they implement. A few sites have their own assumptions.

### 5.1 `apps/web/app/projects/[name]/artifacts/[...path]/page.tsx:199-205`

Detects meeting artifacts via `relativePath.startsWith("meetings/")` and routes to the live meeting view. **Verified.**

### 5.2 `apps/web/components/dashboard/RecentArtifacts.tsx:33-49` — `artifactHref`

Same prefix check; routes meeting artifacts differently. **Verified.**

### 5.3 `apps/web/components/project/MeetingList.tsx:75-80`

Computes the artifact path for closed meetings: prepends `meetings/` if missing. **Verified.**

### 5.4 `apps/web/components/artifact/MetadataSidebar.tsx:20-33`

Strips a leading `.lore/` prefix from `related` paths so they can be linked. The function does not assume a type segment; it just normalizes. **Verified.**

### 5.5 `apps/web/components/artifact/ArtifactProvenance.tsx:59, 70`

Displays the path to the user as `.lore/<relativePath>`. **Verified.** Display only.

### 5.6 `apps/web/components/meeting/CreateMeetingButton.tsx:26`

Builds an LLM-facing prompt that says `Discussing artifact: .lore/${initialArtifact}`. **Verified.**

### 5.7 `apps/web/lib/resolve-image-src.ts:5, 22-25`

Documents and implements that image `src` paths starting with `/` are resolved from the `.lore/` root. **Verified.** Layout-neutral but worth noting because image paths embedded in markdown will continue to be evaluated against the lore root regardless of the file's own location.

### 5.8 `apps/web/components/commission/CommissionList.tsx:115`, `commission/CommissionView.tsx`, etc.

URL paths under `/projects/<name>/commissions/<id>` and `/meetings/<id>` are layout-independent (routed by ID, not by file location). **Verified.**

---

## 6. CLI surface

### 6.1 `apps/cli/surface.ts:450, 471, 486, 499, 689`

CLI command descriptions and examples mention `.lore/issues/`, `.lore/`, `specs/foo.md`, `designs/schema.md`, and "pending `.lore/` changes." **Verified.**

- These strings are documentation users read; they also flow into `--help` output.
- The CLI itself defers to daemon operations for the actual writes (`workspace.issue.create`, `workspace.artifact.document.list`, `workspace.git.lore.commit`), so behavior follows whatever the daemon does.

### 6.2 `apps/cli/help.ts:7`, `apps/cli/migrate-content-to-body.ts`

References to `.lore/specs/...` and `.lore/plans/...` exist only in comments documenting where the spec lives. **Verified.**

---

## 7. Toolbox operations and worker prompts

These are the LLM-facing surfaces. They cannot be "abstracted away" — the worker reads them as instructions.

### 7.1 Operation descriptions — `apps/daemon/routes/workspace-issue.ts:242-296`

Three operation `description` and `sideEffects` strings name `.lore/issues/` directly. **Verified.**

### 7.2 Tool descriptions — `apps/daemon/services/meeting/toolbox.ts:48, 257`, `apps/daemon/services/manager/toolbox.ts` (multiple), `apps/daemon/services/base-toolbox.ts:473`

Tool descriptions surfaced to the SDK reference `.lore/`-rooted paths. **Verified.**

### 7.3 Worker postures and skills — see §3.8, §3.9, §3.10

Skill markdown files (in worker plugins) and `posture.md` files describe the layout to the worker. **Verified.**

### 7.4 Briefing prompt — `apps/daemon/services/briefing-generator.ts:80-83`

Briefing template names `.lore/<type>/` directories to the LLM. **Verified.**

---

## 8. Tests

These tests will need parallel coverage for any new layout, and many will need updates if the directory contract changes. Confidence: **inferred** (I located the test files but did not read each in full).

### lib/tests
- `lib/tests/artifacts.test.ts` — exercises `scanArtifacts` against fixture trees.
- `lib/tests/artifact-grouping.test.ts` — depends on `groupKey` behavior.
- `lib/tests/artifact-smart-view.test.ts` — depends on canonical type labels.
- `lib/tests/artifact-tag-view.test.ts` — type-segment dependent.
- `lib/tests/commissions.test.ts`, `lib/tests/meetings.test.ts` — exercise scanners with hardcoded subdirectory names.
- `lib/tests/workspace-scoping.test.ts` — references `commissions/`, `meetings/`.

### apps/daemon/tests
- `apps/daemon/tests/services/outcome-triage.test.ts:152, 193, 233, 255, 781` — creates fixture dirs at `.lore/commissions/` and `.lore/meetings/`.
- `apps/daemon/tests/services/meeting/record.test.ts:22-23`, `meeting/orchestrator.test.ts:376, 690-691`, `meeting/recovery.test.ts:340-373`, `meeting/session-loop.test.ts` (many) — fixture meeting dirs.
- `apps/daemon/tests/services/manager-toolbox.test.ts:34-37`, `manager-context.test.ts:23-26` — fixture commission and meeting dirs.
- `apps/daemon/tests/meeting-project-scope.test.ts:383, 538, 822, 844, 864` — same.
- `apps/daemon/tests/services/briefing-generator.test.ts:97-100, 554` — fixture commissions/meetings.
- `apps/daemon/tests/services/heartbeat/heartbeat-file.test.ts:21-51`, `heartbeat-service.test.ts:38`, `heartbeat/condensation.test.ts:24, 409` — root-level `.lore/heartbeat.md`.
- `apps/daemon/tests/routes/workspace-issue.test.ts` — exercises issue routes.
- `apps/daemon/tests/routes/git-lore.test.ts`, `routes/admin.test.ts`, `routes/meetings.test.ts` — touch `.lore/`.
- `apps/daemon/tests/integration.test.ts`, `notes-generator.test.ts`, `meeting-toolbox.test.ts`, `meeting-session.test.ts`, `transcript.test.ts`, `services/manager-worker.test.ts`, `services/workspace.test.ts`, `services/commission/orchestrator.test.ts`, `services/meeting/orchestrator.test.ts`, `lib/escalation.test.ts`, `base-toolbox.test.ts` — present in the file list; specific assertion locations not enumerated.

### apps/web/tests
- `apps/web/tests/components/metadata-sidebar.test.ts`, `recent-artifacts-merge.test.ts`, `artifact-provenance.test.ts`, `commission-list.test.tsx`, `commission-queued.test.tsx`, `commission-view.test.tsx`, `dashboard-commissions.test.ts`, `meeting-list.test.ts`, `meeting-view-enhanced.test.tsx`, `active-meeting-card.test.ts`, `pending-audiences.test.tsx`, `worker-picker.test.tsx`, `lib/resolve-image-src.test.ts`, `api/commissions.test.ts`, `integration/navigation.test.ts` — all reference flat-layout paths.

### apps/cli/tests
- `apps/cli/tests/commission-format.test.ts`, `migrate-content-to-body.test.ts`, `surface-structural.test.ts` — reference flat-layout paths.

### packages/tests
- `packages/tests/worker-roster.test.ts` — references commission/meeting paths.

Proposed handling: spec should declare whether existing tests cover only the legacy layout (and the new layout gets parallel coverage), or whether the test fixtures should be parameterized over layout.

---

## 9. Open structural questions

These are the decisions a spec must answer. I am not making recommendations — they are the trade-off space.

### 9.1 What does "coexistence" mean for a single project?

Two readings, with different blast radius:

- **Reading A**: All artifacts of type T live in either `.lore/<T>/` or `.lore/work/<T>/`, never both. The choice is per-project (or per-type, per-project) and the system needs to discover which.
- **Reading B**: Both can exist concurrently in the same project. A spec might live at `.lore/specs/foo.md` (legacy) and `.lore/work/specs/bar.md` (new) at the same time. UI must merge them.

Most current code paths assume a single source of truth and would silently miss artifacts in the other location.

### 9.2 Which lore is "in flight" vs. "settled"?

The proposal name `work/` implies a lifecycle distinction (work-in-flight vs. archived/settled). Concrete questions:

- Do commissions and meetings move under `work/` (they are inherently in-flight) or stay flat?
- Does an artifact migrate between `.lore/work/specs/foo.md` and `.lore/specs/foo.md` when it transitions from draft to approved? If so, who moves it?
- Does the spec want `_archive/` to also become a layout group (paralleling `work/`)?

### 9.3 Type segment: peel or keep?

If the spec wants `work/specs/foo.md` to classify as a Spec, `artifactTypeSegment` must peel the `work/` prefix. That changes the function signature and every caller's mental model. If the spec wants the layout group to be a separate axis (`{ layoutGroup: "work", type: "Spec" }`), the contract becomes a tuple and consumers split into "ones that care about layout group" and "ones that care about type."

### 9.4 Root-level lore files

`heartbeat.md`, `lore-config.md`, `lore-agents.md`, `vision.md`, and (if introduced) the squash-merge `.lore/` rule all live or filter at the lore root. Decide whether root-level files are a permanent part of the layout or themselves migrate.

### 9.5 Squash-merge auto-resolution

`apps/daemon/lib/git.ts:617-618`, `apps/daemon/services/workspace.ts:284-285`: conflicts on files matching `f.startsWith(".lore/")` are auto-resolved with `--theirs`. This is layout-independent (matches anything under `.lore/`), so a `work/` migration does not break it. Worth confirming the spec is fine with `work/` files inheriting the same auto-resolve policy as flat lore.

### 9.6 Worker-facing instructions

LLM-visible strings (briefing prompt, tool descriptions, operation descriptions, skill files, posture files) currently teach workers the flat layout. Decide whether:

- Workers are taught the new layout and learn to handle both.
- Workers are taught only the active layout for the current project.
- The system rewrites paths transparently and workers stay layout-agnostic.

### 9.7 Sparse checkout

`apps/daemon/services/commission/orchestrator.ts:1295`: activity worktrees sparse-check `[".lore/"]`. This is layout-independent today. If `work/` lives outside `.lore/` (e.g., `.lore-work/`), this needs updating. If it lives inside `.lore/`, no change needed.

### 9.8 Generated assets and root-level subdirectories

`.lore/generated/` (Replicate output) is a flat directory not in `TYPE_LABELS`. It would currently classify as `"generated"` raw segment, not a canonical label. Decide whether `generated/` is a "type" or a "non-typed bucket" (mirrors the heartbeat question).

---

## 10. Recommended next steps

Discovery is exhaustive enough to write a spec. The spec should answer §9.1 first (single-source vs. concurrent coexistence), then §9.3 (peel vs. tuple). Those two decisions cascade into every other site.

Concrete sequencing the spec author can use:

1. **Decide the model** (questions in §9). Without these answers, every code change is speculative.
2. **Update `lib/types.ts:TYPE_LABELS` and `artifactTypeSegment`** to match the chosen model. This is the choke point. Verify against `lib/tests/artifact-grouping.test.ts`, `artifact-smart-view.test.ts`, `artifact-tag-view.test.ts`.
3. **Update `lib/artifact-grouping.ts:groupKey, buildArtifactTree`** so the UI tree renders the chosen model.
4. **Update `lib/artifacts.ts:recentArtifacts`** filter to use canonical labels rather than raw segments.
5. **Decide commission/meeting placement**. If they stay flat, document it and the changes stop here for those types. If they move under `work/`, every site in §1.1, §1.2, §1.3, §3.1-§3.4, §2.5-§2.9 needs an update, plus tests in §8.
6. **Update LLM-facing strings** (§7) only after the code contract is settled.
7. **Add parallel test fixtures** for the new layout. The flat-layout fixtures in §8 are extensive enough that "rewrite in place" risks losing coverage of legacy projects.

The discovery surface is large but concentrated: roughly 80 percent of the work is in `lib/types.ts`, `lib/artifact-grouping.ts`, `lib/artifact-smart-view.ts`, `lib/artifacts.ts`, and the commission/meeting orchestrator paths. The remaining 20 percent is LLM-facing prose and tests.
