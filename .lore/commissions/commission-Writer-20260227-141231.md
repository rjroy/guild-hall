---
title: "Commission: Plan: Responsive layout for dashboard and project pages"
date: 2026-02-27
status: pending
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
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-02-27T22:12:31.644Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-02-27T22:12:31.684Z
    event: manager_dispatched
    reason: "Guild Master dispatched commission \"Plan: Responsive layout for dashboard and project pages\""
current_progress: ""
result_summary: ""
projectName: guild-hall
---
