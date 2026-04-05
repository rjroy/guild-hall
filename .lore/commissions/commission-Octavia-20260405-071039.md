---
title: "Commission: Spec: Tag View for Artifact Browser"
date: 2026-04-05
status: dispatched
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a small spec for the issue described in `.lore/issues/tag-view.md`.\n\nThe issue: The artifact browser has \"Smart View\" and \"Tree View\" modes. It needs a \"Tag View\" that shows all tags from lore file YAML frontmatter, ordered by matching file count (descending). Selecting a tag filters to files with that tag. Only tags with more than 1 matching file appear in the tag list.\n\nInvestigate the current artifact browser infrastructure to understand:\n- How Smart View and Tree View are implemented (components, state, data flow)\n- How artifacts are loaded and what tag data is available from frontmatter\n- The existing view-switching mechanism\n\nThen write a spec covering:\n- The tag list panel (extraction from frontmatter, count computation, ordering, filtering to >1 match)\n- Tag selection behavior (filtering artifacts, multi-select if it makes sense)\n- Integration with the existing view switcher\n- How it reuses existing artifact list/display components\n\nReference the existing Smart View spec at `.lore/specs/ui/artifact-smart-views.md` for patterns and conventions.\n\nPlace the spec at `.lore/specs/ui/artifact-tag-view.md`. Use standard spec format with YAML frontmatter. Keep the requirement count small since this is a focused feature that parallels existing view modes."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-05T14:10:39.557Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-05T14:10:39.559Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
