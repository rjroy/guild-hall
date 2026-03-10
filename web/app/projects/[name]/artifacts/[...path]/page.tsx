import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/config";
import { readArtifact } from "@/lib/artifacts";
import { scanCommissions } from "@/lib/commissions";
import {
  projectLorePath,
  getGuildHallHome,
  integrationWorktreePath,
  resolveMeetingBasePath,
  resolveCommissionBasePath,
} from "@/lib/paths";
import ArtifactProvenance from "@/web/components/artifact/ArtifactProvenance";
import ArtifactContent from "@/web/components/artifact/ArtifactContent";
import MetadataSidebar from "@/web/components/artifact/MetadataSidebar";
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

  const ghHome = getGuildHallHome();

  // Active meetings and commissions live in their activity worktree,
  // not the integration worktree. Check daemon state to resolve the
  // correct read path, mirroring resolveWritePath on the daemon side.
  let basePath: string;
  if (relativePath.startsWith("meetings/")) {
    const filename = relativePath.split("/").pop() ?? "";
    const meetingId = filename.replace(/\.md$/, "");
    basePath = await resolveMeetingBasePath(ghHome, projectName, meetingId);
  } else if (relativePath.startsWith("commissions/")) {
    const filename = relativePath.split("/").pop() ?? "";
    const commissionId = filename.replace(/\.md$/, "");
    basePath = await resolveCommissionBasePath(ghHome, projectName, commissionId);
  } else {
    basePath = integrationWorktreePath(ghHome, projectName);
  }

  const lorePath = projectLorePath(basePath);
  let artifact;
  try {
    artifact = await readArtifact(lorePath, relativePath);
  } catch {
    notFound();
  }

  const displayTitle = artifact.meta.title || relativePath;

  // Find commissions that reference this artifact (always scan from
  // integration worktree which has the complete commission set)
  const integrationLore = projectLorePath(integrationWorktreePath(ghHome, projectName));
  const allCommissions = await scanCommissions(integrationLore, projectName);
  const associatedCommissions = allCommissions.filter((c) =>
    c.linked_artifacts.includes(relativePath),
  );

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
          artifactPath={relativePath}
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
          rawContent={artifact.rawContent ?? ""}
          projectName={projectName}
          artifactPath={artifact.relativePath}
        />
      </div>
      <div className={styles.sidebar}>
        <MetadataSidebar
          meta={artifact.meta}
          projectName={projectName}
          artifactPath={relativePath}
          associatedCommissions={associatedCommissions}
        />
      </div>
    </div>
  );
}
