---
title: Scheduled commissions missing tests for three coverage areas
status: open
tags: [testing, scheduled-commissions, coverage]
date: 2026-03-10
---

## Problem

Three areas of the scheduled commissions feature have no test coverage, creating regression risk. These were identified during Thorne's review (commission-Thorne-20260309-183403) and not picked up in subsequent commissions.

1. **Schedule-status route** (`GET /schedules/:id/status` or similar) — no tests for status query endpoint
2. **`previous_run_outcome` population** — no tests verifying the field is set correctly after a run completes
3. **`escalation_created` extra fields** — no tests verifying the extra fields written to the timeline event

## Impact

Any regression in these areas will pass the test suite undetected.

## Fix

Add test cases in the scheduled commissions test file for each area. These are unit-testable with injected deps.

## Source

Thorne's review (commission-Thorne-20260309-183403, findings F1-F3).
