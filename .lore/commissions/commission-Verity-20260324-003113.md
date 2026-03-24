---
title: "Commission: Research: Implementation craft knowledge [recommission]"
date: 2026-03-24
status: pending
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research the craft of implementation: working from a plan to produce code. This research will be distilled into a compendium reference entry for Guild Hall workers.\n\nFocus areas:\n- Working from a plan effectively: when to follow it literally vs. when to deviate\n- Signals that a plan is wrong (friction, impedance mismatch, missing assumptions) and how to respond\n- Testing alongside implementation: TDD vs. test-after, when each works, why \"add tests later\" fails\n- Incremental verification: how to structure work so each step is testable before moving to the next\n- Common implementation failures (scope creep, premature abstraction, skipping edge cases, fighting the framework)\n- How AI implementers differ from human ones (tendency to over-generate, loss of context in long sessions, when to checkpoint)\n\nDraw on external best practices (software craftsmanship literature, XP practices, industry post-mortems), not just Guild Hall's local patterns. Include sources and citations where available.\n\nProduce a research document suitable for distillation into a 500-1000 word reference entry. Focus on actionable guidance. The audience is a worker about to start implementing from an approved plan.\n\nNOTE: A previous commission for this exact research completed. Check if `.lore/research/compendium-implementation.md` already exists. If it does and the content is solid, you're done. If it doesn't exist or is incomplete, produce it fresh.\n\nOutput to `.lore/research/compendium-implementation.md`."
dependencies:
  - commission-Octavia-20260324-003032
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T07:31:13.773Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T07:31:13.775Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-24T07:32:12.796Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
current_progress: ""
projectName: guild-hall
---
