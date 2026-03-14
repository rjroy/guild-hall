import type { SkillDefinition } from "@/lib/types";

/**
 * Navigation tree node for help endpoint rendering.
 * Built from skill hierarchy metadata during registry construction.
 */
export interface SkillTreeNode {
  name: string;
  kind: "root" | "feature" | "object" | "operation";
  description: string;
  children: SkillTreeNode[];
  /** Present only on operation nodes. */
  skill?: SkillDefinition;
}

export interface SkillRegistry {
  /** All registered skills, keyed by skillId. */
  skills: ReadonlyMap<string, SkillDefinition>;

  /** Navigation tree built from skill hierarchy metadata. */
  tree: SkillTreeNode[];

  /** Look up a single skill by its skillId. */
  get(skillId: string): SkillDefinition | undefined;

  /** Return all skills matching a predicate. */
  filter(predicate: (skill: SkillDefinition) => boolean): SkillDefinition[];

  /** Return the navigation subtree at a given path. */
  subtree(segments: string[]): SkillTreeNode | undefined;
}

function findOrCreateChild(
  parent: SkillTreeNode[],
  name: string,
  kind: SkillTreeNode["kind"],
  description: string,
): SkillTreeNode {
  let child = parent.find((n) => n.name === name);
  if (!child) {
    child = { name, kind, description, children: [] };
    parent.push(child);
  }
  return child;
}

/**
 * Builds a SkillRegistry from an array of skill definitions.
 *
 * @param skills - All skill definitions collected from route factories.
 * @param descriptions - Optional descriptions for non-leaf nodes (root, feature, object).
 *   Keyed by dotted path (e.g., "commission" for root, "commission.run" for feature).
 * @throws Error if duplicate skillIds are found.
 */
export function createSkillRegistry(
  skills: SkillDefinition[],
  descriptions?: Record<string, string>,
): SkillRegistry {
  const skillMap = new Map<string, SkillDefinition>();
  const tree: SkillTreeNode[] = [];
  const descMap = descriptions ?? {};

  function desc(key: string, fallbackName: string): string {
    return descMap[key] ?? `Operations for ${fallbackName}`;
  }

  // Validate uniqueness and index
  for (const skill of skills) {
    if (skillMap.has(skill.skillId)) {
      throw new Error(
        `Duplicate skillId "${skill.skillId}". Each skill must have a unique ID.`,
      );
    }
    skillMap.set(skill.skillId, skill);
  }

  // Build the navigation tree
  for (const skill of skills) {
    const { root, feature, object } = skill.hierarchy;

    const rootKey = root;
    const rootNode = findOrCreateChild(tree, root, "root", desc(rootKey, root));

    const featureKey = `${root}.${feature}`;
    const featureNode = findOrCreateChild(
      rootNode.children,
      feature,
      "feature",
      desc(featureKey, feature),
    );

    let operationParent: SkillTreeNode[];
    if (object) {
      const objectKey = `${root}.${feature}.${object}`;
      const objectNode = findOrCreateChild(
        featureNode.children,
        object,
        "object",
        desc(objectKey, object),
      );
      operationParent = objectNode.children;
    } else {
      operationParent = featureNode.children;
    }

    operationParent.push({
      name: skill.name,
      kind: "operation",
      description: skill.description,
      children: [],
      skill,
    });
  }

  function findSubtree(segments: string[]): SkillTreeNode | undefined {
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

  return {
    skills: skillMap,

    tree,

    get(skillId: string): SkillDefinition | undefined {
      return skillMap.get(skillId);
    },

    filter(predicate: (skill: SkillDefinition) => boolean): SkillDefinition[] {
      return skills.filter(predicate);
    },

    subtree: findSubtree,
  };
}
