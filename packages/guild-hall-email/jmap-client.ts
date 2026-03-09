/**
 * Thin JMAP client wrapper for Fastmail.
 *
 * Uses raw fetch() with typed interfaces. No external JMAP library.
 * Capabilities are limited to jmap:core and jmap:mail (REQ-EMT-11).
 */

export interface JmapSession {
  apiUrl: string;
  accounts: Record<string, { name: string; isPersonal: boolean }>;
  primaryAccounts: Record<string, string>;
  downloadUrl: string;
  uploadUrl: string;
  eventSourceUrl: string;
}

export type MethodCall = [string, Record<string, unknown>, string];

export interface JmapRequest {
  using: string[];
  methodCalls: MethodCall[];
}

export interface JmapResponse {
  methodResponses: [string, Record<string, unknown>, string][];
  sessionState: string;
}

export interface Mailbox {
  id: string;
  name: string;
  role: string | null;
  parentId: string | null;
  totalEmails: number;
  unreadEmails: number;
}

const JMAP_CAPABILITIES = [
  "urn:ietf:params:jmap:core",
  "urn:ietf:params:jmap:mail",
] as const;

const DEFAULT_SESSION_URL = "https://api.fastmail.com/jmap/session";

export class JmapClient {
  private session: JmapSession | null = null;
  private mailboxCache: Mailbox[] = [];
  private connectionPromise: Promise<void> | null = null;
  private connected = false;
  private connectionFailed = false;
  private fetchFn: typeof fetch;

  constructor(
    private token: string,
    private sessionUrl: string = DEFAULT_SESSION_URL,
    fetchFn?: typeof fetch,
  ) {
    this.fetchFn = fetchFn ?? globalThis.fetch;
  }

  /**
   * Fetches the JMAP session and populates the mailbox cache.
   * Called internally by ensureConnected(). Do not call directly.
   */
  private async connect(): Promise<void> {
    // Step 1: Fetch session resource
    const sessionRes = await this.fetchFn(this.sessionUrl, {
      headers: this.authHeaders(),
    });

    if (!sessionRes.ok) {
      throw new Error(
        `JMAP session fetch failed: HTTP ${sessionRes.status} ${sessionRes.statusText}`,
      );
    }

    this.session = (await sessionRes.json()) as JmapSession;

    // Step 2: Fetch mailboxes to populate cache
    const mailboxRes = await this.fetchFn(this.session.apiUrl, {
      method: "POST",
      headers: this.contentHeaders(),
      body: JSON.stringify({
        using: [...JMAP_CAPABILITIES],
        methodCalls: [
          [
            "Mailbox/get",
            {
              accountId: this.accountIdFromSession(),
              properties: [
                "id",
                "name",
                "role",
                "parentId",
                "totalEmails",
                "unreadEmails",
              ],
            },
            "mailboxes",
          ],
        ],
      } satisfies JmapRequest),
    });

    if (!mailboxRes.ok) {
      throw new Error(
        `JMAP mailbox fetch failed: HTTP ${mailboxRes.status} ${mailboxRes.statusText}`,
      );
    }

    const mailboxData = (await mailboxRes.json()) as JmapResponse;

    // Check for JMAP-level errors in the mailbox response
    const [responseName, responseArgs] = mailboxData.methodResponses[0];
    if (responseName.endsWith("/error")) {
      const errorType = typeof responseArgs.type === "string" ? responseArgs.type : "unknownError";
      const errorDesc = typeof responseArgs.description === "string" ? responseArgs.description : undefined;
      throw new Error(
        `JMAP mailbox fetch error: ${errorType}${errorDesc ? ` - ${errorDesc}` : ""}`,
      );
    }

    this.mailboxCache = (
      responseArgs as { list: Mailbox[] }
    ).list;
  }

  /**
   * Public connection API for tool handlers. Manages the connection lifecycle:
   * - If connected, returns immediately.
   * - If never connected, calls connect().
   * - If connect() previously failed, attempts one re-connect.
   */
  async ensureConnected(): Promise<void> {
    if (this.connected) return;

    if (this.connectionPromise && !this.connectionFailed) {
      return this.connectionPromise;
    }

    // Reset on retry
    this.connectionFailed = false;
    this.connectionPromise = this.connect();
    try {
      await this.connectionPromise;
      this.connected = true;
    } catch (err) {
      this.connectionFailed = true;
      this.connectionPromise = null;
      throw err;
    }
  }

  /**
   * Sends batched JMAP method calls to the API endpoint.
   *
   * Handles:
   * - 401: re-fetches session once and retries
   * - 429 or JMAP tooManyRequests: throws rate limit message
   * - Other HTTP errors: throws with status code
   * - JMAP-level errors: throws with error type and description
   */
  async request(methodCalls: MethodCall[]): Promise<JmapResponse> {
    if (!this.session) {
      throw new Error("Not connected. Call ensureConnected() first.");
    }

    const body: JmapRequest = {
      using: [...JMAP_CAPABILITIES],
      methodCalls,
    };

    const res = await this.fetchFn(this.session.apiUrl, {
      method: "POST",
      headers: this.contentHeaders(),
      body: JSON.stringify(body),
    });

    // Handle 401: re-fetch session and retry once
    if (res.status === 401) {
      return this.retryAfterSessionRefresh(methodCalls);
    }

    // Handle 429: rate limit
    if (res.status === 429) {
      throw new Error("Rate limited by Fastmail. Try again in a moment.");
    }

    if (!res.ok) {
      throw new Error(
        `JMAP request failed: HTTP ${res.status} ${res.statusText}`,
      );
    }

    const data = (await res.json()) as JmapResponse;

    // Check for JMAP-level errors in responses
    this.checkForJmapErrors(data);

    return data;
  }

  /**
   * Returns the primary mail account ID from the cached session.
   */
  get accountId(): string {
    if (!this.session) {
      throw new Error("Not connected. Call ensureConnected() first.");
    }
    return this.accountIdFromSession();
  }

  /**
   * Case-insensitive mailbox name lookup. Returns the JMAP mailbox ID.
   * Throws with available names if no match is found.
   */
  resolveMailboxName(name: string): string {
    const lower = name.toLowerCase();
    const match = this.mailboxCache.find(
      (mb) => mb.name.toLowerCase() === lower,
    );

    if (!match) {
      const available = this.mailboxCache.map((mb) => mb.name).join(", ");
      throw new Error(
        `Mailbox "${name}" not found. Available mailboxes: ${available}`,
      );
    }

    return match.id;
  }

  /**
   * Reverse mailbox ID lookup. Returns the mailbox name.
   * Returns the ID itself if no match is found (graceful fallback).
   */
  resolveMailboxId(id: string): string {
    const match = this.mailboxCache.find((mb) => mb.id === id);
    return match ? match.name : id;
  }

  /**
   * Returns the cached mailbox list.
   */
  get mailboxes(): Mailbox[] {
    return this.mailboxCache;
  }

  // -- Private helpers --

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
    };
  }

  private contentHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.token}`,
    };
  }

  private accountIdFromSession(): string {
    if (!this.session) {
      throw new Error("Not connected.");
    }
    return this.session.primaryAccounts["urn:ietf:params:jmap:mail"];
  }

  /**
   * Re-fetches the session and retries the original request once.
   * If the retry also returns 401, throws.
   */
  private async retryAfterSessionRefresh(
    methodCalls: MethodCall[],
  ): Promise<JmapResponse> {
    // Re-fetch session
    const sessionRes = await this.fetchFn(this.sessionUrl, {
      headers: this.authHeaders(),
    });

    if (!sessionRes.ok) {
      throw new Error(
        `JMAP session re-fetch failed: HTTP ${sessionRes.status} ${sessionRes.statusText}`,
      );
    }

    this.session = (await sessionRes.json()) as JmapSession;

    // Retry the original request
    const body: JmapRequest = {
      using: [...JMAP_CAPABILITIES],
      methodCalls,
    };

    const retryRes = await this.fetchFn(this.session.apiUrl, {
      method: "POST",
      headers: this.contentHeaders(),
      body: JSON.stringify(body),
    });

    if (retryRes.status === 401) {
      throw new Error(
        "JMAP request failed: HTTP 401 Unauthorized (after session refresh)",
      );
    }

    if (retryRes.status === 429) {
      throw new Error("Rate limited by Fastmail. Try again in a moment.");
    }

    if (!retryRes.ok) {
      throw new Error(
        `JMAP request failed: HTTP ${retryRes.status} ${retryRes.statusText}`,
      );
    }

    const data = (await retryRes.json()) as JmapResponse;
    this.checkForJmapErrors(data);
    return data;
  }

  /**
   * Inspects JMAP method responses for errors (response names ending in "/error").
   * Also detects rate-limit errors embedded in JMAP responses.
   */
  private checkForJmapErrors(data: JmapResponse): void {
    for (const [name, args] of data.methodResponses) {
      if (name.endsWith("/error")) {
        const errorType = typeof args.type === "string" ? args.type : "unknownError";
        const errorDesc = typeof args.description === "string" ? args.description : undefined;

        // Check for rate limiting at the JMAP level
        if (errorType.toLowerCase().includes("toomanyrequests")) {
          throw new Error(
            "Rate limited by Fastmail. Try again in a moment.",
          );
        }

        throw new Error(
          `JMAP error (${errorType})${errorDesc ? `: ${errorDesc}` : ""}`,
        );
      }
    }
  }
}
