---
title: "Commission: Spec: HTML mockup preview in web UI"
date: 2026-04-06
status: dispatched
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for allowing HTML mockup files to be previewed from the Guild Hall web UI.\n\n## Context\n\nSienna (the Guild Illuminator) generates self-contained HTML pages as UX mockups. These are stored as artifacts in `.lore/`. Currently the web UI can preview images but has no way to view HTML mockups.\n\n## Design Direction\n\nThe user leans toward opening mockups in a new browser tab/window rather than embedding via iframe. Rationale: most mockups assume a full-page viewport, so constraining them inside an iframe creates layout and sizing problems. Sandboxing also adds complexity.\n\n## What the spec should cover\n\n1. How mockups are identified (file extension, artifact metadata, MIME type, etc.)\n2. How the user triggers a preview (button placement, interaction pattern)\n3. The serving mechanism: the daemon needs to serve the HTML file content so the browser can open it as a new tab. Consider:\n   - A daemon route that serves raw HTML file content\n   - Security implications of serving arbitrary HTML (XSS, script execution)\n   - Whether Content-Security-Policy headers or other mitigations are needed\n   - Path resolution from artifact metadata to the actual file on disk\n4. Integration with the existing artifact detail view (where the preview button lives alongside other artifact metadata)\n5. Edge cases: missing files, non-HTML files with wrong metadata, large files\n\n## Constraints\n\n- The daemon is the application boundary. The web layer cannot read files directly.\n- Artifacts are markdown files with YAML frontmatter in `.lore/`. The HTML mockups are separate files that artifacts may reference.\n- Keep the scope tight. This is a preview affordance, not an editor or annotation system.\n\nWrite the spec to `.lore/specs/` following the project's spec conventions (YAML frontmatter with title, date, status, tags, REQ IDs)."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-06T21:49:48.328Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-06T21:49:48.330Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
