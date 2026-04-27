---
title: "Commission: Discovery: lore-development directory restructure (work/reference/learned)"
date: 2026-04-27
status: completed
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "## Context\n\nThe `lore-development` plugin has been refactored. The new convention organizes `.lore/` into three top-level buckets:\n\n- **`.lore/work/<type>/`** — planning and working docs (specs, plans, brainstorm, design, retros, reviews, issues, notes, prototypes, diagrams, research, commissions, meetings, etc.)\n- **`.lore/reference/`** — durable facts (output of the new `/distill` skill, replacing `/excavate`)\n- **`.lore/learned/`** — captured lessons (output of `/learn`)\n\nCurrently `guild-hall` (this repo) hardcodes `.lore/<type>/` paths in many places. The goal is to **support both layouts**: legacy `.lore/<type>/foo.md` AND new `.lore/work/<type>/foo.md`. Coexistence, not migration.\n\nThe existing `.lore/reference/` directory in this repo holds the older excavation outputs (architecture overviews like `artifacts.md`, `cli.md`, etc.). It should keep working under the new convention as the destination for distilled facts.\n\n## Your Task\n\nProduce a **discovery report** cataloging every place in this codebase that assumes the flat `.lore/<type>/` layout. The report becomes the input for a spec.\n\n### Scope\n\nSearch across:\n- `apps/daemon/` — services, routes, lib\n- `apps/cli/` — surface, help, commands\n- `apps/web/` — components, lib\n- `lib/` — shared utilities (paths.ts, artifact-grouping.ts, types.ts, etc.)\n- `packages/` — toolboxes, especially anything that reads/writes lore\n- `plugin/` — Claude plugin manifests, agent definitions\n- All test files\n\n### What to Catalog\n\nFor each assumption point, record:\n1. **File and line** (use `file_path:line` format)\n2. **What it assumes** (e.g., \"hardcodes `.lore/commissions/` for artifact path\", \"groups by first path segment\", \"lore type enum lists 14 directories\")\n3. **Impact** (what breaks if a file lives at `.lore/work/specs/foo.md` instead of `.lore/specs/foo.md`)\n4. **Proposed handling** (resolver helper? glob both? prefer-work-then-fallback?)\n\n### Categories to Surface\n\nGroup findings by category:\n- **Path resolution** — central path helpers, hardcoded type-dir constants\n- **Artifact discovery/listing** — readers that scan `.lore/<type>/` and assume that layout\n- **Artifact writing** — writers that emit to `.lore/<type>/` (commissions, meetings, briefings, triage)\n- **Type classification** — code that infers an artifact's \"type\" from its first path segment (artifact-grouping, smart views, tag views)\n- **UI surfaces** — tree builders, sidebar groupers, dashboards, breadcrumbs\n- **CLI surface** — `workspace.issue.list/read` and any other operations that list lore files\n- **Toolbox operations** — lore-writing tools in worker toolboxes (Octavia, Dalton, etc.)\n- **Tests** — test fixtures that assume the flat layout\n\n### Deliverables\n\nWrite the discovery report as a structured issue at `.lore/issues/lore-directory-restructure-discovery.md`. Use the project's issue format (status: `open`, severity: appropriate). Structure the body as:\n\n1. **Summary** — one paragraph\n2. **Assumption catalog** — sections by category, each finding with file:line + impact + proposed handling\n3. **Open structural questions** — things the spec must decide (e.g., tree nesting behavior, type-classification under `work/`, whether `.lore/reference/` and `.lore/learned/` get special UI treatment)\n4. **Recommended next steps** — what the spec needs to cover\n\nDo not modify any code. Discovery only.\n\n### Important Notes\n\n- Read the project CLAUDE.md and existing relevant specs (`.lore/specs/infrastructure/*.md`) to understand the daemon-application boundary.\n- Read `lib/paths.ts`, `lib/artifact-grouping.ts`, `apps/daemon/services/workspace.ts`, and `apps/daemon/routes/workspace-issue.ts` first — they're the central pieces.\n- The `.lore/heartbeat.md`, `.lore/lore-agents.md`, `.lore/lore-config.md`, and `.lore/vision.md` files are root-level lore files. Note any code that special-cases them.\n- Project memory has a \"Recently Completed\" section listing the last few features — useful for understanding active surfaces.\n\nReport back with the issue file path and a brief summary of the most impactful findings."
dependencies: []
linked_artifacts:
  - .lore/issues/lore-directory-restructure-discovery.md

activity_timeline:
  - timestamp: 2026-04-27T13:26:52.089Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-27T13:26:52.092Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-27T13:26:52.236Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-27T13:27:34.174Z
    event: progress_report
    reason: "Repo loaded after disabling sparse checkout. Reading core path/grouping files first."
  - timestamp: 2026-04-27T13:32:51.056Z
    event: progress_report
    reason: "Survey complete across lib/, apps/daemon, apps/cli, apps/web, packages, and tests. Beginning report write."
  - timestamp: 2026-04-27T13:35:41.139Z
    event: result_submitted
    reason: "Discovery report written to `.lore/issues/lore-directory-restructure-discovery.md`. The report catalogues every site in the codebase that assumes the flat `.lore/<type>/` layout, organized by category: path resolution, listing, writing, type classification, UI surfaces, CLI surface, toolbox/prompt operations, and tests.\n\nKey findings:\n- The single biggest assumption is `lib/types.ts:357-378` — `TYPE_LABELS` whitelists 13 top-level type directories and `artifactTypeSegment` reads \"first path segment names the type.\" Roughly 30 other call sites depend on this contract.\n- The commission/meeting path family is wired through `lib/paths.ts`, `lib/commissions.ts`, `lib/meetings.ts`, and roughly 8 daemon services/routes that hardcode `.lore/commissions/` and `.lore/meetings/`. They are not currently abstracted behind a single resolver.\n- LLM-facing strings (briefing prompt, tool descriptions, operation descriptions, worker skills and postures) teach workers the flat layout. These are documentation-as-instruction and will produce wrong behavior if the directory contract changes silently.\n- Root-level lore files (`heartbeat.md`, `lore-config.md`, `lore-agents.md`, `vision.md`) and root-level subdirectories (`generated/`) are special-cased today — the spec needs to declare whether they remain at root.\n- Squash-merge auto-resolution and sparse-checkout patterns match `.lore/` generically, so they are layout-independent today.\n\nThe report ends with eight open structural questions the spec must answer (single-source vs. concurrent coexistence, peel-vs-tuple type segments, root-level file policy, worker instruction strategy) and a recommended sequencing for spec implementation."
  - timestamp: 2026-04-27T13:35:52.907Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Survey complete across lib/, apps/daemon, apps/cli, apps/web, packages, and tests. Beginning report write."
projectName: guild-hall
---
Discovery report written to `.lore/issues/lore-directory-restructure-discovery.md`. The report catalogues every site in the codebase that assumes the flat `.lore/<type>/` layout, organized by category: path resolution, listing, writing, type classification, UI surfaces, CLI surface, toolbox/prompt operations, and tests.

Key findings:
- The single biggest assumption is `lib/types.ts:357-378` — `TYPE_LABELS` whitelists 13 top-level type directories and `artifactTypeSegment` reads "first path segment names the type." Roughly 30 other call sites depend on this contract.
- The commission/meeting path family is wired through `lib/paths.ts`, `lib/commissions.ts`, `lib/meetings.ts`, and roughly 8 daemon services/routes that hardcode `.lore/commissions/` and `.lore/meetings/`. They are not currently abstracted behind a single resolver.
- LLM-facing strings (briefing prompt, tool descriptions, operation descriptions, worker skills and postures) teach workers the flat layout. These are documentation-as-instruction and will produce wrong behavior if the directory contract changes silently.
- Root-level lore files (`heartbeat.md`, `lore-config.md`, `lore-agents.md`, `vision.md`) and root-level subdirectories (`generated/`) are special-cased today — the spec needs to declare whether they remain at root.
- Squash-merge auto-resolution and sparse-checkout patterns match `.lore/` generically, so they are layout-independent today.

The report ends with eight open structural questions the spec must answer (single-source vs. concurrent coexistence, peel-vs-tuple type segments, root-level file policy, worker instruction strategy) and a recommended sequencing for spec implementation.
