# Guild Hall

## Package Management
- Use `bun` for all package management, runtime, and testing

## Pre-commit
- `.git-hooks/pre-commit.sh` runs checks before each commit (tests, eventually lint and typecheck)
- Called by a global pre-commit hook symlinked into `.git/hooks/pre-commit`

## Testing
- Use `bun test` for all tests
- **Do not use `mock.module()`** - it causes infinite loops in bun
- Use dependency injection: pass dependencies as parameters, not imports
- Mock external resources (time, network, filesystem, LLM/Agent SDK calls)

## Code Style
- TypeScript strict mode
- Prefer union types over enums
- No non-null assertions without explanatory comments

## Architecture
- Next.js App Router with API routes as backend
- SSE for streaming (not WebSocket)
- File-based session storage (no database)
- Agent SDK for LLM sessions
- MCP-only plugins discovered from `guild-members/` directory

## Agent SDK (@anthropic-ai/claude-agent-sdk@0.2.39)
- Top-level API is `query({ prompt, options })`, returns `Query` (async generator)
- No class-based client in TypeScript (Python has ClaudeSDKClient, TS does not)
- MCP servers passed as `Record<string, McpServerConfig>`, keyed by server name (not an array)
- Must set `includePartialMessages: true` to receive streaming text events
- Streaming text arrives as `SDKPartialAssistantMessage` (type: 'stream_event'), wrapping Anthropic's BetaRawMessageStreamEvent
- Tool use/results are content blocks inside `SDKAssistantMessage.message.content`, not separate SDK messages
- Session ID is on every SDK message (`session_id` field), captured from the first yielded message
- Resume via `options.resume` (session ID string). No exported error type for expired sessions.
- Stop via `query.interrupt()` (graceful) or `query.close()` (forceful). Also supports `AbortController`.
- Stdio MCP config: `{ command, args?, env? }` with optional `type: 'stdio'`
- See `lib/agent.ts` header comment for full API documentation

## Critical Lessons
- Bun's function coverage counts every anonymous lambda at the source location level. Module-level production wiring (e.g., `const fs = { readdir: (...) => ... }`) inflates the function denominator even when real logic is fully tested through mocks. Extract wiring into named, exported factory functions to make the coverage metric reflect actual test quality.
- The DI factory pattern used throughout this codebase: export a `createX(deps)` factory, keep a default instance for production via destructured re-export. Applied to SessionStore, AgentManager, MCPManager, ServerContext, NodeSessionStore, NodePluginFs, and the POST route handler. New modules that wire dependencies should follow this pattern.
