---
title: "Commission: Render commission prompt as Markdown"
date: 2026-03-15
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "The commission detail page's prompt section renders as plain text when read-only. It should render as rich Markdown instead.\n\n## What to change\n\n`web/components/commission/CommissionPrompt.tsx`, line 87: the read-only branch renders `<p className={styles.readOnly}>{value}</p>`. Replace this with `ReactMarkdown` + `remark-gfm` so Markdown formatting in commission prompts (headers, lists, code blocks, links, bold/italic) renders properly.\n\n## Requirements\n\n1. When `editable` is false (non-pending status), render the prompt through `ReactMarkdown` with `remark-gfm`.\n2. When `editable` is true (pending status), keep the existing textarea behavior unchanged.\n3. Apply the existing `styles.readOnly` class to the wrapper element around the rendered Markdown.\n4. The project already uses `react-markdown` and `remark-gfm` as dependencies (check `web/components/artifact/ArtifactContent.tsx` for usage patterns and any shared Markdown styling).\n5. Ensure Markdown content inherits appropriate typography from the fantasy theme (check `globals.css` tokens).\n6. Write or update tests in `tests/components/commission-view.test.tsx` to verify Markdown rendering in the read-only state.\n\n## Key files\n\n- `web/components/commission/CommissionPrompt.tsx` (the change)\n- `web/components/commission/CommissionPrompt.module.css` (may need styles for Markdown elements like lists, code blocks within the read-only container)\n- `web/components/artifact/ArtifactContent.tsx` (reference for existing Markdown rendering patterns)\n- `tests/components/commission-view.test.tsx` (tests)"
dependencies: []
linked_artifacts:
  - web/components/commission/CommissionPrompt.tsx

  - web/components/commission/CommissionPrompt.module.css
  - tests/components/commission-view.test.tsx
  - web/components/commission/CommissionPrompt.module.css
  - tests/components/commission-view.test.tsx
activity_timeline:
  - timestamp: 2026-03-15T03:55:00.499Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T03:55:00.501Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-15T03:55:00.543Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-15T03:55:13.787Z
    event: progress_report
    reason: "Read all key files. Implementing the change now: replacing plain text `<p>` with `ReactMarkdown` in CommissionPrompt's read-only branch, adding CSS for Markdown elements, and adding tests."
  - timestamp: 2026-03-15T03:56:54.514Z
    event: result_submitted
    reason: "Commission prompt now renders as rich Markdown in read-only mode.\n\nChanges:\n1. `web/components/commission/CommissionPrompt.tsx`: Imported `ReactMarkdown` + `remark-gfm`. Read-only branch now renders prompt through `ReactMarkdown` with GFM support. Empty prompts still show the \"No prompt provided.\" fallback as plain text. Changed wrapper from `<p>` to `<div>` since Markdown can produce block elements. Textarea behavior unchanged when editable.\n\n2. `web/components/commission/CommissionPrompt.module.css`: Added Markdown element styles (headings, lists, code blocks, blockquotes, tables, links, bold, hr) scoped under `.readOnly`, following the same fantasy theme patterns from `ArtifactContent.module.css` but slightly scaled down for the prompt context. Removed `white-space: pre-wrap` from `.readOnly` since ReactMarkdown handles whitespace.\n\n3. `tests/components/commission-view.test.tsx`: Added 6 tests in a new \"CommissionPrompt Markdown rendering\" describe block. Tests verify: ReactMarkdown/remarkGfm importability, CommissionPrompt module loads correctly, ReactMarkdown pipeline processes Markdown syntax, empty prompt uses fallback, non-empty read-only prompt uses Markdown, and pending status uses textarea.\n\nAll 2774 tests pass. Typecheck clean."
  - timestamp: 2026-03-15T03:56:59.626Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read all key files. Implementing the change now: replacing plain text `<p>` with `ReactMarkdown` in CommissionPrompt's read-only branch, adding CSS for Markdown elements, and adding tests."
projectName: guild-hall
---
Commission prompt now renders as rich Markdown in read-only mode.

Changes:
1. `web/components/commission/CommissionPrompt.tsx`: Imported `ReactMarkdown` + `remark-gfm`. Read-only branch now renders prompt through `ReactMarkdown` with GFM support. Empty prompts still show the "No prompt provided." fallback as plain text. Changed wrapper from `<p>` to `<div>` since Markdown can produce block elements. Textarea behavior unchanged when editable.

2. `web/components/commission/CommissionPrompt.module.css`: Added Markdown element styles (headings, lists, code blocks, blockquotes, tables, links, bold, hr) scoped under `.readOnly`, following the same fantasy theme patterns from `ArtifactContent.module.css` but slightly scaled down for the prompt context. Removed `white-space: pre-wrap` from `.readOnly` since ReactMarkdown handles whitespace.

3. `tests/components/commission-view.test.tsx`: Added 6 tests in a new "CommissionPrompt Markdown rendering" describe block. Tests verify: ReactMarkdown/remarkGfm importability, CommissionPrompt module loads correctly, ReactMarkdown pipeline processes Markdown syntax, empty prompt uses fallback, non-empty read-only prompt uses Markdown, and pending status uses textarea.

All 2774 tests pass. Typecheck clean.
