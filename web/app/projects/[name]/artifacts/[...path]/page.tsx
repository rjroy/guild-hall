import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchDaemon } from "@/web/lib/daemon-api";
import type { Artifact, ArtifactMeta, CommissionMeta } from "@/lib/types";
import ArtifactProvenance from "@/web/components/artifact/ArtifactProvenance";
import type { Attribution } from "@/web/components/artifact/ArtifactProvenance";
import { resolveAttribution } from "@/web/lib/resolve-attribution";
import ArtifactContent from "@/web/components/artifact/ArtifactContent";
import ArtifactDetailLayout from "@/web/components/artifact/ArtifactDetailLayout";
import MetadataSidebar from "@/web/components/artifact/MetadataSidebar";
import ImageArtifactView from "@/web/components/artifact/ImageArtifactView";
import ImageMetadataSidebar from "@/web/components/artifact/ImageMetadataSidebar";
import DaemonError from "@/web/components/ui/DaemonError";
import styles from "./page.module.css";

/** Serialized artifact from daemon (lastModified is ISO string, not Date) */
type SerializedArtifact = Omit<Artifact, "lastModified" | "filePath"> & {
  lastModified: string;
};

interface ImageMetaResponse {
  relativePath: string;
  meta: ArtifactMeta;
  lastModified: string;
  fileSize: number;
  mimeType: string;
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg"]);

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

  // Check if this is an image artifact
  const ext = relativePath.split(".").pop()?.toLowerCase() ?? "";
  const isImage = IMAGE_EXTENSIONS.has(ext);

  if (isImage) {
    const metaResult = await fetchDaemon<ImageMetaResponse>(
      `/workspace/artifact/image/meta?projectName=${encoded}&path=${encodeURIComponent(relativePath)}`,
    );
    if (!metaResult.ok) {
      if (metaResult.error.includes("not found")) {
        notFound();
      }
      return <DaemonError message={metaResult.error} />;
    }
    const { meta, fileSize, mimeType, lastModified } = metaResult.data;
    const imageTitle = meta.title || relativePath;
    const filename = relativePath.split("/").pop() ?? "";

    return (
      <div className={styles.artifactView}>
        <ArtifactProvenance
          projectName={projectName}
          artifactTitle={imageTitle}
          artifactPath={relativePath}
        />
        <ArtifactDetailLayout
          main={
            <ImageArtifactView
              projectName={projectName}
              artifactPath={relativePath}
            />
          }
          sidebar={
            <ImageMetadataSidebar
              filename={filename}
              mimeType={mimeType}
              fileSize={fileSize}
              lastModified={lastModified}
              projectName={projectName}
            />
          }
        />
      </div>
    );
  }

  // Read document artifact from daemon (handles activity worktree resolution)
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

  // Resolve worker attribution from frontmatter extras
  const workersResult = await fetchDaemon<{ workers: Array<{ displayName: string; portraitUrl: string | null }> }>(
    "/system/packages/worker/list",
  );
  const portraitMap = new Map<string, string | null>();
  if (workersResult.ok) {
    for (const w of workersResult.data.workers) {
      portraitMap.set(w.displayName, w.portraitUrl);
    }
  }

  const extras = artifact.meta.extras;
  const resolved = resolveAttribution(extras, portraitMap);
  const attribution: Attribution | undefined = resolved
    ? {
        ...resolved,
        commissionId: associatedCommissions[0]?.commissionId,
        commissionTitle: associatedCommissions[0]?.title || undefined,
      }
    : undefined;

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
      <ArtifactProvenance
        projectName={projectName}
        artifactTitle={displayTitle}
        artifactPath={relativePath}
        attribution={attribution}
      />
      {meetingLink && (
        <div className={styles.meetingBanner}>
          <Link href={meetingLink} className={styles.meetingBannerLink}>
            View Meeting
          </Link>
        </div>
      )}
      <ArtifactDetailLayout
        main={
          <ArtifactContent
            body={artifact.content}
            rawContent={artifact.rawContent ?? ""}
            projectName={projectName}
            artifactPath={artifact.relativePath}
          />
        }
        sidebar={
          <MetadataSidebar
            meta={artifact.meta}
            projectName={projectName}
            artifactPath={relativePath}
            associatedCommissions={associatedCommissions}
          />
        }
      />
    </div>
  );
}
