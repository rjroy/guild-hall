import { describe, test, expect } from "bun:test";
import * as path from "node:path";
import { discoverPackages, packageMetadataSchema } from "@/lib/packages";
import type { WorkerMetadata } from "@/lib/types";

const PACKAGES_DIR = path.resolve(__dirname, "../../packages");

const expectedRosterPackageNames = [
  "guild-hall-developer",
  "guild-hall-reviewer",
  "guild-hall-researcher",
  "guild-hall-writer",
  "guild-hall-test-engineer",
  "guild-hall-steward",
];

const expectedRoleProfiles: Record<string, {
  identityName: string;
  descriptionIntent: RegExp;
  checkoutScope: "full" | "sparse";
  builtInTools: string[];
}> = {
  "guild-hall-developer": {
    identityName: "Dalton",
    descriptionIntent: /craftsman|builds|commissioned/i,
    checkoutScope: "full",
    builtInTools: ["Skill", "Task", "Read", "Glob", "Grep", "Write", "Edit", "Bash"],
  },
  "guild-hall-reviewer": {
    identityName: "Thorne",
    descriptionIntent: /critical eye|inspects|alters nothing/i,
    checkoutScope: "full",
    builtInTools: ["Skill", "Task", "Read", "Glob", "Grep"],
  },
  "guild-hall-researcher": {
    identityName: "Verity",
    descriptionIntent: /beyond the guild walls|intelligence|never touches the forge/i,
    checkoutScope: "sparse",
    builtInTools: ["Skill", "Task", "Read", "Glob", "Grep", "WebSearch", "WebFetch", "Write", "Edit"],
  },
  "guild-hall-writer": {
    identityName: "Octavia",
    descriptionIntent: /living record|documents|lore/i,
    checkoutScope: "full",
    builtInTools: ["Skill", "Task", "Read", "Glob", "Grep", "Write", "Edit"],
  },
  "guild-hall-test-engineer": {
    identityName: "Sable",
    descriptionIntent: /probes|seams|repairs what breaks/i,
    checkoutScope: "full",
    builtInTools: ["Skill", "Task", "Read", "Glob", "Grep", "Write", "Edit", "Bash"],
  },
  "guild-hall-steward": {
    identityName: "Edmund",
    descriptionIntent: /inbox|correspondence|household/i,
    checkoutScope: "sparse",
    builtInTools: ["Skill", "Task", "Read", "Glob", "Grep", "Write", "Edit"],
  },
};

const expectedPostureGuardrails: Record<string, RegExp[]> = {
  "guild-hall-reviewer": [
    /read-only/i,
    /never modify/i,
    /priority order/i,
    /evidence for every finding/i,
  ],
  "guild-hall-researcher": [
    /investigation-first and source-grounded/i,
    /confidence levels/i,
    /every claim needs a source/i,
    /check.*\.lore\/research/i,
  ],
  "guild-hall-writer": [
    /never modify source code/i,
    /must be verified against repository sources/i,
    /stay in the current phase/i,
  ],
  "guild-hall-developer": [
    /follow the plan/i,
    /write tests alongside/i,
    /run the full test suite/i,
  ],
  "guild-hall-test-engineer": [
    /read the code under test/i,
    /repeatable on a clean checkout/i,
    /never use `mock\.module\(\)`/i,
  ],
  "guild-hall-steward": [
    /read before summarizing/i,
    /advisory boundary/i,
    /contacts\.md|preferences\.md|active-threads\.md/i,
    /submit_result/i,
  ],
};

function extractPostureSections(posture: string): string[] {
  return Array.from(
    posture.matchAll(/^## (Principles|Workflow|Quality Standards)$/gm),
  ).map((match) => match[1]);
}

describe("worker roster packages", () => {
  test("discoverPackages finds all six default roster workers", async () => {
    const packages = await discoverPackages([PACKAGES_DIR]);
    const discoveredNames = new Set(packages.map((pkg) => pkg.name));

    for (const expectedName of expectedRosterPackageNames) {
      expect(discoveredNames.has(expectedName)).toBe(true);
    }
  });

  test("default roster identity names are unique", async () => {
    const packages = await discoverPackages([PACKAGES_DIR]);
    const rosterPackages = packages.filter((pkg) =>
      expectedRosterPackageNames.includes(pkg.name),
    );

    const identityNames = rosterPackages.map(
      (pkg) => (pkg.metadata as WorkerMetadata).identity.name,
    );

    expect(new Set(identityNames).size).toBe(identityNames.length);
  });

  test("each roster package guildHall metadata validates", async () => {
    for (const packageName of expectedRosterPackageNames) {
      const packageJsonPath = path.join(PACKAGES_DIR, packageName, "package.json");
      const packageJson = await Bun.file(packageJsonPath).json() as {
        guildHall: unknown;
      };
      const result = packageMetadataSchema.safeParse(packageJson.guildHall);
      expect(result.success).toBe(true);
    }
  });

  test("each roster package defines an unambiguous role profile for routing", async () => {
    for (const packageName of expectedRosterPackageNames) {
      const packageJsonPath = path.join(PACKAGES_DIR, packageName, "package.json");
      const packageJson = await Bun.file(packageJsonPath).json() as {
        guildHall: WorkerMetadata;
      };

      const metadata = packageJson.guildHall;
      const expected = expectedRoleProfiles[packageName];

      expect(metadata.identity.name).toBe(expected.identityName);
      expect(metadata.identity.description).toMatch(expected.descriptionIntent);
      expect(metadata.checkoutScope).toBe(expected.checkoutScope);
      expect(metadata.builtInTools).toEqual(expected.builtInTools);
    }
  });

  test("each roster posture has exactly three explicit sections", async () => {
    for (const packageName of expectedRosterPackageNames) {
      const postureFilePath = path.join(PACKAGES_DIR, packageName, "posture.md");
      const posture = await Bun.file(postureFilePath).text();

      const sections = extractPostureSections(posture.trim());
      expect(sections).toEqual([
        "Principles",
        "Workflow",
        "Quality Standards",
      ]);
      expect(sections).toHaveLength(3);
    }
  });

  test("each role posture encodes Phase 3 guardrails", async () => {
    for (const packageName of expectedRosterPackageNames) {
      const postureFilePath = path.join(PACKAGES_DIR, packageName, "posture.md");
      const posture = (await Bun.file(postureFilePath).text()).trim();
      const expectedGuardrails = expectedPostureGuardrails[packageName];

      expect(expectedGuardrails).toBeDefined();
      for (const guardrailPattern of expectedGuardrails) {
        expect(posture).toMatch(guardrailPattern);
      }
    }
  });

  test("each roster package has a soul.md file", async () => {
    for (const packageName of expectedRosterPackageNames) {
      const soulFilePath = path.join(PACKAGES_DIR, packageName, "soul.md");
      const file = Bun.file(soulFilePath);
      expect(await file.exists()).toBe(true);
    }
  });

  test("each roster soul.md has three sections (Character, Voice, Vibe)", async () => {
    for (const packageName of expectedRosterPackageNames) {
      const soulFilePath = path.join(PACKAGES_DIR, packageName, "soul.md");
      const soul = await Bun.file(soulFilePath).text();

      expect(soul).toContain("## Character");
      expect(soul).toContain("## Voice");
      expect(soul).toContain("## Vibe");
    }
  });

  test("soul files are under 80 lines", async () => {
    for (const packageName of expectedRosterPackageNames) {
      const soulFilePath = path.join(PACKAGES_DIR, packageName, "soul.md");
      const soul = await Bun.file(soulFilePath).text();
      const lineCount = soul.split("\n").length;
      expect(lineCount).toBeLessThan(80);
    }
  });

  test("soul files contain no operational content", async () => {
    for (const packageName of expectedRosterPackageNames) {
      const soulFilePath = path.join(PACKAGES_DIR, packageName, "soul.md");
      const soul = await Bun.file(soulFilePath).text();

      // These are posture section headers that should not appear in soul files
      expect(soul).not.toContain("Principles:");
      expect(soul).not.toContain("Workflow:");
      expect(soul).not.toContain("Quality Standards:");
    }
  });

  test("posture files contain no personality content", async () => {
    for (const packageName of expectedRosterPackageNames) {
      const postureFilePath = path.join(PACKAGES_DIR, packageName, "posture.md");
      const posture = await Bun.file(postureFilePath).text();

      // No Vibe line should remain in posture
      expect(posture).not.toMatch(/^Vibe:/m);
      // No soul section headers should appear in posture
      expect(posture).not.toContain("## Character");
      expect(posture).not.toContain("## Voice");
      expect(posture).not.toContain("## Vibe");
    }
  });

  test("discovery populates soul field for all roster workers", async () => {
    const packages = await discoverPackages([PACKAGES_DIR]);
    const rosterPackages = packages.filter((pkg) =>
      expectedRosterPackageNames.includes(pkg.name),
    );

    for (const pkg of rosterPackages) {
      const meta = pkg.metadata as WorkerMetadata;
      expect(meta.soul).toBeDefined();
      expect(typeof meta.soul).toBe("string");
      expect(meta.soul!.length).toBeGreaterThan(0);
    }
  });
});