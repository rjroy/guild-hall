import { redirect } from "next/navigation";
import { fetchDaemon } from "@/web/lib/daemon-api";
import type { MeetingMeta, TranscriptChatMessage } from "@/lib/types";
import MeetingHeader from "@/web/components/meeting/MeetingHeader";
import MeetingView from "@/web/components/meeting/MeetingView";
import Panel from "@/web/components/ui/Panel";
import type { LinkedArtifact } from "@/web/components/meeting/ArtifactsPanel";
import DaemonError from "@/web/components/ui/DaemonError";
import styles from "./page.module.css";

/** Shape returned by GET /workers */
interface WorkerInfo {
  name: string;
  displayName: string;
  displayTitle: string;
  portraitUrl: string | null;
  model: { name: string; isLocal: boolean; baseUrl?: string } | null;
}

/** Shape returned by GET /meetings/:id */
interface MeetingDetail {
  meeting: MeetingMeta;
  transcript: string;
  parsedMessages: TranscriptChatMessage[];
}

/**
 * Builds linked artifact display objects from meeting frontmatter paths.
 * Pure URL construction. Sets exists=true optimistically (the UI handles
 * missing artifact links gracefully).
 */
function buildLinkedArtifacts(
  artifactPaths: string[],
  projectName: string,
): LinkedArtifact[] {
  const encodedProject = encodeURIComponent(projectName);
  return artifactPaths.map((artifactPath) => {
    const title =
      artifactPath.split("/").pop()?.replace(/\.md$/, "") || artifactPath;
    return {
      path: artifactPath,
      title,
      exists: true,
      href: `/projects/${encodedProject}/artifacts/${artifactPath}`,
    };
  });
}

export default async function MeetingPage({
  params,
}: {
  params: Promise<{ name: string; id: string }>;
}) {
  const { name: rawName, id } = await params;
  const projectName = decodeURIComponent(rawName);
  const encoded = encodeURIComponent(projectName);

  // Fetch meeting detail and workers in parallel
  const [detailResult, workersResult] = await Promise.all([
    fetchDaemon<MeetingDetail>(
      `/meeting/request/meeting/read?meetingId=${encodeURIComponent(id)}&projectName=${encoded}`,
    ),
    fetchDaemon<{ workers: WorkerInfo[] }>("/system/packages/worker/list"),
  ]);

  if (!detailResult.ok) {
    if (detailResult.error.includes("not found")) {
      redirect(`/projects/${encoded}`);
    }
    return <DaemonError message={detailResult.error} />;
  }

  const { meeting: meta, parsedMessages } = detailResult.data;
  const status = meta.status.toLowerCase().trim();

  // Meeting frontmatter stores worker identity name and display title
  const workerName = meta.worker || "Worker";
  const workerDisplayTitle = meta.workerDisplayTitle || workerName;

  // Portrait and model resolved from workers endpoint (REQ-WID-10)
  const workers = workersResult.ok ? workersResult.data.workers : [];
  const workerInfo = workers.find((w) => w.displayName === workerName);
  const workerPortraitUrl = workerInfo?.portraitUrl ?? undefined;
  const workerModel = workerInfo?.model?.name ?? "opus";

  const agenda = meta.agenda || "No agenda provided.";

  // Linked artifacts from meeting metadata
  const linkedPaths = meta.linked_artifacts ?? [];

  // Closed meetings show an ended message
  if (status === "closed" || status === "complete") {
    return (
      <div className={styles.meetingView}>
        <MeetingHeader
          projectName={projectName}
          workerName={workerName}
          workerDisplayTitle={workerDisplayTitle}
          workerPortraitUrl={workerPortraitUrl}
          agenda={agenda}
          model={workerModel}
        />
        <Panel size="full">
          <div className={styles.ended}>
            <p className={styles.endedText}>This audience has ended.</p>
            <a
              href={`/projects/${encoded}`}
              className={styles.endedLink}
            >
              Return to project
            </a>
          </div>
        </Panel>
      </div>
    );
  }

  const initialArtifacts = buildLinkedArtifacts(linkedPaths, projectName);

  return (
    <div className={styles.meetingView}>
      <MeetingView
        meetingId={id}
        projectName={projectName}
        workerName={workerName}
        workerDisplayTitle={workerDisplayTitle}
        workerPortraitUrl={workerPortraitUrl}
        initialArtifacts={initialArtifacts}
        initialMessages={parsedMessages}
        agenda={agenda}
        model={workerModel}
      />
    </div>
  );
}
