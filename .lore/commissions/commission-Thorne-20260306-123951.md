---
title: "Commission: Review: Tool Usage Collapse in Meeting View"
date: 2026-03-06
status: completed
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the recent changes collapsing tool usage lists in the meeting view. The commission was \"Fix: Tool Usage Visual Noise in Meeting View.\"\n\n**Context:**\n- Issue: `.lore/issues/tool-usage-visual-noise.md`\n- Fix approach: Collapse by default, expand on demand (Option 1). During streaming, running tools stay visible while completed tools collapse. After turn completes, all tools collapse behind a summary.\n\n**Review checklist:**\n1. Read the issue, then review the implementation\n2. Verify collapse/expand behavior in both `StreamingMessage` and `MessageBubble`\n3. Check that running/pending tools remain visible during streaming\n4. Check that completed tools collapse behind a summary line\n5. Verify the expand toggle works and shows all `ToolUseIndicator` entries\n6. Review CSS (must be CSS Modules, consistent with existing styles)\n7. Check tests exist for collapse/expand logic and streaming vs completed states\n8. Run affected test files\n9. Flag any accessibility concerns (can the toggle be keyboard-navigated?)\n\nUse `git log --oneline -10` and recent commit diffs to identify the changed files. Report findings with file paths and line numbers."
dependencies: []
linked_artifacts:
  - web/components/meeting/CollapsibleToolList.tsx

  - web/components/meeting/CollapsibleToolList.module.css
  - web/components/meeting/StreamingMessage.tsx
  - web/components/meeting/MessageBubble.tsx
  - tests/components/collapsible-tool-list.test.tsx
  - tests/components/meeting-view.test.tsx
  - web/components/meeting/CollapsibleToolList.module.css
  - web/components/meeting/StreamingMessage.tsx
  - web/components/meeting/MessageBubble.tsx
  - tests/components/collapsible-tool-list.test.tsx
  - tests/components/meeting-view.test.tsx
activity_timeline:
  - timestamp: 2026-03-06T20:39:51.843Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T20:41:12.511Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-06T20:41:12.544Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-06T20:41:20.631Z
    event: progress_report
    reason: "Starting review. Reading the issue file and identifying changed files from recent commits."
  - timestamp: 2026-03-06T20:42:59.536Z
    event: progress_report
    reason: "Tests pass (57/57). Reviewed all implementation files, CSS, diffs. Now verifying edge cases and compiling findings."
  - timestamp: 2026-03-06T20:44:26.698Z
    event: result_submitted
    reason: "## Review: Tool Usage Visual Noise Fix (Commit 4f319ea)\n\n### Verdict: Approved. Clean implementation that solves the stated problem.\n\n### What changed\n\nCommit `4f319ea` (commission-Dalton-20260306-121717) introduces a new `CollapsibleToolList` component and wires it into both `StreamingMessage` and `MessageBubble`, replacing the previous pattern of mapping `ToolUseIndicator` entries directly.\n\n**Files changed (8):**\n- `web/components/meeting/CollapsibleToolList.tsx` (new, 119 lines)\n- `web/components/meeting/CollapsibleToolList.module.css` (new, 45 lines)\n- `web/components/meeting/StreamingMessage.tsx` (modified, -5/+4 lines)\n- `web/components/meeting/MessageBubble.tsx` (modified, -4/+2 lines)\n- `tests/components/collapsible-tool-list.test.tsx` (new, 271 lines)\n- `tests/components/meeting-view.test.tsx` (modified, -13/+14 lines)\n- `.lore/issues/tool-usage-visual-noise.md` (status updated to resolved)\n- `.lore/commissions/commission-Dalton-20260306-121717.md` (commission artifact)\n\n### Checklist results\n\n| Check | Status | Notes |\n|-------|--------|-------|\n| Collapse/expand in StreamingMessage | Pass | `isStreaming={true}`, running tools visible, completed collapsed |\n| Collapse/expand in MessageBubble | Pass | `isStreaming={false}`, all tools behind summary |\n| Running tools visible during streaming | Pass | `categorizeTools` splits by status, active tools render below summary |\n| Completed tools behind summary | Pass | Summary text: \"N tools completed\" (streaming) / \"N tools used\" (done) |\n| Expand toggle works | Pass | `useState` toggle, conditional rendering of full list |\n| CSS Modules | Pass | `.module.css`, project tokens, consistent with ToolUseIndicator patterns |\n| Tests exist | Pass | 271-line test file covers pure logic + parent integration |\n| Tests pass | Pass | 57 tests, 0 failures across both test files |\n| Keyboard accessible | Pass | `<button>` element, `aria-expanded`, `type=\"button\"` |\n\n### Findings\n\n**F1: No `:focus-visible` style on summary toggle (Low, pre-existing pattern)**\n- File: `web/components/meeting/CollapsibleToolList.module.css`\n- The `.summaryToggle` button has no `:focus-visible` rule. Keyboard users can't see which toggle is focused.\n- However, `ToolUseIndicator.module.css` also lacks `:focus-visible` for `.toolHeader`. This is a pre-existing gap, not introduced by this change.\n- Recommendation: Track as a separate issue covering all interactive elements in the meeting view.\n\n**F2: No interaction test for expand/collapse state change (Medium, accepted limitation)**\n- File: `tests/components/collapsible-tool-list.test.tsx:12-13`\n- The test file notes: \"The component itself uses useState, so it cannot be called directly in bun test.\" Pure logic (`categorizeTools`, `buildSummaryText`) is tested. Parent integration (correct component with correct props) is tested. But clicking the toggle and verifying the expanded list renders is not.\n- Impact: A regression in the expand/collapse conditional rendering would not be caught.\n- Recommendation: Acceptable tradeoff. The rendering logic is standard React disclosure pattern. If a browser-based test runner is added later, this component should get interaction coverage.\n\n**F3: Stale type re-export in ToolUseIndicator (Low, cleanup)**\n- File: `web/components/meeting/ToolUseIndicator.tsx:8`\n- `export type { ToolUseEntry }` is a re-export from `@/lib/types`. `StreamingMessage` was its only consumer and now imports from `@/lib/types` directly. The remaining consumer is `tests/components/meeting-view.test.tsx:4`, which still imports the type from ToolUseIndicator.\n- Not a bug. The re-export works. But the test import is inconsistent with the new pattern (the new test file imports from `@/lib/types`).\n- Recommendation: Update `meeting-view.test.tsx` to import from `@/lib/types` and remove the re-export from ToolUseIndicator. Minor cleanup.\n\n**F4: StreamingMessage import path improvement (Positive)**\n- Old: `import type { ToolUseEntry } from \"./ToolUseIndicator\"` (re-export)\n- New: `import type { ToolUseEntry } from \"@/lib/types\"` (canonical source)\n- Types should come from their source of truth. This is a good change.\n\n### Architecture assessment\n\nThe implementation correctly follows Option 1 from the issue (collapse by default, expand on demand). The `categorizeTools` and `buildSummaryText` functions are exported as pure functions for direct testing, keeping the hook-based component boundary clean. The `isStreaming` prop gives parent components explicit control over behavior mode. The component is self-contained and doesn't leak concerns into its parents.\n\nNo findings block this work."
  - timestamp: 2026-03-06T20:44:39.992Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
  - timestamp: 2026-03-06T20:44:40.210Z
    event: status_completed
    reason: "Execution completed"
current_progress: "Tests pass (57/57). Reviewed all implementation files, CSS, diffs. Now verifying edge cases and compiling findings."
projectName: guild-hall
---
## Review: Tool Usage Visual Noise Fix (Commit 4f319ea)

### Verdict: Approved. Clean implementation that solves the stated problem.

### What changed

Commit `4f319ea` (commission-Dalton-20260306-121717) introduces a new `CollapsibleToolList` component and wires it into both `StreamingMessage` and `MessageBubble`, replacing the previous pattern of mapping `ToolUseIndicator` entries directly.

**Files changed (8):**
- `web/components/meeting/CollapsibleToolList.tsx` (new, 119 lines)
- `web/components/meeting/CollapsibleToolList.module.css` (new, 45 lines)
- `web/components/meeting/StreamingMessage.tsx` (modified, -5/+4 lines)
- `web/components/meeting/MessageBubble.tsx` (modified, -4/+2 lines)
- `tests/components/collapsible-tool-list.test.tsx` (new, 271 lines)
- `tests/components/meeting-view.test.tsx` (modified, -13/+14 lines)
- `.lore/issues/tool-usage-visual-noise.md` (status updated to resolved)
- `.lore/commissions/commission-Dalton-20260306-121717.md` (commission artifact)

### Checklist results

| Check | Status | Notes |
|-------|--------|-------|
| Collapse/expand in StreamingMessage | Pass | `isStreaming={true}`, running tools visible, completed collapsed |
| Collapse/expand in MessageBubble | Pass | `isStreaming={false}`, all tools behind summary |
| Running tools visible during streaming | Pass | `categorizeTools` splits by status, active tools render below summary |
| Completed tools behind summary | Pass | Summary text: "N tools completed" (streaming) / "N tools used" (done) |
| Expand toggle works | Pass | `useState` toggle, conditional rendering of full list |
| CSS Modules | Pass | `.module.css`, project tokens, consistent with ToolUseIndicator patterns |
| Tests exist | Pass | 271-line test file covers pure logic + parent integration |
| Tests pass | Pass | 57 tests, 0 failures across both test files |
| Keyboard accessible | Pass | `<button>` element, `aria-expanded`, `type="button"` |

### Findings

**F1: No `:focus-visible` style on summary toggle (Low, pre-existing pattern)**
- File: `web/components/meeting/CollapsibleToolList.module.css`
- The `.summaryToggle` button has no `:focus-visible` rule. Keyboard users can't see which toggle is focused.
- However, `ToolUseIndicator.module.css` also lacks `:focus-visible` for `.toolHeader`. This is a pre-existing gap, not introduced by this change.
- Recommendation: Track as a separate issue covering all interactive elements in the meeting view.

**F2: No interaction test for expand/collapse state change (Medium, accepted limitation)**
- File: `tests/components/collapsible-tool-list.test.tsx:12-13`
- The test file notes: "The component itself uses useState, so it cannot be called directly in bun test." Pure logic (`categorizeTools`, `buildSummaryText`) is tested. Parent integration (correct component with correct props) is tested. But clicking the toggle and verifying the expanded list renders is not.
- Impact: A regression in the expand/collapse conditional rendering would not be caught.
- Recommendation: Acceptable tradeoff. The rendering logic is standard React disclosure pattern. If a browser-based test runner is added later, this component should get interaction coverage.

**F3: Stale type re-export in ToolUseIndicator (Low, cleanup)**
- File: `web/components/meeting/ToolUseIndicator.tsx:8`
- `export type { ToolUseEntry }` is a re-export from `@/lib/types`. `StreamingMessage` was its only consumer and now imports from `@/lib/types` directly. The remaining consumer is `tests/components/meeting-view.test.tsx:4`, which still imports the type from ToolUseIndicator.
- Not a bug. The re-export works. But the test import is inconsistent with the new pattern (the new test file imports from `@/lib/types`).
- Recommendation: Update `meeting-view.test.tsx` to import from `@/lib/types` and remove the re-export from ToolUseIndicator. Minor cleanup.

**F4: StreamingMessage import path improvement (Positive)**
- Old: `import type { ToolUseEntry } from "./ToolUseIndicator"` (re-export)
- New: `import type { ToolUseEntry } from "@/lib/types"` (canonical source)
- Types should come from their source of truth. This is a good change.

### Architecture assessment

The implementation correctly follows Option 1 from the issue (collapse by default, expand on demand). The `categorizeTools` and `buildSummaryText` functions are exported as pure functions for direct testing, keeping the hook-based component boundary clean. The `isStreaming` prop gives parent components explicit control over behavior mode. The component is self-contained and doesn't leak concerns into its parents.

No findings block this work.
