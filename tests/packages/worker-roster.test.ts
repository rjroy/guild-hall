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
];

const expectedRoleProfiles: Record<string, {
  identityName: string;
  descriptionIntent: RegExp;
  checkoutScope: "full" | "sparse";
  builtInTools: string[];
}> = {
  "guild-hall-developer": {
    identityName: "Developer",
    descriptionIntent: /implement/i,
    checkoutScope: "full",
    builtInTools: ["Read", "Glob", "Grep", "Write", "Edit", "Bash"],
  },
  "guild-hall-reviewer": {
    identityName: "Reviewer",
    descriptionIntent: /analyzes|findings|patch/i,
    checkoutScope: "full",
    builtInTools: ["Read", "Glob", "Grep"],
  },
  "guild-hall-researcher": {
    identityName: "Researcher",
    descriptionIntent: /investigates|evidence|synthesizes/i,
    checkoutScope: "sparse",
    builtInTools: ["Read", "Glob", "Grep", "WebSearch", "WebFetch"],
  },
  "guild-hall-writer": {
    identityName: "Writer",
    descriptionIntent: /documentation|verified|claims/i,
    checkoutScope: "full",
    builtInTools: ["Read", "Glob", "Grep", "Write", "Edit"],
  },
  "guild-hall-test-engineer": {
    identityName: "Test Engineer",
    descriptionIntent: /verification|reproduces|test results/i,
    checkoutScope: "full",
    builtInTools: ["Read", "Glob", "Grep", "Write", "Edit", "Bash"],
  },
};

const expectedPostureGuardrails: Record<string, RegExp[]> = {
  "guild-hall-reviewer": [
    /non-mutating mode/i,
    /never perform direct file edits/i,
    /findings first/i,
    /explicit patch text/i,
  ],
  "guild-hall-researcher": [
    /source-backed/i,
    /uncertainty and confidence explicitly/i,
    /\.lore artifact/i,
    /only when the request explicitly asks/i,
  ],
  "guild-hall-writer": [
    /verify technical statements against current repository code and config before asserting claims/i,
    /must be verified against repository sources before publication/i,
  ],
  "guild-hall-developer": [
    /execute verification steps/i,
    /run focused tests/i,
    /analyze failures/i,
    /failure analysis/i,
  ],
  "guild-hall-test-engineer": [
    /failure analysis/i,
    /reproduction steps, diagnosis, and impact/i,
    /executed verification steps/i,
  ],
};

function extractPostureSections(posture: string): string[] {
  return Array.from(
    posture.matchAll(/(?:^|\n\n)(Principles|Workflow|Quality Standards):/g),
  ).map((match) => match[1]);
}

describe("worker roster packages", () => {
  test("discoverPackages finds all five default roster workers", async () => {
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
      const packageJsonPath = path.join(PACKAGES_DIR, packageName, "package.json");
      const packageJson = await Bun.file(packageJsonPath).json() as {
        guildHall: WorkerMetadata;
      };

      const sections = extractPostureSections(packageJson.guildHall.posture);
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
      const packageJsonPath = path.join(PACKAGES_DIR, packageName, "package.json");
      const packageJson = await Bun.file(packageJsonPath).json() as {
        guildHall: WorkerMetadata;
      };

      const posture = packageJson.guildHall.posture;
      const expectedGuardrails = expectedPostureGuardrails[packageName];

      expect(expectedGuardrails).toBeDefined();
      for (const guardrailPattern of expectedGuardrails) {
        expect(posture).toMatch(guardrailPattern);
      }
    }
  });
});