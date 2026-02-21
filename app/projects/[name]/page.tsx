import { getProject } from "@/lib/config";
import { scanArtifacts } from "@/lib/artifacts";
import { projectLorePath } from "@/lib/paths";
import { notFound } from "next/navigation";
import ProjectHeader from "@/components/project/ProjectHeader";
import ProjectTabs from "@/components/project/ProjectTabs";
import ArtifactList from "@/components/project/ArtifactList";
import EmptyState from "@/components/ui/EmptyState";
import Panel from "@/components/ui/Panel";
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

  return (
    <div className={styles.projectView}>
      <ProjectHeader project={project} />
      <ProjectTabs projectName={projectName} activeTab={tab} />
      <div className={styles.tabContent}>
        {tab === "artifacts" && (
          <ArtifactList artifacts={artifacts} projectName={projectName} />
        )}
        {tab === "commissions" && (
          <Panel>
            <EmptyState message="No commissions yet." />
          </Panel>
        )}
        {tab === "meetings" && (
          <Panel>
            <EmptyState message="No meetings yet." />
          </Panel>
        )}
      </div>
    </div>
  );
}
