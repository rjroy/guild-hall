import * as fs from "node:fs/promises";
import * as path from "node:path";
import { redirect } from "next/navigation";
import matter from "gray-matter";
import { getProject, readConfig } from "@/lib/config";
import { projectLorePath, getGuildHallHome, resolveCommissionBasePath, integrationWorktreePath } from "@/lib/paths";
import {
  readCommissionMeta,
  scanCommissions,
  parseActivityTimeline,
  type CommissionMeta,
} from "@/lib/commissions";
import { nextOccurrence } from "@/daemon/services/scheduler/cron";
import { describeCron } from "@/lib/cron-utils";
import { buildDependencyGraph } from "@/lib/dependency-graph";
import { discoverPackages, getWorkerByName } from "@/lib/packages";
import { resolveModel, type WorkerMetadata } from "@/lib/types";
import CommissionHeader from "@/web/components/commission/CommissionHeader";
import CommissionView from "@/web/components/commission/CommissionView";
import type { ScheduleInfo } from "@/web/components/commission/CommissionView";
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

  // Parse schedule metadata for scheduled commissions.
  let scheduleInfo: ScheduleInfo | undefined;
  if (commission.type === "scheduled") {
    const parsed = matter(rawContent);
    const sched = parsed.data.schedule as Record<string, unknown> | undefined;
    if (sched && typeof sched === "object") {
      const lastRun = sched.last_run;
      let lastRunStr: string | null = null;
      if (lastRun instanceof Date) {
        lastRunStr = lastRun.toISOString();
      } else if (typeof lastRun === "string" && lastRun) {
        lastRunStr = lastRun;
      }

      const cronExpr = typeof sched.cron === "string" ? sched.cron : "";

      // Compute next expected run
      let nextRunStr: string | null = null;
      if (cronExpr) {
        const referenceDate = lastRunStr ? new Date(lastRunStr) : new Date(0);
        const nextDate = nextOccurrence(cronExpr, referenceDate);
        if (nextDate) {
          nextRunStr = nextDate.toISOString();
        }
      }

      scheduleInfo = {
        cron: cronExpr,
        cronDescription: describeCron(cronExpr),
        repeat: typeof sched.repeat === "number" ? sched.repeat : null,
        runsCompleted: typeof sched.runs_completed === "number" ? sched.runs_completed : 0,
        lastRun: lastRunStr,
        lastSpawnedId: typeof sched.last_spawned_id === "string" ? sched.last_spawned_id : null,
        nextRun: nextRunStr,
        recentRuns: [], // populated below after allCommissions is scanned
      };
    }
  }

  // Resolve the effective model for display. Commission override takes
  // precedence over the worker's default, which falls back to "opus".
  const defaultPackagesDir = path.join(ghHome, "packages");
  const packages = await discoverPackages([defaultPackagesDir]);
  const workerPkg = getWorkerByName(packages, commission.worker);
  const workerDefaultModel = workerPkg
    ? (workerPkg.metadata as WorkerMetadata).model
    : undefined;
  const effectiveModel = commission.resource_overrides.model ?? workerDefaultModel ?? "opus";
  const isModelOverride = commission.resource_overrides.model != null
    && commission.resource_overrides.model !== workerDefaultModel;

  // Determine model provenance (REQ-LOCAL-25)
  const config = await readConfig();
  let isLocalModel = false;
  let localModelBaseUrl: string | undefined;
  try {
    const resolved = resolveModel(effectiveModel, config);
    if (resolved.type === "local") {
      isLocalModel = true;
      localModelBaseUrl = resolved.definition.baseUrl;
    }
  } catch {
    // Unknown model name; display as-is without provenance
  }

  // Build dependency graph from all commissions in the project
  // to show the neighborhood (direct deps and dependents) for this commission.
  const integrationPath = integrationWorktreePath(ghHome, projectName);
  const integrationLorePath = projectLorePath(integrationPath);
  const allCommissions = await scanCommissions(integrationLorePath, projectName);
  const graph = buildDependencyGraph(allCommissions);

  // Populate recent runs for scheduled commissions
  if (scheduleInfo) {
    const spawned = allCommissions
      .filter((c: CommissionMeta) => c.sourceSchedule === id)
      .sort((a: CommissionMeta, b: CommissionMeta) => b.date.localeCompare(a.date))
      .slice(0, 10);

    scheduleInfo.recentRuns = spawned.map((c: CommissionMeta) => ({
      commissionId: c.commissionId,
      status: c.status,
      date: c.date,
    }));
  }

  return (
    <div className={styles.commissionView}>
      <CommissionHeader
        title={commission.title}
        status={commission.status}
        worker={commission.worker}
        workerDisplayTitle={commission.workerDisplayTitle}
        projectName={projectName}
        model={effectiveModel}
        isModelOverride={isModelOverride}
        isLocalModel={isLocalModel}
        localModelBaseUrl={localModelBaseUrl}
        commissionType={commission.type}
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
        commissionType={commission.type}
        scheduleInfo={scheduleInfo}
      />
    </div>
  );
}
