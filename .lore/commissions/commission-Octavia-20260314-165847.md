---
title: "Commission: Brainstorm: Commit .lore changes from web UI"
date: 2026-03-14
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Brainstorm the design for a \"commit .lore changes\" feature in the web UI.\n\n**The feature:**\nUsers can edit .lore artifact files from the Artifacts tab in the browser, but there's no way to commit those changes without going to the terminal. We want a simple commit action: a text box for a commit message, then commit only `.lore/` changes in the integration worktree (`~/.guild-hall/projects/<name>/`). The commit should skip pre-commit hooks (`--no-verify`) since the hook runs typecheck/lint/tests/build which don't apply to markdown lore files.\n\n**What's already decided:**\n- Commits happen in the integration worktree for the project\n- Only `.lore/` files are staged and committed (safety boundary)\n- `--no-verify` is appropriate since pre-commit hooks are for code, not markdown\n- The daemon handles the write (it's the application boundary)\n\n**Questions to resolve:**\n\n1. **Daemon route placement.** The daemon uses a capability-oriented path grammar. Research the existing route structure (check `daemon/routes/` and `daemon/app.ts` for all registered routes) to find where a commit endpoint fits naturally. Don't invent a path that creates an orphan or breaks the hierarchy. If no existing group fits, say so and propose the right parent.\n\n2. **UI placement.** The commit action needs to live somewhere on the Artifacts tab. Options to evaluate:\n   - A button near/above the artifact tree view\n   - A toolbar or action bar on the Artifacts tab\n   - A floating action or footer bar\n   - Something else\n   \n   Consider: the user may edit multiple artifacts before committing. The action should feel accessible but not intrusive. Think about where \"commit\" fits in the user's workflow on this page.\n\n3. **State awareness.** Should the UI show whether there are uncommitted .lore changes? A dirty indicator would tell the user when committing is relevant. Evaluate the cost/benefit.\n\n**Reference files to read:**\n- `daemon/routes/` — all route files for path grammar patterns\n- `daemon/app.ts` — route registration and grouping\n- `web/app/projects/[name]/page.tsx` — the project page with tabs\n- `web/components/artifact/` — artifact tab components\n- `.lore/design/daemon-rest-api.md` — API design principles\n\nPlace the brainstorm at `.lore/brainstorm/commit-lore-from-web.md`."
dependencies: []
linked_artifacts:
  - .lore/brainstorm/commit-lore-from-web.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-14T23:58:47.175Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T23:58:47.177Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-14T23:58:47.213Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-14T23:58:53.923Z
    event: progress_report
    reason: "Starting research phase: reading daemon routes, app.ts, UI components, and API design doc."
  - timestamp: 2026-03-15T00:00:14.339Z
    event: progress_report
    reason: "Research complete. Writing the brainstorm document."
  - timestamp: 2026-03-15T00:01:34.071Z
    event: result_submitted
    reason: "Brainstorm complete at `.lore/brainstorm/commit-lore-from-web.md`.\n\n**Q1: Daemon route placement** — `workspace/git/` is the right parent. The commit and status endpoints fit naturally alongside the existing `branch/rebase` and `integration/sync` routes. Recommended paths: `POST /workspace/git/lore/commit` and `GET /workspace/git/lore/status`. They belong in a new `daemon/routes/git-lore.ts` file rather than in `artifacts.ts`, to keep document I/O and git operations on separate concerns. The required deps (`config`, `guildHallHome`, `gitOps`) are already present on `ArtifactDeps`/`AdminDeps` — a `GitLoreDeps` slice is the minimal new interface needed.\n\n**Q2: UI placement** — The action bar above the artifact tree (matching the commissions tab's `commissionActions` pattern) is the right fit. The commit button expands inline — not a modal — since it is one text field and one action. Placing it on individual artifact pages or inside the `ArtifactList` panel would couple the wrong concerns.\n\n**Q3: Dirty indicator** — Worth adding. `GET /workspace/git/lore/status` is fast and can run in parallel with the existing page fetches. Surface it as button state (active when dirty, muted with tooltip when clean) rather than a visual badge — keeps it readable without extra styling complexity.\n\nKey open questions flagged: whether to push on commit (recommendation: no, keep commit local), and whether to reject empty commit messages or generate a default."
  - timestamp: 2026-03-15T00:01:42.759Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Research complete. Writing the brainstorm document."
projectName: guild-hall
---
Brainstorm complete at `.lore/brainstorm/commit-lore-from-web.md`.

**Q1: Daemon route placement** — `workspace/git/` is the right parent. The commit and status endpoints fit naturally alongside the existing `branch/rebase` and `integration/sync` routes. Recommended paths: `POST /workspace/git/lore/commit` and `GET /workspace/git/lore/status`. They belong in a new `daemon/routes/git-lore.ts` file rather than in `artifacts.ts`, to keep document I/O and git operations on separate concerns. The required deps (`config`, `guildHallHome`, `gitOps`) are already present on `ArtifactDeps`/`AdminDeps` — a `GitLoreDeps` slice is the minimal new interface needed.

**Q2: UI placement** — The action bar above the artifact tree (matching the commissions tab's `commissionActions` pattern) is the right fit. The commit button expands inline — not a modal — since it is one text field and one action. Placing it on individual artifact pages or inside the `ArtifactList` panel would couple the wrong concerns.

**Q3: Dirty indicator** — Worth adding. `GET /workspace/git/lore/status` is fast and can run in parallel with the existing page fetches. Surface it as button state (active when dirty, muted with tooltip when clean) rather than a visual badge — keeps it readable without extra styling complexity.

Key open questions flagged: whether to push on commit (recommendation: no, keep commit local), and whether to reject empty commit messages or generate a default.
