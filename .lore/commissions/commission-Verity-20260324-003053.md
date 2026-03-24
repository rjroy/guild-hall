---
title: "Commission: Research: Code review craft knowledge [recommission]"
date: 2026-03-24
status: dispatched
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research the domain of code review practices. This research will be distilled into a compendium reference entry for Guild Hall workers.\n\nFocus areas:\n- What to look for in reviews beyond \"does it work\" (design, naming, testability, error handling, security)\n- Severity calibration: how to distinguish critical findings from nits\n- How to present findings constructively (observation-based, not accusation-based)\n- Common anti-patterns in reviews (rubber-stamping, bikeshedding, gatekeeping)\n- Review checklists that actually improve quality vs. those that become checkbox exercises\n- How AI reviewers differ from human reviewers (what they catch well, what they miss)\n\nDraw on external best practices (Google's engineering practices, Microsoft's code review research, etc.), not just Guild Hall's local patterns. Include sources and citations where available.\n\nProduce a research document suitable for distillation into a 500-1000 word reference entry. Focus on actionable guidance. The audience is a worker about to conduct or respond to a code review.\n\nNOTE: A previous commission for this exact research completed. Check if `.lore/research/compendium-code-review.md` already exists. If it does and the content is solid, you're done. If it doesn't exist or is incomplete, produce it fresh.\n\nOutput to `.lore/research/compendium-code-review.md`."
dependencies:
  - commission-Octavia-20260324-003032
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T07:30:54.000Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T07:30:54.001Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-24T07:32:12.796Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-24T07:32:12.900Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
