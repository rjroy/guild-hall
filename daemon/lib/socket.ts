import * as fs from "node:fs";
import * as path from "node:path";
import { getGuildHallHome } from "@/lib/paths";

const SOCKET_NAME = "guild-hall.sock";
const PID_SUFFIX = ".pid";

/**
 * Returns the path to the daemon's Unix socket.
 * Defaults to ~/.guild-hall/guild-hall.sock.
 */
export function getSocketPath(guildHallHome?: string): string {
  const home = guildHallHome ?? getGuildHallHome();
  return path.join(home, SOCKET_NAME);
}

/**
 * Returns the PID file path for a given socket path.
 * Convention: socket path + ".pid" (e.g., guild-hall.sock.pid).
 */
export function pidFilePathFor(socketPath: string): string {
  return socketPath + PID_SUFFIX;
}

/**
 * Checks whether a process with the given PID is alive.
 * Sends signal 0 (no-op) to test existence.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Cleans up a stale socket left behind by a crashed daemon.
 *
 * If a PID file exists:
 *   - If the process is alive, throws (another daemon is running).
 *   - If the process is dead, removes both socket and PID file.
 *
 * If the socket file exists but no PID file, removes the socket
 * (unclean shutdown without PID tracking).
 *
 * If neither exists, does nothing.
 */
export function cleanStaleSocket(socketPath: string): void {
  const pidPath = pidFilePathFor(socketPath);
  const pidExists = fs.existsSync(pidPath);
  const socketExists = fs.existsSync(socketPath);

  if (pidExists) {
    const raw = fs.readFileSync(pidPath, "utf-8").trim();
    const pid = parseInt(raw, 10);

    if (isNaN(pid)) {
      // Corrupt PID file, remove both
      safeUnlink(pidPath);
      safeUnlink(socketPath);
      return;
    }

    if (isProcessAlive(pid)) {
      throw new Error(
        `Another daemon is already running (PID ${pid}). ` +
          `Socket: ${socketPath}`
      );
    }

    // Dead process, clean up
    safeUnlink(pidPath);
    safeUnlink(socketPath);
    return;
  }

  if (socketExists) {
    // Socket without PID file (unclean shutdown)
    safeUnlink(socketPath);
  }
}

/**
 * Writes the current process PID to the PID file for the given socket.
 * Creates parent directories if needed.
 */
export function writePidFile(socketPath: string): void {
  const pidPath = pidFilePathFor(socketPath);
  const dir = path.dirname(pidPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(pidPath, String(process.pid), "utf-8");
}

/**
 * Removes the PID file for the given socket.
 * No-op if the file doesn't exist.
 */
export function removePidFile(socketPath: string): void {
  safeUnlink(pidFilePathFor(socketPath));
}

/**
 * Removes the socket file. No-op if it doesn't exist.
 */
export function removeSocketFile(socketPath: string): void {
  safeUnlink(socketPath);
}

function safeUnlink(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw err;
  }
}
