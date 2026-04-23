import { notFound } from "next/navigation";
import { fetchDaemon } from "@/apps/web/lib/daemon-api";
import type { ProjectConfig, Artifact, CommissionMeta } from "@/lib/types";
import ProjectHeader from "@/apps/web/components/project/ProjectHeader";
import ProjectTabs from "@/apps/web/components/project/ProjectTabs";
import ArtifactList from "@/apps/web/components/project/ArtifactList";
import MeetingList from "@/apps/web/components/project/MeetingList";
import CommissionList from "@/apps/web/components/commission/CommissionList";
import CreateCommissionButton from "@/apps/web/components/commission/CreateCommissionButton";
import CreateMeetingButton from "@/apps/web/components/meeting/CreateMeetingButton";
import CommitLoreButton from "@/apps/web/components/project/CommitLoreButton";
import NewIssueButton from "@/apps/web/components/project/NewIssueButton";
import DaemonError from "@/apps/web/components/ui/DaemonError";
import styles from "./page.module.css";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ tab?: string; newCommission?: string; dep?: string; newMeeting?: string; artifact?: string }>;
}) {
  const { name: rawName } = await params;
  const { tab = "artifacts", newCommission, dep, newMeeting, artifact } = await searchParams;

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
  const [artifactsResult, meetingsResult, commissionsResult, loreStatusResult] = await Promise.all([
    fetchDaemon<{ artifacts: Artifact[] }>(`/workspace/artifact/document/list?projectName=${encoded}`),
    // view=artifacts returns all meetings as Artifact[] with active worktree merging, pre-sorted
    fetchDaemon<{ meetings: Artifact[] }>(`/meeting/request/meeting/list?projectName=${encoded}&view=artifacts`),
    fetchDaemon<{ commissions: CommissionMeta[] }>(`/commission/request/commission/list?projectName=${encoded}`),
    fetchDaemon<{ hasPendingChanges: boolean; fileCount: number }>(
      `/workspace/git/lore/status?projectName=${encoded}`
    ),
  ]);

  const artifacts = artifactsResult.ok ? artifactsResult.data.artifacts : [];
  const meetingArtifacts = meetingsResult.ok ? meetingsResult.data.meetings : [];
  const commissions = commissionsResult.ok ? commissionsResult.data.commissions : [];
  const hasPendingChanges = loreStatusResult.ok ? loreStatusResult.data.hasPendingChanges : false;
  const pendingFileCount = loreStatusResult.ok ? loreStatusResult.data.fileCount : 0;

  return (
    <div className={styles.projectView}>
      <ProjectHeader project={project} />
      <ProjectTabs projectName={projectName} activeTab={tab} />
      <div className={styles.tabContent}>
        {tab === "artifacts" && (
          <div className={styles.artifactTab}>
            <div className={styles.artifactActions}>
              <NewIssueButton projectName={projectName} />
              <CommitLoreButton
                projectName={projectName}
                hasPendingChanges={hasPendingChanges}
                pendingFileCount={pendingFileCount}
              />
            </div>
            <ArtifactList artifacts={artifacts} projectName={projectName} />
          </div>
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
            <CommissionList commissions={commissions} projectName={projectName} />
          </div>
        )}
        {tab === "meetings" && (
          <div className={styles.meetingTab}>
            <div className={styles.meetingActions}>
              <CreateMeetingButton
                projectName={projectName}
                defaultOpen={newMeeting === "true"}
                initialArtifact={artifact}
              />
            </div>
            <MeetingList meetings={meetingArtifacts} projectName={projectName} />
          </div>
        )}
      </div>
    </div>
  );
}
