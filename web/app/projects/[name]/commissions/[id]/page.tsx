import { redirect } from "next/navigation";
import { fetchDaemon } from "@/web/lib/daemon-api";
import {
  resolveModel,
  projectDisplayTitle,
  type AppConfig,
  type ProjectConfig,
  type CommissionMeta,
  type TimelineEntry,
  type DependencyGraph,
} from "@/lib/types";
import CommissionHeader from "@/web/components/commission/CommissionHeader";
import CommissionView from "@/web/components/commission/CommissionView";
import type { ScheduleInfo } from "@/web/components/commission/CommissionView";
import type { TriggerInfoData } from "@/web/components/commission/TriggerInfo";
import NeighborhoodGraph from "@/web/components/commission/NeighborhoodGraph";
import type { CommissionArtifact } from "@/web/components/commission/CommissionLinkedArtifacts";
import DaemonError from "@/web/components/ui/DaemonError";
import styles from "./page.module.css";

/** Shape returned by GET /workers */
interface WorkerInfo {
  name: string;
  displayName: string;
  displayTitle: string;
  portraitUrl: string | null;
  model: { name: string; isLocal: boolean; baseUrl?: string } | null;
}

/** Shape returned by GET /commissions/:id */
interface CommissionDetail {
  commission: CommissionMeta;
  timeline: TimelineEntry[];
  rawContent: string;
  scheduleInfo?: {
    cron: string;
    cronDescription: string;
    repeat: number | null;
    runsCompleted: number;
    lastRun: string | null;
    lastSpawnedId: string | null;
    nextRun: string | null;
  };
  triggerInfo?: {
    match: { type: string; projectName?: string; fields?: Record<string, string> };
    approval: string;
    maxDepth: number;
    runsCompleted: number;
    lastTriggered: string | null;
    lastSpawnedId: string | null;
  };
}

/**
 * Builds linked artifact display objects from commission frontmatter paths.
 * Pure URL construction, no filesystem access.
 */
function buildLinkedArtifacts(
  artifactPaths: string[],
  projectName: string,
): CommissionArtifact[] {
  const encodedProject = encodeURIComponent(projectName);
  return artifactPaths.map((artifactPath) => {
    const title =
      artifactPath.split("/").pop()?.replace(/\.md$/, "") || artifactPath;
    return {
      path: artifactPath,
      title,
      href: `/projects/${encodedProject}/artifacts/${artifactPath}`,
    };
  });
}

export default async function CommissionPage({
  params,
}: {
  params: Promise<{ name: string; id: string }>;
}) {
  const { name: rawName, id } = await params;
  const projectName = decodeURIComponent(rawName);
  const encoded = encodeURIComponent(projectName);

  // Fetch commission detail, workers, config, graph, and all commissions in parallel
  const [detailResult, workersResult, configResult, graphResult, allCommissionsResult, projectResult] =
    await Promise.all([
      fetchDaemon<CommissionDetail>(`/commission/request/commission/read?commissionId=${encodeURIComponent(id)}&projectName=${encoded}`),
      fetchDaemon<{ workers: WorkerInfo[] }>("/system/packages/worker/list"),
      fetchDaemon<AppConfig>("/system/config/application/read"),
      fetchDaemon<DependencyGraph>(`/commission/dependency/project/graph?projectName=${encoded}`),
      fetchDaemon<{ commissions: CommissionMeta[] }>(`/commission/request/commission/list?projectName=${encoded}`),
      fetchDaemon<ProjectConfig>(`/system/config/project/read?name=${encoded}`),
    ]);
  const projectTitle = projectResult.ok ? projectDisplayTitle(projectResult.data) : projectName;

  if (!detailResult.ok) {
    if (detailResult.error.includes("not found")) {
      redirect(`/projects/${encoded}?tab=commissions`);
    }
    return <DaemonError message={detailResult.error} />;
  }

  const { commission, timeline, scheduleInfo: rawScheduleInfo, triggerInfo: rawTriggerInfo } = detailResult.data;
  const linkedArtifacts = buildLinkedArtifacts(commission.linked_artifacts, projectName);
  const allCommissions = allCommissionsResult.ok
    ? allCommissionsResult.data.commissions
    : [];

  // Build schedule info with recent runs from all commissions
  let scheduleInfo: ScheduleInfo | undefined;
  if (rawScheduleInfo) {
    const spawned = allCommissions
      .filter((c) => c.sourceSchedule === id)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);

    scheduleInfo = {
      ...rawScheduleInfo,
      recentRuns: spawned.map((c) => ({
        commissionId: c.commissionId,
        status: c.status,
        date: c.date,
      })),
    };
  }

  // Build trigger info with recent spawns from all commissions
  let triggerInfo: TriggerInfoData | undefined;
  if (rawTriggerInfo) {
    const spawned = allCommissions
      .filter((c) => c.sourceTrigger === id)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);

    triggerInfo = {
      ...rawTriggerInfo,
      recentSpawns: spawned.map((c) => ({
        commissionId: c.commissionId,
        status: c.status,
        date: c.date,
      })),
    };
  }

  // Resolve effective model from worker packages and commission overrides
  const workers = workersResult.ok ? workersResult.data.workers : [];
  const workerInfo = workers.find((w) => w.displayName === commission.worker);
  const workerDefaultModel = workerInfo?.model?.name;
  const effectiveModel = commission.resource_overrides.model ?? workerDefaultModel ?? "opus";
  const isModelOverride =
    commission.resource_overrides.model != null &&
    commission.resource_overrides.model !== workerDefaultModel;

  // Determine model provenance (REQ-LOCAL-25)
  const config = configResult.ok ? configResult.data : undefined;
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

  const graph = graphResult.ok ? graphResult.data : { nodes: [], edges: [] };

  return (
    <div className={styles.commissionView}>
      <CommissionHeader
        title={commission.title}
        status={commission.status}
        worker={commission.worker}
        workerDisplayTitle={commission.workerDisplayTitle}
        projectName={projectName}
        projectTitle={projectTitle}
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
        triggerInfo={triggerInfo}
      />
    </div>
  );
}
