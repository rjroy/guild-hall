---
title: "Commission: Research: Mureka API and music generation toolbox feasibility"
date: 2026-03-20
status: completed
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "## Research Task: Music Generation Toolbox\n\nThe user currently generates music prompts and manually copy-pastes them into Suno's app. We want to explore whether we can build a proper music generation toolbox (similar to how `guild-hall-replicate` handles image generation) that integrates directly into the worker pipeline.\n\n### Starting Point\n\nInvestigate the Mureka API at https://platform.mureka.ai/ — this is the primary lead. Research:\n\n1. **Mureka API capabilities**: What endpoints exist? What can it generate (full songs, instrumentals, lyrics, stems)? What parameters does it accept (genre, mood, tempo, lyrics, style references)? What are the output formats? What's the pricing model?\n\n2. **API maturity and reliability**: Is this a stable production API or early access? What are rate limits, latency expectations, output quality? Are there usage examples or SDK libraries?\n\n3. **Comparison with alternatives**: What other music generation APIs exist that offer programmatic access? Consider:\n   - Suno (do they have an API now, or still app-only?)\n   - Udio (API access?)\n   - Any other services with proper REST/API access for music generation\n   - How do they compare on quality, price, and API completeness?\n\n4. **Toolbox design sketch**: Based on what you find, what would a `guild-hall-music` toolbox look like? Think about:\n   - What operations would it expose? (generate song, generate lyrics, generate instrumental, etc.)\n   - What parameters would workers need to control?\n   - How does the workflow compare to the replicate toolbox pattern (prompt → generate → get result)?\n   - What worker would use this? Sienna (illuminator) handles visual assets — would music be a new domain worker or an extension?\n   - What's the iteration loop? (Music is harder to iterate on than images — you can't easily \"edit\" a song the way you can img2img)\n\n5. **The prompt pipeline question**: The current workflow is \"generate prompts, paste into Suno.\" If we had API access, what does the ideal workflow look like? Can we preserve the prompt engineering step (which the user may value) while eliminating the manual copy-paste?\n\n### Output\n\nWrite to `.lore/research/music-generation-toolbox.md`. Focus on concrete API capabilities and practical integration considerations. We need enough information to decide whether this is worth building and which service to build against."
dependencies: []
linked_artifacts:
  - .lore/research/music-generation-toolbox.md

activity_timeline:
  - timestamp: 2026-03-20T20:05:13.279Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T20:05:13.280Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-20T20:05:13.365Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-20T20:05:25.724Z
    event: progress_report
    reason: "Starting research on music generation APIs. Investigating Mureka API, Suno, Udio, and alternatives for programmatic music generation."
  - timestamp: 2026-03-20T20:07:07.906Z
    event: progress_report
    reason: "Research gathered on Mureka, Suno, Udio, Soundverse, MusicAPI, and other services. Also reviewed the replicate toolbox pattern. Writing the research document now."
  - timestamp: 2026-03-20T20:10:19.589Z
    event: result_submitted
    reason: "Completed research on music generation APIs. Document written to `.lore/research/music-generation-toolbox.md`.\n\nKey findings:\n\n**Mureka is the strongest candidate.** First-party REST API with comprehensive endpoints (song generation, instrumentals, lyrics, stem separation, voice cloning, song extension). Official MCP server exists. ~45 second generation, two variants per call, tracks up to 240 seconds. Models range from V7.5 to O2 (latest).\n\n**Suno has better quality but no official API.** Third-party wrappers exist but carry significant stability and legal risk. Suno V5 is the quality leader in the space.\n\n**Udio has an API but downloads are disabled** since October 2025. Hard blocker.\n\n**Soundverse has a proper API** but pricing starts at $99/month, targeting enterprise.\n\n**Critical open question:** Mureka's API tier costs $1,000/month. The web platform is $10-30/month. Whether the web platform API key provides the same programmatic access as the API tier key is the key cost question to resolve before building.\n\n**Toolbox design:** Follow the `guild-hall-replicate` pattern. 8 proposed tools (generate_song, generate_instrumental, generate_lyrics, separate_stems, extend_song, download_song, check_task, list_styles). Could integrate with the existing `music-engine-rowan` plugin at the suno-formatter stage, replacing manual paste with API calls.\n\n**Next step:** Test whether a Mureka web platform API key works with the `mureka-mcp` server."
  - timestamp: 2026-03-20T20:10:22.352Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Research gathered on Mureka, Suno, Udio, Soundverse, MusicAPI, and other services. Also reviewed the replicate toolbox pattern. Writing the research document now."
projectName: guild-hall
---
Completed research on music generation APIs. Document written to `.lore/research/music-generation-toolbox.md`.

Key findings:

**Mureka is the strongest candidate.** First-party REST API with comprehensive endpoints (song generation, instrumentals, lyrics, stem separation, voice cloning, song extension). Official MCP server exists. ~45 second generation, two variants per call, tracks up to 240 seconds. Models range from V7.5 to O2 (latest).

**Suno has better quality but no official API.** Third-party wrappers exist but carry significant stability and legal risk. Suno V5 is the quality leader in the space.

**Udio has an API but downloads are disabled** since October 2025. Hard blocker.

**Soundverse has a proper API** but pricing starts at $99/month, targeting enterprise.

**Critical open question:** Mureka's API tier costs $1,000/month. The web platform is $10-30/month. Whether the web platform API key provides the same programmatic access as the API tier key is the key cost question to resolve before building.

**Toolbox design:** Follow the `guild-hall-replicate` pattern. 8 proposed tools (generate_song, generate_instrumental, generate_lyrics, separate_stems, extend_song, download_song, check_task, list_styles). Could integrate with the existing `music-engine-rowan` plugin at the suno-formatter stage, replacing manual paste with API calls.

**Next step:** Test whether a Mureka web platform API key works with the `mureka-mcp` server.
