---
title: Wide DAG Visualization Patterns
date: 2026-03-10
status: active
tags: [visualization, dag, graph, layout]
---
# Wide DAG Visualization Patterns

Research into how CI/CD tools and graph libraries handle wide dependency graphs, with focus on "wide-and-shallow" DAGs (many parallel nodes, few depth levels).

## Tool Survey

### 1. GitHub Actions

**Layout approach:** Left-to-right columnar. Jobs are rendered as rounded-rectangle nodes arranged horizontally, with dependency lines connecting them. The layout uses a custom graph renderer (not dagre or ELK).

**Wide-and-shallow handling:** Parallel jobs (those without `needs` dependencies on each other) stack vertically within the same column. When a workflow has many parallel jobs, the graph grows tall rather than wide. The primary axis is left-to-right (dependency depth), with the secondary axis vertical (parallelism within a depth level).

**Scrolling:** The graph sits within a scrollable container on the workflow run summary page. For wide workflows, the graph consumes significant vertical space, pushing annotations and artifacts below the fold. Known usability complaint: on large workflows, "the font size is so tiny we can't even read the text inside each bubble."

**Clustering:** No explicit clustering. Jobs are grouped implicitly by dependency depth (which column they land in).

**Known problems:** Edge routing through nodes (edges pass under node rectangles rather than routing around them). The graph occupies excessive screen space for simple workflows. Zoom and scroll interaction conflicts on touchpads. For complex workflows with many cross-column dependencies, the visualization becomes unreliable and users must click individual nodes to see highlighted dependency paths.

**Sources:**
- [GitHub Docs: Using the visualization graph](https://docs.github.com/actions/managing-workflow-runs/using-the-visualization-graph)
- [Community discussion: GHA visualization graph considered harmful](https://github.com/orgs/community/discussions/18035)
- [GitHub Changelog: Workflow visualization](https://github.blog/changelog/2020-12-08-github-actions-workflow-visualization/)

---

### 2. Argo Workflows

**Layout approach:** Top-to-bottom layered layout using **dagre**. Each workflow task is a node, with edges pointing downward to dependent tasks. The graph follows the standard Sugiyama/layered approach via dagre.js.

**Wide-and-shallow handling:** Poorly. Dagre places parallel nodes side by side in the same layer, which makes wide DAGs grow horizontally. When nodes depend on upstream tasks that expand into multiple items (e.g., withItems parallelism), dagre struggles to position downstream nodes correctly, sometimes placing them "between pipelines rather than to the side." Edge routing becomes chaotic with many parallel paths.

**Scrolling:** Vertical scrolling (primary flow is top-to-bottom). For very wide DAGs, horizontal scrolling is also needed. The UI has been tested with up to 4,500-node DAGs, which are "slow but usable." At 2,000+ nodes, the web UI can hang or crash.

**Clustering:** No built-in visual clustering. The DAG structure is flat. Node grouping is implicit through the task dependency hierarchy.

**Known problems:** Edge metadata inconsistency between visualization and execution order. Layout breaks with retry strategies (graph "flattens out and grows horizontally"). Performance degrades sharply above ~2,000 nodes. Users requested hierarchical visualization with node collapsing, and summary views by state, but these are not yet implemented.

**Sources:**
- [Argo Issue #1136: DAG displays in odd way](https://github.com/argoproj/argo-workflows/issues/1136)
- [Argo Issue #2367: UI/CLI challenges with 2000-node workflows](https://github.com/argoproj/argo/issues/2367)
- [Argo Workflows DAG walkthrough](https://argo-workflows.readthedocs.io/en/latest/walk-through/dag/)

---

### 3. Apache Airflow

**Layout approach:** Top-to-bottom layered layout using **dagre.js + D3.js** for rendering. The Graph View renders each task as a color-coded node (green=success, red=failed, yellow=running, gray=scheduled, purple=retry) connected by arrows showing execution order.

**Wide-and-shallow handling:** Parallel tasks spread horizontally within their layer. For wide DAGs, this means significant horizontal expansion. Airflow mitigates this primarily through **TaskGroups**, which allow collapsing sets of related tasks into a single visual group node. This is the main tool for managing visual complexity in wide graphs.

**Scrolling:** The graph view scrolls in both directions. For DAGs with many parallel paths, horizontal scrolling is common. The container is pannable and zoomable.

**Clustering:** **TaskGroups** are the explicit clustering mechanism. Tasks can be organized into hierarchical groups that display as expandable/collapsible containers in the Graph View. This is the recommended approach for cutting down visual clutter in wide DAGs with repeating patterns.

**Known problems:** The built-in dashboard is slow for large DAGs (one team built a custom alternative using React + D3 because "Airflow's dashboard was testing our patience"). The Graph View doesn't scale well past a few hundred tasks without TaskGroup organization.

**Sources:**
- [Airflow Graph View Explained](https://www.sparkcodehub.com/airflow/ui-monitoring/graph-view)
- [Airflow Docs: DAGs](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dags.html)
- [Airflow UI Overview](https://airflow.apache.org/docs/apache-airflow/stable/ui.html)
- [Custom Airflow dashboard](https://medium.com/datasparq-technology/airflows-dashboard-was-testing-our-patience-so-we-made-our-own-cc82559785a8)

---

### 4. GitLab CI/CD

**Layout approach:** **Left-to-right columnar, stage-based**. Each pipeline stage is a vertical column. Jobs within a stage are stacked vertically within their column. This is a custom layout, not using dagre or any graph library. The primary axis is horizontal (stage progression), secondary axis is vertical (job parallelism within a stage).

**Wide-and-shallow handling:** This is the most interesting approach for wide-and-shallow graphs. Because stages define explicit columns, many parallel jobs in the same stage simply stack vertically. The pipeline grows tall, not wide, when parallelism increases. When using the `needs` keyword (DAG mode), dependency lines are drawn across columns, but jobs still display in their stage column. Users can toggle between grouping by stage and grouping by job dependencies.

**Scrolling:** **Horizontal scrolling** for pipelines with many stages. This is a known UX pain point: the scrollbar is hidden at the bottom of the page, requiring users to scroll all the way down to find it, then scroll horizontally, then scroll back up. GitLab investigated hold-and-drag interaction as a fix. There was also a community request for vertical pipeline graphs (stages stacked top-to-bottom instead of left-to-right) to eliminate horizontal scrolling.

**Clustering:** Stages are the natural clustering mechanism. Parent-child pipelines provide a second level of grouping, where a parent pipeline triggers child sub-pipelines that can be viewed independently.

**Known problems:** Horizontal scrollbar discoverability. For very large pipelines with many stages, the left-to-right layout becomes unwieldy. The DAG dependency lines can overlap and become hard to trace. Issue #22474 notes "having intelligible pipeline is hard if it consists in a lot of stages and jobs."

**Sources:**
- [GitLab Docs: Pipeline architecture](https://docs.gitlab.com/ci/pipelines/pipeline_architectures/)
- [GitLab Issue #243784: Horizontal scrollbar not intuitive](https://gitlab.com/gitlab-org/gitlab/-/issues/243784)
- [GitLab Issue #62893: Vertical pipeline graphs](https://gitlab.com/gitlab-org/gitlab-foss/-/issues/62893)
- [GitLab DAG blog post](https://about.gitlab.com/blog/directed-acyclic-graph/)
- [GitLab Issue #33793: Design for visualizing DAG](https://gitlab.com/gitlab-org/gitlab/-/issues/33793)

---

### 5. Jenkins Blue Ocean

**Layout approach:** **Left-to-right horizontal, custom renderer**. Stages are displayed as circles/nodes connected by horizontal lines. The primary flow is left-to-right. Parallel branches within a stage are displayed as a **vertical stack** below the parent stage node, creating a "railroad track" visual where parallel paths diverge downward and reconverge at the next sequential stage.

**Wide-and-shallow handling:** The vertical-stack approach for parallel branches is the defining pattern. When a stage has many parallel branches, the graph grows tall at that point. The overall width of the graph is determined by the number of sequential stages (depth), not by parallelism. This is an effective pattern for wide-and-shallow graphs because it contains parallel breadth vertically.

**Scrolling:** Primarily horizontal scrolling for deep pipelines. The graph is relatively compact horizontally because parallel stages are stacked, not spread.

**Clustering:** Parallel branches are implicitly clustered under their parent stage. The Declarative Pipeline syntax enforces that parallel branches must be within a stage, which naturally constrains the visual structure.

**Known problems:** Nested parallel stages were not displayed correctly for a long time. The Pipeline Graph View plugin (Blue Ocean's successor) rebuilt the visualization with React and improved support for nested parallels. The original Blue Ocean is now deprecated in favor of the Pipeline Graph View plugin.

**Sources:**
- [Jenkins Blue Ocean Pipeline Run Details](https://www.jenkins.io/doc/book/blueocean/pipeline-run-details/)
- [Jenkins Pipeline Graph View plugin](https://plugins.jenkins.io/pipeline-graph-view)
- [Revamped Pipeline visualization in Jenkins](https://www.jenkins.io/blog/2025/05/02/pipeline-graph-view/)
- [Issue #51: Nested parallel stages](https://github.com/jenkinsci/pipeline-graph-view-plugin/issues/51)
- [Mermaid issue referencing Blue Ocean as gold standard](https://github.com/mermaid-js/mermaid/issues/4394)

---

### 6. Tekton Dashboard

**Layout approach:** Top-to-bottom DAG layout using a **custom React graph component** (`@tektoncd/dashboard-graph` npm package). Tasks are nodes, edges represent `runAfter` dependencies. The layout follows standard layered/hierarchical principles.

**Wide-and-shallow handling:** Limited information on how the dashboard handles extreme width. The component accepts edges and nodes as props and renders the DAG. For pipelines with many parallel tasks, the graph would expand horizontally following standard dagre-like behavior.

**Scrolling:** The dashboard provides a scrollable container for the pipeline visualization.

**Clustering:** No explicit visual clustering. Tasks are rendered as flat nodes in the DAG.

**Known problems:** The dashboard's interactive diagram feature was tracked as a significant design epic (Issue #675). The @tektoncd/dashboard-graph package is relatively simple compared to tools like Buildkite or Jenkins Blue Ocean.

**Sources:**
- [Tekton Dashboard docs](https://tekton.dev/docs/dashboard/)
- [@tektoncd/dashboard-graph npm](https://www.npmjs.com/package/@tektoncd/dashboard-graph)
- [Tekton Dashboard Issue #675: Interactive diagram](https://github.com/tektoncd/dashboard/issues/675)
- [Tekton Pipelines: defining DAGs](https://tekton.dev/docs/pipelines/pipelines/)

---

### 7. Buildkite

**Layout approach:** **DAG-based canvas visualization** (the "Build Canvas"). Steps are nodes with dependency edges forming a directed acyclic graph. The layout appears to use a custom arrangement (not confirmed dagre or ELK).

**Wide-and-shallow handling:** Buildkite explicitly acknowledges this is a challenge: "This view is not as useful when zoomed out on a large number of steps." Their approach is **interactive filtering rather than layout optimization**:
- Select a step to highlight upstream/downstream dependencies
- Hide conditional steps to simplify the view
- Group steps (the Group Step feature collapses related steps into a single visual unit)
- Jump to failures with keyboard shortcut (press `f`)
- Full-screen mode for exploration
- Sidebar view that collapses parallel jobs into single entries

**Scrolling:** The canvas supports zooming and panning. Full-screen mode provides maximum viewport for large builds.

**Clustering:** **Group Steps** are the primary clustering mechanism. Steps can be grouped into named clusters that collapse in the visualization. The sidebar provides a "state-based" view with filtering by state and intelligent nesting of groups, parallel, and matrix steps.

**Known problems:** "Even on the build canvas, you'll likely see lines between steps overlapping in large builds." The canvas is not recommended for large builds unless debugging dependencies specifically. For large pipelines, Buildkite recommends the table view or sidebar instead of the canvas.

**Sources:**
- [Buildkite: Visualize your CI/CD pipeline on a canvas](https://buildkite.com/resources/blog/visualize-your-ci-cd-pipeline-on-a-canvas/)
- [Buildkite: Build Canvas changelog](https://buildkite.com/resources/changelog/243-build-canvas-a-new-way-to-visualize-and-understand-your-builds/)
- [Buildkite: Group Step docs](https://buildkite.com/docs/pipelines/configure/step-types/group-step)
- [Buildkite: Build page docs](https://buildkite.com/docs/pipelines/build-page)
- [Buildkite: New build page for scale](https://buildkite.com/resources/changelog/266-introducing-the-new-build-page-engineered-for-scale-and-flexibility/)

---

### 8. Mermaid.js

**Layout approach:** Supports four layout engines:
- **Dagre** (default): Standard Sugiyama/layered algorithm. Produces layered left-to-right or top-to-bottom graphs.
- **ELK** (Eclipse Layout Kernel): More sophisticated, better for complex/large diagrams. Handles nested subgraphs and edge routing better. Available as `@mermaid-js/layout-elk` since v11.
- **Tidy-tree**: Hierarchical tree layout.
- **COSE-Bilkent**: Force-directed graph positioning.

**Wide-and-shallow handling:**
- **Dagre:** Graphs with many parallel nodes in the same rank expand along the perpendicular axis. With `rankDir: TB`, wide parallel layers expand horizontally. With `rankDir: LR`, they expand vertically. Configuration options: `nodeSep` (spacing between nodes in same rank), `rankSep` (spacing between ranks), `spacingFactor` (multiplicative scale).
- **ELK:** Offers **graph wrapping** (strategies: `SINGLE_EDGE`, `MULTI_EDGE`) which splits wide graphs into chunks placed side by side. Also offers aspect ratio control (default 1.6), compaction options, and node placement strategies. The `mergeEdges` option combines parallel edges for cleaner routing.

**Scrolling:** Mermaid renders SVG, so scrolling behavior depends on the embedding context. The SVG itself doesn't scroll; the container must handle overflow. Most embeddings (GitHub, Notion, etc.) constrain the SVG to a fixed width, causing very wide graphs to become tiny or overflow.

**Clustering:** Subgraphs provide visual grouping. With ELK, nested subgraphs are handled more elegantly than with dagre. Subgraphs can have their own direction (e.g., a TB parent with LR children).

**Known problems:** Dagre produces graphs that are too wide for many-parallel-node scenarios. ELK is better but slower and requires a separate package install. Wide flowcharts in embedded contexts (docs, READMEs) frequently overflow their containers.

**Sources:**
- [Mermaid Layouts documentation](https://mermaid.ai/open-source/config/layouts.html)
- [Mermaid Flowchart syntax](https://mermaid.js.org/syntax/flowchart.html)
- [Mermaid ELK in draw.io](https://www.drawio.com/blog/mermaid-elk-layout)
- [Mermaid.js Layout Engines deep wiki](https://deepwiki.com/mermaid-js/mermaid/2.3-diagram-types-detection)
- [Mermaid Flowchart config schema](https://mermaid.js.org/config/schema-docs/config-defs-flowchart-diagram-config.html)

---

## Layout Patterns for Wide-Shallow DAGs

### Pattern 1: Parent-Aligned Positioning

**Concept:** Place child nodes directly below (or beside) their parent node, rather than centering them in their layer. In a standard Sugiyama layout, nodes within a layer are ordered to minimize crossings globally. Parent-aligned positioning sacrifices global crossing minimization to maintain visual locality: if you see a parent, you see its children immediately adjacent.

**Where it appears:**
- Jenkins Blue Ocean uses this implicitly: parallel branches stack directly below their parent stage
- GitHub Actions places dependent jobs in the next column, aligned with their dependency sources
- The Brandes-Kopf coordinate assignment algorithm (used by both dagre and ELK) explicitly tries to align nodes with their connected neighbors by finding "type 1 conflicts" (vertical inner segments) and using a four-pass median alignment

**Tradeoffs:** Good for readability of individual dependency chains. Bad for minimizing total edge crossings when chains share intermediate nodes. Works best when the graph has a tree-like structure (each node has one parent).

**Implementation:** Dagre's coordinate assignment derives from Brandes-Kopf. ELK's `BRANDES_KOEPF` node placement strategy does the same. The `coordSimplex` operator in d3-dag optimizes for straight edges and parent alignment.

### Pattern 2: Cluster-by-Chain

**Concept:** Group nodes that form dependency chains into visual clusters, then lay out clusters as units. Instead of placing 50 parallel nodes in a single wide layer, identify which ones form natural chains (A->B->C, D->E->F) and group each chain together, then arrange the clusters side by side.

**Where it appears:**
- Airflow TaskGroups are the explicit implementation: you define groups of related tasks that collapse into a single visual unit
- Buildkite Group Steps serve the same purpose: related steps become a single collapsible cluster
- GitLab parent-child pipelines achieve this at the pipeline level (not the job level)
- ELK compound graph support handles nested grouping natively

**Tradeoffs:** Requires the user (or an algorithm) to define meaningful groups. Automated chain detection is possible (find maximal paths, group by connected components of a transitive reduction) but the results may not match user intent. Manual grouping (TaskGroups, Group Steps) is more reliable but requires upfront configuration.

**Implementation:** No standard layout algorithm does this automatically. Airflow and Buildkite require explicit group definitions. A preprocessing step could detect chains and create compound/group nodes before passing to dagre or ELK.

### Pattern 3: Reversed Axis

**Concept:** For DAGs that are naturally wide (many parallel paths) but shallow (few levels of depth), rotate the layout 90 degrees. Instead of top-to-bottom (TB) with horizontal expansion, use left-to-right (LR) so parallel nodes stack vertically. Since screens are wider than they are tall, and vertical scrolling is more natural than horizontal, this converts an uncomfortable wide layout into a comfortable tall one.

**Where it appears:**
- GitLab CI/CD is the canonical example: stages flow left-to-right, parallel jobs within a stage stack vertically. This naturally handles wide-and-shallow pipelines because the parallel dimension maps to the vertical axis.
- Jenkins Blue Ocean uses the same principle: sequential stages go left-to-right, parallel branches go vertically.
- Dagre supports `rankDir: LR` for this rotation.
- ELK supports `elk.direction: RIGHT` for the same effect.
- Mermaid supports `flowchart LR` to rotate the graph.

**Tradeoffs:** Works well when the "wide" dimension is parallelism within depth levels. Breaks down when the graph is both wide AND deep (many parallel paths with many levels). Left-to-right reading is natural in LTR languages, making the depth axis intuitive. The main risk is that deep LR graphs cause horizontal scrolling, which is worse than vertical scrolling.

**Implementation:** Simply set `rankDir: LR` in dagre, or use LR/RIGHT direction in ELK. No algorithm changes needed; it's purely axis swap.

### Pattern 4: Swimlane Layout

**Concept:** Group nodes by category (team, type, domain) and place each category in its own horizontal or vertical lane. Dependency lines cross between lanes. This is orthogonal to the DAG structure: instead of grouping by depth level, you group by a semantic property.

**Where it appears:**
- ELK supports swimlanes natively as a layout constraint
- yWorks/yFiles has dedicated swimlane support in its hierarchical layout
- Swimlane.io's ngx-graph library supports DAG layouts with category grouping
- Airflow doesn't have native swimlanes, but TaskGroups can approximate them
- GitLab stages function as implicit swimlanes (each stage is a lane)

**Tradeoffs:** Powerful for understanding who owns what, but dependency lines between lanes can become tangled. The lane structure imposes a constraint that may conflict with optimal crossing minimization. Works best when cross-lane dependencies are sparse. If every node connects to every other lane, swimlanes add visual complexity rather than reducing it.

**Implementation:** ELK supports partition constraints that assign nodes to swimlanes. In dagre, swimlanes must be implemented as a preprocessing step (assign lane positions, constrain node placement within lanes). React Flow or Cytoscape.js can render lane backgrounds as separate layers behind the graph.

---

## Layout Algorithms: Deep Dive

### Sugiyama / Layered (Dagre, ELK Layered, Graphviz dot)

The standard four-phase algorithm:

1. **Cycle removal:** Temporarily reverse edges to make the graph acyclic (not needed for DAGs).
2. **Layer assignment:** Assign each node to a layer such that all edges point from lower to higher layers. Common strategies: longest-path (minimizes layers), network-simplex (minimizes total edge span), Coffman-Graham (bounds max layer width).
3. **Crossing minimization:** Reorder nodes within each layer to minimize edge crossings. Uses iterative barycenter/median heuristics (24 iterations in typical implementations). This is the phase most relevant to wide graphs: more nodes per layer means more possible orderings.
4. **Coordinate assignment:** Assign x/y coordinates. Brandes-Kopf algorithm aims for straight edges by aligning nodes with their neighbors.

**For wide-and-shallow DAGs:** The main lever is layer assignment strategy. The Coffman-Graham algorithm allows bounding the maximum number of nodes per layer, which could force wide layers to split into multiple narrower layers (at the cost of adding depth). Network-simplex minimizes total edge length, which tends to keep related nodes close but doesn't bound width.

### ELK-Specific Options for Wide Graphs

- **Graph Wrapping** (`wrapping.strategy`): `SINGLE_EDGE` or `MULTI_EDGE`. Splits the graph into chunks placed side by side, with wrapped edges connecting chunks. This is the most direct solution for wide graphs: it converts a single wide row into multiple rows.
- **Aspect Ratio** (`aspectRatio`): Default 1.6. Influences component arrangement to target a specific width/height ratio.
- **Post-Compaction** (`postCompaction.strategy`): Reduces whitespace after initial layout.
- **Node Placement** (`nodePlacement.strategy`): `BRANDES_KOEPF` (default, aligns with neighbors), `LINEAR_SEGMENTS`, `NETWORK_SIMPLEX`, `SIMPLE`.
- **Over 140 total options** for fine-grained control.

### d3-dag

Purpose-built for DAG layout. Implements Sugiyama with pluggable operators:
- **Layering:** `layeringLongestPath`, `layeringSimplex`
- **Decrossing:** `decrossOpt` (optimal, exponential), `decrossTwoLayer` (heuristic)
- **Coordinate assignment:** `coordSimplex` (minimizes edge length), `coordGreedy` (fast approximation)

For wide DAGs, `coordSimplex` tends to produce narrower layouts by optimizing edge straightness. The library operates on a DAG abstraction and returns coordinates without rendering, so the consumer handles scrolling and display.

---

## Synthesis: What Works for Wide-and-Shallow Graphs

| Strategy | Best for | Used by | Implementation complexity |
|----------|----------|---------|--------------------------|
| **Reversed axis (LR)** | Moderate parallelism, few depth levels | GitLab, Jenkins, dagre `rankDir:LR` | Trivial (config change) |
| **Vertical stacking of parallels** | Parallel branches within stages | Jenkins Blue Ocean, GitHub Actions | Custom layout logic |
| **Collapsible groups** | Very wide graphs with logical groupings | Airflow TaskGroups, Buildkite Groups | Requires group definitions |
| **Graph wrapping** | Extremely wide single-layer graphs | ELK wrapping strategy | ELK-specific feature |
| **Interactive filtering** | Any large graph | Buildkite canvas, Argo (requested) | UI investment, not layout |
| **Multiple views** | Different users need different perspectives | Buildkite (canvas/table/sidebar), Airflow (graph/grid) | Significant UI investment |

**The uncomfortable truth:** No tool handles wide-and-shallow DAGs particularly well with layout alone. Every tool that scales to large graphs uses either (a) grouping/collapsing to reduce visible node count, (b) interactive filtering to let users focus on subsets, or (c) alternative views that abandon the graph layout entirely (tables, lists, grids). The layout algorithm is necessary but not sufficient. The UI around the graph matters more than the graph layout algorithm for extreme cases.

**Best practice from the field:** Start with `LR` direction (reversed axis). Add grouping/collapsing for logical clusters. Provide interactive dependency highlighting (click a node, see its upstream/downstream). Offer an alternative list/table view for pipelines too large for visual graph layout. Don't try to make the graph readable at every zoom level; instead, make it navigable.
