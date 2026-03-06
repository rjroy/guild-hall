---
title: "Commission: Spec: Worker Identity and Personality in Packages"
date: 2026-03-06
status: dispatched
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a specification for how worker identity and personality are defined in worker packages.\n\n**Approach:** Excavate the codebase first. Don't assume what worker identity means — read the code and find out.\n\n1. **Excavate the current state.** Read the code that loads, resolves, and uses worker packages. Understand:\n   - How worker packages are structured (directory layout, manifest files, config)\n   - What identity fields exist today (name, display name, portrait, description, posture, etc.)\n   - How identity information flows from package definition to daemon session to UI display\n   - Where personality/posture is injected into agent sessions (system prompts, CLAUDE.md, instructions)\n   - What the Guild Master's built-in identity looks like vs. package-defined workers\n   - How the roster spec and worker packages relate\n\n2. **Identify gaps and opportunities.** Based on what exists:\n   - What identity fields are missing or underspecified?\n   - Is personality (tone, voice, behavioral guidelines) well-separated from capability (tools, permissions)?\n   - Can workers customize their appearance (portrait, colors, titles) cleanly?\n   - How does identity interact with the fantasy guild aesthetic?\n\n3. **Write a spec** covering:\n   - Required and optional identity fields for worker packages\n   - How personality/posture is defined and injected\n   - How identity data flows from package to UI\n   - Validation requirements (what happens with missing/malformed identity)\n   - Requirements with REQ IDs following existing project conventions\n\nGround everything in what the code says. Reference file paths and line numbers. Check `.lore/specs/` for any existing worker or roster specs that this should align with."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-06T21:53:02.056Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T21:53:02.057Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
