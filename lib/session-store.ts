import { SessionMetadataSchema, StoredMessageSchema } from "./schemas";
import type { SessionMetadata, StoredMessage } from "./types";

// -- Update type that excludes immutable fields --

export type SessionMetadataUpdate = Partial<
  Omit<SessionMetadata, "id" | "createdAt">
>;

// -- Filesystem abstraction for dependency injection --

export interface SessionFileSystem {
  readdir(path: string): Promise<string[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  appendFile(path: string, content: string): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  stat(path: string): Promise<{ isDirectory(): boolean }>;
  access(path: string): Promise<void>;
}

// -- Clock abstraction for testable timestamps --

export type Clock = () => Date;

// -- Slugification --

/**
 * Converts a name to a URL-friendly slug: lowercase, replace non-alphanumeric
 * characters with hyphens, collapse consecutive hyphens, trim leading/trailing
 * hyphens.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Generates a date-prefixed session ID from a name and timestamp, checking
 * the filesystem to avoid collisions by appending -2, -3, etc.
 */
async function generateSessionId(
  name: string,
  sessionsDir: string,
  fs: SessionFileSystem,
  now: Date,
): Promise<string> {
  const datePrefix = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const slug = slugify(name);
  const baseId = `${datePrefix}-${slug}`;

  // Check if base ID is available
  const basePath = `${sessionsDir}/${baseId}`;
  if (!(await pathExists(basePath, fs))) {
    return baseId;
  }

  // Collision: try -2, -3, etc.
  let counter = 2;
  while (true) {
    const candidateId = `${baseId}-${counter}`;
    const candidatePath = `${sessionsDir}/${candidateId}`;
    if (!(await pathExists(candidatePath, fs))) {
      return candidateId;
    }
    counter++;
  }
}

async function pathExists(
  path: string,
  fs: SessionFileSystem,
): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

// -- Context template --

const CONTEXT_TEMPLATE = `# Session Context

## Goal


## Decisions


## In Progress


## Resources

`;

// -- SessionStore --

export class SessionStore {
  constructor(
    private sessionsDir: string,
    private fs: SessionFileSystem,
    private clock: Clock = () => new Date(),
  ) {}

  /**
   * Create a new session with the given name and guild members.
   * Generates a date-prefixed, slugified ID with collision detection.
   * Creates the session directory, meta.json, context.md, messages.jsonl,
   * and artifacts/ subdirectory.
   */
  async createSession(
    name: string,
    guildMembers: string[],
  ): Promise<SessionMetadata> {
    const now = this.clock();
    const id = await generateSessionId(
      name,
      this.sessionsDir,
      this.fs,
      now,
    );

    const sessionDir = `${this.sessionsDir}/${id}`;
    const nowISO = now.toISOString();

    const metadata: SessionMetadata = {
      id,
      name,
      status: "idle",
      guildMembers,
      sdkSessionId: null,
      createdAt: nowISO,
      lastActivityAt: nowISO,
      messageCount: 0,
    };

    // Create session directory and artifacts subdirectory
    await this.fs.mkdir(sessionDir, { recursive: true });
    await this.fs.mkdir(`${sessionDir}/artifacts`, { recursive: true });

    // Write initial files
    await this.fs.writeFile(
      `${sessionDir}/meta.json`,
      JSON.stringify(metadata, null, 2),
    );
    await this.fs.writeFile(`${sessionDir}/context.md`, CONTEXT_TEMPLATE);
    await this.fs.writeFile(`${sessionDir}/messages.jsonl`, "");

    return metadata;
  }

  /**
   * List all sessions by scanning subdirectories for meta.json files.
   * Returns sessions sorted by lastActivityAt descending (most recent first).
   * Skips directories without valid meta.json (logs error, doesn't crash).
   */
  async listSessions(): Promise<SessionMetadata[]> {
    let entries: string[];
    try {
      entries = await this.fs.readdir(this.sessionsDir);
    } catch {
      return [];
    }

    const sessions: SessionMetadata[] = [];

    for (const entry of entries) {
      const entryPath = `${this.sessionsDir}/${entry}`;

      let isDir: boolean;
      try {
        const stat = await this.fs.stat(entryPath);
        isDir = stat.isDirectory();
      } catch {
        continue;
      }

      if (!isDir) continue;

      const metaPath = `${entryPath}/meta.json`;
      try {
        const raw = await this.fs.readFile(metaPath);
        const parsed: unknown = JSON.parse(raw);
        const result = SessionMetadataSchema.safeParse(parsed);
        if (result.success) {
          sessions.push(result.data);
        } else {
          console.error(
            `Invalid meta.json in session "${entry}":`,
            result.error.message,
          );
        }
      } catch {
        // No meta.json or unreadable, skip
        continue;
      }
    }

    // Sort by lastActivityAt descending
    sessions.sort(
      (a, b) =>
        new Date(b.lastActivityAt).getTime() -
        new Date(a.lastActivityAt).getTime(),
    );

    return sessions;
  }

  /**
   * Get a single session by ID: reads metadata and all stored messages.
   * Returns null if the session directory doesn't exist.
   */
  async getSession(
    id: string,
  ): Promise<{ metadata: SessionMetadata; messages: StoredMessage[] } | null> {
    const sessionDir = `${this.sessionsDir}/${id}`;

    let metaRaw: string;
    try {
      metaRaw = await this.fs.readFile(`${sessionDir}/meta.json`);
    } catch {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(metaRaw);
    } catch {
      // Corrupt JSON in meta.json, treat as missing session
      return null;
    }

    const metaResult = SessionMetadataSchema.safeParse(parsed);
    if (!metaResult.success) {
      return null;
    }

    let messagesRaw: string;
    try {
      messagesRaw = await this.fs.readFile(`${sessionDir}/messages.jsonl`);
    } catch {
      messagesRaw = "";
    }

    const messages: StoredMessage[] = [];
    for (const line of messagesRaw.split("\n")) {
      if (line.trim().length === 0) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        // Corrupt JSON line, skip
        continue;
      }

      const result = StoredMessageSchema.safeParse(parsed);
      if (result.success) {
        messages.push(result.data);
      }
      // Invalid structure, skip silently (same resilience as listSessions)
    }

    return { metadata: metaResult.data, messages };
  }

  /**
   * Merge partial updates into an existing session's meta.json.
   * Reads the current metadata, spreads updates over it, and writes back.
   * The id and createdAt fields are immutable and cannot be changed.
   */
  async updateMetadata(
    id: string,
    updates: SessionMetadataUpdate,
  ): Promise<SessionMetadata> {
    const sessionDir = `${this.sessionsDir}/${id}`;
    const metaPath = `${sessionDir}/meta.json`;

    const raw = await this.fs.readFile(metaPath);
    const existing = SessionMetadataSchema.parse(JSON.parse(raw));

    const merged = { ...existing, ...updates };
    const updated = SessionMetadataSchema.parse(merged);

    await this.fs.writeFile(metaPath, JSON.stringify(updated, null, 2));

    return updated;
  }

  /**
   * Append a message to the session's messages.jsonl file.
   * Each message is a single JSON line.
   */
  async appendMessage(id: string, message: StoredMessage): Promise<void> {
    const sessionDir = `${this.sessionsDir}/${id}`;
    const messagesPath = `${sessionDir}/messages.jsonl`;

    await this.fs.appendFile(messagesPath, JSON.stringify(message) + "\n");
  }
}
