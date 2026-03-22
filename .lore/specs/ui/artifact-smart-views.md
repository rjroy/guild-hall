---
title: Artifact Smart Views
date: 2026-03-21
status: approved
tags: [ui, artifacts, navigation, filtering, smart-views, gem-mapping]
modules: [artifact-browser, artifact-list, artifact-grouping]
related:
  - .lore/specs/ui/artifact-tree-view.md
  - .lore/specs/ui/artifact-sorting.md
  - .lore/specs/ui/guild-hall-views.md
  - .lore/specs/ui/commission-list-filtering.md
  - .lore/research/file-browsing-ux-patterns.md
req-prefix: SMARTVIEW
---

# Spec: Artifact Smart Views

## Overview

The artifact browser surfaces artifacts through a collapsible directory tree. This works for structural browsing ("show me the infrastructure specs") but fails for the three questions users actually ask: "What's next?", "What deserves more thought?", and "Where's the work I can commission forward?" All three cut across directories. The directory path is important metadata about an artifact's type and domain, but it is not how users find artifacts.

This spec introduces smart views as the default landing in the artifacts tab, with the existing tree available as a secondary mode. It also corrects the gem mapping for `approved`, which was placed in the active (green) group as a workaround for the missing navigation.

## The Principle

Directory is data, not navigation. The first path segment is the artifact's type (spec, plan, brainstorm, issue). The second segment, when present, is its domain (infrastructure, commissions, ui). Both are displayed as metadata on each item, alongside status, date, and tags. The tree survives as a structural browsing mode, but it is no longer the front door.

## Entry Points

- Clicking the "Artifacts" tab on the project page (from Project view)
- Direct URL to `/projects/[name]?tab=artifacts`

## Requirements

### Sub-tab navigation

- REQ-SMARTVIEW-1: The artifacts tab contains two sub-tabs: "Smart View" (default) and "Tree View."
- REQ-SMARTVIEW-2: Smart View is shown by default when entering the artifacts tab. Tree View shows the existing tree implementation, unchanged.
- REQ-SMARTVIEW-3: Sub-tab selection is ephemeral React state. No URL persistence required.

### Smart view filters

- REQ-SMARTVIEW-4: The smart view has three filter options: "What's Next", "Needs Discussion", and "Ready to Advance." Default is "What's Next."
- REQ-SMARTVIEW-5: Each filter shows a badge count of matching artifacts. Counts are computed from the full artifact list at render time.
- REQ-SMARTVIEW-6: "What's Next" shows all artifacts with status in ARTIFACT_STATUS_GROUP 0 (pending gem) OR ARTIFACT_STATUS_GROUP 2 (blocked gem). After the gem correction in REQ-SMARTVIEW-17, Group 0 includes `approved`. Group 2 includes `blocked`, `failed`, and `cancelled`. Both groups represent artifacts that need human attention: orange items are waiting on a decision, red items have a problem to investigate.
- REQ-SMARTVIEW-7: "Needs Discussion" shows artifacts where the first path segment is `brainstorm`, `issues`, or `research` AND the status matches: brainstorms with status `open`, issues with status `open`, research with status `active`. These are exploratory artifacts where the next step is thinking, not commissioning. `parked` brainstorms, `resolved`/`wontfix` issues, and `archived` research are excluded (terminal or deliberately shelved).
- REQ-SMARTVIEW-8: "Ready to Advance" shows artifacts where the status and type signal readiness for the next lifecycle stage: specs with status `approved`, plans with status `approved`, designs with status `approved`. These are artifacts where the next step is commissioning them forward (spec to plan, plan to implementation).
- REQ-SMARTVIEW-9: Filter selection is ephemeral React state.
- REQ-SMARTVIEW-10: The three views are independent cuts of the artifact collection, not nested subsets. An artifact may appear in multiple views (an approved spec appears in both "What's Next" and "Ready to Advance"). An artifact may also appear in no view (completed retros, current references, and other informational types are not surfaced by any filter because they do not require action). The tree view remains the comprehensive view of all artifacts regardless of status.

### Item display

- REQ-SMARTVIEW-11: Each item shows: title, status gem, artifact type, domain (if present), and date. Compact single-row or two-row layout.
- REQ-SMARTVIEW-12: Artifact type is derived from the first segment of the relative path. Mapping: `specs/` to "Spec", `plans/` to "Plan", `brainstorm/` to "Brainstorm", `issues/` to "Issue", `research/` to "Research", `retros/` to "Retro", `design/` to "Design", `reference/` to "Reference", `notes/` to "Notes", `tasks/` to "Task", `diagrams/` to "Diagram". Root-level files show no type label. Artifacts under `meetings/` and `commissions/` are excluded from all smart views (these have dedicated tabs on the project page).
- REQ-SMARTVIEW-13: Domain is derived from the second path segment if present. `specs/infrastructure/` to "Infrastructure", `plans/commissions/` to "Commissions". Files directly in a top-level directory show no domain.
- REQ-SMARTVIEW-14: Type and domain are displayed as lightweight labels, similar to tag badges. They are visual context, not interactive filters.
- REQ-SMARTVIEW-15: Clicking an item navigates to the artifact detail page (`/projects/[name]/artifacts/[path]`).
- REQ-SMARTVIEW-16: Items within each view are sorted by `compareArtifactsByStatusAndTitle` (status group, date descending, title alphabetical). No user-configurable sorting.

### Gem mapping correction

- REQ-SMARTVIEW-17: `approved` moves from ARTIFACT_STATUS_GROUP 1 (active/green) to ARTIFACT_STATUS_GROUP 0 (pending/orange). Semantic: orange means "waiting on human action", green means "work is actively happening."
- REQ-SMARTVIEW-18: The gem mapping change is in `ARTIFACT_STATUS_GROUP` and automatically propagates to all callers of `statusToGem()` and `statusToPriority()`. No per-surface changes needed beyond the data model correction.
- REQ-SMARTVIEW-19: REQ-SMARTVIEW-17 amends the status group table in REQ-SORT-4 of the artifact-sorting spec (`.lore/specs/ui/artifact-sorting.md`). The sorting spec must be updated alongside this implementation to reflect the corrected group assignment for `approved`.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Artifact detail | User clicks an item | `/projects/[name]/artifacts/[path]` |
| Tree view | User clicks "Tree View" sub-tab | Existing tree (unchanged) |
| Commission creation | From artifact detail sidebar | [Spec: guild-hall-views] |
| Meeting request | From artifact detail sidebar | [Spec: artifact-request-meeting] |

## Success Criteria

- [ ] Smart view is the default when entering the artifacts tab
- [ ] All three filters show correct items with accurate badge counts
- [ ] "What's Next" includes all Group 0 and Group 2 artifacts across all directories
- [ ] "Needs Discussion" includes only open brainstorms, open issues, and active research
- [ ] "Ready to Advance" includes only approved specs, plans, and designs
- [ ] Each item displays title, gem, type, domain, and date
- [ ] `approved` renders with the pending (orange) gem on all surfaces
- [ ] Tree view is accessible via sub-tab and unchanged in behavior

## AI Validation

**Defaults:**
- Unit tests with mocked time/network/filesystem/LLM calls
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Test that `approved` maps to ARTIFACT_STATUS_GROUP 0 (gem group change)
- Test each filter returns correct artifacts for a fixture set spanning all directory types and statuses
- Test that badge counts match filtered item counts
- Test items with no second directory segment show type only, no domain
- Test that an approved spec appears in both "What's Next" and "Ready to Advance"
- Test that a `blocked` spec appears in "What's Next" but not "Needs Discussion" or "Ready to Advance"
- Test that `parked` brainstorms do NOT appear in "Needs Discussion"
- Test that `meetings/` and `commissions/` artifacts are excluded from all smart views
- Test that completed retros, current references, and current diagrams appear in no smart view
- Visual verification with 0, 1, and 50+ items per filter

## Constraints

- Tree view implementation is unchanged. This spec adds a new view alongside it.
- No user-configurable sorting (preserves REQ-SORT-1 from artifact-sorting spec).
- No user-created custom views. Three predefined views only.
- The directory-to-type mapping in REQ-SMARTVIEW-12 must stay in sync with the frontmatter schema's document types.
- Artifacts under `meetings/` and `commissions/` are excluded from smart views. These have dedicated tabs.
- Informational artifact types (retros, diagrams, notes, references) may not appear in any smart view filter. This is intentional: these types are not actionable. The tree view remains the comprehensive navigation for all artifacts regardless of status or type.

## Context

**Research.** `.lore/research/file-browsing-ux-patterns.md` surveyed 10 UX patterns for browsing mid-size document collections. Smart views (Pattern 9) ranked highest for impact-to-effort ratio. The research recommended "Needs Attention" / "Recently Modified" / "By Status" as default views. Meeting discussion refined these into three intent-based views mapping to actual workflow questions rather than generic metadata lenses.

**Prior art.** Commission list filtering (`.lore/specs/ui/commission-list-filtering.md`) established the filter-with-counts pattern in this codebase: multi-select status chips, count annotations, ephemeral React state. Smart view filters follow a similar visual pattern but use single-select (one active view at a time) instead of multi-select.

**Gem mapping.** The `approved` to green assignment was a workaround. The user was using gem colors as the only available visual filter for scanning 200 artifacts, and needed to distinguish "ready to commission" from "hasn't started." With smart views providing real navigation, the gem can be corrected to its semantically accurate placement. Orange (pending) consistently means "waiting on human action." Green (active) consistently means "work is happening without human intervention needed."

**Sorting spec.** `.lore/specs/ui/artifact-sorting.md` (REQ-SORT-1) explicitly deferred user-configurable sorting to post-V1. This spec preserves that constraint. Smart views use the same fixed `compareArtifactsByStatusAndTitle` comparator. REQ-SMARTVIEW-17 amends the sorting spec's status group table (REQ-SORT-4) by moving `approved` from Group 1 to Group 0. This changes sorting behavior on all surfaces: `approved` items sort earlier (higher priority). The sorting spec must be updated alongside this implementation.

**Meeting discussion (2026-03-21).** Established three principles that shaped this spec: (1) Directory is metadata (type + domain), not navigation. Users never start with "What specs for UI are in draft?" They start with "What's next?" (2) The three workflow questions ("what's next?", "what deserves more thought?", "where's the work?") all cut across directories. (3) Smart views should be the default landing, with the tree as a secondary mode accessible via sub-tab.
