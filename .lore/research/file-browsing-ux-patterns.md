---
title: "UX Patterns for Browsing Mid-Size Document Collections"
date: 2026-03-21
status: current
tags: [research, ux, navigation, artifacts, ui]
---

# UX Patterns for Browsing Mid-Size Document Collections

## Problem Statement

An artifact browser displays a collapsed tree view of 50-200 markdown files organized in 3-5 directory levels, each with YAML frontmatter (status, tags, dates). As the collection grows, neither a flat list nor a collapsed tree works well for finding what needs attention. This research surveys how real products solve this problem and identifies patterns applicable to our case.

## Our Constraints

- Files are markdown with YAML frontmatter (status, tags, date, modules, related)
- 50-200 items across 3-5 directory levels
- Status values map to actionability: draft/pending (needs work), approved/active (in progress), implemented/complete (done), abandoned/superseded (closed)
- Fantasy-themed UI using CSS Modules, not Tailwind
- Must work in a web UI (desktop primary, mobile secondary)
- File hierarchy carries meaning (specs/, plans/, retros/ are semantic groupings)

---

## Pattern 1: Multi-View Database (Notion)

**How it works.** A single collection of items can be rendered as a table, list, board (Kanban), gallery, calendar, or timeline. Each view shows the same data with different visual emphasis. Users create multiple saved views with pre-configured filters, sorts, and visible properties. Switching between views is a single click.

**Key mechanics:**
- **Property visibility per view.** A table view might show status, date, and tags as columns. A list view might hide everything except title. Same data, different density.
- **Filter + sort + group as view configuration.** Each saved view combines these three operations. "Draft specs" is a view filtered to `status=draft` + `type=spec`, sorted by date. "Recently modified" is sorted by last-edited, no filter.
- **Board view groups by a single property.** Status is the natural grouping: columns for draft, approved, implemented. Items move visually across columns as status changes.

**Tradeoffs:**
- Requires treating documents as database rows with structured properties, which our frontmatter already provides.
- Multiple views add UI complexity (view switcher, view configuration). Worth it when users regularly need different lenses on the same data. Overkill if one view suffices.
- Board view only works when the grouping property has a small set of values. Status (4-6 values) works. Tags (unbounded) does not.

**Applicability to our case:** High. Frontmatter fields map directly to Notion properties. A table view with status/date/tags columns plus a few saved filters ("drafts needing attention," "recently modified," "specs by status") would cover the primary discovery needs. The directory hierarchy becomes less important when you can filter across all directories at once.

**Source:** [Notion Help: When to use each type of database view](https://www.notion.com/help/guides/when-to-use-each-type-of-database-view), [Notion Help: Views, filters, sorts & groups](https://www.notion.com/help/views-filters-and-sorts)

---

## Pattern 2: Query-Driven Views (Obsidian Dataview)

**How it works.** Users write queries against file metadata to generate dynamic tables, lists, or task lists. The query language supports filtering by frontmatter fields, tags, folder paths, and inline metadata. Views are embedded in notes and update live.

**Key mechanics:**
- **SQL-like query syntax.** `TABLE status, date FROM "specs" WHERE status = "draft" SORT date DESC` generates a table of draft specs sorted by date.
- **Folder scoping.** Queries can target specific folders or the entire vault, bridging the gap between hierarchy and flat search.
- **Computed fields.** Queries can derive values (days since modification, tag counts) that don't exist in the original frontmatter.

**Tradeoffs:**
- Requires users to write queries, which is powerful but has a learning curve.
- In a web UI, the equivalent is pre-built views with configurable filters, not a raw query language.
- Dynamic views can be slow with large vaults (hundreds of files). At our scale (50-200), performance is not an issue.

**Applicability to our case:** The concept is directly applicable. Pre-built filter views that query frontmatter fields (status, tags, date, directory) give users the power of Dataview without requiring query syntax. The implementation is: scan all artifacts, index their frontmatter, expose filter controls.

**Source:** [Obsidian Dataview Documentation](https://blacksmithgu.github.io/obsidian-dataview/), [Dataview Beginner's Guide](https://obsidian.rocks/dataview-in-obsidian-a-beginners-guide/)

---

## Pattern 3: Saved Custom Views with Sidebar (Linear)

**How it works.** Users create filtered views of issues that persist in the sidebar. Each view has a name, filter criteria, grouping, and display options. Views act as virtual folders: "My open issues," "Blocked items," "Recently updated" are all views, not directories.

**Key mechanics:**
- **Filter bar at the top of every list.** Quick-access buttons for common filters (assignee, status, label, project). More complex filters available through an "Add filter" dropdown.
- **Grouping with collapsible headers.** List views can group by status, assignee, project, etc. Each group header shows a count and can be collapsed.
- **View sidebar.** Saved views appear in the left sidebar alongside the natural hierarchy (teams, projects). Users jump directly to filtered views without navigating the hierarchy first.

**Tradeoffs:**
- Saved views require a persistence layer (storing filter configurations). For a file-based system, this could be a config file or localStorage.
- Too many saved views recreate the navigation problem they solve. Linear addresses this with favorites and a search-within-sidebar.
- The pattern assumes items have structured metadata. Works perfectly when they do.

**Applicability to our case:** High. The "saved views as virtual folders" concept maps well. Pre-defined views like "Drafts needing work," "Recently modified," "All specs by status" would live alongside the directory tree in the sidebar, giving users two navigation paths: structural (directory tree) and intentional (filtered views).

**Source:** [Linear Docs: Custom Views](https://linear.app/docs/custom-views), [Linear Docs: Filters](https://linear.app/docs/filters)

---

## Pattern 4: Tree + Inline Filter (VS Code)

**How it works.** The file explorer tree has a built-in filter control (Ctrl+Alt+F) that narrows the visible tree to matching files. Two modes: highlight (shows all files, highlights matches, adds badge counts to folders) and filter (hides non-matching files entirely).

**Key mechanics:**
- **Type-to-filter within tree.** The filter narrows the existing tree structure, preserving hierarchy context. You see `specs/ > infrastructure/ > daemon.md` rather than a flat list of matches.
- **Badge counts on folders.** When filtering, folders show how many matches they contain. This lets you scan the tree for density without expanding everything.
- **Fuzzy matching.** Filter input supports fuzzy matching, tolerating typos and partial names.
- **Git status decorations.** Files show modified/untracked/conflicted status as colored indicators overlaid on the tree, providing metadata visibility without a separate view.

**Tradeoffs:**
- Filter is text-based only (file names). Cannot filter by metadata properties like status or tags without extension.
- Works well for "I know part of the name." Does not work for "show me all drafts."
- The tree structure is always the primary organizing principle. Filtering refines it but doesn't replace it.

**Applicability to our case:** The text filter within tree is a low-cost improvement that addresses "I know what I'm looking for." Adding status decorations (gem colors already exist) to the tree handles "what needs attention" for visible nodes. But it doesn't solve the deeper problem of metadata-driven discovery across the whole collection. Best used as a complement to other patterns, not a standalone solution.

**Source:** [VS Code User Interface Docs](https://code.visualstudio.com/docs/getstarted/userinterface), [VS Code Issue #98662: Search box in sidebar](https://github.com/microsoft/vscode/issues/98662)

---

## Pattern 5: Documentation Site Sidebar (Docusaurus, GitBook, Confluence)

**How it works.** A persistent sidebar shows the document hierarchy with 1-2 levels visible. Sections expand to reveal subsections. A search bar (often Algolia-powered) provides full-text and title search across all documents. Breadcrumbs show current location.

**Key design principles from documentation navigation research:**
- **Hierarchy as psychological anchor.** The sidebar provides orientation even when users don't click it. Seeing the complete structure reduces anxiety about missing content.
- **Progressive disclosure.** Show top-level categories first. Users drill into sections as needed. Avoid showing all 200 items at once.
- **Desire lines.** Surface the most-visited items prominently. Analytics-driven, but in our case, status-driven: drafts and recently modified items are the "desire lines."
- **Inline links over sidebar navigation.** Users follow embedded links within content more than sidebar navigation. Related documents should link to each other.

**Concrete implementations:**
- **Docusaurus:** Sidebar auto-generated from directory structure. Categories are collapsible. Each category can have a "generated index" page that lists all documents in that category with descriptions. Search via Algolia.
- **GitBook:** Sidebar + search. Pages organized in "spaces." Visual editor for reordering. No metadata filtering.
- **Confluence:** Hierarchical page tree in sidebar. "Spaces" as top-level containers. Robust search with filters (space, contributor, date range, label). Labels function as cross-cutting tags.

**Tradeoffs:**
- Sidebar trees work up to about 50-80 visible items. Beyond that, the sidebar itself needs navigation.
- Search-centric approaches (Confluence) work better for large collections but require good search infrastructure.
- None of these tools filter the sidebar by metadata. Filtering happens in search results, not in the structural navigation.

**Applicability to our case:** The auto-generated category index pages from Docusaurus are interesting. A directory landing page that lists all specs in `specs/infrastructure/` with their status, date, and description provides a browsing surface between the tree and individual documents. Confluence's label-based cross-cutting navigation maps to our tags.

**Source:** [Building Navigation for Documentation Sites](https://idratherbewriting.com/files/doc-navigation-wtd/design-principles-for-doc-navigation/), [Docusaurus Navigation and Sidebars](https://v1.docusaurus.io/docs/en/navigation)

---

## Pattern 6: Miller Columns (macOS Finder, Path Finder)

**How it works.** Multiple columns displayed side by side, each showing one level of the hierarchy. Selecting an item in column N populates column N+1 with its children. The entire path from root to current selection is always visible.

**Key mechanics:**
- **Horizontal space for vertical depth.** Each level gets its own column, so 3-5 levels deep requires 3-5 columns on screen simultaneously.
- **Selection context preserved.** You always see what you selected at every level. No "where am I?" problem.
- **Preview in rightmost column.** The last column can show a preview of the selected item rather than its children.

**Tradeoffs:**
- Consumes significant horizontal space. At 3-5 levels, you need 4-6 columns, which is tight on anything less than a wide desktop monitor.
- Poor on mobile. Columns don't work on small screens.
- Works best when items at each level are short labels (filenames). Breaks down when items need to show metadata (status, date, tags) at each level.
- Excellent for deep hierarchies with few items per level. Less efficient for wide directories (many items per level) where scrolling within a column is needed.

**Applicability to our case:** Low. Our hierarchy is 3-5 levels but the interesting metadata (status, tags) doesn't display well in narrow columns. The pattern optimizes for traversal speed in known hierarchies. Our problem is discovery in a partially-known collection with metadata-driven priorities.

**Source:** [Miller Columns - Wikipedia](https://en.wikipedia.org/wiki/Miller_columns)

---

## Pattern 7: Faceted Filtering (E-commerce, Enterprise Search)

**How it works.** Items are displayed in a flat or grouped list. A filter panel on the side shows available facets (categories derived from item properties). Selecting a facet value narrows the list. Multiple facets combine with AND logic. Each facet shows a count of matching items.

**Key mechanics:**
- **Facets derived from data.** The filter panel is auto-generated from the properties that exist in the collection. If 15 items have `status=draft`, the status facet shows "Draft (15)."
- **Counts update dynamically.** As you select one facet, counts on other facets update to reflect the narrowed set. This prevents zero-result dead ends.
- **Facets complement hierarchy.** Directory structure can be one facet among many. You can filter by directory AND status AND tag simultaneously.
- **Clear all / clear individual filters.** Users need to understand what's currently filtered and how to reset.

**Tradeoffs:**
- Requires indexing all items and their properties upfront. For 50-200 markdown files with frontmatter, this is trivial.
- UI complexity scales with the number of facets. 3-4 facets (status, directory, tags, date range) is manageable. 10+ facets overwhelms.
- Users need to understand the property vocabulary. "Status: draft" works when users know what statuses exist. Showing available values with counts solves this.

**Applicability to our case:** High. Our frontmatter fields are natural facets: status (draft/approved/implemented/...), directory (specs/plans/retros/...), tags, date range. A filter panel alongside the artifact list would let users narrow to "draft specs in infrastructure" or "anything modified this week" without navigating the tree.

**Source:** [Pencil & Paper: Filter UX Design Patterns](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-filtering), [UXtweak: Filter vs Facet](https://blog.uxtweak.com/filter-vs-facet/)

---

## Pattern 8: Search-First Navigation (Spotlight, Command Palettes)

**How it works.** A single search input is the primary navigation surface. Users type to find items by name, content, or metadata. Results appear immediately, ranked by relevance. The search replaces or supplements structural navigation.

**Key mechanics:**
- **Omnibar / command palette.** A single input that searches titles, content, tags, and metadata simultaneously. macOS Spotlight, VS Code's Cmd+P, Notion's Cmd+K, Linear's Cmd+K all follow this pattern.
- **Recent items in empty state.** When the search box is empty, show recently accessed items. This handles the "I was just looking at this" use case without any typing.
- **Keyboard-first interaction.** Power users navigate entirely by keyboard: open search, type a few characters, arrow-key to result, Enter to open.

**Tradeoffs:**
- Requires users to know (or guess) what they're looking for. Doesn't support exploratory browsing.
- Search quality depends on the corpus. For 200 markdown files with good titles and frontmatter, title-matching alone gets you far. Full-text search adds value for finding content you remember but can't name.
- Not a replacement for structural navigation. Users who are new to the collection need to browse before they can search effectively.

**Applicability to our case:** Medium as a primary pattern, high as a complementary one. A command-palette-style search (Cmd+K to find any artifact by name) is a cheap, high-value addition. But it doesn't solve the "what needs attention" discovery problem, which requires browsing filtered views rather than searching by name.

**Source:** [Medium: Search as Main Navigation](https://medium.com/user-experience-behavior-design/search-as-main-navigation-19daa98e5f6f), [NNGroup: Search Box vs Navigation](https://www.nngroup.com/videos/search-box-vs-navigation/)

---

## Pattern 9: Smart Views / Virtual Folders

**How it works.** The system generates views based on metadata criteria that look and feel like folders but are actually saved queries. macOS Finder smart folders, Gmail labels, Obsidian's Notebook Navigator plugin, and Linear's custom views all use this pattern.

**Key mechanics:**
- **Predefined smart views.** The system ships with useful defaults: "Recently modified," "Drafts," "Needs review." These appear alongside real folders in the navigation.
- **User-created smart views.** Users define filter criteria and save them as named views. "My specs in progress" = `directory contains specs AND status = active`.
- **Badge counts on smart views.** Each smart view shows how many items match, giving an at-a-glance health check. "Drafts (7)" tells you there are 7 incomplete items without clicking.

**Tradeoffs:**
- Smart views that duplicate the folder hierarchy add confusion. They work best when they cut across the hierarchy (all drafts regardless of directory).
- Requires a clear visual distinction between "real" folders (the directory tree) and "virtual" views (saved filters). Mixing them without distinction is disorienting.
- Badge counts need to update when files change. For a file-based system reading at page load, this is free. For real-time updates, it requires a watcher.

**Applicability to our case:** High. This is arguably the single highest-impact pattern for our "what needs attention" problem. Three predefined smart views would cover most discovery needs:
1. **"Needs Attention"** = status in (draft, pending, requested), sorted by date
2. **"Recently Modified"** = all items sorted by filesystem mtime, top 20
3. **"By Status"** = table/list grouped by status, showing counts per group

These views appear above the directory tree in the sidebar, giving users an action-oriented entry point before they resort to structural browsing.

**Source:** [Obsidian Notebook Navigator plugin](https://github.com/johansan/notebook-navigator), [Linear Docs: Custom Views](https://linear.app/docs/custom-views)

---

## Pattern 10: Table View with Sortable Columns

**How it works.** Items displayed in a table with one row per item and columns for each metadata property. Column headers are clickable to sort. Filters narrow rows. This is the default in spreadsheets, database GUIs, and Notion's table view.

**Key mechanics:**
- **Sort by click.** Click a column header to sort by that property. Click again to reverse. Immediately answers "what's the most recent?" or "what's still in draft?"
- **Density.** Tables show more items per screen than cards or tree views. At 50-200 items, a table with 20-30 visible rows and scrolling is manageable.
- **Column visibility.** Users choose which columns to show. Title + status + date is a useful default. Tags, directory, modules are available on demand.

**Tradeoffs:**
- Tables flatten hierarchy. The directory structure is just another column, not a visual grouping. This is a feature when hierarchy isn't your primary navigation axis, and a problem when it is.
- Tables are data-dense but visually monotonous. Scanning 200 rows for a specific item is tedious without search or filtering.
- Works poorly on mobile. Columns don't fit on small screens. Responsive tables require horizontal scroll or column collapsing, both of which are annoying.

**Applicability to our case:** Medium-high. A table view is the natural complement to the tree view. The tree says "browse by structure." The table says "browse by properties." Offering both (view toggle: tree | table) lets users choose based on their current intent. The table is particularly strong for the "what needs attention" use case when sorted by status or modification date.

**Source:** [Notion VIP: Compare Database Formats](https://www.notion.vip/insights/compare-and-configure-notion-s-database-formats-tables-lists-galleries-boards-and-timelines)

---

## Mobile Considerations

Tree views are problematic on mobile for specific, documented reasons:

1. **Touch target size.** Tree nodes with expand/collapse controls require precision that touch input doesn't provide. Expand/collapse chevrons need to be at least 44x44px, which is larger than typical tree node height.
2. **Indentation consumes horizontal space.** At 16-20px indent per level, 4 levels deep uses 64-80px of a 375px screen width. Content gets squeezed.
3. **Context loss on scroll.** On a long tree, the parent labels scroll out of view. Users lose their position in the hierarchy.
4. **No hover affordances.** Tree interactions often rely on hover states (highlight on hover, tooltip on hover). These don't exist on touch.

**Patterns that work better on mobile:**

| Pattern | How it adapts | Example |
|---------|---------------|---------|
| **Drill-down navigation** | Full-screen list at each level. Tap a folder to push a new screen showing its contents. Back button returns. | iOS Files app, most mobile file managers |
| **Bottom sheet with tabs** | Content categories as horizontal tabs at the top. Each tab shows a flat or shallow list. | Google Drive mobile |
| **Search-first with recents** | Search bar at top, recent items below. Browse is secondary. | Slack mobile, Notion mobile |
| **Accordion sections** | Top-level categories as expandable sections. Only one section open at a time. Conserves vertical space. | Many settings apps, FAQ pages |

**Applicability to our case:** If mobile support matters, the tree view should degrade to drill-down navigation (tap directory to see contents as a new full-width list) or an accordion with status-grouped sections. Smart views ("Drafts," "Recent") become even more valuable on mobile because they bypass hierarchy entirely.

**Source:** [Justinmind: 3 Modern Alternatives to Tree Navigation](https://www.justinmind.com/blog/3-modern-alternatives-to-tree-navigation/), [Smashing Magazine: Navigation Design for Mobile UX](https://www.smashingmagazine.com/2022/11/navigation-design-mobile-ux/)

---

## Synthesis: What Applies to Our Case

### The core tension

Our artifact browser serves two distinct intents:

1. **Structural browsing.** "I want to read the infrastructure specs." The directory tree handles this. Users navigate by type and domain.
2. **Status-driven discovery.** "What needs attention? What changed recently? What's still in draft?" The tree does not handle this. Status is buried in frontmatter, invisible until you open a file.

Every product surveyed that handles both intents does so by offering multiple navigation paths, not by making the tree smarter.

### Recommended patterns, ranked by impact-to-effort ratio

**1. Smart views above the tree (high impact, moderate effort).** Add 2-3 predefined filtered views above the directory tree: "Needs Attention" (drafts/pending), "Recently Modified" (by mtime), and optionally "By Status" (grouped list). Each shows a badge count. These are the "desire lines" from documentation navigation research. They answer the most common questions without touching the tree.

**2. Table view toggle (high impact, moderate effort).** Add a view toggle (tree | table) to the artifacts tab. The table view shows title, status (with gem color), directory, date, and last modified as sortable columns. Users switch to table when they want to sort/scan across the whole collection, and back to tree when they want structural browsing.

**3. Filter bar above the list (medium impact, low effort).** A row of quick-filter chips above the tree or table: status values (draft, approved, implemented, etc.) and optionally directory filters. Clicking a chip narrows the visible items. Multiple chips combine with AND. This is the lowest-effort form of faceted filtering and works in both tree and table views. In the tree, filtering hides non-matching branches and shows badge counts on folders with matches (VS Code pattern).

**4. Command palette search (medium impact, low effort).** Cmd+K to fuzzy-search artifact titles. Shows results ranked by recency, with status gem indicators. Handles the "I know what I'm looking for" case without any changes to the browse UI.

**5. Directory landing pages (low-medium impact, low effort).** When clicking a directory node in the tree, show a summary of its contents: count of items by status, list of items with metadata. This is the Docusaurus "generated index" pattern. Turns directory nodes from pure navigation containers into informational surfaces.

### Patterns to defer

- **Board/Kanban view.** Useful when items move through a workflow (draft -> approved -> implemented), but our artifacts don't move frequently enough to justify the UI investment. Table view with status grouping provides the same information more compactly.
- **Miller columns.** Optimized for deep traversal, not metadata-driven discovery. Poor fit for our metadata-rich items and 3-5 level depth.
- **Full faceted filtering panel.** Overkill for 3-4 metadata dimensions. Quick-filter chips achieve the same result with less UI chrome.
- **User-created custom views.** Adds persistence and configuration complexity. Start with predefined smart views and add customization only if the predefined ones prove insufficient.

### Hierarchy and filtering: do you need both?

Yes. They serve different intents and the products that try to replace one with the other frustrate users.

The hierarchy (directory tree) provides:
- Structural orientation ("where am I in the collection?")
- Type-based browsing ("show me all specs")
- Psychological grounding (users feel confident they've seen everything)

Filtering provides:
- Cross-cutting discovery ("all drafts regardless of directory")
- Recency awareness ("what changed this week?")
- Actionability focus ("what needs my attention?")

The pattern that works: hierarchy as the default view, with filtered views and search as complementary entry points. The tree doesn't go away. It gets supplemented.

### Mobile strategy

On mobile, degrade the tree to drill-down navigation (tap directory to see full-width list of contents). Smart views become the primary navigation since they bypass the hierarchy problem entirely. A search bar at the top handles the "I know what I want" case. Status-grouped accordion sections work as an alternative to the table view.
