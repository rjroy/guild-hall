import { describe, test, expect } from "bun:test";
import { JmapClient } from "@/packages/guild-hall-email/jmap-client";
import type {
  JmapSession,
  JmapResponse,
  Mailbox,
} from "@/packages/guild-hall-email/jmap-client";
import {
  searchEmails,
  readEmail,
  listMailboxes,
  getThread,
} from "@/packages/guild-hall-email/core";

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
];

function mailboxResponse(): JmapResponse {
  return {
    methodResponses: [
      ["Mailbox/get", { list: MOCK_MAILBOXES, notFound: [] }, "mailboxes"],
    ],
    sessionState: "state-1",
  };
}

// -- Mock fetch infrastructure --

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

/**
 * Returns the parsed JSON body of the Nth API request (after the two
 * connect calls: session fetch + mailbox fetch).
 */
function getRequestBody(fn: typeof fetch, index: number = 0): unknown {
  const call = getCalls(fn)[2 + index];
  return JSON.parse(call.init?.body as string);
}

// -- Helpers --

async function connectedClient(
  apiResponses: Array<{
    status: number;
    statusText?: string;
    body?: unknown;
  }>,
) {
  const fetchFn = mockFetch([
    { status: 200, body: MOCK_SESSION },
    { status: 200, body: mailboxResponse() },
    ...apiResponses,
  ]);
  const client = new JmapClient("test-token", undefined, fetchFn);
  await client.ensureConnected();
  return { client, fetchFn };
}

function sampleEmail(overrides: Record<string, unknown> = {}) {
  return {
    id: "e-1",
    threadId: "t-1",
    from: [{ name: "Alice", email: "alice@example.com" }],
    to: [{ name: "Bob", email: "bob@example.com" }],
    subject: "Test Subject",
    receivedAt: "2026-03-08T12:00:00Z",
    preview: "This is a preview...",
    hasAttachment: false,
    keywords: { $seen: true },
    mailboxIds: { "mb-inbox": true },
    ...overrides,
  };
}

// -- Tests --

describe("searchEmails", () => {
  function searchResponse(
    emails: Array<Record<string, unknown>> = [sampleEmail()],
  ): JmapResponse {
    return {
      methodResponses: [
        [
          "Email/query",
          { ids: emails.map((e) => e.id), position: 0, total: emails.length },
          "query",
        ],
        ["Email/get", { list: emails, notFound: [] }, "details"],
      ],
      sessionState: "state-1",
    };
  }

  test("builds filter from provided parameters only", async () => {
    const { client, fetchFn } = await connectedClient([
      { status: 200, body: searchResponse() },
    ]);

    await searchEmails(client, { from: "alice@example.com", subject: "Hello" });

    const body = getRequestBody(fetchFn) as {
      methodCalls: Array<[string, Record<string, unknown>, string]>;
    };
    const filter = body.methodCalls[0][1].filter as Record<string, unknown>;

    expect(filter.from).toBe("alice@example.com");
    expect(filter.subject).toBe("Hello");
    expect(filter.to).toBeUndefined();
    expect(filter.text).toBeUndefined();
    expect(filter.after).toBeUndefined();
    expect(filter.before).toBeUndefined();
    expect(filter.hasAttachment).toBeUndefined();
    expect(filter.inMailbox).toBeUndefined();
  });

  test("builds filter with date range, text, and has_attachment", async () => {
    const { client, fetchFn } = await connectedClient([
      { status: 200, body: searchResponse() },
    ]);

    await searchEmails(client, {
      to: "bob@example.com",
      text: "quarterly report",
      after: "2026-01-01T00:00:00Z",
      before: "2026-03-01T00:00:00Z",
      has_attachment: true,
    });

    const body = getRequestBody(fetchFn) as {
      methodCalls: Array<[string, Record<string, unknown>, string]>;
    };
    const filter = body.methodCalls[0][1].filter as Record<string, unknown>;

    expect(filter.to).toBe("bob@example.com");
    expect(filter.text).toBe("quarterly report");
    expect(filter.after).toBe("2026-01-01T00:00:00Z");
    expect(filter.before).toBe("2026-03-01T00:00:00Z");
    expect(filter.hasAttachment).toBe(true);
  });

  test("in_mailbox resolves name to mailbox ID", async () => {
    const { client, fetchFn } = await connectedClient([
      { status: 200, body: searchResponse() },
    ]);

    await searchEmails(client, { in_mailbox: "Inbox" });

    const body = getRequestBody(fetchFn) as {
      methodCalls: Array<[string, Record<string, unknown>, string]>;
    };
    const filter = body.methodCalls[0][1].filter as Record<string, unknown>;

    expect(filter.inMailbox).toBe("mb-inbox");
  });

  test("in_mailbox with unknown name throws listing available mailboxes", async () => {
    const { client } = await connectedClient([]);

    await expect(
      searchEmails(client, { in_mailbox: "Archive" }),
    ).rejects.toThrow('"Archive" not found');
  });

  test("limit defaults to 20", async () => {
    const { client, fetchFn } = await connectedClient([
      { status: 200, body: searchResponse() },
    ]);

    await searchEmails(client, {});

    const body = getRequestBody(fetchFn) as {
      methodCalls: Array<[string, Record<string, unknown>, string]>;
    };
    expect(body.methodCalls[0][1].limit).toBe(20);
  });

  test("limit clamps at 100", async () => {
    const { client, fetchFn } = await connectedClient([
      { status: 200, body: searchResponse() },
    ]);

    await searchEmails(client, { limit: 200 });

    const body = getRequestBody(fetchFn) as {
      methodCalls: Array<[string, Record<string, unknown>, string]>;
    };
    expect(body.methodCalls[0][1].limit).toBe(100);
  });

  test("explicit limit below 100 passes through", async () => {
    const { client, fetchFn } = await connectedClient([
      { status: 200, body: searchResponse() },
    ]);

    await searchEmails(client, { limit: 5 });

    const body = getRequestBody(fetchFn) as {
      methodCalls: Array<[string, Record<string, unknown>, string]>;
    };
    expect(body.methodCalls[0][1].limit).toBe(5);
  });

  test("maps response to EmailSummary array with correct fields", async () => {
    const email = sampleEmail({ keywords: {} });
    const { client } = await connectedClient([
      { status: 200, body: searchResponse([email]) },
    ]);

    const result = await searchEmails(client, {});

    expect(result.emails).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.emails[0].id).toBe("e-1");
    expect(result.emails[0].threadId).toBe("t-1");
    expect(result.emails[0].subject).toBe("Test Subject");
    expect(result.emails[0].isUnread).toBe(true);
    expect(result.emails[0].isFlagged).toBe(false);
  });

  test("email with $seen keyword is not unread", async () => {
    const email = sampleEmail({ keywords: { $seen: true } });
    const { client } = await connectedClient([
      { status: 200, body: searchResponse([email]) },
    ]);

    const result = await searchEmails(client, {});
    expect(result.emails[0].isUnread).toBe(false);
  });

  test("email with $flagged keyword is flagged", async () => {
    const email = sampleEmail({ keywords: { $seen: true, $flagged: true } });
    const { client } = await connectedClient([
      { status: 200, body: searchResponse([email]) },
    ]);

    const result = await searchEmails(client, {});
    expect(result.emails[0].isFlagged).toBe(true);
  });
});

describe("readEmail", () => {
  function emailGetResponse(
    emails: Array<Record<string, unknown>>,
    notFound: string[] = [],
  ): JmapResponse {
    return {
      methodResponses: [
        ["Email/get", { list: emails, notFound }, "email"],
      ],
      sessionState: "state-1",
    };
  }

  function detailedEmail(overrides: Record<string, unknown> = {}) {
    return {
      id: "e-1",
      threadId: "t-1",
      from: [{ name: "Alice", email: "alice@example.com" }],
      to: [{ name: "Bob", email: "bob@example.com" }],
      cc: [],
      replyTo: null,
      subject: "Detailed email",
      sentAt: "2026-03-08T11:55:00Z",
      receivedAt: "2026-03-08T12:00:00Z",
      textBody: [{ partId: "part-1" }],
      htmlBody: [{ partId: "part-2" }],
      bodyValues: {
        "part-1": { value: "Hello, this is plain text." },
        "part-2": { value: "<p>Hello, this is <b>HTML</b>.</p>" },
      },
      attachments: [],
      keywords: { $seen: true },
      mailboxIds: { "mb-inbox": true },
      ...overrides,
    };
  }

  test("prefers text body over HTML body", async () => {
    const { client } = await connectedClient([
      { status: 200, body: emailGetResponse([detailedEmail()]) },
    ]);

    const result = await readEmail(client, "e-1");

    expect(result.body).toBe("Hello, this is plain text.");
  });

  test("falls back to HTML-to-text when textBody is empty", async () => {
    const email = detailedEmail({
      textBody: [],
      htmlBody: [{ partId: "part-html" }],
      bodyValues: {
        "part-html": {
          value: "<p>Hello</p><p>This is <b>important</b>.</p>",
        },
      },
    });

    const { client } = await connectedClient([
      { status: 200, body: emailGetResponse([email]) },
    ]);

    const result = await readEmail(client, "e-1");

    expect(result.body).toContain("Hello");
    expect(result.body).toContain("important");
    expect(result.body).not.toContain("<p>");
    expect(result.body).not.toContain("<b>");
  });

  test("empty body when no text or HTML parts", async () => {
    const email = detailedEmail({
      textBody: [],
      htmlBody: [],
      bodyValues: {},
    });

    const { client } = await connectedClient([
      { status: 200, body: emailGetResponse([email]) },
    ]);

    const result = await readEmail(client, "e-1");
    expect(result.body).toBe("");
  });

  test("includes attachment metadata", async () => {
    const email = detailedEmail({
      attachments: [
        { name: "report.pdf", size: 102400, type: "application/pdf" },
        { name: "photo.jpg", size: 2048000, type: "image/jpeg" },
      ],
    });

    const { client } = await connectedClient([
      { status: 200, body: emailGetResponse([email]) },
    ]);

    const result = await readEmail(client, "e-1");

    expect(result.attachments).toHaveLength(2);
    expect(result.attachments[0]).toEqual({
      filename: "report.pdf",
      size: 102400,
      type: "application/pdf",
    });
    expect(result.attachments[1]).toEqual({
      filename: "photo.jpg",
      size: 2048000,
      type: "image/jpeg",
    });
  });

  test("attachment with filename field instead of name", async () => {
    const email = detailedEmail({
      attachments: [
        { filename: "data.csv", size: 500, type: "text/csv" },
      ],
    });

    const { client } = await connectedClient([
      { status: 200, body: emailGetResponse([email]) },
    ]);

    const result = await readEmail(client, "e-1");

    expect(result.attachments[0].filename).toBe("data.csv");
  });

  test("attachment with neither name nor filename returns null", async () => {
    const email = detailedEmail({
      attachments: [
        { size: 300, type: "application/octet-stream" },
      ],
    });

    const { client } = await connectedClient([
      { status: 200, body: emailGetResponse([email]) },
    ]);

    const result = await readEmail(client, "e-1");
    expect(result.attachments[0].filename).toBeNull();
  });

  test("resolves mailbox IDs to names", async () => {
    const email = detailedEmail({
      mailboxIds: { "mb-inbox": true, "mb-sent": true },
    });

    const { client } = await connectedClient([
      { status: 200, body: emailGetResponse([email]) },
    ]);

    const result = await readEmail(client, "e-1");

    expect(result.mailboxes).toContain("Inbox");
    expect(result.mailboxes).toContain("Sent");
  });

  test("throws on not-found email", async () => {
    const { client } = await connectedClient([
      { status: 200, body: emailGetResponse([], ["e-unknown"]) },
    ]);

    await expect(readEmail(client, "e-unknown")).rejects.toThrow(
      "Email not found: e-unknown",
    );
  });

  test("maps isUnread and isFlagged from keywords", async () => {
    const email = detailedEmail({
      keywords: { $flagged: true },
    });

    const { client } = await connectedClient([
      { status: 200, body: emailGetResponse([email]) },
    ]);

    const result = await readEmail(client, "e-1");
    expect(result.isUnread).toBe(true);
    expect(result.isFlagged).toBe(true);
  });
});

describe("listMailboxes", () => {
  test("returns cached mailbox list", async () => {
    const { client } = await connectedClient([]);

    const result = await listMailboxes(client);

    expect(result.mailboxes).toHaveLength(3);
    expect(result.mailboxes[0].name).toBe("Inbox");
    expect(result.mailboxes[1].name).toBe("Sent");
    expect(result.mailboxes[2].name).toBe("Drafts");
  });
});

describe("getThread", () => {
  function threadResponse(
    threads: Array<Record<string, unknown>>,
    emails: Array<Record<string, unknown>>,
  ): JmapResponse {
    return {
      methodResponses: [
        ["Thread/get", { list: threads, notFound: [] }, "thread"],
        ["Email/get", { list: emails, notFound: [] }, "emails"],
      ],
      sessionState: "state-1",
    };
  }

  test("returns emails sorted chronologically (ascending)", async () => {
    const email1 = sampleEmail({
      id: "e-1",
      receivedAt: "2026-03-08T14:00:00Z",
    });
    const email2 = sampleEmail({
      id: "e-2",
      receivedAt: "2026-03-08T12:00:00Z",
    });
    const email3 = sampleEmail({
      id: "e-3",
      receivedAt: "2026-03-08T16:00:00Z",
    });

    const thread = { id: "t-1", emailIds: ["e-1", "e-2", "e-3"] };

    const { client } = await connectedClient([
      { status: 200, body: threadResponse([thread], [email1, email2, email3]) },
    ]);

    const result = await getThread(client, "t-1");

    expect(result.emails).toHaveLength(3);
    expect(result.emails[0].id).toBe("e-2"); // earliest
    expect(result.emails[1].id).toBe("e-1"); // middle
    expect(result.emails[2].id).toBe("e-3"); // latest
    expect(result.total).toBe(3);
    expect(result.threadId).toBe("t-1");
  });

  test("throws on not-found thread", async () => {
    const { client } = await connectedClient([
      { status: 200, body: threadResponse([], []) },
    ]);

    await expect(getThread(client, "t-nonexistent")).rejects.toThrow(
      "Thread not found: t-nonexistent",
    );
  });

  test("single-email thread returns that email", async () => {
    const email = sampleEmail({ id: "e-solo" });
    const thread = { id: "t-solo", emailIds: ["e-solo"] };

    const { client } = await connectedClient([
      { status: 200, body: threadResponse([thread], [email]) },
    ]);

    const result = await getThread(client, "t-solo");

    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].id).toBe("e-solo");
    expect(result.total).toBe(1);
  });
});
