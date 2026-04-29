---
title: Grep for old terminology after infrastructure refactors
date: 2026-04-28
status: active
tags: [refactor, cleanup]
modules: []
---

Type-checking and linting won't catch stale references in tool descriptions, log messages, comments, or JSDoc. When a refactor removes infrastructure, grep for the old terminology across all files as a standard cleanup step. Examples from the in-process commission migration: `SIGTERM`, `heartbeat`, `spawn`, `PID`.
