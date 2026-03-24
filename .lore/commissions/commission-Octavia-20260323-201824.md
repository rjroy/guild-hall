---
title: "Commission: Brainstorm: ArtifactProvenance worker attribution"
date: 2026-03-24
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Brainstorm how to populate the WorkerPortrait in the ArtifactProvenance component, which currently always shows \"Source information unavailable.\"\n\n**Current state:**\n- `ArtifactProvenance.tsx` renders `<WorkerPortrait size=\"sm\" />` with no props (line 59), next to hardcoded \"Source information unavailable.\" text.\n- `WorkerPortrait` already accepts `name`, `title`, and `portraitUrl` props. It shows initials when name is provided but no portrait URL, and \"?\" when nothing is provided.\n- The component was explicitly stubbed for Phase 1 (see the JSDoc comment at line 16-22).\n\n**Data available:**\n- Commission artifacts always have a `worker` field in their frontmatter (the worker package name, e.g., `guild-hall-developer`).\n- Some artifacts (but not all) have an `author` field in their frontmatter.\n- Not all artifacts come from commissions. Meeting artifacts, manually created artifacts, and other artifact types may not have a `worker` field.\n\n**Questions to explore:**\n1. Can we use commission `worker` and/or artifact `author` fields to determine what to show? What's the mapping from package name to display name/title/portrait?\n2. Should we? Is attributing artifacts to workers the right UX, or is there a better framing? (e.g., \"Created during commission X\" vs \"Written by Dalton\")\n3. What about artifacts with no attribution data at all? Keep \"Source information unavailable\" or show something else?\n4. Is this purely a frontend concern (resolve worker metadata from the package name at render time) or does it need daemon support (e.g., a worker metadata endpoint)?\n5. The daemon already has `GET /workers` returning worker roster with metadata. Could the artifact page use that?\n\nWrite up the brainstorm at `.lore/brainstorm/artifact-provenance-worker-attribution.md`."
dependencies: []
linked_artifacts:
  - .lore/brainstorm/artifact-provenance-worker-attribution.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-24T03:18:24.959Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T03:18:24.961Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-24T03:18:25.009Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-24T03:18:30.500Z
    event: progress_report
    reason: "Reading current code state: ArtifactProvenance.tsx, WorkerPortrait component, workers route, and existing brainstorm directory."
  - timestamp: 2026-03-24T03:20:16.780Z
    event: progress_report
    reason: "Read complete: ArtifactProvenance.tsx, WorkerPortrait.tsx, artifact page, worker route, WorkerMetadata type, actual commission/meeting/brainstorm artifact frontmatter, and all worker package.json files. Writing brainstorm now."
  - timestamp: 2026-03-24T03:21:39.430Z
    event: result_submitted
    reason: "Wrote brainstorm to .lore/brainstorm/artifact-provenance-worker-attribution.md.\n\nKey findings from reading the actual code and data:\n\n1. **The data is richer than expected.** Commission and meeting artifacts already have both `worker` (display name, e.g. \"Dalton\") and `workerDisplayTitle` (\"Guild Artificer\") in their frontmatter extras. These were written by the commission/meeting services and are present in every commission/meeting artifact. No schema changes needed to read them.\n\n2. **Portrait lookup is one fetch away.** `/system/packages/worker/list` already returns `portraitUrl` keyed by `displayName`. The artifact page (server component) can fetch this alongside its existing fetches and build a name → portrait map. Guild Master is the only edge case (built-in, not in worker list) — portrait exists at `/images/portraits/guild-master.webp`, needs a hardcode fallback.\n\n3. **This is a frontend concern only.** No new daemon endpoints needed. Attribution data is already in the artifact response (via extras) and the worker roster endpoint.\n\n4. **Recommended approach:** Pass an optional `attribution` prop to `ArtifactProvenance` from the artifact page server component. Page resolves worker name/title/portrait before render. Component hides the source row if attribution is absent (cleaner than \"Source information unavailable.\").\n\n5. **Text framing:** \"Written by Dalton during commission [link]\" for commission artifacts with a resolvable commission. \"Written by Octavia\" for meeting/brainstorm artifacts. Hide row for unattributed plans/specs/retros.\n\n6. **`author` field** is a weaker signal — present on some brainstorm files, written manually by workers, no `workerDisplayTitle` companion. Worth using as a fallback but not the primary path."
  - timestamp: 2026-03-24T03:21:48.563Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read complete: ArtifactProvenance.tsx, WorkerPortrait.tsx, artifact page, worker route, WorkerMetadata type, actual commission/meeting/brainstorm artifact frontmatter, and all worker package.json files. Writing brainstorm now."
projectName: guild-hall
---
Wrote brainstorm to .lore/brainstorm/artifact-provenance-worker-attribution.md.

Key findings from reading the actual code and data:

1. **The data is richer than expected.** Commission and meeting artifacts already have both `worker` (display name, e.g. "Dalton") and `workerDisplayTitle` ("Guild Artificer") in their frontmatter extras. These were written by the commission/meeting services and are present in every commission/meeting artifact. No schema changes needed to read them.

2. **Portrait lookup is one fetch away.** `/system/packages/worker/list` already returns `portraitUrl` keyed by `displayName`. The artifact page (server component) can fetch this alongside its existing fetches and build a name → portrait map. Guild Master is the only edge case (built-in, not in worker list) — portrait exists at `/images/portraits/guild-master.webp`, needs a hardcode fallback.

3. **This is a frontend concern only.** No new daemon endpoints needed. Attribution data is already in the artifact response (via extras) and the worker roster endpoint.

4. **Recommended approach:** Pass an optional `attribution` prop to `ArtifactProvenance` from the artifact page server component. Page resolves worker name/title/portrait before render. Component hides the source row if attribution is absent (cleaner than "Source information unavailable.").

5. **Text framing:** "Written by Dalton during commission [link]" for commission artifacts with a resolvable commission. "Written by Octavia" for meeting/brainstorm artifacts. Hide row for unattributed plans/specs/retros.

6. **`author` field** is a weaker signal — present on some brainstorm files, written manually by workers, no `workerDisplayTitle` companion. Worth using as a fallback but not the primary path.
