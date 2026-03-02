---
title: "Commission: Plan: Responsive layout for dashboard and project pages"
date: 2026-02-27
status: completed
tags: [commission]
worker: Writer
workerDisplayTitle: "Guild Writer"
prompt: "Write an implementation plan for adding responsive layout support to the dashboard and project pages. This goes in `.lore/plans/`.

Use your best judgement on any design questions. Research the codebase thoroughly before writing. Pay attention to the CSS design system in globals.css and how the fantasy chrome elements (image borders, glassmorphic panels, gem indicators) are structured, since those need to degrade gracefully.

## Context

The dashboard and project pages don't display well on tablet or phone-sized viewports. The fantasy chrome CSS (image-based borders, glassmorphic panels, fixed-width layouts) was designed for desktop. The layout needs to be reactive to screen size.

## Key Areas

1. Dashboard layout (cards, dependency map, pending audiences) needs to stack or reflow at narrower widths
2. Project page (artifact list, meeting list, commission list) needs single-column fallback
3. Fantasy chrome elements (image borders, gem indicators) need to degrade gracefully at small sizes rather than overflow or clip
4. Target breakpoints: ~768px (tablet portrait), ~480px (phone)

## Plan Structure

The plan should identify every CSS module and component that needs changes, what changes are needed, and the order of implementation. Group into logical steps. Include the test/verification strategy (this is primarily visual).

Reference the issue: `.lore/issues/responsive-layout.md`"
dependencies: []
linked_artifacts:
  - .lore/plans/responsive-layout.md

activity_timeline:
  - timestamp: 2026-02-27T22:12:31.644Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-02-27T22:12:31.681Z
    event: status_dispatched
    reason: "Commission dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-02-27T22:12:31.682Z
    event: status_in_progress
    reason: "Commission session started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-02-27T22:12:38.963Z
    event: progress_report
    reason: "Starting codebase research: reading globals.css, component CSS modules, and layout structure to understand the current design system and identify all files that need responsive changes."
  - timestamp: 2026-02-27T22:13:51.363Z
    event: progress_report
    reason: "Finished reading all 48 CSS modules. Now checking the artifact page-level CSS and remaining secondary pages before writing the plan."
  - timestamp: 2026-02-27T22:14:19.050Z
    event: progress_report
    reason: "Research complete. Read all 48 CSS modules, all page-level TSX files, and catalogued every border-image usage, every existing @media query, and the full dashboard grid layout. Now writing the implementation plan."
  - timestamp: 2026-02-27T22:16:44.415Z
    event: result_submitted
    reason: "Created `.lore/plans/responsive-layout.md`, a 12-step implementation plan for responsive layout support on dashboard and project pages.\n\nKey decisions:\n- Introduce CSS custom properties in globals.css for border chrome sizes, reducing at 768px and 480px breakpoints. All 10+ components using border-image reference these variables.\n- Dashboard grid collapses: 3-col to 2-col at tablet (drop right sidebar), to 1-col at phone (everything stacks).\n- WorkspaceSidebar becomes a horizontal row of project chips on phone.\n- ProjectTabs become horizontally scrollable on phone.\n- 18 CSS modules need changes. No TypeScript/TSX changes required. No new files.\n\nThe plan includes a file-by-file change inventory, a \"files not changed\" rationale, implementation ordering with dependency notes, a visual verification matrix (7 pages x 3 widths), and a risk assessment for border-image variable support."
  - timestamp: 2026-02-27T22:16:51.249Z
    event: status_completed
    reason: "Worker completed successfully"
    from: "in_progress"
    to: "completed"
  - timestamp: 2026-02-27T22:16:51.287Z
    event: status_completed
    reason: "Worker completed successfully"
current_progress: "Research complete. Read all 48 CSS modules, all page-level TSX files, and catalogued every border-image usage, every existing @media query, and the full dashboard grid layout. Now writing the implementation plan."
result_summary: "Created `.lore/plans/responsive-layout.md`, a 12-step implementation plan for responsive layout support on dashboard and project pages.\n\nKey decisions:\n- Introduce CSS custom properties in globals.css for border chrome sizes, reducing at 768px and 480px breakpoints. All 10+ components using border-image reference these variables.\n- Dashboard grid collapses: 3-col to 2-col at tablet (drop right sidebar), to 1-col at phone (everything stacks).\n- WorkspaceSidebar becomes a horizontal row of project chips on phone.\n- ProjectTabs become horizontally scrollable on phone.\n- 18 CSS modules need changes. No TypeScript/TSX changes required. No new files.\n\nThe plan includes a file-by-file change inventory, a \"files not changed\" rationale, implementation ordering with dependency notes, a visual verification matrix (7 pages x 3 widths), and a risk assessment for border-image variable support."
projectName: guild-hall
---
