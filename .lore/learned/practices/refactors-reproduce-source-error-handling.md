---
title: Refactors faithfully reproduce the error handling of the source code
date: 2026-04-28
status: active
tags: [refactor, error-handling]
modules: []
---

If the original swallows errors, the refactor will too unless error handling is a named target. When planning a refactor, decide whether the source's error handling is worth preserving. If not, include an error-handling pass in the plan or specify a silent-failure-hunter review.
