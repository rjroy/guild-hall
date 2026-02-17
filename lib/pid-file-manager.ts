/**
 * PID File Manager for MCP Server Coordination
 *
 * Manages PID files that track running MCP server processes. Used to
 * coordinate across Turbopack module re-evaluations: when a new module
 * scope spawns an MCPManager, it checks PID files to discover servers
 * that are already running and reconnects instead of spawning duplicates.
 *
 * PID files live at `.mcp-servers/{member-name}.json` and contain
 * `{ pid, port }`. Writes use atomic rename (write to .tmp, rename to
 * final) to prevent partial reads.
 */

import * as nodeFs from "node:fs/promises";
import * as path from "node:path";

export type PidFileData = { pid: number; port: number };

export type PidFileManagerDeps = {
  baseDir: string;
  fs: {
    readFile: (path: string, encoding: string) => Promise<string>;
    writeFile: (path: string, data: string) => Promise<void>;
    rename: (oldPath: string, newPath: string) => Promise<void>;
    unlink: (path: string) => Promise<void>;
    readdir: (path: string) => Promise<string[]>;
    mkdir: (path: string, options: { recursive: boolean }) => Promise<unknown>;
  };
  processKill: (pid: number, signal: number) => void;
};

export interface PidFileManager {
  read(memberName: string): Promise<PidFileData | null>;
  write(memberName: string, data: PidFileData): Promise<void>;
  remove(memberName: string): Promise<void>;
  isAlive(pid: number): boolean;
  cleanupAll(): Promise<void>;
  shutdownAll(): Promise<void>;
}

export function createPidFileManager(deps: PidFileManagerDeps): PidFileManager {
  const { baseDir, fs, processKill } = deps;

  // Flatten member names containing path separators (e.g.,
  // "guild-founders/aegis-of-focus" becomes "guild-founders--aegis-of-focus")
  // so PID files stay in baseDir rather than creating subdirectories.
  function safeName(memberName: string): string {
    return memberName.replace(/\//g, "--");
  }

  function filePath(memberName: string): string {
    return path.join(baseDir, `${safeName(memberName)}.json`);
  }

  function tmpPath(memberName: string): string {
    return path.join(baseDir, `.${safeName(memberName)}.json.tmp`);
  }

  function isEnoent(err: unknown): boolean {
    return (err as NodeJS.ErrnoException).code === "ENOENT";
  }

  const manager: PidFileManager = {
    async read(memberName: string): Promise<PidFileData | null> {
      try {
        const content = await fs.readFile(filePath(memberName), "utf-8");
        return JSON.parse(content) as PidFileData;
      } catch (err) {
        if (isEnoent(err)) return null;
        throw err;
      }
    },

    async write(memberName: string, data: PidFileData): Promise<void> {
      await fs.mkdir(baseDir, { recursive: true });
      const tmp = tmpPath(memberName);
      await fs.writeFile(tmp, JSON.stringify(data));
      await fs.rename(tmp, filePath(memberName));
    },

    async remove(memberName: string): Promise<void> {
      try {
        await fs.unlink(filePath(memberName));
      } catch (err) {
        if (isEnoent(err)) return;
        throw err;
      }
    },

    isAlive(pid: number): boolean {
      try {
        processKill(pid, 0);
        return true;
      } catch {
        return false;
      }
    },

    async cleanupAll(): Promise<void> {
      await fs.mkdir(baseDir, { recursive: true });

      let entries: string[];
      try {
        entries = await fs.readdir(baseDir);
      } catch (err) {
        if (isEnoent(err)) return;
        throw err;
      }

      for (const entry of entries) {
        const fullPath = path.join(baseDir, entry);

        // Clean up .tmp files unconditionally
        if (entry.endsWith(".tmp")) {
          try {
            await fs.unlink(fullPath);
          } catch (err) {
            if (!isEnoent(err)) throw err;
          }
          continue;
        }

        // Process .json PID files
        if (entry.endsWith(".json")) {
          try {
            const content = await fs.readFile(fullPath, "utf-8");
            const data = JSON.parse(content) as PidFileData;

            if (manager.isAlive(data.pid)) {
              try {
                processKill(data.pid, 15); // SIGTERM
              } catch {
                // Process may have died between check and kill
              }
            }
          } catch (err) {
            if (!isEnoent(err)) {
              // Malformed file, just delete it
            }
          }

          try {
            await fs.unlink(fullPath);
          } catch (err) {
            if (!isEnoent(err)) throw err;
          }
        }
      }
    },

    async shutdownAll(): Promise<void> {
      return manager.cleanupAll();
    },
  };

  return manager;
}

/** Production helper: wraps Node.js fs and process.kill. */
export function createNodePidFileManager(baseDir: string): PidFileManager {
  return createPidFileManager({
    baseDir,
    fs: {
      readFile: (p: string, encoding: string) => nodeFs.readFile(p, encoding as BufferEncoding),
      writeFile: (p: string, data: string) => nodeFs.writeFile(p, data),
      rename: (oldPath: string, newPath: string) => nodeFs.rename(oldPath, newPath),
      unlink: (p: string) => nodeFs.unlink(p),
      readdir: (p: string) => nodeFs.readdir(p),
      mkdir: (p: string, options: { recursive: boolean }) => nodeFs.mkdir(p, options),
    },
    processKill: (pid: number, signal: number) => process.kill(pid, signal),
  });
}
