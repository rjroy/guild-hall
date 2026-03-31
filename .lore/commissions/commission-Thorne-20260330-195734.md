---
title: "Commission: Review: Token-efficient git tools — Phase 3"
date: 2026-03-31
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the Phase 3 implementation of token-efficient git tools.\n\nRead the plan at `.lore/plans/infrastructure/token-efficient-git-tools.md` and spec at `.lore/specs/infrastructure/token-efficient-git-tools.md` for context.\n\nKey review concerns from the plan:\n- `splitDiffByFile` regex correctness against real git diff header formats (rename headers, new file mode lines, mode change lines)\n- Byte counting consistency (string.length vs Buffer.byteLength)\n- Per-file cap and total cap interaction (per-file reduces first, then total cap applies to reduced set)\n- Truncation notice formats match spec exactly\n\nReview `daemon/services/git-readonly-toolbox.ts` and `tests/daemon/services/git-readonly-toolbox.test.ts`.\n\nWrite findings to `.lore/reviews/token-efficient-git-tools-phase3.md`."
dependencies:
  - commission-Dalton-20260330-195727
linked_artifacts:
  - daemon/services/git-readonly-toolbox.ts

  - tests/daemon/services/git-readonly-toolbox.test.ts
  - tests/daemon/services/git-readonly-toolbox.test.ts
activity_timeline:
  - timestamp: 2026-03-31T02:57:34.108Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-31T03:02:26.323Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-31T03:12:15.349Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-31T03:12:15.352Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-31T03:12:15.400Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-31T03:12:21.586Z
    event: progress_report
    reason: "Reading plan, spec, and dependency commission for Phase 3 context."
  - timestamp: 2026-03-31T03:12:53.479Z
    event: progress_report
    reason: "Read all source material: plan, spec, dependency commission, implementation (547 lines), and tests (1053 lines). Now analyzing Phase 3 implementation against spec requirements and plan review concerns."
  - timestamp: 2026-03-31T03:15:54.685Z
    event: progress_report
    reason: "Analysis complete. Compiling findings for review document. Phase 3 implementation is solid — no high-severity defects. Writing findings to .lore/reviews/."
  - timestamp: 2026-03-31T03:16:47.995Z
    event: result_submitted
    reason: "## Phase 3 Review: Token-Efficient Git Tools\n\n**Files reviewed**: `daemon/services/git-readonly-toolbox.ts` (lines 120-223, 430-493), `tests/daemon/services/git-readonly-toolbox.test.ts` (lines 740-1032)\n\n**Verdict**: Phase 3 is sound. The three helper functions are clean, well-tested, and correctly wired. No high-severity defects.\n\n---\n\n### Plan Review Concerns — Addressed\n\n**1. `splitDiffByFile` regex correctness**\n\nThe regex `^diff --git a\\/.+ b\\/(.+)$/gm` handles standard git output correctly:\n- Rename headers: greedy `.+` on the `a/` side backtracks to find the rightmost ` b/`, correctly extracting the destination path. Test at line 789 validates this.\n- New file mode, deleted file mode, index lines: these follow the `diff --git` header and don't match the `^diff --git` anchor. Correctly included in the file segment content.\n- Context lines containing `diff --git`: prefixed with `+`, `-`, or space, so they don't match the `^` anchor. Safe.\n\n**2. Byte counting consistency**\n\n`string.length` is used everywhere: `applyPerFileCap` line 172 and 176, `applyTotalCap` line 204 and 210. No mixing with `Buffer.byteLength`. Internally consistent. See CONCERN-1 for the documentation mismatch.\n\n**3. Per-file and total cap interaction**\n\nPipeline in both handlers: `splitDiffByFile → applyPerFileCap → applyTotalCap`. Per-file cap reduces oversized segments to small notices first, then total cap evaluates the reduced set. The full pipeline integration test (line 998) validates this: two 25KB files get capped, then all four files fit within 100KB. Correct.\n\n---\n\n### Requirement Coverage\n\n| REQ | Status | Evidence |\n|-----|--------|----------|\n| REQ-TEG-8 | **Satisfied** | `DEFAULT_MAX_FILE_SIZE = 20_480` (line 122). Pipeline wired in both handlers after binary/generated filtering. |\n| REQ-TEG-9 | **Satisfied** | Notice format at lines 177-179 matches spec. Header preserved, actual size included, recovery action provided. |\n| REQ-TEG-10 | **Satisfied** | `MAX_TOTAL_OUTPUT = 102_400` (line 123). `applyTotalCap` truncates at file boundaries, lists remaining files. Format at lines 217-219 matches spec. |\n| REQ-TEG-11 | **Satisfied** | `max_file_size` parameter on both tools. Default handled in handler (line 431, 485). `0` disables per-file cap (line 165). Total cap not user-configurable. |\n\n---\n\n### Findings\n\n**CONCERN-1 [LOW]: `max_file_size` description says \"bytes\" but implementation measures code units**\n\nFile: `daemon/services/git-readonly-toolbox.ts:395,454`\n\nThe parameter description reads `\"Maximum bytes per file diff before truncation\"` but the implementation uses `f.content.length` (UTF-16 code units, not bytes). For ASCII diff output the values are identical, so this produces correct behavior in practice. The plan's Open Question #2 acknowledged this decision. The description is technically inaccurate.\n\n**Recommendation**: Change description to `\"Maximum size per file diff before truncation (default: 20480). Set to 0 to disable.\"` — drop the word \"bytes\" to avoid the semantic mismatch.\n\n**CONCERN-2 [LOW]: Truncation notice mixes human-readable and raw-number size formats**\n\nFile: `daemon/services/git-readonly-toolbox.ts:177-179`\n\nThe per-file notice reads `[File diff exceeds 20KB limit (25000)]`. The cap is formatted as `\"20KB\"` (human-readable) while the actual size is a raw number with no unit. A worker reading this has to infer that `25000` is in the same unit as `20KB`. The total cap notice at line 217 doesn't have this issue because it only shows the cap, not the actual total.\n\n**Recommendation**: Either format actual size as KB too (`\"24KB\"`) or append a unit label (`\"25000 chars\"`). Minor readability improvement.\n\n**OBSERVATION-1: `splitDiffByFile` does not handle git's quoted-path format**\n\nFile: `daemon/services/git-readonly-toolbox.ts:134`\n\nGit quotes paths containing spaces or special characters: `diff --git \"a/path with spaces.ts\" \"b/path with spaces.ts\"`. The regex expects `a/` immediately after `diff --git ` without a quote prefix, so quoted headers would not be matched — the file would bypass per-file capping entirely (fall through to the `fileDiffs.length === 0` branch and return raw output).\n\nNot a spec violation — the spec and plan describe the simple header format. In practice, file paths with spaces are rare in code repositories. Noting for awareness: if this toolbox processes diffs from repositories with unusual paths, oversized files with quoted paths would bypass the safety net.\n\n**OBSERVATION-2: No git_show integration test for `max_file_size: 0`**\n\nThere's a `git_diff` integration test for `max_file_size: 0` (line 947) but no equivalent for `git_show`. The code paths are parallel and the unit test for `applyPerFileCap` with 0 covers the function-level behavior. Minor coverage gap.\n\n---\n\n### Phase 2 Review Fix Verification\n\nDalton addressed three findings from the Phase 2 review:\n\n| Finding | Fix | Verified |\n|---------|-----|----------|\n| DEFECT-1 [MEDIUM]: Positional assertions for `--no-binary` | Tests at lines 391-395 and 432-435 verify `--no-binary` precedes `--` | **Yes** — assertions use `indexOf` comparison, clear and correct |\n| DEFECT-2 [LOW]: Dual-purpose lockfile entry comment | Comment at lines 21-24 explains why exact names appear alongside `*.lock` | **Yes** — comment is accurate and placed at the definition site |\n| DEFECT-3 [LOW]: Dead `filePath === dir` clause | Removed from `matchesExclusionPattern` | **Yes** — current code has three branches: wildcard extension, directory prefix, exact basename. No dead code. |\n\n---\n\n### Review file location\n\nCannot write `.lore/reviews/token-efficient-git-tools-phase3.md` — no file write tool available. Full review content is in this commission result."
  - timestamp: 2026-03-31T03:16:52.744Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Analysis complete. Compiling findings for review document. Phase 3 implementation is solid — no high-severity defects. Writing findings to .lore/reviews/."
projectName: guild-hall
---
## Phase 3 Review: Token-Efficient Git Tools

**Files reviewed**: `daemon/services/git-readonly-toolbox.ts` (lines 120-223, 430-493), `tests/daemon/services/git-readonly-toolbox.test.ts` (lines 740-1032)

**Verdict**: Phase 3 is sound. The three helper functions are clean, well-tested, and correctly wired. No high-severity defects.

---

### Plan Review Concerns — Addressed

**1. `splitDiffByFile` regex correctness**

The regex `^diff --git a\/.+ b\/(.+)$/gm` handles standard git output correctly:
- Rename headers: greedy `.+` on the `a/` side backtracks to find the rightmost ` b/`, correctly extracting the destination path. Test at line 789 validates this.
- New file mode, deleted file mode, index lines: these follow the `diff --git` header and don't match the `^diff --git` anchor. Correctly included in the file segment content.
- Context lines containing `diff --git`: prefixed with `+`, `-`, or space, so they don't match the `^` anchor. Safe.

**2. Byte counting consistency**

`string.length` is used everywhere: `applyPerFileCap` line 172 and 176, `applyTotalCap` line 204 and 210. No mixing with `Buffer.byteLength`. Internally consistent. See CONCERN-1 for the documentation mismatch.

**3. Per-file and total cap interaction**

Pipeline in both handlers: `splitDiffByFile → applyPerFileCap → applyTotalCap`. Per-file cap reduces oversized segments to small notices first, then total cap evaluates the reduced set. The full pipeline integration test (line 998) validates this: two 25KB files get capped, then all four files fit within 100KB. Correct.

---

### Requirement Coverage

| REQ | Status | Evidence |
|-----|--------|----------|
| REQ-TEG-8 | **Satisfied** | `DEFAULT_MAX_FILE_SIZE = 20_480` (line 122). Pipeline wired in both handlers after binary/generated filtering. |
| REQ-TEG-9 | **Satisfied** | Notice format at lines 177-179 matches spec. Header preserved, actual size included, recovery action provided. |
| REQ-TEG-10 | **Satisfied** | `MAX_TOTAL_OUTPUT = 102_400` (line 123). `applyTotalCap` truncates at file boundaries, lists remaining files. Format at lines 217-219 matches spec. |
| REQ-TEG-11 | **Satisfied** | `max_file_size` parameter on both tools. Default handled in handler (line 431, 485). `0` disables per-file cap (line 165). Total cap not user-configurable. |

---

### Findings

**CONCERN-1 [LOW]: `max_file_size` description says "bytes" but implementation measures code units**

File: `daemon/services/git-readonly-toolbox.ts:395,454`

The parameter description reads `"Maximum bytes per file diff before truncation"` but the implementation uses `f.content.length` (UTF-16 code units, not bytes). For ASCII diff output the values are identical, so this produces correct behavior in practice. The plan's Open Question #2 acknowledged this decision. The description is technically inaccurate.

**Recommendation**: Change description to `"Maximum size per file diff before truncation (default: 20480). Set to 0 to disable."` — drop the word "bytes" to avoid the semantic mismatch.

**CONCERN-2 [LOW]: Truncation notice mixes human-readable and raw-number size formats**

File: `daemon/services/git-readonly-toolbox.ts:177-179`

The per-file notice reads `[File diff exceeds 20KB limit (25000)]`. The cap is formatted as `"20KB"` (human-readable) while the actual size is a raw number with no unit. A worker reading this has to infer that `25000` is in the same unit as `20KB`. The total cap notice at line 217 doesn't have this issue because it only shows the cap, not the actual total.

**Recommendation**: Either format actual size as KB too (`"24KB"`) or append a unit label (`"25000 chars"`). Minor readability improvement.

**OBSERVATION-1: `splitDiffByFile` does not handle git's quoted-path format**

File: `daemon/services/git-readonly-toolbox.ts:134`

Git quotes paths containing spaces or special characters: `diff --git "a/path with spaces.ts" "b/path with spaces.ts"`. The regex expects `a/` immediately after `diff --git ` without a quote prefix, so quoted headers would not be matched — the file would bypass per-file capping entirely (fall through to the `fileDiffs.length === 0` branch and return raw output).

Not a spec violation — the spec and plan describe the simple header format. In practice, file paths with spaces are rare in code repositories. Noting for awareness: if this toolbox processes diffs from repositories with unusual paths, oversized files with quoted paths would bypass the safety net.

**OBSERVATION-2: No git_show integration test for `max_file_size: 0`**

There's a `git_diff` integration test for `max_file_size: 0` (line 947) but no equivalent for `git_show`. The code paths are parallel and the unit test for `applyPerFileCap` with 0 covers the function-level behavior. Minor coverage gap.

---

### Phase 2 Review Fix Verification

Dalton addressed three findings from the Phase 2 review:

| Finding | Fix | Verified |
|---------|-----|----------|
| DEFECT-1 [MEDIUM]: Positional assertions for `--no-binary` | Tests at lines 391-395 and 432-435 verify `--no-binary` precedes `--` | **Yes** — assertions use `indexOf` comparison, clear and correct |
| DEFECT-2 [LOW]: Dual-purpose lockfile entry comment | Comment at lines 21-24 explains why exact names appear alongside `*.lock` | **Yes** — comment is accurate and placed at the definition site |
| DEFECT-3 [LOW]: Dead `filePath === dir` clause | Removed from `matchesExclusionPattern` | **Yes** — current code has three branches: wildcard extension, directory prefix, exact basename. No dead code. |

---

### Review file location

Cannot write `.lore/reviews/token-efficient-git-tools-phase3.md` — no file write tool available. Full review content is in this commission result.
