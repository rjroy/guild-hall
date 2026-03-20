---
title: Guild Capabilities Discovery
date: 2026-03-18
status: implemented
tags: [base-toolbox, worker-discovery, mail, collaboration]
modules: [base-toolbox, toolbox-resolver]
related:
  - .lore/specs/workers/worker-communication.md
  - .lore/specs/workers/guild-hall-workers.md
  - .lore/specs/workers/guild-hall-worker-roster.md
  - .lore/brainstorm/growth-surface-2026-03-17.md
req-prefix: DISC
---

# Spec: Guild Capabilities Discovery

## Overview

Workers can send mail to each other, but they have no way to know who to mail or why. A worker that needs research help has to already know that Verity exists and specializes in research. If a new worker joins the roster, no existing worker discovers this without the user mentioning it.

This spec adds a `list_guild_capabilities` read-only tool to the base toolbox. The tool returns the guild roster: who's available, what their title is, and what they do. Workers use this to make informed decisions about whether and whom to consult via `send_mail`.

## Entry Points

- Worker calls `list_guild_capabilities` during any session type (meeting, commission, mail)
- Worker encounters a problem outside its expertise and wants to check if someone else can help

## Requirements

### Tool Definition

- REQ-DISC-1: The base toolbox includes a `list_guild_capabilities` tool. It takes no parameters. It returns a formatted list of guild workers with their name, display title, and description.

- REQ-DISC-2: The tool's return format is a readable text block, not structured JSON. Workers consume this as context for deciding who to mail, not as data to parse. Each worker entry includes the identity name (the value used in `send_mail`'s `to` field), display title, and description. Example output:

  ```
  Guild Workers:

  Verity (Research Specialist) - Investigates topics across web sources, synthesizes findings into structured research artifacts.
  Dalton (Developer) - Implements features, fixes bugs, and writes tests. Works in the project codebase.
  Octavia (Guild Chronicler) - Documents what exists, writes specs and plans, maintains the project's living record.
  ```

- REQ-DISC-3: All discovered workers appear in the list, including the Guild Master and including the calling worker. No filtering by caller identity.

### Data Source

- REQ-DISC-4: The tool reads from worker package discovery data, the same source that populates `knownWorkerNames` in `GuildHallToolboxDeps`. However, the existing `knownWorkerNames` field is `string[]` (names only) and does not carry enough data. The DI callback for this tool supplies `WorkerIdentity[]` (name, displayTitle, description) extracted from `DiscoveredPackage[]` filtered to worker packages. No new discovery mechanism, just a richer projection of existing data.

- REQ-DISC-5: The only fields exposed per worker are identity name, display title, and description. Domain toolboxes, built-in tools, model configuration, checkout scope, canUseToolRules, and posture content are not included. If the description isn't enough to decide whether to mail someone, the description needs to be better, not the tool needs to show more.

### Wiring

- REQ-DISC-6: The tool receives worker data through the same DI callback pattern used by other base toolbox tools. The base toolbox does not import from `lib/packages.ts` or access the filesystem to discover packages.

- REQ-DISC-7: When the callback is not provided (e.g., in test contexts or future contexts that don't wire it), the tool returns a message indicating unavailability: "Guild capabilities discovery is not available in this context." This is an informational response, not an error. It must not return an empty list, which would falsely imply the guild has no workers.

## Success Criteria

- [ ] `list_guild_capabilities` is registered in the base toolbox MCP server
- [ ] Calling the tool returns all discovered workers with name, title, and description
- [ ] The tool works across all session types (meeting, commission, mail)
- [ ] No state changes occur when the tool is called
- [ ] Handler factory is exported and directly testable
- [ ] When the callback is not provided, the tool returns an informational message indicating unavailability (not an empty list, not an error)

## AI Validation

**Defaults** (apply unless overridden):
- Unit tests with mocked callback (no real package discovery)
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

## Constraints

- Read-only. The tool returns data and nothing else.
- The tool does not expose worker posture, soul, model, or toolbox configuration. These are internal to the worker and not useful for deciding whether to send mail.
- The tool does not include runtime state (active commissions, meetings). That's the `project_briefing` tool's job.

## Context

The mail system ([Spec: Worker Communication](worker-communication.md)) provides the communication channel. This spec provides the discovery layer that makes mail useful without the user having to introduce workers to each other in every prompt.

Origin: Proposal 6 in [Growth Surface brainstorm](.lore/brainstorm/growth-surface-2026-03-17.md). User response: "This is a missing feature. There is no incentive for one worker to mail another."
