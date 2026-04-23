import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { toolboxMetadataSchema } from "@/lib/packages";
import { resolveToolSet } from "@/apps/daemon/services/toolbox-resolver";
import { createContextTypeRegistry } from "@/apps/daemon/services/context-type-registry";
import { createEventBus } from "@/apps/daemon/lib/event-bus";
import type {
  WorkerMetadata,
  DiscoveredPackage,
  AppConfig,
} from "@/lib/types";

/**
 * The real package directory. The test validates that the resolver can
 * discover and load it, so we point at the actual source rather than
 * creating a temp fixture.
 */
const PACKAGE_DIR = path.resolve(__dirname, "../../../packages/guild-hall-email");

let tmpDir: string;
let guildHallHome: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-email-"));
  guildHallHome = path.join(tmpDir, ".guild-hall");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeWorker(overrides?: Partial<WorkerMetadata>): WorkerMetadata {
  return {
    type: "worker",
    identity: {
      name: "test-worker",
      description: "A test worker",
      displayTitle: "Test Worker",
    },
    posture: "You are a test worker.",
    domainToolboxes: [],
    builtInTools: ["Read", "Glob", "Grep"],
    checkoutScope: "sparse",
    ...overrides,
  };
}

function makeEmailPackage(): DiscoveredPackage {
  return {
    name: "guild-hall-email",
    path: PACKAGE_DIR,
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
    workerName: "test-worker",
    eventBus: createEventBus(),
    config,
  };
}

describe("guild-hall-email package", () => {
  test("package metadata validates against toolboxMetadataSchema", async () => {
    const raw = await fs.readFile(
      path.join(PACKAGE_DIR, "package.json"),
      "utf-8",
    );
    const pkgJson = JSON.parse(raw) as { guildHall: unknown };

    const result = toolboxMetadataSchema.safeParse(pkgJson.guildHall);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("guild-hall-email");
      expect(result.data.type).toBe("toolbox");
    }
  });
});

describe("toolbox resolver integration", () => {
  test("worker with domainToolboxes: ['guild-hall-email'] gets email server in mcpServers and allowedTools", async () => {
    const worker = makeWorker({ domainToolboxes: ["guild-hall-email"] });
    const packages = [makeEmailPackage()];

    const result = await resolveToolSet(worker, packages, makeContext(), createContextTypeRegistry());

    // base + commission (auto) + guild-hall-email (domain) = 3 servers
    expect(result.mcpServers).toHaveLength(3);
    expect(result.mcpServers[0].name).toBe("guild-hall-base");
    expect(result.mcpServers[1].name).toBe("guild-hall-commission");
    expect(result.mcpServers[2].name).toBe("guild-hall-email");
    expect(result.mcpServers[2].type).toBe("sdk");
    expect(result.mcpServers[2].instance).toBeDefined();

    expect(result.allowedTools).toContain("mcp__guild-hall-email__*");
  });

  test("worker with domainToolboxes: [] does not see email tools", async () => {
    const worker = makeWorker({ domainToolboxes: [] });
    const packages = [makeEmailPackage()];

    const result = await resolveToolSet(worker, packages, makeContext(), createContextTypeRegistry());

    // base + commission (auto) = 2 servers, no email
    expect(result.mcpServers).toHaveLength(2);
    const names = result.mcpServers.map((s) => s.name);
    expect(names).not.toContain("guild-hall-email");
    expect(result.allowedTools).not.toContain("mcp__guild-hall-email__*");
  });
});
