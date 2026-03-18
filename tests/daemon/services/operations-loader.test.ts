import { describe, expect, test } from "bun:test";
import { loadPackageOperations } from "@/daemon/services/operations-loader";
import type { ImportModule } from "@/daemon/services/operations-loader";
import type { DiscoveredPackage } from "@/lib/types";
import type {
  PackageOperation,
  OperationFactoryDeps,
  OperationFactoryOutput,
} from "@/daemon/services/operation-types";

// -- Helpers --

function makeDeps(overrides?: Partial<OperationFactoryDeps>): OperationFactoryDeps {
  return {
    config: {
      projects: [],
    } as OperationFactoryDeps["config"],
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

function makeOperationDefinition(overrides?: Record<string, unknown>) {
  return {
    operationId: "test.skill",
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

function makeValidOperation(overrides?: Partial<PackageOperation>): PackageOperation {
  return {
    definition: makeOperationDefinition(),
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

describe("loadPackageOperations", () => {
  test("loads operations from a package exporting operationFactory", async () => {
    const pkg = makePackage("my-skills");
    const skill = makeValidOperation();
    const { logger } = silentLogger();

    const importer = makeImporter({
      [`${pkg.path}/index.ts`]: {
        operationFactory: () => ({ operations: [skill] }) satisfies OperationFactoryOutput,
      },
    });

    const result = await loadPackageOperations([pkg], makeDeps(), logger, importer);
    expect(result).toHaveLength(1);
    expect(result[0].definition.sourcePackage).toBe("my-skills");
    expect(result[0].handler).toBe(skill.handler);
  });

  test("returns empty array when package has no operationFactory export", async () => {
    const pkg = makePackage("no-skills");
    const { logger } = silentLogger();

    const importer = makeImporter({
      [`${pkg.path}/index.ts`]: { toolboxFactory: () => ({}) },
    });

    const result = await loadPackageOperations([pkg], makeDeps(), logger, importer);
    expect(result).toEqual([]);
  });

  test("logs warning and skips package when factory throws", async () => {
    const pkg = makePackage("broken-factory");
    const { logger, warnings } = silentLogger();

    const importer = makeImporter({
      [`${pkg.path}/index.ts`]: {
        operationFactory: () => {
          throw new Error("factory boom");
        },
      },
    });

    const result = await loadPackageOperations([pkg], makeDeps(), logger, importer);
    expect(result).toEqual([]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("operationFactory threw");
    expect(warnings[0]).toContain("broken-factory");
  });

  test("logs warning and skips package when import fails", async () => {
    const pkg = makePackage("bad-import");
    const { logger, warnings } = silentLogger();

    const importer: ImportModule = () => {
      return Promise.reject(new Error("cannot import"));
    };

    const result = await loadPackageOperations([pkg], makeDeps(), logger, importer);
    expect(result).toEqual([]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("Failed to import");
    expect(warnings[0]).toContain("bad-import");
  });

  test("rejects operation with no handler present", async () => {
    const pkg = makePackage("no-handler");
    const { logger, warnings } = silentLogger();

    const skill: PackageOperation = {
      definition: makeOperationDefinition(),
      // no handler, no streamHandler
    };

    const importer = makeImporter({
      [`${pkg.path}/index.ts`]: {
        operationFactory: () => ({ operations: [skill] }),
      },
    });

    const result = await loadPackageOperations([pkg], makeDeps(), logger, importer);
    expect(result).toEqual([]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("must provide either handler or streamHandler");
  });

  test("rejects operation with both handler and streamHandler", async () => {
    const pkg = makePackage("both-handlers");
    const { logger, warnings } = silentLogger();

    const skill: PackageOperation = {
      definition: makeOperationDefinition({
        streaming: { eventTypes: ["progress"] },
      }),
      handler: () => Promise.resolve({ data: "ok" }),
      streamHandler: () => Promise.resolve(),
    };

    const importer = makeImporter({
      [`${pkg.path}/index.ts`]: {
        operationFactory: () => ({ operations: [skill] }),
      },
    });

    const result = await loadPackageOperations([pkg], makeDeps(), logger, importer);
    expect(result).toEqual([]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("exactly one of handler or streamHandler");
  });

  test("rejects streamHandler without streaming.eventTypes", async () => {
    const pkg = makePackage("no-event-types");
    const { logger, warnings } = silentLogger();

    const skill: PackageOperation = {
      definition: makeOperationDefinition(),
      streamHandler: () => Promise.resolve(),
    };

    const importer = makeImporter({
      [`${pkg.path}/index.ts`]: {
        operationFactory: () => ({ operations: [skill] }),
      },
    });

    const result = await loadPackageOperations([pkg], makeDeps(), logger, importer);
    expect(result).toEqual([]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("streamHandler requires definition.streaming.eventTypes");
  });

  test("rejects handler with streaming defined", async () => {
    const pkg = makePackage("handler-with-streaming");
    const { logger, warnings } = silentLogger();

    const skill: PackageOperation = {
      definition: makeOperationDefinition({
        streaming: { eventTypes: ["progress"] },
      }),
      handler: () => Promise.resolve({ data: "ok" }),
    };

    const importer = makeImporter({
      [`${pkg.path}/index.ts`]: {
        operationFactory: () => ({ operations: [skill] }),
      },
    });

    const result = await loadPackageOperations([pkg], makeDeps(), logger, importer);
    expect(result).toEqual([]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("non-streaming handler must not have definition.streaming");
  });

  test("rejects operation with scheduleId context", async () => {
    const pkg = makePackage("schedule-context");
    const { logger, warnings } = silentLogger();

    const skill = makeValidOperation({
      definition: makeOperationDefinition({
        context: { scheduleId: true },
      }),
    });

    const importer = makeImporter({
      [`${pkg.path}/index.ts`]: {
        operationFactory: () => ({ operations: [skill] }),
      },
    });

    const result = await loadPackageOperations([pkg], makeDeps(), logger, importer);
    expect(result).toEqual([]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("scheduleId context is not supported");
  });

  test("stamps sourcePackage from package name, overriding existing value", async () => {
    const pkg = makePackage("real-package-name");
    const { logger } = silentLogger();

    const skill = makeValidOperation({
      definition: makeOperationDefinition({ sourcePackage: "wrong-name" }),
    });

    const importer = makeImporter({
      [`${pkg.path}/index.ts`]: {
        operationFactory: () => ({ operations: [skill] }),
      },
    });

    const result = await loadPackageOperations([pkg], makeDeps(), logger, importer);
    expect(result).toHaveLength(1);
    expect(result[0].definition.sourcePackage).toBe("real-package-name");
  });

  test("valid operations from one package are kept when another package fails", async () => {
    const goodPkg = makePackage("good-pkg");
    const badPkg = makePackage("bad-pkg");
    const { logger, warnings } = silentLogger();

    const goodSkill = makeValidOperation({
      definition: makeOperationDefinition({ operationId: "good.skill" }),
    });

    const importer = makeImporter({
      [`${goodPkg.path}/index.ts`]: {
        operationFactory: () => ({ operations: [goodSkill] }),
      },
      [`${badPkg.path}/index.ts`]: {
        operationFactory: () => {
          throw new Error("broken");
        },
      },
    });

    const result = await loadPackageOperations(
      [goodPkg, badPkg],
      makeDeps(),
      logger,
      importer,
    );
    expect(result).toHaveLength(1);
    expect(result[0].definition.operationId).toBe("good.skill");
    expect(warnings.length).toBe(1);
  });

  test("invalid operations within a package are skipped while valid ones are kept", async () => {
    const pkg = makePackage("mixed-skills");
    const { logger, warnings } = silentLogger();

    const validSkill = makeValidOperation({
      definition: makeOperationDefinition({ operationId: "valid.one" }),
    });
    const invalidSkill: PackageOperation = {
      definition: makeOperationDefinition({ operationId: "invalid.one" }),
      // no handler
    };

    const importer = makeImporter({
      [`${pkg.path}/index.ts`]: {
        operationFactory: () => ({ operations: [validSkill, invalidSkill] }),
      },
    });

    const result = await loadPackageOperations([pkg], makeDeps(), logger, importer);
    expect(result).toHaveLength(1);
    expect(result[0].definition.operationId).toBe("valid.one");
    expect(warnings.length).toBe(1);
  });

  test("accepts valid streaming operation with streamHandler and eventTypes", async () => {
    const pkg = makePackage("streaming-pkg");
    const { logger } = silentLogger();

    const streamOp: PackageOperation = {
      definition: makeOperationDefinition({
        operationId: "stream.skill",
        streaming: { eventTypes: ["progress", "complete"] },
      }),
      streamHandler: () => Promise.resolve(),
    };

    const importer = makeImporter({
      [`${pkg.path}/index.ts`]: {
        operationFactory: () => ({ operations: [streamOp] }),
      },
    });

    const result = await loadPackageOperations([pkg], makeDeps(), logger, importer);
    expect(result).toHaveLength(1);
    expect(result[0].definition.operationId).toBe("stream.skill");
    expect(result[0].streamHandler).toBeDefined();
  });
});
