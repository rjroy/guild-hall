---
title: Hardcoded /tmp/ paths fail under the pre-commit sandbox — use os.tmpdir()
date: 2026-04-28
status: active
tags: [testing, sandbox, pre-commit]
modules: []
---

Hardcoded `/tmp/` paths in tests fail under the pre-commit sandbox. The fix is a systematic sweep to `os.tmpdir()`, not per-commission patches.
