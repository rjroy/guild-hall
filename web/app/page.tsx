import { fetchDaemon } from "@/web/lib/daemon-api";
import type { AppConfig, Artifact, ArtifactWithProject, CommissionMeta, MeetingMeta } from "@/lib/types";
import WorkspaceSidebar from "@/web/components/dashboard/WorkspaceSidebar";
import ManagerBriefing from "@/web/components/dashboard/ManagerBriefing";
import DependencyMap from "@/web/components/dashboard/DependencyMap";
import RecentArtifacts from "@/web/components/dashboard/RecentArtifacts";
import PendingAudiences from "@/web/components/dashboard/PendingAudiences";
import DaemonError from "@/web/components/ui/DaemonError";
import styles from "./page.module.css";

/** Shape returned by GET /workers */
interface WorkerInfo {
  name: string;
  displayName: string;
  displayTitle: string;
  portraitUrl: string | null;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project: selectedProject } = await searchParams;

  const configResult = await fetchDaemon<AppConfig>("/system/config/application/read");
  if (!configResult.ok) {
    return <DaemonError message={configResult.error} />;
  }
  const config = configResult.data;

  // Fetch recent artifacts: single project or merged across all projects
  let artifacts: ArtifactWithProject[] = [];
  if (selectedProject) {
    const artResult = await fetchDaemon<{ artifacts: Artifact[] }>(
      `/workspace/artifact/document/list?projectName=${encodeURIComponent(selectedProject)}&recent=true&limit=10`,
    );
    if (artResult.ok) {
      artifacts = artResult.data.artifacts.map((a) => ({ ...a, projectName: selectedProject }));
    }
  } else {
    const perProjectArtifacts = await Promise.all(
      config.projects.map(async (p) => {
        const r = await fetchDaemon<{ artifacts: Artifact[] }>(
          `/workspace/artifact/document/list?projectName=${encodeURIComponent(p.name)}&recent=true&limit=10`,
        );
        if (!r.ok) return [];
        return r.data.artifacts.map((a) => ({ ...a, projectName: p.name }));
      }),
    );
    artifacts = perProjectArtifacts
      .flat()
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
      .slice(0, 10);
  }

  // Fetch commissions and meeting requests for all projects in parallel
  const [commissionResults, meetingResults, workersResult] = await Promise.all([
    Promise.all(
      config.projects.map((p) =>
        fetchDaemon<{ commissions: CommissionMeta[] }>(
          `/commission/request/commission/list?projectName=${encodeURIComponent(p.name)}`,
        ),
      ),
    ),
    Promise.all(
      config.projects.map((p) =>
        fetchDaemon<{ meetings: MeetingMeta[] }>(
          `/meeting/request/meeting/list?projectName=${encodeURIComponent(p.name)}`,
        ),
      ),
    ),
    fetchDaemon<{ workers: WorkerInfo[] }>("/system/packages/worker/list"),
  ]);

  const allCommissions: CommissionMeta[] = commissionResults
    .filter((r) => r.ok)
    .flatMap((r) => (r as { ok: true; data: { commissions: CommissionMeta[] } }).data.commissions);

  // Daemon returns meeting requests pre-sorted (REQ-SORT-11)
  const allRequests: MeetingMeta[] = meetingResults
    .filter((r) => r.ok)
    .flatMap((r) => (r as { ok: true; data: { meetings: MeetingMeta[] } }).data.meetings);

  // Build portraits record from workers endpoint (REQ-WID-10)
  const workerPortraits: Record<string, string> = {};
  if (workersResult.ok) {
    for (const w of workersResult.data.workers) {
      if (w.portraitUrl) {
        workerPortraits[w.displayName] = w.portraitUrl;
      }
    }
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
        <ManagerBriefing projectName={selectedProject ?? config.projects[0]?.name} />
      </div>
      <div className={styles.depMap}>
        <DependencyMap commissions={allCommissions} selectedProject={selectedProject} />
      </div>
      <div className={styles.recentArtifacts}>
        <RecentArtifacts
          artifacts={artifacts}
          selectedProject={selectedProject}
        />
      </div>
      <div className={styles.audiences}>
        <PendingAudiences
          requests={selectedProject ? allRequests.filter((r) => r.projectName === selectedProject) : allRequests}
          workerPortraits={workerPortraits}
        />
      </div>
    </div>
  );
}
