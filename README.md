# Guild Hall

A multi-agent workspace for delegating work to AI specialists and reviewing their output. Fantasy guild aesthetic, file-based state, no database.

Guild Hall treats AI collaboration as a structured process: register a project, browse its artifacts, hold meetings with specialist workers, and dispatch commissions for async work. Workers are Claude Agent SDK sessions with distinct identities, toolboxes, and domain plugins. Workers communicate with each other via a mail system, and the Guild Master generates project briefings through the SDK pipeline. A three-tier git branch strategy isolates AI work from your codebase.

## Prerequisites

- [Bun](https://bun.sh/) (runtime and package manager)
- Node.js 20+ (for Next.js)

## Getting Started

```bash
bun install
bun run dev
```

This starts both the daemon and the Next.js dev server. Open [http://localhost:3000](http://localhost:3000).

Register a project that has `.git/` and `.lore/` directories:

```bash
bun run guild-hall register my-project /path/to/project
```

## Commands

```bash
bun run dev                    # start daemon + Next.js (concurrently)
bun run dev:daemon             # start daemon only (watch mode)
bun run dev:next               # start Next.js only (turbopack)
bun run build                  # production build
bun run start                  # start daemon + Next.js (production)
bun run start:daemon           # start daemon only (~/.guild-hall/packages/)
bun run start:next             # start Next.js only (production)
bun run lint                   # ESLint
bun run typecheck              # TypeScript type checking
bun test                       # run all tests
bun test tests/lib/config.test.ts  # single test file
bun run guild-hall register <name> <path>  # register a project
bun run guild-hall validate                # validate config
bun run guild-hall rebase [project-name]   # rebase claude onto master
bun run guild-hall sync [project-name]     # post-merge sync
```

## Architecture

The repo is a monorepo with four top-level systems:

- **`web/`** -- Next.js App Router UI (server components for reads, client components for interaction)
- **`daemon/`** -- Hono server on a Unix socket (`~/.guild-hall/guild-hall.sock`), owns all write operations, meeting/commission sessions, and the EventBus
- **`cli/`** -- Bun scripts for project registration, config validation, and git operations
- **`packages/`** -- Worker and toolbox packages (developer, email, illuminator, replicate, researcher, reviewer, steward, visionary, writer, shared)

Supporting directories:

- **`lib/`** -- Shared business logic (artifacts, config, paths, types)
- **`tests/`** -- Mirrors source structure

Meetings and commissions run as Claude Agent SDK sessions inside the daemon. A three-tier git branch strategy (`master` / `claude` / activity branches) isolates AI work: the UI reads from integration worktrees on `claude`, active sessions get their own worktrees with sparse checkout. Workers communicate via a mail system with sleep/wake transitions and concurrency management. The Guild Master generates project briefings through the full SDK pipeline with caching. Worker packages can ship Claude Code domain plugins that extend worker capabilities.

## Tech Stack

- **Next.js** (App Router) with React 19 server and client components
- **Hono** on Unix socket for the daemon process
- **Claude Agent SDK** for meeting and commission sessions
- **CSS Modules** with a custom fantasy design system (glassmorphic panels, image-based borders, gem status indicators)
- **gray-matter** + **react-markdown** for artifact parsing and rendering
- **Zod** for config and frontmatter validation
- **Bun** for runtime, testing, and CLI scripts

## Usage Guide

See [`docs/usage/`](./docs/usage/) for walkthroughs covering the dashboard, project views, audiences, and commissions.

## Configuration

Guild Hall stores its config at `~/.guild-hall/config.yaml`. Each registered project must contain a `.git/` directory and a `.lore/` directory with markdown artifacts.

## License

MIT
