---
title: .playwright-mcp/ directory not in .gitignore
status: open
tags: [infrastructure, git, cleanup]
date: 2026-03-10
---

## Problem

`.playwright-mcp/` is not listed in `.gitignore`. A Playwright MCP console log (`console-2026-03-08T04-00-05-487Z.log`) was committed to the repository during commission work on 2026-03-08.

These logs are timestamped and accumulate with each MCP session. Without a gitignore entry, they will continue to be committed and grow the repository size over time.

## Fix

Add `.playwright-mcp/` to `.gitignore`. Remove the committed log file with `git rm --cached`.

## Source

Identified during Thorne's review commission 2026-03-08 (commission-Thorne-20260308-184127).
