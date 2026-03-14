# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Guild Hall is a multi-agent workspace for delegating work to AI specialists and reviewing their output. Fantasy guild aesthetic, file-based state, no database.

## Status

Core systems are built: UI, daemon, meetings, commissions, git isolation, worker packages, Guild Master coordination, worker-to-worker mail, project briefings, and worker domain plugins. 1982 tests pass. Active development is issue-driven.

## Architecture

The repo root is a monorepo with four top-level systems: `web/` (Next.js App Router UI), `daemon/` (Hono on a Unix socket), `cli/` (bun scripts), and `packages/` (workers and toolboxes). Shared code lives in `lib/`, tests in `tests/`.

Current implementation: Next.js App Router serves the UI from `web/`, and some reads still come directly from the filesystem. The daemon (`~/.guild-hall/guild-hall.sock`) owns all write operations, meeting/commission sessions, and the EventBus. Meetings and commissions run as Claude Agent SDK sessions inside the daemon process. A three-tier git branch strategy (`master` / `claude` / activity branches) isolates AI work: Next.js reads from integration worktrees on `claude`, active sessions get their own activity worktrees with sparse checkout. The Guild Master is a built-in manager worker with an exclusive toolbox and coordination posture.

Architectural truth / target: the daemon is the application boundary and exposes Guild Hall through REST over the Unix socket. The web layer and CLI are UX clients over that API. The daemon can spawn specialist agents, and agents should interact with the application only through CLI-shaped skills so human and agent capabilities converge through progressive discovery. The five concerns below are daemon-internal boundaries, not alternative application boundaries. See `.lore/specs/infrastructure/daemon-application-boundary.md`.

`@/` resolves to the repo root everywhere. Root `tsconfig.json` maps `@/*` to `./*`; `web/tsconfig.json` extends root with `baseUrl: ".."` and the same `@/*` to `./*` mapping. Both resolve identically: `@/lib/types`, `@/daemon/lib/git`, `@/web/components/ui/Panel`. The `baseUrl` approach is required because bun resolves the nearest `tsconfig.json` per file, and relative `../*` paths break when `extends` is involved.

For deeper architectural context, see `.lore/specs/infrastructure/daemon-application-boundary.md`, `.lore/specs/infrastructure/guild-hall-system.md`, and `.lore/specs/commissions/guild-hall-commissions.md`.

## Documentation Map

| Directory | Contents | Consult when... |
|-----------|----------|-----------------|
| `.lore/specs/` | Requirement specs, organized by domain | Understanding requirements or checking REQ IDs |
| `.lore/specs/workers/` | Worker identity, roster, communication, plugins, toolbox enforcement | Working on worker behavior or packages |
| `.lore/specs/meetings/` | Meeting sessions, infrastructure, rename, project-scoped meetings | Working on meeting features |
| `.lore/specs/commissions/` | Commission system, layer separation, scheduled commissions | Working on commission dispatch or lifecycle |
| `.lore/specs/ui/` | Views, artifact sorting/tree, graph container | Working on UI components |
| `.lore/specs/infrastructure/` | System architecture, model selection, local models | Working on daemon, config, or cross-cutting concerns |
| `.lore/plans/` | Implementation plans, organized by same domain subdirectories as specs | Planning new work or understanding what was built when |
| `.lore/design/` | Technical design documents for specific features | Understanding design decisions for a feature |
| `.lore/reference/` | Excavated feature documentation | Understanding existing system capabilities |
| `.lore/retros/` | Post-mortems with lessons learned | Avoiding repeated mistakes |
| `.lore/research/` | Claude Agent SDK, MCP protocol, plugin systems | Working with external dependencies |
| `.lore/notes/` | Context notes for past and current work | Getting background on specific features or decisions |
| `.lore/issues/` | Known issues and investigations | Checking if a problem is already tracked |
| `.lore/brainstorm/` | Exploratory design ideas | Considering alternatives |

## Tech Stack

- **Framework**: Next.js App Router, server components for file reads, client components for interactive elements
- **Styling**: CSS Modules. Not Tailwind. The fantasy chrome uses image-based borders, glassmorphic panels, and texture backgrounds that don't suit utility classes.
- **Markdown**: gray-matter for frontmatter parsing, react-markdown + remark-gfm for rendering
- **Validation**: Zod schemas for config.yaml and artifact frontmatter
- **CLI**: Plain bun scripts in `cli/`, no framework
- **Daemon**: Hono on Unix socket via `Bun.serve()`, DI factory pattern for testability
- **Agent SDK**: Claude Agent SDK for meeting/commission sessions, SSE streaming to browser

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

## Five Concerns

The daemon's session infrastructure serves five distinct concerns. When a piece of code touches more than one, that's a signal to check whether a boundary is missing.

| Concern | Responsibility | Boundary rule |
|---------|---------------|---------------|
| **Session** | SDK interaction (query, stream, abort) | No git, no artifacts, no knowledge of activity types |
| **Activity** | Git isolation (branch, worktree, merge) | No SDK, no artifacts, no knowledge of activity types |
| **Artifact** | Structured document I/O (frontmatter, timeline) | No git, no SDK. Writes to a path it's given. |
| **Toolbox** | Tool composition and resolution | Context-aware (commissions and meetings have different capabilities), but tools communicate through callbacks, not direct artifact writes |
| **Worker** | Identity, posture, capability declaration | Declares what it needs. Doesn't know how it got activated. |

Commissions and meetings are orchestrators that compose these concerns. They sequence the steps; they don't implement the infrastructure. The commission layer separation (Layers 1-5 in `daemon/services/commission/`) enforces this for commissions. Meetings still use the older monolithic pattern.

## Key Patterns

**Daemon process model.** Entry point `daemon/index.ts` parses args, cleans stale sockets, starts `Bun.serve({ unix, fetch })`, writes PID file. Routes use DI factory pattern: `createHealthRoutes(deps)`. Production wiring lives in `daemon/app.ts` via `createProductionApp()`.

**Toolbox resolver.** Uses a name-based `SYSTEM_TOOLBOX_REGISTRY` mapping names to `ToolboxFactory` functions. All factories receive `GuildHallToolboxDeps` (includes eventBus). The resolver runs: (1) `baseToolboxFactory`, (2) context toolbox auto-added by `contextType` from the registry, (3) system toolboxes from `worker.systemToolboxes` (e.g. `["manager"]`), (4) domain toolboxes from packages. Manager toolbox requires `services` in deps.

**Worker mail.** Workers communicate via `send_mail` tool, which triggers recipient activation as a mail reader session. Concurrency is capped by `maxConcurrentMailReaders` in config. The mail system handles sleep/wake transitions, reply tracking via EventBus, queue management at capacity, and recovery on daemon restart. Implementation lives in `daemon/services/mail/`.

**Briefing generator.** Project status briefings run through the full SDK session pipeline (`prepareSdkSession` + `runSdkSession`) with Guild Master identity and read-only tools. Cached by integration worktree HEAD commit with 1-hour TTL. Falls back to single-turn query, then static template. Route: `GET /briefing/:projectName`.

**Worker domain plugins.** Worker packages can ship Claude Code plugins in `plugin/.claude-plugin/`. Workers declare `domainPlugins` referencing package names; plugin paths are resolved during `prepareSdkSession` and passed to the SDK. The guild-hall-writer package contains a `cleanup-commissions` skill as the first domain plugin.

**Memory compaction.** Long-running sessions get async memory summarization via `daemon/services/memory-compaction.ts`, preventing context window exhaustion.

**Type boundaries.** Daemon-specific types live in `daemon/` (e.g., `GuildHallEvent`, `MeetingId`, `CommissionId`, `SystemEvent`, `AppDeps`). Shared types used by both daemon and Next.js live in `lib/types.ts` (including `ChatMessage` and `ToolUseEntry`). The daemon imports from `lib/` via `@/lib/` path alias; `lib/` never imports from `daemon/` or `web/`.

**Component model.** Server components in `web/app/` read from the filesystem, pass data as props to client components in `web/components/`. Client components handle local UI state only. Catch-all route `web/app/projects/[name]/artifacts/[...path]/` handles deep artifact hierarchies. Pages use `await searchParams` (Next.js 15 async params pattern).

**EventBus.** Set-based pub/sub broadcasting `SystemEvent` to SSE subscribers via `GET /events`. Commission and meeting toolboxes emit events after file writes.

## CSS Quirks

**Vendor prefix order matters.** In Next.js, `-webkit-backdrop-filter` must come BEFORE `backdrop-filter` or the standard property gets dropped during compilation. Add inline comments where this applies. (Source: `.lore/retros/ui-redesign-fantasy-theme.md`)

`web/app/globals.css` defines design tokens: `--color-brass/bronze/amber` (metallics), `--color-parchment/dark-bg` (backgrounds), `--space-xs` through `--space-2xl`, `--font-body` (Ysabeau Office), `--font-code` (Source Code Pro).

## Testing

- **No `mock.module()`**. It causes infinite loops in bun. All code uses dependency injection: functions accept path/config parameters with defaults, tests pass temp directories.
- Tests use `fs.mkdtemp()` for temp directories, clean up in `afterEach`. Override `GUILD_HALL_HOME` env var for config path isolation.
- Daemon tests use Hono's `app.request()` test client with injected deps.

## Changelog

`CHANGELOG.md` follows the [Common Changelog](https://common-changelog.org/) format. Update it when adding, changing, removing, or fixing user-facing behavior.

## Lessons from Retros

- Navigation between views is an implicit requirement. No dead ends. Every view has a path back to Dashboard.
- DI factories need production wiring. If the plan creates `createX(deps)` factories, include the step that instantiates real dependencies.
- gray-matter `stringify()` reformats YAML. When writing artifact content, splice the raw frontmatter bytes and replace only the body to avoid noisy git diffs.
- "Pre-existing" is not a reason to defer a finding. Present all issues with their actual impact.
- Git subprocesses spawned during hooks inherit `GIT_DIR`, `GIT_WORK_TREE`, and `GIT_INDEX_FILE`. Any code that shells out to git (including `daemon/lib/git.ts` and test helpers) must strip these variables via `cleanGitEnv()`, or operations will target the hook's repository instead of the intended one.
- When implementing features that interact with git internals, test under the hook execution context, not just in isolation.
- DI seams created during refactoring must be wired in production code (createProductionApp). Fresh-eyes review by a sub-agent with no implementation context catches wiring gaps that the implementer misses.
- YAML frontmatter values containing colons must be quoted. `title: "Implementation notes: foo"`, not `title: Implementation notes: foo`. gray-matter can't parse unquoted colons.
