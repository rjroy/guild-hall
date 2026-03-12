---
title: Recent Scrolls panel is empty and unhelpful on first load
date: 2026-03-10
status: requested
tags: [ux, ui, dashboard]
modules: [web/app/page, web/components/dashboard]
---

# Recent Scrolls Empty State

## What Happens

The "Recent Scrolls" panel on the dashboard shows "Select a project to view recent artifacts" until the user clicks a project's info icon. On every fresh page load, this panel is a dead zone.

## Why It Matters

A dashboard should give you something useful without requiring interaction. A panel that says "do something first" on every visit trains users to ignore it. If the panel requires a project selection to show content, it's not pulling its weight as a dashboard element.

## Fix Direction

Options:

1. **Default to most active project.** Auto-select the project with the most recent activity and show its artifacts. If there's only one project with recent work, that's the obvious default.
2. **Show across all projects.** Show the N most recently modified artifacts across all registered projects. This makes the panel immediately useful regardless of project selection.
3. **Hide when empty.** If no project is selected and there's no sensible default, don't render the panel. Show it only when the user explicitly selects a project.
