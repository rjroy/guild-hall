import * as fs from "node:fs/promises";
import * as path from "node:path";

import { SessionStore, type SessionFileSystem } from "./session-store";

/**
 * Creates a SessionStore backed by the real Node.js filesystem,
 * rooted at the given directory.
 */
export function createNodeSessionStore(dir: string): SessionStore {
  const nodeFs: SessionFileSystem = {
    readdir: (dirPath: string) => fs.readdir(dirPath),
    readFile: (filePath: string) => fs.readFile(filePath, "utf-8"),
    writeFile: (filePath: string, content: string) =>
      fs.writeFile(filePath, content, "utf-8"),
    appendFile: (filePath: string, content: string) =>
      fs.appendFile(filePath, content, "utf-8"),
    mkdir: (dirPath: string, options?: { recursive?: boolean }) =>
      fs.mkdir(dirPath, options).then(() => undefined),
    rmdir: (dirPath: string) =>
      fs.rm(dirPath, { recursive: true, force: true }).then(() => undefined),
    stat: (filePath: string) => fs.stat(filePath),
    access: (filePath: string) => fs.access(filePath),
  };
  return new SessionStore(dir, nodeFs);
}

export const sessionsDir =
  process.env.SESSIONS_DIR ?? path.resolve("./sessions");

export const sessionStore = createNodeSessionStore(sessionsDir);
