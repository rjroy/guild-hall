---
title: Fastmail JMAP Integration Research
date: 2026-03-06
status: implemented
tags: [jmap, fastmail, email, toolbox, mcp, integration]
modules: [packages]
---

# Fastmail JMAP Integration Research

Research for building a Guild Hall email toolbox connecting to Fastmail via JMAP.

## 1. JMAP Protocol

JMAP (JSON Meta Application Protocol) is an IETF standard (RFC 8620 core, RFC 8621 mail) designed to replace IMAP for email access. Fastmail created and champions JMAP; it's the protocol their own web client uses internally.

**How it differs from IMAP:**

| Aspect | IMAP | JMAP |
|--------|------|------|
| Transport | Custom TCP protocol, persistent connection | HTTP + JSON, stateless |
| Format | Custom text protocol | JSON request/response |
| Batching | One command per round-trip | Multiple method calls in a single HTTP POST |
| Sync | Full folder re-scan or IDLE | Delta sync via `/changes` endpoints |
| Push | IDLE (holds connection open) | EventSource (SSE) or webhook push |
| Auth | SASL/plain password | Bearer token (API token or OAuth) |
| Firewall | Ports 143/993, often blocked | Port 443, standard HTTPS |

**Core architecture:** Client POSTs a JSON body containing an array of method calls to the API URL. Each call is a triple: `[methodName, arguments, callId]`. The server returns responses in the same triple format, with call IDs matching. Multiple calls batch in one request, and back-references (`#ids`) let later calls reference results of earlier ones without extra round-trips.

**Source:** [RFC 8620](https://www.rfc-editor.org/rfc/rfc8620), [RFC 8621](https://www.rfc-editor.org/rfc/rfc8621.html), [JMAP Crash Course](https://jmap.io/crash-course.html)

## 2. TypeScript/JavaScript Libraries

### Assessed Libraries

| Library | TypeScript | Last Activity | Auth | Verdict |
|---------|-----------|---------------|------|---------|
| [jmap-yacl](https://github.com/ilyhalight/jmap-yacl) | Native (98% TS) | v1.2.1, Mar 2025 | Basic only | Most active, but basic auth only (no bearer token) |
| [jmap-client-ts](https://github.com/linagora/jmap-client-ts) | Native (98% TS) | v1.0.0, Mar 2022 | Access token | Dormant since 2022 |
| [jmap-js](https://github.com/jmapio/jmap-js) | No types | Stable/dormant | Custom | Fastmail's own lib, but depends on Overture framework, no TS |
| [jmap-client](https://www.npmjs.com/package/jmap-client) | No | ES6, transpiled | Custom | Linagora's older JS-only client |

### Assessment

None of these libraries are a good fit. jmap-yacl is the most current but only supports basic auth, not bearer tokens. jmap-client-ts is dormant. jmap-js requires Fastmail's entire Overture framework.

**The better path: use JMAP directly.** JMAP is HTTP + JSON by design. The protocol is deliberately simple to use with raw `fetch()`. Multiple existing Fastmail MCP servers ([MadLlama25/fastmail-mcp](https://github.com/MadLlama25/fastmail-mcp), [alexdiazdecerio/fastmail-mcp-server](https://github.com/alexdiazdecerio/fastmail-mcp-server)) take this approach: a thin TypeScript wrapper over `fetch()` with typed interfaces, no external JMAP library. This is the proven pattern.

**Confidence:** Verified against multiple implementations. The "no library needed" conclusion is consistent across all TypeScript Fastmail integrations found.

## 3. Fastmail Authentication

### API Tokens (recommended for a toolbox)

Created at Settings > Privacy & Security > Manage API tokens. Used as `Authorization: Bearer {token}` header. Tokens can be scoped to read-only or read-write. Simple, no OAuth dance required.

**Limitation:** Not available on Fastmail Basic plan ($3/mo). Requires Individual ($6/mo) or higher.

**Source:** [Fastmail API token docs](https://www.fastmail.help/hc/en-us/articles/5254602856719-API-tokens), [Fastmail dev docs](https://www.fastmail.com/dev/)

### OAuth 2.0

Full Authorization Code flow with PKCE. Required for distributing apps to other users. Requires prior client registration with Fastmail (submit at `/company/partners/`). Endpoints:
- Authorize: `https://api.fastmail.com/oauth/authorize`
- Token exchange: `https://api.fastmail.com/oauth/refresh`
- Revoke: `https://api.fastmail.com/oauth/revoke`

**For a personal toolbox:** API tokens are sufficient and far simpler. OAuth is only needed if serving multiple Fastmail users.

### Session Bootstrap

All JMAP interactions start by fetching the session resource:

```
GET https://api.fastmail.com/jmap/session
Authorization: Bearer {token}
```

The response contains:
- `accounts`: map of account IDs and their capabilities
- `apiUrl`: the endpoint for JMAP method calls
- `uploadUrl`: template for blob uploads
- `downloadUrl`: template for blob downloads
- `eventSourceUrl`: SSE endpoint for push notifications

**Source:** [Fastmail integration guide](https://www.fastmail.com/for-developers/integrating-with-fastmail/)

## 4. Fastmail-Specific JMAP Extensions

### Masked Email API

Fastmail extends JMAP with a `MaskedEmail` data type (scope: `https://www.fastmail.com/dev/maskedemail`). Supports `MaskedEmail/get` and `MaskedEmail/set` for creating disposable email addresses. Properties include `email`, `state` (pending/enabled/disabled/deleted), `forDomain`, `description`, `createdBy`, and `lastMessageAt`. Rate limited on creation.

### Known Quirks

- Fastmail's web client uses `https://www.fastmail.com/jmap/api` internally, which differs from the public API endpoint `https://api.fastmail.com/jmap/session`. Use the public endpoint. (Source: [Julia Evans blog post](https://jvns.ca/blog/2020/08/18/implementing--focus-and-reply--for-fastmail/))
- Some responses use deflate compression instead of gzip, which can complicate debugging in browser dev tools.
- CORS is enabled on the API endpoint, so browser-based integrations work.

**Confidence:** The Masked Email extension is verified against Fastmail's own docs. The quirks are inferred from a single blog post (lower confidence) but consistent with typical API behavior.

## 5. Core Operations for a Toolbox

### Available JMAP Scopes

| Scope | Purpose |
|-------|---------|
| `urn:ietf:params:jmap:core` | Required for all JMAP access |
| `urn:ietf:params:jmap:mail` | Read/manage mail and mailboxes |
| `urn:ietf:params:jmap:submission` | Send mail |
| `urn:ietf:params:jmap:vacationresponse` | Vacation auto-replies |
| `https://www.fastmail.com/dev/maskedemail` | Masked email management |

### TypeScript Implementation Pattern

The following code examples show what a thin JMAP client would look like. This pattern is based on existing working implementations.

#### Client Foundation

```typescript
interface JmapSession {
  apiUrl: string;
  accounts: Record<string, { name: string; isPersonal: boolean }>;
  primaryAccounts: Record<string, string>;
  downloadUrl: string;
  uploadUrl: string;
  eventSourceUrl: string;
}

type MethodCall = [string, Record<string, unknown>, string];

interface JmapRequest {
  using: string[];
  methodCalls: MethodCall[];
}

interface JmapResponse {
  methodResponses: [string, Record<string, unknown>, string][];
  sessionState: string;
}

class FastmailClient {
  private session: JmapSession | null = null;

  constructor(
    private token: string,
    private sessionUrl = "https://api.fastmail.com/jmap/session",
  ) {}

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.token}`,
    };
  }

  async connect(): Promise<JmapSession> {
    const res = await fetch(this.sessionUrl, { headers: this.headers() });
    if (!res.ok) throw new Error(`Session fetch failed: ${res.status}`);
    this.session = (await res.json()) as JmapSession;
    return this.session;
  }

  get accountId(): string {
    if (!this.session) throw new Error("Not connected");
    return this.session.primaryAccounts["urn:ietf:params:jmap:mail"];
  }

  async request(methodCalls: MethodCall[]): Promise<JmapResponse> {
    if (!this.session) throw new Error("Not connected");
    const body: JmapRequest = {
      using: [
        "urn:ietf:params:jmap:core",
        "urn:ietf:params:jmap:mail",
        "urn:ietf:params:jmap:submission",
      ],
      methodCalls,
    };
    const res = await fetch(this.session.apiUrl, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`JMAP request failed: ${res.status}`);
    return (await res.json()) as JmapResponse;
  }
}
```

#### Searching/Listing Emails

```typescript
// Search emails by sender, subject, date range, or folder
async function searchEmails(
  client: FastmailClient,
  filter: {
    from?: string;
    subject?: string;
    after?: string;     // UTC date: "2026-01-01T00:00:00Z"
    before?: string;
    inMailbox?: string;  // mailbox ID
    text?: string;       // full-text search
    hasAttachment?: boolean;
  },
  limit = 20,
): Promise<JmapResponse> {
  return client.request([
    // Step 1: Query for matching email IDs
    [
      "Email/query",
      {
        accountId: client.accountId,
        filter,
        sort: [{ property: "receivedAt", isAscending: false }],
        limit,
      },
      "query",
    ],
    // Step 2: Fetch email details using back-reference
    [
      "Email/get",
      {
        accountId: client.accountId,
        properties: [
          "id", "threadId", "mailboxIds", "from", "to", "subject",
          "receivedAt", "preview", "hasAttachment", "keywords",
        ],
        "#ids": {
          resultOf: "query",
          name: "Email/query",
          path: "/ids/*",
        },
      },
      "details",
    ],
  ]);
}
```

#### Reading Email Content

```typescript
// Get full email body content
async function readEmail(
  client: FastmailClient,
  emailId: string,
): Promise<JmapResponse> {
  return client.request([
    [
      "Email/get",
      {
        accountId: client.accountId,
        ids: [emailId],
        properties: [
          "id", "threadId", "from", "to", "cc", "bcc", "replyTo",
          "subject", "sentAt", "receivedAt",
          "bodyValues", "textBody", "htmlBody", "attachments",
          "keywords", "mailboxIds",
        ],
        fetchTextBodyValues: true,
        fetchHTMLBodyValues: true,
        maxBodyValueBytes: 256000,
      },
      "email",
    ],
  ]);
}
```

#### Sending Email

Sending is a two-step process: create the email as a draft, then submit it.

```typescript
async function sendEmail(
  client: FastmailClient,
  params: {
    from: { name: string; email: string };
    to: { name: string; email: string }[];
    subject: string;
    textBody: string;
    htmlBody?: string;
    identityId: string; // from Identity/get
  },
): Promise<JmapResponse> {
  const draftId = "draft-1"; // client-assigned creation ID

  const bodyParts = [
    {
      partId: "text",
      type: "text/plain",
    },
    ...(params.htmlBody
      ? [{ partId: "html", type: "text/html" }]
      : []),
  ];

  const bodyValues: Record<string, { value: string }> = {
    text: { value: params.textBody },
    ...(params.htmlBody
      ? { html: { value: params.htmlBody } }
      : {}),
  };

  return client.request([
    // Step 1: Create email object
    [
      "Email/set",
      {
        accountId: client.accountId,
        create: {
          [draftId]: {
            from: [params.from],
            to: params.to,
            subject: params.subject,
            textBody: bodyParts.filter((p) => p.type === "text/plain"),
            htmlBody: params.htmlBody
              ? bodyParts.filter((p) => p.type === "text/html")
              : undefined,
            bodyValues,
            keywords: { $draft: true },
            mailboxIds: {}, // server assigns drafts folder
          },
        },
      },
      "create",
    ],
    // Step 2: Submit for sending
    [
      "EmailSubmission/set",
      {
        accountId: client.accountId,
        create: {
          "sub-1": {
            identityId: params.identityId,
            emailId: `#${draftId}`, // reference the created email
          },
        },
        onSuccessUpdateEmail: {
          "#sub-1": {
            "keywords/$draft": null, // remove draft flag
          },
        },
      },
      "submit",
    ],
  ]);
}
```

#### Managing Mailboxes (Folders)

```typescript
// List all mailboxes
async function listMailboxes(
  client: FastmailClient,
): Promise<JmapResponse> {
  return client.request([
    [
      "Mailbox/get",
      {
        accountId: client.accountId,
        properties: [
          "id", "name", "parentId", "role", "sortOrder",
          "totalEmails", "unreadEmails",
        ],
      },
      "mailboxes",
    ],
  ]);
}

// Find a specific mailbox by role (inbox, drafts, sent, trash, etc.)
async function findMailboxByRole(
  client: FastmailClient,
  role: string,
): Promise<JmapResponse> {
  return client.request([
    [
      "Mailbox/query",
      {
        accountId: client.accountId,
        filter: { role },
      },
      "query",
    ],
    [
      "Mailbox/get",
      {
        accountId: client.accountId,
        "#ids": {
          resultOf: "query",
          name: "Mailbox/query",
          path: "/ids/*",
        },
      },
      "mailbox",
    ],
  ]);
}

// Move email to a different mailbox
async function moveEmail(
  client: FastmailClient,
  emailId: string,
  fromMailboxId: string,
  toMailboxId: string,
): Promise<JmapResponse> {
  return client.request([
    [
      "Email/set",
      {
        accountId: client.accountId,
        update: {
          [emailId]: {
            [`mailboxIds/${fromMailboxId}`]: null,
            [`mailboxIds/${toMailboxId}`]: true,
          },
        },
      },
      "move",
    ],
  ]);
}
```

#### Checking for New Mail

JMAP supports two mechanisms:

**Polling via Email/changes:**
```typescript
// Track changes since a known state
async function checkForChanges(
  client: FastmailClient,
  sinceState: string,
): Promise<JmapResponse> {
  return client.request([
    [
      "Email/changes",
      {
        accountId: client.accountId,
        sinceState,
        maxChanges: 50,
      },
      "changes",
    ],
  ]);
}
```

**Push via EventSource (SSE):**
The session provides an `eventSourceUrl`. The server pushes `StateChange` events whenever data changes. The client can then call the appropriate `/changes` endpoint to fetch the delta.

```typescript
function subscribeToChanges(
  session: JmapSession,
  token: string,
  onStateChange: (change: Record<string, unknown>) => void,
): EventSource {
  const url = new URL(session.eventSourceUrl);
  url.searchParams.set("types", "Email,Mailbox");

  const es = new EventSource(url.toString(), {
    // Note: EventSource doesn't support custom headers natively.
    // Fastmail accepts the token as a query parameter for EventSource.
  });

  es.addEventListener("state", (event) => {
    const data = JSON.parse((event as MessageEvent).data);
    onStateChange(data);
  });

  return es;
}
```

**Note on EventSource auth:** Browser `EventSource` doesn't support custom headers. Fastmail may require passing the token as a query parameter or using a polyfill that supports headers. This needs verification during implementation. Confidence: inferred from SSE spec limitations, not verified against Fastmail specifically.

## 6. Rate Limits and Quotas

### Sending Limits (per account, all protocols combined)

| Window | Basic | Standard | Professional |
|--------|-------|----------|-------------|
| Daily | 4,000 | 8,000 | 16,000 |
| Hourly | Half of daily | Half of daily | Half of daily |
| 10-minute | Half of hourly | Half of hourly | Half of hourly |
| Per-minute | 100 messages, 100 MB | 100 messages, 100 MB | 100 messages, 100 MB |

### Login/Connection Limits

500 successful logins per 10 minutes across all services (IMAP, POP, SMTP, JMAP). Each JMAP session fetch counts as a login.

### API Rate Limits

Fastmail does not publish specific JMAP API request rate limits beyond the login throttle. The MaskedEmail extension has explicit rate limits on creation. For read operations, no published limits were found, but aggressive polling would hit the login limit.

**Practical implication for a toolbox:** Cache the session object (it rarely changes). Don't reconnect for every operation. A single session fetch at startup, then reuse the API URL for all subsequent calls.

### Plan Availability

API tokens require Individual plan ($6/mo) or higher. Basic plan ($3/mo for legacy, current plans start at $6/mo) does not support API tokens.

**Source:** [Fastmail account limits](https://www.fastmail.help/hc/en-us/articles/1500000277382-Account-limits), [Fastmail pricing](https://www.fastmail.com/pricing/us/)

## 7. Security Considerations

### Token Storage

API tokens are shared secrets. They should be stored with the same care as passwords:
- Environment variable (`FASTMAIL_API_TOKEN`) for runtime
- Never committed to version control
- For Guild Hall: could use the daemon's config system or a `.env` file in the Guild Hall home directory

### Scope Minimization

Create tokens with minimum required access:
- **Read-only toolbox** (search, read, list): Create a read-only token with `urn:ietf:params:jmap:mail` scope
- **Read-write toolbox** (send, move, delete): Requires read-write token with `urn:ietf:params:jmap:mail` + `urn:ietf:params:jmap:submission`
- Separate tokens for separate concerns (one for reading, one for sending) is viable

### Permission Model

| Operation | Minimum Scope | Access Level |
|-----------|--------------|--------------|
| Search/list emails | `jmap:core` + `jmap:mail` | Read-only |
| Read email content | `jmap:core` + `jmap:mail` | Read-only |
| Move/flag emails | `jmap:core` + `jmap:mail` | Read-write |
| Send email | `jmap:core` + `jmap:mail` + `jmap:submission` | Read-write |
| Manage mailboxes | `jmap:core` + `jmap:mail` | Read-write |
| Vacation response | `jmap:core` + `jmap:vacationresponse` | Read-write |
| Masked email | `jmap:core` + fastmail maskedemail scope | Read-write |

### Token Revocation

Tokens can be revoked at any time from the Fastmail web UI (Settings > Privacy & Security > Manage API tokens). OAuth tokens can be revoked via `POST https://api.fastmail.com/oauth/revoke`.

## 8. Feasibility Assessment

### Effort Estimate

Building a Guild Hall email toolbox for Fastmail is **low-to-moderate effort**. The hardest part isn't the API integration; it's the toolbox design decisions.

**What's straightforward:**
- JMAP client wrapper: ~200 lines of TypeScript. Raw `fetch()` with typed interfaces. No library needed.
- Core operations (search, read, list mailboxes): Direct translation from the examples above.
- Authentication: Bearer token in a header. Session fetch at startup.

**What requires design decisions:**
- Toolbox scope: Read-only vs read-write. Start read-only to limit blast radius.
- Send confirmation: Sending email from an AI agent needs a confirmation gate. The existing MCP servers use a "preview then confirm" pattern.
- Token management: Where does the token live? Guild Hall config? Environment variable? Per-project?
- Error handling: JMAP returns structured errors. Map these to toolbox-friendly messages.

### Prior Art

Multiple working TypeScript implementations exist as MCP servers:
- [MadLlama25/fastmail-mcp](https://github.com/MadLlama25/fastmail-mcp): Full email, contacts, calendar via MCP
- [alexdiazdecerio/fastmail-mcp-server](https://github.com/alexdiazdecerio/fastmail-mcp-server): Email management with search, send, organize
- [wyattjoh/jmap-mcp](https://github.com/wyattjoh/jmap-mcp): Deno-based, uses jmap-jam library

These prove the integration works. They also show the pattern: thin JMAP wrapper, typed interfaces, no external JMAP library dependency.

### Options for Implementation

**Option A: Custom toolbox package in `packages/`**
Write a `fastmail` toolbox that exposes JMAP operations as Guild Hall tools. Fits the existing toolbox resolver pattern. Full control over the API surface.

**Option B: Wrap an existing MCP server**
Since Guild Hall already uses MCP, an existing Fastmail MCP server could be registered as an MCP integration. Less custom code, but less control over the tool interface and naming.

**Option C: Hybrid**
Use the MCP server for heavy lifting during development, then extract and own the JMAP client code as it stabilizes. This gets working tools fastest while preserving the option to customize later.

### What I Don't Know

- **EventSource authentication details for Fastmail specifically.** The SSE spec doesn't support custom headers natively. How Fastmail handles auth on the EventSource URL needs testing. This matters for push-based "new mail" notifications but not for polling.
- **Exact API rate limits for read operations.** Fastmail publishes sending and login limits but not per-endpoint throttling for JMAP method calls. Reasonable use should be fine; aggressive polling could hit the 500-login-per-10-minute limit if sessions aren't cached.
- **Whether Fastmail's "read-only" token scope covers all read operations** or only a subset. The help docs mention read-only as an option but don't enumerate exactly which methods it permits. Needs testing.
