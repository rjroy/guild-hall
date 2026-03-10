---
title: "Commission: Research Claude Agent SDK sandbox capabilities"
date: 2026-03-10
status: dispatched
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research how the Claude Agent SDK supports sandboxed execution environments. Specifically investigate:\n\n1. **What sandbox options exist** in the Agent SDK (Docker containers, firecracker VMs, cloud sandboxes, etc.)\n2. **How sandboxes are configured** when creating agent sessions - API surface, configuration objects, relevant parameters\n3. **What tools are available inside sandboxes** vs outside (file access, network, shell execution)\n4. **Use cases and patterns** - when and why you'd use sandboxed execution\n5. **Limitations and constraints** - what can't you do in a sandbox, performance implications, platform requirements\n\nFocus on the official SDK documentation and any recent announcements. Check Context7 for up-to-date docs. The project already uses the Claude Agent SDK for meeting and commission sessions (see CLAUDE.md), so note anything relevant to integrating sandboxes into an existing SDK-based system."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-10T19:46:05.329Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T19:46:05.330Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
