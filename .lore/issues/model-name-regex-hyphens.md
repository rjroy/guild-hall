---
title: Model name regex rejects hyphens, breaking local model names
status: invalid
tags: [bug, local-models, validation]
date: 2026-03-10
---

## Problem

`updateCommission` uses `/\w+/` for model name validation. The `\w` character class matches `[a-zA-Z0-9_]` but does not match hyphens. Local model names like `mistral-local` or `llama3-8b` contain hyphens and will fail validation silently.

## Impact

Any feature that passes a local model name through `updateCommission` (including the planned local model support feature) will fail or corrupt the model field.

## Fix

Update the regex in `daemon/` model validation code to accept hyphens. A safe pattern: `/[\w-]+/` or `/[a-zA-Z0-9_-]+/`.

## Source

Identified during Octavia's commission 2026-03-09 (local model support planning, commission-Octavia-20260309-194600).
