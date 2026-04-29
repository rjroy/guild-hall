---
status: active
custom_directories:
  work/commissions: [pending, active, completed, abandoned, archived]
  work/meetings: [open, closed, deferred, archived]
  work/prototypes: [draft, active, archived]
  work/excavations: [current, outdated, archived]

filename_exemptions:
  - "^commission-.+-\\d{8}-\\d{6}\\.md$"
  - "^audience-.+-\\d{8}-\\d{6}.*\\.md$"
  - "^commission-cleanup-\\d{4}-\\d{2}-\\d{2}\\.md$"
  - "^meeting-cleanup-\\d{4}-\\d{2}-\\d{2}\\.md$"
  - "^\\d{4}-\\d{2}-\\d{2}-.+\\.md$"
  - "^heartbeat\\.md$"

custom_fields:
  work/commissions: [worker, workerDisplayTitle, prompt, dependencies, linked_artifacts]
  work/meetings: [worker, workerDisplayTitle, workerPortraitUrl, agenda, deferred_until, meeting_log]
---

# Project Lore Configuration

## Status conventions

This project uses the schema-default lifecycles for all schema directories (`work/specs`, `work/plans`, `work/brainstorm`, `work/design`, `work/retros`, `work/research`, `work/issues`, `work/notes`, `work/diagrams`, `work/tasks`). Earlier custom statuses (`complete` retros, `resolved` research, `parked` work, etc.) were normalized to schema values during a `/tend` pass on 2026-04-27.

The schema's status sets take precedence over config for those directories, so listing them in `custom_directories` has no effect.

## Custom directories

These directories are project-specific and not in the schema. Their status sets are listed above:

- **`work/commissions/`** — daemon-written commission artifacts. Status follows the commission runtime lifecycle.
- **`work/meetings/`** — daemon-written meeting artifacts. Status reflects whether the meeting is in flight or closed.
- **`work/prototypes/`** — UI/UX prototypes (HTML mockups and other assets).
- **`work/excavations/`** — codebase excavation indices.

## Archive directory

Not set. The project distinguishes `_archive/` (work that completed) from `_abandoned/` (work that was given up). Movement is a manual decision; default in-place archiving is correct.

## Filename exemptions

- Commission artifacts: `commission-<worker>-<YYYYMMDD>-<HHMMSS>.md`
- Meeting artifacts: `audience-<worker>-<YYYYMMDD>-<HHMMSS>*.md`
- Cleanup retros: `commission-cleanup-YYYY-MM-DD.md`, `meeting-cleanup-YYYY-MM-DD.md`
- Date-prefix snapshots: `YYYY-MM-DD-<slug>.md`
- `heartbeat.md` — runtime control file at the lore root

## Root-level lore files

The project keeps four files at `.lore/` root by deliberate design, not legacy drift:

- **`vision.md`** — required at root by REQ-VIS-1. The vision sits above specs in the project hierarchy; placing it at root reflects its scope. Code paths (briefing generator, visionary worker postures) hardcode this location. Do not move to `reference/`.
- **`heartbeat.md`** — daemon's runtime control file. Read every hour by the Guild Master.
- **`lore-agents.md`** — agent registry.
- **`lore-config.md`** — this file.

## Custom fields

Commissions and meetings carry runtime fields the daemon writes (`worker`, `prompt`, `agenda`, etc.). They are not stale metadata; do not strip them during retrofits.
