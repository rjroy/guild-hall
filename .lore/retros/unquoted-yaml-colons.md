---
title: Unquoted colons in YAML frontmatter break gray-matter parsing
date: 2026-03-14
status: complete
tags: [frontmatter, yaml, gray-matter, recurring-bug]
---

# Retro: Unquoted Colons in YAML Frontmatter

## Summary

Two implementation notes files (`cli-progressive-discovery.md`, `injectable-daemon-logger.md`) had `title:` values containing colons that weren't quoted. gray-matter can't parse `title: Implementation notes: foo` because the second colon is ambiguous YAML. This has happened before.

## What Went Well

- The fix is trivial: wrap the value in quotes.

## What Could Improve

- This is a recurring mistake. AI-generated frontmatter keeps producing unquoted colons because the pattern looks natural in English.
- The lore-development frontmatter schema example (`frontmatter-schema.md`) itself shows an unquoted colon in its Notes example: `title: Implementation notes: auth-flow`. The reference material propagates the bug.

## Lessons Learned

- YAML values containing colons must be quoted. Any `title:` (or other field) with a colon in the value needs double quotes, or gray-matter will fail to parse it. This applies to all `.lore/` frontmatter and any artifact frontmatter in the project.
- Reference examples that contain the bug will reproduce the bug indefinitely. The frontmatter schema example needs to be fixed at the source.

## Artifacts

- `.lore/notes/cli-progressive-discovery.md` (fixed)
- `.lore/notes/injectable-daemon-logger.md` (fixed)
