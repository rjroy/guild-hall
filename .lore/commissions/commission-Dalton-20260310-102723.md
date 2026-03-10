---
title: "Commission: Fix stale config after project registration"
date: 2026-03-10
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Bug: Daemon doesn't pick up new projects without restart\n\nWhen a project is registered via `bun run guild-hall register`, it appears in the Next.js UI (which reads config independently) but meetings and commissions fail because the daemon's in-memory config is stale.\n\n### Root cause\n\n`daemon/app.ts:113` reads `config.yaml` once at startup via `readConfig()` and passes the static `AppConfig` object by reference into every service (commission orchestrator, meeting session, scheduler, briefing generator, routes). When the CLI writes a new project to `config.yaml`, the daemon never re-reads it.\n\n### Fix\n\n1. **Add a `POST /admin/reload-config` route** to the daemon that:\n   - Calls `readConfig()` to get fresh config from disk\n   - Updates `config.projects` in place (splice the array contents) so all existing references see the new projects\n   - Runs integration worktree setup for any newly added projects (the same logic at `daemon/app.ts:118-138`)\n   - Runs sync for new projects (the logic at `daemon/app.ts:144-152`)\n   - Returns the updated project count\n\n2. **Have `cli/register.ts` call the reload endpoint** after writing config:\n   - After `writeConfig()` succeeds, attempt `fetch('http://unix:~/.guild-hall/guild-hall.sock/admin/reload-config', { method: 'POST' })`\n   - Graceful fallback if daemon isn't running (just log \"restart daemon to pick up changes\")\n   - Use `getGuildHallHome()` to find the socket path\n\n3. **Tests:**\n   - Route test: verify `POST /admin/reload-config` updates the config projects array in the app deps\n   - Integration: verify that after calling the reload endpoint, the meeting session can find the new project\n   - CLI test: verify register calls the reload endpoint (mock the fetch)\n\n### Key files\n- `daemon/app.ts` - startup config loading, worktree/sync loops\n- `daemon/routes/` - add new admin route file\n- `cli/register.ts` - add reload call after writeConfig\n- `lib/config.ts` - `readConfig()` function\n\n### Constraints\n- The `config` object is passed by reference everywhere. Mutate the existing object's `.projects` array in place (e.g., `config.projects.length = 0; config.projects.push(...fresh.projects)`) rather than replacing the object reference.\n- Only update `projects`. Other config fields (models, systemModels, maxConcurrent*) are used at startup for service construction and shouldn't change at runtime.\n- Keep the route behind `/admin/` prefix to signal it's operational, not user-facing."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-10T17:27:23.921Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T17:27:23.922Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
