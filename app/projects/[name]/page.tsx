import * as path from "node:path";
import { getProject } from "@/lib/config";
import { scanArtifacts } from "@/lib/artifacts";
import { scanCommissions } from "@/lib/commissions";
import { projectLorePath } from "@/lib/paths";
import { notFound } from "next/navigation";
import ProjectHeader from "@/components/project/ProjectHeader";
import ProjectTabs from "@/components/project/ProjectTabs";
import ArtifactList from "@/components/project/ArtifactList";
import MeetingList from "@/components/project/MeetingList";
import CommissionList from "@/components/commission/CommissionList";
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

  const lorePath = projectLorePath(project.path);
  const artifacts = await scanArtifacts(lorePath);

  const meetingsPath = path.join(lorePath, "meetings");
  const meetingArtifacts = await scanArtifacts(meetingsPath);
  const commissions = await scanCommissions(lorePath, projectName);

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
