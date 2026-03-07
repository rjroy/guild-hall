/**
 * Mail record operations: read/write for mail artifact files.
 *
 * Follows the CommissionRecordOps pattern: regex-based field replacement
 * to avoid gray-matter reformatting. Accepts filesystem functions as
 * parameters for testability (DI pattern).
 */

import * as nodeFs from "node:fs/promises";
import * as path from "node:path";
import { replaceYamlField, readYamlField } from "@/daemon/lib/record-utils";
import { escapeYamlValue } from "@/daemon/lib/toolbox-utils";
import type { MailStatus } from "./types";

// -- Types --

export interface MailRecordOps {
  createMailFile(
    dir: string,
    sequence: number,
    from: string,
    to: string,
    commission: string,
    subject: string,
    message: string,
  ): Promise<string>;

  updateMailStatus(filePath: string, status: MailStatus): Promise<void>;

  writeReply(
    filePath: string,
    summary: string,
    details?: string,
    filesModified?: string[],
  ): Promise<void>;

  readMailFile(filePath: string): Promise<ParsedMailFile>;

  getMailSequence(dir: string): Promise<number>;
}

export interface ParsedMailFile {
  from: string;
  to: string;
  commission: string;
  sequence: number;
  status: MailStatus;
  subject: string;
  message: string;
  reply?: {
    summary: string;
    details?: string;
    filesModified?: string[];
  };
}

// -- Filesystem DI --

export type FsDeps = {
  readFile: typeof nodeFs.readFile;
  writeFile: typeof nodeFs.writeFile;
  mkdir: typeof nodeFs.mkdir;
  readdir: typeof nodeFs.readdir;
};

const defaultFs: FsDeps = {
  readFile: nodeFs.readFile,
  writeFile: nodeFs.writeFile,
  mkdir: nodeFs.mkdir,
  readdir: nodeFs.readdir,
};

// -- Helpers --

function padSequence(seq: number): string {
  return String(seq).padStart(3, "0");
}

function mailFileName(sequence: number, readerName: string): string {
  return `${padSequence(sequence)}-to-${readerName}.md`;
}

// -- Implementation --

export function createMailRecordOps(fs: FsDeps = defaultFs): MailRecordOps {
  return {
    async createMailFile(
      dir: string,
      sequence: number,
      from: string,
      to: string,
      commission: string,
      subject: string,
      message: string,
    ): Promise<string> {
      await fs.mkdir(dir, { recursive: true });
      const fileName = mailFileName(sequence, to);
      const filePath = path.join(dir, fileName);

      const now = new Date();
      const dateStr = now.toISOString().split("T")[0];

      const content = `---
title: "Mail: ${escapeYamlValue(subject)}"
date: ${dateStr}
from: ${from}
to: ${to}
commission: ${commission}
sequence: ${sequence}
status: sent
---

## Message

${message}

## Reply

`;
      await fs.writeFile(filePath, content, "utf-8");
      return filePath;
    },

    async updateMailStatus(filePath: string, status: MailStatus): Promise<void> {
      const raw = await fs.readFile(filePath, "utf-8");
      const updated = replaceYamlField(raw, "status", status);
      await fs.writeFile(filePath, updated, "utf-8");
    },

    async writeReply(
      filePath: string,
      summary: string,
      details?: string,
      filesModified?: string[],
    ): Promise<void> {
      let raw = await fs.readFile(filePath, "utf-8");

      // Update status to replied
      raw = replaceYamlField(raw, "status", "replied");

      // Build the reply section content
      let replyContent = `**Summary:** ${summary}`;
      if (details) {
        replyContent += `\n\n**Details:**\n\n${details}`;
      }
      if (filesModified && filesModified.length > 0) {
        replyContent += `\n\n**Files modified:**\n\n${filesModified.map((f) => `- ${f}`).join("\n")}`;
      }

      // Replace the empty Reply section with populated content
      raw = raw.replace(/## Reply\n\n?$/, `## Reply\n\n${replyContent}\n`);
      // If the reply section has content already (shouldn't happen), append
      if (!raw.includes(replyContent)) {
        raw = raw.replace(/## Reply\n/, `## Reply\n\n${replyContent}\n`);
      }

      await fs.writeFile(filePath, raw, "utf-8");
    },

    async readMailFile(filePath: string): Promise<ParsedMailFile> {
      const raw = await fs.readFile(filePath, "utf-8");

      const from = readYamlField(raw, "from") ?? "";
      const to = readYamlField(raw, "to") ?? "";
      const commission = readYamlField(raw, "commission") ?? "";
      const sequenceStr = readYamlField(raw, "sequence") ?? "1";
      const status = (readYamlField(raw, "status") ?? "sent") as MailStatus;
      const subject = readYamlField(raw, "title") ?? "";
      // Strip "Mail: " prefix from title to get subject
      const cleanSubject = subject.startsWith("Mail: ") ? subject.slice(6) : subject;

      // Extract message from ## Message section
      const messageMatch = raw.match(/## Message\n\n([\s\S]*?)(?=\n## Reply)/);
      const message = messageMatch ? messageMatch[1].trim() : "";

      // Extract reply if present
      let reply: ParsedMailFile["reply"];
      if (status === "replied") {
        const replyMatch = raw.match(/## Reply\n\n([\s\S]*?)$/);
        if (replyMatch) {
          const replySection = replyMatch[1].trim();
          const summaryMatch = replySection.match(/\*\*Summary:\*\* (.*)/);
          const detailsMatch = replySection.match(/\*\*Details:\*\*\n\n([\s\S]*?)(?=\n\n\*\*Files modified:\*\*|$)/);
          const filesMatch = replySection.match(/\*\*Files modified:\*\*\n\n([\s\S]*?)$/);

          const replyFiles = filesMatch
            ? filesMatch[1].trim().split("\n").map((l) => l.replace(/^- /, "").trim()).filter(Boolean)
            : undefined;

          reply = {
            summary: summaryMatch ? summaryMatch[1] : "",
            details: detailsMatch ? detailsMatch[1].trim() : undefined,
            filesModified: replyFiles,
          };
        }
      }

      return {
        from,
        to,
        commission,
        sequence: parseInt(sequenceStr, 10),
        status,
        subject: cleanSubject,
        message,
        reply,
      };
    },

    async getMailSequence(dir: string): Promise<number> {
      let entries: string[];
      try {
        const dirEntries = await fs.readdir(dir, { withFileTypes: false });
        entries = dirEntries as unknown as string[];
      } catch {
        return 1;
      }

      let maxSeq = 0;
      for (const entry of entries) {
        const name = typeof entry === "string" ? entry : String(entry);
        const match = name.match(/^(\d{3})-to-/);
        if (match) {
          const seq = parseInt(match[1], 10);
          if (seq > maxSeq) maxSeq = seq;
        }
      }
      return maxSeq + 1;
    },
  };
}
