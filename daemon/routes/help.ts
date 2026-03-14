import { Hono } from "hono";
import type { SkillRegistry, SkillTreeNode } from "@/daemon/lib/skill-registry";

/**
 * Serializes a skill tree node into the response shape.
 */
function serializeNode(
  node: SkillTreeNode,
  segments: string[],
): Record<string, unknown> {
  const skillId = segments.join(".");
  const path = "/" + segments.join("/");

  const result: Record<string, unknown> = {
    skillId,
    version: "1",
    path,
    kind: node.kind,
    name: node.name,
    description: node.description,
    visibility: "available",
  };

  // For operation nodes with skill metadata, include the method
  if (node.skill?.invocation.method) {
    result.method = node.skill.invocation.method;
  }

  // Include source package attribution for package-contributed skills
  if (node.skill?.sourcePackage) {
    result.sourcePackage = node.skill.sourcePackage;
  }

  // Include children summary for non-operation nodes
  if (node.children.length > 0) {
    result.children = node.children.map((child) => ({
      name: child.name,
      kind: child.kind,
      path: `${path}/${child.name}`,
      description: child.description,
    }));
  }

  return result;
}

/**
 * Finds a node in the tree at the given path segments.
 */
function findNode(
  tree: SkillTreeNode[],
  segments: string[],
): SkillTreeNode | undefined {
  if (segments.length === 0) return undefined;

  let nodes: SkillTreeNode[] = tree;
  let current: SkillTreeNode | undefined;

  for (const segment of segments) {
    current = nodes.find((n) => n.name === segment);
    if (!current) return undefined;
    nodes = current.children;
  }

  return current;
}

/**
 * Creates help routes that serve metadata at all hierarchy levels.
 * The help tree is built dynamically from the skill registry, so it always
 * reflects the currently registered capabilities.
 *
 * GET /help                                     - List top-level roots
 * GET /help/skills                              - Flat list of all skills
 * GET /:root/help                               - List features
 * GET /:root/:feature/help                      - List objects
 * GET /:root/:feature/:object/help              - List operations
 * GET /:root/:feature/:object/:operation/help   - Full operation metadata
 */
export function createHelpRoutes(registry: SkillRegistry): Hono {
  const routes = new Hono();

  // GET /help - List top-level roots
  routes.get("/help", (c) => {
    return c.json({
      skillId: "",
      version: "1",
      path: "/",
      kind: "root",
      name: "Guild Hall API",
      description: "Guild Hall daemon REST API",
      visibility: "available",
      children: registry.tree.map((root) => ({
        name: root.name,
        kind: root.kind,
        path: `/${root.name}`,
        description: root.description,
      })),
    });
  });

  // GET /:root/help
  routes.get("/:root/help", (c) => {
    const node = findNode(registry.tree, [c.req.param("root")]);
    if (!node) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(serializeNode(node, [c.req.param("root")]));
  });

  // GET /:root/:feature/help
  routes.get("/:root/:feature/help", (c) => {
    const node = findNode(registry.tree, [
      c.req.param("root"),
      c.req.param("feature"),
    ]);
    if (!node) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(
      serializeNode(node, [c.req.param("root"), c.req.param("feature")]),
    );
  });

  // GET /:root/:feature/:object/help
  routes.get("/:root/:feature/:object/help", (c) => {
    const node = findNode(registry.tree, [
      c.req.param("root"),
      c.req.param("feature"),
      c.req.param("object"),
    ]);
    if (!node) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(
      serializeNode(node, [
        c.req.param("root"),
        c.req.param("feature"),
        c.req.param("object"),
      ]),
    );
  });

  // GET /:root/:feature/:object/:operation/help
  routes.get("/:root/:feature/:object/:operation/help", (c) => {
    const node = findNode(registry.tree, [
      c.req.param("root"),
      c.req.param("feature"),
      c.req.param("object"),
      c.req.param("operation"),
    ]);
    if (!node) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(
      serializeNode(node, [
        c.req.param("root"),
        c.req.param("feature"),
        c.req.param("object"),
        c.req.param("operation"),
      ]),
    );
  });

  // GET /help/skills - Flat list of all skills with metadata
  routes.get("/help/skills", (c) => {
    const skills = Array.from(registry.skills.values()).map((skill) => {
      const entry: Record<string, unknown> = {
        skillId: skill.skillId,
        name: skill.name,
        description: skill.description,
        invocation: skill.invocation,
        context: skill.context,
        eligibility: skill.eligibility,
        streaming: skill.streaming,
        idempotent: skill.idempotent,
        parameters: skill.parameters,
      };
      if (skill.sourcePackage) {
        entry.sourcePackage = skill.sourcePackage;
      }
      return entry;
    });
    return c.json({ skills });
  });

  return routes;
}
