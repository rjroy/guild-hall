# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Guild Hall is a multi-agent workspace for delegating work to AI specialists and reviewing their output. Fantasy guild aesthetic, file-based state, no database.

## Status

Greenfield. No source code exists yet. Implementation follows vertical slices defined in `.lore/plans/implementation-phases.md`. Phase 1 plan is at `.lore/plans/phase-1-empty-hall.md`.

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
bun install          # install dependencies
bun run dev          # start Next.js dev server
bun test             # run all tests
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

## CSS Quirks

**Vendor prefix order matters.** In Next.js, `-webkit-backdrop-filter` must come BEFORE `backdrop-filter` or the standard property gets dropped during compilation. Add inline comments where this applies. (Source: `.lore/retros/ui-redesign-fantasy-theme.md`)

## Testing

- **No `mock.module()`**. It causes infinite loops in bun. All code uses dependency injection: functions accept path/config parameters with defaults, tests pass temp directories.
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
