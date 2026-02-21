# Guild Hall

A multi-agent workspace for delegating work to AI specialists and reviewing their output. Fantasy guild aesthetic, file-based state, no database.

Guild Hall treats AI collaboration as a structured process: register a project, browse its artifacts (markdown files with YAML frontmatter), edit them in-browser, and (in future phases) dispatch work to specialized AI workers through meetings and commissions.

## Current State

Phase 1 is complete. The UI skeleton is navigable with three views:

- **Dashboard** showing registered projects and recent artifacts
- **Project view** with tabbed artifact browsing by type/status
- **Artifact view** with markdown rendering, in-browser editing, and metadata sidebar

CLI tools handle project registration and config validation. 171 tests pass.

## Prerequisites

- [Bun](https://bun.sh/) (runtime and package manager)
- Node.js 20+ (for Next.js)

## Getting Started

```bash
bun install
bun run dev
```

Then open [http://localhost:3000](http://localhost:3000).

Register a project that has a `.lore/` directory:

```bash
bun run guild-hall register my-project /path/to/project
```

## Commands

```bash
bun run dev          # Next.js dev server
bun run build        # production build
bun run start        # start production server
bun run lint         # ESLint
bun run typecheck    # TypeScript type checking
bun test             # run all tests
bun test tests/lib/config.test.ts  # single test file
bun run guild-hall register <name> <path>  # register a project
bun run guild-hall validate                # validate config
```

## Tech Stack

- **Next.js** (App Router) with React 19 server and client components
- **CSS Modules** with a custom fantasy design system (glassmorphic panels, image-based borders, gem status indicators)
- **gray-matter** + **react-markdown** for artifact parsing and rendering
- **Zod** for config and frontmatter validation
- **Bun** for runtime, testing, and CLI scripts

## Project Structure

```
app/                          # Next.js App Router pages
  api/artifacts/              # PUT endpoint for artifact editing
  projects/[name]/            # Project view (tabbed artifacts)
    artifacts/[...path]/      # Artifact view (catch-all for deep paths)
components/
  ui/                         # Reusable fantasy-themed components (Panel, GemIndicator, etc.)
  dashboard/                  # Dashboard-specific components
  project/                    # Project view components
  artifact/                   # Artifact view components
lib/                          # Core business logic (server-side)
  config.ts                   # Config schemas, read/write
  artifacts.ts                # Artifact scanning, reading, writing
  paths.ts                    # Path resolution utilities
  types.ts                    # Shared interfaces
cli/                          # Bun CLI scripts (register, validate)
tests/                        # Mirrors source structure
public/images/ui/             # Fantasy UI assets (borders, gems, textures)
public/fonts/                 # Ysabeau Office (body), Source Code Pro (code)
```

## Configuration

Guild Hall stores its config at `~/.guild-hall/config.yaml`. Each registered project must contain a `.git/` directory and a `.lore/` directory with markdown artifacts.

## Roadmap

Development follows vertical slices defined in `.lore/plans/implementation-phases.md`:

1. **The Empty Hall** (complete) -- UI skeleton, artifact browsing, editing, CLI tools
2. **Workers + First Audience** -- Package discovery, worker identities, basic chat with AI specialists
3. **Meeting Lifecycle** -- Persistent meetings, meeting toolbox, notes generation
4. **Commissions** -- Async work delegation, dependency graphs, progress tracking
5. **Git Integration** -- Worktree isolation, branch-per-commission, PR creation
6. **Full System** -- Manager coordination, cross-workspace memory, plugin architecture

## License

Private.
