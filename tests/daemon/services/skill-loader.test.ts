import { describe, expect, test } from "bun:test";
import { loadPackageSkills } from "@/daemon/services/skill-loader";
import type { ImportModule } from "@/daemon/services/skill-loader";
import type { DiscoveredPackage } from "@/lib/types";
import type {
  PackageSkill,
  SkillFactoryDeps,
  SkillFactoryOutput,
} from "@/daemon/services/skill-types";

// -- Helpers --

function makeDeps(overrides?: Partial<SkillFactoryDeps>): SkillFactoryDeps {
  return {
    config: {
      projects: [],
    } as SkillFactoryDeps["config"],
    guildHallHome: "/tmp/gh",
    emitEvent: () => {},
    ...overrides,
  };
}

function makePackage(
  name: string,
  pkgPath = `/tmp/packages/${name}`,
): DiscoveredPackage {
  return {
    name,
    path: pkgPath,
    metadata: {
      type: "toolbox",
      name,
      description: `Test package ${name}`,
    },
  };
}

function makeSkillDefinition(overrides?: Record<string, unknown>) {
  return {
    skillId: "test.skill",
    version: "1",
    name: "test-skill",
    description: "A test skill",
    invocation: { method: "POST" as const, path: "/test/skill" },
    sideEffects: "",
    context: {},
    idempotent: false,
    hierarchy: { root: "test", feature: "skill" },
    ...overrides,
  };
}

function makeValidSkill(overrides?: Partial<PackageSkill>): PackageSkill {
  return {
    definition: makeSkillDefinition(),
    handler: () => Promise.resolve({ data: "ok" }),
    ...overrides,
  };
}

function makeImporter(
  modules: Record<string, Record<string, unknown>>,
): ImportModule {
  return (modulePath: string) => {
    const mod = modules[modulePath];
    if (!mod) return Promise.reject(new Error(`Module not found: ${modulePath}`));
    return Promise.resolve(mod);
  };
}

function silentLogger() {
  const warnings: string[] = [];
  return {
    logger: { warn: (msg: string) => warnings.push(msg) },
    warnings,
  };
}

// -- Tests --

describe("loadPackageSkills", () => {
  test("loads skills from a package exporting skillFactory", async () => {
    const pkg = makePackage("my-skills");
    const skill = makeValidSkill();
    const { logger } = silentLogger();

    const importer = makeImporter({
      [`${pkg.path}/index.ts`]: {
        skillFactory: () => ({ skills: [skill] }) satisfies SkillFactoryOutput,
      },
    });

    const result = await loadPackageSkills([pkg], makeDeps(), logger, importer);
    expect(result).toHaveLength(1);
    expect(result[0].definition.sourcePackage).toBe("my-skills");
    expect(result[0].handler).toBe(skill.handler);
  });

  test("returns empty array when package has no skillFactory export", async () => {
    const pkg = makePackage("no-skills");
    const { logger } = silentLogger();

    const importer = makeImporter({
      [`${pkg.path}/index.ts`]: { toolboxFactory: () => ({}) },
    });

    const result = await loadPackageSkills([pkg], makeDeps(), logger, importer);
    expect(result).toEqual([]);
  });

  test("logs warning and skips package when factory throws", async () => {
    const pkg = makePackage("broken-factory");
    const { logger, warnings } = silentLogger();

    const importer = makeImporter({
      [`${pkg.path}/index.ts`]: {
        skillFactory: () => {
          throw new Error("factory boom");
        },
      },
    });

    const result = await loadPackageSkills([pkg], makeDeps(), logger, importer);
    expect(result).toEqual([]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("skillFactory threw");
    expect(warnings[0]).toContain("broken-factory");
  });

  test("logs warning and skips package when import fails", async () => {
    const pkg = makePackage("bad-import");
    const { logger, warnings } = silentLogger();

    const importer: ImportModule = () => {
      return Promise.reject(new Error("cannot import"));
    };

    const result = await loadPackageSkills([pkg], makeDeps(), logger, importer);
    expect(result).toEqual([]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("Failed to import");
    expect(warnings[0]).toContain("bad-import");
  });

  test("rejects skill with no handler present", async () => {
    const pkg = makePackage("no-handler");
    const { logger, warnings } = silentLogger();

    const skill: PackageSkill = {
      definition: makeSkillDefinition(),
      // no handler, no streamHandler
    };

    const importer = makeImporter({
      [`${pkg.path}/index.ts`]: {
        skillFactory: () => ({ skills: [skill] }),
      },
    });

    const result = await loadPackageSkills([pkg], makeDeps(), logger, importer);
    expect(result).toEqual([]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("must provide either handler or streamHandler");
  });

  test("rejects skill with both handler and streamHandler", async () => {
    const pkg = makePackage("both-handlers");
    const { logger, warnings } = silentLogger();

    const skill: PackageSkill = {
      definition: makeSkillDefinition({
        streaming: { eventTypes: ["progress"] },
      }),
      handler: () => Promise.resolve({ data: "ok" }),
      streamHandler: () => Promise.resolve(),
    };

    const importer = makeImporter({
      [`${pkg.path}/index.ts`]: {
        skillFactory: () => ({ skills: [skill] }),
      },
    });

    const result = await loadPackageSkills([pkg], makeDeps(), logger, importer);
    expect(result).toEqual([]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("exactly one of handler or streamHandler");
  });

  test("rejects streamHandler without streaming.eventTypes", async () => {
    const pkg = makePackage("no-event-types");
    const { logger, warnings } = silentLogger();

    const skill: PackageSkill = {
      definition: makeSkillDefinition(),
      streamHandler: () => Promise.resolve(),
    };

    const importer = makeImporter({
      [`${pkg.path}/index.ts`]: {
        skillFactory: () => ({ skills: [skill] }),
      },
    });

    const result = await loadPackageSkills([pkg], makeDeps(), logger, importer);
    expect(result).toEqual([]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("streamHandler requires definition.streaming.eventTypes");
  });

  test("rejects handler with streaming defined", async () => {
    const pkg = makePackage("handler-with-streaming");
    const { logger, warnings } = silentLogger();

    const skill: PackageSkill = {
      definition: makeSkillDefinition({
        streaming: { eventTypes: ["progress"] },
      }),
      handler: () => Promise.resolve({ data: "ok" }),
    };

    const importer = makeImporter({
      [`${pkg.path}/index.ts`]: {
        skillFactory: () => ({ skills: [skill] }),
      },
    });

    const result = await loadPackageSkills([pkg], makeDeps(), logger, importer);
    expect(result).toEqual([]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("non-streaming handler must not have definition.streaming");
  });

  test("rejects skill with scheduleId context", async () => {
    const pkg = makePackage("schedule-context");
    const { logger, warnings } = silentLogger();

    const skill = makeValidSkill({
      definition: makeSkillDefinition({
        context: { scheduleId: true },
      }),
    });

    const importer = makeImporter({
      [`${pkg.path}/index.ts`]: {
        skillFactory: () => ({ skills: [skill] }),
      },
    });

    const result = await loadPackageSkills([pkg], makeDeps(), logger, importer);
    expect(result).toEqual([]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("scheduleId context is not supported");
  });

  test("stamps sourcePackage from package name, overriding existing value", async () => {
    const pkg = makePackage("real-package-name");
    const { logger } = silentLogger();

    const skill = makeValidSkill({
      definition: makeSkillDefinition({ sourcePackage: "wrong-name" }),
    });

    const importer = makeImporter({
      [`${pkg.path}/index.ts`]: {
        skillFactory: () => ({ skills: [skill] }),
      },
    });

    const result = await loadPackageSkills([pkg], makeDeps(), logger, importer);
    expect(result).toHaveLength(1);
    expect(result[0].definition.sourcePackage).toBe("real-package-name");
  });

  test("valid skills from one package are kept when another package fails", async () => {
    const goodPkg = makePackage("good-pkg");
    const badPkg = makePackage("bad-pkg");
    const { logger, warnings } = silentLogger();

    const goodSkill = makeValidSkill({
      definition: makeSkillDefinition({ skillId: "good.skill" }),
    });

    const importer = makeImporter({
      [`${goodPkg.path}/index.ts`]: {
        skillFactory: () => ({ skills: [goodSkill] }),
      },
      [`${badPkg.path}/index.ts`]: {
        skillFactory: () => {
          throw new Error("broken");
        },
      },
    });

    const result = await loadPackageSkills(
      [goodPkg, badPkg],
      makeDeps(),
      logger,
      importer,
    );
    expect(result).toHaveLength(1);
    expect(result[0].definition.skillId).toBe("good.skill");
    expect(warnings.length).toBe(1);
  });

  test("invalid skills within a package are skipped while valid ones are kept", async () => {
    const pkg = makePackage("mixed-skills");
    const { logger, warnings } = silentLogger();

    const validSkill = makeValidSkill({
      definition: makeSkillDefinition({ skillId: "valid.one" }),
    });
    const invalidSkill: PackageSkill = {
      definition: makeSkillDefinition({ skillId: "invalid.one" }),
      // no handler
    };

    const importer = makeImporter({
      [`${pkg.path}/index.ts`]: {
        skillFactory: () => ({ skills: [validSkill, invalidSkill] }),
      },
    });

    const result = await loadPackageSkills([pkg], makeDeps(), logger, importer);
    expect(result).toHaveLength(1);
    expect(result[0].definition.skillId).toBe("valid.one");
    expect(warnings.length).toBe(1);
  });

  test("accepts valid streaming skill with streamHandler and eventTypes", async () => {
    const pkg = makePackage("streaming-pkg");
    const { logger } = silentLogger();

    const streamSkill: PackageSkill = {
      definition: makeSkillDefinition({
        skillId: "stream.skill",
        streaming: { eventTypes: ["progress", "complete"] },
      }),
      streamHandler: () => Promise.resolve(),
    };

    const importer = makeImporter({
      [`${pkg.path}/index.ts`]: {
        skillFactory: () => ({ skills: [streamSkill] }),
      },
    });

    const result = await loadPackageSkills([pkg], makeDeps(), logger, importer);
    expect(result).toHaveLength(1);
    expect(result[0].definition.skillId).toBe("stream.skill");
    expect(result[0].streamHandler).toBeDefined();
  });
});
