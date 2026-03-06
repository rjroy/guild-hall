---
title: "Commission: Spec: Worker Identity and Personality in Packages"
date: 2026-03-06
status: completed
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for how worker packages should define personality and identity, informed by Verity's research at `.lore/research/soul-md-personality-techniques.md`.\n\n**Context:** Guild Hall workers currently have thin personality: a display title, a one-line description, and a one-line \"Vibe\" in their system prompt. Verity's research analyzed OpenClaw's SOUL.md approach and identified five transferable patterns (character preamble, anti-examples, vibe-as-metaphor, calibration pairs, personality/capability separation). The user wants a spec that changes what a worker package *is* so each worker has more distinct identity.\n\n**Your job:**\n1. Read Verity's research thoroughly (`.lore/research/soul-md-personality-techniques.md`)\n2. Read the existing worker spec (`.lore/specs/guild-hall-workers.md`) and worker roster spec (`.lore/specs/guild-hall-worker-roster.md`) to understand current structure\n3. Read a few actual worker packages in `packages/` to see how identity is defined today\n4. Write a spec at `.lore/specs/worker-identity-and-personality.md` that defines:\n   - What personality content a worker package should contain (structure, not specific content)\n   - Where personality lives in the package (new files? expanded fields in package.json? separate markdown?)\n   - How personality content gets injected into the system prompt at activation time\n   - What the boundary is between personality (who you are) and posture (how you work)\n   - Requirements with REQ IDs, following the pattern in existing specs\n\n**Design constraints:**\n- Don't over-engineer. The research recommends against the full six-file SOUL.md system for Guild Hall's use case. Find the right level of structure.\n- Personality should be part of the worker package (stable, versioned), not configurable per commission.\n- Worker identity doesn't change at runtime (REQ-WKR-4 from existing spec).\n- The fantasy guild aesthetic is a feature, not a limitation. Lean into it.\n- Consider that posture files already exist. The spec should clarify how personality content relates to (or restructures) what's already in posture.\n\nOutput the spec to `.lore/specs/worker-identity-and-personality.md` with status \"draft\"."
dependencies: []
linked_artifacts:
  - .lore/specs/worker-identity-and-personality.md

activity_timeline:
  - timestamp: 2026-03-06T21:00:59.001Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T21:00:59.002Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-06T21:00:59.036Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-06T21:01:08.358Z
    event: progress_report
    reason: "Starting context gathering: reading Verity's research, existing worker specs, and worker roster spec."
  - timestamp: 2026-03-06T21:03:35.929Z
    event: progress_report
    reason: "Context gathered. Read Verity's research (5 transferable patterns), existing worker/roster specs, all worker packages (3 files each: package.json, posture.md, index.ts), shared activation code, package discovery logic, and type definitions. Now drafting the spec."
  - timestamp: 2026-03-06T21:05:49.410Z
    event: result_submitted
    reason: "Wrote the Worker Identity and Personality spec at `.lore/specs/worker-identity-and-personality.md` (status: draft, REQ prefix: WID, 17 requirements).\n\nThe spec introduces a `soul.md` file to each worker package, creating a clean separation between personality (who you are) and posture (how you work). Key decisions:\n\n**Structure**: One new file (`soul.md`) with three required sections: Character (identity-framed prose, 5-15 lines), Voice (anti-examples + calibration pairs), and Vibe (metaphorical gestalt summary, 1-3 sentences). Rejected the full six-file SOUL.md system as over-engineered for Guild Hall.\n\n**Boundary**: Soul carries content that survives a role change (attitude, voice, values). Posture carries content tied to a specialization (workflow steps, quality standards). The Vibe line migrates from posture to soul.\n\n**Prompt assembly order**: Soul → identity metadata → posture → memory → activity context. Identity framing comes first so the model inhabits a character before receiving instructions.\n\n**Loading**: Discovery loads soul.md alongside posture.md using the same filesystem pattern. Soul is strongly recommended but not required for package validity (graceful degradation for third-party packages).\n\n**Stability**: Soul is package-level, versioned, immutable at runtime. No self-modification, no per-commission configuration. Reinforces REQ-WKR-4.\n\nExit points identified: roster package updates (writing actual soul content), type changes (ActivationContext, WorkerMetadata), discovery updates (lib/packages.ts), prompt assembly updates (shared/worker-activation.ts), manager worker update."
  - timestamp: 2026-03-06T21:05:55.981Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
  - timestamp: 2026-03-06T21:05:56.193Z
    event: status_completed
    reason: "Execution completed"
current_progress: "Context gathered. Read Verity's research (5 transferable patterns), existing worker/roster specs, all worker packages (3 files each: package.json, posture.md, index.ts), shared activation code, package discovery logic, and type definitions. Now drafting the spec."
projectName: guild-hall
---
Wrote the Worker Identity and Personality spec at `.lore/specs/worker-identity-and-personality.md` (status: draft, REQ prefix: WID, 17 requirements).

The spec introduces a `soul.md` file to each worker package, creating a clean separation between personality (who you are) and posture (how you work). Key decisions:

**Structure**: One new file (`soul.md`) with three required sections: Character (identity-framed prose, 5-15 lines), Voice (anti-examples + calibration pairs), and Vibe (metaphorical gestalt summary, 1-3 sentences). Rejected the full six-file SOUL.md system as over-engineered for Guild Hall.

**Boundary**: Soul carries content that survives a role change (attitude, voice, values). Posture carries content tied to a specialization (workflow steps, quality standards). The Vibe line migrates from posture to soul.

**Prompt assembly order**: Soul → identity metadata → posture → memory → activity context. Identity framing comes first so the model inhabits a character before receiving instructions.

**Loading**: Discovery loads soul.md alongside posture.md using the same filesystem pattern. Soul is strongly recommended but not required for package validity (graceful degradation for third-party packages).

**Stability**: Soul is package-level, versioned, immutable at runtime. No self-modification, no per-commission configuration. Reinforces REQ-WKR-4.

Exit points identified: roster package updates (writing actual soul content), type changes (ActivationContext, WorkerMetadata), discovery updates (lib/packages.ts), prompt assembly updates (shared/worker-activation.ts), manager worker update.
