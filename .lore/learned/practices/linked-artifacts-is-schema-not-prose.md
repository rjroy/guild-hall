---
title: linked_artifacts is schema, not prose
date: 2026-04-28
status: active
tags: [schema, migration, commissions]
modules: [daemon]
---

When directory layouts change, every `linked_artifacts` entry is a foreign-key reference. A migration that reorganizes `.lore/` must rewrite linked_artifacts across commissions, meetings, and specs in the same operation, not as a follow-up. The Verity discovery report dropped during a layout transition and was never recovered.
