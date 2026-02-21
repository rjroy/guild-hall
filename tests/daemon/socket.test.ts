import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  getSocketPath,
  pidFilePathFor,
  cleanStaleSocket,
  writePidFile,
  removePidFile,
  removeSocketFile,
} from "@/daemon/lib/socket";

let tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gh-socket-test-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

describe("getSocketPath", () => {
  test("returns socket path under given guild-hall home", () => {
    const result = getSocketPath("/tmp/test-gh");
    expect(result).toBe("/tmp/test-gh/guild-hall.sock");
  });

  test("uses default guild-hall home when no override", () => {
    const result = getSocketPath();
    expect(result).toEndWith(".guild-hall/guild-hall.sock");
  });
});

describe("pidFilePathFor", () => {
  test("appends .pid to socket path", () => {
    expect(pidFilePathFor("/tmp/guild-hall.sock")).toBe(
      "/tmp/guild-hall.sock.pid"
    );
  });
});

describe("cleanStaleSocket", () => {
  test("does nothing when neither socket nor PID file exists", () => {
    const tmp = makeTmpDir();
    const socketPath = path.join(tmp, "guild-hall.sock");
    // Should not throw
    cleanStaleSocket(socketPath);
    expect(fs.existsSync(socketPath)).toBe(false);
  });

  test("removes orphaned socket when no PID file exists", () => {
    const tmp = makeTmpDir();
    const socketPath = path.join(tmp, "guild-hall.sock");
    fs.writeFileSync(socketPath, ""); // Simulate stale socket file
    cleanStaleSocket(socketPath);
    expect(fs.existsSync(socketPath)).toBe(false);
  });

  test("removes socket and PID file when process is dead", () => {
    const tmp = makeTmpDir();
    const socketPath = path.join(tmp, "guild-hall.sock");
    const pidPath = pidFilePathFor(socketPath);

    fs.writeFileSync(socketPath, "");
    // Use a PID that almost certainly doesn't exist.
    // PID 2^22 + random offset is very unlikely to be alive.
    const deadPid = 4194304 + Math.floor(Math.random() * 1000000);
    fs.writeFileSync(pidPath, String(deadPid));

    cleanStaleSocket(socketPath);
    expect(fs.existsSync(socketPath)).toBe(false);
    expect(fs.existsSync(pidPath)).toBe(false);
  });

  test("throws when PID file references a live process", () => {
    const tmp = makeTmpDir();
    const socketPath = path.join(tmp, "guild-hall.sock");
    const pidPath = pidFilePathFor(socketPath);

    fs.writeFileSync(socketPath, "");
    // Use the current process PID, which is definitely alive
    fs.writeFileSync(pidPath, String(process.pid));

    expect(() => cleanStaleSocket(socketPath)).toThrow(
      /Another daemon is already running/
    );
    // Socket and PID file should still exist (not cleaned up)
    expect(fs.existsSync(socketPath)).toBe(true);
    expect(fs.existsSync(pidPath)).toBe(true);
  });

  test("removes corrupt PID file and socket", () => {
    const tmp = makeTmpDir();
    const socketPath = path.join(tmp, "guild-hall.sock");
    const pidPath = pidFilePathFor(socketPath);

    fs.writeFileSync(socketPath, "");
    fs.writeFileSync(pidPath, "not-a-number");

    cleanStaleSocket(socketPath);
    expect(fs.existsSync(socketPath)).toBe(false);
    expect(fs.existsSync(pidPath)).toBe(false);
  });
});

describe("writePidFile", () => {
  test("writes current PID to file", () => {
    const tmp = makeTmpDir();
    const socketPath = path.join(tmp, "guild-hall.sock");
    writePidFile(socketPath);

    const pidPath = pidFilePathFor(socketPath);
    const content = fs.readFileSync(pidPath, "utf-8");
    expect(content).toBe(String(process.pid));
  });

  test("creates parent directories if needed", () => {
    const tmp = makeTmpDir();
    const socketPath = path.join(tmp, "nested", "dir", "guild-hall.sock");
    writePidFile(socketPath);

    const pidPath = pidFilePathFor(socketPath);
    expect(fs.existsSync(pidPath)).toBe(true);
  });
});

describe("removePidFile", () => {
  test("removes existing PID file", () => {
    const tmp = makeTmpDir();
    const socketPath = path.join(tmp, "guild-hall.sock");
    const pidPath = pidFilePathFor(socketPath);
    fs.writeFileSync(pidPath, "12345");

    removePidFile(socketPath);
    expect(fs.existsSync(pidPath)).toBe(false);
  });

  test("no-op when PID file does not exist", () => {
    const tmp = makeTmpDir();
    const socketPath = path.join(tmp, "guild-hall.sock");
    // Should not throw
    removePidFile(socketPath);
  });
});

describe("removeSocketFile", () => {
  test("removes existing socket file", () => {
    const tmp = makeTmpDir();
    const socketPath = path.join(tmp, "guild-hall.sock");
    fs.writeFileSync(socketPath, "");

    removeSocketFile(socketPath);
    expect(fs.existsSync(socketPath)).toBe(false);
  });

  test("no-op when socket file does not exist", () => {
    const tmp = makeTmpDir();
    const socketPath = path.join(tmp, "guild-hall.sock");
    // Should not throw
    removeSocketFile(socketPath);
  });
});
