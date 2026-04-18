---
title: Improve Token Performance of Git Tools
date: 2026-03-29
status: open
tags: [bug, performance, tooling, git]
modules: [packages/guild-hall-developer, daemon/lib/git]
related:
  - .lore/research/token-efficient-git-tools.md
  - .lore/retros/commission-cleanup-2026-03-30.md
---

# Improve Token Performance of Git Tools

## What Happens

A real `git show` produced a 122MB diff that blew the SDK's token budget. The output was technically correct — the diff was that large — but the worker session became unusable for the rest of its turn. Since git output flows through guild-hall's own MCP tool (not the SDK's general Bash), this is fixable in our layer.

Originally filed 2026-03-29. Verity's research validated a 3-layer approach (binary exclusion, generated-file exclusion, ~20KB per-file cap with continuation hints). The issue was prematurely marked `resolved` after the research landed; no code change shipped. Re-surfaced 2026-04-18 during the 2026-03-30 commission retro validation pass.

## Verified Status (2026-04-18)

**Research:** `.lore/research/token-efficient-git-tools.md` exists and documents the recommended 3-layer approach with ecosystem evidence.

**Implementation:** No matching limits in `packages/guild-hall-developer/src` or `daemon/lib/git.ts`. Grep for `MAX_BYTES`, `maxBytes`, `truncate`, `outputLimit` returns nothing in the git tool surface.

The mismatch — closed issue, no code — is what made it look fixed.

## Fix Direction

Implement the research's 3-layer approach in the git MCP tool. Order from cheapest to deepest:

1. **Exclude known binary paths and generated files at the diff level.** `.png`, `.webp`, `.jpg`, `.lock`, `dist/`, `node_modules/`, etc. The current tool ships their full byte content as base64 or noise.
2. **Per-file byte cap (~20KB).** When a file's diff exceeds the cap, truncate and append a continuation hint (`... 47 more lines, 3.2MB; use git show <sha> -- <path> --no-color | head -N to inspect`).
3. **Total response cap as a backstop.** If the per-file caps still produce a >Nkb response, truncate the response and flag which files were dropped.

Mirror the limits in tool descriptions so the model understands what it's getting and what to ask for if it needs more.

## Verification After Fix

- Unit test: feed a synthetic diff with one 5MB file. Assert the per-file truncation kicks in and the continuation hint includes the byte count.
- Unit test: feed a diff containing only `dist/bundle.js`. Assert the file is excluded with a "skipped: generated file" note rather than truncated content.
- Integration test: re-run a `git show` against a commit known to include large binary changes. Assert response stays under the configured cap.

## Notes for the Fix

- The research recommends a per-file 20KB cap as the sweet spot for recent diffs. Don't pick the limit by gut feel — the research did the homework.
- Keep the limits configurable (env or tool option). The right number depends on context window and may need to move when models change.
- Do not silently drop content. Every truncation must produce a continuation hint the model can act on.
