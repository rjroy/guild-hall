---
title: "Commission: Research: Mureka API and music generation toolbox feasibility"
date: 2026-03-20
status: dispatched
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "## Research Task: Music Generation Toolbox\n\nThe user currently generates music prompts and manually copy-pastes them into Suno's app. We want to explore whether we can build a proper music generation toolbox (similar to how `guild-hall-replicate` handles image generation) that integrates directly into the worker pipeline.\n\n### Starting Point\n\nInvestigate the Mureka API at https://platform.mureka.ai/ — this is the primary lead. Research:\n\n1. **Mureka API capabilities**: What endpoints exist? What can it generate (full songs, instrumentals, lyrics, stems)? What parameters does it accept (genre, mood, tempo, lyrics, style references)? What are the output formats? What's the pricing model?\n\n2. **API maturity and reliability**: Is this a stable production API or early access? What are rate limits, latency expectations, output quality? Are there usage examples or SDK libraries?\n\n3. **Comparison with alternatives**: What other music generation APIs exist that offer programmatic access? Consider:\n   - Suno (do they have an API now, or still app-only?)\n   - Udio (API access?)\n   - Any other services with proper REST/API access for music generation\n   - How do they compare on quality, price, and API completeness?\n\n4. **Toolbox design sketch**: Based on what you find, what would a `guild-hall-music` toolbox look like? Think about:\n   - What operations would it expose? (generate song, generate lyrics, generate instrumental, etc.)\n   - What parameters would workers need to control?\n   - How does the workflow compare to the replicate toolbox pattern (prompt → generate → get result)?\n   - What worker would use this? Sienna (illuminator) handles visual assets — would music be a new domain worker or an extension?\n   - What's the iteration loop? (Music is harder to iterate on than images — you can't easily \"edit\" a song the way you can img2img)\n\n5. **The prompt pipeline question**: The current workflow is \"generate prompts, paste into Suno.\" If we had API access, what does the ideal workflow look like? Can we preserve the prompt engineering step (which the user may value) while eliminating the manual copy-paste?\n\n### Output\n\nWrite to `.lore/research/music-generation-toolbox.md`. Focus on concrete API capabilities and practical integration considerations. We need enough information to decide whether this is worth building and which service to build against."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-20T20:05:13.279Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T20:05:13.280Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
