---
title: "Improve token performance of git-readonly tools"
date: 2026-03-29
status: resolved
tags: [git, performance, toolbox, tokens, mcp-tools]
modules: [git-readonly-toolbox]
related:
  - .lore/issues/improve-token-perf-of-git-tools.md
  - .lore/specs/workers/worker-tool-boundaries.md
---

# Brainstorm: Improve Token Performance of Git-Readonly Tools

## Context

A `git show` returned 122MB of output during a worker session. The git-readonly toolbox
(`daemon/services/git-readonly-toolbox.ts`) provides five MCP tools to workers who don't
have Bash: `git_status`, `git_log`, `git_diff`, `git_show`, and `git_branch`. Every tool
currently returns raw git output with no size limits, no binary filtering, and no noise
exclusion. We have full control over these tools and can change what they return.

## Where the Risk Lives

Reading the implementation directly:

**`git_show`** (line 213-229): Runs `git diff-tree --root -p <ref>` — the full patch for
every file in the commit, no filters. This is the 122MB source. Binary files (images,
compiled objects, PDFs), large lockfiles, and generated diffs all pass through verbatim.
Wraps the result in JSON but doesn't inspect size.

**`git_diff`** (line 182-199): Runs `git diff` with no output limits. A request like
`git_diff ref="HEAD~50"` or `git_diff` on a branch with weeks of lockfile churn would
produce equivalent damage.

**`git_log`** (line 160-178): Capped at 20 commits by default, which is fine. Commit
bodies could be long for squashed commits but this is low risk in practice.

**`git_status`** and **`git_branch`**: Return file/branch names only. Inherently bounded.
No risk.

The 122MB case was almost certainly one of:
- A commit that added or modified binary files (images, compiled artifacts, fonts)
- A `bun.lockb` or `package-lock.json` change after adding many dependencies
- A `git_diff` against a ref spanning a large refactor with lockfile changes

All three scenarios hit the same unguarded path.

## Ideas Explored

### Idea 1: Hard Size Cap with Truncation Notice

Cap diff output at a byte limit (e.g. 100KB). If output exceeds the cap, return what fits
plus a structured notice:

```
[Diff truncated at 100KB. 3 more files not shown.
Use git_diff with file="<path>" to inspect specific files.]
```

**What works:** Simple to implement, universal safety net, always fires before context
damage occurs.

**What doesn't:** Truncates mid-file, which produces a partial diff that's often useless.
The worker sees half of a change and can't tell which files were cut. The truncation notice
is better than nothing but it doesn't tell the worker *which* files were worth reading.

**Better form:** Truncate at a file boundary, not a byte count. If the output exceeds the
cap, stop including files and list the remaining files by name. Now the worker can make an
informed choice about what to fetch next.

---

### Idea 2: Binary File Exclusion

Pass `--no-binary` to diff-producing commands. Git replaces binary patch content with a
two-line note (`Binary files a/foo.png and b/foo.png differ`), keeping the file presence
visible without dumping the binary data.

For `git show`: add `--no-binary` to the `diff-tree` call.
For `git diff`: add `--no-binary` to the diff call.

**What works:** This is the single highest-leverage change. If the 122MB case was a
binary, this collapses it to a few bytes per binary file. It's always correct — no AI
reasoning is possible on binary patch data anyway. A worker who genuinely needs to know
whether a binary changed still gets that signal ("Binary files a/logo.png and b/logo.png
differ").

**What doesn't:** Binary files that are text-parseable (some `.lock` formats, SVG, large
JSON) won't be caught by this — git only classifies as binary if the file contains null
bytes. The lockfile problem needs separate handling.

**Variant:** Add an `include_binary: true` parameter for the rare case where a worker
explicitly needs binary content (checking if an asset was replaced).

---

### Idea 3: Lockfile and Generated File Exclusion

Maintain a built-in exclusion pattern list for high-noise, near-zero-signal files. Apply
these as `pathspec` exclusions appended to diff commands:

```
':!*.lock'
':!package-lock.json'
':!yarn.lock'
':!bun.lockb'
':!*.min.js'
':!*.min.css'
':!dist/'
':!build/'
':!.next/'
':!__pycache__/'
':!*.pyc'
```

Passing these to `git diff-tree` and `git diff` is straightforward — git pathspecs with
`:(exclude)` patterns work on all versions that matter.

**What works:** Lockfile diffs are the most common source of noise in this codebase. Adding
`bun install` produces a `bun.lockb` change that could be hundreds of KB. There is no
scenario where a worker needs to read a lockfile diff — the relevant signal is which
*package* changed, which the commit message or `package.json` diff provides.

**What doesn't:** Pattern lists need maintenance. A new build system introduces a new
generated file format; the list gets stale. Also, there are legitimate lockfile commits
(debugging a dependency resolution) where seeing the change is meaningful.

**Variant:** Add an `include_generated: true` parameter to bypass the exclusion list.
Log which files were excluded so the worker can see what was filtered.

---

### Idea 4: Diff Stat First, Drill Down Second

Change `git_show` to return commit metadata + diff stat by default, not the full patch.
The stat shows file names and line counts (e.g. `src/foo.ts | 42 ++++----`), which gives
the worker a map of what changed without the content. The worker then calls
`git_diff ref="<sha>^..<sha>" file="<path>"` for specific files that matter.

```typescript
// Current git_show returns:
{ hash, author, date, subject, body, diff: "<full patch>" }

// Proposed git_show returns:
{ hash, author, date, subject, body, stat: "src/foo.ts | 42 ++++----\n...", total_files: 7 }
```

**What works:** Eliminates the token problem structurally — the default call is always
cheap. Workers build a mental model from the stat before deciding what to read. This is
actually how human developers review commits: look at the file list first, then read
specific files.

**What doesn't:** Requires more tool calls to understand a commit fully. If a worker wants
to review a three-file commit, it now takes one `git_show` plus three `git_diff` calls. In
typical use, workers often call `git_show` to see the full change; the workflow disruption
may be more friction than the problem justifies.

**Variant:** Add a `diff` parameter to `git_show` with values `"none"`, `"stat"` (default),
and `"full"`. Stat is the default; workers opt into full when needed. The parameter name
makes the intent explicit and searchable in commission transcripts.

---

### Idea 5: Per-File Size Limits in Multi-File Diffs

When returning a multi-file diff, cap the output *per file* rather than globally. If a
single file's diff exceeds a threshold (e.g. 20KB), replace it with a summary:

```
--- a/package-lock.json
+++ b/package-lock.json
@@ [File diff exceeds 20KB limit (487KB). Use git_diff with file="package-lock.json" to view.] @@
```

Other files in the same diff continue to render normally.

**What works:** The worker gets full diffs for all the source files they care about, and
only the giant lockfile gets summarized. No information about the interesting files is lost.
The notice is file-specific, actionable, and doesn't disrupt the rest of the output.

**What doesn't:** Requires parsing the diff output to split it by file, then measuring each
segment. This is more implementation work than a simple size cap. Git's diff output format
is well-defined (`diff --git a/... b/...` headers), so splitting is feasible but nontrivial.

---

### Idea 6: Configurable Limits in Tool Parameters

Expose control through tool parameters:

```typescript
git_show(ref, { max_diff_lines: 500, include_binary: false, include_generated: false })
git_diff(ref, file, { max_lines: 500, include_binary: false })
```

**What works:** Workers can explicitly request the data they need. An illuminator worker
looking at an image asset change could pass `include_binary: true`. A steward auditing
lockfile changes could pass `include_generated: true`.

**What doesn't:** Workers don't always know in advance that they're about to get a giant
diff. The 122MB case was presumably unexpected — the worker asked for a commit and got
everything. Making the safe path opt-in means the protection depends on the worker's
foreknowledge of the repo's contents.

**The right role for configurability:** Parameters should widen defaults, not replace them.
The safe behavior should be the default; parameters let workers unlock more when they know
they need it.

---

## What Other AI Tools Do

**Cursor** excludes binary files from indexing and applies a `.cursorignore` for large
generated files. When showing diffs, it uses file-size thresholds and skips files above
the limit entirely (not truncation mid-file).

**Claude Code** (our own shell) applies hard read limits with a truncation message for
large files, shows a line count notice, and suggests using `offset` and `limit` parameters
to read in chunks.

**Aider** maintains a hardcoded exclusion list similar to Idea 3: lockfiles, `dist/`,
`build/`, `*.min.*`, and binary extensions. It also respects `.aiderignore`. The exclusions
are aggressive by default and can be overridden with flags.

**GitHub Copilot CLI** uses `git diff --stat` as its default summary and only requests
full diffs for specific files when prompted. The stat-first approach maps directly to
Idea 4.

The common pattern: binary exclusion is universal (every tool does it), lockfile exclusion
is near-universal, and size caps are the fallback when the first two miss something.

## Recommended Direction

These three layers together cover the 122MB case and most variants of it:

**Layer 1: Binary exclusion (always on)**
Pass `--no-binary` to all diff-producing commands. Zero information loss for AI reasoning,
high impact for binary-heavy commits. No override needed as a baseline; add
`include_binary: true` for completeness.

**Layer 2: Generated file exclusion (always on, overridable)**
Apply a built-in exclusion list targeting lockfiles and build artifacts. Make the excluded
file list visible in the output when files are filtered. Add `include_generated: true` to
bypass for explicit use cases.

**Layer 3: Per-file size cap (safety net)**
After applying layers 1 and 2, if any individual file's diff still exceeds a threshold
(proposed: 20KB per file, 200KB total), replace its diff content with a summary note and
list the overage. This catches cases the first two layers don't: unusually large source
files, generated files that don't match known patterns, SVG/data files that aren't binary.

The per-file cap in Layer 3 is better than a global cap because it preserves the full diff
for small files and only truncates the outliers. The worker sees complete diffs for the
five TypeScript files in a commit and a notice for the 300KB SVG.

## Open Questions

**Threshold values.** 20KB per file and 200KB total are guesses. What does a typical
meaningful file diff look like in this repo? A large TypeScript file changed substantially
might be 5-10KB. The limits should be calibrated so normal source changes pass through
unchanged.

**Exclusion list scope.** The list in Idea 3 covers the obvious cases for a Bun/Node
project. This codebase is TypeScript-only today, but the guild is used on other projects.
Should the exclusion list be hardcoded in the toolbox, or should it be configurable at
the guild level (e.g., in `config.yaml`)?

**Should `git_show` get the `diff` parameter?** Idea 4's stat-first approach is the most
structurally correct, but it changes the tool's behavior. If a commission currently relies
on `git_show` returning the full patch, it breaks. The layers approach (Ideas 1-3) is
backwards compatible — workers get the same data, just with noise removed. Worth deciding
whether behavior change or backwards compatibility is the priority here.

**Visibility of filtered content.** When files are excluded, does the worker see a list of
what was filtered and why? This is useful for debugging unexpected gaps but adds output
tokens. A compact one-line summary per filtered file seems right: `[3 files excluded:
bun.lockb (lockfile), ...]`.
