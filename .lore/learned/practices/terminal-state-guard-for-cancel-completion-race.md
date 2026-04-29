---
title: Fire-and-forget async needs a terminal state guard
date: 2026-04-28
status: active
tags: [async, race-condition, error-handling]
modules: []
---

Any function that starts an unowned async task and also exposes a cancel method needs a terminal state guard, so whichever path completes second is a no-op rather than a double cleanup. The AbortError path should log-and-return when the work has already reached a terminal state.
