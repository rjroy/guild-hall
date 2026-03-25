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
  getPortFilePath,
  writePortFile,
  removePortFile,
  cleanStalePort,
} from "@/daemon/lib/transport";

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
    expect(result).toBe(path.join("/tmp/test-gh", "guild-hall.sock"));
  });

  test("uses default guild-hall home when no override", () => {
    const result = getSocketPath();
    expect(result).toEndWith(path.join(".guild-hall", "guild-hall.sock"));
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

// --- TCP transport: port file functions ---

describe("getPortFilePath", () => {
  test("returns port file path under given guild-hall home", () => {
    const result = getPortFilePath("/tmp/test-gh");
    expect(result).toBe(path.join("/tmp/test-gh", "guild-hall.port"));
  });

  test("uses default guild-hall home when no override", () => {
    const result = getPortFilePath();
    expect(result).toEndWith(path.join(".guild-hall", "guild-hall.port"));
  });
});

describe("writePortFile / removePortFile", () => {
  test("round-trip: write port, read it back, remove, verify gone", () => {
    const tmp = makeTmpDir();
    const portFilePath = path.join(tmp, "guild-hall.port");

    writePortFile(portFilePath, 8080);
    const content = fs.readFileSync(portFilePath, "utf-8");
    expect(content).toBe("8080");

    removePortFile(portFilePath);
    expect(fs.existsSync(portFilePath)).toBe(false);
  });

  test("writePortFile creates parent directories if needed", () => {
    const tmp = makeTmpDir();
    const portFilePath = path.join(tmp, "nested", "dir", "guild-hall.port");

    writePortFile(portFilePath, 3000);
    expect(fs.existsSync(portFilePath)).toBe(true);
    expect(fs.readFileSync(portFilePath, "utf-8")).toBe("3000");
  });

  test("removePortFile is no-op when file does not exist", () => {
    const tmp = makeTmpDir();
    const portFilePath = path.join(tmp, "guild-hall.port");
    // Should not throw
    removePortFile(portFilePath);
  });
});

describe("cleanStalePort", () => {
  test("does nothing when neither port nor PID file exists", () => {
    const tmp = makeTmpDir();
    const portFilePath = path.join(tmp, "guild-hall.port");
    // Should not throw
    cleanStalePort(portFilePath);
    expect(fs.existsSync(portFilePath)).toBe(false);
  });

  test("removes orphaned port file when no PID file exists", () => {
    const tmp = makeTmpDir();
    const portFilePath = path.join(tmp, "guild-hall.port");
    fs.writeFileSync(portFilePath, "8080");

    cleanStalePort(portFilePath);
    expect(fs.existsSync(portFilePath)).toBe(false);
  });

  test("removes port and PID file when process is dead", () => {
    const tmp = makeTmpDir();
    const portFilePath = path.join(tmp, "guild-hall.port");
    const pidPath = pidFilePathFor(portFilePath);

    fs.writeFileSync(portFilePath, "8080");
    // Use a PID that almost certainly doesn't exist.
    const deadPid = 4194304 + Math.floor(Math.random() * 1000000);
    fs.writeFileSync(pidPath, String(deadPid));

    cleanStalePort(portFilePath);
    expect(fs.existsSync(portFilePath)).toBe(false);
    expect(fs.existsSync(pidPath)).toBe(false);
  });

  test("throws when PID file references a live process", () => {
    const tmp = makeTmpDir();
    const portFilePath = path.join(tmp, "guild-hall.port");
    const pidPath = pidFilePathFor(portFilePath);

    fs.writeFileSync(portFilePath, "8080");
    // Use the current process PID, which is definitely alive
    fs.writeFileSync(pidPath, String(process.pid));

    expect(() => cleanStalePort(portFilePath)).toThrow(
      /Another daemon is already running/
    );
    // Port and PID file should still exist (not cleaned up)
    expect(fs.existsSync(portFilePath)).toBe(true);
    expect(fs.existsSync(pidPath)).toBe(true);
  });

  test("removes corrupt PID file and port file", () => {
    const tmp = makeTmpDir();
    const portFilePath = path.join(tmp, "guild-hall.port");
    const pidPath = pidFilePathFor(portFilePath);

    fs.writeFileSync(portFilePath, "8080");
    fs.writeFileSync(pidPath, "not-a-number");

    cleanStalePort(portFilePath);
    expect(fs.existsSync(portFilePath)).toBe(false);
    expect(fs.existsSync(pidPath)).toBe(false);
  });
});

describe("Bun.serve TCP compatibility", () => {
  test("Bun.serve({ port: 0 }) supports idleTimeout: 0", () => {
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response("ok"),
      idleTimeout: 0 as never,
    });
    expect(server.port).toBeGreaterThan(0);
    server.stop();
  });
});
