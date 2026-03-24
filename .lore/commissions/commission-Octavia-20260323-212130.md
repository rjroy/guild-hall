---
title: "Commission: Specify: Artifact Provenance Worker Attribution"
date: 2026-03-24
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec from the brainstorm at `.lore/brainstorm/artifact-provenance-worker-attribution.md`.\n\nThe brainstorm is thorough and data-driven. Your job is to distill it into a spec with testable requirements. Key decisions from the brainstorm:\n\n1. **Attribution data passed as props** to `ArtifactProvenance`. The artifact page (server component) resolves attribution before rendering. No client-side fetching.\n\n2. **Three-source priority**: (1) `extras.worker` + `extras.workerDisplayTitle` for commission/meeting artifacts, (2) `extras.author` for brainstorms, (3) no attribution → hide the row entirely.\n\n3. **Portrait resolution**: Fetch `/system/packages/worker/list` from the artifact page, build a name-keyed lookup, resolve `portraitUrl` by display name. Guild Master gets a hardcoded fallback (it's built-in, not a package).\n\n4. **Commission linking** (Option C from brainstorm): Commission artifacts show worker portrait + link to the commission. Meeting/brainstorm artifacts show worker portrait + \"Written by [Name]\". No attribution → hide the source row entirely (don't show \"Source information unavailable\").\n\n5. **No daemon changes needed.** All data is already available. The worker roster fetch is the only new fetch on the artifact page.\n\n6. **Old-format artifacts** (`worker: guild-hall-writer`) gracefully fall back to no attribution. No migration needed.\n\nThe spec should cover:\n- The `ArtifactProvenance` prop interface (the `attribution` object shape)\n- The attribution resolution logic on the artifact page\n- The portrait lookup mechanism (worker list fetch, name-keyed map, Guild Master fallback)\n- Conditional rendering rules (what shows when, what hides)\n- Text framing per artifact type (commission with link, meeting/brainstorm without)\n- CSS considerations (the component already has expanded/condensed states)\n- What the spec explicitly excludes (no daemon changes, no migration of old artifacts, no automatic attribution for human-written artifacts)\n\nPlace the spec at `.lore/specs/ui/artifact-provenance-worker-attribution.md`."
dependencies: []
linked_artifacts:
  - .lore/specs/ui/artifact-provenance-worker-attribution.md

activity_timeline:
  - timestamp: 2026-03-24T04:21:30.230Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T04:21:30.232Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-24T04:21:30.274Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-24T04:21:36.735Z
    event: progress_report
    reason: "Reading brainstorm and relevant source files to understand current state before drafting spec."
  - timestamp: 2026-03-24T04:22:19.739Z
    event: progress_report
    reason: "All source material read. Drafting the spec now. Key inputs: brainstorm, ArtifactProvenance.tsx, artifact page.tsx, WorkerPortrait.tsx, workers.ts route, CommissionMeta type, ArtifactMeta type, existing spec conventions."
  - timestamp: 2026-03-24T04:26:39.476Z
    event: result_submitted
    reason: "Wrote spec at `.lore/specs/ui/artifact-provenance-worker-attribution.md` with 19 requirements (REQ-AWA-01 through REQ-AWA-19) covering: Attribution prop interface, three-source resolution priority chain, portrait lookup via daemon API with Guild Master fallback, conditional rendering (hide source row when no attribution), text framing per artifact type (commission link vs. plain \"Written by\"), CSS considerations, and condensed state behavior. Exclusions section explicitly scopes out daemon changes, old-format migration, automatic human attribution, image artifact attribution, and condensed-state attribution. Ran fresh-context spec review; incorporated three fixes: simplified portrait map shape (dropped unused displayTitle), referenced MANAGER_PORTRAIT_PATH constant, and added empty-string commission title edge case."
  - timestamp: 2026-03-24T04:26:45.846Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All source material read. Drafting the spec now. Key inputs: brainstorm, ArtifactProvenance.tsx, artifact page.tsx, WorkerPortrait.tsx, workers.ts route, CommissionMeta type, ArtifactMeta type, existing spec conventions."
projectName: guild-hall
---
Wrote spec at `.lore/specs/ui/artifact-provenance-worker-attribution.md` with 19 requirements (REQ-AWA-01 through REQ-AWA-19) covering: Attribution prop interface, three-source resolution priority chain, portrait lookup via daemon API with Guild Master fallback, conditional rendering (hide source row when no attribution), text framing per artifact type (commission link vs. plain "Written by"), CSS considerations, and condensed state behavior. Exclusions section explicitly scopes out daemon changes, old-format migration, automatic human attribution, image artifact attribution, and condensed-state attribution. Ran fresh-context spec review; incorporated three fixes: simplified portrait map shape (dropped unused displayTitle), referenced MANAGER_PORTRAIT_PATH constant, and added empty-string commission title edge case.
