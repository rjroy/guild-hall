---
title: "Commission: Research triage: typescript-plugin-systems"
date: 2026-03-14
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Triage the research document `.lore/research/typescript-plugin-systems.md` against the current state of the Guild Hall codebase and its specs.\n\nAnswer three questions:\n\n1. **Was this research used?** Look at the current implementation. Did concepts, patterns, or decisions from this research make it into the codebase? Cite specific files or patterns if so.\n\n2. **Is there still something to learn from it?** Does the research contain insights, patterns, or recommendations that haven't been applied yet but could be valuable going forward?\n\n3. **Is the research invalid given our current direction?** Compare the research's assumptions and recommendations against the specs in `.lore/specs/` and the current implementation. Did we deliberately go a different direction? A research item that's simply \"not yet implemented\" is different from one where we chose the opposite approach.\n\nBased on your answers, classify this research as exactly one of:\n- **FUTURE** — Not yet used, but still relevant and valuable for upcoming work.\n- **PRESENT** — Actively informing current implementation or decisions.\n- **PAST** — No longer of benefit. We either absorbed what we needed or went a different direction.\n\nWrite your classification and reasoning as a note on this commission. Be specific and cite evidence."
dependencies: []
linked_artifacts:
  - .lore/research/typescript-plugin-systems.md

activity_timeline:
  - timestamp: 2026-03-14T21:41:03.309Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T21:44:56.970Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-14T21:44:57.005Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-14T21:45:05.061Z
    event: progress_report
    reason: "Reading the research document and gathering context on current implementation."
  - timestamp: 2026-03-14T21:47:01.842Z
    event: progress_report
    reason: "Research document read, current implementation explored. Now comparing research recommendations against what was built and what specs say. Preparing findings."
  - timestamp: 2026-03-14T21:48:04.553Z
    event: result_submitted
    reason: "**Classification: PAST**\n\nThe research on TypeScript plugin systems (dated 2026-02-11) surveyed six plugin architectures and recommended a \"guild members as plugins\" model with UI contribution points, React component slots, and a `guild-member.json` manifest.\n\n**What was absorbed:** Directory-based package discovery (`lib/packages.ts`), Zod validation for package metadata, load-at-startup/activate-on-use lifecycle, manifest-driven metadata (via `package.json` + `guildHall` key).\n\n**What diverged:** The research's central thesis (guild members as UI-contributing plugins) was not adopted. The architecture instead separated workers (identity/posture), toolboxes (MCP tool factories), and domain plugins (Claude Code plugins with skills/commands/agents) into three distinct concerns. No package contributes UI components. \"Plugin\" in Guild Hall means Claude Code plugin (REQ-DPL in `.lore/specs/workers/worker-domain-plugins.md`), not a UI extension. The proposed `guild-member.json` manifest was replaced by `package.json` with a structured `guildHall` key that includes tool access control and resource defaults rather than UI contribution declarations.\n\n**Residual value:** The UI extensibility survey (contribution points, error boundaries per plugin, build step trade-offs) could theoretically inform future work, but no current spec or plan references these patterns. The research status should be updated from \"active\" to reflect that its useful content has been absorbed and its unimplemented recommendations don't align with the current architectural direction."
  - timestamp: 2026-03-14T21:48:08.879Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Research document read, current implementation explored. Now comparing research recommendations against what was built and what specs say. Preparing findings."
projectName: guild-hall
---
**Classification: PAST**

The research on TypeScript plugin systems (dated 2026-02-11) surveyed six plugin architectures and recommended a "guild members as plugins" model with UI contribution points, React component slots, and a `guild-member.json` manifest.

**What was absorbed:** Directory-based package discovery (`lib/packages.ts`), Zod validation for package metadata, load-at-startup/activate-on-use lifecycle, manifest-driven metadata (via `package.json` + `guildHall` key).

**What diverged:** The research's central thesis (guild members as UI-contributing plugins) was not adopted. The architecture instead separated workers (identity/posture), toolboxes (MCP tool factories), and domain plugins (Claude Code plugins with skills/commands/agents) into three distinct concerns. No package contributes UI components. "Plugin" in Guild Hall means Claude Code plugin (REQ-DPL in `.lore/specs/workers/worker-domain-plugins.md`), not a UI extension. The proposed `guild-member.json` manifest was replaced by `package.json` with a structured `guildHall` key that includes tool access control and resource defaults rather than UI contribution declarations.

**Residual value:** The UI extensibility survey (contribution points, error boundaries per plugin, build step trade-offs) could theoretically inform future work, but no current spec or plan references these patterns. The research status should be updated from "active" to reflect that its useful content has been absorbed and its unimplemented recommendations don't align with the current architectural direction.
