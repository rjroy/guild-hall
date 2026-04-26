import { describe, test, expect } from "bun:test";
import { JmapClient } from "@/packages/guild-hall-email/jmap-client";
import type {
  JmapSession,
  JmapResponse,
  Mailbox,
} from "@/packages/guild-hall-email/jmap-client";
import {
  makeSearchEmailsHandler,
  makeReadEmailHandler,
  makeListMailboxesHandler,
  makeGetThreadHandler,
} from "@/packages/guild-hall-email/tools";

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
  // Calls 0 and 1 are session and mailbox. API requests start at 2.
  const call = getCalls(fn)[2 + index];
  return JSON.parse(call.init?.body as string);
}

// -- Helpers --

/** Creates a connected JmapClient with additional responses queued for tool calls. */
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

/** Sample email objects as JMAP would return them. */
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

describe("search_emails handler", () => {
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

    const handler = makeSearchEmailsHandler(client);
    await handler({ from: "alice@example.com", subject: "Hello" });

    const body = getRequestBody(fetchFn) as {
      methodCalls: Array<[string, Record<string, unknown>, string]>;
    };
    const queryArgs = body.methodCalls[0][1];
    const filter = queryArgs.filter as Record<string, unknown>;

    expect(filter.from).toBe("alice@example.com");
    expect(filter.subject).toBe("Hello");
    // Parameters not provided should be absent
    expect(filter.to).toBeUndefined();
    expect(filter.text).toBeUndefined();
    expect(filter.after).toBeUndefined();
    expect(filter.before).toBeUndefined();
    expect(filter.hasAttachment).toBeUndefined();
    expect(filter.inMailbox).toBeUndefined();
  });

  test("builds filter with date range and text parameters", async () => {
    const { client, fetchFn } = await connectedClient([
      { status: 200, body: searchResponse() },
    ]);

    const handler = makeSearchEmailsHandler(client);
    await handler({
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

  test("in_mailbox: 'Inbox' resolves to mailbox ID", async () => {
    const { client, fetchFn } = await connectedClient([
      { status: 200, body: searchResponse() },
    ]);

    const handler = makeSearchEmailsHandler(client);
    await handler({ in_mailbox: "Inbox" });

    const body = getRequestBody(fetchFn) as {
      methodCalls: Array<[string, Record<string, unknown>, string]>;
    };
    const filter = body.methodCalls[0][1].filter as Record<string, unknown>;

    expect(filter.inMailbox).toBe("mb-inbox");
  });

  test("in_mailbox with unknown name returns error listing available mailboxes", async () => {
    const { client } = await connectedClient([]);

    const handler = makeSearchEmailsHandler(client);
    const result = await handler({ in_mailbox: "Archive" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"Archive" not found');
    expect(result.content[0].text).toContain("Inbox");
    expect(result.content[0].text).toContain("Sent");
    expect(result.content[0].text).toContain("Drafts");
  });

  test("limit defaults to 20 and clamps at 100", async () => {
    // Default limit
    const { client: client1, fetchFn: fetch1 } = await connectedClient([
      { status: 200, body: searchResponse() },
    ]);
    const handler1 = makeSearchEmailsHandler(client1);
    await handler1({});

    const body1 = getRequestBody(fetch1) as {
      methodCalls: Array<[string, Record<string, unknown>, string]>;
    };
    expect(body1.methodCalls[0][1].limit).toBe(20);

    // Explicit limit over 100 gets clamped
    const { client: client2, fetchFn: fetch2 } = await connectedClient([
      { status: 200, body: searchResponse() },
    ]);
    const handler2 = makeSearchEmailsHandler(client2);
    await handler2({ limit: 200 });

    const body2 = getRequestBody(fetch2) as {
      methodCalls: Array<[string, Record<string, unknown>, string]>;
    };
    expect(body2.methodCalls[0][1].limit).toBe(100);
  });

  test("unread detection: email without $seen keyword is marked unread", async () => {
    const unreadEmail = sampleEmail({ keywords: {} });
    const { client } = await connectedClient([
      { status: 200, body: searchResponse([unreadEmail]) },
    ]);

    const handler = makeSearchEmailsHandler(client);
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.emails[0].isUnread).toBe(true);
  });

  test("read email: $seen keyword present results in isUnread false", async () => {
    const readEmail = sampleEmail({ keywords: { $seen: true } });
    const { client } = await connectedClient([
      { status: 200, body: searchResponse([readEmail]) },
    ]);

    const handler = makeSearchEmailsHandler(client);
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.emails[0].isUnread).toBe(false);
  });

  test("uses batched Email/query + Email/get with back-reference", async () => {
    const { client, fetchFn } = await connectedClient([
      { status: 200, body: searchResponse() },
    ]);

    const handler = makeSearchEmailsHandler(client);
    await handler({ from: "test@example.com" });

    const body = getRequestBody(fetchFn) as {
      methodCalls: Array<[string, Record<string, unknown>, string]>;
    };

    expect(body.methodCalls).toHaveLength(2);
    expect(body.methodCalls[0][0]).toBe("Email/query");
    expect(body.methodCalls[0][2]).toBe("query");
    expect(body.methodCalls[1][0]).toBe("Email/get");
    expect(body.methodCalls[1][2]).toBe("details");

    // Verify back-reference
    const getArgs = body.methodCalls[1][1];
    expect(getArgs["#ids"]).toEqual({
      resultOf: "query",
      name: "Email/query",
      path: "/ids/*",
    });
  });
});

describe("read_email handler", () => {
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

  test("text body: returns text directly without HTML conversion", async () => {
    const email = {
      id: "e-1",
      threadId: "t-1",
      from: [{ name: "Alice", email: "alice@example.com" }],
      to: [{ name: "Bob", email: "bob@example.com" }],
      cc: [],
      replyTo: null,
      subject: "Plain text email",
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
    };

    const { client } = await connectedClient([
      { status: 200, body: emailGetResponse([email]) },
    ]);

    const handler = makeReadEmailHandler(client);
    const result = await handler({ email_id: "e-1" });
    const data = JSON.parse(result.content[0].text);

    expect(data.body).toBe("Hello, this is plain text.");
    expect(result.isError).toBeUndefined();
  });

  test("HTML-only body: runs through htmlToText conversion", async () => {
    const email = {
      id: "e-2",
      threadId: "t-1",
      from: [{ name: "Alice", email: "alice@example.com" }],
      to: [{ name: "Bob", email: "bob@example.com" }],
      cc: [],
      replyTo: null,
      subject: "HTML email",
      sentAt: "2026-03-08T11:55:00Z",
      receivedAt: "2026-03-08T12:00:00Z",
      textBody: [],
      htmlBody: [{ partId: "part-html" }],
      bodyValues: {
        "part-html": {
          value: "<p>Hello</p><p>This is <b>important</b>.</p>",
        },
      },
      attachments: [],
      keywords: {},
      mailboxIds: { "mb-inbox": true },
    };

    const { client } = await connectedClient([
      { status: 200, body: emailGetResponse([email]) },
    ]);

    const handler = makeReadEmailHandler(client);
    const result = await handler({ email_id: "e-2" });
    const data = JSON.parse(result.content[0].text);

    // htmlToText strips tags and preserves text
    expect(data.body).toContain("Hello");
    expect(data.body).toContain("important");
    expect(data.body).not.toContain("<p>");
    expect(data.body).not.toContain("<b>");
  });

  test("includes attachment metadata without content", async () => {
    const email = {
      id: "e-3",
      threadId: "t-1",
      from: [{ name: "Alice", email: "alice@example.com" }],
      to: [{ name: "Bob", email: "bob@example.com" }],
      cc: [],
      replyTo: null,
      subject: "With attachment",
      sentAt: "2026-03-08T11:55:00Z",
      receivedAt: "2026-03-08T12:00:00Z",
      textBody: [{ partId: "part-1" }],
      htmlBody: [],
      bodyValues: { "part-1": { value: "See attached." } },
      attachments: [
        { name: "report.pdf", size: 102400, type: "application/pdf" },
        { name: "photo.jpg", size: 2048000, type: "image/jpeg" },
      ],
      keywords: { $seen: true },
      mailboxIds: { "mb-inbox": true },
    };

    const { client } = await connectedClient([
      { status: 200, body: emailGetResponse([email]) },
    ]);

    const handler = makeReadEmailHandler(client);
    const result = await handler({ email_id: "e-3" });
    const data = JSON.parse(result.content[0].text);

    expect(data.attachments).toHaveLength(2);
    expect(data.attachments[0]).toEqual({
      filename: "report.pdf",
      size: 102400,
      type: "application/pdf",
    });
    expect(data.attachments[1]).toEqual({
      filename: "photo.jpg",
      size: 2048000,
      type: "image/jpeg",
    });
  });

  test("unknown email ID returns error", async () => {
    const { client } = await connectedClient([
      { status: 200, body: emailGetResponse([], ["e-unknown"]) },
    ]);

    const handler = makeReadEmailHandler(client);
    const result = await handler({ email_id: "e-unknown" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Email not found");
    expect(result.content[0].text).toContain("e-unknown");
  });

  test("resolves mailbox IDs to names", async () => {
    const email = {
      id: "e-4",
      threadId: "t-1",
      from: [{ name: "Alice", email: "alice@example.com" }],
      to: [{ name: "Bob", email: "bob@example.com" }],
      cc: [],
      replyTo: null,
      subject: "Multi-mailbox",
      sentAt: "2026-03-08T11:55:00Z",
      receivedAt: "2026-03-08T12:00:00Z",
      textBody: [{ partId: "part-1" }],
      htmlBody: [],
      bodyValues: { "part-1": { value: "test" } },
      attachments: [],
      keywords: { $seen: true },
      mailboxIds: { "mb-inbox": true, "mb-sent": true },
    };

    const { client } = await connectedClient([
      { status: 200, body: emailGetResponse([email]) },
    ]);

    const handler = makeReadEmailHandler(client);
    const result = await handler({ email_id: "e-4" });
    const data = JSON.parse(result.content[0].text);

    expect(data.mailboxes).toContain("Inbox");
    expect(data.mailboxes).toContain("Sent");
  });

  test("requests correct JMAP properties including body value fetch", async () => {
    const email = {
      id: "e-5",
      threadId: "t-1",
      from: [],
      to: [],
      cc: [],
      replyTo: null,
      subject: "Test",
      sentAt: "2026-03-08T11:55:00Z",
      receivedAt: "2026-03-08T12:00:00Z",
      textBody: [{ partId: "p1" }],
      htmlBody: [],
      bodyValues: { p1: { value: "body" } },
      attachments: [],
      keywords: {},
      mailboxIds: {},
    };

    const { client, fetchFn } = await connectedClient([
      { status: 200, body: emailGetResponse([email]) },
    ]);

    const handler = makeReadEmailHandler(client);
    await handler({ email_id: "e-5" });

    const body = getRequestBody(fetchFn) as {
      methodCalls: Array<[string, Record<string, unknown>, string]>;
    };
    const args = body.methodCalls[0][1];

    expect(args.fetchTextBodyValues).toBe(true);
    expect(args.fetchHTMLBodyValues).toBe(true);
    expect(args.maxBodyValueBytes).toBe(256000);
  });
});

describe("list_mailboxes handler", () => {
  test("returns cached mailbox data", async () => {
    const { client } = await connectedClient([]);

    const handler = makeListMailboxesHandler(client);
    const result = await handler();
    const data = JSON.parse(result.content[0].text);

    expect(data.mailboxes).toHaveLength(3);
    expect(data.mailboxes[0].name).toBe("Inbox");
    expect(data.mailboxes[1].name).toBe("Sent");
    expect(data.mailboxes[2].name).toBe("Drafts");
    expect(result.isError).toBeUndefined();
  });
});

describe("get_thread handler", () => {
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
      subject: "Re: Topic",
    });
    const email2 = sampleEmail({
      id: "e-2",
      receivedAt: "2026-03-08T12:00:00Z",
      subject: "Topic",
    });
    const email3 = sampleEmail({
      id: "e-3",
      receivedAt: "2026-03-08T16:00:00Z",
      subject: "Re: Re: Topic",
    });

    const thread = { id: "t-1", emailIds: ["e-1", "e-2", "e-3"] };

    const { client } = await connectedClient([
      {
        status: 200,
        body: threadResponse([thread], [email1, email2, email3]),
      },
    ]);

    const handler = makeGetThreadHandler(client);
    const result = await handler({ thread_id: "t-1" });
    const data = JSON.parse(result.content[0].text);

    expect(data.emails).toHaveLength(3);
    expect(data.emails[0].id).toBe("e-2"); // earliest
    expect(data.emails[1].id).toBe("e-1"); // middle
    expect(data.emails[2].id).toBe("e-3"); // latest
    expect(data.total).toBe(3);
  });

  test("unknown thread ID returns error", async () => {
    const { client } = await connectedClient([
      {
        status: 200,
        body: threadResponse([], []),
      },
    ]);

    const handler = makeGetThreadHandler(client);
    const result = await handler({ thread_id: "t-nonexistent" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Thread not found");
    expect(result.content[0].text).toContain("t-nonexistent");
  });

  test("uses batched Thread/get + Email/get with back-reference", async () => {
    const thread = { id: "t-1", emailIds: ["e-1"] };
    const email = sampleEmail();

    const { client, fetchFn } = await connectedClient([
      { status: 200, body: threadResponse([thread], [email]) },
    ]);

    const handler = makeGetThreadHandler(client);
    await handler({ thread_id: "t-1" });

    const body = getRequestBody(fetchFn) as {
      methodCalls: Array<[string, Record<string, unknown>, string]>;
    };

    expect(body.methodCalls).toHaveLength(2);
    expect(body.methodCalls[0][0]).toBe("Thread/get");
    expect(body.methodCalls[0][2]).toBe("thread");
    expect(body.methodCalls[1][0]).toBe("Email/get");
    expect(body.methodCalls[1][2]).toBe("emails");

    // Verify back-reference
    const getArgs = body.methodCalls[1][1];
    expect(getArgs["#ids"]).toEqual({
      resultOf: "thread",
      name: "Thread/get",
      path: "/list/*/emailIds/*",
    });
  });
});

describe("error handling", () => {
  test("JMAP error produces readable tool error", async () => {
    const errorResponse: JmapResponse = {
      methodResponses: [
        [
          "Email/error",
          {
            type: "invalidArguments",
            description: "Property 'foo' is not valid",
          },
          "query",
        ],
      ],
      sessionState: "state-1",
    };

    const { client } = await connectedClient([
      { status: 200, body: errorResponse },
    ]);

    const handler = makeSearchEmailsHandler(client);
    const result = await handler({ from: "test@example.com" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("invalidArguments");
    expect(result.content[0].text).toContain("Property 'foo' is not valid");
  });

  test("network failure produces tool error without leaking internals", async () => {
    const fetchFn = mockFetch([
      { status: 200, body: MOCK_SESSION },
      { status: 200, body: mailboxResponse() },
    ]);

    const client = new JmapClient("test-token", undefined, fetchFn);
    await client.ensureConnected();

    // Next call will fail because no more responses are queued,
    // simulating a network failure
    const handler = makeSearchEmailsHandler(client);
    const result = await handler({ from: "test@example.com" });

    expect(result.isError).toBe(true);
    // Should not contain the token
    expect(result.content[0].text).not.toContain("test-token");
  });

  test("HTTP 500 produces tool error", async () => {
    const { client } = await connectedClient([
      { status: 500, statusText: "Internal Server Error" },
    ]);

    // list_mailboxes doesn't make API calls (uses cache), so test read_email
    const readHandler = makeReadEmailHandler(client);
    const result = await readHandler({ email_id: "e-1" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("500");
  });

  test("auth failure (401) produces 'Check FASTMAIL_API_TOKEN' message", async () => {
    const { client } = await connectedClient([
      // First attempt: 401
      { status: 401, statusText: "Unauthorized" },
      // Session re-fetch also fails with 401
      { status: 401, statusText: "Unauthorized" },
    ]);

    const handler = makeSearchEmailsHandler(client);
    const result = await handler({ from: "test@example.com" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      "Email toolbox authentication failed. Check FASTMAIL_API_TOKEN.",
    );
    // Must not include the token
    expect(result.content[0].text).not.toContain("test-token");
  });

  test("auth failure during ensureConnected produces token check message", async () => {
    // Client that fails to connect at all
    const fetchFn = mockFetch([
      { status: 401, statusText: "Unauthorized" },
    ]);

    const client = new JmapClient("secret-token-value", undefined, fetchFn);

    const handler = makeSearchEmailsHandler(client);
    const result = await handler({ from: "test@example.com" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      "Email toolbox authentication failed. Check FASTMAIL_API_TOKEN.",
    );
    expect(result.content[0].text).not.toContain("secret-token-value");
  });
});
