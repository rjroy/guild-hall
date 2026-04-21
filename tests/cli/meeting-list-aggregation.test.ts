import { describe, test, expect } from "bun:test";
import { mergeMeetingAggregate, runCli, type CliDeps } from "@/cli/index";
import type { DaemonError } from "@/lib/daemon-client";

describe("mergeMeetingAggregate", () => {
  const requested = [
    { meetingId: "r-1", projectName: "p1", worker: "Octavia", status: "requested", date: "2026-03-20" },
    { meetingId: "r-2", projectName: "p1", worker: "Thorne", status: "requested", date: "2026-03-18" },
  ];
  const active = [
    { meetingId: "a-1", projectName: "p2", workerName: "Dalton", status: "active", startedAt: "2026-03-19T12:00:00.000Z" },
    { meetingId: "a-2", projectName: "p2", workerName: "Verity", status: "active", startedAt: "" }, // m-4
  ];

  test("--state=requested returns only requested rows", () => {
    const merged = mergeMeetingAggregate(requested, active, "requested");
    expect(merged.every((m) => m.source === "requested")).toBe(true);
    expect(merged).toHaveLength(2);
  });

  test("--state=active returns only active rows", () => {
    const merged = mergeMeetingAggregate(requested, active, "active");
    expect(merged.every((m) => m.source === "active")).toBe(true);
    expect(merged).toHaveLength(2);
  });

  test("--state=all returns everything", () => {
    const merged = mergeMeetingAggregate(requested, active, "all");
    expect(merged).toHaveLength(4);
    const sources = merged.map((m) => m.source).sort();
    expect(sources).toEqual(["active", "active", "requested", "requested"]);
  });

  test("sorts by startedAt descending", () => {
    const merged = mergeMeetingAggregate(
      [
        { meetingId: "r-old", date: "2026-01-01" },
        { meetingId: "r-new", date: "2026-05-01" },
      ],
      [],
      "all",
    );
    expect(merged[0].meetingId).toBe("r-new");
    expect(merged[1].meetingId).toBe("r-old");
  });

  // m-4: empty startedAt must not render as 1970-01-01 or break sort.
  // We chose "push-to-end" — dated rows sort first, empties at the tail.
  test("m-4: rows with empty startedAt are pushed to the end", () => {
    const merged = mergeMeetingAggregate(
      [],
      [
        { meetingId: "has-date", startedAt: "2026-03-19T12:00:00.000Z" },
        { meetingId: "no-date", startedAt: "" },
        { meetingId: "also-dated", startedAt: "2026-02-19T12:00:00.000Z" },
      ],
      "active",
    );
    expect(merged[0].meetingId).toBe("has-date");
    expect(merged[1].meetingId).toBe("also-dated");
    expect(merged[2].meetingId).toBe("no-date");
    expect(merged[2].startedAt).toBe("");
  });

  test("m-4: multiple empty startedAt rows preserve relative order", () => {
    const merged = mergeMeetingAggregate(
      [],
      [
        { meetingId: "empty-1", startedAt: "" },
        { meetingId: "has-date", startedAt: "2026-03-19T12:00:00.000Z" },
        { meetingId: "empty-2", startedAt: "" },
      ],
      "active",
    );
    expect(merged[0].meetingId).toBe("has-date");
    // Both empty rows land at the end; stable sort preserves input order.
    expect(merged[1].meetingId).toBe("empty-1");
    expect(merged[2].meetingId).toBe("empty-2");
  });
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeDeps(
  fetches: Array<{ path: string; response: Response | DaemonError }>,
): {
  deps: CliDeps;
  calls: string[];
} {
  const calls: string[] = [];
  let idx = 0;
  const deps: CliDeps = {
    daemonFetch: (path: string) => {
      calls.push(path);
      const expected = fetches[idx++];
      if (!expected) {
        return Promise.reject(new Error(`Unexpected daemon fetch: ${path}`));
      }
      if (expected.path !== path && !path.startsWith(expected.path)) {
        return Promise.reject(
          new Error(`Path mismatch: expected ${expected.path}, got ${path}`),
        );
      }
      return Promise.resolve(expected.response);
    },
    streamOperation: () =>
      Promise.reject(new Error("streamOperation not expected in this test")),
  };
  return { deps, calls };
}

describe("runCli — meeting list aggregate end-to-end", () => {
  test("--state=active fans out only to the session list", async () => {
    const { deps, calls } = makeDeps([
      {
        path: "/meeting/session/meeting/list",
        response: jsonResponse({
          sessions: [
            {
              meetingId: "audience-Dalton-20260320-120000",
              projectName: "guild-hall",
              workerName: "Dalton",
              startedAt: "2026-03-20T12:00:00.000Z",
              status: "active",
            },
          ],
        }),
      },
    ]);

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    try {
      await runCli(
        ["meeting", "list", "--state=active", "--json"],
        deps,
      );
    } finally {
      console.log = origLog;
    }

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe("/meeting/session/meeting/list");
    const parsed = JSON.parse(logs[0]) as { meetings: Array<{ meetingId: string }> };
    expect(parsed.meetings[0].meetingId).toBe("audience-Dalton-20260320-120000");
  });

  test("--state=requested with --projectName fans out to request list only", async () => {
    const { deps, calls } = makeDeps([
      {
        path: "/meeting/request/meeting/list",
        response: jsonResponse({
          meetings: [
            {
              meetingId: "audience-Octavia-20260321-100000",
              projectName: "guild-hall",
              worker: "Octavia",
              date: "2026-03-21",
              status: "requested",
            },
          ],
        }),
      },
    ]);

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    try {
      await runCli(
        ["meeting", "list", "--state=requested", "--projectName=guild-hall", "--json"],
        deps,
      );
    } finally {
      console.log = origLog;
    }

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/meeting/request/meeting/list?projectName=guild-hall");
  });

  test("--state=all with --projectName fans out to both", async () => {
    const { deps, calls } = makeDeps([
      {
        path: "/meeting/request/meeting/list",
        response: jsonResponse({ meetings: [] }),
      },
      {
        path: "/meeting/session/meeting/list",
        response: jsonResponse({ sessions: [] }),
      },
    ]);

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    try {
      await runCli(["meeting", "list", "--projectName=guild-hall", "--json"], deps);
    } finally {
      console.log = origLog;
    }

    expect(calls).toHaveLength(2);
    const parsed = JSON.parse(logs[0]) as { meetings: unknown[] };
    expect(parsed.meetings).toEqual([]);
  });
});
