# CLAUDE.md

## Project

Guild Hall is a multi-agent workspace for delegating work to AI specialists and reviewing their output. Fantasy guild aesthetic, file-based state, no database.

## Key Rules

**Daemon is the write boundary.** The daemon (Hono on `~/.guild-hall/guild-hall.sock`) owns all write operations, sessions, scheduled commissions, and the EventBus. Web and CLI are UX clients over its REST API. See `.lore/specs/infrastructure/daemon-application-boundary.md`.

**LLM interaction boundary.** All LLM calls go through the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`). No direct Anthropic API calls. If the full `runSdkSession` pipeline is too heavy, build a lighter SDK session. Do not drop to the raw API.

**DI factory pattern.** Routes use `createXRoutes(deps)`. Production wiring lives in `apps/daemon/app.ts` via `createProductionApp()`. New factories must be wired there.

**Type boundaries.** Daemon-specific types live in `apps/daemon/types.ts`. Shared types live in `lib/types.ts`. `lib/` never imports from `apps/daemon/` or `apps/web/`.

**Five Concerns.** Session, Activity, Artifact, Toolbox, and Worker are separate concerns with boundary rules. See `.lore/specs/infrastructure/daemon-application-boundary.md`.

**Plugin naming.** Claude plugin names in `plugin/.claude-plugin/plugin.json` must be kebab-case. The Claude Agent SDK will not load plugins with spaces or other non-kebab naming.

**Git branch tiers.** `master` / `claude` / activity branches. All git operations go through `apps/daemon/lib/git.ts`; rebase/sync through `apps/daemon/services/git-admin.ts`.

**`@/` path alias.** Resolves to repo root everywhere. `apps/web/tsconfig.json` must use `baseUrl: ".."` plus an explicit `@/*` mapping — bun resolves the nearest `tsconfig.json` per file, and relative `../*` paths break under `extends`.

## Commands

```bash
bun run dev                        # daemon + Next.js
bun run dev:daemon                 # daemon only (watch)
bun run dev:next                   # Next.js only (turbopack)
bun run build                      # production build
bun run lint                       # ESLint
bun run typecheck                  # TypeScript
bun test                           # all tests
bun test lib/tests/config.test.ts  # single file
bun run guild-hall --help          # CLI subcommands
```

## Pre-commit Hook

`.git-hooks/pre-commit.sh` runs typecheck, lint, tests, and production build. All four must pass. On failure, fix and create a new commit — do not amend. Configured via `core.hooksPath`.

## Testing

- **No `mock.module()`**. It causes infinite loops in bun. Use dependency injection: functions accept path/config parameters with defaults, tests pass temp directories.
- Tests use `fs.mkdtemp()` for temp directories, clean up in `afterEach`. Override `GUILD_HALL_HOME` for config path isolation.
- Daemon tests use Hono's `app.request()` test client with injected deps.
- Tests must not modify the actual repo. Use temp directories for any git or filesystem operations.

## Design System

The web app uses the guild design system. Tokens live in `apps/web/app/globals.css`; shared utility classes (paper, card, btn, scroll, gem, ribbon-tabs, tree-row, side-row, bubble-them/you, etc.) live in `apps/web/app/guild.css`. Reusable React primitives (Icon, StatusPill, Tag, Flourish, WorkerAvatar, AppBar) live in `apps/web/components/guild/`.

Theme is set on `<html data-theme="dark">` (or `"light"` for parchment mode). Toggle persists in `localStorage` under `guild:theme` and broadcasts via the `guild:theme-change` event so multiple AppBar instances stay in sync. AppBar reads it via `useSyncExternalStore` to avoid hydration mismatches.

Token families:
- **Surfaces:** `--bg`, `--bg-raised`, `--bg-sunken`, `--bg-inverse`
- **Foregrounds:** `--fg`, `--fg-1`, `--fg-2`, `--fg-3`, `--fg-muted`, `--fg-on-dark`, `--fg-on-ember`
- **Borders:** `--rule`, `--rule-strong`, `--rule-soft`
- **Brand:** `--brand`, `--brand-hover`, `--brand-press`, `--brand-soft`
- **Status:** `--success`, `--warning`, `--danger`, `--info` (each with `*-soft` variant)
- **Palette ramps:** `--parchment-50..400`, `--ink-400..900`, `--ember-50..900`, `--brass-300..700`, `--moss-300..700`, `--lapis-300..700`, `--oxblood-300..700`, `--verdigris-300..700`
- **Type:** `--font-display` (IM Fell English SC), `--font-serif` (Vollkorn), `--font-body` (Vollkorn), `--font-mono` (JetBrains Mono); scale `--text-xs..6xl`; leading and tracking tokens
- **Space:** `--space-1..24` (4px base)
- **Radius:** `--radius-sm`, `--radius`, `--radius-md`, `--radius-lg`, `--radius-xl`, `--radius-pill`
- **Shadow:** `--shadow-xs..lg`, `--shadow-glow`, `--shadow-rune`, `--shadow-inset`
- **Motion:** `--ease-out`, `--ease-in`, `--ease-soft`, `--dur-fast`, `--dur`, `--dur-slow`

## CSS Quirks

- **Vendor prefix order matters.** `-webkit-backdrop-filter` must come BEFORE `backdrop-filter` or the standard property gets dropped during Next.js compilation.
- **No CSS Modules `composes`.** Turbopack silently ignores it. Use TSX-side class composition instead.
- **No raw color values in CSS Modules.** All colors must use guild tokens from `apps/web/app/globals.css`. Add a token there first; never use hex, rgb, or hsl literals in `.module.css`.
- **Theme-aware styles use `:global([data-theme="dark"])`.** CSS Modules scope class names by default; the theme attribute is global, so dark-mode overrides need the `:global()` selector.
- Styling uses CSS Modules, not Tailwind.

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
