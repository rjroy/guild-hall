---
title: "Commission: Compendium Entry: Commission Chaining Patterns"
date: 2026-04-04
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a new compendium entry on commission chaining patterns.\n\n**Issue**: `.lore/issues/compendium-proposal-commission-chaining.md` — read this first. It defines the domain, evidence, and suggested scope.\n\n**Existing entry to extend from**: Read the existing commission-prompts compendium entry to understand the current compendium style and format. Check `.lore/compendium/` for the file.\n\n## What to cover\n\nThe issue lays out the full scope. The two critical patterns to nail:\n\n1. **Review-fix pairing.** Every review in a chain must be followed by a fix commission. Review without fix is observation without correction. The fix commission must explicitly reference the review's findings (the dependency system ensures ordering, not awareness).\n\n2. **Foundation-first validation.** When a foundation feeds parallel work, the chain must be: build → review → fix → fan-out. Skipping the review gate causes parallel workers to independently \"fix\" the same foundation files, creating merge conflicts. This was learned the hard way on the heartbeat dispatch chain.\n\nAlso cover: when to chain vs. single commission, linear vs. fan-out patterns, result propagation (artifact pointers vs. inline context), and known failure modes from project history.\n\n## Style guidance\n\nThis is craft knowledge, not policy. Write it like advice from someone who's run these chains and learned what breaks. Match the voice and structure of existing compendium entries.\n\n## Completion\n\nAfter writing the entry, update the issue status to `resolved` in its frontmatter."
dependencies: []
linked_artifacts:
  - packages/guild-compendium/plugin/skills/consult-compendium/reference/commission-chaining.md

  - .lore/issues/compendium-proposal-commission-chaining.md
  - .lore/issues/compendium-proposal-commission-chaining.md
resource_overrides:
  model: opus

activity_timeline:
  - timestamp: 2026-04-04T02:08:35.982Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-04T02:08:35.984Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-04T02:08:36.038Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-04T02:09:10.148Z
    event: progress_report
    reason: "Read the issue and existing commission-prompts compendium entry. Understanding the format, voice, and structure. Now gathering project evidence from retros and commission history before drafting."
  - timestamp: 2026-04-04T02:09:44.266Z
    event: progress_report
    reason: "Gathered all evidence: issue scope, existing compendium format (commission-prompts, implementation), project chain examples (token-efficient git tools 4-phase, heartbeat 8-phase, P4 adapter 5-phase), and failure patterns from retros. Now drafting the commission-chaining compendium entry."
  - timestamp: 2026-04-04T02:11:18.352Z
    event: result_submitted
    reason: "Wrote the commission-chaining compendium entry at `packages/guild-compendium/plugin/skills/consult-compendium/reference/commission-chaining.md`.\n\nThe entry covers all scope items from the issue:\n\n- **When to chain vs. single commission** — decision criteria based on whether intermediate artifacts create genuine dependencies.\n- **Chain shapes** — linear, fan-out, and fan-in patterns with guidance on when each applies.\n- **Review-fix pairing** — why review without fix is observation without correction, and the three things a fix prompt needs from the review (findings inlined, severity context, scope boundaries).\n- **Foundation-first validation** — the gate rule: build, review, fix, then fan out. Grounded in the project's experience with parallel branches independently patching the same foundation.\n- **Result propagation** — the hybrid rule (inline constraints, point to artifacts for detail), what to propagate at each chain stage, and what not to propagate.\n- **Known failure modes** — result body truncation, review findings dropped from fix prompts, foundation drift during parallel work, context decay in long chains, single-concern violation.\n- **Sizing guidance** — 3-5 commissions as default, 6-12 for multi-phase features, question anything beyond 12.\n\nVoice and structure match existing compendium entries (commission-prompts, implementation). Craft knowledge tone, not policy.\n\nUpdated `.lore/issues/compendium-proposal-commission-chaining.md` status from `open` to `resolved`."
  - timestamp: 2026-04-04T02:11:21.509Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Gathered all evidence: issue scope, existing compendium format (commission-prompts, implementation), project chain examples (token-efficient git tools 4-phase, heartbeat 8-phase, P4 adapter 5-phase), and failure patterns from retros. Now drafting the commission-chaining compendium entry."
projectName: guild-hall
---
Wrote the commission-chaining compendium entry at `packages/guild-compendium/plugin/skills/consult-compendium/reference/commission-chaining.md`.

The entry covers all scope items from the issue:

- **When to chain vs. single commission** — decision criteria based on whether intermediate artifacts create genuine dependencies.
- **Chain shapes** — linear, fan-out, and fan-in patterns with guidance on when each applies.
- **Review-fix pairing** — why review without fix is observation without correction, and the three things a fix prompt needs from the review (findings inlined, severity context, scope boundaries).
- **Foundation-first validation** — the gate rule: build, review, fix, then fan out. Grounded in the project's experience with parallel branches independently patching the same foundation.
- **Result propagation** — the hybrid rule (inline constraints, point to artifacts for detail), what to propagate at each chain stage, and what not to propagate.
- **Known failure modes** — result body truncation, review findings dropped from fix prompts, foundation drift during parallel work, context decay in long chains, single-concern violation.
- **Sizing guidance** — 3-5 commissions as default, 6-12 for multi-phase features, question anything beyond 12.

Voice and structure match existing compendium entries (commission-prompts, implementation). Craft knowledge tone, not policy.

Updated `.lore/issues/compendium-proposal-commission-chaining.md` status from `open` to `resolved`.
