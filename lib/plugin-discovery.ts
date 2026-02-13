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
 * Scans a directory for subdirectories containing guild-member.json manifests.
 * Returns a Map keyed by directory name (not manifest name) so that even
 * invalid manifests that lack a name field are still keyed.
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

    const manifestPath = `${entryPath}/guild-member.json`;

    let raw: string;
    try {
      raw = await fs.readFile(manifestPath);
    } catch {
      // No guild-member.json in this subdirectory, skip it
      continue;
    }

    // Try to parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      members.set(entry, makeErrorMember(entry, "Invalid JSON in guild-member.json"));
      continue;
    }

    // Validate against schema
    const result = GuildMemberManifestSchema.safeParse(parsed);

    if (result.success) {
      members.set(entry, {
        ...result.data,
        status: "disconnected",
        tools: [],
      });
    } else {
      members.set(entry, makeErrorMember(entry, result.error.message));
    }
  }

  return members;
}

function makeErrorMember(dirName: string, errorMessage: string): GuildMember {
  return {
    name: dirName,
    displayName: dirName,
    description: "",
    version: "",
    mcp: { command: "", args: [] },
    status: "error",
    tools: [],
    error: errorMessage,
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
