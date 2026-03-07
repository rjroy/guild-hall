import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createMailRecordOps } from "@/daemon/services/mail/record";
import type { MailRecordOps } from "@/daemon/services/mail/record";

let tmpDir: string;
let mailDir: string;
let ops: MailRecordOps;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-mail-record-"));
  mailDir = path.join(tmpDir, ".lore", "mail", "commission-Dalton-20260306-195548");
  ops = createMailRecordOps();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("createMailFile", () => {
  test("creates file with correct frontmatter and sections", async () => {
    const filePath = await ops.createMailFile(
      mailDir, 1, "Dalton", "Thorne", "commission-Dalton-20260306-195548",
      "Review this spec", "Please review the auth spec for security issues.",
    );

    expect(filePath).toBe(path.join(mailDir, "001-to-Thorne.md"));

    const raw = await fs.readFile(filePath, "utf-8");

    // Frontmatter fields
    expect(raw).toContain('title: "Mail: Review this spec"');
    expect(raw).toContain("from: Dalton");
    expect(raw).toContain("to: Thorne");
    expect(raw).toContain("commission: commission-Dalton-20260306-195548");
    expect(raw).toContain("sequence: 1");
    expect(raw).toContain("status: sent");

    // Sections
    expect(raw).toContain("## Message");
    expect(raw).toContain("Please review the auth spec for security issues.");
    expect(raw).toContain("## Reply");
  });

  test("creates directory if it does not exist", async () => {
    const deepDir = path.join(tmpDir, "nested", "dir", "mail");
    await ops.createMailFile(deepDir, 1, "A", "B", "cid", "subj", "msg");

    const entries = await fs.readdir(deepDir);
    expect(entries).toHaveLength(1);
  });

  test("uses zero-padded sequence in filename", async () => {
    const p1 = await ops.createMailFile(mailDir, 1, "A", "B", "c", "s", "m");
    const p42 = await ops.createMailFile(mailDir, 42, "A", "C", "c", "s", "m");

    expect(path.basename(p1)).toBe("001-to-B.md");
    expect(path.basename(p42)).toBe("042-to-C.md");
  });
});

describe("updateMailStatus", () => {
  test("transitions sent -> open", async () => {
    const filePath = await ops.createMailFile(
      mailDir, 1, "Dalton", "Thorne", "cid", "subj", "msg",
    );

    await ops.updateMailStatus(filePath, "open");

    const raw = await fs.readFile(filePath, "utf-8");
    expect(raw).toContain("status: open");
    expect(raw).not.toContain("status: sent");
  });

  test("transitions open -> replied", async () => {
    const filePath = await ops.createMailFile(
      mailDir, 1, "Dalton", "Thorne", "cid", "subj", "msg",
    );

    await ops.updateMailStatus(filePath, "open");
    await ops.updateMailStatus(filePath, "replied");

    const raw = await fs.readFile(filePath, "utf-8");
    expect(raw).toContain("status: replied");
    expect(raw).not.toContain("status: open");
  });
});

describe("writeReply", () => {
  test("writes summary and updates status to replied", async () => {
    const filePath = await ops.createMailFile(
      mailDir, 1, "Dalton", "Thorne", "cid", "subj", "msg",
    );

    await ops.writeReply(filePath, "Auth spec looks solid, no issues found.");

    const raw = await fs.readFile(filePath, "utf-8");
    expect(raw).toContain("status: replied");
    expect(raw).toContain("**Summary:** Auth spec looks solid, no issues found.");
  });

  test("writes summary with details", async () => {
    const filePath = await ops.createMailFile(
      mailDir, 1, "Dalton", "Thorne", "cid", "subj", "msg",
    );

    await ops.writeReply(
      filePath,
      "Found 2 issues",
      "1. Missing CSRF protection\n2. Token expiry too long",
    );

    const raw = await fs.readFile(filePath, "utf-8");
    expect(raw).toContain("**Summary:** Found 2 issues");
    expect(raw).toContain("**Details:**");
    expect(raw).toContain("Missing CSRF protection");
    expect(raw).toContain("Token expiry too long");
  });

  test("writes summary with files_modified", async () => {
    const filePath = await ops.createMailFile(
      mailDir, 1, "Dalton", "Thorne", "cid", "subj", "msg",
    );

    await ops.writeReply(
      filePath,
      "Fixed the issues",
      undefined,
      ["src/auth.ts", "src/middleware.ts"],
    );

    const raw = await fs.readFile(filePath, "utf-8");
    expect(raw).toContain("**Files modified:**");
    expect(raw).toContain("- src/auth.ts");
    expect(raw).toContain("- src/middleware.ts");
  });
});

describe("readMailFile", () => {
  test("parses a sent mail file", async () => {
    const filePath = await ops.createMailFile(
      mailDir, 1, "Dalton", "Thorne", "commission-test",
      "Review this", "Please check the code.",
    );

    const parsed = await ops.readMailFile(filePath);

    expect(parsed.from).toBe("Dalton");
    expect(parsed.to).toBe("Thorne");
    expect(parsed.commission).toBe("commission-test");
    expect(parsed.sequence).toBe(1);
    expect(parsed.status).toBe("sent");
    expect(parsed.subject).toBe("Review this");
    expect(parsed.message).toBe("Please check the code.");
    expect(parsed.reply).toBeUndefined();
  });

  test("parses a replied mail file", async () => {
    const filePath = await ops.createMailFile(
      mailDir, 1, "Dalton", "Thorne", "cid",
      "Review spec", "Check auth.",
    );

    await ops.writeReply(filePath, "Looks good", "No major issues.");

    const parsed = await ops.readMailFile(filePath);

    expect(parsed.status).toBe("replied");
    expect(parsed.reply).toBeDefined();
    expect(parsed.reply?.summary).toBe("Looks good");
    expect(parsed.reply?.details).toBe("No major issues.");
  });
});

describe("getMailSequence", () => {
  test("returns 1 for empty directory", async () => {
    const seq = await ops.getMailSequence(mailDir);
    expect(seq).toBe(1);
  });

  test("returns 1 for non-existent directory", async () => {
    const seq = await ops.getMailSequence(path.join(tmpDir, "no-such-dir"));
    expect(seq).toBe(1);
  });

  test("increments past existing files", async () => {
    await ops.createMailFile(mailDir, 1, "A", "B", "c", "s", "m");
    await ops.createMailFile(mailDir, 2, "A", "C", "c", "s", "m");

    const seq = await ops.getMailSequence(mailDir);
    expect(seq).toBe(3);
  });

  test("handles gaps in sequence", async () => {
    await ops.createMailFile(mailDir, 1, "A", "B", "c", "s", "m");
    await ops.createMailFile(mailDir, 5, "A", "C", "c", "s", "m");

    const seq = await ops.getMailSequence(mailDir);
    expect(seq).toBe(6);
  });
});
