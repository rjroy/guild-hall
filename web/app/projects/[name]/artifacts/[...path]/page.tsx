import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchDaemon } from "@/web/lib/daemon-api";
import type { Artifact, CommissionMeta } from "@/lib/types";
import ArtifactProvenance from "@/web/components/artifact/ArtifactProvenance";
import ArtifactContent from "@/web/components/artifact/ArtifactContent";
import MetadataSidebar from "@/web/components/artifact/MetadataSidebar";
import DaemonError from "@/web/components/ui/DaemonError";
import styles from "./page.module.css";

/** Serialized artifact from daemon (lastModified is ISO string, not Date) */
type SerializedArtifact = Omit<Artifact, "lastModified" | "filePath"> & {
  lastModified: string;
};

export default async function ArtifactPage({
  params,
}: {
  params: Promise<{ name: string; path: string[] }>;
}) {
  const { name: rawName, path: pathSegments } = await params;
  const projectName = decodeURIComponent(rawName);
  const relativePath = pathSegments.map(decodeURIComponent).join("/");
  const encoded = encodeURIComponent(projectName);

  // Verify project exists
  const projectResult = await fetchDaemon<Record<string, unknown>>(`/system/config/project/read?name=${encoded}`);
  if (!projectResult.ok) {
    if (projectResult.error.includes("not found")) {
      notFound();
    }
    return <DaemonError message={projectResult.error} />;
  }

  // Read artifact from daemon (handles activity worktree resolution)
  const artifactResult = await fetchDaemon<SerializedArtifact>(
    `/workspace/artifact/document/read?projectName=${encoded}&path=${relativePath}`,
  );
  if (!artifactResult.ok) {
    if (artifactResult.error.includes("not found")) {
      notFound();
    }
    return <DaemonError message={artifactResult.error} />;
  }
  const artifact = artifactResult.data;

  const displayTitle = artifact.meta.title || relativePath;

  // Find commissions that reference this artifact
  const commissionsResult = await fetchDaemon<{ commissions: CommissionMeta[] }>(
    `/commission/request/commission/list?projectName=${encoded}`,
  );
  const allCommissions = commissionsResult.ok ? commissionsResult.data.commissions : [];
  const associatedCommissions = allCommissions.filter((c) =>
    c.linked_artifacts.includes(relativePath),
  );

  // For open meeting artifacts, show a link to the live meeting view
  const isMeeting = relativePath.startsWith("meetings/");
  const isOpen = artifact.meta.status.toLowerCase().trim() === "open";
  let meetingLink: string | null = null;
  if (isMeeting && isOpen) {
    const filename = relativePath.split("/").pop() ?? "";
    const meetingId = filename.replace(/\.md$/, "");
    meetingLink = `/projects/${encoded}/meetings/${encodeURIComponent(meetingId)}`;
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
