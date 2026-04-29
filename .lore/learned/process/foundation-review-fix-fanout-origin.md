---
title: Origin of foundation-then-review-then-fix-then-fan-out
date: 2026-04-28
status: active
tags: [process, dispatch-pattern]
modules: []
---

The pattern came from a specific failure during heartbeat dispatch: parallel phases independently rediscovered and tried to repair the same foundation problems, producing conflicting edits. The compendium captures the pattern but not this diagnostic origin. Use it before fan-out whenever the work depends on a shared foundation that may itself be broken.
