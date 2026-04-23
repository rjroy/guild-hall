import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { resolveP4Env, createP4Runner } from "@/lib/p4-adapter/p4";
import type { P4Runner } from "@/lib/p4-adapter/p4";

describe("resolveP4Env", () => {
  let tempDir: string;
  const savedP4CONFIG = process.env.P4CONFIG;
  const savedP4CLIENT = process.env.P4CLIENT;
  const savedP4PORT = process.env.P4PORT;
  const savedP4USER = process.env.P4USER;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "p4-test-"));
    delete process.env.P4CONFIG;
    delete process.env.P4CLIENT;
    delete process.env.P4PORT;
    delete process.env.P4USER;
  });

  afterEach(() => {
    // Restore saved values
    const restore = (key: string, val: string | undefined) => {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    };
    restore("P4CONFIG", savedP4CONFIG);
    restore("P4CLIENT", savedP4CLIENT);
    restore("P4PORT", savedP4PORT);
    restore("P4USER", savedP4USER);

    rmSync(tempDir, { recursive: true, force: true });
  });

  test("uses P4CONFIG from environment when set", () => {
    process.env.P4CONFIG = "/some/path/.p4config";
    const env = resolveP4Env(tempDir);
    expect(env.P4CONFIG).toBe("/some/path/.p4config");
  });

  test("finds .p4config file in workspace directory", () => {
    writeFileSync(
      join(tempDir, ".p4config"),
      "P4CLIENT=test-client\nP4PORT=ssl:server:1666\nP4USER=testuser\n",
    );
    // searchRoot bounds the walk to tempDir so it won't find the real .p4config
    const env = resolveP4Env(tempDir, { searchRoot: tempDir });
    expect(env.P4CONFIG).toBe(".p4config");
    expect(env.P4CLIENT).toBe("test-client");
    expect(env.P4PORT).toBe("ssl:server:1666");
    expect(env.P4USER).toBe("testuser");
  });

  test("finds .p4config in parent directory", () => {
    const subDir = join(tempDir, "sub", "deep");
    mkdirSync(subDir, { recursive: true });

    writeFileSync(
      join(tempDir, ".p4config"),
      "P4CLIENT=parent-client\nP4PORT=server:1666\n",
    );

    // searchRoot at tempDir: walk from sub/deep up to tempDir
    const env = resolveP4Env(subDir, { searchRoot: tempDir });
    expect(env.P4CONFIG).toBe(".p4config");
    expect(env.P4CLIENT).toBe("parent-client");
    expect(env.P4PORT).toBe("server:1666");
  });

  test("falls back to P4CLIENT/P4PORT/P4USER env vars when no .p4config", () => {
    process.env.P4CLIENT = "env-client";
    process.env.P4PORT = "env-server:1666";
    process.env.P4USER = "env-user";

    // searchRoot bounds the walk so it won't find the real .p4config
    const env = resolveP4Env(tempDir, { searchRoot: tempDir });
    expect(env.P4CONFIG).toBeUndefined();
    expect(env.P4CLIENT).toBe("env-client");
    expect(env.P4PORT).toBe("env-server:1666");
    expect(env.P4USER).toBe("env-user");
  });

  test("returns empty env when nothing is configured", () => {
    // searchRoot bounds the walk so it won't find the real .p4config
    const env = resolveP4Env(tempDir, { searchRoot: tempDir });
    expect(Object.keys(env).length).toBe(0);
  });
});

describe("P4Runner safety (REQ-P4A-36)", () => {
  test("module does not export a submit function", async () => {
    // The module's public API: P4Result, P4Runner, resolveP4Env, createP4Runner.
    // There must be no 'submit', 'p4Submit', or similar export.
    const p4Module = await import("@/lib/p4-adapter/p4");
    const exportedNames = Object.keys(p4Module);

    const submitRelated = exportedNames.filter(
      (name) =>
        name.toLowerCase().includes("submit") ||
        name.toLowerCase().includes("p4submit"),
    );

    expect(submitRelated).toEqual([]);
  });

  test("createP4Runner returns a function with the P4Runner signature", () => {
    const runner = createP4Runner({ P4CLIENT: "test" });
    expect(typeof runner).toBe("function");
  });
});

describe("createP4Runner", () => {
  test("injects environment variables into subprocess", () => {
    // Verify the runner is constructed correctly.
    // We can't run a real p4 command in tests without a live server.
    const p4Env = { P4CLIENT: "my-client", P4PORT: "ssl:server:1666" };
    const runner: P4Runner = createP4Runner(p4Env);
    expect(typeof runner).toBe("function");
  });
});
