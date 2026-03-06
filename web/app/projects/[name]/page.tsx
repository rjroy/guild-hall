import * as path from "node:path";
import { getProject } from "@/lib/config";
import { scanArtifacts } from "@/lib/artifacts";
import { scanCommissions } from "@/lib/commissions";
import { buildDependencyGraph } from "@/lib/dependency-graph";
import { getActiveMeetingWorktrees, sortMeetingArtifacts } from "@/lib/meetings";
import { projectLorePath, getGuildHallHome, integrationWorktreePath } from "@/lib/paths";
import { notFound } from "next/navigation";
import ProjectHeader from "@/web/components/project/ProjectHeader";
import ProjectTabs from "@/web/components/project/ProjectTabs";
import ArtifactList from "@/web/components/project/ArtifactList";
import MeetingList from "@/web/components/project/MeetingList";
import CommissionList from "@/web/components/commission/CommissionList";
import CommissionGraph from "@/web/components/dashboard/CommissionGraph";
import CreateCommissionButton from "@/web/components/commission/CreateCommissionButton";
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
  const mergedMeetings = [
    ...integrationMeetings,
    ...activeMeetings.filter((m) => !seenIds.has(m.relativePath)),
  ];
  const meetingArtifacts = sortMeetingArtifacts(mergedMeetings);

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
