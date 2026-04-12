---
title: Define package distribution model for worker packages
date: 2026-02-25
status: parked
tags: [design, packages, workers, distribution]
modules: [lib-packages, daemon, cli]
---

# Package Distribution Model

## What Happened

Most worker packages will live in the project's git repository (under `packages/`), but the system also defines `~/.guild-hall/packages/` as the installed packages directory. The relationship between these two locations isn't defined: there's no install step, no symlink strategy, and no clear rule for which location wins.

## Why It Matters

Without a defined distribution model, package discovery is ambiguous. The daemon uses `--packages-dir` to point at one location (local dev uses `./packages`, production uses `~/.guild-hall/packages/`), but there's no mechanism to get packages from a project repo into the global location. This blocks multi-project setups where projects share workers, and it leaves the `~/.guild-hall/packages/` directory as dead infrastructure.

## Fix Direction

Options to evaluate:

1. **Copy/install step**: CLI command (`guild-hall install-packages`) that copies from repo to `~/.guild-hall/packages/`. Simple but creates sync drift.
2. **Symlinks**: `~/.guild-hall/packages/` contains symlinks to project repos. Requires directory depth conventions. Avoids drift.
3. **Multi-source discovery**: Package resolver reads from both locations, with precedence rules. No install step needed. Project-local packages override global ones.
4. **Drop the global directory**: Just read from project repos directly. Simplest, but locks out shared/cross-project workers.

Need to decide which model fits the actual usage pattern.
