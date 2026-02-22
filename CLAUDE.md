# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Guild Hall is a multi-agent workspace for delegating work to AI specialists and reviewing their output. Fantasy guild aesthetic, file-based state, no database.

## Status

Phase 3 complete. 724 tests pass. Phase 1 delivered three views (Dashboard, Project, Artifact), CLI tools (register, validate), config/artifact libraries, and API route for artifact editing. Phase 2 added the daemon process (Hono on Unix socket), meeting sessions via Claude Agent SDK, worker packages, toolbox resolution, SSE streaming, and meeting chat UI. Phase 3 added meeting lifecycle (four states: requested/open/closed/declined), transcript storage, notes generation on close, session persistence across daemon restarts, session renewal on SDK expiry, meeting requests via propose_followup tool, and pending audiences UI on the Dashboard. Implementation follows vertical slices defined in `.lore/plans/implementation-phases.md`. Phase 1 notes at `.lore/plans/phase-1-empty-hall.md` and `.lore/notes/phase-1-empty-hall.md`.

## Architecture

**Phase 1: Next.js only.** Reads config and artifact files directly from the filesystem. Artifact editing writes directly to files via API route (VIEW-38 exception to the "writes go through daemon" rule).

**Phase 2: Daemon + meetings.** The daemon is a Bun process running a Hono app on a Unix socket at `~/.guild-hall/guild-hall.sock`. It owns meeting sessions and process management. Next.js reads files directly for page loads; writes and sessions go through the daemon. Meeting sessions use the Claude Agent SDK with SSE streaming to the browser. See `.lore/design/process-architecture.md`.

**Phase 3 (current): Meeting lifecycle.** Meetings have four states: requested, open, closed, declined. Transcripts are stored ephemerally during sessions and removed on close. Notes are generated via SDK on close (transcript + decisions + linked artifacts). Sessions persist across daemon restarts (state rehydrated from disk) and renew automatically on SDK session expiry. Workers can propose follow-up meetings via the propose_followup tool, which creates meeting requests. The Dashboard surfaces pending requests via the PendingAudiences component with Open/Defer/Ignore actions.

**Daemon process model:**
- Entry point: `daemon/index.ts`. Parses `--packages-dir` flag, cleans stale sockets, starts `Bun.serve({ unix, fetch })`, writes PID file, registers SIGINT/SIGTERM handlers.
- PID file at `<socket-path>.pid` enables crash recovery. On boot, if a PID file exists and the process is dead, both socket and PID file are cleaned up. If the process is alive, startup is rejected.
- Routes use DI factory pattern: `createHealthRoutes(deps)` receives injected dependencies. The app factory `createApp(deps)` wires route groups. Production wiring lives in `daemon/app.ts` via `createProductionApp()`.
- Meeting sessions manage Claude Agent SDK lifecycle, translate SDK messages to GuildHallEvents, and stream them via SSE.
- Toolbox resolver assembles base tools (6 built-in via MCP server), domain-specific tools from worker packages, and built-in tool configurations.

## Tech Stack

- **Framework**: Next.js App Router, server components for file reads, client components for interactive elements
- **Styling**: CSS Modules. Not Tailwind. The fantasy chrome uses image-based borders, glassmorphic panels, and texture backgrounds that don't suit utility classes.
- **Markdown**: gray-matter for frontmatter parsing, react-markdown + remark-gfm for rendering
- **Validation**: Zod schemas for config.yaml and artifact frontmatter
- **CLI**: Plain bun scripts in `cli/`, no framework
- **Daemon**: Hono on Unix socket via `Bun.serve()`, DI factory pattern for testability
- **Agent SDK**: Claude Agent SDK for meeting sessions, SSE streaming to browser

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
| `daemon/` | Daemon process (Hono HTTP API on Unix socket) |
| `packages/` | Worker/toolbox packages (local dev) |
| `~/.guild-hall/packages/` | Installed worker/toolbox packages |
| `~/.guild-hall/state/meetings/` | Machine-local meeting state |
| `~/.guild-hall/meetings/` | Ephemeral meeting transcripts (cleaned up on close) |
| `~/.guild-hall/guild-hall.sock` | Daemon Unix socket (runtime) |
| `~/.guild-hall/guild-hall.sock.pid` | Daemon PID file (runtime) |

## Component Model

Server components (pages) read config/artifacts from the filesystem with `await`, then pass data as props to client components. Client components handle local UI state only (e.g., edit mode toggle in ArtifactContent). No context providers or global state management in Phase 1.

Catch-all route `app/projects/[name]/artifacts/[...path]/` handles deep artifact hierarchies. Pages use `await searchParams` for query strings (Next.js 15 async params pattern).

**Phase 2 components:**
- `components/meeting/*` provides the chat interface: MeetingHeader, ChatInterface, MessageBubble, StreamingMessage, ToolUseIndicator, MessageInput, ErrorMessage.
- `components/ui/WorkerPicker.tsx` handles worker selection and consumes the SSE first-turn stream.
- `components/ui/DaemonStatus.tsx` polls daemon health and shows connection status.
- `components/project/StartAudienceButton.tsx` opens the worker picker from the project view.
- `components/project/MeetingList.tsx` lists project meetings with status gems.

**Phase 3 components:**
- `components/meeting/MeetingView.tsx` client wrapper composing chat, artifacts panel, and close flow.
- `components/meeting/ArtifactsPanel.tsx` collapsible linked artifacts sidebar with live updates during session.
- `components/meeting/NotesDisplay.tsx` modal showing generated notes after close.
- `components/dashboard/MeetingRequestCard.tsx` meeting request card with Open/Defer/Ignore actions.
- `components/dashboard/PendingAudiences.tsx` server component rendering request cards (replaced stub).

## API Routes

`PUT /api/artifacts` updates artifact body content (Phase 1 exception to "daemon owns writes"). Accepts `{ projectName, artifactPath, content }`. Guards against path traversal. Writes only the markdown body, preserving raw frontmatter bytes to avoid git diff noise from gray-matter reformatting.

**Phase 2 routes (Next.js API routes that proxy to daemon):**
- `POST /api/meetings` creates a meeting and streams the SSE first turn.
- `POST /api/meetings/[meetingId]/messages` sends a user message and streams the SSE response.
- `DELETE /api/meetings/[meetingId]` closes a meeting and returns `{ notes }` from notes generation.
- `POST /api/meetings/[meetingId]/interrupt` stops generation.
- `GET /api/workers` lists discovered workers.
- `GET /api/daemon/health` returns daemon health or `{ status: "offline" }`.

**Phase 3 routes:**
- `POST /api/meetings/[meetingId]/accept` accepts a meeting request and streams the SSE first turn.
- `POST /api/meetings/[meetingId]/decline` declines a meeting request.
- `POST /api/meetings/[meetingId]/defer` defers a meeting request with a date.

## Core Library Modules

| Module | Responsibility |
|--------|---------------|
| `lib/config.ts` | Zod schemas, `readConfig()`, `writeConfig()` for `config.yaml` |
| `lib/artifacts.ts` | `scanArtifacts()`, `readArtifact()`, `writeArtifactContent()` |
| `lib/artifact-grouping.ts` | Groups artifacts by type/status for project view tabs |
| `lib/paths.ts` | `getGuildHallHome()`, `getConfigPath()`, `projectLorePath()` |
| `lib/types.ts` | `ProjectConfig`, `AppConfig`, `Artifact` interfaces, `statusToGem()` |
| `lib/packages.ts` | Package discovery, Zod validation, worker/toolbox filtering |
| `lib/daemon-client.ts` | Unix socket HTTP client for daemon communication |
| `lib/meetings.ts` | `scanMeetings()`, `scanMeetingRequests()`, `readMeetingMeta()`, `parseTranscriptToMessages()` |
| `lib/sse-helpers.ts` | Shared SSE consumption: `consumeFirstTurnSSE()`, `storeFirstTurnMessages()`, `parseSSEBuffer()` |

## Daemon Modules

| Module | Responsibility |
|--------|---------------|
| `daemon/index.ts` | Entry point: parse args, start server, shutdown handlers |
| `daemon/app.ts` | Hono app factory, production wiring via `createProductionApp()` |
| `daemon/types.ts` | GuildHallEvent union, branded MeetingId/SdkSessionId |
| `daemon/lib/socket.ts` | Socket path resolution, stale cleanup, PID file management |
| `daemon/routes/health.ts` | `GET /health` liveness check |
| `daemon/routes/meetings.ts` | Meeting CRUD + SSE streaming (7 endpoints) |
| `daemon/routes/workers.ts` | `GET /workers` listing |
| `daemon/services/meeting-session.ts` | Meeting lifecycle, SDK session management, session recovery and renewal |
| `daemon/services/event-translator.ts` | SDK messages to GuildHallEvent translation |
| `daemon/services/base-toolbox.ts` | 6 base tools via `createSdkMcpServer()` |
| `daemon/services/toolbox-resolver.ts` | Assembles base + domain + built-in tools |
| `daemon/services/transcript.ts` | Transcript CRUD (create, append turns, read, parse, remove) |
| `daemon/services/notes-generator.ts` | Meeting notes generation via SDK (transcript + decisions + artifacts) |
| `daemon/services/meeting-toolbox.ts` | 3 meeting tools via MCP server (link_artifact, propose_followup, summarize_progress) |
| `daemon/services/meeting-artifact-helpers.ts` | Shared meeting artifact frontmatter manipulation |

**Type boundaries:** Daemon-specific types live in `daemon/` (e.g., `GuildHallEvent`, `MeetingId`, `SdkSessionId`, `MeetingStatus`, `AppDeps`). Shared types used by both daemon and Next.js live in `lib/types.ts`. The daemon imports from `lib/` via `@/lib/` path alias; `lib/` never imports from `daemon/`.

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
- Daemon tests: socket utilities use temp directories, health route uses Hono's `app.request()` test client with injected deps

## Artifact Schema

Every `.lore/*.md` file has YAML frontmatter: `title`, `date`, `status`, `tags`, optional `modules` and `related`. Status maps to gem colors: green (approved/active/complete), amber (draft/open/pending), red (superseded/outdated), blue (implemented/archived/default).

## Specs and Requirements

Requirements use the format `REQ-{PREFIX}-N` (e.g., REQ-SYS-2, REQ-VIEW-12). The implementation phases plan maps requirements to implementation steps. When implementing, trace work back to specific REQ IDs.

## Lessons from Retros

- Navigation between views is an implicit requirement. No dead ends. Every view has a path back to Dashboard.
- DI factories need production wiring. If the plan creates `createX(deps)` factories, include the step that instantiates real dependencies.
- gray-matter `stringify()` reformats YAML. When writing artifact content, splice the raw frontmatter bytes and replace only the body to avoid noisy git diffs.
- "Pre-existing" is not a reason to defer a finding. Present all issues with their actual impact.
