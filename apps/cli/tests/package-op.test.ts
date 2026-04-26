import { describe, test, expect } from "bun:test";
import { runCli, type CliDeps, type OperationsRegistryView } from "@/apps/cli/index";
import type { DaemonError } from "@/lib/daemon-client";
import type { OperationDefinition } from "@/lib/types";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface Call {
  path: string;
  method?: string;
  body?: string;
}

function makeDeps(responses: Array<Response | DaemonError>): {
  deps: CliDeps;
  calls: Call[];
} {
  const calls: Call[] = [];
  let idx = 0;
  const deps: CliDeps = {
    daemonFetch: (path, options) => {
      calls.push({ path, method: options?.method, body: options?.body });
      const next = responses[idx++];
      if (!next) {
        return Promise.reject(new Error(`No more responses queued for ${path}`));
      }
      return Promise.resolve(next);
    },
    streamOperation: () =>
      Promise.reject(new Error("streamOperation not expected")),
  };
  return { deps, calls };
}

function captureStdout(): { logs: string[]; restore: () => void } {
  const logs: string[] = [];
  const orig = console.log.bind(console);
  console.log = (msg: string) => logs.push(msg);
  return { logs, restore: () => { console.log = orig; } };
}

function captureStderr(): { errs: string[]; restore: () => void } {
  const errs: string[] = [];
  const orig = console.error.bind(console);
  console.error = (msg: string) => errs.push(msg);
  return { errs, restore: () => { console.error = orig; } };
}

describe("package-op fallback (REQ-CLI-AGENT-13)", () => {
  test("infers POST /my/custom/op and body from positional args when no registry is wired", async () => {
    const { deps, calls } = makeDeps([jsonResponse({ ok: true })]);
    const { logs, restore } = captureStdout();
    try {
      await runCli(
        ["package-op", "invoke", "my.custom.op", "value-a", "value-b", "--json"],
        deps,
      );
    } finally {
      restore();
    }

    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe("/my/custom/op");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toBeDefined();
    const body = JSON.parse(calls[0].body!) as Record<string, string>;
    // Without registry, parameters are synthesized as arg0, arg1, ... (body)
    expect(body.arg0).toBe("value-a");
    expect(body.arg1).toBe("value-b");

    const parsed = JSON.parse(logs[0]) as { ok: boolean };
    expect(parsed.ok).toBe(true);
  });

  test("infers GET /some/thing/list and query string for read-shaped verbs", async () => {
    const { deps, calls } = makeDeps([jsonResponse({ items: [] })]);
    const { restore } = captureStdout();
    try {
      await runCli(
        ["package-op", "invoke", "some.thing.list", "only-value", "--json"],
        deps,
      );
    } finally {
      restore();
    }

    expect(calls).toHaveLength(1);
    // "list" is a GET verb — params become query string, no body.
    expect(calls[0].path).toBe("/some/thing/list?arg0=only-value");
    expect(calls[0].method).toBe("GET");
    expect(calls[0].body).toBeUndefined();
  });

  test("uses registry parameters when the registry view is injected", async () => {
    const registry: OperationsRegistryView = {
      get(operationId: string): OperationDefinition | undefined {
        if (operationId !== "my.custom.op") return undefined;
        return {
          operationId: "my.custom.op",
          version: "1",
          name: "op",
          description: "Custom op",
          invocation: { method: "POST", path: "/my/custom/op" },
          sideEffects: "",
          context: {},
          idempotent: false,
          hierarchy: { root: "my", feature: "custom" },
          parameters: [
            { name: "projectName", required: true, in: "body" },
            { name: "note", required: false, in: "body" },
          ],
        } as unknown as OperationDefinition;
      },
    };
    const { deps, calls } = makeDeps([jsonResponse({ ok: true })]);
    deps.operationsRegistry = registry;

    const { restore } = captureStdout();
    try {
      await runCli(
        ["package-op", "invoke", "my.custom.op", "proj", "hello", "--json"],
        deps,
      );
    } finally {
      restore();
    }

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body!) as Record<string, string>;
    // Registry-provided parameter names should win over synthesized arg0/arg1.
    expect(body.projectName).toBe("proj");
    expect(body.note).toBe("hello");
    expect(body.arg0).toBeUndefined();
  });

  test("unknown command when no target operationId is provided", async () => {
    const { deps, calls } = makeDeps([]);
    const { errs, restore: restoreErr } = captureStderr();
    const origExit = process.exit.bind(process);
    let exitCode: number | undefined;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error("__exit__");
    }) as typeof process.exit;
    try {
      await runCli(["package-op", "invoke"], deps);
    } catch (err) {
      if (!(err instanceof Error) || err.message !== "__exit__") throw err;
    } finally {
      process.exit = origExit;
      restoreErr();
    }

    expect(exitCode).toBe(1);
    expect(calls).toHaveLength(0);
    expect(errs.join("\n")).toMatch(/Unknown command/);
  });

  test("forwards boolean flags (like --dry-run) into the request body for POST ops", async () => {
    const { deps, calls } = makeDeps([jsonResponse({ ok: true })]);
    const { restore } = captureStdout();
    try {
      await runCli(
        ["package-op", "invoke", "my.custom.op", "value-a", "--dry-run", "--json"],
        deps,
      );
    } finally {
      restore();
    }

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body!) as Record<string, unknown>;
    expect(body.arg0).toBe("value-a");
    expect(body["dry-run"]).toBe(true);
  });
});
