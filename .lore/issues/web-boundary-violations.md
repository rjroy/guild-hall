---
title: Two web API routes bypass the daemon and need replacement during DAB migration
date: 2026-03-14
status: invalid
tags: [architecture, daemon, api, boundary-violation]
modules: [web/app/api]
related:
  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/design/daemon-rest-api.md
---

## Problem

Two Next.js API routes write directly to the filesystem or application state, bypassing the daemon boundary:

1. `PUT /api/artifacts` — direct filesystem write
2. `POST /api/meetings/[meetingId]/quick-comment` — direct write bypassing daemon session management

These are intentional transitional adapters from before the daemon owned write operations. They work, but they violate the architectural principle that the daemon is the sole application boundary for writes.

## Why It Matters

The Daemon Application Boundary spec (REQ-DAB-3) requires all write operations to route through the daemon. These two routes are identified violations. As long as they exist, the boundary is incomplete.

## Fix Direction

During the DAB API migration, replace each route with a daemon-owned skill:
- `PUT /api/artifacts` → daemon route for artifact updates
- `POST /api/meetings/[meetingId]/quick-comment` → daemon route for quick comment submission

Each replacement must include the corresponding `canUseToolRules` entries for any worker that needs to invoke the new skill via CLI.

## Source

Identified during Octavia's DAB spec review (audience-Octavia-20260312-201037).
