import { describe, expect, test } from "bun:test";
import * as path from "node:path";

type RoleLabel = "developer" | "reviewer" | "researcher" | "writer" | "test-engineer";

interface IntentFixture {
  name: string;
  kind: "representative" | "adversarial";
  intent: string;
  expectedRole: RoleLabel;
}

const PACKAGE_DIR = path.resolve(__dirname, "../../packages");
const FIXTURE_PATH = path.resolve(__dirname, "fixtures/worker-routing-intents.json");
const CONFUSION_MATRIX_ARTIFACT_PATH = path.resolve(
  __dirname,
  "fixtures/worker-routing-confusion-matrix.md",
);

const roleOrder: RoleLabel[] = [
  "developer",
  "reviewer",
  "researcher",
  "writer",
  "test-engineer",
];

const rolePackageMap: Record<RoleLabel, string> = {
  developer: "guild-hall-developer",
  reviewer: "guild-hall-reviewer",
  researcher: "guild-hall-researcher",
  writer: "guild-hall-writer",
  "test-engineer": "guild-hall-test-engineer",
};

const routingSignals: Record<RoleLabel, Array<{ pattern: RegExp; weight: number }>> = {
  developer: [
    { pattern: /\bimplement|implementation|build|ship|fix|refactor\b/i, weight: 3 },
    { pattern: /\bcode|coding|feature|scope\b/i, weight: 2 },
  ],
  reviewer: [
    { pattern: /\breview|analy[sz]e|audit|findings|defect|risk\b/i, weight: 3 },
    { pattern: /\bcorrectness|coverage|patch\b/i, weight: 2 },
  ],
  researcher: [
    { pattern: /\bresearch|investigate|compare|tradeoff|evidence\b/i, weight: 4 },
    { pattern: /\bunknowns?|options?|synthesi[sz]e\b/i, weight: 2 },
  ],
  writer: [
    { pattern: /\bdocument|documentation|write|guide|readme\b/i, weight: 3 },
    { pattern: /\bclarity|claims?|publish\b/i, weight: 2 },
  ],
  "test-engineer": [
    { pattern: /\btest|verify|verification|regression|reproduce\b/i, weight: 3 },
    { pattern: /\bpass\/fail|failure|ci\b/i, weight: 2 },
  ],
};

function scoreIntentForRole(intent: string, role: RoleLabel): number {
  return routingSignals[role].reduce((score, signal) => {
    return score + (signal.pattern.test(intent) ? signal.weight : 0);
  }, 0);
}

function routeIntent(intent: string): RoleLabel {
  let bestRole: RoleLabel = roleOrder[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const role of roleOrder) {
    const score = scoreIntentForRole(intent, role);
    if (score > bestScore) {
      bestScore = score;
      bestRole = role;
    }
  }

  return bestRole;
}

function buildConfusionMatrix(fixtures: IntentFixture[]): Map<RoleLabel, Map<RoleLabel, number>> {
  const matrix = new Map<RoleLabel, Map<RoleLabel, number>>();

  for (const expected of roleOrder) {
    const row = new Map<RoleLabel, number>();
    for (const predicted of roleOrder) {
      row.set(predicted, 0);
    }
    matrix.set(expected, row);
  }

  for (const fixture of fixtures) {
    const predictedRole = routeIntent(fixture.intent);
    const row = matrix.get(fixture.expectedRole);
    if (!row) {
      throw new Error(`Missing confusion row for ${fixture.expectedRole}`);
    }
    row.set(predictedRole, (row.get(predictedRole) ?? 0) + 1);
  }

  return matrix;
}

function renderConfusionMatrix(matrix: Map<RoleLabel, Map<RoleLabel, number>>): string {
  const lines: string[] = [
    "# Worker Routing Confusion Matrix",
    "",
    "Source: fixture expectations and deterministic local routing rubric (no model output).",
    "",
    `| expected \\ predicted | ${roleOrder.join(" | ")} |`,
    `| --- | ${roleOrder.map(() => "---").join(" | ")} |`,
  ];

  for (const expectedRole of roleOrder) {
    const row = matrix.get(expectedRole);
    if (!row) {
      throw new Error(`Missing matrix row for ${expectedRole}`);
    }

    lines.push(
      `| ${expectedRole} | ${roleOrder
        .map((predictedRole) => String(row.get(predictedRole) ?? 0))
        .join(" | ")} |`,
    );
  }

  return `${lines.join("\n")}\n`;
}

async function readWorkerDescription(role: RoleLabel): Promise<string> {
  const packageName = rolePackageMap[role];
  const packageJsonPath = path.join(PACKAGE_DIR, packageName, "package.json");
  const packageJson = await Bun.file(packageJsonPath).json() as {
    guildHall: { identity: { description: string } };
  };
  return packageJson.guildHall.identity.description;
}

describe("worker routing deterministic validation", () => {
  test("description-quality rubric: role descriptions include clear routing anchors", async () => {
    const expectedAnchors: Record<RoleLabel, RegExp[]> = {
      developer: [/\bcraftsman\b/i, /\bbuilds\b/i, /\bcommissioned\b/i],
      reviewer: [/\bcritical eye\b/i, /\binspects\b/i, /\balters nothing\b/i],
      researcher: [/\bbeyond the guild walls\b/i, /\bintelligence\b/i, /\bforge\b/i],
      writer: [/\bliving record\b/i, /\bdocuments\b/i, /\blore\b/i],
      "test-engineer": [/\bprobes\b/i, /\bseams\b/i, /\brepairs\b/i],
    };

    for (const role of roleOrder) {
      const description = await readWorkerDescription(role);
      for (const anchor of expectedAnchors[role]) {
        expect(description).toMatch(anchor);
      }
    }
  });

  test("fixture-based intents route to expected role labels for representative and adversarial cases", async () => {
    const fixtures = await Bun.file(FIXTURE_PATH).json() as IntentFixture[];

    for (const fixture of fixtures) {
      const predictedRole = routeIntent(fixture.intent);
      expect(predictedRole).toBe(fixture.expectedRole);
    }
  });

  test("confusion-matrix artifact is generated from fixture expectations and deterministic routing", async () => {
    const fixtures = await Bun.file(FIXTURE_PATH).json() as IntentFixture[];
    const matrix = buildConfusionMatrix(fixtures);
    const rendered = renderConfusionMatrix(matrix);
    const expectedArtifact = await Bun.file(CONFUSION_MATRIX_ARTIFACT_PATH).text();

    expect(rendered).toBe(expectedArtifact);
  });
});