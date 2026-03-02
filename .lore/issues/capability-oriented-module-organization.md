---
title: Organize modules by capability, not by consumer
date: 2026-02-28
status: open
tags: [architecture, refactor, separation-of-concerns, toolbox]
modules: [daemon-services, manager-toolbox, commission-session]
---

# Organize modules by capability, not by consumer

## What Happened

Capabilities are organized by who uses them (manager toolbox, route handlers, services) instead of by what they do. The same capability ends up split across locations, and adding a new one requires wiring it into multiple places. Example: creating a PR exists as a manager tool, but exposing it to the user through the UI means writing a second implementation path.

Things like `CommissionSessionForRoutes` blur the line between service and toolbox. They provide capabilities to both the guild master (via tools) and the user (via API routes), but they're structured as monolithic services rather than composable capability modules. `commission_session.ts` is over 2200 lines, which is a symptom of multiple capabilities in one file.

## Why It Matters

Adding a new capability to the system should be: write the capability, then decide which surfaces expose it (agent toolbox, daemon API, or both). Today, "give it to the AI" and "give it to the user" are separate integration paths. This friction grows with every new capability and makes it easy to lose sight of building an agentic-native application where agents and users have parity over the same operations.

## Fix Direction

Continue the refactoring trajectory already underway (unified `GuildHallToolboxDeps`, consolidated SDK calls, `web/` separation). The concrete next steps:

1. **Decompose oversized modules along capability boundaries.** `commission_session.ts` likely splits into commission controls (create, dispatch, cancel) and commission runtime (session execution, streaming). Each capability becomes its own module.

2. **Let directory structure reflect the decomposition.** Something like `daemon/capabilities/`, `daemon/toolboxes/`, `daemon/services/` where capabilities are the units of work, toolboxes are agent-facing wrappers, and services are runtime infrastructure.

3. **Commission controls as its own toolbox.** Instead of baking commission operations into the manager toolbox, make a `commission-controls` toolbox that the manager composes alongside others. The manager gets multiple toolboxes. No reason it should be just one.

4. **Surface decisions are wrappers, not implementations.** A capability module exports functions. A toolbox wraps those as agent tools. A route handler wraps those as API endpoints. The capability doesn't know or care which surface uses it.

This is not a rewrite. It's naming the pattern that recent refactoring is already moving toward, so future work follows the same direction intentionally.
