import * as fs from "node:fs/promises";
import * as path from "node:path";
import { redirect } from "next/navigation";
import { getProject } from "@/lib/config";
import { projectLorePath, getGuildHallHome, resolveCommissionBasePath, integrationWorktreePath } from "@/lib/paths";
import {
  readCommissionMeta,
  scanCommissions,
  parseActivityTimeline,
} from "@/lib/commissions";
import { buildDependencyGraph } from "@/lib/dependency-graph";
import CommissionHeader from "@/web/components/commission/CommissionHeader";
import CommissionView from "@/web/components/commission/CommissionView";
import NeighborhoodGraph from "@/web/components/commission/NeighborhoodGraph";
import type { CommissionArtifact } from "@/web/components/commission/CommissionLinkedArtifacts";
import styles from "./page.module.css";

/**
 * Resolves linked artifact paths from commission frontmatter into
 * CommissionArtifact objects with display titles and hrefs.
 */
async function resolveLinkedArtifacts(
  artifactPaths: string[],
  lorePath: string,
  projectName: string,
): Promise<CommissionArtifact[]> {
  const encodedProject = encodeURIComponent(projectName);

  return Promise.all(
    artifactPaths.map(async (artifactPath) => {
      // Verify the file exists (best effort, non-blocking)
      const fullPath = path.join(lorePath, artifactPath);
      try {
        await fs.access(fullPath);
      } catch {
        // File doesn't exist yet; still include it in the list
      }

      const title =
        artifactPath.split("/").pop()?.replace(/\.md$/, "") || artifactPath;

      return {
        path: artifactPath,
        title,
        href: `/projects/${encodedProject}/artifacts/${artifactPath}`,
      };
    }),
  );
}

export default async function CommissionPage({
  params,
}: {
  params: Promise<{ name: string; id: string }>;
}) {
  const { name: rawName, id } = await params;
  const projectName = decodeURIComponent(rawName);

  const project = await getProject(projectName);
  if (!project) {
    redirect("/");
  }

  const ghHome = getGuildHallHome();
  const basePath = await resolveCommissionBasePath(ghHome, projectName, id);
  const lorePath = projectLorePath(basePath);
  const commissionFile = path.join(lorePath, "commissions", `${id}.md`);

  let commission;
  let rawContent: string;
  try {
    rawContent = await fs.readFile(commissionFile, "utf-8");
    commission = await readCommissionMeta(commissionFile, projectName);
  } catch {
    redirect(`/projects/${encodeURIComponent(projectName)}?tab=commissions`);
  }

  const timeline = parseActivityTimeline(rawContent);
  const linkedArtifacts = await resolveLinkedArtifacts(
    commission.linked_artifacts,
    lorePath,
    projectName,
  );

  // Build dependency graph from all commissions in the project
  // to show the neighborhood (direct deps and dependents) for this commission.
  const integrationPath = integrationWorktreePath(ghHome, projectName);
  const integrationLorePath = projectLorePath(integrationPath);
  const allCommissions = await scanCommissions(integrationLorePath, projectName);
  const graph = buildDependencyGraph(allCommissions);

  return (
    <div className={styles.commissionView}>
      <CommissionHeader
        title={commission.title}
        status={commission.status}
        worker={commission.worker}
        workerDisplayTitle={commission.workerDisplayTitle}
        projectName={projectName}
      />
      <NeighborhoodGraph
        graph={graph}
        commissionId={id}
        projectName={projectName}
      />
      <CommissionView
        commissionId={commission.commissionId}
        projectName={projectName}
        prompt={commission.prompt}
        initialStatus={commission.status}
        initialTimeline={timeline}
        initialArtifacts={linkedArtifacts}
      />
    </div>
  );
}
