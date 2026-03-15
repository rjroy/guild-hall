# Changelog

## [Unreleased]

### Added

- **Commit .lore from Web UI:** "Commit .lore" button on the Artifacts tab expands an inline form to commit pending `.lore/` changes with a user-authored message. New daemon endpoints `GET /workspace/git/lore/status` and `POST /workspace/git/lore/commit` enforce a staging boundary that only commits `.lore/` files.

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

[1.0.0]: https://github.com/rjroy/guild-hall/releases/tag/1.0.0
