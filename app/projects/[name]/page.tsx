import * as path from "node:path";
import { getProject } from "@/lib/config";
import { scanArtifacts } from "@/lib/artifacts";
import { scanCommissions } from "@/lib/commissions";
import { buildDependencyGraph } from "@/lib/dependency-graph";
import { getActiveMeetingWorktrees } from "@/lib/meetings";
import { projectLorePath, getGuildHallHome, integrationWorktreePath } from "@/lib/paths";
import { notFound } from "next/navigation";
import ProjectHeader from "@/components/project/ProjectHeader";
import ProjectTabs from "@/components/project/ProjectTabs";
import ArtifactList from "@/components/project/ArtifactList";
import MeetingList from "@/components/project/MeetingList";
import CommissionList from "@/components/commission/CommissionList";
import CommissionGraph from "@/components/dashboard/CommissionGraph";
import CreateCommissionButton from "@/components/commission/CreateCommissionButton";
import styles from "./page.module.css";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { name: rawName } = await params;
  const { tab = "artifacts" } = await searchParams;

  const projectName = decodeURIComponent(rawName);
  const project = await getProject(projectName);
  if (!project) notFound();

  const ghHome = getGuildHallHome();
  const integrationPath = integrationWorktreePath(ghHome, projectName);
  const lorePath = projectLorePath(integrationPath);
  const artifacts = await scanArtifacts(lorePath);

  // Scan meetings from integration worktree (closed/merged meetings)
  const meetingsPath = path.join(lorePath, "meetings");
  const integrationMeetings = await scanArtifacts(meetingsPath);

  // Scan meetings from active meeting worktrees (open meetings live
  // in their activity worktree and aren't in the integration worktree yet)
  const activeWorktrees = await getActiveMeetingWorktrees(ghHome, projectName);
  const activeMeetingArrays = await Promise.all(
    activeWorktrees.map((wt) => scanArtifacts(path.join(wt, ".lore", "meetings"))),
  );
  const activeMeetings = activeMeetingArrays.flat();

  // Merge, deduplicating by filename in case a meeting appears in both
  const seenIds = new Set(integrationMeetings.map((m) => m.relativePath));
  const meetingArtifacts = [
    ...integrationMeetings,
    ...activeMeetings.filter((m) => !seenIds.has(m.relativePath)),
  ].sort((a, b) => {
    // Open meetings first, then by date descending
    const aOpen = a.meta.status === "open" ? 0 : 1;
    const bOpen = b.meta.status === "open" ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return (b.meta.date || "").localeCompare(a.meta.date || "");
  });

  const commissions = await scanCommissions(lorePath, projectName);
  const commissionGraph = buildDependencyGraph(commissions);

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
              <CreateCommissionButton projectName={projectName} />
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
