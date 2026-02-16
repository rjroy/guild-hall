# Plugin Development Guide

Guild Hall plugins are MCP servers discovered from the `guild-members/` directory. Each plugin runs as an independent HTTP server that speaks the [Model Context Protocol](https://modelcontextprotocol.io/) over HTTP, exposing tools that the AI agent can invoke during conversations.

## Quick Start

1. Build your MCP server however you like (any language, any framework)
2. Add a `guild-member.json` manifest to your project
3. Place the directory into `guild-members/`
4. Run `bun install` if your plugin has dependencies
5. Start Guild Hall. Your plugin is discovered and spawned automatically.

A working example lives at `guild-members/example/`. It demonstrates one way to build a plugin using TypeScript and the `@modelcontextprotocol/sdk`, but neither is required.

## Directory Layout

```
guild-members/
  your-plugin/
    guild-member.json    # Required: plugin manifest
    ...                  # Everything else is up to you
```

Plugins can also be organized in collections (one extra level of nesting):

```
guild-members/
  my-collection/
    plugin-a/
      guild-member.json
      ...
    plugin-b/
      guild-member.json
      ...
```

Discovery scans up to 2 levels deep, looking for `guild-member.json` files.

## The Manifest: `guild-member.json`

Every plugin needs a manifest. This is validated against a schema on discovery, so invalid manifests surface as errors in the roster rather than silent failures.

```json
{
  "name": "your-plugin",
  "displayName": "Your Plugin",
  "description": "What this plugin does, shown in the roster UI",
  "version": "0.1.0",
  "transport": "http",
  "mcp": {
    "command": "bun",
    "args": ["run", "server.ts", "--port", "${PORT}"],
    "env": {}
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Internal identifier for the plugin |
| `displayName` | Yes | Human-readable name shown in the UI |
| `description` | Yes | What the plugin does |
| `version` | Yes | Semantic version string |
| `transport` | Yes | Must be `"http"` (SSE is not yet supported) |
| `mcp.command` | Yes | Command to run (e.g., `"bun"`, `"node"`, `"python"`) |
| `mcp.args` | Yes | Arguments array. `${PORT}` is replaced with the assigned port number. |
| `mcp.env` | No | Additional environment variables passed to the process |

## The Contract

A Guild Hall plugin must satisfy three requirements. Everything else is an implementation choice.

### 1. Accept a port via `${PORT}` substitution

Guild Hall manages port allocation from an ephemeral range (50000-51000). Before spawning your process, it replaces every occurrence of `${PORT}` in your `mcp.args` with the allocated port number. How your server receives that value is up to you:

```json
{"args": ["run", "server.ts", "--port", "${PORT}"]}
{"args": ["run", "server.py", "${PORT}"]}
{"args": ["start", "--bind=127.0.0.1:${PORT}"]}
```

### 2. Speak MCP over HTTP

Your server must accept HTTP POST requests at `/mcp` on the assigned port, bound to `127.0.0.1`. The wire protocol is [JSON-RPC 2.0](https://www.jsonrpc.org/specification) as defined by the [MCP specification](https://modelcontextprotocol.io/).

Guild Hall will send three types of requests:

- **`initialize`**: Handshake after spawn. Guild Hall waits for this to succeed before considering the server ready.
- **`tools/list`**: Asks for your tool definitions. Called once after initialization.
- **`tools/call`**: Invokes a tool by name with a JSON arguments object.

You can implement this with the official `@modelcontextprotocol/sdk`, a raw HTTP server that handles JSON-RPC directly, or any MCP-compatible library in any language. The `guild-members/example/` plugin demonstrates one approach using the TypeScript SDK.

### 3. Use correct exit codes

| Code | Meaning | Guild Hall Response |
|------|---------|---------------------|
| 0 | Normal shutdown | Marks plugin as disconnected |
| 1 | General error | Marks plugin as error |
| 2 | Port collision (`EADDRINUSE`) | Retries with a new port (up to 10 attempts) |

Exit code 2 is the important one. If the allocated port is already in use, exiting with code 2 tells Guild Hall to allocate a different port and try again. Any other non-zero exit code is treated as a fatal error.

## How It Works

Understanding the lifecycle helps when debugging.

### Discovery

On startup, Guild Hall scans `guild-members/` for directories containing `guild-member.json`. Valid manifests become roster entries with status `"disconnected"`. Invalid manifests become roster entries with status `"error"` and a diagnostic message.

### Spawning

After discovery, Guild Hall spawns all HTTP transport plugins. For each plugin:

- A port is allocated from the 50000-51000 range
- `${PORT}` is substituted in `mcp.args`
- The process is spawned with the working directory set to the plugin's directory
- Guild Hall waits briefly, then attempts a JSON-RPC `initialize` handshake

### Working Directory

Guild Hall sets `cwd` to your plugin's directory before spawning. Paths in your manifest and server code are relative to your plugin directory, not Guild Hall's root. You write `"args": ["run", "server.ts"]`, not `"args": ["run", "guild-members/your-plugin/server.ts"]`.

### Connection

After the `initialize` handshake succeeds, Guild Hall calls `tools/list` to discover your tools. These are stored in the roster and made available to the AI agent. Your plugin's status changes to `"connected"`.

### Tool Invocation

When the AI agent calls one of your tools, Guild Hall forwards the call as a `tools/call` request to your server. Your server processes it and returns the result.

### Crash Recovery

If your server process exits unexpectedly, Guild Hall marks the plugin as `"error"`. PID files in `.mcp-servers/` enable reconnection to servers that survive a Guild Hall restart (e.g., during development hot-reloads).

### Shutdown

On `SIGTERM` or `SIGINT`, Guild Hall stops all running plugin servers before exiting.

## Tool Definitions

Tools are defined using [JSON Schema](https://json-schema.org/) for their input, returned in response to a `tools/list` request. Each tool needs:

- `name`: Unique identifier within your plugin
- `description`: What the tool does (the AI agent reads this to decide when to use it)
- `inputSchema`: JSON Schema object describing expected parameters

Write clear, specific descriptions. The AI agent uses them to decide which tool to call and how to construct the input.

## Development Tips

**Develop anywhere, deploy by copying.** Build and test your plugin in whatever directory makes sense, then place it into `guild-members/` when it's ready. Guild Hall discovers it on next startup.

**Dependencies are isolated.** Your plugin has its own dependency tree. This prevents version conflicts with Guild Hall or other plugins.

**Test standalone.** Run your server directly to verify it responds correctly before running through Guild Hall:
```bash
cd guild-members/your-plugin
bun run server.ts --port 9999
# Then POST JSON-RPC requests to http://localhost:9999/mcp
```

**Stderr is captured.** Guild Hall pipes your server's stderr for diagnostics. Use stderr for debug logging. Stdout is ignored (`stdio: ["ignore", "ignore", "pipe"]`).

**Language-agnostic.** The contract is HTTP + JSON-RPC. Python, Go, Rust, or a shell script wrapping `socat` all work as long as they speak MCP on the assigned port.
