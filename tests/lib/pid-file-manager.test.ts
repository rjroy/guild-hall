import { describe, expect, it, mock } from "bun:test";

import {
  createPidFileManager,
  type PidFileManagerDeps,
} from "@/lib/pid-file-manager";

// -- Mock filesystem --

type MockFiles = Record<string, string>;

function createMockPidFs(initialFiles: MockFiles = {}): PidFileManagerDeps["fs"] {
  const files = new Map<string, string>(Object.entries(initialFiles));
  const dirs = new Set<string>();

  return {
    readFile: mock((path: string) => {
      const content = files.get(path);
      if (content === undefined) {
        const err = new Error(`ENOENT: no such file: ${path}`) as NodeJS.ErrnoException;
        err.code = "ENOENT";
        return Promise.reject(err);
      }
      return Promise.resolve(content);
    }),
    writeFile: mock((path: string, data: string) => {
      files.set(path, data);
      return Promise.resolve();
    }),
    rename: mock((oldPath: string, newPath: string) => {
      const content = files.get(oldPath);
      if (content === undefined) {
        const err = new Error(`ENOENT: no such file: ${oldPath}`) as NodeJS.ErrnoException;
        err.code = "ENOENT";
        return Promise.reject(err);
      }
      files.set(newPath, content);
      files.delete(oldPath);
      return Promise.resolve();
    }),
    unlink: mock((path: string) => {
      if (!files.has(path)) {
        const err = new Error(`ENOENT: no such file: ${path}`) as NodeJS.ErrnoException;
        err.code = "ENOENT";
        return Promise.reject(err);
      }
      files.delete(path);
      return Promise.resolve();
    }),
    readdir: mock(() => {
      const entries: string[] = [];
      for (const key of files.keys()) {
        // Extract filename from path
        const parts = key.split("/");
        entries.push(parts[parts.length - 1]);
      }
      return Promise.resolve(entries);
    }),
    mkdir: mock(() => {
      dirs.add("created");
      return Promise.resolve(undefined);
    }),
  };
}

function createMockKill(alivePids: Set<number> = new Set()): {
  kill: PidFileManagerDeps["processKill"];
  killed: number[];
} {
  const killed: number[] = [];

  return {
    kill: mock((pid: number, signal: number) => {
      if (signal === 0) {
        if (!alivePids.has(pid)) {
          throw new Error("ESRCH: no such process");
        }
        return;
      }
      killed.push(pid);
    }),
    killed,
  };
}

function makeDeps(
  files: MockFiles = {},
  alivePids: Set<number> = new Set(),
): { deps: PidFileManagerDeps; fs: PidFileManagerDeps["fs"]; killed: number[] } {
  const fs = createMockPidFs(files);
  const { kill, killed } = createMockKill(alivePids);

  return {
    deps: { baseDir: "/project/.mcp-servers", fs, processKill: kill },
    fs,
    killed,
  };
}

// -- Tests --

describe("PidFileManager", () => {
  describe("write", () => {
    it("creates dir, writes tmp, renames to final", async () => {
      const { deps, fs } = makeDeps();
      const manager = createPidFileManager(deps);

      await manager.write("alpha", { pid: 1234, port: 50000 });

      expect(fs.mkdir).toHaveBeenCalledWith("/project/.mcp-servers", { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        "/project/.mcp-servers/.alpha.json.tmp",
        JSON.stringify({ pid: 1234, port: 50000 }),
      );
      expect(fs.rename).toHaveBeenCalledWith(
        "/project/.mcp-servers/.alpha.json.tmp",
        "/project/.mcp-servers/alpha.json",
      );
    });

    it("leaves no tmp file on success", async () => {
      const { deps, fs } = makeDeps();
      const manager = createPidFileManager(deps);

      await manager.write("alpha", { pid: 1234, port: 50000 });

      // After rename, reading the tmp path should fail (it was moved)
      // The mock rename deletes the old path, so readFile on tmp should fail
      let caught: Error | null = null;
      try {
        await fs.readFile("/project/.mcp-servers/.alpha.json.tmp", "utf-8");
      } catch (err) {
        caught = err as Error;
      }
      expect(caught).not.toBeNull();
    });
  });

  describe("read", () => {
    it("returns parsed data for valid file", async () => {
      const { deps } = makeDeps({
        "/project/.mcp-servers/alpha.json": JSON.stringify({ pid: 1234, port: 50000 }),
      });
      const manager = createPidFileManager(deps);

      const data = await manager.read("alpha");

      expect(data).toEqual({ pid: 1234, port: 50000 });
    });

    it("returns null for missing file", async () => {
      const { deps } = makeDeps();
      const manager = createPidFileManager(deps);

      const data = await manager.read("nonexistent");

      expect(data).toBeNull();
    });
  });

  describe("remove", () => {
    it("deletes file", async () => {
      const { deps, fs } = makeDeps({
        "/project/.mcp-servers/alpha.json": JSON.stringify({ pid: 1234, port: 50000 }),
      });
      const manager = createPidFileManager(deps);

      await manager.remove("alpha");

      expect(fs.unlink).toHaveBeenCalledWith("/project/.mcp-servers/alpha.json");
    });

    it("no-op on missing file", async () => {
      const { deps } = makeDeps();
      const manager = createPidFileManager(deps);

      // Should not throw
      await manager.remove("nonexistent");
    });
  });

  describe("isAlive", () => {
    it("returns true when process exists", () => {
      const { deps } = makeDeps({}, new Set([1234]));
      const manager = createPidFileManager(deps);

      expect(manager.isAlive(1234)).toBe(true);
    });

    it("returns false when process does not exist", () => {
      const { deps } = makeDeps({}, new Set());
      const manager = createPidFileManager(deps);

      expect(manager.isAlive(9999)).toBe(false);
    });
  });

  describe("cleanupAll", () => {
    it("kills alive processes and deletes all files", async () => {
      const { deps, killed } = makeDeps(
        {
          "/project/.mcp-servers/alpha.json": JSON.stringify({ pid: 1234, port: 50000 }),
          "/project/.mcp-servers/beta.json": JSON.stringify({ pid: 5678, port: 50001 }),
        },
        new Set([1234, 5678]),
      );
      const manager = createPidFileManager(deps);

      await manager.cleanupAll();

      expect(killed).toContain(1234);
      expect(killed).toContain(5678);

      // Both files should be deleted (unlink called for each)
      expect(deps.fs.unlink).toHaveBeenCalledWith("/project/.mcp-servers/alpha.json");
      expect(deps.fs.unlink).toHaveBeenCalledWith("/project/.mcp-servers/beta.json");
    });

    it("creates directory if missing", async () => {
      const { deps } = makeDeps();
      const manager = createPidFileManager(deps);

      await manager.cleanupAll();

      expect(deps.fs.mkdir).toHaveBeenCalledWith("/project/.mcp-servers", { recursive: true });
    });

    it("handles empty directory", async () => {
      const { deps } = makeDeps();
      const manager = createPidFileManager(deps);

      // Should not throw
      await manager.cleanupAll();
    });

    it("deletes stale PID files for dead processes without killing", async () => {
      const { deps, killed } = makeDeps(
        {
          "/project/.mcp-servers/alpha.json": JSON.stringify({ pid: 9999, port: 50000 }),
        },
        new Set(), // No alive processes
      );
      const manager = createPidFileManager(deps);

      await manager.cleanupAll();

      expect(killed).toHaveLength(0); // No kill attempt for dead process
      expect(deps.fs.unlink).toHaveBeenCalledWith("/project/.mcp-servers/alpha.json");
    });

    it("cleans up .tmp files", async () => {
      const { deps } = makeDeps({
        "/project/.mcp-servers/.alpha.json.tmp": JSON.stringify({ pid: 1234, port: 50000 }),
      });
      const manager = createPidFileManager(deps);

      await manager.cleanupAll();

      expect(deps.fs.unlink).toHaveBeenCalledWith("/project/.mcp-servers/.alpha.json.tmp");
    });
  });

  describe("shutdownAll", () => {
    it("delegates to cleanupAll", async () => {
      const { deps, killed } = makeDeps(
        {
          "/project/.mcp-servers/alpha.json": JSON.stringify({ pid: 1234, port: 50000 }),
        },
        new Set([1234]),
      );
      const manager = createPidFileManager(deps);

      await manager.shutdownAll();

      expect(killed).toContain(1234);
      expect(deps.fs.unlink).toHaveBeenCalledWith("/project/.mcp-servers/alpha.json");
    });
  });
});
