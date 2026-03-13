import { notFound } from "next/navigation";
import { fetchDaemon } from "@/web/lib/daemon-api";
import type { ProjectConfig, Artifact, CommissionMeta, DependencyGraph } from "@/lib/types";
import ProjectHeader from "@/web/components/project/ProjectHeader";
import ProjectTabs from "@/web/components/project/ProjectTabs";
import ArtifactList from "@/web/components/project/ArtifactList";
import MeetingList from "@/web/components/project/MeetingList";
import CommissionList from "@/web/components/commission/CommissionList";
import CommissionGraph from "@/web/components/dashboard/CommissionGraph";
import CreateCommissionButton from "@/web/components/commission/CreateCommissionButton";
import DaemonError from "@/web/components/ui/DaemonError";
import styles from "./page.module.css";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ tab?: string; newCommission?: string; dep?: string }>;
}) {
  const { name: rawName } = await params;
  const { tab = "artifacts", newCommission, dep } = await searchParams;

  const projectName = decodeURIComponent(rawName);
  const encoded = encodeURIComponent(projectName);

  const projectResult = await fetchDaemon<ProjectConfig>(`/system/config/project/read?name=${encoded}`);
  if (!projectResult.ok) {
    // 404 from daemon means project doesn't exist
    if (projectResult.error.includes("not found")) {
      notFound();
    }
    return <DaemonError message={projectResult.error} />;
  }
  const project = projectResult.data;

  // Fetch all data in parallel
  const [artifactsResult, meetingsResult, commissionsResult, graphResult] = await Promise.all([
    fetchDaemon<{ artifacts: Artifact[] }>(`/workspace/artifact/document/list?projectName=${encoded}`),
    // view=artifacts returns all meetings as Artifact[] with active worktree merging, pre-sorted
    fetchDaemon<{ meetings: Artifact[] }>(`/meeting/request/meeting/list?projectName=${encoded}&view=artifacts`),
    fetchDaemon<{ commissions: CommissionMeta[] }>(`/commission/request/commission/list?projectName=${encoded}`),
    fetchDaemon<DependencyGraph>(`/commission/dependency/project/graph?projectName=${encoded}`),
  ]);

  const artifacts = artifactsResult.ok ? artifactsResult.data.artifacts : [];
  const meetingArtifacts = meetingsResult.ok ? meetingsResult.data.meetings : [];
  const commissions = commissionsResult.ok ? commissionsResult.data.commissions : [];
  const commissionGraph = graphResult.ok ? graphResult.data : { nodes: [], edges: [] };

  return (
    <div className={styles.projectView}>
      <ProjectHeader project={project} />
      <ProjectTabs projectName={projectName} activeTab={tab} />
      <div className={styles.tabContent}>
        {tab === "artifacts" && (
          <ArtifactList artifacts={artifacts} projectName={projectName} />
        )}
        {tab === "commissions" && (
          <div className={styles.commissionTab}>
            <div className={styles.commissionActions}>
              <CreateCommissionButton
                projectName={projectName}
                defaultOpen={newCommission === "true"}
                initialDependencies={dep}
              />
            </div>
            {commissionGraph.edges.length > 0 && (
              <CommissionGraph
                graph={commissionGraph}
                compact
                projectName={projectName}
              />
            )}
            <CommissionList commissions={commissions} projectName={projectName} />
          </div>
        )}
        {tab === "meetings" && (
          <MeetingList meetings={meetingArtifacts} projectName={projectName} />
        )}
      </div>
    </div>
  );
}
