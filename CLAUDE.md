# Guild Hall

## Package Management
- Use `bun` for all package management, runtime, and testing

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
