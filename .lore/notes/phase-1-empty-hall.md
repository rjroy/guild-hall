---
title: "Implementation notes: phase-1-empty-hall"
date: 2026-02-20
status: complete
tags: [implementation, notes]
source: .lore/plans/phase-1-empty-hall.md
modules: [guild-hall-ui, guild-hall-core]
---

# Implementation Notes: Phase 1 - The Empty Hall

## Progress
- [x] Phase 1: Project Scaffolding
- [x] Phase 2: Design System
- [x] Phase 3: Config and Artifact Libraries
- [x] Phase 4: CLI Tool
- [x] Phase 5: Navigation Shell and Routing
- [x] Phase 6: Dashboard
- [x] Phase 7: Project View
- [x] Phase 8: Artifact View
- [x] Phase 9: Testing
- [x] Phase 10: Validate Against Spec

## Log

### Phase 1: Project Scaffolding
- Dispatched: Scaffold Next.js App Router project with TypeScript, ESLint, CSS Modules. Copy prototype assets to public/. Install runtime deps. Create directory structure.
- Result: Next.js 16.1.6, React 19, all deps installed. Assets copied. Directories created. CLAUDE.md preserved.
- Review: All 20 checklist items passed. No issues found.

### Phase 2: Design System
- Dispatched: globals.css design tokens, Panel (border-image approach), GemIndicator (CSS filter tints), WorkerPortrait (stubbed), EmptyState components.
- Result: All components built as server components with CSS Modules. border-image-slice: 60 fill for Panel. Gem filters use CSS custom properties from globals.css.
- Review: Two findings. (1) Gem filter values duplicated between globals.css and GemIndicator.module.css (fixed: now uses var() references). (2) Panel border-image fill may interfere with glassmorphic layer (noted for visual verification; center is transparent so layering should be correct).
- Decision: border-image approach chosen over nine-slice. The border.webp geometry (ornate corners, thin uniform edges) works well with CSS border-image.

### Phase 3: Config and Artifact Libraries
- Dispatched: lib/paths.ts, lib/types.ts, lib/config.ts, lib/artifacts.ts with DI pattern. Agent also wrote 66 tests across 4 test files.
- Result: All libs implemented. writeArtifactContent correctly splices raw frontmatter (no gray-matter.stringify). Path traversal validation on all artifact ops. Zod schemas exported for CLI reuse. Date objects from YAML handled correctly.
- Tests: 66 pass, 0 fail. All use temp directories, no mock.module().
- Review: Two minor style findings (non-null assertions in tests without comments, AppConfig type cast could drift from Zod schema). Not blocking.

### Phase 4: CLI Tool
- Dispatched: cli/index.ts (entry point), cli/register.ts, cli/validate.ts. package.json bin + scripts entries. Agent wrote 19 tests.
- Result: register validates path/.git/.lore, rejects duplicates, resolves relative paths. validate reports ALL issues. Only index.ts calls process.exit.
- Tests: 85 total pass (66 + 19). All DI via homeOverride.
- Review: Two test coverage gaps in validate tests (exit code only, not issue content). Fixed: tests now capture console.error and assert on issue lines.

### Phase 5: Navigation Shell and Routing
- Dispatched: Root layout update, 404 page with Panel, route structure (projects/[name], artifacts/[...path]).
- Result: All routes compile. 404 themed with fantasy language. Async params pattern for Next.js 15+. No persistent nav bar (contextual per view). 85 tests still pass.

### Phase 6: Dashboard
- Dispatched: Five-zone CSS Grid, WorkspaceSidebar (functional), ManagerBriefing/DependencyMap/PendingAudiences (stubbed), RecentArtifacts (functional).
- Result: All zones implemented. Sidebar reads config, lists projects with gem indicators, navigates via searchParams. RecentArtifacts shows 10 most recent with scroll-icon, title, gem, date. All empty state messages match plan exactly.
- Review: No issues found. All 17 checklist items passed. Server components only, correct Next.js 15+ patterns.

### Phase 7: Project View
- Dispatched: ProjectHeader (breadcrumb, description, repo link, disabled Start Audience), ProjectTabs (3 tabs via searchParams), ArtifactList (grouped by directory with badges).
- Result: All components built. Artifact grouping extracted to lib/artifact-grouping.ts for testability (positive deviation from plan file list). 22 new tests.
- Review: Critical finding: double-encoding bug (URL segment passed raw to children that re-encode). Fixed: decode once in page.tsx, pass decoded name to all children.

### Phase 8: Artifact View
- Dispatched: ArtifactBreadcrumb, ArtifactProvenance (stubbed), ArtifactContent (client component with edit toggle), MetadataSidebar, API route for saves. 10 new tests.
- Result: Two-column layout, react-markdown + remark-gfm rendering, edit/save/cancel flow, metadata sidebar with related links.
- Review: Five findings. (1) API route test didn't test actual handler, fixed with GUILD_HALL_HOME env var in lib/paths.ts. (2) Stale content after save, fixed with router.refresh(). (3) Empty content allowed via API, accepted as valid. (4) Metadata sidebar test duplicated logic, fixed by exporting relatedToHref. (5) relatedToHref didn't encode path segments, fixed.
- 118 tests pass after fixes.

### Phase 9: Testing
- Dispatched: GemIndicator tests (9), Panel tests (10), integration/navigation tests (32).
- Result: 169 total tests pass. Navigation completeness verified: every view has links to and from connected views, no dead ends. URL encoding round-trips tested. Status mapping completeness verified against all spec statuses.

### Phase 10: Validate Against Spec
- Dispatched: Fresh-context agent read all specs and reviewed the implementation.
- Result: 19 of 21 requirements passed. Two PARTIAL (VIEW-4, VIEW-5): Dashboard sidebar filtered but had no direct link to Project view.
- Resolution: Added "View >" link to each project in sidebar, linking to /projects/{name}. 2 new navigation tests added. All 21 requirements now satisfied.
- Additional: CLAUDE.md status section updated to reflect Phase 1 completion. Artifact type uses nested meta (positive deviation from plan's flat merge).
- Final: 171 tests pass, build clean, all REQs met.

## Divergence

- **Artifact type nesting**: Plan defined Artifact as `ArtifactMeta & { filePath, ... }` (flat). Implementation uses `{ meta: ArtifactMeta, filePath, ... }` (nested). Better avoids name collisions. (approved)
- **lib/artifact-grouping.ts extraction**: Not in plan file list. Extracted from ArtifactList for testability with 22 tests. (approved)
- **GUILD_HALL_HOME env var**: Added to lib/paths.ts for API route testing DI. Not in plan but required by the DI pattern for route handler testing. (approved)
