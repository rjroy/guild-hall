---
title: "Commission: Research: File browsing UX for mid-size document collections"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research UX patterns for browsing and finding files in mid-size document collections (50-200 files, 3-5 levels deep, with metadata like status/tags/dates).\n\n**The problem:**\n\nWe have an artifact browser that shows a collapsed tree view of markdown files organized in directories. As the collection grows (multiple spec subdirectories, many specs per directory, each with frontmatter status like draft/approved/implemented), it's hard to find what needs attention. A flat list is unmanageable. A collapsed tree requires hunting through directories.\n\nThis feels like a solved problem. What do file managers, documentation sites, note-taking apps, and project management tools do?\n\n**What to explore:**\n\n- How do tools like Notion, Obsidian, Confluence, GitBook, Docusaurus handle document discovery at this scale?\n- File manager patterns: Miller columns, breadcrumb + flat list, faceted filtering, virtual folders / smart views\n- Search-first vs. browse-first paradigms\n- Filtering by metadata (status, tags, date) combined with hierarchy\n- \"Needs attention\" views (filter by status=draft, recently modified, etc.)\n- Table views vs. tree views vs. card views and when each works\n- How tagging/faceting interacts with folder hierarchy (do you need both?)\n- Mobile considerations (tree views are particularly painful on small screens)\n\n**Output:**\n\nWrite to `.lore/research/file-browsing-ux-patterns.md`. Focus on concrete patterns with examples from real products. Include tradeoffs and applicability to our case (markdown files with YAML frontmatter, 50-200 items, 3-5 directory levels, status/tags/date metadata)."
dependencies: []
linked_artifacts:
  - .lore/research/file-browsing-ux-patterns.md

activity_timeline:
  - timestamp: 2026-03-21T16:17:47.078Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T16:17:47.079Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T16:17:47.171Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T16:17:56.335Z
    event: progress_report
    reason: "Starting research on file browsing UX patterns. Checking existing research and current artifact browser implementation first."
  - timestamp: 2026-03-21T16:18:15.702Z
    event: progress_report
    reason: "Reviewed current artifact browser specs. Now researching UX patterns from real products: documentation sites, note-taking apps, file managers, and project management tools."
  - timestamp: 2026-03-21T16:19:47.952Z
    event: progress_report
    reason: "Research gathering complete. Covered: Notion database views, Obsidian Dataview, Linear custom views, VS Code file explorer, documentation site patterns, mobile alternatives to tree views, search-first vs browse-first paradigms, Miller columns, faceted filtering. Now synthesizing into the research document."
  - timestamp: 2026-03-21T16:22:41.349Z
    event: result_submitted
    reason: "Research document written to `.lore/research/file-browsing-ux-patterns.md`.\n\nSurveyed 10 patterns from real products (Notion, Obsidian Dataview, Linear, VS Code, Docusaurus/GitBook/Confluence, Miller columns, faceted filtering, command palettes, smart views, table views) plus mobile-specific alternatives.\n\nKey finding: the artifact browser serves two distinct intents (structural browsing and status-driven discovery) that require different navigation paths. Every product that handles both offers multiple views, not a smarter tree.\n\nFour patterns ranked by impact-to-effort: (1) smart views above the tree with badge counts, (2) table view toggle alongside tree, (3) quick-filter chips for status/directory, (4) command palette search. Each has tradeoffs and applicability analysis specific to our markdown-with-frontmatter case."
  - timestamp: 2026-03-21T16:22:46.876Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Research gathering complete. Covered: Notion database views, Obsidian Dataview, Linear custom views, VS Code file explorer, documentation site patterns, mobile alternatives to tree views, search-first vs browse-first paradigms, Miller columns, faceted filtering. Now synthesizing into the research document."
projectName: guild-hall
---
Research document written to `.lore/research/file-browsing-ux-patterns.md`.

Surveyed 10 patterns from real products (Notion, Obsidian Dataview, Linear, VS Code, Docusaurus/GitBook/Confluence, Miller columns, faceted filtering, command palettes, smart views, table views) plus mobile-specific alternatives.

Key finding: the artifact browser serves two distinct intents (structural browsing and status-driven discovery) that require different navigation paths. Every product that handles both offers multiple views, not a smarter tree.

Four patterns ranked by impact-to-effort: (1) smart views above the tree with badge counts, (2) table view toggle alongside tree, (3) quick-filter chips for status/directory, (4) command palette search. Each has tradeoffs and applicability analysis specific to our markdown-with-frontmatter case.
