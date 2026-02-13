import type { SessionFileSystem } from "@/lib/session-store";

type MockFiles = Record<string, string>;
type MockDirs = Set<string>;

/**
 * Creates an in-memory SessionFileSystem for testing session store operations.
 * Supports readdir, readFile, writeFile, appendFile, mkdir, stat, and access.
 *
 * The files and dirs maps are mutated by write operations, so tests can inspect
 * them after calling store methods.
 */
export function createMockSessionFs(
  files: MockFiles,
  dirs: MockDirs,
): SessionFileSystem & { files: MockFiles; dirs: MockDirs } {
  const fsImpl: SessionFileSystem & { files: MockFiles; dirs: MockDirs } = {
    files,
    dirs,

    readdir(dirPath: string): Promise<string[]> {
      const prefix = dirPath.endsWith("/") ? dirPath : `${dirPath}/`;
      const children = new Set<string>();

      for (const d of dirs) {
        if (d.startsWith(prefix) && d !== dirPath) {
          const relative = d.slice(prefix.length);
          if (!relative.includes("/")) {
            children.add(relative);
          }
        }
      }

      for (const f of Object.keys(files)) {
        if (f.startsWith(prefix)) {
          const relative = f.slice(prefix.length);
          const firstSegment = relative.split("/")[0];
          if (firstSegment && !firstSegment.includes("/")) {
            children.add(firstSegment);
          }
        }
      }

      if (children.size === 0 && !dirs.has(dirPath)) {
        return Promise.reject(
          new Error(`ENOENT: no such directory '${dirPath}'`),
        );
      }

      return Promise.resolve(Array.from(children));
    },

    readFile(filePath: string): Promise<string> {
      if (filePath in files) {
        return Promise.resolve(files[filePath]);
      }
      return Promise.reject(
        new Error(`ENOENT: no such file '${filePath}'`),
      );
    },

    writeFile(filePath: string, content: string): Promise<void> {
      files[filePath] = content;
      return Promise.resolve();
    },

    appendFile(filePath: string, content: string): Promise<void> {
      if (filePath in files) {
        files[filePath] += content;
      } else {
        files[filePath] = content;
      }
      return Promise.resolve();
    },

    mkdir(dirPath: string): Promise<void> {
      dirs.add(dirPath);
      return Promise.resolve();
    },

    rmdir(dirPath: string): Promise<void> {
      const prefix = dirPath.endsWith("/") ? dirPath : `${dirPath}/`;

      // Remove all files under this directory
      for (const f of Object.keys(files)) {
        if (f.startsWith(prefix)) {
          delete files[f];
        }
      }

      // Remove all subdirectories
      for (const d of dirs) {
        if (d === dirPath || d.startsWith(prefix)) {
          dirs.delete(d);
        }
      }

      return Promise.resolve();
    },

    stat(filePath: string): Promise<{ isDirectory(): boolean }> {
      if (dirs.has(filePath)) {
        return Promise.resolve({ isDirectory: () => true });
      }
      if (filePath in files) {
        return Promise.resolve({ isDirectory: () => false });
      }
      return Promise.reject(
        new Error(`ENOENT: no such file or directory '${filePath}'`),
      );
    },

    access(filePath: string): Promise<void> {
      if (dirs.has(filePath) || filePath in files) {
        return Promise.resolve();
      }
      return Promise.reject(
        new Error(`ENOENT: no such file or directory '${filePath}'`),
      );
    },
  };

  return fsImpl;
}
