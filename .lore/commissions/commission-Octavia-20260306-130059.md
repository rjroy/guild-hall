---
title: "Commission: Spec: Worker Identity and Personality in Packages"
date: 2026-03-06
status: dispatched
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for how worker packages should define personality and identity, informed by Verity's research at `.lore/research/soul-md-personality-techniques.md`.\n\n**Context:** Guild Hall workers currently have thin personality: a display title, a one-line description, and a one-line \"Vibe\" in their system prompt. Verity's research analyzed OpenClaw's SOUL.md approach and identified five transferable patterns (character preamble, anti-examples, vibe-as-metaphor, calibration pairs, personality/capability separation). The user wants a spec that changes what a worker package *is* so each worker has more distinct identity.\n\n**Your job:**\n1. Read Verity's research thoroughly (`.lore/research/soul-md-personality-techniques.md`)\n2. Read the existing worker spec (`.lore/specs/guild-hall-workers.md`) and worker roster spec (`.lore/specs/guild-hall-worker-roster.md`) to understand current structure\n3. Read a few actual worker packages in `packages/` to see how identity is defined today\n4. Write a spec at `.lore/specs/worker-identity-and-personality.md` that defines:\n   - What personality content a worker package should contain (structure, not specific content)\n   - Where personality lives in the package (new files? expanded fields in package.json? separate markdown?)\n   - How personality content gets injected into the system prompt at activation time\n   - What the boundary is between personality (who you are) and posture (how you work)\n   - Requirements with REQ IDs, following the pattern in existing specs\n\n**Design constraints:**\n- Don't over-engineer. The research recommends against the full six-file SOUL.md system for Guild Hall's use case. Find the right level of structure.\n- Personality should be part of the worker package (stable, versioned), not configurable per commission.\n- Worker identity doesn't change at runtime (REQ-WKR-4 from existing spec).\n- The fantasy guild aesthetic is a feature, not a limitation. Lean into it.\n- Consider that posture files already exist. The spec should clarify how personality content relates to (or restructures) what's already in posture.\n\nOutput the spec to `.lore/specs/worker-identity-and-personality.md` with status \"draft\"."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-06T21:00:59.001Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T21:00:59.002Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
