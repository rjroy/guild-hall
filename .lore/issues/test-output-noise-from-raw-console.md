---
title: Test output noise from raw console.* calls in daemon code
date: 2026-03-13
status: open
tags: [testing, logging, developer-experience, debt]
modules: [daemon, tests]
---

# Test Output Noise from Raw console.* Calls in Daemon Code

## What Happened

The daemon uses raw `console.error`, `console.warn`, and `console.log` throughout (227 calls across 20+ files). During test runs, negative tests deliberately trigger error paths, which fire these console calls. The output looks like real failures but is just the production code's error handling doing its job.

This creates two problems:

1. Real test failures are buried in noise. Two tests currently fail in the full suite (pass in isolation), and finding the actual failure output requires scrolling past pages of expected error-path logging.
2. Developers (and agents) misread the output. Seeing stack traces and `error:` lines mid-run creates false urgency, or worse, causes real failures to be dismissed as "more negative test noise."

## Why It Matters

Test output is a diagnostic tool. When the signal-to-noise ratio is bad, failures get missed or misattributed. The current output trains people to ignore errors, which is the opposite of what a test suite should do.

Bun has no `--silent` flag and no built-in console interception. The framework won't fix this for us.

## Fix Direction

**Primary fix: injectable logger.** Create a `Log` interface with `consoleLog` (production) and `nullLog` (test) implementations. Thread it through services via DI, which is already how the daemon handles every other cross-cutting concern. The pattern already exists in `sdk-logging.ts` (takes a `log` callback parameter). Extend it to the remaining 20+ files.

**Quick fix (optional, immediate): preload script.** Add a `bunfig.toml` with `[test] preload = ["./tests/preload.ts"]` that replaces console methods with no-ops. Stops the noise immediately but loses console output when debugging failing tests. Use as a stopgap if the logger refactor can't happen soon.

**Not recommended: structured logger (pino/winston).** Overkill for a local dev tool. The benefits (log aggregation, JSON output, search) don't apply here.

The refactor can be done incrementally, starting with the noisiest files (scheduler, commission orchestrator, meeting orchestrator).
