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
 * - Valid manifests produce a GuildMember with status "disconnected"
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
    return {
      ...result.data,
      status: "disconnected",
      tools: [],
      pluginDir: pluginPath,
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
    transport: "http",
    mcp: { command: "", args: [] },
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
