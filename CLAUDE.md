# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Guild Hall is a multi-agent workspace for delegating work to AI specialists and reviewing their output. Fantasy guild aesthetic, file-based state, no database.

## Status

Phase 1 complete. Three views (Dashboard, Project, Artifact), CLI tools (register, validate), config/artifact libraries, and API route for artifact editing. 171 tests pass. Implementation follows vertical slices defined in `.lore/plans/implementation-phases.md`. Phase 1 plan and implementation notes at `.lore/plans/phase-1-empty-hall.md` and `.lore/notes/phase-1-empty-hall.md`.

## Architecture

**Phase 1 (current): Next.js only.** No daemon. Reads config and artifact files directly from the filesystem. Artifact editing writes directly to files via API route (VIEW-38 exception to the "writes go through daemon" rule).

**Phase 2+:** Daemon (Bun process, Hono on Unix socket at `~/.guild-hall/guild-hall.sock`) owns all sessions and process management. Next.js becomes a pure UI client. See `.lore/design/process-architecture.md`.

## Tech Stack

- **Framework**: Next.js App Router, server components for file reads, client components for interactive elements
- **Styling**: CSS Modules. Not Tailwind. The fantasy chrome uses image-based borders, glassmorphic panels, and texture backgrounds that don't suit utility classes.
- **Markdown**: gray-matter for frontmatter parsing, react-markdown + remark-gfm for rendering
- **Validation**: Zod schemas for config.yaml and artifact frontmatter
- **CLI**: Plain bun scripts in `cli/`, no framework

## Commands

```bash
bun install                    # install dependencies
bun run dev                    # start Next.js dev server
bun run build                  # production build
bun run lint                   # ESLint
bun run typecheck              # TypeScript type checking
bun test                       # run all tests
bun test tests/lib/config.test.ts  # run a single test file
bun run guild-hall register <name> <path>  # register a project
bun run guild-hall validate                # validate config
```

## Key Paths

| Path | Purpose |
|------|---------|
| `~/.guild-hall/config.yaml` | Project registry and app settings (source of truth) |
| `<project>/.lore/` | Project artifacts (markdown + YAML frontmatter) |
| `public/images/ui/` | UI component assets (border, gem, portrait frame, parchment, scroll) |
| `public/fonts/` | Ysabeau Office (body), Source Code Pro (code) |
| `.lore/specs/` | Five specs: system, workers, commissions, meetings, views |
| `.lore/plans/` | Implementation phases and per-phase plans |
| `.lore/retros/` | Post-mortems with lessons to apply |

## Component Model

Server components (pages) read config/artifacts from the filesystem with `await`, then pass data as props to client components. Client components handle local UI state only (e.g., edit mode toggle in ArtifactContent). No context providers or global state management in Phase 1.

Catch-all route `app/projects/[name]/artifacts/[...path]/` handles deep artifact hierarchies. Pages use `await searchParams` for query strings (Next.js 15 async params pattern).

## API Routes

`PUT /api/artifacts` updates artifact body content (Phase 1 exception to "daemon owns writes"). Accepts `{ projectName, artifactPath, content }`. Guards against path traversal. Writes only the markdown body, preserving raw frontmatter bytes to avoid git diff noise from gray-matter reformatting.

## Core Library Modules

| Module | Responsibility |
|--------|---------------|
| `lib/config.ts` | Zod schemas, `readConfig()`, `writeConfig()` for `config.yaml` |
| `lib/artifacts.ts` | `scanArtifacts()`, `readArtifact()`, `writeArtifactContent()` |
| `lib/artifact-grouping.ts` | Groups artifacts by type/status for project view tabs |
| `lib/paths.ts` | `getGuildHallHome()`, `getConfigPath()`, `projectLorePath()` |
| `lib/types.ts` | `ProjectConfig`, `AppConfig`, `Artifact` interfaces, `statusToGem()` |

## CSS Design System

`globals.css` defines the design token system: `--color-brass/bronze/amber` (metallics), `--color-parchment/dark-bg` (backgrounds), `--space-xs` through `--space-2xl` (8-step scale), `--font-body` (Ysabeau Office), `--font-code` (Source Code Pro). GemIndicator uses CSS `hue-rotate()` + `saturate()` filters on a base gem.webp image (`--gem-active/pending/blocked/info`).

## CSS Quirks

**Vendor prefix order matters.** In Next.js, `-webkit-backdrop-filter` must come BEFORE `backdrop-filter` or the standard property gets dropped during compilation. Add inline comments where this applies. (Source: `.lore/retros/ui-redesign-fantasy-theme.md`)

## Testing

- **No `mock.module()`**. It causes infinite loops in bun. All code uses dependency injection: functions accept path/config parameters with defaults, tests pass temp directories.
- Tests use `fs.mkdtemp()` for temp directories, clean up in `afterEach`. Override `GUILD_HALL_HOME` env var for config path isolation.
- Config tests: in-memory YAML strings, temp file paths
- Artifact tests: temp directories with test .md files
- Navigation tests: verify link hrefs and page rendering, not browser automation (Phase 1)

## Artifact Schema

Every `.lore/*.md` file has YAML frontmatter: `title`, `date`, `status`, `tags`, optional `modules` and `related`. Status maps to gem colors: green (approved/active/complete), amber (draft/open/pending), red (superseded/outdated), blue (implemented/archived/default).

## Specs and Requirements

Requirements use the format `REQ-{PREFIX}-N` (e.g., REQ-SYS-2, REQ-VIEW-12). The implementation phases plan maps requirements to implementation steps. When implementing, trace work back to specific REQ IDs.

## Lessons from Retros

- Navigation between views is an implicit requirement. No dead ends. Every view has a path back to Dashboard.
- DI factories need production wiring. If the plan creates `createX(deps)` factories, include the step that instantiates real dependencies.
- gray-matter `stringify()` reformats YAML. When writing artifact content, splice the raw frontmatter bytes and replace only the body to avoid noisy git diffs.
- "Pre-existing" is not a reason to defer a finding. Present all issues with their actual impact.
