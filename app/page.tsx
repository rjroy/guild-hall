import { readConfig } from "@/lib/config";
import { recentArtifacts } from "@/lib/artifacts";
import { projectLorePath } from "@/lib/paths";
import type { Artifact } from "@/lib/types";
import WorkspaceSidebar from "@/components/dashboard/WorkspaceSidebar";
import ManagerBriefing from "@/components/dashboard/ManagerBriefing";
import DependencyMap from "@/components/dashboard/DependencyMap";
import RecentArtifacts from "@/components/dashboard/RecentArtifacts";
import PendingAudiences from "@/components/dashboard/PendingAudiences";
import styles from "./page.module.css";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project: selectedProject } = await searchParams;
  const config = await readConfig();

  const selectedConfig = selectedProject
    ? config.projects.find((p) => p.name === selectedProject)
    : undefined;

  let artifacts: Artifact[] = [];
  if (selectedConfig) {
    const lorePath = projectLorePath(selectedConfig.path);
    artifacts = await recentArtifacts(lorePath, 10);
  }

  return (
    <div className={styles.dashboard}>
      <div className={styles.sidebar}>
        <WorkspaceSidebar
          projects={config.projects}
          selectedProject={selectedProject}
        />
      </div>
      <div className={styles.briefing}>
        <ManagerBriefing />
      </div>
      <div className={styles.depMap}>
        <DependencyMap />
      </div>
      <div className={styles.recentArtifacts}>
        <RecentArtifacts
          artifacts={artifacts}
          projectName={selectedProject}
        />
      </div>
      <div className={styles.audiences}>
        <PendingAudiences />
      </div>
    </div>
  );
}
