# Changelog

## [Unreleased]

### Added

- **Project grouping:** Projects can be organized into named groups via a new `group` field in `config.yaml`. Two new CLI commands: `guild-hall system config project group <name> <group>` to assign a group and `guild-hall system config project deregister <name> [--clean]` to remove a project (with optional worktree cleanup). The `register` command accepts an optional third positional argument for group. The sidebar renders collapsible group sections (collapse state persisted per browser session) with an A→Z/Z→A sort toggle. The "All Projects" dashboard view shows projects organized into collapsible group sub-sections. The `"ungrouped"` group always sorts last.

### Fixed

- **Artifact view scroll and sidebar collapse button:** Removed the duplicate scrollbar inside the artifact viewer (the inner `.markdownContent` no longer competes with `.main` for scrolling) and dropped the `calc(100% - 50px)` height trick on `.viewer`/`.editor` that was leaving a band of `.main` background bleeding through where the card should have continued. The `Edit`/`Cancel`/`Save` toolbar is now sticky at the top of the scroll container. The sidebar's collapse arrow is fully clickable: it was sharing `z-index: 1` with `Panel`'s inner content, and DOM order let the panel capture clicks on the arrow's center.

## [1.1.0] - 2026-03-20

### Added

- **Session specs, plans, and implementations:** Meeting layer separation completed in 3 phases with Orchestrator refactor, session loop extraction (1,552 → 800 lines), and interface re-organization. Meetings list preview showing agenda/notes excerpt. Event router spec and plan for daemon notification routing via EventBus. Context type registry spec for extensibility. Guild capabilities discovery plan ([#125](https://github.com/rjroy/guild-hall/pull/125))
- **Replicate toolbox and Illuminator worker:** New integration toolbox for AI image generation via Replicate. Illuminator worker for image generation and analysis with full project checkout scope ([#121](https://github.com/rjroy/guild-hall/pull/121))
- **Artifact image display and memory redesign:** Images in artifacts render inline with proper scaling and layout. Memory system redesigned to single-file structure with named sections for cleaner API ([#121](https://github.com/rjroy/guild-hall/pull/121), [#120](https://github.com/rjroy/guild-hall/pull/120))
- **Email operation factory:** Structured factory pattern for mail operations with better error handling and testability ([#120](https://github.com/rjroy/guild-hall/pull/120))
- **Worker personality enhancements:** All worker packages enhanced with orientation questions and satisfaction indicators for more authentic identity and self-assessment. Illuminator, Steward workers gain missing work philosophy and characteristic phrases ([#123](https://github.com/rjroy/guild-hall/pull/123))
- **Model registry multi-capability support:** Models can declare multiple capabilities (e.g., FLUX 2 Pro for text-to-image and image-to-image). Registry consolidated duplicate entries. Introduced Nano Banana Pro model ([#122](https://github.com/rjroy/guild-hall/pull/122))
- **Commission halted state and continuation:** Commissions that hit `maxTurns` without submitting a result enter a `halted` state with worktree and session preserved. New `continue` action resumes the exact session, `save` merges partial work. Manager tools `continue_commission` and `save_commission`, crash recovery, halt count tracking ([#117](https://github.com/rjroy/guild-hall/pull/117))
- **Dashboard selection model:** Two-mode dashboard with "All Projects" default view and per-project selection. Filterable "In Flight" card, cross-project Recent Scrolls, all-projects briefing synthesis via LLM, configurable `briefingCacheTtlMinutes` ([#116](https://github.com/rjroy/guild-hall/pull/116))
- **Commission tree list and status tool:** `check_commission_status` in the manager toolbox lets the Guild Master check a single commission's detail by ID or get a sorted summary list of all commissions with status counts. Replaced SVG commission graph with CSS tree list ([#115](https://github.com/rjroy/guild-hall/pull/115))
- **Commission list filtering:** Multi-select status checkboxes grouped by sort group with counts and reset button, defaulting to actionable statuses ([#112](https://github.com/rjroy/guild-hall/pull/112))
- **Request Meeting from Artifact:** "Request Meeting" button in artifact sidebar with worker picker and artifact context ([#112](https://github.com/rjroy/guild-hall/pull/112))
- **Commit .lore from Web UI:** "Commit .lore" button on the Artifacts tab expands an inline form to commit pending `.lore/` changes with a user-authored message. New daemon endpoints `GET /workspace/git/lore/status` and `POST /workspace/git/lore/commit` ([#112](https://github.com/rjroy/guild-hall/pull/112))
- **Injectable daemon logger:** `Log` interface with `consoleLog`, `nullLog`, and `collectingLog` implementations wired through daemon DI. Migrated ~239 raw `console.*` calls across 23 daemon files ([#110](https://github.com/rjroy/guild-hall/pull/110))
- **Package skill handler system:** Worker and toolbox packages can declare `SkillDefinition` entries in `package.json`, discovered and registered by the daemon. CLI progressive discovery via `GET /help/skills` and `POST /package-skills/:skillId/invoke` ([#109](https://github.com/rjroy/guild-hall/pull/109))
- **Sandboxed execution environments:** Phase 1 and Phase 2 of sandboxed execution for worker sessions ([#105](https://github.com/rjroy/guild-hall/pull/105))
- **Local model support:** Config-driven local model definitions, model resolution chain, SDK env injection for Ollama endpoints, reachability checks, `/models` API endpoint, UI provenance indicators, and commission creation model selector ([#94](https://github.com/rjroy/guild-hall/pull/94))
- **Model selection and scheduled commissions:** Model selection for sessions, scheduled commission support, mail reader toolbox, and portrait resolution improvements ([#92](https://github.com/rjroy/guild-hall/pull/92))
- **Steward Worker MVP:** New Steward worker with status text visibility and infrastructure fixes ([#95](https://github.com/rjroy/guild-hall/pull/95))
- **Artifact copy path button:** Copies `.lore/`-relative path to clipboard from the artifact provenance bar ([#94](https://github.com/rjroy/guild-hall/pull/94))
- **Mail orchestrator integration tests:** Commission lifecycle (682 lines) and mail orchestrator (656 lines) integration test suites ([#91](https://github.com/rjroy/guild-hall/pull/91))
- **Celeste worker package:** Guild Visionary worker for vision and strategic direction ([#117](https://github.com/rjroy/guild-hall/pull/117))
- **Skill tool for workers:** Added `Skill` to `builtInTools` in all six worker packages ([#100](https://github.com/rjroy/guild-hall/pull/100))

### Changed

- **Upgraded Next.js to 16.2.0** ([#124](https://github.com/rjroy/guild-hall/pull/124))
- **Background briefing refresh:** Improved background briefing quality and refresh cycle. Renamed skills-to-operations service for clarity ([#119](https://github.com/rjroy/guild-hall/pull/119))
- **Daemon Application Boundary migration:** Reorganized daemon routes from flat CRUD to capability-oriented REST grammar, migrated web layer to daemon API calls via `fetchDaemon()`, refactored manager toolbox to invoke daemon routes, added skill registry and help endpoints ([#108](https://github.com/rjroy/guild-hall/pull/108))
- **Worker canUseToolRules declarations:** Workers declare tool access rules, enforced during session preparation ([#106](https://github.com/rjroy/guild-hall/pull/106), [#97](https://github.com/rjroy/guild-hall/pull/97))
- **Refactor artifact status handling:** Improved gem status mapping with correct CSS hue-rotate values and added `sleeping`/`abandoned` status support ([#103](https://github.com/rjroy/guild-hall/pull/103), [#94](https://github.com/rjroy/guild-hall/pull/94))
- **Briefing prompt tuning:** Tightened briefing prompts for conciseness, 1 sentence for quiet projects, 2-4 max for active ones ([#117](https://github.com/rjroy/guild-hall/pull/117))
- **Octavia allowed Bash commands:** Added `mkdir` and `mv` to Octavia's allowed commands ([#107](https://github.com/rjroy/guild-hall/pull/107))

### Fixed

- **Test isolation:** Prevent tests from modifying the actual repo. Git hook environment variables no longer override test directory discovery. Added `cleanGitEnv()` to all git command spawns in test files ([#126](https://github.com/rjroy/guild-hall/pull/126))
- **Meeting status not visible after accept:** Integration worktree artifact now updates to `status: open` on accept, so the web UI no longer shows meetings stuck in "requested" ([#114](https://github.com/rjroy/guild-hall/pull/114))
- **Commission filter and button readability:** Added backdrop blur and design system tokens to filter panel and action buttons ([#113](https://github.com/rjroy/guild-hall/pull/113))
- **Tool use input display:** Streaming tool input (`input_json_delta`) now accumulated via stateful `createStreamTranslator()` instead of always showing `{}` ([#116](https://github.com/rjroy/guild-hall/pull/116))
- **Meeting request artifact commit:** Artifacts written to integration worktree are now committed, fixing activity branches missing meeting request data ([#90](https://github.com/rjroy/guild-hall/pull/90))
- **Orphaned branch cleanup:** Empty branches from failed meeting/commission creation are cleaned up, branches with commits preserved ([#90](https://github.com/rjroy/guild-hall/pull/90))
- **Daemon lifecycle error logging:** All lifecycle generator and route catch blocks now log errors daemon-side ([#90](https://github.com/rjroy/guild-hall/pull/90))
- **Commission dependency resolution:** `checkDependencyTransitions` now resolves through `commissionArtifactPath()` instead of joining raw IDs, unblocking blocked commissions ([#94](https://github.com/rjroy/guild-hall/pull/94))
- **Meeting request page status:** Now reads from activity worktree when it exists, not just the integration branch ([#94](https://github.com/rjroy/guild-hall/pull/94))
- **Worker resolution by identity name:** Guild Master can now reference workers by display name (e.g. "Scribe"), not just package name ([#89](https://github.com/rjroy/guild-hall/pull/89))
- **Duplicate timeline entry on merge:** Removed redundant `status_completed` entry written by `syncStatusToIntegration` ([#88](https://github.com/rjroy/guild-hall/pull/88))
- **Briefing cache semantics:** Fixed from AND to OR logic, cache valid when either HEAD matches or TTL fresh ([#102](https://github.com/rjroy/guild-hall/pull/102))
- **Config reload and scheduler catch-up:** Fixed config reload, scheduler catch-up logic, and graph scrolling ([#96](https://github.com/rjroy/guild-hall/pull/96))
- **Worker plugins and identity enforcement:** Fixed worker plugin resolution, identity handling, tool enforcement, and UI cleanup ([#98](https://github.com/rjroy/guild-hall/pull/98))
- **Mobile keyboard premature send:** Return key no longer sends messages prematurely in meeting MessageInput ([#91](https://github.com/rjroy/guild-hall/pull/91))
- **Invalid headers in daemonFetch:** Removed invalid `headers` option from daemonFetch call ([#93](https://github.com/rjroy/guild-hall/pull/93))
- **Meeting portrait display:** Meeting page worker lookup now matches on display name instead of package name ([#112](https://github.com/rjroy/guild-hall/pull/112))

## [1.0.0] - 2026-03-08

_First release of Guild Hall, a multi-agent workspace for delegating work to AI specialists._

### Added

- **Daemon:** Hono-based daemon on Unix socket with DI factory pattern, EventBus pub/sub, and SSE streaming ([#28](https://github.com/rjroy/guild-hall/pull/28))
- **Meetings:** Interactive Claude Agent SDK sessions with lifecycle management, project scoping, and chat UI ([#29](https://github.com/rjroy/guild-hall/pull/29), [#69](https://github.com/rjroy/guild-hall/pull/69))
- **Commissions:** Async work delegation with 5-layer architecture, artifact tracking, timeline, and abandon support ([#30](https://github.com/rjroy/guild-hall/pull/30), [#59](https://github.com/rjroy/guild-hall/pull/59), [#74](https://github.com/rjroy/guild-hall/pull/74))
- **Git isolation:** Three-tier branch strategy (master/claude/activity) with sparse-checkout worktrees for AI work ([#31](https://github.com/rjroy/guild-hall/pull/31))
- **Guild Master:** Built-in manager worker with exclusive toolbox, coordination posture, and project-scoped meetings ([#32](https://github.com/rjroy/guild-hall/pull/32), [#65](https://github.com/rjroy/guild-hall/pull/65))
- **Worker mail:** Worker-to-worker communication via send_mail tool with sleep/wake cycle, reply tracking, and queue management ([#80](https://github.com/rjroy/guild-hall/pull/80))
- **Worker domain plugins:** Worker packages can ship Claude Code plugins, resolved during session preparation ([#83](https://github.com/rjroy/guild-hall/pull/83))
- **Briefing generator:** Project status briefings through full SDK session pipeline with commit-based caching and TTL ([#86](https://github.com/rjroy/guild-hall/pull/86))
- **Worker identity:** Personality traits, portraits, markdown-structured postures, and lore-development skill encouragement ([#73](https://github.com/rjroy/guild-hall/pull/73), [#76](https://github.com/rjroy/guild-hall/pull/76), [#78](https://github.com/rjroy/guild-hall/pull/78), [#79](https://github.com/rjroy/guild-hall/pull/79))
- **UI:** Fantasy-themed dashboard with CSS Modules, glassmorphic panels, image-based borders, and texture backgrounds ([#28](https://github.com/rjroy/guild-hall/pull/28))
- **Artifact views:** Collapsible tree view, artifact sorting, associated commissions linking, and deep-link to commission form ([#43](https://github.com/rjroy/guild-hall/pull/43), [#47](https://github.com/rjroy/guild-hall/pull/47), [#75](https://github.com/rjroy/guild-hall/pull/75), [#76](https://github.com/rjroy/guild-hall/pull/76))
- **Commission artifacts:** Result summary in body, full content display in artifact editor, commission-scoped artifact pages ([#67](https://github.com/rjroy/guild-hall/pull/67), [#69](https://github.com/rjroy/guild-hall/pull/69), [#70](https://github.com/rjroy/guild-hall/pull/70))
- **Memory compaction:** Async memory summarization for long-running sessions to prevent context window exhaustion ([#34](https://github.com/rjroy/guild-hall/pull/34))
- **CLI tools:** Project registration, config validation, rebase, sync, and content migration commands ([#34](https://github.com/rjroy/guild-hall/pull/34))

### Changed

- Migrate commission workers from subprocesses to in-process async sessions ([#50](https://github.com/rjroy/guild-hall/pull/50))
- Consolidate lifecycle management with ActivityMachine state machine ([#57](https://github.com/rjroy/guild-hall/pull/57))
- Unify SDK runner across meetings and commissions ([#61](https://github.com/rjroy/guild-hall/pull/61))
- Extract shared utilities and reorganize daemon service modules ([#55](https://github.com/rjroy/guild-hall/pull/55), [#64](https://github.com/rjroy/guild-hall/pull/64))
- Replace regex YAML parsing with gray-matter ([#40](https://github.com/rjroy/guild-hall/pull/40))
- Remove maxBudgetUsd from resourceDefaults and streamline cost handling ([#41](https://github.com/rjroy/guild-hall/pull/41))
- Enforce artifact state ownership between commissions and meetings ([#45](https://github.com/rjroy/guild-hall/pull/45))
- Restructure buildQueryOptions to use preset systemPrompt structure ([#37](https://github.com/rjroy/guild-hall/pull/37))
- Commission worker DI refactor with session resume for submit_result follow-up ([#42](https://github.com/rjroy/guild-hall/pull/42))

### Removed

- Remove heartbeat system from commission orchestrator ([#68](https://github.com/rjroy/guild-hall/pull/68))

### Fixed

- Responsive dashboard layout for viewports under 1200px ([#84](https://github.com/rjroy/guild-hall/pull/84))
- View button visibility on small screens ([#85](https://github.com/rjroy/guild-hall/pull/85))
- Mobile responsive overflow on dashboard ([#71](https://github.com/rjroy/guild-hall/pull/71))
- Extract client-safe modules to fix Turbopack build ([#77](https://github.com/rjroy/guild-hall/pull/77))
- Closed meeting links missing meetings/ prefix in artifact path ([#72](https://github.com/rjroy/guild-hall/pull/72))
- Infinite commission_progress event loop between toolbox and lifecycle ([#66](https://github.com/rjroy/guild-hall/pull/66))
- Multiline tool results truncated on meeting reopen ([#46](https://github.com/rjroy/guild-hall/pull/46))
- Sanitize worker name in commission ID to prevent git ref errors ([#51](https://github.com/rjroy/guild-hall/pull/51))

[1.1.0]: https://github.com/rjroy/guild-hall/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/rjroy/guild-hall/releases/tag/1.0.0
