---
title: MCPServerFactory Implementation - Stdio MCP Server Process Spawning
date: 2026-02-14
status: executed
tags: [implementation, mcp, process-spawning, stdio, phase-1-completion, archived]
modules: [mcp-manager, server-context, stdio-mcp-factory]
related:
  - .lore/specs/mcp-server-factory.md
  - .lore/brainstorm/mcp-transport-stdio-vs-http.md
  - .lore/brainstorm/plugin-architecture-hybrid.md
  - .lore/notes/mcp-server-factory.md
---

# Plan: MCPServerFactory Implementation

> **Status**: This plan was executed through Phase 9, with implementation completed and all tests passing. However, manual testing revealed architectural issues (duplicate stdio processes, chicken-and-egg tool discovery) that led to the decision to use HTTP transport instead. The stdio implementation was reverted. See `.lore/brainstorm/mcp-transport-stdio-vs-http.md` for the architectural decision and `.lore/notes/mcp-server-factory.md` for implementation learnings. Preserved for historical context.

## Spec Reference

**Spec**: `.lore/specs/mcp-server-factory.md`

Requirements addressed:
- REQ-MCPF-1: Factory spawn config includes pluginDir → Steps 1, 2
- REQ-MCPF-2: Spawn via child_process with command/args → Step 3
- REQ-MCPF-3: Set cwd to pluginDir → Step 3
- REQ-MCPF-4: Merge env variables → Step 3
- REQ-MCPF-5: Reject on spawn failure → Step 3
- REQ-MCPF-6: 5s spawn timeout → Step 3
- REQ-MCPF-7: Use MCP SDK stdio client transport → Step 3
- REQ-MCPF-8: Connect to stdin/stdout → Step 3
- REQ-MCPF-9: Capture stderr to sessions/logs/[plugin-name]-stderr.log → Step 3, 4
- REQ-MCPF-10: Fail on handshake failure → Step 3
- REQ-MCPF-11: Implement listTools() → Step 3
- REQ-MCPF-12: Implement invokeTool() → Step 3
- REQ-MCPF-13: 30s tool invocation timeout → Step 3
- REQ-MCPF-14: Stop process gracefully → Step 3
- REQ-MCPF-15: Serialize tool invocations → Step 3
- REQ-MCPF-16: Emit error event on crash → Step 3
- REQ-MCPF-17: MCPManager updates status on error → Already implemented
- REQ-MCPF-18: Manual restart allowed → Already supported (MCPManager)
- REQ-MCPF-19: Process crashes emit error events → Step 3
- REQ-MCPF-20: Duplicate processes accepted for stdio → Documentation note
- REQ-MCPF-21: Descriptive error messages → Step 3
- REQ-MCPF-22: Stderr captured, not in LLM errors → Step 3, 4
- REQ-MCPF-23: Distinguish temp/permanent failures → Step 3

## Codebase Context

**Current state:**
- Factory stub at `lib/server-context.ts:59-67` rejects with "not implemented"
- MCPManager fully implemented but doesn't pass `pluginDir` to factory
- Test infrastructure uses `createMockFactory()` pattern with spawn tracking
- No existing child_process usage in codebase
- `sessions/` directory exists but `sessions/logs/` subdirectory doesn't
- MCP SDK available in example plugin, needs to be added to main dependencies

**Integration points:**
- MCPManager calls factory at `lib/mcp-manager.ts:233`
- MCPManager handles result at lines 241-249 (success) and 250-259 (error)
- Tests mock factory at `tests/lib/mcp-manager.test.ts:73-102`
- Server context injects factory at `lib/server-context.ts:70`

**DI factory pattern (from retro):**
Export a `createStdioMCPFactory(deps)` factory, keep a default instance for production via destructured re-export. This pattern is used throughout: SessionStore, AgentManager, MCPManager, ServerContext, NodeSessionStore, NodePluginFs.

## Implementation Steps

### Step 1: Update MCPServerFactory Interface

**Files**: `lib/mcp-manager.ts`
**Addresses**: REQ-MCPF-1
**Expertise**: None needed

Update the `MCPServerFactory` interface to include `pluginDir` in the spawn config:

```typescript
export interface MCPServerFactory {
  spawn(config: {
    command: string;
    args: string[];
    env?: Record<string, string>;
    pluginDir: string;
    onCrash?: (error: string) => void;
  }): Promise<MCPServerHandle>;
}
```

Update the interface documentation comment to clarify that `pluginDir` is the full path to the plugin directory (e.g., `guild-members/example/`), and the implementation must set this as the working directory before spawning.

### Step 2: Update MCPManager to Pass pluginDir

**Files**: `lib/mcp-manager.ts`, `lib/server-context.ts`, `tests/lib/mcp-manager.test.ts`
**Addresses**: REQ-MCPF-1
**Expertise**: None needed

**In `lib/mcp-manager.ts`:**
- Add `private guildMembersDir: string` parameter to MCPManager constructor as the third parameter (after `serverFactory`):
  ```typescript
  constructor(
    private roster: Map<string, GuildMember>,
    private serverFactory: MCPServerFactory,
    private guildMembersDir: string,
  ) {}
  ```
- In `spawnServer()` method (line 233), calculate `pluginDir = \`${this.guildMembersDir}/${name}\``
- Pass `pluginDir` and `onCrash` callback to `serverFactory.spawn()` config:
  ```typescript
  const pluginDir = `${this.guildMembersDir}/${name}`;
  const handle = await this.serverFactory.spawn({
    command: member.mcp.command,
    args: member.mcp.args,
    env: member.mcp.env,
    pluginDir,
    onCrash: (error: string) => {
      member.status = "error";
      member.error = error;
      this.emit({ type: "error", memberName: name, error });
    },
  });
  ```
  This allows the factory to emit error events when processes crash (REQ-MCPF-16, REQ-MCPF-17, REQ-MCPF-19)

**In `lib/server-context.ts`:**
- Update the MCPManager instantiation at line 70 to pass `guildMembersDir`:
  ```typescript
  mcpManagerInstance = new MCPManager(roster, factory, deps.guildMembersDir);
  ```

**In `tests/lib/mcp-manager.test.ts`:**
- Update all `new MCPManager(roster, factory)` calls to include a third parameter: `"/test-guild-members"`
- Verify tests still pass

### Step 3: Implement Stdio MCP Factory

**Files**: `lib/stdio-mcp-factory.ts` (new), `package.json`
**Addresses**: REQ-MCPF-2 through REQ-MCPF-23
**Expertise**: Process management, stdio communication

Create `lib/stdio-mcp-factory.ts` with the following structure:

**Dependencies to add to `package.json`:**
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.6.0"
  }
}
```

**Factory implementation:**

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface StdioMCPFactoryDeps {
  spawnFn?: typeof spawn; // For testing
  logsDir?: string; // Defaults to "sessions/logs"
  createWriteStream?: typeof fs.createWriteStream; // For testing
}

export function createStdioMCPFactory(deps?: StdioMCPFactoryDeps): MCPServerFactory {
  const spawnFn = deps?.spawnFn ?? spawn;
  const logsDir = deps?.logsDir ?? "sessions/logs";
  const createWriteStream = deps?.createWriteStream ?? fs.createWriteStream;

  return {
    async spawn(config) {
      // Ensure logs directory exists
      await fs.mkdir(logsDir, { recursive: true });

      // Create stderr log file path
      const pluginName = path.basename(config.pluginDir);
      const stderrLogPath = path.join(logsDir, `${pluginName}-stderr.log`);

      // Spawn process with cwd set to plugin directory
      const childProcess = spawnFn(config.command, config.args, {
        cwd: config.pluginDir,
        env: { ...process.env, ...config.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Capture stderr to log file (append mode)
      const stderrStream = createWriteStream(stderrLogPath, { flags: "a" });
      childProcess.stderr.pipe(stderrStream);

      // Create MCP client
      const transport = new StdioClientTransport({
        reader: childProcess.stdout,
        writer: childProcess.stdin,
      });

      const client = new Client({
        name: "guild-hall-factory",
        version: "1.0.0",
      });

      // 5-second spawn timeout with cleanup
      const spawnTimeoutMs = 5000;
      let timeoutId: NodeJS.Timeout;
      const spawnTimeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          childProcess.kill();
          reject(new Error(`Spawn timeout: MCP server did not start within ${spawnTimeoutMs}ms`));
        }, spawnTimeoutMs);
      });

      try {
        await Promise.race([client.connect(transport), spawnTimeout]);
        clearTimeout(timeoutId);
      } catch (err) {
        clearTimeout(timeoutId);
        childProcess.kill();
        throw new Error(`Failed to connect to MCP server: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Track invocations for serialization
      let currentInvocation: Promise<unknown> | null = null;

      // Track if stop was called to avoid crash events after clean shutdown
      let stopped = false;

      // Handle process crashes (REQ-MCPF-16, REQ-MCPF-19)
      childProcess.on("exit", (code, signal) => {
        if (!stopped && code !== 0 && code !== null) {
          const error = `MCP server process exited with code ${code}${signal ? ` (signal: ${signal})` : ""}`;
          if (config.onCrash) {
            config.onCrash(error);
          }
        }
      });

      return {
        async listTools() {
          const result = await client.listTools();
          return result.tools.map(tool => ({
            name: tool.name,
            description: tool.description || "",
            inputSchema: tool.inputSchema,
          }));
        },

        async invokeTool(toolName, toolInput) {
          // Serialize invocations (REQ-MCPF-15)
          // Wait for previous invocation to complete (success or failure)
          // Errors from previous invocations propagate to their original caller
          if (currentInvocation) {
            try {
              await currentInvocation;
            } catch {
              // Previous invocation failed, but we continue with this one
            }
          }

          // 30-second tool timeout (REQ-MCPF-13)
          const toolTimeoutMs = 30000;
          let timeoutId: NodeJS.Timeout;
          const toolTimeout = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new Error(`Tool invocation timeout: ${toolName} did not respond within ${toolTimeoutMs}ms`));
            }, toolTimeoutMs);
          });

          currentInvocation = Promise.race([
            client.callTool({ name: toolName, arguments: toolInput }),
            toolTimeout,
          ]).finally(() => clearTimeout(timeoutId));

          const result = await currentInvocation;
          currentInvocation = null;

          return result.content;
        },

        async stop() {
          stopped = true; // Prevent crash events after clean shutdown
          await client.close();
          childProcess.kill();
        },
      };
    },
  };
}

// Default instance for production
export const stdioMCPFactory = createStdioMCPFactory();
```

**Key implementation details:**
- Use `spawn()` from `node:child_process` with `cwd: config.pluginDir`
- Merge env variables: `{ ...process.env, ...config.env }`
- Create `StdioClientTransport` from childProcess.stdin/stdout
- Implement 5s spawn timeout using `Promise.race()`
- Implement 30s tool invocation timeout using `Promise.race()`
- Serialize tool invocations using `currentInvocation` promise tracking
- Capture stderr to `sessions/logs/[plugin-name]-stderr.log` via file append
- Emit error events on process crash (integrate with MCPManager event system)
- Graceful stop: close client, then kill process

**Error handling:**
- Spawn failures: reject with descriptive error (command not found, permission denied)
- Handshake failures: catch client.connect() errors and reject
- Tool invocation failures: propagate errors with tool name in message
- Distinguish timeout errors from other errors in error messages

### Step 4: Update Server Context to Use Real Factory

**Files**: `lib/server-context.ts`
**Addresses**: Integration of all requirements
**Expertise**: None needed

Replace the stub factory (lines 59-67) with the real stdio factory:

```typescript
import { createStdioMCPFactory, stdioMCPFactory } from "./stdio-mcp-factory";

// In createServerContext():
const factory: MCPServerFactory = deps.serverFactory ?? stdioMCPFactory;
```

Remove the stub that rejects with "not yet implemented".

### Step 5: Write Unit Tests for Stdio Factory

**Files**: `tests/lib/stdio-mcp-factory.test.ts` (new)
**Addresses**: AI Validation - unit tests
**Expertise**: None needed

Create comprehensive unit tests covering:

**Test structure:**
- Mock `spawnFn` using a factory that tracks calls and returns mock child processes
- Mock child process events (exit, error)
- Mock MCP SDK client/transport (via dependency injection)
- Verify spawn config (command, args, env, cwd)
- Verify stderr capture to log file
- Verify timeout behavior (5s spawn, 30s tool)
- Verify serialization (concurrent invocations queue)
- Verify error handling (spawn failures, handshake failures, tool failures)
- Verify stop() behavior (client close + process kill)

**Coverage target:** 90%+ on new code per spec

### Step 6: Write Integration Test

**Files**: `tests/integration/stdio-mcp-factory.test.ts` (new)
**Addresses**: AI Validation - custom integration test
**Expertise**: None needed

Create integration test that:
1. Spawns the actual example plugin MCP server (`guild-members/example/server.ts`)
2. Calls `listTools()` and verifies echo/reverse tools are returned
3. Calls `invokeTool("echo", { message: "test" })` and verifies result
4. Calls `invokeTool("reverse", { text: "hello" })` and verifies result is "olleh"
5. Verifies stderr output is captured to `sessions/logs/example-stderr.log`
6. Calls `stop()` and verifies process terminates cleanly

**Working directory verification test:**
- Create a test plugin that reads `./test-file.txt` (relative to plugin directory)
- Verify the file is read correctly (confirming cwd is set to plugin directory)

### Step 7: Update Mock Factories in Tests

**Files**: `tests/lib/mcp-manager.test.ts`, any other tests using mock factories
**Addresses**: Test compatibility
**Expertise**: None needed

Update `createMockFactory()` to accept `pluginDir` and `onCrash` in spawn config:

```typescript
function createMockFactory(options = {}) {
  return {
    spawnCount: 0,
    spawnCalls: [],
    async spawn(config: { command; args; env?; pluginDir; onCrash? }) {
      this.spawnCount++;
      this.spawnCalls.push(config);

      // Test can trigger crash callback if needed
      if (options.triggerCrash && config.onCrash) {
        setTimeout(() => config.onCrash("Mock crash"), 10);
      }

      // ... rest of mock implementation
    },
  };
}
```

Update tests to verify:
- `pluginDir` is passed correctly in spawn calls
- `onCrash` callback is passed and can be invoked
- MCPManager updates member status to "error" when crash callback fires

### Step 8: Run Full Test Suite

**Files**: All test files
**Addresses**: AI Validation - 90%+ coverage, all tests pass
**Expertise**: None needed

Run `bun test` and verify:
- All existing tests pass (no regressions)
- New tests pass (stdio factory unit + integration)
- Coverage is 90%+ on new code (stdio-mcp-factory.ts)

Fix any failing tests before proceeding.

### Step 9: Manual Testing with Example Plugin

**Files**: None (manual verification)
**Addresses**: Success criteria validation
**Expertise**: None needed

Start the Guild Hall dev server and manually verify:
1. Roster shows the example plugin with "echo" and "reverse" tools
2. Direct tool invocation works: call echo from Roster, see result
3. Direct tool invocation works: call reverse from Roster, see result
4. Check `sessions/logs/example-stderr.log` exists and contains stderr output (if any)
5. Verify guild member status updates correctly (connected, error states)
6. Test error cases: invalid command, permission denied, timeout

### Step 10: Validate Against Spec

**Files**: All implementation files
**Addresses**: Final validation
**Expertise**: None needed

Launch a sub-agent that:
1. Reads the spec at `.lore/specs/mcp-server-factory.md`
2. Reviews the implementation in `lib/stdio-mcp-factory.ts`, `lib/mcp-manager.ts`, `lib/server-context.ts`
3. Checks all 23 requirements (REQ-MCPF-1 through REQ-MCPF-23) are met
4. Verifies all 10 success criteria are satisfied
5. Flags any gaps or deviations from the spec

Address any findings before marking the plan as executed.

## Delegation Guide

No specialized expertise required. All steps can be implemented by a generalist with TypeScript/Node.js knowledge.

**If needed:**
- Process management questions → consult Node.js child_process documentation
- MCP SDK usage questions → consult @modelcontextprotocol/sdk documentation and example plugin
- DI factory pattern questions → reference `.lore/retros/coverage-di-factories.md`

## Open Questions

1. **Stderr log rotation** (Future Enhancement): Should we implement log rotation for stderr logs, or just append indefinitely?
   - **Resolution**: Phase I appends indefinitely. Log rotation is a future enhancement (stub).

**Resolved:**
- ~~Event emitter integration~~ - Resolved by adding `onCrash` callback to spawn config
- ~~Bun vs Node.js spawn~~ - Spec mandates `child_process.spawn()` (REQ-MCPF-2)
