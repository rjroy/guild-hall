---
title: "Commission: Brainstorm: Guild Compendium as a plugin package with reference library"
date: 2026-03-24
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Brainstorm a refinement of Proposal 2 (Guild Compendium) from `.lore/brainstorm/guild-hall-future-vision.md`. The user has reviewed the proposal and has specific thoughts on how it should be shaped. Write the brainstorm to `.lore/brainstorm/guild-compendium-as-plugin.md`.\n\n## The user's thoughts\n\nThe user finds the compendium idea fascinating but wouldn't implement it as described in the original proposal. Their direction:\n\n1. **It should be a plugin package**, like `guild-hall-writer`. Not a special system directory at `~/.guild-hall/compendium/`. A package in `packages/` with its own `package.json`. Workers that use it declare it as a domain plugin, just like `guild-hall-writer` declares skills via `.claude-plugin/`.\n\n2. **Beyond just skills, it includes a `reference/` directory.** The plugin ships SKILL.md files (like existing plugins) but also a `reference/` folder containing the compendium entries. Agents review the compendium when they want to, pulling relevant reference material during their work.\n\n3. **Population question: research-driven, user-gated.** The compendium gets populated with research items answering craft questions: \"What makes a good spec?\", \"What makes a code review successful?\", \"What are good TypeScript practices?\" New entries are only added when the user identifies a gap. The user decides when something belongs in the compendium, not the system.\n\n4. **Is this just another package?** The user suspects this may just be a standard worker/toolbox package following existing patterns, not requiring new infrastructure. Explore whether that's true.\n\n## What to brainstorm\n\n- How does this map to the existing package/plugin architecture? What's the `package.json` look like? Which workers declare it as a domain plugin?\n- What does the `reference/` directory contain? How are entries structured?\n- How do agents access the compendium? Is it injected at session start (like memory), or do agents pull it on demand (like a skill)?\n- The population workflow: user identifies gap → what happens? A Verity research commission? A direct write? Who curates?\n- What skills does the plugin expose? Maybe a skill for reviewing relevant compendium entries? A skill for proposing additions?\n- How does this differ from the original proposal's `~/.guild-hall/compendium/` approach? What's gained or lost?\n- Does this need any new infrastructure, or does it slot into existing plugin mechanics?\n\n## Files to read for context\n- `.lore/brainstorm/guild-hall-future-vision.md` (Proposal 2 specifically, lines 73-139)\n- `packages/guild-hall-writer/` (example of a plugin package with skills)\n- `daemon/services/toolbox-resolver.ts` (how domain plugins get resolved)\n- Any existing `.claude-plugin/` directories for plugin structure reference\n\nWrite to `.lore/brainstorm/guild-compendium-as-plugin.md`."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T01:50:40.850Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T01:50:40.851Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
