import path from "node:path";

import { GuildMemberManifestSchema } from "./schemas";
import type { GuildMember } from "./types";

// -- Filesystem abstraction for dependency injection --

export interface FileSystem {
  readdir(path: string): Promise<string[]>;
  readFile(path: string): Promise<string>;
  stat(path: string): Promise<{ isDirectory(): boolean }>;
}

// -- Discovery --

/**
 * Scans a directory for guild-member.json manifests up to 2 levels deep.
 * Supports both flat plugins and plugin collections:
 *
 * - Flat: guild-members/standalone/guild-member.json
 * - Nested: guild-members/collection/plugin/guild-member.json
 *
 * Returns a Map keyed by relative path from directoryPath (e.g., "standalone"
 * or "collection/plugin") so that even invalid manifests are keyed.
 *
 * - Valid MCP/hybrid manifests produce a GuildMember with status "disconnected"
 * - Valid plugin-only manifests produce a GuildMember with status "available"
 * - Invalid manifests produce a GuildMember with status "error" and an error message
 * - Nonexistent directories return an empty map (no throw)
 */
export async function discoverGuildMembers(
  directoryPath: string,
  fs: FileSystem,
): Promise<Map<string, GuildMember>> {
  const members = new Map<string, GuildMember>();

  let entries: string[];
  try {
    entries = await fs.readdir(directoryPath);
  } catch {
    // Directory doesn't exist or isn't readable
    return members;
  }

  for (const entry of entries) {
    const entryPath = `${directoryPath}/${entry}`;

    let isDir: boolean;
    try {
      const stat = await fs.stat(entryPath);
      isDir = stat.isDirectory();
    } catch {
      continue;
    }

    if (!isDir) {
      continue;
    }

    // Try to load manifest directly from this directory (flat plugin)
    const member = await loadManifest(entryPath, entry, fs);
    if (member) {
      members.set(entry, member);
      continue;
    }

    // No manifest found - try scanning subdirectories (plugin collection)
    let nestedEntries: string[];
    try {
      nestedEntries = await fs.readdir(entryPath);
    } catch {
      // Can't read subdirectory, skip it
      continue;
    }

    for (const nestedEntry of nestedEntries) {
      const nestedPath = `${entryPath}/${nestedEntry}`;

      let isNestedDir: boolean;
      try {
        const stat = await fs.stat(nestedPath);
        isNestedDir = stat.isDirectory();
      } catch {
        continue;
      }

      if (!isNestedDir) {
        continue;
      }

      const nestedMember = await loadManifest(
        nestedPath,
        `${entry}/${nestedEntry}`,
        fs,
      );
      if (nestedMember) {
        members.set(`${entry}/${nestedEntry}`, nestedMember);
      }
    }
  }

  return members;
}

/**
 * Attempts to load and validate a guild-member.json manifest from a directory.
 * Returns a GuildMember on success, null if no manifest exists.
 * Returns an error GuildMember if the manifest exists but is invalid.
 */
async function loadManifest(
  pluginPath: string,
  key: string,
  fs: FileSystem,
): Promise<GuildMember | null> {
  const manifestPath = `${pluginPath}/guild-member.json`;

  let raw: string;
  try {
    raw = await fs.readFile(manifestPath);
  } catch {
    // No guild-member.json in this directory
    return null;
  }

  // Try to parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return makeErrorMember(key, "Invalid JSON in guild-member.json", pluginPath);
  }

  // Validate against schema
  const result = GuildMemberManifestSchema.safeParse(parsed);

  if (result.success) {
    const manifest = result.data;
    const hasMcp = manifest.mcp !== undefined;
    const hasPlugin = manifest.plugin !== undefined;

    const memberType: "mcp" | "plugin" | "hybrid" = hasMcp && hasPlugin
      ? "hybrid"
      : hasMcp
        ? "mcp"
        : "plugin";

    // MCP members need a server process, so they start disconnected.
    // Plugin-only members have no server process, so they're immediately available.
    const status = memberType === "plugin" ? "available" : "disconnected";

    // Resolve and validate plugin path when plugin field is present
    let resolvedPluginPath: string | undefined;
    if (manifest.plugin) {
      const resolved = path.resolve(pluginPath, manifest.plugin.path);
      const relative = path.relative(pluginPath, resolved);

      // Path escapes the guild member directory (REQ-PLUG-4)
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return makeErrorMember(
          key,
          `Plugin path "${manifest.plugin.path}" escapes guild member directory`,
          pluginPath,
        );
      }

      resolvedPluginPath = resolved;
    }

    return {
      ...manifest,
      // Override manifest name with discovery key so the name matches
      // the roster map key. For nested plugins this includes the
      // collection prefix (e.g., "guild-founders/aegis-of-focus").
      name: key,
      // Normalize undefined capabilities to empty array so consumers
      // don't need to check for undefined.
      capabilities: manifest.capabilities ?? [],
      memberType,
      status,
      tools: [],
      pluginDir: pluginPath,
      ...(resolvedPluginPath !== undefined && { pluginPath: resolvedPluginPath }),
    };
  } else {
    return makeErrorMember(key, result.error.message, pluginPath);
  }
}

function makeErrorMember(dirName: string, errorMessage: string, pluginPath: string): GuildMember {
  return {
    name: dirName,
    displayName: dirName,
    description: "",
    version: "",
    capabilities: [],
    status: "error",
    tools: [],
    error: errorMessage,
    pluginDir: pluginPath,
  };
}

// -- Roster cache for API route --

let cachedRoster: GuildMember[] | null = null;

/**
 * Get the roster of guild members, cached after first call.
 * Note: The cache is not path-aware. The first call's directoryPath is used
 * for all subsequent calls until clearRosterCache() is called. This is
 * intentional for Phase I where there is exactly one guild-members directory.
 */
export async function getRoster(
  directoryPath: string,
  fs: FileSystem,
): Promise<GuildMember[]> {
  if (cachedRoster !== null) {
    return cachedRoster;
  }

  const members = await discoverGuildMembers(directoryPath, fs);
  cachedRoster = Array.from(members.values());
  return cachedRoster;
}

/**
 * Clears the cached roster. Useful for testing and for future
 * refresh/rescan functionality.
 */
export function clearRosterCache(): void {
  cachedRoster = null;
}
