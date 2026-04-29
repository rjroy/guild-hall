---
title: A spy asserted "never called" must actually be reachable from the path under test
date: 2026-04-28
status: active
tags: [testing, test-theatre]
modules: []
---

Test theatre — a spy never reachable from the path under test — is the highest-value finding class for phase-gated review. If a test asserts a spy was never called, the spy must actually be reachable from the path under test. Otherwise the assertion succeeds for the wrong reason.
