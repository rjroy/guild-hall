/**
 * Cross-bundle singleton cache for Turbopack dev mode.
 *
 * Turbopack sandboxes both globalThis and process per route compilation,
 * so module-level singletons don't survive across routes. This CJS module
 * is loaded via native require() (through createRequire), which uses
 * Node.js's process-wide module cache. The cache is keyed by resolved
 * file path, so all route bundles get the same exports object.
 *
 * Used for: ServerContext, EventBus, AgentManager sharing across routes.
 * MCP server process coordination uses PID files instead (see pid-file-manager.ts).
 *
 * This file MUST remain CommonJS (.cjs) to use Node.js's require cache.
 */
module.exports = {};
