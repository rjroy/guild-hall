---
title: "Commission: Research: File browsing UX for mid-size document collections"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research UX patterns for browsing and finding files in mid-size document collections (50-200 files, 3-5 levels deep, with metadata like status/tags/dates).\n\n**The problem:**\n\nWe have an artifact browser that shows a collapsed tree view of markdown files organized in directories. As the collection grows (multiple spec subdirectories, many specs per directory, each with frontmatter status like draft/approved/implemented), it's hard to find what needs attention. A flat list is unmanageable. A collapsed tree requires hunting through directories.\n\nThis feels like a solved problem. What do file managers, documentation sites, note-taking apps, and project management tools do?\n\n**What to explore:**\n\n- How do tools like Notion, Obsidian, Confluence, GitBook, Docusaurus handle document discovery at this scale?\n- File manager patterns: Miller columns, breadcrumb + flat list, faceted filtering, virtual folders / smart views\n- Search-first vs. browse-first paradigms\n- Filtering by metadata (status, tags, date) combined with hierarchy\n- \"Needs attention\" views (filter by status=draft, recently modified, etc.)\n- Table views vs. tree views vs. card views and when each works\n- How tagging/faceting interacts with folder hierarchy (do you need both?)\n- Mobile considerations (tree views are particularly painful on small screens)\n\n**Output:**\n\nWrite to `.lore/research/file-browsing-ux-patterns.md`. Focus on concrete patterns with examples from real products. Include tradeoffs and applicability to our case (markdown files with YAML frontmatter, 50-200 items, 3-5 directory levels, status/tags/date metadata)."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T16:17:47.078Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T16:17:47.079Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
