---
title: Spec vs plan gap analysis
date: 2026-02-23
status: draft
tags: [gap-analysis, quality, specs, plans]
modules: [guild-hall-core, guild-hall-ui]
related:
  - .lore/specs/guild-hall-system.md
  - .lore/specs/guild-hall-workers.md
  - .lore/specs/guild-hall-commissions.md
  - .lore/specs/guild-hall-meetings.md
  - .lore/specs/guild-hall-views.md
---

# Plan: Spec vs Plan Gap Analysis

## Goal

Find every requirement (REQ-ID) defined in the five specs that was never assigned to any implementation phase plan. Produce a gap list as a lore artifact so future planning can prioritize what was missed.

This is not implementation. The output is a document listing unplanned requirements with enough context to decide what to do about each one.

## Codebase Context

- Five specs in `.lore/specs/` define all requirements using `REQ-{PREFIX}-N` format
- Seven phase plans in `.lore/plans/phase-{1..7}-*.md` plus `implementation-phases.md` contain the work assignments
- REQ-VIEW-39 ("Create Commission from Artifact" button) is a known gap, confirmed during Phase 7 review
- Phase 7 ran a spec validation (task 013) but only checked Phase 7 requirements, not full coverage

## Implementation Steps

### Step 1: Cross-reference all REQ-IDs

**Specs**: `guild-hall-system.md`, `guild-hall-workers.md`, `guild-hall-commissions.md`, `guild-hall-meetings.md`, `guild-hall-views.md`
**Plans**: `phase-1-empty-hall.md` through `phase-7-hardening.md` plus `implementation-phases.md` (exclude `spec-gap-analysis.md`)
**Expertise**: none

A sub-agent reads all five specs and extracts every REQ-ID. Record a total count at the top of the output (e.g., "Extracted N requirements from 5 specs"). Then reads all phase plans and records which REQ-IDs appear (directly or by description). Produces a gap list: REQ-IDs that exist in specs but appear in no plan.

For each gap, include:
- REQ-ID and its full text from the spec
- Which spec it comes from
- Whether the requirement appears to be implemented despite not being planned. Search the source files in the current working directory: `daemon/` for backend logic, `app/` and `components/` for UI, `lib/` for shared logic, `cli/` for CLI tools.
- A one-line assessment: "unplanned and unbuilt", "unplanned but partially built", or "unplanned but appears implemented"

Save to `.lore/research/spec-plan-gap-analysis.md` with status `active`.

### Step 2: Validate against goal

Review the gap list for completeness. Confirm every REQ-ID in every spec was checked. This step is not optional.

## Delegation Guide

- Step 1: general-purpose agent with read access to `.lore/` and the codebase
- Step 2: plan-reviewer or manual review
