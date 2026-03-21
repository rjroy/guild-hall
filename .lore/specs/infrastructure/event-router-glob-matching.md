---
title: "Event Router: Glob Pattern Matching (Merged)"
date: 2026-03-21
status: merged
tags: [event-router, matching, micromatch, glob]
redirect: .lore/specs/infrastructure/event-router-field-matching.md
---

# Spec: Event Router Glob Pattern Matching

This spec has been merged into [Event Router: Field Matching](.lore/specs/infrastructure/event-router-field-matching.md).

The original Phase 2 glob matching requirements are now part of the unified field matching spec, which uses `micromatch.isMatch()` from the start rather than shipping exact match as a separate phase.
