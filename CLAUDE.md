# CLAUDE.md

## Project

Guild Hall is a multi-agent workspace for delegating work to AI specialists and reviewing their output. Fantasy guild aesthetic, file-based state, no database. Version 1.1.0.

## Status

Core systems are built and stable. 3145 tests pass across 137 files. Active development is issue-driven.

## Architecture

Monorepo with four top-level systems:

| System | Purpose | Entry point |
|--------|---------|-------------|
| `web/` | Next.js 16 App Router UI | `web/app/page.tsx` (dashboard) |
| `daemon/` | Hono on Unix socket, all write operations | `daemon/index.ts` → `daemon/app.ts` |
| `cli/` | Bun scripts for project management | `cli/index.ts` |
| `packages/` | Worker and toolbox packages | `packages/<name>/package.json` |

Shared code lives in `lib/`, tests in `tests/`.

The daemon (`~/.guild-hall/guild-hall.sock`) is the application boundary. It owns all write operations, meeting/commission sessions, scheduled commissions, briefing generation, and the EventBus. The web layer and CLI are UX clients over the daemon's REST API. Workers interact through MCP tools provided by the toolbox system.

**Git isolation.** Three-tier branch strategy (`master` / `claude` / activity branches). `daemon/lib/git.ts` owns all git operations; `daemon/services/git-admin.ts` handles rebase/sync.

**Path alias.** `@/` resolves to the repo root everywhere. Root `tsconfig.json` maps `@/*` to `./*`; `web/tsconfig.json` extends root with `baseUrl: ".."` and the same mapping. The `baseUrl` approach is required because bun resolves the nearest `tsconfig.json` per file, and relative `../*` paths break when `extends` is involved.

For deeper architectural context, see `.lore/specs/infrastructure/daemon-application-boundary.md`, `.lore/specs/infrastructure/guild-hall-system.md`, and `.lore/specs/commissions/guild-hall-commissions.md`.

## Key Rules

**LLM interaction boundary.** All LLM calls go through the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`). No direct Anthropic API calls. If the full `runSdkSession` pipeline is too heavy, build a lighter SDK session. Do not drop to the raw API.

**DI factory pattern.** Routes use `createXRoutes(deps)`. Production wiring lives in `daemon/app.ts` via `createProductionApp()`. New factories must be wired there.

**Type boundaries.** Daemon-specific types live in `daemon/types.ts`. Shared types live in `lib/types.ts`. `lib/` never imports from `daemon/` or `web/`.

**Five Concerns.** Session, Activity, Artifact, Toolbox, and Worker are separate concerns with boundary rules. See `.lore/specs/infrastructure/daemon-application-boundary.md`.

**Plugin naming.** Claude plugin names in `plugin/.claude-plugin/plugin.json` must be kebab-case (e.g. `"name": "guild-compendium"`). The Claude Agent SDK will not load plugins with spaces or other non-kebab naming.

## Commands

```bash
bun install                    # install dependencies
bun run dev                    # start daemon + Next.js (concurrently)
bun run dev:daemon             # start daemon only (watch mode, ./packages)
bun run dev:next               # start Next.js only (turbopack)
bun run build                  # production build
bun run lint                   # ESLint
bun run typecheck              # TypeScript type checking
bun test                       # run all tests
bun test tests/lib/config.test.ts  # run a single test file
bun run guild-hall register <name> <path>  # register a project
bun run guild-hall validate                # validate config
bun run guild-hall rebase [project-name]   # rebase claude onto master
bun run guild-hall sync [project-name]     # post-merge sync
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
| `packages/` | Worker/toolbox packages (local dev) |
| `<project>/.lore/` | Project artifacts (markdown + YAML frontmatter) |

## Testing

- **No `mock.module()`**. It causes infinite loops in bun. All code uses dependency injection: functions accept path/config parameters with defaults, tests pass temp directories.
- Tests use `fs.mkdtemp()` for temp directories, clean up in `afterEach`. Override `GUILD_HALL_HOME` env var for config path isolation.
- Daemon tests use Hono's `app.request()` test client with injected deps.
- Tests must not modify the actual repo. Use temp directories for any git or filesystem operations.

## CSS Quirks

**Vendor prefix order matters.** `-webkit-backdrop-filter` must come BEFORE `backdrop-filter` or the standard property gets dropped during Next.js compilation.

**No CSS Modules `composes`.** Turbopack silently ignores it. Use TSX-side class composition instead.

`web/app/globals.css` defines design tokens. Styling uses CSS Modules, not Tailwind.

**No raw color values in CSS Modules.** All colors must use `var(--color-*)` tokens from `globals.css`. If a new color is needed, add a token there first. Never use hex, rgb, or hsl literals in `.module.css` files.

## Documentation Map

| Directory | Consult when... |
|-----------|-----------------|
| `.lore/specs/` | Understanding requirements or checking REQ IDs |
| `.lore/plans/` | Planning new work or understanding what was built |
| `.lore/design/` | Understanding design decisions |
| `.lore/retros/` | Avoiding repeated mistakes |
| `.lore/research/` | Working with external dependencies |
| `.lore/issues/` | Checking if a problem is already tracked |
| `.lore/brainstorm/` | Considering alternatives |

## Changelog

`CHANGELOG.md` follows [Common Changelog](https://common-changelog.org/). Update when adding, changing, removing, or fixing user-facing behavior.

## Lessons from Retros

- Navigation between views is an implicit requirement. No dead ends.
- DI factories need production wiring in `createProductionApp()`.
- gray-matter `stringify()` reformats YAML. Splice raw frontmatter bytes and replace only the body.
- "Pre-existing" is not a reason to defer a finding. Present all issues with their actual impact.
- Git subprocesses spawned during hooks inherit `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`. Code that shells out to git must strip these via `cleanGitEnv()`.
- Test git-interacting features under hook execution context, not just in isolation.
- YAML frontmatter values containing colons must be quoted.
