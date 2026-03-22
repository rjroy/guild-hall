---
title: Worker Tool Permissions — Replacing Bash with Narrow Custom Tools
date: 2026-03-22
status: open
tags: [security, permissions, bash, mcp, toolbox, workers, architecture]
modules: [daemon-services, toolbox-resolver, sdk-runner, worker-packages]
related:
  - .lore/specs/infrastructure/sandboxed-execution.md
  - .lore/specs/workers/tool-availability-enforcement.md
---

# Brainstorm: Worker Tool Permissions

## Context

Guild Hall workers are supposed to stay in their lanes. Thorne reviews and doesn't edit. Octavia manages `.lore/` and doesn't touch code. Guild Master coordinates and doesn't write files. Dalton builds and has intentionally wide access. These constraints are real and meaningful — they define what each worker is for.

The problem is Bash. The Claude Agent SDK provides Bash as a built-in tool, and it's a god tool in the literal sense: one tool that contains every command-line tool inside it. The system currently uses two mechanisms to constrain it:

**The sandbox** (`SandboxSettings` in the SDK) would restrict Bash to the worktree and block network calls. But it's commented out in `sdk-runner.ts` line 564, almost certainly because of the sandbox commit failures documented in project memory. Commissions can't `git commit` from sandboxed sessions, and the test environment uses hardcoded `/tmp/` paths that break in the sandbox.

**The `canUseTool` callback** is implemented — workers declare `canUseToolRules` in `package.json`, the resolver builds a callback, and it gets passed to the SDK. But the commission brief says it's "not reliably called." That matches a known pattern: the SDK may bypass the callback for certain tool invocations, and critically, sub-agents spawned via the Task tool create new sessions that don't inherit the callback at all.

The proposed reframe: stop trying to filter Bash. Remove it entirely from workers that don't genuinely need it, and replace it with purpose-built MCP tools that expose only the operations each worker actually requires.

This brainstorm works through the implications for each worker in the roster.

---

## What Bash Is Actually Used For Today

Reading through the current `package.json` files, the actual Bash usage patterns break into four categories:

**git read operations** (Guild Master, Celeste): `git status`, `git log`, `git diff`, `git show`. Read-only. No write-back. Just inspection.

**File system operations in `.lore/`** (Octavia, Celeste, Sienna): `rm .lore/**`, `mkdir .lore/**`, `mv .lore/**`, `cp .lore/**`. Directory and file management within a bounded subtree. None of these require Bash specifically — they're filesystem operations that could be MCP tools.

**Guild Hall CLI commands** (Guild Master, Thorne, Verity, Edmund, Octavia): `guild-hall workspace artifact document list`, `guild-hall system models catalog list`, etc. These are already abstracted commands going through the CLI layer. They could instead be MCP tools that call the same underlying service functions.

**Full Bash with no constraints** (Dalton, Sable): These two workers have Bash in `builtInTools` and no `canUseToolRules`. This is intentional for Dalton. For Sable it's probably also intentional — running test suites requires broad command access.

**The implication**: For all workers except Dalton and Sable, Bash is being used as a transport layer for operations that don't require unrestricted shell access. They need `git log` not "Bash." They need `move_lore_file` not "shell access to call mv."

---

## Ideas Explored

### Idea 1: The `git-readonly` Toolbox for Guild Master

Guild Master needs `git status`, `git log`, `git diff`, `git show`, and `git branch`. Those five operations (plus maybe `git rev-parse` for commit hashes) cover everything coordination-adjacent.

What a `git-readonly` toolbox looks like as MCP tools:

```
git_status()
  → Returns: parsed status output (staged, unstaged, untracked as structured arrays)

git_log(args?: { maxCount?: number; since?: string; author?: string })
  → Returns: array of commits (hash, author, date, subject)

git_diff(args?: { staged?: boolean; ref?: string; file?: string })
  → Returns: unified diff string

git_show(ref: string)
  → Returns: commit object with diff

git_branch(args?: { all?: boolean; remote?: boolean })
  → Returns: array of branch names with current marker
```

None of these have side effects. They wrap subprocess calls to git and return structured data. The toolbox server validates that no write operations are called — it literally doesn't implement `git commit`, `git push`, `git checkout`.

Tradeoff: Guild Master occasionally needs to help create PRs (which implies `gh pr create` or similar). That's a write operation. Options: (a) Guild Master delegates PR creation to Dalton, (b) we add a `create_pr` MCP tool that wraps `gh pr create` with structured params, (c) PR creation is always a human action.

Option (b) is interesting — a `create_pr(title, body, base, head)` tool is bounded and auditable, unlike raw `gh` access.

---

### Idea 2: The `lore-management` Toolbox for Octavia

Octavia manages `.lore/` files: create, read, move, rename, delete markdown files within the `.lore/` directory tree. Currently doing this with `rm`, `mkdir`, `mv` through Bash.

What a `lore-management` toolbox looks like:

```
lore_file_create(path: string, content: string)
  → Creates a file at .lore/<path>
  → Validates: path must be within .lore/, content is markdown
  → Rejects absolute paths or paths with ../

lore_file_move(from: string, to: string)
  → Moves within .lore/ only
  → Creates intermediate directories as needed

lore_file_delete(path: string)
  → Deletes a file within .lore/
  → Rejects anything outside .lore/

lore_dir_create(path: string)
  → mkdir -p within .lore/ only
```

The key property: the server enforces path constraints in code. Not in pattern-matching strings. Not in a callback that might not get called. The `lore_file_create` function calls `path.resolve(loreRoot, userPath)` and rejects anything where the resolved path doesn't start with `loreRoot`. This is a real boundary, not a policy.

Compare to the current state: Octavia's `canUseToolRules` includes `"rm .lore/**"` as an allowed pattern. Bash command pattern matching is not the same thing as a path-validated function. A suffix like `rm .lore/ -rf /etc` wouldn't necessarily match the pattern. More importantly, even if the matching is correct, it depends on `canUseTool` being called, which is the problem we started with.

What Octavia no longer needs: Bash entirely. With `lore-management` MCP tools, she has Write (for artifact bodies), Edit (for in-place edits), Glob, Grep, Read — and lore-management for structural file operations. No Bash.

---

### Idea 3: Read-Only Execution for Thorne Without Shell Access

Thorne reviews code. The description says "inspects everything, alters nothing." Currently Thorne has Bash but it's restricted to guild-hall CLI commands only. Thorne's legitimate Bash uses are: listing artifacts, reading workspace state, perhaps running tests to verify a claim.

Two distinct sub-problems here:

**Sub-problem A: Workspace queries.** Thorne uses `guild-hall workspace artifact document list` and similar. If these became MCP tools (the guild-hall toolbox), Thorne gets them directly without Bash as transport.

**Sub-problem B: Running tests to verify.** If Thorne needs to run `bun test` to validate a claim in a review, that's genuinely a subprocess execution. Options:

- A `run_tests(filter?: string)` MCP tool that can only invoke the project's test runner and returns stdout/stderr. This is bounded — it can run tests but can't run arbitrary commands. The server implementation does `Bun.spawn(["bun", "test", ...(filter ? ["--filter", filter] : [])])`, nothing else.

- A `run_linter(files?: string[])` MCP tool similarly.

- Explicitly prohibit Thorne from running tests. If Thorne encounters a claim that requires test execution to evaluate, she reports the claim with "could not verify: would require test execution." The human verifies.

The third option is worth sitting with. Does Thorne actually need to run tests? The reviewer role says "inspects everything, alters nothing." Inspection is reading. Test execution is side-effectful in the sense that it's compute, not reading. Maybe the contract is: Thorne reads, evaluates statically, and flags "requires execution to verify" as a review finding. Dalton runs things. Sable runs things. Thorne reads.

If we accept that framing, Thorne needs no Bash at all. She reads files (Read, Glob, Grep), queries workspace state (guild-hall MCP tools), and writes review artifacts (Write). Period.

---

### Idea 4: Dalton — The Hard Case

Dalton is the developer. "Builds what is commissioned, from foundation to finishing touch." Development genuinely requires:

- Running the test suite (`bun test`, `bun test tests/specific.test.ts`)
- Running the linter (`bun run lint`)
- Running the type checker (`bun run typecheck`)
- Running builds (`bun run build`)
- Git operations for committing (`git add`, `git commit`, `git status`)
- Package management (`bun add`, `bun install`)
- Debugging: running arbitrary one-off commands to inspect state

The last two items are hard to narrow. "Arbitrary one-off commands to inspect state" is just "Bash." You can't enumerate what debugging might need.

**Option A: Dalton keeps Bash, with sandbox re-enabled.** Fix the sandbox blockers first, then enable the sandbox. Dalton gets Bash but it's filesystem-restricted to the worktree and network-restricted. This is the path the sandboxed-execution spec was building toward before the commit failure blocker appeared. The constraint: fix the underlying sandbox issues (pre-commit hooks, `/tmp/` path hardcoding), don't route around them.

**Option B: Dalton gets a `dev-tools` toolbox.** Cover the known use cases with named tools:

```
run_tests(args?: string[])
run_lint()
run_typecheck()
run_build()
run_script(name: string)  // npm/bun scripts defined in package.json
git_commit(message: string, files?: string[])
git_add(files: string[])
package_install()
package_add(packages: string[], dev?: boolean)
```

What this covers: the routine development cycle. What it doesn't cover: debugging, one-offs, inspecting running processes, running commands that aren't in the predefined list.

**Option C: A `shell` tool that's scope-limited.** Not raw Bash but a `shell(command: string, workdir?: string)` tool where the server applies an allowlist of permitted base commands. Effectively what `canUseTool` was trying to do, but enforced in the MCP server instead of relying on the SDK callback.

**Option D: Accept that Dalton has Bash.** Dalton is the developer. A developer who can't run arbitrary commands during development isn't a developer — they're a code typist. Bash plus the SDK sandbox (once fixed) is the right shape. Dalton is different from other workers by design.

Option D and Option A are the same answer: fix the sandbox, keep Bash for Dalton, accept the risk. The constraint enforcement for Dalton is the sandbox, not tool removal.

Options B and C are interesting but incomplete. A real debugging session might need to inspect network state, check environment variables, read a process list, or run a command the developer didn't anticipate. A fixed allowlist breaks at the first unexpected debugging need.

---

### Idea 5: Sable the Test Engineer

Sable's job is writing and running tests. Currently has full Bash with no constraints. Compared to Dalton, the scope is narrower:

- Running tests: `bun test`
- Looking at test output and coverage
- Checking for test patterns in code
- Maybe running linters to verify test file style

Sable probably doesn't need package management, git commits, or build tools. A `test-tools` toolbox might cover Sable better than raw Bash:

```
run_tests(filter?: string, coverage?: boolean)
run_lint(files?: string[])
```

That said: test engineering is an investigative activity. Sable might need to run specific commands to reproduce a failure, or inspect why a test is flaky. The same debugging problem that applies to Dalton applies here at lower intensity.

A reasonable middle ground: Sable gets a `test-runner` toolbox that wraps `bun test` with structured parameters. For anything else, Sable flags it as "unable to verify without shell access" and the human or Dalton follows up.

---

### Idea 6: Verity and Edmund

**Verity** (researcher) has Bash restricted to guild-hall CLI commands only. The entire Bash usage is as transport for CLI calls. If those CLI commands became MCP tools, Verity needs no Bash. Verity's real toolset is WebSearch, WebFetch, and the guild-hall workspace query tools. Bash is vestigial.

**Edmund** (steward) uses `guild-hall **` broadly — project maintenance, cleanup, organizational tasks. This is wider than the others. Edmund might need to reorganize artifacts, run project management scripts, or trigger rebase/sync operations.

Some of Edmund's needs map cleanly to existing daemon API endpoints (rebase, sync, project registration). Others might not. Edmund is a maintenance worker; if the maintenance operations expand beyond what the CLI exposes, Edmund needs either Bash or a broad administrative MCP toolbox.

One option: Edmund gets a `steward-tools` MCP toolbox that wraps the daemon's admin endpoints directly, bypassing the CLI transport layer. This is cleaner than Bash-as-transport and still bounded.

---

### Idea 7: The Escape Hatch Question

Is there ever a legitimate case for unrestricted shell access?

Yes, and it's Dalton.

A developer needs to debug a failing build. The debugging session surfaces a problem with a compiled binary. Dalton needs to run `nm`, `objdump`, `ldd`, or something else in the platform toolchain. That's not in any predefined list. An enumerated toolbox breaks exactly here.

The escape hatch exists and it's called Bash. The question is what constraints apply to it. The SDK sandbox (filesystem write restriction to worktree, network restriction) is the right constraint. The problem is the sandbox isn't working reliably enough to enable.

Two directions on the escape hatch:

**Direction A: Earn the escape hatch by fixing the sandbox.** The sandbox is the right tool. The commit failure and `/tmp/` path issues are implementation bugs, not architectural failures. Fix them, re-enable the sandbox, and Bash in a sandboxed session is an acceptable escape hatch.

**Direction B: Don't give any worker an escape hatch.** All workers get narrow tools. If a task genuinely requires arbitrary shell access, the human runs the command and reports back. Workers request ("I need to run X to verify Y") and humans execute. This is more conservative and more work for the human.

Direction A is right for Dalton. Direction B is appropriate for all other workers.

---

### Idea 8: Implementation Lift

These custom tools would be MCP servers, plugged in through the toolbox system. The toolbox-resolver already knows how to compose MCP servers into worker sessions.

The question is whether we build dozens of narrow tools or a few parameterized ones.

**Narrow tools** (`git_status()`, `git_log(maxCount)`, `lore_file_move(from, to)`) are explicit about what they do. Easy to audit. Hard to accidentally misuse because the function signature declares the allowed operations.

**Parameterized tools** (`git_command(command: "status" | "log" | "diff", args?: Record<string, string>)`) are more general. Fewer tools total, but the security boundary moves inside the tool to argument validation. Easier to get wrong.

The narrow approach is safer. A toolbox with 8 functions is easy to audit. A toolbox with 2 parameterized functions with complex argument validation is harder to verify correct.

**Rough implementation estimate by toolbox:**

| Toolbox | Tools | Effort |
|---------|-------|--------|
| `git-readonly` | 5-6 tools | Small |
| `lore-management` | 4 tools | Small |
| `guild-hall-query` (replaces CLI transport) | 4-6 tools | Medium (needs daemon API wiring) |
| `test-runner` | 2-3 tools | Small |
| `dev-tools` | 6-8 tools (if built) | Medium |

The `guild-hall-query` toolbox is the most interesting. Workers are calling the CLI to query workspace state — but that CLI is just calling the daemon API. An MCP toolbox that calls the daemon API directly is architecturally cleaner and removes one translation layer.

---

### Idea 9: What We Lose If Bash Disappears

Being honest about the tradeoffs:

**Diagnostic flexibility.** When something breaks in an unexpected way, Bash lets a worker run arbitrary inspection commands. Without Bash, a worker who encounters "something is wrong but I don't know why" can read files but can't inspect processes, check environment state, or run the one-off command that would reveal the problem. This is a real loss, especially for Dalton and Sable.

**Unknown-unknown workflows.** Workers develop usage patterns as they work. Dalton might discover that `grep -r` across a large codebase is faster than the Grep tool for a certain pattern. Or that `jq` is exactly what's needed to inspect a specific JSON file. Narrowing tools to predicted use cases means workers can't discover better approaches.

**Skill tool composition.** Some skills invoke Bash as part of their workflow. Replacing Bash with narrow tools might break skill implementations that expect Bash to be available. This requires auditing all skill definitions that invoke Bash.

**Incremental migration path is complicated.** You can't remove Bash from Dalton and Sable without giving them alternatives first. But the alternatives require implementation work. The transition state (some workers on narrow tools, some still on Bash) is messy.

**What we don't lose**: The core value proposition — workers staying in their lanes — is achievable. Octavia managing `.lore/` files through a path-validated MCP tool is genuinely constrained in a way that Bash pattern matching isn't. The security model becomes structural rather than advisory.

---

## Open Questions

**Why is canUseTool not reliably called?** The implementation exists. The callback is wired in. If the SDK is bypassing it in certain cases, understanding *which cases* determines whether narrow tools are necessary or whether fixing the callback is sufficient. Specifically: does the Task tool (sub-agents) inherit the canUseTool rules? If not, every worker that uses Task can escape the rules via sub-agents.

**Can the sandbox commit failures be fixed?** The sandbox would provide real isolation for Bash-capable workers. If those issues are architectural (daemon process model incompatible with sandboxing), the narrow-tools approach becomes more urgent. If they're implementation bugs, fixing the sandbox may be the better path.

**Where does the guild-hall-query toolbox live?** The toolbox-resolver discovers toolboxes from packages. A new `guild-hall-query` toolbox would need its own package, or it could live in `daemon/services/base-toolbox.ts` as part of the base toolbox that all workers get. The base toolbox already provides memory and artifact tools — workspace query tools might belong there.

**What happens to skills that use Bash?** Some lore-development skills and other plugins may invoke Bash directly. If we remove Bash from workers, those skills break silently. An audit of all skill files for Bash invocations is needed before removal.

**Is there a worker-declared "I need Bash" signal?** Rather than choosing per-worker in configuration, could workers declare `needsBash: true` in their package.json with a required justification? This makes the decision explicit and auditable, rather than implicit in the tool list.

---

## Next Steps

This brainstorm surfaces four distinct paths forward, which aren't mutually exclusive:

1. **Fix the sandbox and re-enable it.** Addresses the root cause of why Bash is uncontrolled for Dalton and Sable. The sandboxed-execution spec already defines this work; the blocker is commit failures in sandboxed contexts.

2. **Audit canUseTool reliability.** Before removing Bash, understand exactly why the callback is unreliable. If it's only sub-agents, that's a narrower problem. If it's more fundamental, the narrow-tools approach becomes necessary.

3. **Build the toolboxes for non-code workers.** Octavia, Thorne, Verity, Guild Master, Celeste, and Edmund all have Bash primarily as transport for operations that could be MCP tools. These workers are lower risk to migrate because they have less legitimate need for Bash to begin with.

4. **Audit skills for Bash dependency.** Before removing Bash from any worker, map which skills invoke it and what those invocations do. Skills are the hidden Bash usage vector that worker package configuration doesn't capture.

The clearest immediate win: remove Bash from Octavia and replace with a path-validated `lore-management` toolbox. This is low risk (writing markdown files), high clarity (the operations are well-defined), and provides a concrete implementation template for the other toolboxes.
