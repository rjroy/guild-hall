import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/config";
import { readArtifact } from "@/lib/artifacts";
import { projectLorePath } from "@/lib/paths";
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

  // For open meeting artifacts, show a link to the live meeting view
  const isMeeting = relativePath.startsWith("meetings/");
  const isOpen =
    artifact.meta.status.toLowerCase().trim() === "open";
  let meetingLink: string | null = null;
  if (isMeeting && isOpen) {
    const filename = relativePath.split("/").pop() ?? "";
    const meetingId = filename.replace(/\.md$/, "");
    meetingLink = `/projects/${encodeURIComponent(projectName)}/meetings/${encodeURIComponent(meetingId)}`;
  }

  return (
    <div className={styles.artifactView}>
      <div className={styles.main}>
        <ArtifactProvenance
          projectName={projectName}
          artifactTitle={displayTitle}
        />
        {meetingLink && (
          <div className={styles.meetingBanner}>
            <Link href={meetingLink} className={styles.meetingBannerLink}>
              View Meeting
            </Link>
          </div>
        )}
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
