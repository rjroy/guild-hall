---
title: "Commission: Spec: Configurable system models"
date: 2026-03-10
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a specification for making hardcoded model selections configurable via config.yaml.\n\n## Problem\n\nSeveral daemon services hardcode model strings that should be user-configurable:\n\n1. **Memory compaction** (`daemon/services/memory-compaction.ts:291`): hardcoded `model: \"sonnet\"`\n2. **Meeting notes generator** (`daemon/services/meeting/notes-generator.ts:163`): hardcoded `model: \"sonnet\"`\n3. **Briefing generator** (`daemon/services/briefing-generator.ts:385`): hardcoded `model: \"sonnet\"` via `resourceOverrides`\n4. **Guild Master worker** (`daemon/services/manager/worker.ts:116`): hardcoded `model: \"opus\"`\n\nThese are system-level operations (not commission/meeting sessions where the worker's declared model applies). Users cannot change which model handles notes generation, memory compaction, or briefings without modifying source code.\n\n## Context\n\n- The existing `AppConfig` type in `lib/types.ts` already has `models?: ModelDefinition[]` for local model support and `settings?: Record<string, unknown>` as an untyped bag.\n- Worker packages declare their own `model` in `guild-hall.json` metadata. That's separate from this; this is about the *system-level* model choices.\n- The config.yaml currently has `projects` at the top level and no model defaults section.\n- The config schema is validated by Zod in `lib/config.ts`.\n\n## Scope guidance\n\n- This spec covers adding a typed `systemModels` (or similar) section to config.yaml with sensible defaults\n- Each hardcoded site should become configurable with a fallback to the current default\n- Consider whether the Guild Master's model should also be configurable here or remain a worker-level concern\n- Keep it simple: this is a config surface, not a model routing system\n- Use the `/lore-development:specify` skill to write the spec"
dependencies: []
linked_artifacts:
  - .lore/specs/infrastructure/system-model-defaults.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-10T07:53:53.371Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T07:53:53.372Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-10T07:53:53.407Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-10T07:54:00.817Z
    event: progress_report
    reason: "Starting work: reading source files to understand current hardcoded model usage before drafting spec."
  - timestamp: 2026-03-10T07:55:27.841Z
    event: progress_report
    reason: "Source reading complete. Invoking /lore-development:specify to write the spec."
  - timestamp: 2026-03-10T07:59:17.634Z
    event: progress_report
    reason: "Writing the spec. Key findings: memory compaction and notes generator have no config in their deps currently; briefing generator does; Guild Master model is hardcoded in createManagerPackage(). Will include guildMaster in systemModels."
  - timestamp: 2026-03-10T08:02:55.342Z
    event: result_submitted
    reason: "Wrote `.lore/specs/infrastructure/system-model-defaults.md` — a spec for making hardcoded model selections configurable via config.yaml.\n\n**What the spec defines:**\n- A new optional `systemModels` key in config.yaml with four fields: `memoryCompaction`, `meetingNotes`, `briefing`, and `guildMaster`\n- 10 requirements (REQ-SYS-MODEL-1 through REQ-SYS-MODEL-10) covering the type shape, Zod validation, per-service read behavior, and DI changes needed\n- All four hardcoded sites are covered with source line citations\n- Defaults preserved when config is absent; lazy validation at invocation time (not daemon startup)\n\n**Key design decisions made:**\n- `guildMaster` is included in `systemModels` (Guild Master is built-in source code with no package mechanism for users to configure it otherwise)\n- `BriefingGeneratorDeps` already carries `AppConfig` — no DI change needed there; `CompactionDeps` and `NotesGeneratorDeps` need optional `config?: AppConfig` added\n- Validation is lazy: unrecognized model names error at first invocation, not startup\n- Local model names (from `config.models`) are valid in all four fields; resolution happens at runtime via `resolveModel()`\n\n**After fresh-eyes review:** Four issues caught and fixed — REQ-SYS-MODEL-4 now explicitly states lazy validation, REQ-SYS-MODEL-7 notes that briefing already has config in deps, REQ-SYS-MODEL-9 states the actual wiring (not just the struct change), REQ-SYS-MODEL-10 wording clarified, and a local model test case added to AI Validation."
  - timestamp: 2026-03-10T08:02:59.718Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Writing the spec. Key findings: memory compaction and notes generator have no config in their deps currently; briefing generator does; Guild Master model is hardcoded in createManagerPackage(). Will include guildMaster in systemModels."
projectName: guild-hall
---
Wrote `.lore/specs/infrastructure/system-model-defaults.md` — a spec for making hardcoded model selections configurable via config.yaml.

**What the spec defines:**
- A new optional `systemModels` key in config.yaml with four fields: `memoryCompaction`, `meetingNotes`, `briefing`, and `guildMaster`
- 10 requirements (REQ-SYS-MODEL-1 through REQ-SYS-MODEL-10) covering the type shape, Zod validation, per-service read behavior, and DI changes needed
- All four hardcoded sites are covered with source line citations
- Defaults preserved when config is absent; lazy validation at invocation time (not daemon startup)

**Key design decisions made:**
- `guildMaster` is included in `systemModels` (Guild Master is built-in source code with no package mechanism for users to configure it otherwise)
- `BriefingGeneratorDeps` already carries `AppConfig` — no DI change needed there; `CompactionDeps` and `NotesGeneratorDeps` need optional `config?: AppConfig` added
- Validation is lazy: unrecognized model names error at first invocation, not startup
- Local model names (from `config.models`) are valid in all four fields; resolution happens at runtime via `resolveModel()`

**After fresh-eyes review:** Four issues caught and fixed — REQ-SYS-MODEL-4 now explicitly states lazy validation, REQ-SYS-MODEL-7 notes that briefing already has config in deps, REQ-SYS-MODEL-9 states the actual wiring (not just the struct change), REQ-SYS-MODEL-10 wording clarified, and a local model test case added to AI Validation.
