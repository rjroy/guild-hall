---
title: "Commission: Fix: CopyPathButton fails on mobile"
date: 2026-03-10
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix the CopyPathButton at `web/components/artifact/CopyPathButton.tsx` so it works on mobile browsers.\n\n**Problem:** `navigator.clipboard.writeText()` fails silently on mobile. The Clipboard API requires a secure context and isn't reliably supported on all mobile browsers. The current code has no fallback and no error handling.\n\n**Fix:** Add a fallback that uses a temporary textarea + `document.execCommand('copy')` when the Clipboard API is unavailable or fails. Also add error handling so the button shows feedback even on failure.\n\n**Current code:**\n```tsx\nconst handleCopy = () => {\n  void navigator.clipboard.writeText(path).then(() => {\n    setCopied(true);\n    setTimeout(() => setCopied(false), 2000);\n  });\n};\n```\n\n**Requirements:**\n- Try `navigator.clipboard.writeText()` first\n- Fall back to textarea + `execCommand('copy')` if Clipboard API is unavailable or throws\n- Show \"Copied!\" on success, handle failure gracefully (e.g., show a brief error state)\n- Keep the component simple, no new dependencies\n- Write a test for the component"
dependencies: []
linked_artifacts: []

resource_overrides:
  model: haiku

activity_timeline:
  - timestamp: 2026-03-10T05:42:08.981Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T05:42:08.983Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
