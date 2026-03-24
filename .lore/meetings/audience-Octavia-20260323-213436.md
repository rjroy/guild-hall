---
title: "Brainstorm: Artifact Provenance & Worker Attribution"
date: 2026-03-24
status: closed
tags: [meeting]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
agenda: "Discussing artifact: .lore/brainstorm/artifact-provenance-worker-attribution.md"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: 2026-03-24T04:34:36.111Z
    event: opened
    reason: "User started audience"
  - timestamp: 2026-03-24T04:34:42.797Z
    event: renamed
    reason: "Renamed to: Brainstorm: Artifact Provenance & Worker Attribution"
  - timestamp: 2026-03-24T04:38:15.497Z
    event: closed
    reason: "User closed audience"
---
**MEETING NOTES: Guild Hall Audience with Octavia - 2026-03-24**

**Discussion Summary**

Octavia presented findings from the artifact provenance brainstorm addressing the empty "Source information unavailable" state in the ArtifactProvenance component. The investigation identified reliable attribution data already present in artifacts: commission and meeting artifacts carry `worker` and `workerDisplayTitle` in frontmatter extras; some brainstorms include an `author` field; specs and plans have no machine attribution. Portrait URLs exist in worker package metadata via the `/system/packages/worker/list` endpoint. The recommended approach is frontend-only: the artifact page resolves attribution from these sources, fetches the worker roster for portrait URLs, and passes resolved data as props to ArtifactProvenance. Unattributed artifacts hide the source row entirely rather than displaying a broken state. Guild Master requires a hardcoded portrait path fallback since it is built-in rather than a discovered package.

A second discussion point addressed scope of the Guild Compendium. The user highlighted that a prior brainstorm statement ("the Illuminator doesn't need to know about spec writing") was too narrow. Art styles—lighting, composition, color palettes, visual consistency—are legitimate craft knowledge stored in the compendium, particularly for visual design workers who cannot maintain consistency across sessions without persistent reference material. Octavia acknowledged the reasoning conflated software engineering practices with craft knowledge broadly, and confirmed art direction is a strong compendium use case with existing support in the plugin structure (`domain: visual-design` frontmatter).

**Key Decisions**

Artifact provenance implementation: frontend-only, no daemon changes. Priority order for attribution: (1) structured `worker` + `workerDisplayTitle` from commission/meeting services; (2) `author` field from workers; (3) none. Portrait resolution via existing worker list endpoint with Guild Master hardcoded fallback. Conditional rendering: show portrait and attribution text if data present, hide row if absent.

Guild Compendium scope: Illuminator should be included in domain plugin adoption for visual design reference material. The parenthetical exclusion in the compendium brainstorm requires correction.

**Artifacts Referenced**

.lore/brainstorm/artifact-provenance-worker-attribution.md — detailed findings on attribution data sources, portrait resolution strategy, and recommended component props structure.

.lore/brainstorm/guild-compendium-as-plugin.md — compendium architecture brainstorm; line 214 contains the parenthetical statement flagged for correction.

**Open Items**

Update guild-compendium-as-plugin.md to remove or correct the statement excluding Illuminator from compendium adoption. Consider creating initial visual-design reference entries (portrait style guide, color palette standards, composition guidelines) as part of compendium population. Specification of ArtifactProvenance component props and artifact page attribution resolution logic ready for next phase if direction is approved.
