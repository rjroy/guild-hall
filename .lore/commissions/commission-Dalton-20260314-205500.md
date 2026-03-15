---
title: "Commission: Render commission prompt as Markdown"
date: 2026-03-15
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "The commission detail page's prompt section renders as plain text when read-only. It should render as rich Markdown instead.\n\n## What to change\n\n`web/components/commission/CommissionPrompt.tsx`, line 87: the read-only branch renders `<p className={styles.readOnly}>{value}</p>`. Replace this with `ReactMarkdown` + `remark-gfm` so Markdown formatting in commission prompts (headers, lists, code blocks, links, bold/italic) renders properly.\n\n## Requirements\n\n1. When `editable` is false (non-pending status), render the prompt through `ReactMarkdown` with `remark-gfm`.\n2. When `editable` is true (pending status), keep the existing textarea behavior unchanged.\n3. Apply the existing `styles.readOnly` class to the wrapper element around the rendered Markdown.\n4. The project already uses `react-markdown` and `remark-gfm` as dependencies (check `web/components/artifact/ArtifactContent.tsx` for usage patterns and any shared Markdown styling).\n5. Ensure Markdown content inherits appropriate typography from the fantasy theme (check `globals.css` tokens).\n6. Write or update tests in `tests/components/commission-view.test.tsx` to verify Markdown rendering in the read-only state.\n\n## Key files\n\n- `web/components/commission/CommissionPrompt.tsx` (the change)\n- `web/components/commission/CommissionPrompt.module.css` (may need styles for Markdown elements like lists, code blocks within the read-only container)\n- `web/components/artifact/ArtifactContent.tsx` (reference for existing Markdown rendering patterns)\n- `tests/components/commission-view.test.tsx` (tests)"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-15T03:55:00.499Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T03:55:00.501Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
