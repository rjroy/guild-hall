import type { OperationDefinition } from "@/lib/types";

/**
 * Navigation tree node for help endpoint rendering.
 * Built from operation hierarchy metadata during registry construction.
 */
export interface OperationTreeNode {
  name: string;
  kind: "root" | "feature" | "object" | "operation";
  description: string;
  children: OperationTreeNode[];
  /** Present only on operation nodes. */
  operation?: OperationDefinition;
}

export interface OperationsRegistry {
  /** All registered operations, keyed by operationId. */
  operations: ReadonlyMap<string, OperationDefinition>;

  /** Navigation tree built from operation hierarchy metadata. */
  tree: OperationTreeNode[];

  /** Look up a single operation by its operationId. */
  get(operationId: string): OperationDefinition | undefined;

  /** Return all operations matching a predicate. */
  filter(predicate: (op: OperationDefinition) => boolean): OperationDefinition[];

  /** Return the navigation subtree at a given path. */
  subtree(segments: string[]): OperationTreeNode | undefined;
}

function findOrCreateChild(
  parent: OperationTreeNode[],
  name: string,
  kind: OperationTreeNode["kind"],
  description: string,
): OperationTreeNode {
  let child = parent.find((n) => n.name === name);
  if (!child) {
    child = { name, kind, description, children: [] };
    parent.push(child);
  }
  return child;
}

/**
 * Builds an OperationsRegistry from an array of operation definitions.
 *
 * @param operations - All operation definitions collected from route factories.
 * @param descriptions - Optional descriptions for non-leaf nodes (root, feature, object).
 *   Keyed by dotted path (e.g., "commission" for root, "commission.run" for feature).
 * @throws Error if duplicate operationIds are found.
 */
export function createOperationsRegistry(
  operations: OperationDefinition[],
  descriptions?: Record<string, string>,
): OperationsRegistry {
  const operationMap = new Map<string, OperationDefinition>();
  const tree: OperationTreeNode[] = [];
  const descMap = descriptions ?? {};

  function desc(key: string, fallbackName: string): string {
    return descMap[key] ?? `Operations for ${fallbackName}`;
  }

  // Validate uniqueness and index
  for (const op of operations) {
    if (operationMap.has(op.operationId)) {
      throw new Error(
        `Duplicate operationId "${op.operationId}". Each operation must have a unique ID.`,
      );
    }
    operationMap.set(op.operationId, op);
  }

  // Build the navigation tree
  for (const op of operations) {
    const { root, feature, object } = op.hierarchy;

    const rootKey = root;
    const rootNode = findOrCreateChild(tree, root, "root", desc(rootKey, root));

    const featureKey = `${root}.${feature}`;
    const featureNode = findOrCreateChild(
      rootNode.children,
      feature,
      "feature",
      desc(featureKey, feature),
    );

    let operationParent: OperationTreeNode[];
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
      name: op.name,
      kind: "operation",
      description: op.description,
      children: [],
      operation: op,
    });
  }

  function findSubtree(segments: string[]): OperationTreeNode | undefined {
    if (segments.length === 0) return undefined;

    let nodes: OperationTreeNode[] = tree;
    let current: OperationTreeNode | undefined;

    for (const segment of segments) {
      current = nodes.find((n) => n.name === segment);
      if (!current) return undefined;
      nodes = current.children;
    }

    return current;
  }

  return {
    operations: operationMap,

    tree,

    get(operationId: string): OperationDefinition | undefined {
      return operationMap.get(operationId);
    },

    filter(predicate: (op: OperationDefinition) => boolean): OperationDefinition[] {
      return operations.filter(predicate);
    },

    subtree: findSubtree,
  };
}
