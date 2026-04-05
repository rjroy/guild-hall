---
title: "Commission: Spec: Tag View for Artifact Browser"
date: 2026-04-05
status: completed
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a small spec for the issue described in `.lore/issues/tag-view.md`.\n\nThe issue: The artifact browser has \"Smart View\" and \"Tree View\" modes. It needs a \"Tag View\" that shows all tags from lore file YAML frontmatter, ordered by matching file count (descending). Selecting a tag filters to files with that tag. Only tags with more than 1 matching file appear in the tag list.\n\nInvestigate the current artifact browser infrastructure to understand:\n- How Smart View and Tree View are implemented (components, state, data flow)\n- How artifacts are loaded and what tag data is available from frontmatter\n- The existing view-switching mechanism\n\nThen write a spec covering:\n- The tag list panel (extraction from frontmatter, count computation, ordering, filtering to >1 match)\n- Tag selection behavior (filtering artifacts, multi-select if it makes sense)\n- Integration with the existing view switcher\n- How it reuses existing artifact list/display components\n\nReference the existing Smart View spec at `.lore/specs/ui/artifact-smart-views.md` for patterns and conventions.\n\nPlace the spec at `.lore/specs/ui/artifact-tag-view.md`. Use standard spec format with YAML frontmatter. Keep the requirement count small since this is a focused feature that parallels existing view modes."
dependencies: []
linked_artifacts:
  - .lore/specs/ui/artifact-tag-view.md

  - .lore/issues/tag-view.md
  - .lore/issues/tag-view.md
activity_timeline:
  - timestamp: 2026-04-05T14:10:39.557Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-05T14:10:39.559Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-05T14:10:39.610Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-05T14:10:45.178Z
    event: progress_report
    reason: "Starting investigation of artifact browser infrastructure: view modes, data flow, and tag availability."
  - timestamp: 2026-04-05T14:11:17.820Z
    event: progress_report
    reason: "Infrastructure investigation complete. Tags already available on Artifact.meta.tags. View switching uses ephemeral React state with sub-tab buttons. Smart View provides the pattern for filter-bar + filtered list display. Writing the spec now."
  - timestamp: 2026-04-05T14:12:44.476Z
    event: result_submitted
    reason: "Wrote spec at `.lore/specs/ui/artifact-tag-view.md` covering the Tag View feature for the artifact browser.\n\n**What I investigated:**\n- `ArtifactList.tsx`: view switcher uses ephemeral `viewMode` state (`\"smart\" | \"tree\"`), sub-tab buttons, and conditionally renders Smart View filter bar or Tree View\n- `lib/artifact-smart-view.ts`: pure filtering/counting functions over `Artifact[]`, exports `filterSmartView`, `smartViewCounts`, display helpers\n- `lib/types.ts`: `ArtifactMeta.tags` is `string[]`, already parsed from YAML frontmatter, available on every artifact\n\n**Spec contents (13 requirements, REQ-TAGVIEW-1 through REQ-TAGVIEW-13):**\n- Sub-tab integration: third \"Tag View\" option, ephemeral state\n- Tag extraction: compute index from `meta.tags`, count per tag, filter to >1, order by count desc then alpha\n- Tag list panel: horizontal bar of buttons with count badges, reusing filter bar styling\n- Tag selection: single-select, click-to-toggle, filters artifact list to matching items\n- Item display: reuses Smart View's item layout (title, gem, type, domain, date)\n- Data flow section showing pure computation path, no new API needed\n- New `lib/artifact-tag-view.ts` module following the `artifact-smart-view.ts` pattern\n- Scope exclusions: multi-tag select, search, editing, hierarchy\n- AI validation with 8 custom test cases\n\nAlso linked the issue (`tag-view.md`) to the new spec via `related` frontmatter."
  - timestamp: 2026-04-05T14:12:49.426Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Infrastructure investigation complete. Tags already available on Artifact.meta.tags. View switching uses ephemeral React state with sub-tab buttons. Smart View provides the pattern for filter-bar + filtered list display. Writing the spec now."
projectName: guild-hall
---
Wrote spec at `.lore/specs/ui/artifact-tag-view.md` covering the Tag View feature for the artifact browser.

**What I investigated:**
- `ArtifactList.tsx`: view switcher uses ephemeral `viewMode` state (`"smart" | "tree"`), sub-tab buttons, and conditionally renders Smart View filter bar or Tree View
- `lib/artifact-smart-view.ts`: pure filtering/counting functions over `Artifact[]`, exports `filterSmartView`, `smartViewCounts`, display helpers
- `lib/types.ts`: `ArtifactMeta.tags` is `string[]`, already parsed from YAML frontmatter, available on every artifact

**Spec contents (13 requirements, REQ-TAGVIEW-1 through REQ-TAGVIEW-13):**
- Sub-tab integration: third "Tag View" option, ephemeral state
- Tag extraction: compute index from `meta.tags`, count per tag, filter to >1, order by count desc then alpha
- Tag list panel: horizontal bar of buttons with count badges, reusing filter bar styling
- Tag selection: single-select, click-to-toggle, filters artifact list to matching items
- Item display: reuses Smart View's item layout (title, gem, type, domain, date)
- Data flow section showing pure computation path, no new API needed
- New `lib/artifact-tag-view.ts` module following the `artifact-smart-view.ts` pattern
- Scope exclusions: multi-tag select, search, editing, hierarchy
- AI validation with 8 custom test cases

Also linked the issue (`tag-view.md`) to the new spec via `related` frontmatter.
