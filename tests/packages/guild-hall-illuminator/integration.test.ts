import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  discoverPackages,
  packageMetadataSchema,
} from "@/lib/packages";
import { resolveToolSet } from "@/daemon/services/toolbox-resolver";
import { createEventBus } from "@/daemon/lib/event-bus";
import type {
  WorkerMetadata,
  DiscoveredPackage,
  AppConfig,
} from "@/lib/types";

const PACKAGES_DIR = path.resolve(__dirname, "../../../packages");
const ILLUMINATOR_DIR = path.join(PACKAGES_DIR, "guild-hall-illuminator");
const REPLICATE_DIR = path.join(PACKAGES_DIR, "guild-hall-replicate");

let tmpDir: string;
let guildHallHome: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-illuminator-"));
  guildHallHome = path.join(tmpDir, ".guild-hall");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeReplicatePackage(): DiscoveredPackage {
  return {
    name: "guild-hall-replicate",
    path: REPLICATE_DIR,
    metadata: {
      type: "toolbox",
      name: "guild-hall-replicate",
      description: "Image generation, editing, and background removal via Replicate.",
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
    workerName: "Sienna",
    eventBus: createEventBus(),
    config,
  };
}

describe("guild-hall-illuminator package", () => {
  describe("package discovery", () => {
    test("Illuminator is discovered with Sienna identity and Guild Illuminator title", async () => {
      const packages = await discoverPackages([PACKAGES_DIR]);
      const illuminator = packages.find((pkg) => pkg.name === "guild-hall-illuminator");

      expect(illuminator).toBeDefined();
      const metadata = illuminator!.metadata as WorkerMetadata;
      expect(metadata.identity.name).toBe("Sienna");
      expect(metadata.identity.displayTitle).toBe("Guild Illuminator");
    });

    test("discovery populates soul and posture from filesystem", async () => {
      const packages = await discoverPackages([PACKAGES_DIR]);
      const illuminator = packages.find((pkg) => pkg.name === "guild-hall-illuminator");

      expect(illuminator).toBeDefined();
      const metadata = illuminator!.metadata as WorkerMetadata;
      expect(metadata.soul).toBeDefined();
      expect(metadata.soul!.length).toBeGreaterThan(0);
      expect(metadata.posture).toBeDefined();
      expect(metadata.posture.length).toBeGreaterThan(0);
    });

    test("metadata validates against packageMetadataSchema", async () => {
      const raw = await fs.readFile(
        path.join(ILLUMINATOR_DIR, "package.json"),
        "utf-8",
      );
      const pkgJson = JSON.parse(raw) as { guildHall: unknown };

      const result = packageMetadataSchema.safeParse(pkgJson.guildHall);
      expect(result.success).toBe(true);
    });

    test("model is sonnet", async () => {
      const packages = await discoverPackages([PACKAGES_DIR]);
      const illuminator = packages.find((pkg) => pkg.name === "guild-hall-illuminator");
      const metadata = illuminator!.metadata as WorkerMetadata;
      expect(metadata.model).toBe("sonnet");
    });

    test("checkoutScope is sparse", async () => {
      const raw = await fs.readFile(
        path.join(ILLUMINATOR_DIR, "package.json"),
        "utf-8",
      );
      const pkgJson = JSON.parse(raw) as { guildHall: { checkoutScope: string } };
      expect(pkgJson.guildHall.checkoutScope).toBe("sparse");
    });

    test("maxTurns is 120", async () => {
      const raw = await fs.readFile(
        path.join(ILLUMINATOR_DIR, "package.json"),
        "utf-8",
      );
      const pkgJson = JSON.parse(raw) as { guildHall: { resourceDefaults: { maxTurns: number } } };
      expect(pkgJson.guildHall.resourceDefaults.maxTurns).toBe(120);
    });
  });

  describe("toolbox resolution", () => {
    test("guild-hall-replicate appears in resolved tool set", async () => {
      const packages = await discoverPackages([PACKAGES_DIR]);
      const illuminator = packages.find((pkg) => pkg.name === "guild-hall-illuminator");
      const worker = illuminator!.metadata as WorkerMetadata;

      const result = await resolveToolSet(
        worker,
        [makeReplicatePackage()],
        makeContext(),
      );

      const serverNames = result.mcpServers.map((s) => s.name);
      expect(serverNames).toContain("guild-hall-replicate");
      expect(result.allowedTools).toContain("mcp__guild-hall-replicate__*");
    });

    test("missing replicate toolbox package throws", async () => {
      const packages = await discoverPackages([PACKAGES_DIR]);
      const illuminator = packages.find((pkg) => pkg.name === "guild-hall-illuminator");
      const worker = illuminator!.metadata as WorkerMetadata;

      expect(
        resolveToolSet(worker, [], makeContext()),
      ).rejects.toThrow(/guild-hall-replicate/);
    });
  });

  describe("built-in tools and canUseToolRules", () => {
    test("builtInTools includes Bash", async () => {
      const raw = await fs.readFile(
        path.join(ILLUMINATOR_DIR, "package.json"),
        "utf-8",
      );
      const pkgJson = JSON.parse(raw) as { guildHall: { builtInTools: string[] } };
      expect(pkgJson.guildHall.builtInTools).toContain("Bash");
    });

    test("builtInTools includes file tools but not WebSearch, WebFetch, Skill, or Task", async () => {
      const raw = await fs.readFile(
        path.join(ILLUMINATOR_DIR, "package.json"),
        "utf-8",
      );
      const pkgJson = JSON.parse(raw) as { guildHall: { builtInTools: string[] } };
      const tools = pkgJson.guildHall.builtInTools;

      expect(tools).toContain("Read");
      expect(tools).toContain("Glob");
      expect(tools).toContain("Grep");
      expect(tools).toContain("Write");
      expect(tools).toContain("Edit");

      expect(tools).not.toContain("WebSearch");
      expect(tools).not.toContain("WebFetch");
      expect(tools).not.toContain("Skill");
      expect(tools).not.toContain("Task");
    });

    test("canUseToolRules has allowlist-then-deny pattern for Bash", async () => {
      const raw = await fs.readFile(
        path.join(ILLUMINATOR_DIR, "package.json"),
        "utf-8",
      );
      const pkgJson = JSON.parse(raw) as {
        guildHall: {
          canUseToolRules: Array<{
            tool: string;
            commands?: string[];
            allow: boolean;
            reason?: string;
          }>;
        };
      };
      const rules = pkgJson.guildHall.canUseToolRules;

      expect(rules).toHaveLength(2);

      // First rule: allowlist for file operations within .lore/
      const allowRule = rules[0];
      expect(allowRule.tool).toBe("Bash");
      expect(allowRule.allow).toBe(true);
      expect(allowRule.commands).toBeDefined();
      expect(allowRule.commands).toContain("mv .lore/**");
      expect(allowRule.commands).toContain("cp .lore/**");
      expect(allowRule.commands).toContain("rm .lore/**");
      expect(allowRule.commands).toContain("rm -f .lore/**");
      expect(allowRule.commands).toContain("mkdir .lore/**");
      expect(allowRule.commands).toContain("mkdir -p .lore/**");
      expect(allowRule.commands).toContain("ls .lore/**");

      // Second rule: catch-all deny
      const denyRule = rules[1];
      expect(denyRule.tool).toBe("Bash");
      expect(denyRule.allow).toBe(false);
      expect(denyRule.reason).toBeDefined();
      expect(denyRule.reason).toMatch(/\.lore/);
    });

    test("canUseToolRules does not allow recursive deletion", async () => {
      const raw = await fs.readFile(
        path.join(ILLUMINATOR_DIR, "package.json"),
        "utf-8",
      );
      const pkgJson = JSON.parse(raw) as {
        guildHall: {
          canUseToolRules: Array<{
            commands?: string[];
          }>;
        };
      };
      const allowedCommands = pkgJson.guildHall.canUseToolRules[0].commands!;

      // No -r, -rf, or -ri flags
      for (const cmd of allowedCommands) {
        expect(cmd).not.toMatch(/rm\s+-r/);
      }
    });
  });

  describe("soul content verification", () => {
    let soul: string;

    beforeEach(async () => {
      soul = await fs.readFile(
        path.join(ILLUMINATOR_DIR, "soul.md"),
        "utf-8",
      );
    });

    test("contains Character, Voice, and Vibe sections", () => {
      expect(soul).toContain("## Character");
      expect(soul).toContain("## Voice");
      expect(soul).toContain("## Vibe");
    });

    test("Voice section has anti-examples and calibration pairs", () => {
      expect(soul).toContain("### Anti-examples");
      expect(soul).toContain("### Calibration pairs");
    });

    test("character conveys reading before generating", () => {
      expect(soul).toMatch(/read before/i);
    });

    test("character conveys iteration on drafts", () => {
      expect(soul).toMatch(/first draft/i);
    });

    test("character conveys articulating creative decisions", () => {
      expect(soul).toMatch(/creative decision/i);
    });

    test("character conveys cost awareness as craft", () => {
      expect(soul).toMatch(/cheap model/i);
    });
  });

  describe("posture content verification", () => {
    let posture: string;

    beforeEach(async () => {
      posture = await fs.readFile(
        path.join(ILLUMINATOR_DIR, "posture.md"),
        "utf-8",
      );
    });

    test("contains Principles, Workflow, and Quality Standards sections", () => {
      expect(posture).toContain("## Principles");
      expect(posture).toContain("## Workflow");
      expect(posture).toContain("## Quality Standards");
    });

    test("principles cover read-before-generating", () => {
      expect(posture).toMatch(/read before generating/i);
    });

    test("principles cover never modify source code", () => {
      expect(posture).toMatch(/never modify source code/i);
    });

    test("principles cover articulating creative decisions", () => {
      expect(posture).toMatch(/articulate creative decisions/i);
    });

    test("principles cover cost awareness", () => {
      expect(posture).toMatch(/cost.aware/i);
    });

    test("principles cover iterating on drafts", () => {
      expect(posture).toMatch(/iterate on drafts/i);
    });

    test("principles cover visual consistency", () => {
      expect(posture).toMatch(/visual consistency/i);
    });

    test("workflow describes memory sections", () => {
      expect(posture).toContain("Style Preferences");
      expect(posture).toContain("Generation Notes");
    });

    test("workflow describes creative brief writing", () => {
      expect(posture).toMatch(/creative brief/i);
    });

    test("workflow describes submit_result", () => {
      expect(posture).toMatch(/submit.result/i);
    });

    test("quality standards require model selection justification", () => {
      expect(posture).toMatch(/model selection is justified/i);
    });

    test("quality standards require cost estimates", () => {
      expect(posture).toMatch(/cost estimate/i);
    });

    test("posture does not contain personality content", () => {
      // No first-person character descriptions or vibe language
      expect(posture).not.toContain("## Character");
      expect(posture).not.toContain("## Voice");
      expect(posture).not.toContain("## Vibe");
    });
  });

  describe("activation", () => {
    test("activate function delegates to activateWorkerWithSharedPattern", async () => {
      const indexSource = await fs.readFile(
        path.join(ILLUMINATOR_DIR, "index.ts"),
        "utf-8",
      );
      expect(indexSource).toContain("activateWorkerWithSharedPattern");
      expect(indexSource).toMatch(/export function activate/);
    });
  });
});
