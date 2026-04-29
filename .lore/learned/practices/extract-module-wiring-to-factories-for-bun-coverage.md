---
title: Bun function coverage counts every lambda — extract module wiring into factories
date: 2026-04-28
status: active
tags: [testing, coverage, bun, dependency-injection]
modules: []
---

Bun's function coverage counts every anonymous lambda and arrow function at the source location level. Module-level production wiring (e.g. `const nodeFs = { readdir: (...) => ... }`) inflates the function denominator even when the real logic is fully tested through mocks. A file can be 100% line-covered and still fail function thresholds because lambdas were created but never called. When a coverage plan targets function percentages, extract module-level wiring into named, exported factory functions so the metric reflects actual test quality.
