import { describe, expect, test } from "bun:test";
import * as path from "node:path";
import type { ActivationContext, ResolvedToolSet } from "@/lib/types";
import { activate as activateDeveloper } from "@/packages/guild-hall-developer";
import { activate as activateReviewer } from "@/packages/guild-hall-reviewer";
import { activate as activateResearcher } from "@/packages/guild-hall-researcher";
import { activate as activateWriter } from "@/packages/guild-hall-writer";
import { activate as activateTestEngineer } from "@/packages/guild-hall-test-engineer";

type RoleLabel = "developer" | "reviewer" | "researcher" | "writer" | "test-engineer";

const PACKAGES_DIR = path.resolve(__dirname, "../../packages");

function makeResolvedTools(): ResolvedToolSet {
  return {
    mcpServers: [],
    allowedTools: ["Read", "Glob", "Grep"],
  };
}

function makeActivationContext(posture: string, soul?: string): ActivationContext {
  return {
    identity: { name: "Test Worker", description: "Test", displayTitle: "Test Worker" },
    posture,
    soul,
    injectedMemory: "",
    resolvedTools: makeResolvedTools(),
    resourceDefaults: { maxTurns: 30 },
    projectPath: "/projects/test",
    workingDirectory: "/projects/test",
  };
}

async function readWorkerMetadata(packageName: string): Promise<{
  posture: string;
  soul?: string;
  builtInTools: string[];
}> {
  const pkgDir = path.join(PACKAGES_DIR, packageName);
  const packageJsonPath = path.join(pkgDir, "package.json");
  const packageJson = await Bun.file(packageJsonPath).json() as {
    guildHall: {
      builtInTools: string[];
    };
  };

  const postureFilePath = path.join(pkgDir, "posture.md");
  const posture = await Bun.file(postureFilePath).text();

  let soul: string | undefined;
  try {
    const soulFilePath = path.join(pkgDir, "soul.md");
    soul = (await Bun.file(soulFilePath).text()).trim();
  } catch {
    // No soul.md
  }

  return {
    posture: posture.trim(),
    soul,
    builtInTools: packageJson.guildHall.builtInTools,
  };
}

describe("worker role smoke tests", () => {
  test("developer posture is present in activation output", async () => {
    const metadata = await readWorkerMetadata("guild-hall-developer");
    const result = activateDeveloper(makeActivationContext(metadata.posture, metadata.soul));

    expect(result.systemPrompt).toContain("implementation-first and outcome-focused");
  });

  test("reviewer posture enforces non-mutation behavior", async () => {
    const metadata = await readWorkerMetadata("guild-hall-reviewer");
    const result = activateReviewer(makeActivationContext(metadata.posture, metadata.soul));

    expect(result.systemPrompt).toContain("read-only");
    expect(result.systemPrompt).toContain("never modify");
    expect(metadata.builtInTools).not.toContain("Write");
    expect(metadata.builtInTools).not.toContain("Edit");
    expect(metadata.builtInTools).not.toContain("Bash");
  });

  test("researcher posture is present in activation output", async () => {
    const metadata = await readWorkerMetadata("guild-hall-researcher");
    const result = activateResearcher(makeActivationContext(metadata.posture, metadata.soul));

    expect(result.systemPrompt).toContain("investigation-first and source-grounded");
  });

  test("writer posture is present in activation output", async () => {
    const metadata = await readWorkerMetadata("guild-hall-writer");
    const result = activateWriter(makeActivationContext(metadata.posture, metadata.soul));

    expect(result.systemPrompt).toContain("documentation-first and reader-oriented");
  });

  test("test engineer posture is present in activation output", async () => {
    const metadata = await readWorkerMetadata("guild-hall-test-engineer");
    const result = activateTestEngineer(makeActivationContext(metadata.posture, metadata.soul));

    expect(result.systemPrompt).toContain("verification-first and evidence-based");
  });

  test("activation pass-through keeps resolved tool list unchanged", async () => {
    const metadataByRole: Record<RoleLabel, string> = {
      developer: "guild-hall-developer",
      reviewer: "guild-hall-reviewer",
      researcher: "guild-hall-researcher",
      writer: "guild-hall-writer",
      "test-engineer": "guild-hall-test-engineer",
    };

    const activators: Record<RoleLabel, (context: ActivationContext) => ReturnType<typeof activateDeveloper>> = {
      developer: activateDeveloper,
      reviewer: activateReviewer,
      researcher: activateResearcher,
      writer: activateWriter,
      "test-engineer": activateTestEngineer,
    };

    for (const role of Object.keys(metadataByRole) as RoleLabel[]) {
      const metadata = await readWorkerMetadata(metadataByRole[role]);
      const context = makeActivationContext(metadata.posture, metadata.soul);
      const result = activators[role](context);

      expect(result.tools.allowedTools).toEqual(context.resolvedTools.allowedTools);
      expect(result.tools.mcpServers).toEqual(context.resolvedTools.mcpServers);
    }
  });

  test("soul content appears in activation output for each worker", async () => {
    const roles: Record<RoleLabel, string> = {
      developer: "guild-hall-developer",
      reviewer: "guild-hall-reviewer",
      researcher: "guild-hall-researcher",
      writer: "guild-hall-writer",
      "test-engineer": "guild-hall-test-engineer",
    };

    const activators: Record<RoleLabel, (context: ActivationContext) => ReturnType<typeof activateDeveloper>> = {
      developer: activateDeveloper,
      reviewer: activateReviewer,
      researcher: activateResearcher,
      writer: activateWriter,
      "test-engineer": activateTestEngineer,
    };

    for (const role of Object.keys(roles) as RoleLabel[]) {
      const metadata = await readWorkerMetadata(roles[role]);
      expect(metadata.soul).toBeDefined();

      const context = makeActivationContext(metadata.posture, metadata.soul);
      const result = activators[role](context);

      // Soul content should appear in the system prompt
      expect(result.systemPrompt).toContain("## Character");
      expect(result.systemPrompt).toContain("## Vibe");
    }
  });

  test("graceful degradation: worker without soul activates with identity before posture", () => {
    const context = makeActivationContext("POSTURE_CONTENT", undefined);
    const result = activateDeveloper(context);

    // No soul in the prompt
    expect(result.systemPrompt).not.toContain("## Character");

    // Identity appears before posture
    const identityIdx = result.systemPrompt.indexOf("Your name is:");
    const postureIdx = result.systemPrompt.indexOf("POSTURE_CONTENT");

    expect(identityIdx).toBeGreaterThanOrEqual(0);
    expect(postureIdx).toBeGreaterThan(identityIdx);
  });
});
