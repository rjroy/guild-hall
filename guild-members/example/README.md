# Example Guild Member

A complete working MCP plugin for Guild Hall that demonstrates the plugin structure and MCP server implementation.

## What It Does

Provides two simple tools:
- **echo**: Returns the input message unchanged
- **reverse**: Reverses the input text character-by-character

## Files

- `guild-member.json` - Plugin manifest (required)
- `server.ts` - MCP server implementation
- `package.json` - Dependencies (MCP SDK)
- `README.md` - This file

## How It Works

1. **Discovery**: Guild Hall scans `guild-members/` and finds this plugin via `guild-member.json`
2. **Spawn**: When needed, Guild Hall runs `bun run guild-members/example/server.ts`
3. **Connection**: The server connects via stdio transport and speaks the MCP protocol
4. **Tools**: Guild Hall calls `tools/list` and gets the echo/reverse tool definitions
5. **Invocation**: When a tool is called, the server processes it and returns results

## Plugin Manifest Structure

```json
{
  "name": "example",                    // Internal identifier
  "displayName": "Example Guild Member", // UI display name
  "description": "...",                  // Description shown in roster
  "version": "0.1.0",                    // Semantic version
  "mcp": {
    "command": "bun",                    // Command to run
    "args": ["run", "..."]               // Arguments
  }
}
```

## MCP Server Implementation

The server uses the official `@modelcontextprotocol/sdk`:

1. Create a Server instance with name/version
2. Declare capabilities (tools in this case)
3. Handle `tools/list` - return tool definitions
4. Handle `tools/call` - execute tool logic
5. Connect via StdioServerTransport

See `server.ts` for the complete implementation.

## Using as a Template

To create a new plugin:

1. Copy this directory structure
2. Update `guild-member.json` with your plugin's metadata
3. Implement your MCP server with your own tools
4. Place in `guild-members/` and Guild Hall will discover it

## Dependencies

- `@modelcontextprotocol/sdk` - Official MCP SDK
- `tsx` or `bun` - TypeScript execution (bun is preferred in Guild Hall)

The plugin's dependencies are separate from Guild Hall's main dependencies.
