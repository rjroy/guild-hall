---
title: "Register Project Should Not Require Lore Dir"
date: 2026-04-02
status: resolved
---

Currently registering a project requires the `.lore` directory to exist. It shouldn't need that. Being able to add a blank project is important.

## Resolution

Removed `.lore/` validation from the register endpoint. Projects can now be registered with only a `.git` directory. The validate endpoint downgrades missing `.lore/` from an error to an informational warning.