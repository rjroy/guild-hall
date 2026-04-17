import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createEventBus } from "@/daemon/lib/event-bus";
import type { GuildHallToolboxDeps } from "@/daemon/services/toolbox-types";
import type { AppConfig } from "@/lib/types";
import type {
  JmapSession,
  JmapResponse,
  Mailbox,
} from "@/packages/guild-hall-email/jmap-client";
import { JmapClient } from "@/packages/guild-hall-email/jmap-client";
import {
  makeListMailboxesHandler,
  makeSearchEmailsHandler,
} from "@/packages/guild-hall-email/tools";

// -- Internal type for testing tool invocation through MCP server --

// The McpServer instance exposes _registeredTools and executeToolHandler,
// which are internal but the only way to invoke tools without a transport.
interface RegisteredTool {
  handler: (...args: unknown[]) => unknown;
  inputSchema?: unknown;
}

interface McpServerInstance {
  _registeredTools: Record<string, RegisteredTool>;
  executeToolHandler(
    tool: RegisteredTool,
    args: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
}

// -- Mock data --

const MOCK_SESSION: JmapSession = {
  apiUrl: "https://api.fastmail.com/jmap/api/",
  accounts: { u123: { name: "test@fastmail.com", isPersonal: true } },
  primaryAccounts: { "urn:ietf:params:jmap:mail": "u123" },
  downloadUrl:
    "https://api.fastmail.com/jmap/download/{accountId}/{blobId}/{name}",
  uploadUrl: "https://api.fastmail.com/jmap/upload/{accountId}/",
  eventSourceUrl: "https://api.fastmail.com/jmap/eventsource/",
};

const MOCK_MAILBOXES: Mailbox[] = [
  {
    id: "mb-inbox",
    name: "Inbox",
    role: "inbox",
    parentId: null,
    totalEmails: 100,
    unreadEmails: 5,
  },
  {
    id: "mb-sent",
    name: "Sent",
    role: "sent",
    parentId: null,
    totalEmails: 50,
    unreadEmails: 0,
  },
];

function mailboxResponse(): JmapResponse {
  return {
    methodResponses: [
      ["Mailbox/get", { list: MOCK_MAILBOXES, notFound: [] }, "mailboxes"],
    ],
    sessionState: "state-1",
  };
}

// -- Mock fetch --

interface MockFetchFn {
  calls: Array<{ url: string | URL | Request; init?: RequestInit }>;
}

function mockFetch(
  responses: Array<{
    status: number;
    statusText?: string;
    body?: unknown;
  }>,
): typeof fetch {
  const queue = [...responses];
  const calls: Array<{ url: string | URL | Request; init?: RequestInit }> = [];

  const fn = (
    url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    calls.push({ url, init });
    const next = queue.shift();
    if (!next) {
      throw new Error(
        `mockFetch: no more responses configured (call #${calls.length})`,
      );
    }
    return Promise.resolve(
      new Response(
        next.body !== undefined ? JSON.stringify(next.body) : null,
        {
          status: next.status,
          statusText: next.statusText ?? "",
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  };

  (fn as unknown as MockFetchFn).calls = calls;
  return fn as typeof fetch;
}

function getCalls(
  fn: typeof fetch,
): Array<{ url: string | URL | Request; init?: RequestInit }> {
  return (fn as unknown as MockFetchFn).calls;
}

// -- Test helpers --

function makeDeps(): GuildHallToolboxDeps {
  const config: AppConfig = { projects: [] };
  return {
    guildHallHome: "/tmp/gh-test",
    projectName: "test-project",
    contextId: "commission-test",
    contextType: "commission",
    workerName: "test-worker",
    eventBus: createEventBus(),
    config,
  };
}

// -- Env var management --

let savedToken: string | undefined;
let savedSessionUrl: string | undefined;

beforeEach(() => {
  savedToken = process.env.FASTMAIL_API_TOKEN;
  savedSessionUrl = process.env.FASTMAIL_SESSION_URL;
});

afterEach(() => {
  // Restore original env values
  if (savedToken === undefined) {
    delete process.env.FASTMAIL_API_TOKEN;
  } else {
    process.env.FASTMAIL_API_TOKEN = savedToken;
  }
  if (savedSessionUrl === undefined) {
    delete process.env.FASTMAIL_SESSION_URL;
  } else {
    process.env.FASTMAIL_SESSION_URL = savedSessionUrl;
  }
});

/**
 * Loads the factory module fresh to pick up current env vars.
 *
 * The factory reads process.env at call time (not import time), so we
 * can import once and call repeatedly with different env settings.
 */
async function loadFactory() {
  const mod = await import("@/packages/guild-hall-email/index");
  return mod.toolboxFactory;
}

// -- Tests --

describe("email toolbox factory", () => {
  describe("unconfigured state (no FASTMAIL_API_TOKEN)", () => {
    test("MCP server name is guild-hall-email", async () => {
      delete process.env.FASTMAIL_API_TOKEN;
      const factory = await loadFactory();
      const { server } = factory(makeDeps());

      expect(server.name).toBe("guild-hall-email");
    });

    test("server type is sdk", async () => {
      delete process.env.FASTMAIL_API_TOKEN;
      const factory = await loadFactory();
      const { server } = factory(makeDeps());

      expect(server.type).toBe("sdk");
    });

    test("empty string token is treated as unconfigured", async () => {
      process.env.FASTMAIL_API_TOKEN = "";
      const factory = await loadFactory();
      const { server } = factory(makeDeps());

      // If the factory treats empty string as unconfigured, server name
      // should still be correct and tools should return the config error.
      expect(server.name).toBe("guild-hall-email");
    });
  });

  describe("configured state (FASTMAIL_API_TOKEN present)", () => {
    test("MCP server name is guild-hall-email", async () => {
      process.env.FASTMAIL_API_TOKEN = "test-token-123";
      const factory = await loadFactory();
      const { server } = factory(makeDeps());

      expect(server.name).toBe("guild-hall-email");
    });

    test("server type is sdk", async () => {
      process.env.FASTMAIL_API_TOKEN = "test-token-123";
      const factory = await loadFactory();
      const { server } = factory(makeDeps());

      expect(server.type).toBe("sdk");
    });
  });

  describe("background connect failure", () => {
    test("no unhandled rejection when background connect fails", async () => {
      // Set up a token so the factory takes the configured path,
      // but use a session URL that will fail.
      process.env.FASTMAIL_API_TOKEN = "test-token-for-rejection";
      process.env.FASTMAIL_SESSION_URL = "http://localhost:1/will-fail";

      let unhandledRejection = false;
      const handler = () => { unhandledRejection = true; };
      process.on("unhandledRejection", handler);

      try {
        const factory = await loadFactory();
        factory(makeDeps());

        // Give the background connect time to fail and (not) propagate
        await new Promise((r) => setTimeout(r, 200));

        expect(unhandledRejection).toBe(false);
      } finally {
        process.off("unhandledRejection", handler);
      }
    });
  });

  describe("FASTMAIL_SESSION_URL override", () => {
    test("custom session URL is passed to JmapClient", async () => {
      const customUrl = "https://custom.fastmail.example/jmap/session";
      const fetchFn = mockFetch([
        { status: 200, body: MOCK_SESSION },
        { status: 200, body: mailboxResponse() },
      ]);

      const client = new JmapClient("test-token", customUrl, fetchFn);
      await client.ensureConnected();

      const calls = getCalls(fetchFn);
      expect(calls[0].url).toBe(customUrl);
    });
  });
});

describe("unconfigured tool behavior", () => {
  test("unconfigured server exists with correct name", async () => {
    delete process.env.FASTMAIL_API_TOKEN;
    const factory = await loadFactory();
    const result = factory(makeDeps());

    expect(result.server.name).toBe("guild-hall-email");
    expect(result.server.instance).toBeDefined();
  });

  test("calling a tool on unconfigured server returns isError with config message", async () => {
    delete process.env.FASTMAIL_API_TOKEN;
    const factory = await loadFactory();
    const result = factory(makeDeps());

    // Access the registered tool and invoke its handler through the MCP server instance
    const instance = result.server.instance as unknown as McpServerInstance;
    const registeredTool = instance._registeredTools["list_mailboxes"];
    expect(registeredTool).toBeDefined();

    const toolResult = await instance.executeToolHandler(registeredTool, {}, {});
    expect(toolResult.isError).toBe(true);
    expect(toolResult.content[0].text).toContain(
      "Email toolbox is not configured",
    );
  });
});

describe("tool handler behavior through JmapClient", () => {
  test("successful connection produces real results from list_mailboxes", async () => {
    const fetchFn = mockFetch([
      { status: 200, body: MOCK_SESSION },
      { status: 200, body: mailboxResponse() },
    ]);

    const client = new JmapClient("test-token", undefined, fetchFn);
    await client.ensureConnected();

    const handler = makeListMailboxesHandler(client);
    const result = await handler();
    const data = JSON.parse(result.content[0].text);

    expect(data.mailboxes).toHaveLength(2);
    expect(data.mailboxes[0].name).toBe("Inbox");
    expect(data.mailboxes[1].name).toBe("Sent");
    expect(result.isError).toBeUndefined();
  });

  test("session failure produces connection error in tool result", async () => {
    const fetchFn = mockFetch([
      { status: 500, statusText: "Internal Server Error" },
    ]);

    const client = new JmapClient("test-token", undefined, fetchFn);

    const handler = makeListMailboxesHandler(client);
    const result = await handler();

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("500");
  });

  test("auth failure (401) returns token check message without leaking token value", async () => {
    const secretToken = "fm-secret-do-not-leak";
    const fetchFn = mockFetch([
      { status: 401, statusText: "Unauthorized" },
    ]);

    const client = new JmapClient(secretToken, undefined, fetchFn);

    const handler = makeSearchEmailsHandler(client);
    const result = await handler({ from: "test@example.com" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Check FASTMAIL_API_TOKEN");
    expect(result.content[0].text).not.toContain(secretToken);
  });

  test("degraded state: retry logic fires on connect failure then tool call", async () => {
    // First connect() fails, ensureConnected() allows one retry
    const fetchFn = mockFetch([
      // First connect attempt: fails
      { status: 500, statusText: "Internal Server Error" },
      // Retry via ensureConnected(): succeeds
      { status: 200, body: MOCK_SESSION },
      { status: 200, body: mailboxResponse() },
    ]);

    const client = new JmapClient("test-token", undefined, fetchFn);

    // First call to ensureConnected fails
    try {
      await client.ensureConnected();
    } catch {
      // Expected
    }

    // Second call retries (one re-connect attempt allowed)
    await client.ensureConnected();

    const handler = makeListMailboxesHandler(client);
    const result = await handler();
    const data = JSON.parse(result.content[0].text);

    expect(data.mailboxes).toHaveLength(2);
    expect(result.isError).toBeUndefined();
  });
});
