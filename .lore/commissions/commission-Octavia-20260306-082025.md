---
title: "Commission: Issue: Guild Master Should Create PRs During Active Meetings"
date: 2026-03-06
status: dispatched
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Create a new issue file at `.lore/issues/guild-master-pr-during-meeting.md` documenting the following bug/limitation:\n\n**Problem:** The Guild Master cannot create a PR while their own meeting is active. The `create_pr` tool rejects the request with \"active commissions or open meetings exist for this project.\" This blocks workflow because the user needs to close the meeting before creating a PR, even though the meeting itself has no conflicting state.\n\n**Why this is safe now:** Guild Master meetings are no longer project-scoped (they don't have `.lore/` meeting artifacts in the project directory anymore, due to the project-scope changes). The PR check was designed to prevent merging uncommitted meeting/commission work, but the Guild Master's meeting lives outside the project's `.lore/` directory and has no git-tracked files that would conflict with the integration branch.\n\n**Expected behavior:** The Guild Master should be able to create PRs during an active meeting. The check should either exclude Guild Master meetings, or more precisely, exclude meetings that have no artifacts on the integration branch.\n\n**Fix direction:** The guard in the PR creation path needs to be relaxed for meetings that don't produce project-scoped artifacts. The specific check location is in the manager toolbox or commission session logic that validates preconditions for `create_pr`.\n\nUse standard issue frontmatter format consistent with other files in `.lore/issues/`."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-06T16:20:25.053Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T16:20:25.054Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
