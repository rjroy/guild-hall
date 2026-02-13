import type { FileSystem } from "@/lib/plugin-discovery";

type MockFiles = Record<string, string>;
type MockDirs = Set<string>;

/**
 * Creates an in-memory FileSystem from a map of file paths to contents
 * and a set of directory paths. Useful for testing plugin discovery
 * without touching the real filesystem.
 */
export function createMockFs(files: MockFiles, dirs: MockDirs): FileSystem {
  return {
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
          if (firstSegment) {
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
  };
}
