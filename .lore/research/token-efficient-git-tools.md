---
title: "Token-Efficient Git Tool Output: Industry Landscape"
date: 2026-03-29
status: resolved 
tags: [git, tokens, mcp-tools, toolbox, performance]
related:
  - .lore/brainstorm/improve-token-perf-git-tools.md
  - .lore/issues/improve-token-perf-of-git-tools.md
---

# Token-Efficient Git Tool Output: Industry Landscape

Research conducted March 2026. Covers AI coding tools, MCP servers, and community patterns for
reducing token cost from git diff and log output.

---

## What AI Coding Tools Actually Do

### Aider

Aider uses `.aiderignore` (gitignore syntax) to control which files are included in its
repository map and chat context. This is a **context selection** mechanism, not a diff
filtering mechanism — it determines what files are available to work on, not how diffs are
presented once requested.

At the diff tool level, Aider does not appear to perform automatic lockfile filtering or
per-file size caps. The tool relies on users to curate context explicitly. The docs note that
"indiscriminately adding many files tends to distract or confuse the LLM."

**What Aider does well:** The `.aiderignore` + `.gitignore` pattern for excluding irrelevant
files from the working set is clean and well-understood. This is upstream prevention, not
downstream truncation.

Source: [Aider FAQ](https://aider.chat/docs/faq.html), [Git Integration](https://deepwiki.com/Aider-AI/aider/4.3-git-integration)

---

### Cursor

Cursor has a `.cursorignore` file for indexing exclusions. For git diff in chat context (the
"Diff With Main Branch" feature), there is a **known bug**: when the diff is large enough,
Cursor silently doesn't send it to the model at all. The model receives nothing rather than a
truncated version or a summary.

This is the worst-case outcome — the agent proceeds without the information it asked for, with
no indication that it's missing something.

Source: [Cursor Forum Bug Report](https://forum.cursor.com/t/git-context-diff-with-main-branch-does-not-send-to-model-for-large-diffs/139281)

---

### Cline

Cline implements two relevant behaviors:

1. **Binary file filtering**: Removes lines containing 'Binary files' or 'differ' from diff
   output before sending to the model. Excludes binary files without extensions.

2. **Duplicate read deduplication**: When the same file is read multiple times in a session,
   Cline replaces redundant content with `[DUPLICATE FILE READ]` — a clean pattern for
   preventing context bloat from repeated reads.

Cline does not implement per-file diff size caps. Context overflow is a known pain point;
users hitting token limits must start new tasks, losing all progress.

Source: [Cline Context Management Analysis](https://medium.com/@balajibal/dissecting-cline-cline-context-management-260aec3d84cb), [Cline Discussion #526](https://github.com/cline/cline/discussions/526)

---

### Claude Code

Claude Code's file read tool has truncation with `offset` and `limit` parameters and a size
notice when files are too large. There is an open issue reporting that Claude Code sends full
file diffs with every file change notification, causing "70%+ passive token overhead" —
the proposal is notification modes (off/auto/manual).

The `/diff` command shows session changes as a unified diff but there is no documented
automatic filtering for git operations.

Source: [Claude Code Issue #9388](https://github.com/anthropics/claude-code/issues/9388)

---

### GitHub Copilot / GitHub MCP Server

GitHub's official MCP server (`github/github-mcp-server`) has a well-documented token problem:
adding the server to Claude Code increased token usage from 34k to 80k **just from tool
definitions** (66+ tools at ~700 tokens each). The team responded with tool consolidation
(e.g., 9 tools merged into 3 across releases v0.17-v0.20).

For diffs specifically: `get_pull_request_diff` fails on large PRs because responses exceed
the 25,000-token limit. An issue (#625) requested pagination, file filtering, and partial
retrieval. The issue was closed without a full implementation — the current workaround is to
use `get_pull_request_files` to enumerate files, then fetch individual file contents.

This is essentially the stat-first / drill-down pattern implemented as a workaround for a
missing feature.

Source: [GitHub MCP Context Issue #1286](https://github.com/github/github-mcp-server/issues/1286), [PR Diff Pagination Issue #625](https://github.com/github/github-mcp-server/issues/625)

---

### Windsurf (Cascade)

Windsurf shows a real-time context window usage meter, which helps users see when they're
approaching limits. The recommended community workaround for large diffs: "use `git diff
--stat` to see progress, then scope a new prompt to specific files." This is a stat-first
approach applied manually rather than built into the tool.

Source: [Windsurf Changelog](https://windsurf.com/changelog)

---

## MCP Servers for Git Operations

### Official MCP Git Server (modelcontextprotocol/servers)

Provides `git_diff`, `git_show`, `git_status`, `git_log`, `git_branch` tools with only a
`context_lines` parameter (default 3). **No size limits, no truncation, no binary filtering.**
This is the baseline all other implementations are measured against — and it has the same
unguarded paths as the guild-hall git-readonly toolbox.

Source: [MCP Servers GitHub](https://github.com/modelcontextprotocol/servers)

---

### Bitbucket Server MCP

The most sophisticated diff-handling implementation found in the research. Key feature:
`maxLinesPerFile` parameter on the `get_diff` tool.

When a file exceeds the limit:
1. File headers and metadata are always preserved
2. First 60% of allowed lines (from beginning)
3. Truncation message with file statistics
4. Last 40% of allowed lines (from end)
5. Indication of how to see the complete diff

The limit defaults to the `BITBUCKET_DIFF_MAX_LINES_PER_FILE` environment variable, or can
be passed per-call. Setting to 0 disables the limit.

The 60%/40% split is interesting — it attempts to preserve both the beginning of the file
(imports, class declarations, context) and the end (where the change might be).

Source: [Bitbucket Server MCP on MCP Servers](https://mcpservers.org/servers/garc33/bitbucket-server-mcp-server)

---

### diffchunk MCP

Purpose-built for AI navigation of large diffs. Solves the problem structurally rather than
through truncation: instead of returning a truncated diff, it provides tools to *navigate*
a diff file.

Five tools:
- `load_diff` — parse a diff file
- `list_chunks` — overview of chunks with file mapping and per-file line counts
- `get_chunk` — retrieve a specific chunk
- `find_chunks_for_files` — locate chunks by file pattern
- `get_file_diff` — get the complete diff for a single file

Default configuration:
- `max_chunk_lines`: **1,000** (default)
- `skip_trivial`: **true** (whitespace-only changes)
- `skip_generated`: **true** (lockfiles, build artifacts)

Handles 100k+ line diffs efficiently. This is the stat-first / drill-down pattern implemented
as a proper MCP tool.

Source: [diffchunk on MCP Servers](https://mcpservers.org/servers/peteretelej/diffchunk)

---

### cyanheads/git-mcp-server

Has `minimal/standard/full` verbosity levels via the `MCP_RESPONSE_VERBOSITY` environment
variable. JSON output format is labeled "LLM-optimized." No specific diff truncation
thresholds are documented.

Source: [cyanheads/git-mcp-server](https://github.com/cyanheads/git-mcp-server)

---

## Standalone Token-Reduction Tools

### rtk (Rust Token Killer)

A CLI proxy that intercepts shell commands and rewrites output to compact summaries before
the output reaches the LLM. Achieves **60-90% token reduction** across common dev commands.

For git operations:
- `git diff`: ~21,500 tokens → ~1,259 tokens (**94% reduction**) by converting patch output
  to file-level statistics (+/- counts per file, no hunks)
- `git log`: ~1,430 tokens → ~194 tokens (86% reduction)
- `git status`: ~120 → ~30 tokens (75% reduction)

Design principle: fail-safe. If filtering fails, fall through to original output. Verbose
flags (`-v`, `-vv`, `-vvv`) expose progressively more detail.

This is the stat-first pattern as the *default* output mode. The full patch is never returned
unless explicitly requested.

Source: [rtk-ai.app](https://www.rtk-ai.app/), [rtk Architecture](https://github.com/rtk-ai/rtk/blob/master/ARCHITECTURE.md)

---

## Threshold Values in Use

| Source | Per-File Cap | Total Cap | Notes |
|--------|-------------|-----------|-------|
| GitLab | 500KB (configurable) | 500KB collection | Collapses at 5,000 lines, hard stop at 50,000 |
| diffchunk MCP | 1,000 lines (default) | — | Per chunk, configurable |
| Bitbucket Server MCP | configurable | — | `BITBUCKET_DIFF_MAX_LINES_PER_FILE` env var |
| rtk | No per-file cap; converts to stats | ~1,259 tokens for full diff | Stat-only output |
| Claude Large Diff Processor | 500 lines | — | For summary generation, community tool |
| GitHub MCP | No cap (broken for large PRs) | Fails at ~25k tokens | Open issue |
| Official MCP git server | None | None | No limits at all |

The brainstorm's proposed **20KB per-file / 200KB total** is consistent with the upper range
of what GitLab uses (500KB collection limit would be about 125,000 tokens at ~4 chars/token,
which is too large; 20KB per file ≈ 5,000 tokens is more realistic for agent use).

However: diffchunk's **1,000 lines** per chunk is the most widely-tested threshold found. At
an average of ~50 chars per line, 1,000 lines ≈ 50KB. The brainstorm's 20KB is tighter than
this and probably appropriate for individual file caps when total output needs to stay small.

A **calibration check**: a significant refactor of a 400-line TypeScript file might produce
200-400 lines of diff output (≈ 8-16KB). The 20KB per-file cap passes this without
truncation. A `bun.lockb` change could be 50,000+ lines; it gets caught by binary exclusion
before hitting the cap.

---

## Stat-First / Drill-Down: Validation

The stat-first approach has strong validation from adjacent patterns:

**rtk evidence**: converting `git diff` to stat-style output reduces tokens by 94% while
preserving actionable information (which files changed, by how much). Agents can then
request specific file diffs.

**Progressive disclosure evidence**: CartoGopher's pattern (repo map → architecture →
package → symbol → source) reduces query tokens by 40-95% depending on the question. The
principle transfers directly to git: commit stat → specific file diff.

**Copilot workaround evidence**: The GitHub MCP Server's recommended workaround for large PR
diffs is exactly this pattern: `get_pull_request_files` first, then individual file fetches.

**Windsurf community pattern**: Users manually run `git diff --stat` and then scope their
next prompt to specific files when hitting context limits.

**Counter-evidence**: None found. No tool that tried stat-first and reverted to full-patch
default. The pattern works.

**Adoption as default**: Still not common as a built-in tool default. The official MCP git
server, Aider, and most others still return full patches. This represents an opportunity for
differentiation.

---

## Exclusion Patterns: Community Standard

The industry has converged on a pattern: **tool-specific ignore files** using gitignore syntax.
- Aider: `.aiderignore`
- Cursor: `.cursorignore`
- Claude Code: `.claudeignore`
- Android Studio / Gemini: `.aiexclude`
- Cline/Roo: `.rooignore`
- Codex: `AGENTS.md`

There's also [agent-ignore](https://github.com/wsAndy/agent-ignore) which provides community
templates in the spirit of gitignore.io.

For **diff-specific** exclusion, the community uses `.gitattributes` with `diff` attribute:
```
package-lock.json diff=
yarn.lock diff=
bun.lockb diff=binary
```
This suppresses diffs at the git level rather than at the tool level. The advantage: works
everywhere git is used, not just with AI tools.

**Commonly agreed-upon exclusion patterns** (from diffchunk's skip_generated, rtk's filtering,
community `.gitattributes` examples):
- **Lockfiles**: `*.lock`, `package-lock.json`, `yarn.lock`, `bun.lockb`, `poetry.lock`,
  `Gemfile.lock`, `composer.lock`, `Cargo.lock`
- **Minified**: `*.min.js`, `*.min.css`
- **Build artifacts**: `dist/`, `build/`, `.next/`, `out/`, `target/`
- **Cache**: `__pycache__/`, `.cache/`, `node_modules/`
- **Compiled**: `*.pyc`, `*.o`, `*.class`, `*.wasm`

**Hardcoded vs. configurable**: The industry norm is hardcoded defaults + user override.
diffchunk has `skip_generated: true` as a default but the user can configure it. Bitbucket
MCP has an env var for the per-file cap. Aider has `.aiderignore`. No major tool requires
users to build the exclusion list from scratch.

The guild-hall toolbox should follow this norm: built-in defaults for the obvious patterns
(bun/Node-centric for this project), with an `include_generated: true` parameter to bypass.

---

## Communicating Filtered Content Back to the Agent

Patterns found in the research:

**Best pattern (Bitbucket MCP):**
```
File headers preserved
[First 60% of lines]
--- Truncated: 847 lines omitted. File has 1,200 total lines. Use get_diff with file="path/to/file" to view complete diff. ---
[Last 40% of lines]
```
This shows *where* the truncation happened and how to recover.

**Structural navigation (diffchunk):**
`list_chunks` returns a table of file names and line counts. The agent sees what's in the diff
before reading any of it — then uses `get_file_diff` for specific files. No truncation message
needed; the navigation pattern is the message.

**Compact notice (brainstorm Idea 5 variant):**
```
--- a/package-lock.json
+++ b/package-lock.json
@@ [File excluded: lockfile (487KB). Use git_diff with file="package-lock.json" to view.] @@
```
This preserves the diff format so the output reads naturally, with the exclusion in context.

**What doesn't work:**
- Silent dropping (Cursor bug): agent doesn't know it's missing something
- Byte-boundary truncation: partial file diff is often worse than no diff
- Generic "diff too large" messages without file names or counts

**Recommendation**: The compact notice pattern — file-specific, format-preserving, actionable
— is the right pattern for the guild-hall case. When a file is excluded or capped:
1. Show the file header (so the agent sees the file was part of the commit)
2. Replace the hunk content with a single `@@` block containing the reason and the recovery
   action
3. At the end of all output, add a one-line summary: `[3 files excluded: bun.lockb (lockfile),
   ...]`

---

## Novel Approaches

### Structural Diffing (Difftastic / tree-sitter)

Difftastic parses source files as ASTs and diffs at the expression level. Ignores formatting,
whitespace, and comment changes. The claim: "models focus on substantial code modifications
rather than being overwhelmed by irrelevant changes."

This is **semantically meaningful filtering** rather than size filtering. A reformatted file
that's unchanged at the AST level produces zero output; a one-line logic change in a
heavily-commented file produces a small, clean diff.

Practical limitation: requires a difftastic installation and is language-specific (supports
30+ languages but not all). Adds external dependency. Not currently used in any major AI
tool's git integration.

Source: [Difftastic](https://difftastic.wilfred.me.uk/), [baz.co article](https://baz.co/resources/building-an-ai-code-review-agent-advanced-diffing-parsing-and-agentic-workflows)

### Cachebro MCP (Diff-Based Caching)

Uses diffs as a memory mechanism: stores file state, serves compact diffs of what changed
since last read rather than full file content on repeat reads. Claims 26% token reduction.

The insight: once an agent has read a file, subsequent reads are just "what changed" — which
is much smaller than the full content.

Source: [glommer-cachebro](https://github.com/iflow-mcp/glommer-cachebro)

### Code Knowledge Graph / AST Navigation

CartoGopher (and similar tools) build a graph of the codebase and expose progressive-disclosure
tools. For diffs, the equivalent would be: "which symbols changed" rather than "which lines
changed." An agent could ask "what functions changed in this commit" and get a 5-line answer
rather than a 500-line diff.

This is a further evolution of the stat-first pattern. Not yet implemented in any mainstream
git tool, but the pattern is validated in code comprehension contexts.

Source: [Context compression article](https://medium.com/@jakenesler/context-compression-to-reduce-llm-costs-and-frequency-of-hitting-limits-e11d43a26589)

---

## Answers to the Brainstorm's Open Questions

### What are good threshold values?

Based on research:
- **Per-file cap: 20KB** is appropriate. This is ~5,000 tokens, passes substantial source
  file changes (200-400 line diffs), and catches the problem cases. diffchunk's 1,000-line
  default is ~50KB — probably too permissive for the guild-hall case where total output
  matters.
- **Total output cap: 100KB** is a safer ceiling than the brainstorm's 200KB. After binary
  exclusion and generated file exclusion, the residual cases hitting this cap are large
  generated text files or unusual repos. 100KB ≈ 25,000 tokens, which is what GitHub MCP
  server users reported hitting before the system broke.
- **For stat-first default on `git_show`**: the stat output for even a 50-file commit is
  usually under 2KB. The approach is inherently bounded.

### Should exclusion lists be hardcoded or configurable?

The industry norm is: **hardcoded defaults + user override via ignore file**. No major tool
requires users to build the list from scratch. The guild-hall approach should:
1. Ship a built-in list covering Bun/Node patterns (bun.lockb, package-lock.json, yarn.lock,
   dist/, .next/, etc.)
2. Provide `include_generated: true` to bypass for specific calls
3. The list should be visible in tool documentation so workers know what gets filtered

Hardcoded lists do go stale (new build tools, new lock file formats), but the alternative —
requiring all workers to configure exclusions — is worse. Update the list when new patterns
are encountered.

### Is the stat-first approach worth the breaking change?

The research validates stat-first strongly. rtk achieves 94% token reduction by doing exactly
this. The workarounds used by Copilot and Windsurf users are exactly this pattern, applied
manually.

**The key question is framing.** If `git_show` returns stat by default and workers must opt
into full patches, they can always get what they need — they just need one more tool call. The
122MB incident wouldn't have happened.

The brainstorm's Idea 4 variant — a `diff` parameter with `"none"/"stat"/"full"` — threads
the needle: stat is the default, but workers who know they want the full patch can request it.
This is backwards-compatible in spirit (stat is a superset of nothing and a useful substitute
for most use cases) while being technically a breaking change for workers that assumed
`git_show` always returns a diff.

**Recommendation**: worth the breaking change. Annotate it clearly in the toolbox changelog.

### How should filtered content be communicated?

The Bitbucket MCP's approach is the most sophisticated found. For the guild-hall toolbox,
the compact notice pattern is preferable:
- In-place file-specific notices preserve the diff format
- A summary line at the end lists what was filtered and why
- Each notice includes the recovery action (which tool call to make)

The critical anti-pattern to avoid: Cursor's silent drop. The worker should *always* know
when output was filtered, and should have a clear path to get the complete content.

---

## Sources

- [rtk (Rust Token Killer)](https://www.rtk-ai.app/) — stat-style git diff compression
- [rtk Architecture](https://github.com/rtk-ai/rtk/blob/master/ARCHITECTURE.md)
- [diffchunk MCP server](https://mcpservers.org/servers/peteretelej/diffchunk)
- [Bitbucket Server MCP](https://mcpservers.org/servers/garc33/bitbucket-server-mcp-server)
- [GitHub MCP Server excessive context issue](https://github.com/github/github-mcp-server/issues/1286)
- [GitHub MCP PR diff pagination issue](https://github.com/github/github-mcp-server/issues/625)
- [Cursor large diff bug](https://forum.cursor.com/t/git-context-diff-with-main-branch-does-not-send-to-model-for-large-diffs/139281)
- [Cline context management analysis](https://medium.com/@balajibal/dissecting-cline-cline-context-management-260aec3d84cb)
- [Cline diff discussion](https://github.com/cline/cline/discussions/526)
- [Claude Code token notification issue](https://github.com/anthropics/claude-code/issues/9388)
- [Official MCP git server](https://github.com/modelcontextprotocol/servers)
- [cyanheads git-mcp-server](https://github.com/cyanheads/git-mcp-server)
- [Aider FAQ](https://aider.chat/docs/faq.html)
- [Aider git integration (DeepWiki)](https://deepwiki.com/Aider-AI/aider/4.3-git-integration)
- [Difftastic](https://difftastic.wilfred.me.uk/)
- [baz.co AI code review with difftastic](https://baz.co/resources/building-an-ai-code-review-agent-advanced-diffing-parsing-and-agentic-workflows)
- [GitLab diff limits documentation](https://docs.gitlab.com/development/merge_request_concepts/diffs/)
- [agent-ignore templates](https://github.com/wsAndy/agent-ignore)
- [cachebro MCP (diff-based caching)](https://github.com/iflow-mcp/glommer-cachebro)
- [Context compression article](https://medium.com/@jakenesler/context-compression-to-reduce-llm-costs-and-frequency-of-hitting-limits-e11d43a26589)
- [Windsurf changelog](https://windsurf.com/changelog)
