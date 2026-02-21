import { notFound } from "next/navigation";
import { getProject } from "@/lib/config";
import { readArtifact } from "@/lib/artifacts";
import { projectLorePath } from "@/lib/paths";
import ArtifactBreadcrumb from "@/components/artifact/ArtifactBreadcrumb";
import ArtifactProvenance from "@/components/artifact/ArtifactProvenance";
import ArtifactContent from "@/components/artifact/ArtifactContent";
import MetadataSidebar from "@/components/artifact/MetadataSidebar";
import styles from "./page.module.css";

export default async function ArtifactPage({
  params,
}: {
  params: Promise<{ name: string; path: string[] }>;
}) {
  const { name: rawName, path: pathSegments } = await params;
  const projectName = decodeURIComponent(rawName);
  const relativePath = pathSegments.map(decodeURIComponent).join("/");

  const project = await getProject(projectName);
  if (!project) notFound();

  const lorePath = projectLorePath(project.path);
  let artifact;
  try {
    artifact = await readArtifact(lorePath, relativePath);
  } catch {
    notFound();
  }

  const displayTitle = artifact.meta.title || relativePath;

  return (
    <div className={styles.artifactView}>
      <div className={styles.main}>
        <ArtifactBreadcrumb
          projectName={projectName}
          artifactTitle={displayTitle}
        />
        <ArtifactProvenance />
        <ArtifactContent
          body={artifact.content}
          projectName={projectName}
          artifactPath={artifact.relativePath}
        />
      </div>
      <div className={styles.sidebar}>
        <MetadataSidebar
          meta={artifact.meta}
          projectName={projectName}
        />
      </div>
    </div>
  );
}
