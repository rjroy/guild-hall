import { describe, test, expect } from "bun:test";
import { JmapClient } from "@/packages/guild-hall-email/jmap-client";
import type {
  JmapSession,
  JmapResponse,
  Mailbox,
} from "@/packages/guild-hall-email/jmap-client";

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
  {
    id: "mb-drafts",
    name: "Drafts",
    role: "drafts",
    parentId: null,
    totalEmails: 3,
    unreadEmails: 0,
  },
  {
    id: "mb-trash",
    name: "Trash",
    role: "trash",
    parentId: null,
    totalEmails: 10,
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

/**
 * Builds a mock fetch function from an ordered sequence of responses.
 * Each call to the returned function consumes the next response in the queue.
 */
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
    return Promise.resolve(new Response(
      next.body !== undefined ? JSON.stringify(next.body) : null,
      {
        status: next.status,
        statusText: next.statusText ?? "",
        headers: { "Content-Type": "application/json" },
      },
    ));
  };

  // Expose calls for assertion
  (fn as unknown as MockFetchFn).calls = calls;
  return fn as typeof fetch;
}

interface MockFetchFn {
  calls: Array<{ url: string | URL | Request; init?: RequestInit }>;
}

function getCalls(
  fn: typeof fetch,
): Array<{ url: string | URL | Request; init?: RequestInit }> {
  return (fn as unknown as MockFetchFn).calls;
}

// -- Tests --

describe("JmapClient", () => {
  describe("connect and ensureConnected", () => {
    test("session fetch succeeds: client caches session, subsequent ensureConnected resolves immediately", async () => {
      const fetchFn = mockFetch([
        // Session fetch
        { status: 200, body: MOCK_SESSION },
        // Mailbox fetch
        { status: 200, body: mailboxResponse() },
      ]);

      const client = new JmapClient(
        "test-token",
        "https://test.example.com/session",
        fetchFn,
      );

      await client.ensureConnected();
      expect(client.accountId).toBe("u123");
      expect(client.mailboxes).toHaveLength(4);

      // Second call should not trigger another fetch
      await client.ensureConnected();
      expect(getCalls(fetchFn)).toHaveLength(2); // Only the original 2 calls
    });

    test("session fetch fails: client is in failed state, next ensureConnected triggers one retry", async () => {
      const fetchFn = mockFetch([
        // First attempt: session fetch fails
        { status: 500, statusText: "Internal Server Error" },
        // Retry: session succeeds
        { status: 200, body: MOCK_SESSION },
        // Retry: mailbox fetch succeeds
        { status: 200, body: mailboxResponse() },
      ]);

      const client = new JmapClient("test-token", undefined, fetchFn);

      // First attempt fails
      await expect(client.ensureConnected()).rejects.toThrow(
        "JMAP session fetch failed: HTTP 500",
      );

      // Retry succeeds
      await client.ensureConnected();
      expect(client.accountId).toBe("u123");
      expect(getCalls(fetchFn)).toHaveLength(3);
    });

    test("session fetch succeeds, mailbox fetch fails: throws with mailbox error message", async () => {
      const fetchFn = mockFetch([
        // Session succeeds
        { status: 200, body: MOCK_SESSION },
        // Mailbox fetch fails
        { status: 500, statusText: "Internal Server Error" },
      ]);

      const client = new JmapClient("test-token", undefined, fetchFn);

      await expect(client.ensureConnected()).rejects.toThrow(
        "JMAP mailbox fetch failed: HTTP 500",
      );
    });
  });

  describe("request", () => {
    async function connectedClient(
      extraResponses: Array<{
        status: number;
        statusText?: string;
        body?: unknown;
      }> = [],
    ) {
      const fetchFn = mockFetch([
        { status: 200, body: MOCK_SESSION },
        { status: 200, body: mailboxResponse() },
        ...extraResponses,
      ]);
      const client = new JmapClient("test-token", undefined, fetchFn);
      await client.ensureConnected();
      return { client, fetchFn };
    }

    test("401 during request: client re-fetches session and retries once", async () => {
      const successResponse: JmapResponse = {
        methodResponses: [
          ["Email/get", { list: [], notFound: [] }, "emails"],
        ],
        sessionState: "state-2",
      };

      const { client, fetchFn } = await connectedClient([
        // First request: 401
        { status: 401, statusText: "Unauthorized" },
        // Session re-fetch
        { status: 200, body: MOCK_SESSION },
        // Retry request succeeds
        { status: 200, body: successResponse },
      ]);

      const result = await client.request([
        ["Email/get", { accountId: "u123", ids: ["e1"] }, "emails"],
      ]);

      expect(result.methodResponses).toHaveLength(1);
      expect(result.methodResponses[0][0]).toBe("Email/get");
      // 2 (connect) + 1 (401) + 1 (session re-fetch) + 1 (retry) = 5
      expect(getCalls(fetchFn)).toHaveLength(5);
    });

    test("401 during retry: error propagates (no infinite loop)", async () => {
      const { client } = await connectedClient([
        // First request: 401
        { status: 401, statusText: "Unauthorized" },
        // Session re-fetch succeeds
        { status: 200, body: MOCK_SESSION },
        // Retry: still 401
        { status: 401, statusText: "Unauthorized" },
      ]);

      await expect(
        client.request([
          ["Email/get", { accountId: "u123", ids: ["e1"] }, "emails"],
        ]),
      ).rejects.toThrow("HTTP 401 Unauthorized (after session refresh)");
    });

    test("HTTP 500 during request: error includes status code and readable message", async () => {
      const { client } = await connectedClient([
        { status: 500, statusText: "Internal Server Error" },
      ]);

      await expect(
        client.request([
          ["Email/get", { accountId: "u123", ids: ["e1"] }, "emails"],
        ]),
      ).rejects.toThrow("JMAP request failed: HTTP 500 Internal Server Error");
    });

    test("rate limit (429): error says rate limited message", async () => {
      const { client } = await connectedClient([
        { status: 429, statusText: "Too Many Requests" },
      ]);

      await expect(
        client.request([
          ["Email/get", { accountId: "u123", ids: ["e1"] }, "emails"],
        ]),
      ).rejects.toThrow(
        "Rate limited by Fastmail. Try again in a moment.",
      );
    });

    test("JMAP-level error in response: mapped to readable error text", async () => {
      const errorResponse: JmapResponse = {
        methodResponses: [
          [
            "Email/error",
            {
              type: "invalidArguments",
              description: "Property 'foo' is not valid",
            },
            "emails",
          ],
        ],
        sessionState: "state-1",
      };

      const { client } = await connectedClient([
        { status: 200, body: errorResponse },
      ]);

      await expect(
        client.request([
          ["Email/get", { accountId: "u123", ids: ["e1"] }, "emails"],
        ]),
      ).rejects.toThrow(
        "JMAP error (invalidArguments): Property 'foo' is not valid",
      );
    });

    test("JMAP-level tooManyRequests error: throws rate limit message", async () => {
      const errorResponse: JmapResponse = {
        methodResponses: [
          [
            "Email/error",
            {
              type: "tooManyRequests",
              description: "Exceeded request quota",
            },
            "emails",
          ],
        ],
        sessionState: "state-1",
      };

      const { client } = await connectedClient([
        { status: 200, body: errorResponse },
      ]);

      await expect(
        client.request([
          ["Email/get", { accountId: "u123", ids: ["e1"] }, "emails"],
        ]),
      ).rejects.toThrow(
        "Rate limited by Fastmail. Try again in a moment.",
      );
    });

    test("request batching: multiple method calls sent in single POST with correct structure", async () => {
      const batchResponse: JmapResponse = {
        methodResponses: [
          ["Email/query", { ids: ["e1", "e2"] }, "query"],
          ["Email/get", { list: [] }, "details"],
        ],
        sessionState: "state-1",
      };

      const { client, fetchFn } = await connectedClient([
        { status: 200, body: batchResponse },
      ]);

      await client.request([
        [
          "Email/query",
          { accountId: "u123", filter: { from: "test@example.com" } },
          "query",
        ],
        [
          "Email/get",
          {
            accountId: "u123",
            "#ids": { resultOf: "query", name: "Email/query", path: "/ids/*" },
          },
          "details",
        ],
      ]);

      // The third call (index 2) is the actual request (after session + mailbox)
      const calls = getCalls(fetchFn);
      const requestCall = calls[2];
      const body = JSON.parse(requestCall.init?.body as string);

      expect(body.methodCalls).toHaveLength(2);
      expect(body.methodCalls[0][0]).toBe("Email/query");
      expect(body.methodCalls[0][2]).toBe("query");
      expect(body.methodCalls[1][0]).toBe("Email/get");
      expect(body.methodCalls[1][2]).toBe("details");
    });
  });

  describe("capabilities", () => {
    test("request body contains only jmap:core and jmap:mail (no submission)", async () => {
      const response: JmapResponse = {
        methodResponses: [
          ["Email/get", { list: [], notFound: [] }, "emails"],
        ],
        sessionState: "state-1",
      };

      const fetchFn = mockFetch([
        { status: 200, body: MOCK_SESSION },
        { status: 200, body: mailboxResponse() },
        { status: 200, body: response },
      ]);

      const client = new JmapClient("test-token", undefined, fetchFn);
      await client.ensureConnected();
      await client.request([
        ["Email/get", { accountId: "u123", ids: ["e1"] }, "emails"],
      ]);

      const calls = getCalls(fetchFn);

      // Check the mailbox fetch (connect step 2) capabilities
      const connectBody = JSON.parse(calls[1].init?.body as string);
      expect(connectBody.using).toEqual([
        "urn:ietf:params:jmap:core",
        "urn:ietf:params:jmap:mail",
      ]);
      expect(connectBody.using).not.toContain(
        "urn:ietf:params:jmap:submission",
      );

      // Check the request capabilities
      const requestBody = JSON.parse(calls[2].init?.body as string);
      expect(requestBody.using).toEqual([
        "urn:ietf:params:jmap:core",
        "urn:ietf:params:jmap:mail",
      ]);
      expect(requestBody.using).not.toContain(
        "urn:ietf:params:jmap:submission",
      );
    });
  });

  describe("accountId getter", () => {
    test("returns primary mail account ID from session", async () => {
      const fetchFn = mockFetch([
        { status: 200, body: MOCK_SESSION },
        { status: 200, body: mailboxResponse() },
      ]);

      const client = new JmapClient("test-token", undefined, fetchFn);
      await client.ensureConnected();
      expect(client.accountId).toBe("u123");
    });

    test("throws if not connected", () => {
      const client = new JmapClient("test-token", undefined, mockFetch([]));
      expect(() => client.accountId).toThrow("Not connected");
    });
  });

  describe("mailbox resolution", () => {
    async function clientWithMailboxes() {
      const fetchFn = mockFetch([
        { status: 200, body: MOCK_SESSION },
        { status: 200, body: mailboxResponse() },
      ]);
      const client = new JmapClient("test-token", undefined, fetchFn);
      await client.ensureConnected();
      return client;
    }

    test("resolveMailboxName: case-insensitive match returns ID", async () => {
      const client = await clientWithMailboxes();

      expect(client.resolveMailboxName("Inbox")).toBe("mb-inbox");
      expect(client.resolveMailboxName("inbox")).toBe("mb-inbox");
      expect(client.resolveMailboxName("INBOX")).toBe("mb-inbox");
      expect(client.resolveMailboxName("sent")).toBe("mb-sent");
      expect(client.resolveMailboxName("Drafts")).toBe("mb-drafts");
    });

    test("resolveMailboxName: not found lists available mailbox names", async () => {
      const client = await clientWithMailboxes();

      expect(() => client.resolveMailboxName("Junk")).toThrow(
        'Mailbox "Junk" not found. Available mailboxes: Inbox, Sent, Drafts, Trash',
      );
    });

    test("resolveMailboxId: reverse lookup returns name", async () => {
      const client = await clientWithMailboxes();

      expect(client.resolveMailboxId("mb-inbox")).toBe("Inbox");
      expect(client.resolveMailboxId("mb-sent")).toBe("Sent");
    });

    test("resolveMailboxId: returns ID itself if not found (graceful fallback)", async () => {
      const client = await clientWithMailboxes();

      expect(client.resolveMailboxId("mb-unknown")).toBe("mb-unknown");
    });
  });
});
