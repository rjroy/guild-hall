---
title: Claude Code Hooks for Artifact Provenance Tracking
date: 2026-03-17
status: active
tags: [hooks, provenance, artifacts, agent-sdk, claude-code]
related: [.lore/research/claude-agent-sdk-ref-typescript.md, .lore/brainstorm/whats-next-2026-03-17.md]
modules: [guild-hall]
---

# Research: Claude Code Hooks for Artifact Provenance Tracking

## Summary

Claude Code has a hooks system that fires callbacks at key points in the agent lifecycle. Both the CLI (shell command hooks in settings.json) and the Agent SDK (TypeScript callback functions) support `PreToolUse` and `PostToolUse` events that fire on Write and Edit tool calls. The hook input includes `tool_name` and `tool_input` (which contains `file_path` and `content`/`old_string`/`new_string`). PreToolUse hooks can modify tool input via `updatedInput`, which means frontmatter injection before the write completes is technically possible. Guild Hall workers run as Agent SDK sessions, so the SDK callback API is the relevant integration path.

## Question

Can Claude Code hooks stamp `.lore/` artifact frontmatter with `created_by` (worker name) and `commission_id` when workers create or edit artifacts using the built-in Write and Edit tools?

## Key Findings

### 1. Hook Capabilities

**Verified against:** Agent SDK TypeScript reference (cached in `.lore/research/claude-agent-sdk-ref-typescript.md` lines 578-824), Claude Code hooks reference at [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks), and Agent SDK hooks guide at [platform.claude.com/docs/en/agent-sdk/hooks](https://platform.claude.com/docs/en/agent-sdk/hooks).

The hooks system supports 12+ event types. The two relevant to artifact provenance:

| Event | When | Can Block | Can Modify Input | Can Inject Context |
|-------|------|-----------|------------------|--------------------|
| `PreToolUse` | Before tool execution | Yes (`permissionDecision: "deny"`) | Yes (`updatedInput`) | Yes (`systemMessage`) |
| `PostToolUse` | After tool execution succeeds | No (already executed) | No | Yes (`additionalContext`) |

**PreToolUse input for Write tool:**
```typescript
{
  hook_event_name: "PreToolUse",
  session_id: string,
  cwd: string,
  tool_name: "Write",
  tool_input: {
    file_path: string,   // Full path to the file
    content: string       // Complete file content
  }
}
```

**PreToolUse input for Edit tool:**
```typescript
{
  hook_event_name: "PreToolUse",
  session_id: string,
  cwd: string,
  tool_name: "Edit",
  tool_input: {
    file_path: string,
    old_string: string,
    new_string: string,
    replace_all?: boolean
  }
}
```

**Confidence:** High. Types verified against cached SDK reference. Write/Edit tool input schemas confirmed in both CLI hooks reference and SDK documentation.

### 2. Frontmatter Injection via PreToolUse

A `PreToolUse` hook matching `Write|Edit` can inspect `tool_input.file_path`, check if it targets a `.lore/` path, and return `updatedInput` with modified content that includes provenance frontmatter.

**For Write tool (new files or full rewrites):** The hook receives the complete `content`. It can parse the content, detect or inject YAML frontmatter, add `created_by` and `commission_id` fields, and return the modified content via `updatedInput`.

```typescript
const provenanceHook: HookCallback = async (input, toolUseID, { signal }) => {
  const preInput = input as PreToolUseHookInput;
  const toolInput = preInput.tool_input as Record<string, unknown>;
  const filePath = toolInput?.file_path as string;

  // Only target .lore/ artifacts
  if (!filePath?.includes("/.lore/")) return {};

  if (preInput.tool_name === "Write") {
    const content = toolInput.content as string;
    const updatedContent = injectProvenance(content, workerName, commissionId);
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: { ...toolInput, content: updatedContent },
      },
    };
  }
  return {};
};
```

**For Edit tool (partial modifications):** This is harder. The Edit tool receives `old_string` and `new_string`, not the full file content. If the edit doesn't touch the frontmatter section, the hook would need to either:
- (a) Read the file from disk, check if provenance fields exist, and if not, modify the `old_string`/`new_string` to inject them (fragile, requires the edit to touch the frontmatter area), or
- (b) Let the Edit proceed and handle provenance in a PostToolUse hook that reads and re-writes the file.

**The Edit tool limitation is significant.** PreToolUse input modification works cleanly for Write (full file content available) but not for Edit (only the diff is available). An Edit to line 50 of a file provides no way to also inject frontmatter at lines 3-5 without a separate file operation.

**Confidence:** High for Write path. Medium for Edit path (the `updatedInput` mechanism is verified, but injecting frontmatter into an Edit that doesn't touch the frontmatter requires reading the file from disk within the hook, which adds complexity and a race condition risk).

### 3. PostToolUse as Alternative

A `PostToolUse` hook fires after Write/Edit completes successfully. The hook receives `tool_input` (file path) and `tool_response`. At this point, the file is on disk. The hook can:

1. Read the file
2. Parse frontmatter
3. Add/update `created_by` and `commission_id`
4. Write the file back

This approach is simpler and works identically for both Write and Edit. The tradeoff: it creates a second write operation after every `.lore/` artifact modification.

**For CLI hooks (shell commands):** PostToolUse hooks run a shell script that receives JSON on stdin. The script can modify the file directly.

**For SDK hooks (callbacks):** PostToolUse callbacks run in the daemon process. They can use `fs.readFileSync`/`fs.writeFileSync` directly. The file is guaranteed to exist because the tool already succeeded.

**Confidence:** High. PostToolUse is documented to fire after successful tool execution, and the hook receives the file path. File modification after the fact is straightforward.

### 4. Context Availability (Worker Name and Commission ID)

Hooks need to know which worker and commission produced the write. Two viable mechanisms:

#### Option A: Closure over session context (SDK callbacks)

Guild Hall builds SDK options in `prepareSdkSession()` (`daemon/lib/agent-sdk/sdk-runner.ts:504`). The function already has access to `spec.workerName` and `spec.commissionId`. A hook callback can close over these values:

```typescript
function buildProvenanceHook(workerName: string, commissionId: string): HookCallback {
  return async (input, toolUseID, { signal }) => {
    // workerName and commissionId captured via closure
    // ... inspect file_path, modify content ...
  };
}
```

This is the natural path for Guild Hall. The `SdkQueryOptions` type in `sdk-runner.ts` doesn't currently include a `hooks` field (line 42-83), but the underlying SDK `query()` function accepts `options.hooks`. Adding `hooks` to `SdkQueryOptions` and wiring it in `prepareSdkSession` is a small change.

**Confidence:** High. The SDK accepts hooks at query time. The session prep function has all necessary context. Closure captures the values cleanly.

#### Option B: Environment variables

The SDK options accept an `env` field (`sdk-runner.ts:56`). Guild Hall could set `GUILD_HALL_WORKER_NAME` and `GUILD_HALL_COMMISSION_ID` environment variables. Shell command hooks (CLI hooks) can read these from the environment.

This approach is relevant if using plugin hooks (`.claude-plugin/hooks/hooks.json` shell commands) instead of SDK callbacks. Plugin hooks run as shell scripts and don't have access to TypeScript closures.

**Confidence:** High. Environment variable injection is already used for local model configuration (`ANTHROPIC_BASE_URL`, etc. at lines 473-477).

#### Option C: Context file in worktree

Write a `.guild-hall-context.json` file to the worktree root before starting the session. Any hook (shell or callback) can read it. This is the most decoupled approach but adds a file that needs cleanup.

**Confidence:** Medium. Works but adds coordination burden.

**Recommendation framing:** Option A (closure) is the simplest for SDK callback hooks and matches Guild Hall's existing DI patterns. Option B (env vars) is needed only if shell command hooks are preferred (e.g., for plugin-based hooks). Option C is unnecessary given A and B.

### 5. Two Integration Paths

#### Path 1: SDK Callback Hooks (daemon-side)

Add `hooks` to `SdkQueryOptions`, wire provenance callbacks in `prepareSdkSession`. The daemon owns the hook logic.

**Pros:**
- TypeScript callbacks with full type safety
- Closure captures worker/commission context naturally
- No shell scripts, no external processes
- Works for all session types (commissions, meetings, mail readers)
- PostToolUse callback can directly read/write the file in-process

**Cons:**
- Requires adding `hooks` to `SdkQueryOptions` and wiring in `prepareSdkSession`
- Hook logic lives in daemon code, coupled to session infrastructure

#### Path 2: Plugin Shell Hooks (worker package)

Add a `hooks.json` to the `guild-hall-writer` plugin (or a new `guild-hall-provenance` plugin) with PostToolUse shell command hooks that stamp files.

**Pros:**
- Decoupled from daemon code
- Can be enabled/disabled per worker via plugin configuration
- Shell scripts are inspectable and modifiable without daemon changes

**Cons:**
- Shell hooks receive JSON on stdin, must parse it, read/write files
- Context (worker name, commission ID) must come from environment variables
- Shell process overhead per Write/Edit call
- Harder to test than TypeScript callbacks
- Plugin hooks are loaded via `settingSources` which Guild Hall already configures

### 6. Limitations and Gotchas

**Verified against:** Claude Code hooks reference, SDK hooks guide, and GitHub issues.

1. **Matchers filter by tool name only, not file path.** The matcher `"Write|Edit"` fires for ALL Write/Edit calls. File path filtering must happen inside the callback. Every non-`.lore/` write still triggers the hook (it just returns `{}` early). Performance impact is minimal for callbacks but adds overhead for shell command hooks that spawn a process.

2. **`updatedInput` requires `permissionDecision: "allow"`.** If a PreToolUse hook returns `updatedInput` without also returning `permissionDecision: "allow"`, the input modification is not applied. This is documented but easy to miss.

3. **Edit tool input doesn't contain the full file.** Only `old_string`, `new_string`, and `file_path`. Frontmatter injection via PreToolUse on Edit requires reading the file from disk within the hook, introducing a potential race condition if the Edit is also modifying the frontmatter region.

4. **Hook execution order matters.** When multiple hooks match, deny takes priority over ask, which takes priority over allow. If `canUseTool` rules or other hooks interact with Write/Edit permissions, the provenance hook must be ordered carefully.

5. **`SdkQueryOptions` in Guild Hall doesn't expose `hooks` yet.** The SDK's `query()` function accepts hooks, but Guild Hall's `SdkQueryOptions` type (sdk-runner.ts:42-83) doesn't include the field. This is a straightforward type addition.

6. **PostToolUse hooks cannot block.** They fire after execution. If the provenance write fails (disk error, parse failure), the original write has already succeeded. The artifact will exist without provenance. Error handling should log but not crash the session.

7. **gray-matter `stringify()` reformats YAML.** The project CLAUDE.md warns about this (Lessons from Retros). A provenance hook that parses and re-serializes frontmatter must use the splice-and-replace approach, not gray-matter's stringify, to avoid noisy git diffs.

8. **Hooks fire for subagent tool calls too.** If a worker spawns subagents (via the Agent tool), those subagents' Write/Edit calls also trigger hooks. `agent_id` and `agent_type` are populated in the hook input when firing from a subagent context. This is probably desirable for provenance (subagent writes should also be tracked) but worth noting.

9. **Performance.** SDK callback hooks are TypeScript functions running in the same process. Overhead is negligible (a function call + string check per Write/Edit). Shell command hooks spawn a process, which adds ~50-100ms per invocation. For commission sessions that write a few artifacts, either is acceptable.

10. **Timeout defaults.** Hook callbacks default to 60 seconds timeout. A PostToolUse hook that reads and writes a file should complete in milliseconds, well within limits.

## Options for Implementation

### Option 1: PostToolUse SDK Callback (Recommended Starting Point)

Register a `PostToolUse` hook matching `Write|Edit` in `prepareSdkSession`. The callback:
1. Checks if `file_path` is under `.lore/`
2. Reads the file from disk
3. Parses frontmatter (using the splice approach, not gray-matter stringify)
4. Adds/updates `created_by` and `commission_id` if not present
5. Writes the file back

**Tradeoffs:** Simple, works for both Write and Edit identically, no input modification complexity. Second write per artifact is the cost. File will momentarily exist without provenance between the tool write and the hook write (sub-millisecond gap, irrelevant for this use case).

### Option 2: PreToolUse SDK Callback for Write, PostToolUse for Edit

Use PreToolUse to intercept Write calls (full content available, inject frontmatter before write). Use PostToolUse for Edit calls (read-modify-write after the fact).

**Tradeoffs:** Avoids the double-write for new files (Write). More complex, two different code paths. The PreToolUse path modifies content before it hits disk, which is cleaner for git history (no intermediate commit without provenance).

### Option 3: Plugin Shell Hooks

Ship a `hooks.json` in a worker plugin package. PostToolUse shell script stamps files. Worker name and commission ID passed via environment variables.

**Tradeoffs:** Decoupled from daemon. More moving parts. Shell process overhead. Harder to test. Makes sense if provenance should be configurable per-worker or if non-Guild-Hall sessions should also stamp provenance.

### Option 4: Toolbox Instructions (No Hooks)

Add system prompt instructions telling workers to include `created_by` and `commission_id` in frontmatter when creating `.lore/` artifacts. No hooks, no infrastructure.

**Tradeoffs:** Zero implementation cost. Unreliable: workers may forget, format inconsistently, or hallucinate values. No enforcement mechanism. The brainstorm proposal noted "The write path already passes worker identity through the toolbox context," suggesting the intent is for infrastructure to handle this, not worker discipline.

### Option 5: Custom Write Wrapper Tool

Replace the built-in Write tool with a custom MCP tool that wraps file writes and injects provenance for `.lore/` paths. Workers use the custom tool instead of the built-in.

**Tradeoffs:** Full control over the write path. But workers may still use the built-in Write/Edit tools (Claude Code makes them available by default). Requires removing Write/Edit from `allowedTools` and replacing them, which may break other tool behaviors that depend on them. The SDK documentation shows `tools: ["Read", "Write", "Edit", ...]` as explicit tool selection, so removal is possible but aggressive.

## Sources

- Agent SDK TypeScript Reference (cached): `.lore/research/claude-agent-sdk-ref-typescript.md` lines 578-824
- Agent SDK Hooks Guide: [platform.claude.com/docs/en/agent-sdk/hooks](https://platform.claude.com/docs/en/agent-sdk/hooks)
- Claude Code Hooks Reference: [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks)
- Guild Hall SDK Runner: `daemon/lib/agent-sdk/sdk-runner.ts` lines 42-83 (SdkQueryOptions), 329-524 (prepareSdkSession)
- Brainstorm Proposal 4: `.lore/brainstorm/whats-next-2026-03-17.md` lines 104-126
- Claude Code Hook Development Skill: [github.com/anthropics/claude-code/.../hook-development/SKILL.md](https://github.com/anthropics/claude-code/blob/main/plugins/plugin-dev/skills/hook-development/SKILL.md)
