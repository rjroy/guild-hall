---
title: "Phase 1: The Empty Hall"
date: 2026-02-20
status: approved
tags: [plan, phase-1, ui, navigation, artifacts, config, design-system]
modules: [guild-hall-ui, guild-hall-core]
related:
  - .lore/plans/implementation-phases.md
  - .lore/specs/guild-hall-system.md
  - .lore/specs/guild-hall-views.md
  - .lore/specs/guild-hall-workers.md
  - .lore/design/process-architecture.md
  - .lore/retros/guild-hall-phase-1.md
  - .lore/retros/ui-redesign-fantasy-theme.md
---

# Plan: Phase 1 - The Empty Hall

## Spec Reference

**System Spec**: .lore/specs/guild-hall-system.md
**Views Spec**: .lore/specs/guild-hall-views.md
**Workers Spec**: .lore/specs/guild-hall-workers.md (identity rendering only)
**Process Architecture**: .lore/design/process-architecture.md

Requirements addressed:

- REQ-SYS-2: Artifact schema (markdown + YAML frontmatter) -> Step 3
- REQ-SYS-3: Artifact types as conventions, not fixed set -> Step 3
- REQ-SYS-26: Storage layout (~/.guild-hall/) -> Steps 3, 4
- REQ-SYS-27: Project artifacts in `<project>/.lore/` -> Step 3
- REQ-SYS-35: config.yaml structure (project registry, app settings) -> Step 3
- REQ-SYS-36: config.yaml as source of truth (human + agent editable) -> Steps 3, 4
- REQ-SYS-37: CLI tools for project registration and validation -> Step 4
- REQ-SYS-39: Files as interface (all state in files) -> Steps 3, 4
- REQ-VIEW-1: Fantasy guild aesthetic (dark medieval, glassmorphic, brass/amber) -> Step 2
- REQ-VIEW-2: Gem status indicators (green/amber/red/blue) -> Step 2
- REQ-VIEW-3: Worker identity rendering, stubbed (portrait frame, name, title) -> Step 2
- REQ-VIEW-4: Five views with back navigation, no dead ends -> Step 5
- REQ-VIEW-5: Navigation flows (Dashboard->Project, Project->Artifact functional) -> Steps 6, 7, 8
- REQ-VIEW-6: URL routing, deep linking, browser history -> Step 5
- REQ-VIEW-12: Dashboard five-zone layout (all present, mostly stubbed) -> Step 6
- REQ-VIEW-15: Project view header (name, description, repo link) -> Step 7
- REQ-VIEW-16: Project view three tabs (Commissions, Artifacts, Meetings) -> Step 7
- REQ-VIEW-36: Artifact breadcrumb navigation -> Step 8
- REQ-VIEW-37: Artifact provenance line, stubbed -> Step 8
- REQ-VIEW-38: Markdown render + edit toggle -> Step 8
- REQ-VIEW-39: Artifact metadata sidebar -> Step 8

## Codebase Context

Clean slate. No source code exists. Previous Phase 1 prototype fully deleted (commit fc9947a). Repository contains:

- `.lore/` documentation: 5 specs, 1 design, 11 retros, research, brainstorms
- `.lore/prototypes/` visual assets: mockups, fonts, icons, background, UI component images
- `.gitignore` configured for Next.js/TypeScript
- `.claude/settings.json` with session hooks (references stale scripts)

Available assets for UI:

| Asset | Location | Use |
|-------|----------|-----|
| Background | `.lore/prototypes/guild-hall-entry.webp` | Full-viewport dark medieval library |
| Ysabeau Office font | `.lore/prototypes/fonts/ysabeau-office/` | Body text |
| Source Code Pro font | `.lore/prototypes/fonts/source-code-pro/` | Code blocks, raw markdown |
| Favicon + icons | `.lore/prototypes/icon/` | Browser tab, app icon |
| Panel border | `.lore/prototypes/agentic-ux/components/border.webp` | Ornate brass frame for panels |
| Portrait frame | `.lore/prototypes/agentic-ux/components/circle-border.webp` | Circular bronze worker frame |
| Status gem | `.lore/prototypes/agentic-ux/components/gem.webp` | Blue crystal, CSS-tinted per status |
| Parchment texture | `.lore/prototypes/agentic-ux/components/paper-bg.webp` | Content area backgrounds |
| Scroll icon | `.lore/prototypes/agentic-ux/components/scroll-icon.webp` | Artifact list item icons |
| Scroll divider | `.lore/prototypes/agentic-ux/components/scroll-window.webp` | Decorative section separator |
| Reference mockups | `.lore/prototypes/agentic-ux/*.webp` | Visual direction (5 views) |

Key lessons from retros to apply:

- Navigation between views is an implicit requirement, no dead ends (Phase 1 retro)
- CSS `-webkit-backdrop-filter` must come BEFORE `backdrop-filter` in Next.js (UI redesign retro)
- DI factories need production wiring, not just test mocking (worker dispatch retro)
- No `mock.module()`, dependency injection only (user testing rules, bun compatibility)
- Don't skip review on any phase (Phase 1 retro)

Architecture decision for Phase 1: **Next.js only, no daemon.** The process architecture design mandates "daemon owns everything" for the full system, but Phase 1 has no meetings, commissions, or streaming. Artifact editing writes directly to filesystem per VIEW-38 constraint. The daemon is introduced in Phase 2 when meetings require session management.

## Implementation Steps

### Step 1: Project Scaffolding

**Files**: package.json, tsconfig.json, next.config.ts, eslint.config.mjs, .prettierrc, CLAUDE.md, app/layout.tsx, app/globals.css, app/page.tsx, .claude/settings.json (update)
**Addresses**: Foundation for all other steps
**Expertise**: None

Scaffold Next.js with `bunx create-next-app@latest` using App Router, TypeScript, ESLint, no Tailwind, no src/ directory. Then configure:

- tsconfig.json: strict mode, path alias `@/` for root
- ESLint: typescript-eslint recommended + type-checked (flat config with projectService)
- Prettier: default config
- CSS Modules for styling (not Tailwind; the bespoke fantasy chrome with image assets doesn't suit utility classes)

Copy prototype assets to public/:

```
public/
  fonts/
    ysabeau-office/   <- .lore/prototypes/fonts/ysabeau-office/
    source-code-pro/  <- .lore/prototypes/fonts/source-code-pro/
  images/
    background.webp   <- .lore/prototypes/guild-hall-entry.webp
    ui/
      border.webp        <- .lore/prototypes/agentic-ux/components/border.webp
      circle-border.webp <- (same source dir)
      gem.webp
      paper-bg.webp
      scroll-icon.webp
      scroll-window.webp
  favicon.ico         <- .lore/prototypes/icon/favicon.ico
  apple-icon.png      <- .lore/prototypes/icon/apple-icon.png
```

Install additional dependencies:

- Runtime: yaml, gray-matter, react-markdown, remark-gfm, zod
- Dev: (bundled with create-next-app setup)

Create CLAUDE.md documenting:

- Tech stack (Next.js App Router, bun, TypeScript strict, CSS Modules)
- Testing rules (bun test, no mock.module(), DI pattern)
- CSS convention (vendor prefix order for backdrop-filter)
- Asset locations (public/fonts/, public/images/)
- Architecture (Phase 1 is Next.js only, daemon in Phase 2)
- Config location (~/.guild-hall/config.yaml)

Update .claude/settings.json: remove the `bun install:guild-members` hook (guild-members is the old architecture). Keep `bun install` only.

Target project structure after scaffolding:

```
guild-hall/
  package.json
  tsconfig.json
  next.config.ts
  eslint.config.mjs
  .prettierrc
  CLAUDE.md
  app/
  components/
  lib/
  cli/
  public/
  tests/
```

### Step 2: Design System

**Files**: app/globals.css, components/ui/Panel.tsx + .module.css, components/ui/GemIndicator.tsx + .module.css, components/ui/WorkerPortrait.tsx + .module.css, components/ui/EmptyState.tsx + .module.css
**Addresses**: REQ-VIEW-1, REQ-VIEW-2, REQ-VIEW-3
**Expertise**: Frontend design for glassmorphic effects with layered image assets

CSS custom properties in globals.css:

- **Palette**: brass (#b8860b), bronze (#8B6914), amber (#FFB000), parchment (#f4e4c1), dark-bg (#1a1412), panel-bg (rgba translucent). Exact values calibrated against the mockup atmosphere.
- **Typography**: @font-face declarations for Ysabeau Office (body) and Source Code Pro (code) using the variable font .ttf files. Variable fonts need `font-weight: 100 900` range in @font-face, and `font-display: swap` to avoid invisible text during load.
- **Background**: guild-hall-entry.webp fixed, covering viewport, on the body element.
- **Spacing**: consistent scale for padding/margins.

**Panel component**: The core UI container. Every zone, card, and content area is a Panel. This is the highest-risk visual component in Phase 1, so it gets an isolation step before views are built.

**Step 2a: Panel prototype (decision gate).** Implement the Panel component in isolation and validate visually at three sizes: dashboard zone (~400x300), content card (~600x400), and full-width (~1200x600). Test two border approaches:

- `border-image` with `border-image-slice`: CSS-native, simpler, but limited control over how ornate corners render at varying aspect ratios.
- Nine-slice: split border.webp into corner + edge pieces, positioned absolutely. More control, more markup.

Pick one. Document the decision in CLAUDE.md. Proceed to Steps 6-8 only after the Panel renders correctly at all three sizes.

Panel internals:

- Interior uses paper-bg.webp as a low-opacity background texture behind a glassmorphic translucent layer.
- Glassmorphic effect: `-webkit-backdrop-filter: blur(12px)` then `backdrop-filter: blur(12px)` (vendor prefix order per retro).
- Props: size variant (sm, md, lg, full), optional title, optional className for overrides.

**GemIndicator component**: Status indicator used throughout all views.

- Renders gem.webp at small sizes (16px inline, 24px standalone).
- CSS `filter` for four status colors. The base gem is blue (informational). Green, amber, and red need calibrated `hue-rotate` + `saturate` + `brightness` values. If CSS filtering doesn't produce clean results, fall back to generating four separate tinted images.
- Props: `status: "active" | "pending" | "blocked" | "info"`, `size: "sm" | "md"`.

**WorkerPortrait component** (stubbed for Phase 1):

- Renders circle-border.webp as the frame around a circular image area.
- Accepts optional portrait URL. When absent, shows a generic silhouette placeholder.
- Displays name and title text below the frame.
- Phase 1: always renders with placeholder since no worker packages exist yet. The component API is ready for Phase 2.
- Props: `name?: string`, `title?: string`, `portraitUrl?: string`, `size: "sm" | "md" | "lg"`.

**EmptyState component**: Consistent empty/stub state treatment.

- Centered text within a Panel, subdued typography, parchment tone.
- Optional icon slot for thematic indicators.
- Props: `message: string`, `icon?: ReactNode`.

### Step 3: Config and Artifact Libraries

**Files**: lib/config.ts, lib/artifacts.ts, lib/paths.ts, lib/types.ts
**Addresses**: REQ-SYS-2, REQ-SYS-3, REQ-SYS-26, REQ-SYS-27, REQ-SYS-35, REQ-SYS-36, REQ-SYS-39
**Expertise**: None

**lib/paths.ts**: Path constants and helpers.

- `GUILD_HALL_HOME`: resolves `~/.guild-hall/` using `process.env.HOME`
- `CONFIG_PATH`: `~/.guild-hall/config.yaml`
- `projectLorePath(projectPath: string)`: returns `<projectPath>/.lore/`
- Accepts an override for GUILD_HALL_HOME (DI for testing)

**lib/types.ts**: Shared type definitions.

- `ProjectConfig`: { name, path, description?, repoUrl?, meetingCap? }
- `AppConfig`: { projects: ProjectConfig[], settings?: { ... } }
- `ArtifactMeta`: { title, date, status, tags, modules?, related? }
- `Artifact`: ArtifactMeta & { filePath, relativePath, content, lastModified }
- `GemStatus`: `"active" | "pending" | "blocked" | "info"`
- `statusToGem(status: string): GemStatus` mapping:
  - green/active: "approved", "active", "current", "complete", "resolved"
  - amber/pending: "draft", "open", "pending"
  - red/blocked: "superseded", "outdated", "wontfix"
  - blue/info: "implemented", "archived", anything unrecognized (safe default)

**lib/config.ts**: Config.yaml operations.

- Zod schemas for project entries and full config
- `readConfig(configPath?: string)`: reads and validates config.yaml. Missing file returns `{ projects: [] }`. Invalid YAML throws with location details.
- `writeConfig(config: AppConfig, configPath?: string)`: serializes and writes
- `getProject(name: string, configPath?: string)`: convenience for single project lookup
- All functions accept optional path parameter (DI for testing, defaults to CONFIG_PATH)

**lib/artifacts.ts**: Artifact file operations.

- `scanArtifacts(lorePath: string)`: recursively finds all .md files in the directory, parses frontmatter with gray-matter, returns Artifact[] sorted by lastModified descending. Gracefully handles files with malformed frontmatter (includes them with empty meta).
- `readArtifact(lorePath: string, relativePath: string)`: reads single artifact with full content and parsed frontmatter.
- `writeArtifactContent(lorePath: string, relativePath: string, content: string)`: writes content to file. Preserves existing frontmatter, replaces body. Implementation note: gray-matter's `stringify()` may reformat YAML differently from the original (key ordering, block style). To avoid noisy git diffs, read the raw frontmatter block as bytes and splice only the body portion rather than round-tripping through gray-matter's serializer.
- `recentArtifacts(lorePath: string, limit: number)`: returns top N by lastModified.
- Path validation: all functions verify the resolved path stays within the lorePath directory (prevents path traversal).

### Step 4: CLI Tool

**Files**: cli/index.ts, cli/register.ts, cli/validate.ts, package.json (bin entry)
**Addresses**: REQ-SYS-37
**Expertise**: None

Minimal bun scripts (no CLI framework, per TypeScript setup rules for utilities).

**cli/index.ts**: Entry point, dispatches subcommands.

- Parses `process.argv` for: `register`, `validate`, `help`
- Prints usage on unknown command or `help`

**cli/register.ts**: `guild-hall register <name> <path>`

- Validates: path exists, contains `.git/`, contains `.lore/`
- Creates `~/.guild-hall/` directory if it doesn't exist
- Reads existing config.yaml (or creates empty)
- Rejects duplicate project names
- Adds project entry, writes config
- Prints confirmation: "Registered project '<name>' at <path>"
- Uses lib/config.ts for all config operations

**Scope note**: This implements the validation and config-writing portions of REQ-SYS-37. The spec's full register command also creates an integration worktree and initializes the `claude` branch. Those git operations are deferred to the phase that introduces git isolation (Phase 5). Phase 1 reads files directly from the user's project directory.

**cli/validate.ts**: `guild-hall validate`

- Reads config.yaml, validates structure via Zod schema
- Checks each project: path exists, has .git/, has .lore/
- Reports all issues to stdout (doesn't fail on first error)
- Exits with code 0 if valid, 1 if issues found

package.json bin: `"guild-hall": "./cli/index.ts"` (bun executes .ts directly). Users invoke via `bun run guild-hall register <name> <path>` or `bunx guild-hall register <name> <path>`. No global installation required.

### Step 5: Navigation Shell and Routing

**Files**: app/layout.tsx (update), app/not-found.tsx, app/projects/[name]/layout.tsx, app/projects/[name]/page.tsx (placeholder), app/projects/[name]/artifacts/[...path]/page.tsx (placeholder)
**Addresses**: REQ-VIEW-4, REQ-VIEW-5, REQ-VIEW-6
**Expertise**: None

**Root layout** (app/layout.tsx):

- HTML metadata: title "Guild Hall", favicon, apple-icon
- Body: background image applied, font CSS loaded
- No persistent nav bar. Navigation is contextual per view (breadcrumbs, sidebar). The mockups don't show a generic nav bar; each view has its own header with contextual navigation.
- Children rendered within the viewport.

**URL routing**:

```
/                                          -> Dashboard
/projects/[name]                           -> Project view
/projects/[name]?tab=artifacts             -> Project view, artifacts tab active
/projects/[name]/artifacts/[...path]       -> Artifact view
```

The `[...path]` catch-all handles nested artifact paths like `specs/guild-hall-system.md`. Future phases add `/projects/[name]/commissions/[id]` and `/projects/[name]/meetings/[id]`.

**app/not-found.tsx**: Themed 404 page using Panel component. "This scroll could not be found." with link back to dashboard.

**Navigation completeness check** (Phase 1 retro lesson). Every flow must be verified in Step 9 integration tests:

- Dashboard sidebar -> click project -> `/projects/[name]`
- Dashboard Recent Artifacts -> click artifact -> `/projects/[name]/artifacts/[path]`
- Project view Artifacts tab -> click artifact -> `/projects/[name]/artifacts/[path]`
- Artifact view -> breadcrumb "Project" link -> `/projects/[name]`
- Any view -> Guild Hall title/logo -> `/` (dashboard)
- Every drill-down has breadcrumb back-navigation. No dead ends.

Browser back/forward works natively with App Router.

### Step 6: Dashboard

**Files**: app/page.tsx, app/page.module.css, components/dashboard/WorkspaceSidebar.tsx + .module.css, components/dashboard/ManagerBriefing.tsx, components/dashboard/DependencyMap.tsx, components/dashboard/RecentArtifacts.tsx + .module.css, components/dashboard/PendingAudiences.tsx
**Addresses**: REQ-VIEW-12
**Expertise**: Frontend layout (CSS Grid for five-zone positioning)

Reference mockup: `.lore/prototypes/agentic-ux/final-5-guild-glass_0.webp`

**Five-zone CSS Grid layout** matching mockup proportions:

```
+-----------+-------------------------+--------------+
|           |   Manager's Briefing    |   Recent     |
|  sidebar  +-------------------------+   Artifacts  |
|           |   Dependency Map        |              |
|           |   (commission DAG)      |              |
+-----------+-------------------------+--------------+
|           |   Pending Audiences                    |
+-----------+----------------------------------------+
```

Sidebar occupies the left column across all rows. Briefing and Map stack vertically in the center. Recent Artifacts spans the right column. Pending Audiences spans the bottom.

**WorkspaceSidebar** (functional):

- Server component reads config.yaml via lib/config.ts
- Lists projects with gem indicators (all blue/info in Phase 1 since no activity status exists)
- Project selection uses full-page navigation: each project is a `<Link href="/?project=name">`. This keeps the entire dashboard as server components. Selecting a project triggers a server-side re-render of the page with the new `searchParams`, so RecentArtifacts reads the correct project's artifacts. No client-side state management needed.
- Selected project visually highlighted (brass border accent)
- Projects grouped under "Active Projects" heading
- Empty state: "No projects registered. Run `guild-hall register <name> <path>` to add your first project."

**ManagerBriefing** (stubbed):

- Panel with scroll-window.webp as decorative header
- EmptyState: "No Guild Master configured."

**DependencyMap** (stubbed):

- Panel placeholder
- EmptyState: "No active commissions."

**RecentArtifacts** (functional):

- Server component reads artifacts for the selected project via lib/artifacts.ts
- Displays the 10 most recently modified artifacts
- Each item: scroll-icon.webp, artifact title, status gem, relative date
- Clicking navigates to the Artifact view
- No project selected: "Select a project to view recent artifacts."
- Project has no artifacts: "No artifacts found."

**PendingAudiences** (stubbed):

- Panel placeholder
- EmptyState: "No pending audiences."

### Step 7: Project View

**Files**: app/projects/[name]/page.tsx + .module.css, components/project/ProjectHeader.tsx + .module.css, components/project/ProjectTabs.tsx + .module.css, components/project/ArtifactList.tsx + .module.css
**Addresses**: REQ-VIEW-15, REQ-VIEW-16
**Expertise**: None

Reference mockup: `.lore/prototypes/agentic-ux/view-project-quest_0.webp`

**Server component** at app/projects/[name]/page.tsx:

- Reads project config by name from config.yaml
- If project not found: redirect to 404
- Reads artifacts from the project's .lore/ directory
- Passes data to child components

**ProjectHeader**:

- Project name in decorative heading
- Description (from config, if present)
- Linked repository URL with external link icon (from config, if present)
- "Start Audience with Guild Master" button: visually present, disabled. No tooltip needed, just visually subdued.

**ProjectTabs**:

- Three tabs: Commissions, Artifacts, Meetings
- Tab state via URL search param (`?tab=artifacts`, default)
- Tab bar uses Panel styling with gem indicators per tab

**Artifacts tab** (functional):

- ArtifactList component
- Groups artifacts by directory within .lore/ (specs/, plans/, retros/, brainstorms/, etc.)
- Each row: scroll-icon.webp, title (from frontmatter), status gem, date, tags as small badges
- Clicking a row navigates to `/projects/[name]/artifacts/[relativePath]`

**Commissions tab**: EmptyState "No commissions yet."
**Meetings tab**: EmptyState "No meetings yet."

### Step 8: Artifact View

**Files**: app/projects/[name]/artifacts/[...path]/page.tsx + .module.css, components/artifact/ArtifactBreadcrumb.tsx, components/artifact/ArtifactProvenance.tsx, components/artifact/MarkdownViewer.tsx, components/artifact/MarkdownEditor.tsx + .module.css, components/artifact/MetadataSidebar.tsx + .module.css, app/api/artifacts/route.ts
**Addresses**: REQ-VIEW-36, REQ-VIEW-37, REQ-VIEW-38, REQ-VIEW-39
**Expertise**: None

Reference mockup: `.lore/prototypes/agentic-ux/view-artifact-scroll_0.webp`

**Two-column layout**: main content panel (left, wider) + metadata sidebar (right, narrower).

**ArtifactBreadcrumb** (REQ-VIEW-36):

- "Project: [name] > Artifact: [title]"
- Project name is a link back to the Project view
- "Guild Hall" prefix links to Dashboard

**ArtifactProvenance** (REQ-VIEW-37, stubbed):

- WorkerPortrait placeholder (generic silhouette)
- Text: "Source information unavailable"
- Ready for Phase 2+ when meetings/commissions provide provenance data

**MarkdownViewer** (server component):

- Renders artifact body using react-markdown + remark-gfm
- Styled with parchment aesthetic (paper-bg.webp background on content area)
- Code blocks use Source Code Pro font
- Headings, lists, tables styled to match the fantasy theme

**MarkdownEditor** (client component):

- "Edit" toggle button (pen icon, top right of content panel, per mockup)
- Edit mode: monospace textarea with the raw markdown, full height
- Save button: sends PUT to `/api/artifacts` route
- Cancel button: discards changes, returns to view mode
- Tracks unsaved changes state

**MetadataSidebar** (REQ-VIEW-39):

- Panel with metadata extracted from frontmatter:
  - Status with gem indicator
  - Date
  - Tags as small styled badges
  - Modules (if present)
- "Project" link navigating to Project view
- "Associated Commissions" section: empty, "No commissions reference this artifact."
- "Create Commission from Artifact" button: disabled
- "Related" section: lists paths from frontmatter `related` field, each linking to its artifact view (resolves relative paths within .lore/)

**API route** (app/api/artifacts/route.ts):

- PUT handler for saving edited artifact content
- Request body: `{ projectName: string, artifactPath: string, content: string }`
- Validates: projectName exists in config, artifactPath resolves within the project's .lore/ directory (no path traversal)
- Calls lib/artifacts.ts writeArtifactContent
- Returns 200 on success, 400/404 on validation failure

### Step 9: Testing

**Files**: tests/lib/config.test.ts, tests/lib/artifacts.test.ts, tests/cli/register.test.ts, tests/components/GemIndicator.test.tsx, tests/components/Panel.test.tsx, tests/integration/navigation.test.ts
**Addresses**: Verification of all requirements
**Expertise**: None

**tests/lib/config.test.ts**:

- Valid config.yaml parses correctly (single project, multiple projects, optional fields present/absent)
- Invalid YAML content throws with details
- Missing config file returns empty config `{ projects: [] }`
- Zod rejects: missing required fields (name, path), wrong types, extra unknown fields pass through
- writeConfig round-trips correctly (write then read produces same data)

**tests/lib/artifacts.test.ts**:

- scanArtifacts finds all .md files recursively in a temp directory
- Parses valid frontmatter (title, date, status, tags)
- Handles malformed frontmatter gracefully (file included with empty meta, not skipped)
- Handles files with no frontmatter (plain markdown)
- Results sorted by lastModified descending
- writeArtifactContent preserves frontmatter, replaces body only
- readArtifact returns full content + parsed meta
- Path traversal attempts rejected (../../../etc/passwd)

**tests/cli/register.test.ts**:

- Register creates ~/.guild-hall/ directory if missing (using temp dir override)
- Register adds project to config.yaml
- Register rejects: non-existent path, path without .git/, path without .lore/, duplicate name
- Validate reports issues for each invalid project in config

**tests/components/GemIndicator.test.tsx**:

- Renders with correct CSS filter class for each status value
- Renders at both size variants

**tests/components/Panel.test.tsx**:

- Renders children within the panel structure
- Applies size variant classes correctly
- Title prop renders in header area

**tests/integration/navigation.test.ts**:

These tests verify navigation completeness. Two approaches, decide during implementation:

- **Option A (lightweight)**: Use Next.js `next/test-utils` or render server components with a test config, verify that Link hrefs are correct and that each page renders without error given valid route params. This validates URL construction and component rendering but not browser behavior.
- **Option B (full browser)**: Add Playwright as a dev dependency. Start the Next.js dev server, navigate between views, verify URLs and page content. This validates actual browser behavior including back/forward.

Option A is faster and sufficient for Phase 1 (routes are simple, App Router handles browser history natively). Option B is worth adding in Phase 2 when meeting streaming needs browser-level validation.

Test cases regardless of approach:

- Dashboard renders project list from config
- Project link in sidebar points to correct Project view URL
- Dashboard Recent Artifacts link points to correct Artifact view URL
- Project view Artifacts tab lists artifacts with correct Artifact view URLs
- Breadcrumb links point back correctly (Artifact -> Project, Project -> Dashboard)
- 404 page renders for non-existent project
- 404 page renders for non-existent artifact path
- All views have a navigation path back to Dashboard (no dead ends)

All tests use dependency injection:

- Config tests: pass explicit temp file paths, not ~/.guild-hall/
- Artifact tests: create temp directories with test .md files
- CLI tests: temp directories for both ~/.guild-hall/ and project paths
- No mock.module() anywhere (bun compatibility, retro lesson)

### Step 10: Validate Against Spec

Launch a fresh-context sub-agent that reads the Phase 1 scope from `.lore/plans/implementation-phases.md`, the System spec, and the Views spec. The agent reviews the implementation and flags any Phase 1 requirements not met. This step is not optional.

The agent checks:

- Every REQ listed in the Spec Reference section above is implemented
- Navigation completeness: all Phase 1 flows from VIEW-5 work, no dead ends
- Deep linking: each view has a stable URL, browser history works
- Empty states: all stubbed zones have meaningful placeholder content
- Design language: gems, panels, and aesthetic match the mockup direction
- Config.yaml parsing handles valid and invalid inputs
- Artifact scanning, frontmatter parsing, and editing work end-to-end
- Tests exist and pass for all libraries and key components
- CLAUDE.md accurately reflects the implemented architecture

## Delegation Guide

Steps requiring specialized expertise:

- **Step 2 (Design System)**: The glassmorphic panel with image assets is the highest-risk visual implementation. The border.webp frame needs to scale gracefully across different panel sizes. Consider prototyping the Panel component in isolation first, testing at dashboard zone sizes and small card sizes, before building it into views.
- **Step 10 (Validation)**: Launch the `plan-reviewer` agent after saving this plan. During implementation, use `pr-review-toolkit:code-reviewer` after completing each major step (especially Steps 2, 6, 8).

Available agents from `.lore/lore-agents.md`:

- `code-simplifier`: after each step for clarity pass
- `pr-review-toolkit:code-reviewer`: before commits
- `pr-review-toolkit:type-design-analyzer`: when defining the types in lib/types.ts

## Empty State Definitions

| Location | Content |
|----------|---------|
| Dashboard, no projects registered | "No projects registered. Run `guild-hall register <name> <path>` to add your first project." |
| Dashboard, Manager's Briefing | "No Guild Master configured." |
| Dashboard, Dependency Map | "No active commissions." |
| Dashboard, Recent Artifacts (no project selected) | "Select a project to view recent artifacts." |
| Dashboard, Recent Artifacts (project has none) | "No artifacts found." |
| Dashboard, Pending Audiences | "No pending audiences." |
| Project view, Commissions tab | "No commissions yet." |
| Project view, Meetings tab | "No meetings yet." |
| Project view, Start Audience button | Visually present, disabled |
| Artifact view, Provenance | "Source information unavailable." |
| Artifact view, Associated Commissions | "No commissions reference this artifact." |
| Artifact view, Create Commission button | Visually present, disabled |

## Open Questions

1. **Gem color calibration**: The base gem.webp is blue. CSS `hue-rotate` + `saturate` + `brightness` filter combinations for green, amber, and red need visual testing during Step 2. If CSS filtering doesn't produce clean results (the crystal facets may shift color unevenly), fall back to generating four separate tinted gem images from the base asset.

2. **border.webp scaling strategy**: Two approaches for the Panel frame. `border-image` with `border-image-slice` is the CSS-native approach but gives limited control over how the ornate corners render at different aspect ratios. Alternatively, slice the image into 9 pieces (corners + edges + center) for a proper nine-slice implementation. Decide during Step 2 based on how the single image renders at dashboard-zone sizes vs small card sizes.

3. **Artifact path encoding**: The catch-all route `[...path]` needs to handle artifact paths with `.md` extensions and nested directories. Verify Next.js doesn't strip or reject file extensions in route segments. If problematic, encode the path as a base64 query parameter instead.

4. **First-run experience**: When no config.yaml exists and no projects are registered, the dashboard is essentially empty. The empty state messages in the sidebar should guide the user clearly toward running the CLI registration command. Consider whether the dashboard should also show a prominent "Getting Started" panel in this state.
