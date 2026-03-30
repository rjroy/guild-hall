---
title: "Commission: Spec: Quick-add issues"
date: 2026-03-30
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec from the brainstorm at `.lore/brainstorm/quick-add-issues.md`. The brainstorm is finalized with all open questions resolved.\n\nWrite the spec to `.lore/specs/ui/quick-add-issues.md`.\n\nFollow the existing spec conventions in this project (check other specs in `.lore/specs/` for format: frontmatter with title/date/status/author, numbered REQ IDs, clear sections for each surface). The brainstorm covers three surfaces: daemon endpoint, web UI, and CLI. All decisions are made — translate them into requirements.\n\nSet spec status to `draft`."
dependencies: []
linked_artifacts:
  - .lore/specs/ui/quick-add-issues.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-30T01:33:53.880Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-30T01:33:53.884Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-30T01:33:53.933Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-30T01:34:00.509Z
    event: progress_report
    reason: "Reading the brainstorm and checking existing spec conventions before writing."
  - timestamp: 2026-03-30T01:35:11.128Z
    event: progress_report
    reason: "Format confirmed. Writing the spec now."
  - timestamp: 2026-03-30T01:37:02.049Z
    event: result_submitted
    reason: "Wrote `.lore/specs/ui/quick-add-issues.md` — 22 numbered REQs across three surfaces.\n\n**Daemon (REQ-QAI-1 to 11):** New `daemon/routes/workspace-issue.ts` with `IssueRouteDeps` interface, wired into `AppDeps` and `createProductionApp`. `POST /workspace/issue/create` accepts `{ projectName, title, body? }`, generates a slug (lowercase, hyphenate non-alphanumeric runs, strip edges), resolves conflicts with counter suffixes, writes the file with `title`/`date`/`status: open` frontmatter, commits as `\"Add issue: <slug>\"` (non-fatal on failure), returns `{ path, slug }` with 201. Registered as `workspace.issue.create` in the operations registry.\n\n**Web UI (REQ-QAI-12 to 20):** `NewIssueButton` added to the existing `artifactActions` bar alongside `CommitLoreButton`. Always-active button expands an inline form (not a modal) with a title input (`maxLength=100`) and optional body textarea. Client validates title before calling the API. Success shows confirmation with the slug for 4 seconds. Failure preserves input and shows error inline.\n\n**CLI (REQ-QAI-21 to 22):** No new CLI code — the operations registry surfaces the endpoint as `guild-hall workspace issue create <project> --title \"...\" [--body \"...\"]`. `--body -` reads from stdin for the terminal pipeline use case."
  - timestamp: 2026-03-30T01:37:12.145Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Format confirmed. Writing the spec now."
projectName: guild-hall
---
Wrote `.lore/specs/ui/quick-add-issues.md` — 22 numbered REQs across three surfaces.

**Daemon (REQ-QAI-1 to 11):** New `daemon/routes/workspace-issue.ts` with `IssueRouteDeps` interface, wired into `AppDeps` and `createProductionApp`. `POST /workspace/issue/create` accepts `{ projectName, title, body? }`, generates a slug (lowercase, hyphenate non-alphanumeric runs, strip edges), resolves conflicts with counter suffixes, writes the file with `title`/`date`/`status: open` frontmatter, commits as `"Add issue: <slug>"` (non-fatal on failure), returns `{ path, slug }` with 201. Registered as `workspace.issue.create` in the operations registry.

**Web UI (REQ-QAI-12 to 20):** `NewIssueButton` added to the existing `artifactActions` bar alongside `CommitLoreButton`. Always-active button expands an inline form (not a modal) with a title input (`maxLength=100`) and optional body textarea. Client validates title before calling the API. Success shows confirmation with the slug for 4 seconds. Failure preserves input and shows error inline.

**CLI (REQ-QAI-21 to 22):** No new CLI code — the operations registry surfaces the endpoint as `guild-hall workspace issue create <project> --title "..." [--body "..."]`. `--body -` reads from stdin for the terminal pipeline use case.
