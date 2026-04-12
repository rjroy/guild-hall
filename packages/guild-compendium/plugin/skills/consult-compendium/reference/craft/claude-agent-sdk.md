---
title: Claude Agent SDK
domain: agent-sdk
last_updated: 2026-04-12
source: "research refresh (official docs at code.claude.com, 2026-04-12)"
---

# Claude Agent SDK

The Claude Agent SDK is Anthropic's library for building production AI agents programmatically. It provides the same tools, agent loop, and context management that power Claude Code, available in both Python and TypeScript.

**Always check for the latest version before integrating.** The SDK ships frequently. Run `npm view @anthropic-ai/claude-agent-sdk version` or check PyPI for `claude-agent-sdk`. Do not pin to a version quoted in this document.

- TypeScript: `@anthropic-ai/claude-agent-sdk` (install with `bun add @anthropic-ai/claude-agent-sdk@latest`)
- Python: `claude-agent-sdk` (PyPI)
- Docs: `https://code.claude.com/docs/en/agent-sdk/overview`

## Architecture

The SDK wraps Claude Code's CLI as a subprocess, communicating via JSON over stdin/stdout. It does not implement tool execution itself. It delegates to the bundled Claude Code CLI, which handles all tool orchestration, context management, and the agent loop.

## Core API

### TypeScript

`query()` is the primary interface. It returns a `Query` object (an async generator of `SDKMessage` objects with additional methods).

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Find and fix the bug in auth.py",
  options: { allowedTools: ["Read", "Edit", "Bash"] }
})) {
  if ("result" in message) console.log(message.result);
}
```

The `Query` object exposes control methods: `interrupt()`, `rewindFiles()`, `setPermissionMode()`, `setModel()`, `supportedModels()`, `supportedAgents()`, `mcpServerStatus()`, `setMcpServers()`, `streamInput()`, `stopTask()`, `close()`.

### Python

Two interfaces:

| Interface         | Session Model        | Hooks   | Interrupts | Use Case                        |
| ----------------- | -------------------- | ------- | ---------- | ------------------------------- |
| `query()`         | New session per call | Supported | Not supported | One-off tasks, CI/CD          |
| `ClaudeSDKClient` | Persistent session   | Supported | Supported   | Conversations, interactive apps |

## Key Options

```typescript
{
  model?: string;                    // Claude model
  effort?: 'low' | 'medium' | 'high' | 'max';
  maxTurns?: number;                 // Max agentic turns
  maxBudgetUsd?: number;             // Cost limit
  cwd?: string;                      // Working directory
  permissionMode?: PermissionMode;
  allowedTools?: string[];           // Auto-approve these tools
  disallowedTools?: string[];        // Always deny (overrides allowedTools)
  tools?: string[];                  // Control which built-ins are available
  mcpServers?: Record<string, McpServerConfig>;
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
  agents?: Record<string, AgentDefinition>;
  outputFormat?: { type: 'json_schema'; schema: JSONSchema };
  thinking?: ThinkingConfig;         // 'adaptive' | 'enabled' | 'disabled'
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string };
  settingSources?: ('user' | 'project' | 'local')[];
  sandbox?: SandboxSettings;
  plugins?: SdkPluginConfig[];
  resume?: string;                   // Resume session by ID
  persistSession?: boolean;          // Save to disk (default: true)
}
```

**`settingSources` defaults to `[]`** (no filesystem settings loaded). Set `settingSources: ['project']` to load CLAUDE.md, skills, slash commands, agents, and `.mcp.json` from the filesystem.

## Built-in Tools

| Tool       | Description                                    |
| ---------- | ---------------------------------------------- |
| Read       | Read any file in the working directory         |
| Write      | Create new files                               |
| Edit       | Precise string replacement edits               |
| Bash       | Run terminal commands, scripts, git            |
| Monitor    | Watch a background process, react to each line |
| Glob       | Find files by pattern                          |
| Grep       | Search file contents with regex (ripgrep)      |
| WebSearch  | Web search for current information             |
| WebFetch   | Fetch and parse web page content               |
| Agent      | Launch subagents for focused subtasks          |
| AskUserQuestion | Ask the user clarifying questions         |

Use the `tools` option to control which built-ins appear in Claude's context. Omitting a tool from `tools` removes it entirely (preferred over `disallowedTools`, which blocks calls but leaves the tool visible).

## Permissions

Permissions are evaluated in strict order:

1. **Hooks** (can allow, deny, or pass through)
2. **Deny rules** (`disallowedTools`, settings.json deny rules). Checked even in `bypassPermissions`.
3. **Permission mode** (global setting)
4. **Allow rules** (`allowedTools`, settings.json allow rules)
5. **`canUseTool` callback** (runtime custom logic). Skipped in `dontAsk` mode.

### Permission Modes

| Mode                | Behavior                                                                |
| ------------------- | ----------------------------------------------------------------------- |
| `default`           | No auto-approvals; unmatched tools trigger `canUseTool`                 |
| `acceptEdits`       | Auto-approves file edits and filesystem commands (`mkdir`, `rm`, etc.)  |
| `dontAsk`           | Anything not pre-approved by rules is denied; `canUseTool` never called |
| `bypassPermissions` | All tools run without prompts (use with caution)                        |
| `plan`              | No tool execution; Claude plans only                                    |
| `auto` (TS only)    | Model classifier approves/denies each tool call                         |

`bypassPermissions` inherits to all subagents and cannot be overridden. `allowedTools` does not constrain it; use `disallowedTools` to block specific tools.

## MCP Integration

Three transport types:

- **stdio**: Local processes via stdin/stdout (`command` + `args`)
- **HTTP/SSE**: Remote servers (`type: "http"` or `type: "sse"` + `url`)
- **SDK MCP servers**: In-process custom tools (no separate process)

### In-Process Custom Tools (TypeScript)

```typescript
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const myTool = tool(
  "tool_name",
  "Description Claude reads to decide when to call it",
  { param: z.string().describe("Parameter description") },
  async (args) => ({
    content: [{ type: "text", text: `Result: ${args.param}` }]
  }),
  { annotations: { readOnlyHint: true } }  // optional
);

const server = createSdkMcpServer({
  name: "myserver",
  tools: [myTool]
});
```

### In-Process Custom Tools (Python)

```python
from claude_agent_sdk import tool, create_sdk_mcp_server

@tool("tool_name", "Description", {"param": str})
async def my_tool(args):
    return {"content": [{"type": "text", "text": f"Result: {args['param']}"}]}

server = create_sdk_mcp_server(name="myserver", tools=[my_tool])
```

Tool naming convention: `mcp__<server-name>__<tool-name>`. Wildcard support in `allowedTools`: `mcp__myserver__*`.

### Tool Annotations

| Field             | Default | Meaning                                          |
| ----------------- | ------- | ------------------------------------------------ |
| `readOnlyHint`    | false   | No side effects; enables parallel execution      |
| `destructiveHint` | true    | May perform destructive updates (informational)  |
| `idempotentHint`  | false   | Repeated calls have no additional effect         |
| `openWorldHint`   | true    | Reaches systems outside your process             |

Annotations are metadata, not enforcement.

### Tool Error Handling

Return `isError: true` to signal failure without stopping the agent loop. Uncaught exceptions stop the entire query.

```typescript
return {
  content: [{ type: "text", text: `API error: ${response.status}` }],
  isError: true  // Claude sees this and can retry or explain
};
```

### Tool Search

Enabled by default. When MCP tools exceed a threshold of the context window, tool definitions are withheld and loaded on demand per turn. See `code.claude.com/docs/en/agent-sdk/tool-search` for configuration.

## Hooks

Hooks are callback functions that run at key points in the agent lifecycle.

| Hook Event         | Python | TypeScript | Triggers on                     |
| ------------------ | ------ | ---------- | ------------------------------- |
| PreToolUse         | Yes    | Yes        | Before tool execution           |
| PostToolUse        | Yes    | Yes        | After tool execution            |
| PostToolUseFailure | Yes    | Yes        | After tool failure              |
| UserPromptSubmit   | Yes    | Yes        | User prompt submission          |
| Stop               | Yes    | Yes        | Agent execution stop            |
| SubagentStart      | Yes    | Yes        | Subagent initialization         |
| SubagentStop       | Yes    | Yes        | Subagent completion             |
| PreCompact         | Yes    | Yes        | Before message compaction       |
| Notification       | Yes    | Yes        | System notifications            |
| PermissionRequest  | Yes    | Yes        | Permission dialog triggered     |
| SessionStart       | No     | Yes        | Session initialization          |
| SessionEnd         | No     | Yes        | Session termination             |
| Setup              | No     | Yes        | Session setup/maintenance       |
| TeammateIdle       | No     | Yes        | Teammate becomes idle           |
| TaskCompleted      | No     | Yes        | Background task completes       |
| ConfigChange       | No     | Yes        | Configuration file changes      |
| WorktreeCreate     | No     | Yes        | Git worktree created            |
| WorktreeRemove     | No     | Yes        | Git worktree removed            |

Hooks use **matchers** (regex patterns) to target specific tools. A `PreToolUse` hook can return `permissionDecision: "allow"`, `"deny"`, or `"ask"`, and can modify input via `updatedInput`. Multiple hooks execute in array order; deny takes priority over ask, which takes priority over allow.

## Subagents

Define programmatically or via filesystem (`.claude/agents/*.md`, requires `settingSources: ["project"]`).

```typescript
agents: {
  "code-reviewer": {
    description: "When to use this agent",
    prompt: "System prompt for the agent",
    tools: ["Read", "Glob", "Grep"],
    model: "inherit",  // or "sonnet", "opus", "haiku"
    maxTurns: 5
  }
}
```

Include `Agent` in `allowedTools` since subagents are invoked via the Agent tool. Messages from subagents include `parent_tool_use_id` for tracking.

## Sessions

Sessions maintain context across multiple exchanges.

```typescript
// Capture session ID from init message
if (message.type === "system" && message.subtype === "init") {
  sessionId = message.session_id;
}

// Resume later
query({ prompt: "Continue", options: { resume: sessionId } });
```

Session management functions: `listSessions()`, `getSessionMessages()`, `getSessionInfo()`, `renameSession()`, `tagSession()`. Fork sessions with `forkSession: true`.

## Authentication

**Do not write authentication code.** The SDK handles authentication internally. The application developer's only job is to ensure the correct credentials exist in the environment before running the app. Any code that manages API keys, token refresh, or credential selection is unnecessary at best and wrong at worst.

Two authentication paths exist:

- **API key**: Set `ANTHROPIC_API_KEY` in the environment. The SDK reads it.
- **OAuth**: The SDK supports OAuth flows for cloud providers (Bedrock, Vertex AI, Azure). The provider's standard credential chain handles the rest.

Cloud provider flags (set in the environment, not in code):
- Amazon Bedrock: `CLAUDE_CODE_USE_BEDROCK=1`
- Google Vertex AI: `CLAUDE_CODE_USE_VERTEX=1`
- Microsoft Azure: `CLAUDE_CODE_USE_FOUNDRY=1`

The SDK resolves which authentication method to use based on what's present in the environment. Your application code should never touch this.

Anthropic does not allow third-party developers to offer claude.ai login or rate limits for SDK-built products.

## Filesystem Features

Set `settingSources: ["project"]` to enable:

| Feature         | Location                      |
| --------------- | ----------------------------- |
| Skills          | `.claude/skills/*/SKILL.md`   |
| Slash commands  | `.claude/commands/*.md`       |
| Memory/context  | `CLAUDE.md`, `.claude/CLAUDE.md` |
| Plugins         | Programmatic via `plugins` option |
| MCP servers     | `.mcp.json` at project root   |

## Branding

Products built with the Agent SDK must not use "Claude Code" branding, ASCII art, or visual elements that mimic Claude Code. Allowed: "Claude Agent", "Claude", or "{YourName} Powered by Claude".

## Sources

- [Overview](https://code.claude.com/docs/en/agent-sdk/overview)
- [TypeScript Reference](https://code.claude.com/docs/en/agent-sdk/typescript)
- [Python Reference](https://code.claude.com/docs/en/agent-sdk/python)
- [MCP Guide](https://code.claude.com/docs/en/agent-sdk/mcp)
- [Custom Tools](https://code.claude.com/docs/en/agent-sdk/custom-tools)
- [Permissions](https://code.claude.com/docs/en/agent-sdk/permissions)
- [Hooks](https://code.claude.com/docs/en/agent-sdk/hooks)
- [Example Agents](https://github.com/anthropics/claude-agent-sdk-demos)
