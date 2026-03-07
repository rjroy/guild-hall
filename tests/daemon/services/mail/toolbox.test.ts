import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  makeReplyHandler,
  createMailToolboxWithCallbacks,
} from "@/daemon/services/mail/toolbox";
import { createMailRecordOps } from "@/daemon/services/mail/record";
import type { MailRecordOps } from "@/daemon/services/mail/record";

let tmpDir: string;
let mailDir: string;
let ops: MailRecordOps;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-mail-toolbox-"));
  mailDir = path.join(tmpDir, ".lore", "mail", "commission-test");
  ops = createMailRecordOps();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("reply tool", () => {
  test("writes reply to mail file and invokes callback", async () => {
    const filePath = await ops.createMailFile(
      mailDir, 1, "Dalton", "Thorne", "commission-test",
      "Review this", "Please check.",
    );

    const replies: string[] = [];
    const handler = makeReplyHandler(filePath, {
      onReply: (summary) => replies.push(summary),
    }, ops);

    const result = await handler({
      summary: "Looks good, no issues.",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe("Reply submitted: Looks good, no issues.");
    expect(replies).toEqual(["Looks good, no issues."]);

    // Verify reply was written to file
    const parsed = await ops.readMailFile(filePath);
    expect(parsed.status).toBe("replied");
    expect(parsed.reply?.summary).toBe("Looks good, no issues.");
  });

  test("writes reply with details and files_modified", async () => {
    const filePath = await ops.createMailFile(
      mailDir, 1, "Dalton", "Thorne", "commission-test",
      "Fix auth", "Fix the token expiry.",
    );

    const handler = makeReplyHandler(filePath, { onReply: () => {} }, ops);

    await handler({
      summary: "Fixed token expiry",
      details: "Changed from 24h to 1h for refresh tokens.",
      files_modified: ["src/auth.ts"],
    });

    const parsed = await ops.readMailFile(filePath);
    expect(parsed.reply?.summary).toBe("Fixed token expiry");
    expect(parsed.reply?.details).toBe("Changed from 24h to 1h for refresh tokens.");
    expect(parsed.reply?.filesModified).toContain("src/auth.ts");
  });

  test("rejects second call (one-call guard)", async () => {
    const filePath = await ops.createMailFile(
      mailDir, 1, "Dalton", "Thorne", "commission-test",
      "Review", "Check.",
    );

    const handler = makeReplyHandler(filePath, { onReply: () => {} }, ops);

    const first = await handler({ summary: "First reply" });
    expect(first.isError).toBeUndefined();

    const second = await handler({ summary: "Second reply" });
    expect(second.isError).toBe(true);
    expect(second.content[0].text).toContain("already submitted");
  });

  test("does not invoke callback on second call", async () => {
    const filePath = await ops.createMailFile(
      mailDir, 1, "Dalton", "Thorne", "commission-test",
      "Review", "Check.",
    );

    const replies: string[] = [];
    const handler = makeReplyHandler(filePath, {
      onReply: (s) => replies.push(s),
    }, ops);

    await handler({ summary: "First" });
    await handler({ summary: "Second" });

    expect(replies).toEqual(["First"]);
  });
});

describe("createMailToolboxWithCallbacks", () => {
  test("returns valid MCP server config", async () => {
    const filePath = await ops.createMailFile(
      mailDir, 1, "A", "B", "c", "s", "m",
    );

    const server = createMailToolboxWithCallbacks(filePath, {
      onReply: () => {},
    }, ops);

    expect(server.type).toBe("sdk");
    expect(server.name).toBe("guild-hall-mail");
    expect(server.instance).toBeDefined();
  });
});
