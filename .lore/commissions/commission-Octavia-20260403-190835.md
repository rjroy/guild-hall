---
title: "Commission: Compendium Entry: Commission Chaining Patterns"
date: 2026-04-04
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a new compendium entry on commission chaining patterns.\n\n**Issue**: `.lore/issues/compendium-proposal-commission-chaining.md` — read this first. It defines the domain, evidence, and suggested scope.\n\n**Existing entry to extend from**: Read the existing commission-prompts compendium entry to understand the current compendium style and format. Check `.lore/compendium/` for the file.\n\n## What to cover\n\nThe issue lays out the full scope. The two critical patterns to nail:\n\n1. **Review-fix pairing.** Every review in a chain must be followed by a fix commission. Review without fix is observation without correction. The fix commission must explicitly reference the review's findings (the dependency system ensures ordering, not awareness).\n\n2. **Foundation-first validation.** When a foundation feeds parallel work, the chain must be: build → review → fix → fan-out. Skipping the review gate causes parallel workers to independently \"fix\" the same foundation files, creating merge conflicts. This was learned the hard way on the heartbeat dispatch chain.\n\nAlso cover: when to chain vs. single commission, linear vs. fan-out patterns, result propagation (artifact pointers vs. inline context), and known failure modes from project history.\n\n## Style guidance\n\nThis is craft knowledge, not policy. Write it like advice from someone who's run these chains and learned what breaks. Match the voice and structure of existing compendium entries.\n\n## Completion\n\nAfter writing the entry, update the issue status to `resolved` in its frontmatter."
dependencies: []
linked_artifacts: []

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
current_progress: ""
projectName: guild-hall
---
