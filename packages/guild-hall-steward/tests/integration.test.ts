import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  discoverPackages,
  packageMetadataSchema,
} from "@/lib/packages";
import { resolveToolSet } from "@/apps/daemon/services/toolbox-resolver";
import { createContextTypeRegistry } from "@/apps/daemon/services/context-type-registry";
import { createEventBus } from "@/apps/daemon/lib/event-bus";
import type {
  WorkerMetadata,
  DiscoveredPackage,
  AppConfig,
} from "@/lib/types";

const PACKAGES_DIR = path.resolve(__dirname, "../../../packages");
const STEWARD_DIR = path.join(PACKAGES_DIR, "guild-hall-steward");
const EMAIL_DIR = path.join(PACKAGES_DIR, "guild-hall-email");

let tmpDir: string;
let guildHallHome: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-steward-"));
  guildHallHome = path.join(tmpDir, ".guild-hall");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeEmailPackage(): DiscoveredPackage {
  return {
    name: "guild-hall-email",
    path: EMAIL_DIR,
    metadata: {
      type: "toolbox",
      name: "guild-hall-email",
      description: "Read-only access to the user's Fastmail inbox via JMAP.",
    },
  };
}

function makeContext() {
  const config: AppConfig = { projects: [] };
  return {
    projectName: "test-project",
    guildHallHome,
    contextId: "commission-test",
    contextType: "commission" as const,
    workerName: "Edmund",
    eventBus: createEventBus(),
    config,
  };
}

describe("guild-hall-steward package", () => {
  describe("package discovery", () => {
    test("Steward is discovered with Edmund identity and Guild Steward title", async () => {
      const packages = await discoverPackages([PACKAGES_DIR]);
      const steward = packages.find((pkg) => pkg.name === "guild-hall-steward");

      expect(steward).toBeDefined();
      const metadata = steward!.metadata as WorkerMetadata;
      expect(metadata.identity.name).toBe("Edmund");
      expect(metadata.identity.displayTitle).toBe("Guild Steward");
    });

    test("discovery populates soul and posture from filesystem", async () => {
      const packages = await discoverPackages([PACKAGES_DIR]);
      const steward = packages.find((pkg) => pkg.name === "guild-hall-steward");

      expect(steward).toBeDefined();
      const metadata = steward!.metadata as WorkerMetadata;
      expect(metadata.soul).toBeDefined();
      expect(metadata.soul!.length).toBeGreaterThan(0);
      expect(metadata.posture).toBeDefined();
      expect(metadata.posture.length).toBeGreaterThan(0);
    });

    test("metadata validates against packageMetadataSchema", async () => {
      const raw = await fs.readFile(
        path.join(STEWARD_DIR, "package.json"),
        "utf-8",
      );
      const pkgJson = JSON.parse(raw) as { guildHall: unknown };

      const result = packageMetadataSchema.safeParse(pkgJson.guildHall);
      expect(result.success).toBe(true);
    });
  });

  describe("toolbox resolution", () => {
    test("guild-hall-email appears in resolved tool set", async () => {
      const packages = await discoverPackages([PACKAGES_DIR]);
      const steward = packages.find((pkg) => pkg.name === "guild-hall-steward");
      const worker = steward!.metadata as WorkerMetadata;

      const result = await resolveToolSet(
        worker,
        [makeEmailPackage()],
        makeContext(),
        createContextTypeRegistry(),
      );

      const serverNames = result.mcpServers.map((s) => s.name);
      expect(serverNames).toContain("guild-hall-email");
      expect(result.allowedTools).toContain("mcp__guild-hall-email__*");
    });

    test("missing email toolbox package throws", async () => {
      const packages = await discoverPackages([PACKAGES_DIR]);
      const steward = packages.find((pkg) => pkg.name === "guild-hall-steward");
      const worker = steward!.metadata as WorkerMetadata;

      expect(
        resolveToolSet(worker, [], makeContext(), createContextTypeRegistry()),
      ).rejects.toThrow(/guild-hall-email/);
    });

    test("advisory boundary: email toolbox exposes only read tools", async () => {
      const raw = await fs.readFile(
        path.join(EMAIL_DIR, "package.json"),
        "utf-8",
      );
      const pkgJson = JSON.parse(raw) as {
        guildHall: { description: string };
      };

      // The email toolbox description declares read-only access
      expect(pkgJson.guildHall.description).toMatch(/read-only/i);

      // Verify via the toolbox source: the four exported tool names
      // are all read operations (search, read, list, get).
      // No send, reply, forward, flag, move, delete, or mark tools.
      const emailIndex = await fs.readFile(
        path.join(EMAIL_DIR, "index.ts"),
        "utf-8",
      );
      const writeToolPatterns = [
        /send_email/,
        /reply_email/,
        /forward_email/,
        /flag_email/,
        /move_email/,
        /delete_email/,
        /mark_as_read/,
        /mark_as_unread/,
      ];
      for (const pattern of writeToolPatterns) {
        expect(emailIndex).not.toMatch(pattern);
      }

      // Confirm the four read-only tools are present
      expect(emailIndex).toContain("search_emails");
      expect(emailIndex).toContain("read_email");
      expect(emailIndex).toContain("list_mailboxes");
      expect(emailIndex).toContain("get_thread");
    });
  });

  describe("posture content verification", () => {
    let posture: string;

    beforeEach(async () => {
      posture = await fs.readFile(
        path.join(STEWARD_DIR, "posture.md"),
        "utf-8",
      );
    });

    test("workflow describes all five execution steps", () => {
      // Step 1: Read memory
      expect(posture).toMatch(/read memory/i);
      // Step 2: Execute the commissioned task
      expect(posture).toMatch(/execute the commissioned task/i);
      // Step 3: Check escalation criteria
      expect(posture).toMatch(/check escalation criteria/i);
      // Step 4: Update memory
      expect(posture).toMatch(/update memory/i);
      // Step 5: Submit result
      expect(posture).toMatch(/submit.result/i);
    });

    test("triage output structure has five sections", () => {
      expect(posture).toContain("Urgent");
      expect(posture).toContain("Action needed");
      expect(posture).toContain("FYI");
      expect(posture).toContain("Active threads");
      expect(posture).toContain("Quiet");
    });

    test("meeting prep output structure has three parts", () => {
      expect(posture).toContain("Context");
      expect(posture).toContain("Open items");
      expect(posture).toContain("Recommended reading");
    });

    test("email research output structure has five sections", () => {
      expect(posture).toContain("Summary");
      expect(posture).toContain("Timeline");
      expect(posture).toContain("Participants");
      expect(posture).toContain("Status");
      expect(posture).toContain("Open questions");
    });

    test("names all three memory files", () => {
      expect(posture).toContain("contacts.md");
      expect(posture).toContain("preferences.md");
      expect(posture).toContain("active-threads.md");
    });

    test("describes Guild Master escalation criteria", () => {
      expect(posture).toContain("commission result");
      expect(posture).toContain("Guild Master");

      // At least two of the three escalation signals
      const escalationSignals = [
        /deadline/i,
        /commission blocker/i,
        /high-priority contact/i,
      ];
      const matches = escalationSignals.filter((s) => s.test(posture));
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    test("posture does not describe web tool usage", () => {
      expect(posture).not.toMatch(/\bWebSearch\b/);
      expect(posture).not.toMatch(/\bWebFetch\b/);
    });
  });
});
