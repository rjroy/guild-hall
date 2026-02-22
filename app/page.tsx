import { readConfig } from "@/lib/config";
import { recentArtifacts } from "@/lib/artifacts";
import { projectLorePath } from "@/lib/paths";
import { scanMeetingRequests } from "@/lib/meetings";
import type { Artifact } from "@/lib/types";
import type { MeetingMeta } from "@/lib/meetings";
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

  // Scan meeting requests from all registered projects
  const requestsByProject = await Promise.all(
    config.projects.map((project) =>
      scanMeetingRequests(projectLorePath(project.path), project.name),
    ),
  );
  const allRequests: MeetingMeta[] = requestsByProject.flat();

  // Sort merged list: active (no deferred_until) first, then by date descending
  allRequests.sort((a, b) => {
    const aDeferEmpty = !a.deferred_until;
    const bDeferEmpty = !b.deferred_until;

    if (aDeferEmpty && !bDeferEmpty) return -1;
    if (!aDeferEmpty && bDeferEmpty) return 1;

    if (!aDeferEmpty && !bDeferEmpty) {
      const deferCmp = a.deferred_until.localeCompare(b.deferred_until);
      if (deferCmp !== 0) return deferCmp;
    }

    return b.date.localeCompare(a.date);
  });

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
        <PendingAudiences requests={allRequests} />
      </div>
    </div>
  );
}
