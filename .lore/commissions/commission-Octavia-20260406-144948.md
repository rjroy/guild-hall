---
title: "Commission: Spec: HTML mockup preview in web UI"
date: 2026-04-06
status: completed
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for allowing HTML mockup files to be previewed from the Guild Hall web UI.\n\n## Context\n\nSienna (the Guild Illuminator) generates self-contained HTML pages as UX mockups. These are stored as artifacts in `.lore/`. Currently the web UI can preview images but has no way to view HTML mockups.\n\n## Design Direction\n\nThe user leans toward opening mockups in a new browser tab/window rather than embedding via iframe. Rationale: most mockups assume a full-page viewport, so constraining them inside an iframe creates layout and sizing problems. Sandboxing also adds complexity.\n\n## What the spec should cover\n\n1. How mockups are identified (file extension, artifact metadata, MIME type, etc.)\n2. How the user triggers a preview (button placement, interaction pattern)\n3. The serving mechanism: the daemon needs to serve the HTML file content so the browser can open it as a new tab. Consider:\n   - A daemon route that serves raw HTML file content\n   - Security implications of serving arbitrary HTML (XSS, script execution)\n   - Whether Content-Security-Policy headers or other mitigations are needed\n   - Path resolution from artifact metadata to the actual file on disk\n4. Integration with the existing artifact detail view (where the preview button lives alongside other artifact metadata)\n5. Edge cases: missing files, non-HTML files with wrong metadata, large files\n\n## Constraints\n\n- The daemon is the application boundary. The web layer cannot read files directly.\n- Artifacts are markdown files with YAML frontmatter in `.lore/`. The HTML mockups are separate files that artifacts may reference.\n- Keep the scope tight. This is a preview affordance, not an editor or annotation system.\n\nWrite the spec to `.lore/specs/` following the project's spec conventions (YAML frontmatter with title, date, status, tags, REQ IDs)."
dependencies: []
linked_artifacts:
  - .lore/specs/ui/html-mockup-preview.md

activity_timeline:
  - timestamp: 2026-04-06T21:49:48.328Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-06T21:49:48.330Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-06T21:49:48.429Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-06T21:49:54.885Z
    event: progress_report
    reason: "Starting spec work. Gathering context: existing spec conventions, artifact structure, daemon serving patterns, and the artifact detail view."
  - timestamp: 2026-04-06T21:52:25.170Z
    event: progress_report
    reason: "Context gathering complete. Read: spec-writing compendium entry, artifact-image-display spec (closest analogue), daemon artifact routes, catch-all page component, image proxy route, artifact scanner, MIME type mapping. Now drafting the HTML mockup preview spec."
  - timestamp: 2026-04-06T21:53:59.907Z
    event: result_submitted
    reason: "Wrote the HTML mockup preview spec at `.lore/specs/ui/html-mockup-preview.md` (status: draft, req-prefix: MKP, 21 requirements).\n\nThe spec covers all five areas from the commission brief:\n\n1. **Identification**: `.html` extension is the sole identifier. New `artifactType: \"mockup\"` value extends the existing union on `lib/types.ts:77`. Synthetic metadata (title from filename, mtime for date) matches the image artifact pattern.\n\n2. **User interaction**: Two paths to preview. The artifact detail view shows a landing page with \"Open Preview\" button. The tree view offers a direct preview action that skips the detail view. Both open the mockup in a new tab via `window.open()` with `noopener,noreferrer`.\n\n3. **Serving mechanism**: New daemon route `GET /workspace/artifact/mockup/read` serves raw HTML bytes. New Next.js proxy at `/api/artifacts/mockup` forwards the response. Path validation uses the existing `validatePath()` function. Integration worktree resolution (not activity worktrees).\n\n4. **Security**: CSP header blocks outbound network requests (`connect-src 'none'`) and framing (`frame-ancestors 'none'`). Allows inline scripts and styles for mockup interactivity. `noopener` on `window.open()` prevents opener access. `X-Content-Type-Options: nosniff` prevents MIME confusion.\n\n5. **Edge cases**: Missing files (404), wrong extensions (415), large files (serve without special handling, <10MB assumption), non-self-contained files (broken references, accepted limitation).\n\nDesign decision: new tab over iframe, as directed. Rationale documented in the Overview section."
  - timestamp: 2026-04-06T21:54:03.703Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Context gathering complete. Read: spec-writing compendium entry, artifact-image-display spec (closest analogue), daemon artifact routes, catch-all page component, image proxy route, artifact scanner, MIME type mapping. Now drafting the HTML mockup preview spec."
projectName: guild-hall
---
Wrote the HTML mockup preview spec at `.lore/specs/ui/html-mockup-preview.md` (status: draft, req-prefix: MKP, 21 requirements).

The spec covers all five areas from the commission brief:

1. **Identification**: `.html` extension is the sole identifier. New `artifactType: "mockup"` value extends the existing union on `lib/types.ts:77`. Synthetic metadata (title from filename, mtime for date) matches the image artifact pattern.

2. **User interaction**: Two paths to preview. The artifact detail view shows a landing page with "Open Preview" button. The tree view offers a direct preview action that skips the detail view. Both open the mockup in a new tab via `window.open()` with `noopener,noreferrer`.

3. **Serving mechanism**: New daemon route `GET /workspace/artifact/mockup/read` serves raw HTML bytes. New Next.js proxy at `/api/artifacts/mockup` forwards the response. Path validation uses the existing `validatePath()` function. Integration worktree resolution (not activity worktrees).

4. **Security**: CSP header blocks outbound network requests (`connect-src 'none'`) and framing (`frame-ancestors 'none'`). Allows inline scripts and styles for mockup interactivity. `noopener` on `window.open()` prevents opener access. `X-Content-Type-Options: nosniff` prevents MIME confusion.

5. **Edge cases**: Missing files (404), wrong extensions (415), large files (serve without special handling, <10MB assumption), non-self-contained files (broken references, accepted limitation).

Design decision: new tab over iframe, as directed. Rationale documented in the Overview section.
