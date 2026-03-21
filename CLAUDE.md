# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Guild Hall is a multi-agent workspace for delegating work to AI specialists and reviewing their output. Fantasy guild aesthetic, file-based state, no database. Version 1.1.0.

## Status

Core systems are built and stable. 3145 tests pass across 137 files. Active development is issue-driven.

**What exists:** Web UI (dashboard, project views, artifact browser, meeting/commission viewers), daemon (REST API over Unix socket), CLI (project management, content migration), 10 worker packages (developer, email, illuminator, replicate, researcher, reviewer, steward, test-engineer, visionary, writer), Guild Master coordination, worker-to-worker mail, project briefings, scheduled commissions, model selection (cloud and local), memory system, domain plugins, injectable logging, and package skill handlers.

## Architecture

Monorepo with four top-level systems:

| System | Purpose | Entry point |
|--------|---------|-------------|
| `web/` | Next.js 16 App Router UI | `web/app/page.tsx` (dashboard) |
| `daemon/` | Hono on Unix socket, all write operations | `daemon/index.ts` → `daemon/app.ts` |
| `cli/` | Bun scripts for project management | `cli/index.ts` |
| `packages/` | Worker and toolbox packages | `packages/<name>/package.json` |

Shared code lives in `lib/`, tests in `tests/`.

The daemon (`~/.guild-hall/guild-hall.sock`) is the application boundary. It owns all write operations, meeting/commission sessions, mail delivery, scheduled commissions, briefing generation, and the EventBus. The web layer and CLI are UX clients over the daemon's REST API. Workers interact with the application through MCP tools provided by the toolbox system. Humans interact through CLI commands and the web UI, which discover daemon operations via the OperationsRegistry.

**Git isolation.** A three-tier git branch strategy (`master` / `claude` / activity branches) isolates AI work. Next.js reads from integration worktrees on `claude`. Active sessions get their own activity worktrees with sparse checkout. `daemon/lib/git.ts` owns all git operations; `daemon/services/git-admin.ts` handles rebase/sync.

**Path alias.** `@/` resolves to the repo root everywhere. Root `tsconfig.json` maps `@/*` to `./*`; `web/tsconfig.json` extends root with `baseUrl: ".."` and the same mapping. Both resolve identically: `@/lib/types`, `@/daemon/lib/git`, `@/web/components/ui/Panel`. The `baseUrl` approach is required because bun resolves the nearest `tsconfig.json` per file, and relative `../*` paths break when `extends` is involved.

For deeper architectural context, see `.lore/specs/infrastructure/daemon-application-boundary.md`, `.lore/specs/infrastructure/guild-hall-system.md`, and `.lore/specs/commissions/guild-hall-commissions.md`.

## Daemon Structure

Routes define the REST API surface. Services implement business logic. Each route file is a DI factory (`createXRoutes(deps)`).

**Routes** (`daemon/routes/`):

| File | Endpoints | Purpose |
|------|-----------|---------|
| `meetings.ts` | `/meetings/*` | Create, list, accept, decline, stream, send messages |
| `commissions.ts` | `/commissions/*` | Create, list, dispatch, continue, save, cancel |
| `artifacts.ts` | `/workspace/artifacts/*` | Browse, read, create artifacts in projects |
| `briefing.ts` | `/briefing/:projectName` | Project status briefings (LLM-generated, cached) |
| `events.ts` | `/events` | SSE event stream for real-time updates |
| `workers.ts` | `/workers` | Worker roster and metadata |
| `config.ts` | `/config/*` | App configuration read/write |
| `admin.ts` | `/admin/*` | Project registration, worktree management |
| `git-lore.ts` | `/workspace/git/lore/*` | Commit .lore changes from web UI |
| `health.ts` | `/health` | Health check |
| `help.ts` | `/help/*` | Skill discovery and CLI help |
| `models.ts` | `/models` | Available model list |
| `package-operations.ts` | `/package-operations/*` | Package-contributed operations |

**Services** (`daemon/services/`):

| Directory/File | Responsibility |
|----------------|----------------|
| `commission/` | Commission orchestrator (dispatch, lifecycle, halted state, capacity) |
| `meeting/` | Meeting orchestrator (session loop, notes, transcript, registry) |
| `mail/` | Worker-to-worker mail (delivery, sleep/wake, queue) |
| `manager/` | Guild Master (worker, context, exclusive toolbox) |
| `scheduler/` | Cron-based scheduled commissions |
| `base-toolbox.ts` | Shared tools available to all workers (memory, artifacts, mail) |
| `toolbox-resolver.ts` | Composes toolboxes for a session from worker config |
| `briefing-generator.ts` | LLM briefing with cache and fallback chain |
| `memory-injector.ts` | Loads memory files for session context injection |
| `git-admin.ts` | Rebase, sync, worktree administration |
| `workspace.ts` | Project workspace operations (artifact CRUD) |

**Daemon libraries** (`daemon/lib/`):

| File | Purpose |
|------|---------|
| `agent-sdk/sdk-runner.ts` | Unified SDK session runner for commissions and meetings |
| `agent-sdk/event-translator.ts` | Translates SDK stream events to GuildHallEvent |
| `git.ts` | All git subprocess operations, `cleanGitEnv()` |
| `event-bus.ts` | Set-based pub/sub for SSE |
| `operations-registry.ts` | Operation discovery for CLI and web |
| `log.ts` | Injectable logger (`consoleLog`, `nullLog`, `collectingLog`) |
| `toolbox-utils.ts` | Shared toolbox helpers |

## Five Concerns

The daemon's session infrastructure serves five distinct concerns. When a piece of code touches more than one, that's a signal to check whether a boundary is missing.

| Concern | Responsibility | Boundary rule |
|---------|---------------|---------------|
| **Session** | SDK interaction (query, stream, abort) | No git, no artifacts, no knowledge of activity types |
| **Activity** | Git isolation (branch, worktree, merge) | No SDK, no artifacts, no knowledge of activity types |
| **Artifact** | Structured document I/O (frontmatter, timeline) | No git, no SDK. Writes to a path it's given. |
| **Toolbox** | Tool composition and resolution | Context-aware (commissions and meetings have different capabilities), but tools communicate through callbacks, not direct artifact writes |
| **Worker** | Identity, posture, capability declaration | Declares what it needs. Doesn't know how it got activated. |

Commissions and meetings are orchestrators that compose these concerns. They sequence the steps; they don't implement the infrastructure. The commission layer separation (Layers 1-5 in `daemon/services/commission/`) enforces this for commissions. Meeting layer separation is complete: orchestrator, session-loop, notes-generator, transcript, record, registry, and toolbox are separate modules in `daemon/services/meeting/`.

## Worker Packages

All packages live in `packages/`. Each has a `package.json` with worker metadata (identity, posture, capabilities, builtInTools, systemToolboxes, domainPlugins). A `shared/` package provides common types.

| Package | Role | Notable |
|---------|------|---------|
| `guild-hall-developer` | Code implementation | |
| `guild-hall-researcher` | Investigation and analysis | |
| `guild-hall-reviewer` | Code review and quality | |
| `guild-hall-writer` | Documentation and artifacts | Has `cleanup-commissions` domain plugin |
| `guild-hall-test-engineer` | Testing | |
| `guild-hall-steward` | Project maintenance | |
| `guild-hall-visionary` | Vision and strategic direction | |
| `guild-hall-illuminator` | Image generation and analysis | Full project checkout scope |
| `guild-hall-email` | Email operations | Email toolbox |
| `guild-hall-replicate` | AI image generation via Replicate | Replicate toolbox |

The Guild Master (`daemon/services/manager/`) is not a package. It is a built-in worker with an exclusive manager toolbox (`daemon/services/manager/toolbox.ts`) that includes commission dispatch, worker coordination, and status tools.

## Key Patterns

**LLM interaction boundary.** All LLM calls go through the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`). No direct Anthropic API calls (`client.messages.create`, raw HTTP, etc.). The SDK provides the tool-use loop, error handling, and session management that raw API calls would need to reimplement. When a new feature needs LLM interaction, even lightweight single-purpose calls like triage or classification, it uses the SDK. If the full `runSdkSession` pipeline is too heavy, build a lighter SDK session. Do not drop to the raw API.

**Daemon process model.** Entry point `daemon/index.ts` parses args, cleans stale sockets, starts `Bun.serve({ unix, fetch })`, writes PID file. Routes use DI factory pattern: `createHealthRoutes(deps)`. Production wiring lives in `daemon/app.ts` via `createProductionApp()`.

**SDK runner.** `daemon/lib/agent-sdk/sdk-runner.ts` is the unified session runner for both commissions and meetings. It handles `prepareSdkSession` (toolbox resolution, memory injection, model selection) and `runSdkSession` (SDK stream iteration). Orchestrators map `SdkRunnerEvent` to their domain event types. The runner is context-free (no activity IDs).

**Toolbox resolver.** `daemon/services/toolbox-resolver.ts` uses a name-based `SYSTEM_TOOLBOX_REGISTRY` mapping names to `ToolboxFactory` functions. All factories receive `GuildHallToolboxDeps` (includes eventBus). The resolver runs: (1) `baseToolboxFactory`, (2) context toolbox auto-added by `contextType` from the registry, (3) system toolboxes from `worker.systemToolboxes` (e.g. `["manager"]`), (4) domain toolboxes from packages. Manager toolbox requires `services` in deps.

**Worker mail.** Workers communicate via `send_mail` tool, which triggers recipient activation as a mail reader session. Concurrency is capped by `maxConcurrentMailReaders` in config. The mail system handles sleep/wake transitions, reply tracking via EventBus, queue management at capacity, and recovery on daemon restart. Implementation: `daemon/services/mail/`.

**Briefing generator.** Project status briefings run through the full SDK session pipeline with Guild Master identity and read-only tools. Cached by integration worktree HEAD commit with configurable TTL (`briefingCacheTtlMinutes`). Falls back to single-turn query, then static template. Route: `GET /briefing/:projectName`.

**Commission lifecycle.** Commissions flow through: `pending` → `dispatched` → `in_progress` → `completed`/`failed`/`halted`. Commissions that hit `maxTurns` without a result enter `halted` state with worktree and session preserved. `continue` resumes the session; `save` merges partial work. Scheduled commissions use `daemon/services/scheduler/` with croner.

**Memory system.** Each scope (global, project, worker) stores memory in a single file with named `## sections`. Workers read via `read_memory` and edit via `edit_memory` (upsert, append, or delete sections). `write_memory` exists as a deprecated alias. Implementation: `daemon/services/memory-injector.ts` (loading), `daemon/services/base-toolbox.ts` (tools).

**Model selection.** `lib/types.ts` defines `ResolvedModel` and `resolveModel()`. Cloud models are built-in; local models come from `config.yaml`. The SDK runner injects environment variables for local model endpoints. Model registry supports multi-capability entries (e.g., a model that does both text-to-image and image-to-image).

**Type boundaries.** Daemon-specific types live in `daemon/types.ts` (branded IDs: `MeetingId`, `CommissionId`, `SdkSessionId`; status types; `GuildHallEvent`). Shared types live in `lib/types.ts` (including `ChatMessage`, `ToolUseEntry`, `AppConfig`, `WorkerMetadata`). `lib/` never imports from `daemon/` or `web/`.

**Component model.** Server components in `web/app/` read from the filesystem, pass data as props to client components in `web/components/`. Client components handle local UI state only. Pages use `await searchParams` (Next.js async params pattern). Web routes:

| Route | Page |
|-------|------|
| `/` | Dashboard (all-projects or single-project view) |
| `/projects/[name]` | Project view (artifacts, commissions, meetings tabs) |
| `/projects/[name]/artifacts/[...path]` | Artifact detail (catch-all for deep hierarchies) |
| `/projects/[name]/commissions/[id]` | Commission detail with SSE streaming |
| `/projects/[name]/meetings/[id]` | Meeting detail with SSE streaming |

**EventBus.** Set-based pub/sub broadcasting `SystemEvent` to SSE subscribers via `GET /events`. Commission and meeting toolboxes emit events after file writes.

**Worker domain plugins.** Worker packages can ship Claude Code plugins in `plugin/.claude-plugin/`. Workers declare `domainPlugins` referencing package names; plugin paths are resolved during `prepareSdkSession` and passed to the SDK.

## Documentation Map

| Directory | Contents | Consult when... |
|-----------|----------|-----------------|
| `.lore/specs/` | Requirement specs, organized by domain | Understanding requirements or checking REQ IDs |
| `.lore/specs/workers/` | Worker identity, roster, communication, plugins, toolbox enforcement | Working on worker behavior or packages |
| `.lore/specs/meetings/` | Meeting sessions, infrastructure, layer separation | Working on meeting features |
| `.lore/specs/commissions/` | Commission system, layer separation, scheduled commissions | Working on commission dispatch or lifecycle |
| `.lore/specs/ui/` | Views, artifact sorting/tree, graph container | Working on UI components |
| `.lore/specs/infrastructure/` | System architecture, model selection, local models, sandboxed execution, memory | Working on daemon, config, or cross-cutting concerns |
| `.lore/plans/` | Implementation plans, organized by same domain subdirectories as specs | Planning new work or understanding what was built when |
| `.lore/design/` | Technical design documents for specific features | Understanding design decisions for a feature |
| `.lore/reference/` | Excavated feature documentation | Understanding existing system capabilities |
| `.lore/retros/` | Post-mortems with lessons learned | Avoiding repeated mistakes |
| `.lore/research/` | Claude Agent SDK, MCP protocol, plugin systems | Working with external dependencies |
| `.lore/notes/` | Context notes for past and current work | Getting background on specific features or decisions |
| `.lore/issues/` | Known issues and investigations | Checking if a problem is already tracked |
| `.lore/brainstorm/` | Exploratory design ideas | Considering alternatives |

## Tech Stack

- **Runtime**: Bun (package management, test runner, daemon runtime)
- **Framework**: Next.js 16 App Router, server components for file reads, client components for interactive elements
- **Styling**: CSS Modules. Not Tailwind. The fantasy chrome uses image-based borders, glassmorphic panels, and texture backgrounds that don't suit utility classes.
- **Markdown**: gray-matter for frontmatter parsing, react-markdown + remark-gfm for rendering
- **Validation**: Zod schemas for config.yaml and artifact frontmatter
- **CLI**: Plain bun scripts in `cli/`, no framework
- **Daemon**: Hono on Unix socket via `Bun.serve()`, DI factory pattern for testability
- **Agent SDK**: Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) for meeting/commission sessions, SSE streaming to browser
- **Scheduling**: croner for cron-based scheduled commissions

## Commands

```bash
bun install                    # install dependencies
bun run dev                    # start daemon + Next.js (concurrently)
bun run dev:daemon             # start daemon only (watch mode, ./packages)
bun run dev:next               # start Next.js only (turbopack)
bun run build                  # production build
bun run start                  # start daemon + Next.js (production)
bun run start:daemon           # start daemon only (~/.guild-hall/packages/)
bun run start:next             # start Next.js only (production)
bun run lint                   # ESLint
bun run typecheck              # TypeScript type checking
bun test                       # run all tests
bun test tests/lib/config.test.ts  # run a single test file
bun test --coverage            # run tests with coverage report
bun run guild-hall register <name> <path>  # register a project
bun run guild-hall validate                # validate config
bun run guild-hall rebase [project-name]   # rebase claude onto master
bun run guild-hall sync [project-name]     # post-merge sync (detect merged PRs, reset claude)
bun run guild-hall migrate-content         # migrate result_summary from frontmatter to body
```

## Pre-commit Hook

`.git-hooks/pre-commit.sh` runs typecheck, lint, tests, and production build on every commit. All four must pass. If a commit fails, fix the issue and create a new commit (do not amend). The hook is already configured via `core.hooksPath`.

## Key Paths

| Path | Purpose |
|------|---------|
| `~/.guild-hall/config.yaml` | Project registry and app settings (source of truth) |
| `~/.guild-hall/guild-hall.sock` | Daemon Unix socket (runtime) |
| `~/.guild-hall/projects/<name>/` | Integration worktree on `claude` branch (UI read source) |
| `~/.guild-hall/worktrees/<project>/` | Activity worktrees for commissions and meetings |
| `~/.guild-hall/state/` | Machine-local meeting and commission state |
| `~/.guild-hall/packages/` | Installed worker/toolbox packages |
| `packages/` | Worker/toolbox packages (local dev) |
| `<project>/.lore/` | Project artifacts (markdown + YAML frontmatter) |
| `<project>/.lore/commissions/` | Commission artifacts (timeline, progress, result) |

## Testing

- **No `mock.module()`**. It causes infinite loops in bun. All code uses dependency injection: functions accept path/config parameters with defaults, tests pass temp directories.
- Tests use `fs.mkdtemp()` for temp directories, clean up in `afterEach`. Override `GUILD_HALL_HOME` env var for config path isolation.
- Daemon tests use Hono's `app.request()` test client with injected deps.
- Tests must not modify the actual repo. Use temp directories for any git or filesystem operations. See PR #126 for the pattern.

## CSS Quirks

**Vendor prefix order matters.** In Next.js, `-webkit-backdrop-filter` must come BEFORE `backdrop-filter` or the standard property gets dropped during compilation. Add inline comments where this applies. (Source: `.lore/retros/ui-redesign-fantasy-theme.md`)

`web/app/globals.css` defines design tokens: `--color-brass/bronze/amber` (metallics), `--color-parchment/dark-bg` (backgrounds), `--space-xs` through `--space-2xl`, `--font-body` (Ysabeau Office), `--font-code` (Source Code Pro).

Turbopack does not support CSS Modules `composes`. The directive is silently ignored. Use TSX-side class composition (`className={`${styles.base} ${styles.variant}`}`) instead.

## Changelog

`CHANGELOG.md` follows the [Common Changelog](https://common-changelog.org/) format. Update it when adding, changing, removing, or fixing user-facing behavior.

## Lessons from Retros

- Navigation between views is an implicit requirement. No dead ends. Every view has a path back to Dashboard.
- DI factories need production wiring. If the plan creates `createX(deps)` factories, include the step that instantiates real dependencies in `createProductionApp()`.
- gray-matter `stringify()` reformats YAML. When writing artifact content, splice the raw frontmatter bytes and replace only the body to avoid noisy git diffs.
- "Pre-existing" is not a reason to defer a finding. Present all issues with their actual impact.
- Git subprocesses spawned during hooks inherit `GIT_DIR`, `GIT_WORK_TREE`, and `GIT_INDEX_FILE`. Any code that shells out to git (including `daemon/lib/git.ts` and test helpers) must strip these variables via `cleanGitEnv()`, or operations will target the hook's repository instead of the intended one.
- When implementing features that interact with git internals, test under the hook execution context, not just in isolation.
- DI seams created during refactoring must be wired in production code. Fresh-eyes review by a sub-agent with no implementation context catches wiring gaps that the implementer misses.
- YAML frontmatter values containing colons must be quoted. `title: "Implementation notes: foo"`, not `title: Implementation notes: foo`. gray-matter can't parse unquoted colons.
