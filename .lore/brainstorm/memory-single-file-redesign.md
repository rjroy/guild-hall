---
title: "Memory System Redesign: Single File Per Scope"
date: 2026-03-17
status: open
tags: [memory, architecture, toolbox, agent-ux, file-structure]
modules: [daemon/services/memory-injector, daemon/services/memory-compaction, daemon/services/base-toolbox]
related:
  - .lore/brainstorm/commission-outcomes-to-memory.md
  - .lore/research/agent-memory-systems.md
---

# Brainstorm: Memory System Redesign

## Context

The current memory system stores one file per memory entry per scope, plus a `MEMORY.md` index and a `_compacted.md` summary. Three scopes (global, project, worker) work well as a concept, but the implementation creates friction:

1. **File bloat.** Each `write_memory` call creates a new file. A worker that saves five memories in one session produces five files. Over dozens of sessions, directories grow to 20-30 files. The injector (`memory-injector.ts:59-87`) reads every file, stats every file, sorts by mtime, applies a budget. More files means more I/O and more context consumed by filenames in the injected block.

2. **Compaction produces odd results.** The compaction system (`memory-compaction.ts:148-183`) feeds all files to an LLM and asks for a condensed summary. The prompt is generic ("remove redundancy and outdated entries"). The LLM doesn't know which facts are load-bearing and which are stale. It sometimes drops specifics (file paths, config values) that matter and keeps generalities that don't. The user has observed this directly.

3. **The index is maintenance overhead.** Claude Code's auto-memory system (visible in this conversation's own system prompt) uses `MEMORY.md` as an index pointing to individual files. Every memory write requires a two-step process: write the file, then update the index. If the index and files drift, the system is inconsistent. The index exists because the system needs to know what's there without reading every file, but with a single file per scope, the file *is* the index.

The user's proposed direction: collapse to one file per scope, add section-level editing (`edit_memory`), and potentially eliminate compaction as a separate process.

### Claude Code auto-memory as a reference point

This conversation itself runs under Claude Code's auto-memory system. Its structure:

- Single `MEMORY.md` index at a project path, pointing to individual `.md` files
- Each file has frontmatter (name, description, type) and content
- Types: user, feedback, project, reference
- Compaction into `_compacted.md` summarizes old entries

**What works:** The type taxonomy (user/feedback/project/reference) helps agents decide what to save. The frontmatter `description` field enables relevance matching without reading full content.

**What doesn't:** The index is another thing to maintain. File proliferation is the same problem Guild Hall has. The two-step write (file + index) is a failure mode: index says a file exists but it doesn't, or a file exists but isn't in the index. And compaction via LLM is the same quality gamble.

---

## Proposal 1: Single Markdown File Per Scope

### Evidence

The memory injector (`memory-injector.ts:59-87`) reads a directory of files, but what it produces is a single markdown block (`memory-injector.ts:130-143`). The input is many files; the output is one string. The intermediate step (directory listing, stat calls, mtime sorting) is overhead that exists because the storage is disaggregated.

The compaction system (`memory-compaction.ts`) exists to solve a problem that disaggregated storage creates. If memory were already consolidated, there'd be less to compact.

### Proposal

Replace the per-scope directory of files with a single markdown file per scope:

- `~/.guild-hall/memory/global.md`
- `~/.guild-hall/memory/projects/{projectName}.md`
- `~/.guild-hall/memory/workers/{workerName}.md`

Each file is structured markdown with `##` headers as section boundaries. Within each section, content is free-form markdown. The file *is* the memory. No index, no separate compacted file.

### Proposed file structure

```markdown
## User

Senior engineering manager, Epic Games. Manages EOS SDK team.
Prefers concise communication, no em-dashes.

## Feedback

Integration tests must hit real databases, not mocks.
**Why:** prior incident where mock/prod divergence masked a broken migration.

Don't summarize what you just did at the end of responses.

## Project

Merge freeze begins 2026-03-05 for mobile release cut.
**Why:** mobile team cutting a release branch.

Auth middleware rewrite driven by legal/compliance, not tech debt.

## Reference

Pipeline bugs tracked in Linear project "INGEST".
Grafana board at grafana.internal/d/api-latency is the oncall dashboard.
```

**Why `##` headers and not something else?** Section headers are native markdown. They're human-readable, tool-parseable, and the agent doesn't need to learn a custom format. The current memory types (user, feedback, project, reference) map directly to sections. Agents already know these types from the auto-memory instructions.

### Rationale

This eliminates file proliferation, the index, and the need for directory listing I/O. The injector becomes: read one file, inject it. The write path becomes: parse the file, find or create a section, update it. Compaction may become unnecessary (see Proposal 4).

### Vision alignment

- **Anti-goal check:** Not multi-user, not cloud, not general-purpose, not self-modifying identity. Memory structure is infrastructure. Pass.
- **Principle alignment:** Principle 3 (Files Are the Truth). A single file per scope is still a plain file, inspectable with a text editor, authoritative as storage. Principle 6 (Tools Are Atomic). The `edit_memory` tool is still atomic (reads a section, writes a section). Judgment about *what* to remember stays with the agent.
- **Tension resolution:** Files vs. Performance. A single file read is faster than a directory scan + multi-file read. No tension.
- **Constraint check:** No new dependencies. No provider coupling. No distribution concerns.

### Scope: Medium

Touches `memory-injector.ts`, `base-toolbox.ts`, `memory-compaction.ts`, all memory tests, and the `MEMORY_GUIDANCE` instructions.

---

## Proposal 2: Section-Level `edit_memory` Tool

### Evidence

The current `write_memory` tool (`base-toolbox.ts:71-91`) takes a scope, path, and content, then writes the entire content to a file. With a single file per scope, calling `write_memory` to replace the whole file risks clobbering sections the agent didn't intend to touch. The agent would need to read the full file, modify one section, and write the whole thing back. That's an error-prone read-modify-write cycle that should be encapsulated in a tool.

### Proposal

Replace `write_memory` with `edit_memory` that operates on named sections:

```typescript
tool(
  "edit_memory",
  "Edit a section of the memory file. Operations: 'upsert' (create or replace section content), 'append' (add content to end of section), 'delete' (remove section entirely).",
  {
    scope: z.enum(["global", "project", "worker"]),
    section: z.string(),  // e.g., "User", "Feedback", "Project"
    operation: z.enum(["upsert", "append", "delete"]),
    content: z.string().optional(),  // required for upsert/append
  },
  (args) => editMemory(args),
)
```

**Section identification:** A section is identified by its `##` header text, case-insensitive match. The tool parses the file, finds the section between its `##` header and the next `##` header (or EOF), and operates on that range.

**Operations:**

- **`upsert`**: Replaces the section's content entirely. If the section doesn't exist, creates it at the end of the file. This is the primary operation. An agent that wants to update the "Feedback" section reads the current content (via `read_memory`), composes the new content, and upserts.
- **`append`**: Adds content to the end of an existing section. If the section doesn't exist, creates it with the provided content. Useful for incremental additions like "add this new feedback item."
- **`delete`**: Removes the section and its content entirely.

**Why not finer granularity (line-level, key-value)?** Because memory content is free-form prose, not structured data. Line-level editing requires the agent to know line numbers (brittle) or match exact strings (fragile). Section-level is the right grain: each section is a conceptual unit (all feedback, all project context), and the agent manages the content within it.

### Rationale

Section-level editing encapsulates the read-modify-write cycle in the tool. The agent says "upsert section Feedback with this content" and the tool handles parsing, insertion point, and atomic write. The agent never holds the full file in its output.

### Vision alignment

- **Anti-goal check:** Pass.
- **Principle alignment:** Principle 6 (Tools Are Atomic). `edit_memory` is a mechanical operation (find section, replace content). The agent decides *what* to put in each section. The tool doesn't evaluate, filter, or judge the content.
- **Tension resolution:** None.
- **Constraint check:** No new dependencies.

### Scope: Medium

New tool handler in `base-toolbox.ts`, markdown section parser utility, tests for all three operations plus edge cases (missing file, missing section, concurrent writes).

---

## Proposal 3: Section Names Are Not Fixed to Memory Types

### Evidence

Claude Code's auto-memory system defines four types: user, feedback, project, reference. These map naturally to section headers. But the current Guild Hall memory system doesn't enforce types at all. Workers can write any file with any name. The types exist in the auto-memory instructions (which Guild Hall workers don't receive), not in the tool contract.

### Proposal

Section names are freeform strings, not an enum. The `MEMORY_GUIDANCE` in the system prompt suggests standard sections (`User`, `Feedback`, `Project`, `Reference`), but the tool accepts any section name. An agent working on a music project might create a `Song Catalog` section. An agent doing research might create a `Research Notes` section.

This is consistent with how the current file-based system works: agents can write any filename. The structure is suggested, not enforced.

**Guardrail:** Section names must be non-empty, must not contain newlines, and should be reasonable length (< 100 chars). The tool validates this.

### Rationale

Fixed section names would force all memory content into four buckets, which works for Claude Code's general-purpose context but may not work for domain-specific workers. The vision's Growth Surface item 1 (Domain Independence) explicitly says the system should support non-software domains. A music worker's memory needs are different from a code worker's.

### Vision alignment

- **Anti-goal check:** Pass.
- **Principle alignment:** Principle 6 (Tools Are Atomic). Freeform section names keep judgment with the agent, not the tool. Growth Surface 1 (Domain Independence). Domain-specific workers need domain-specific memory categories.
- **Tension resolution:** None.
- **Constraint check:** No constraints violated.

### Scope: Small

Mostly a design decision. The implementation is: don't restrict the `section` parameter to an enum. Add guidance to `MEMORY_GUIDANCE` suggesting standard sections.

---

## Proposal 4: Eliminate LLM-Based Compaction

### Evidence

The compaction system (`memory-compaction.ts`) exists because disaggregated files accumulate and overflow the 16k budget. It works by: snapshot all files, send to LLM, write summary, delete originals. The LLM call adds latency, cost, and a quality gamble. The user reports that compaction "produces odd results."

The root cause: compaction is a workaround for unbounded file creation. Each `write_memory` call adds a file. Nothing removes files except compaction. So compaction is the garbage collector for a system that creates garbage by design.

With a single file per scope, the accumulation dynamic changes. An `edit_memory upsert` replaces a section's content. The file doesn't grow unboundedly unless the agent keeps appending. The agent, not a background LLM process, is responsible for managing what's in each section.

### Proposal

Remove LLM-based compaction entirely. Instead, the budget enforcement moves to the `edit_memory` tool:

1. After writing, check the file's total size against the memory limit (16k chars).
2. If over budget, return a warning in the tool response: "Memory file is at {N} chars ({P}% of {limit} budget). Consider condensing older entries."
3. The agent decides what to trim. No background LLM call.

The `loadMemories` function (`memory-injector.ts`) simplifies to: read one file per scope, concatenate, check total budget. If the total across three scopes exceeds the limit, inject what fits (global first, then project, then worker) and log a warning. No `needsCompaction` flag, no background trigger.

**What about long-running projects?** Over months, even with upsert, sections can grow. But the agent sees the warning and can choose to condense. This is how humans manage notes: you notice the document is getting long, you reorganize. The agent has the same affordance.

**What if the agent ignores the warning?** Then older content gets dropped from injection (the budget system in `loadMemories` handles this). The file on disk still has everything. When a new session starts, recent sections are injected and old sections are not. This is the same behavior as today (mtime-based dropping), just at section granularity instead of file granularity.

### Rationale

Eliminating compaction removes: an LLM call per compaction cycle, a background process, a concurrency guard, a prompt that's hard to get right, and a class of "odd results." It shifts responsibility from a fallible background process to the agent, who has context about what matters.

### Vision alignment

- **Anti-goal check:** Pass.
- **Principle alignment:** Principle 6 (Tools Are Atomic). Compaction was a "smart tool" that made quality judgments (what to keep, what to drop). Eliminating it returns that judgment to the agent. Principle 3 (Files Are the Truth). The file on disk is always complete. Injection applies a budget, but the file is never destructively summarized.
- **Tension resolution:** Files vs. Performance. The file on disk may grow beyond the injection budget. That's acceptable: the file is the truth, injection is the working set. Same tension, same resolution as today.
- **Constraint check:** Removes a dependency on SDK sessions for infrastructure. That's a simplification, not a new constraint.

### Scope: Medium

Remove `memory-compaction.ts`, its tests, the `needsCompaction` flag, the `triggerCompaction` call site in the activation path. Modify `loadMemories` to read files instead of directories. Add budget warning to `edit_memory`.

---

## Proposal 5: `read_memory` Returns Whole File or Specific Section

### Evidence

The current `read_memory` tool (`base-toolbox.ts:31-69`) operates on a directory tree: list directory, read file. With a single file per scope, listing a directory is meaningless. The tool needs to either return the whole file or a specific section.

### Proposal

Modify `read_memory` to support two modes:

```typescript
tool(
  "read_memory",
  "Read from the memory system. Returns the full memory file or a specific section. Scope: global, project, worker.",
  {
    scope: z.enum(["global", "project", "worker"]),
    section: z.string().optional(),  // if omitted, returns full file
  },
  (args) => readMemory(args),
)
```

- **No section:** Returns the entire file content. The agent sees all sections.
- **With section:** Returns only the content of the named section (between its `##` header and the next `##` or EOF). Returns an error if the section doesn't exist.

**Why support section-level reads?** Because the full file might be large (up to 16k chars). An agent that only needs to check "what's in the Feedback section" shouldn't have to parse the entire file. This also reduces context consumption in the agent's turn.

### Rationale

The `path` parameter on the current `read_memory` is file-system oriented (directory listing, file reading). With a single file, the concept shifts from "navigate a directory tree" to "navigate sections within a document." The `section` parameter is the new `path`.

### Vision alignment

- **Anti-goal check:** Pass.
- **Principle alignment:** Principle 6. Reading is mechanical. The agent decides what to read.
- **Tension resolution:** None.
- **Constraint check:** None.

### Scope: Small

Modify `makeReadMemoryHandler`, add section parsing, update tests.

---

## Proposal 6: Section Parsing Utility with Git-Backed Recovery

### Evidence

All of Proposals 1-5 depend on reliable markdown section parsing. The `edit_memory` tool needs to find a section, replace its content, and write the file atomically. If the parser misidentifies section boundaries or the write fails mid-operation, the file could be corrupted.

The user's question: "Agent writes garbage to a section and corrupts the file? How do you recover?"

### Proposal

**Section parser:** A utility function that takes a markdown string and returns an array of `{ name: string, content: string }` objects. Section boundaries are `## ` at the start of a line (with exactly two `#` characters). Content is everything between one `## ` header and the next (or EOF). Content before the first `## ` header is a "preamble" section with an empty name.

```typescript
interface MemorySection {
  name: string;   // "" for preamble, section header text for named sections
  content: string; // everything between this header and the next
}

function parseMemorySections(markdown: string): MemorySection[];
function renderMemorySections(sections: MemorySection[]): string;
```

**Atomic writes:** The `edit_memory` handler: (1) reads the file, (2) parses sections, (3) modifies the target section, (4) renders sections back to markdown, (5) writes the file. Steps 1-4 are in-memory. Step 5 uses `fs.writeFile` which is atomic on most filesystems (write to temp, rename).

**Recovery via git:** Memory files live in `~/.guild-hall/memory/`, which is outside of any git repository. But the simplest recovery path is the user manually editing the file with a text editor (Principle 3: files are the truth). If an agent writes garbage to the "Feedback" section, the user opens the file, deletes the garbage, saves. Done.

For automated recovery, the system could keep a single backup: before each `edit_memory` write, copy the current file to `{filename}.bak`. If the next read detects corruption (unparseable markdown, empty file where content was expected), restore from `.bak`. But "corruption" is hard to detect mechanically. A file with garbage content is still valid markdown.

**Leaning:** Don't build automated recovery. The file is human-readable. The user is the recovery mechanism. This is consistent with Principle 3: if the user can inspect and edit everything with a text editor, the system doesn't need to protect them from bad data. The system needs to not *create* bad data (atomic writes, section parsing correctness), and when bad data arrives from an agent, the human fixes it.

### Rationale

The section parser is the foundation for all section-level operations. It needs to be correct, tested, and simple. Recovery via human editing is consistent with the file-based architecture. Automated recovery adds complexity for a failure mode (agent writes bad content) that's better addressed by improving agent instructions than by building a safety net.

### Vision alignment

- **Anti-goal check:** Pass.
- **Principle alignment:** Principle 3 (Files Are the Truth). The user can always inspect and fix the file. No opaque recovery mechanism needed.
- **Tension resolution:** None.
- **Constraint check:** None.

### Scope: Small

Section parser utility (~50 lines), tests for edge cases (no sections, preamble only, empty sections, sections with nested markdown headers at `###` or deeper).

---

## Open Questions

1. **Migration path.** Existing memory directories have files in the old format. Should the system auto-migrate on first read (read directory, consolidate into single file, remove old files)? Or require a manual migration step? Auto-migration is simpler for the user but adds a one-time code path that's hard to test in production.

2. **Concurrent writes.** Two commissions for the same project might try to `edit_memory` on the same project-scoped file simultaneously. The current system avoids this by writing to separate files. With a single file, the read-modify-write cycle needs a lock or last-writer-wins semantics. File locking on Unix is advisory. Last-writer-wins risks losing a section update. A simple mutex per scope key (similar to the compaction guard in `memory-compaction.ts:69`) would serialize writes.

3. **Budget enforcement across scopes.** Currently the budget (`memory-injector.ts:226-238`) is consumed in order: global, then project, then worker. With single files, does the injector still need a budget at all? If each file is individually capped at some portion of 16k, the total is bounded. But that forces artificial limits on each scope. Alternatively: inject all three files; if the total exceeds 16k, truncate by dropping the last section(s) of the lowest-priority scope (worker first, then project).

4. **Section ordering.** Should sections have a defined order (e.g., User first, then Feedback, then Project, then Reference)? Or is ordering agent-determined? Defined ordering makes the file predictable for human readers. Agent-determined ordering lets the agent prioritize what it cares about. Leaning: suggest an order in `MEMORY_GUIDANCE` but don't enforce it. The parser doesn't care about order.

5. **Interaction with commission-outcomes-to-memory.** The earlier brainstorm (`.lore/brainstorm/commission-outcomes-to-memory.md`) proposes writing commission outcomes to project memory. With single-file memory, this would `edit_memory append` to a "Recent Outcomes" section in the project memory file. Does that section get pruned automatically, or does the agent manage it? Leaning: the agent manages it, consistent with Proposal 4 (no automatic compaction).

6. **`write_memory` backward compatibility.** Workers in existing commissions have instructions that reference `write_memory`. Should the old tool name be kept as an alias that performs `edit_memory upsert` on a section named after the file path? Or is a clean break better? The user's auto-memory instructions also reference `write_memory`. This is a coordination problem across the system prompt, the tool contract, and any cached worker instructions.

## Next Steps

If the user wants to proceed, the natural next step is a spec that codifies the decisions on structure, tool API, migration, and concurrency. The proposals here form a coherent set (single file + section editing + no compaction), but each open question needs a decision before implementation.

The minimum viable change: Proposal 1 (single file) + Proposal 2 (edit_memory with upsert only) + Proposal 5 (read_memory with section parameter) + Proposal 6 (section parser). This gives the new structure without removing compaction yet. Compaction removal (Proposal 4) can follow once the single-file structure is validated.
