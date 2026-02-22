import * as fs from "node:fs/promises";
import * as path from "node:path";
import { redirect } from "next/navigation";
import { getProject } from "@/lib/config";
import { readArtifact } from "@/lib/artifacts";
import { projectLorePath, getGuildHallHome } from "@/lib/paths";
import { parseTranscriptToMessages } from "@/lib/meetings";
import MeetingHeader from "@/components/meeting/MeetingHeader";
import MeetingView from "@/components/meeting/MeetingView";
import Panel from "@/components/ui/Panel";
import type { LinkedArtifact } from "@/components/meeting/ArtifactsPanel";
import styles from "./page.module.css";

/**
 * Reads the transcript file for a meeting and parses it into ChatMessage[]
 * for resume. Returns an empty array if no transcript exists.
 */
async function loadTranscriptMessages(meetingId: string) {
  const home = getGuildHallHome();
  const transcriptFile = path.join(home, "meetings", `${meetingId}.md`);

  try {
    const raw = await fs.readFile(transcriptFile, "utf-8");
    return parseTranscriptToMessages(raw);
  } catch {
    return [];
  }
}

/**
 * Resolves linked artifact paths from meeting frontmatter into LinkedArtifact
 * objects suitable for the ArtifactsPanel. Checks whether each artifact file
 * exists on disk.
 */
async function resolveLinkedArtifacts(
  artifactPaths: string[],
  lorePath: string,
  projectName: string,
): Promise<LinkedArtifact[]> {
  const encodedProject = encodeURIComponent(projectName);

  return Promise.all(
    artifactPaths.map(async (artifactPath) => {
      const fullPath = path.join(lorePath, artifactPath);
      let exists = false;
      try {
        await fs.access(fullPath);
        exists = true;
      } catch {
        // File doesn't exist
      }

      const title =
        artifactPath.split("/").pop()?.replace(/\.md$/, "") || artifactPath;

      return {
        path: artifactPath,
        title,
        exists,
        href: `/projects/${encodedProject}/artifacts/${artifactPath}`,
      };
    }),
  );
}

export default async function MeetingPage({
  params,
}: {
  params: Promise<{ name: string; id: string }>;
}) {
  const { name: rawName, id } = await params;
  const projectName = decodeURIComponent(rawName);

  const project = await getProject(projectName);
  if (!project) {
    redirect(`/`);
  }

  const lorePath = projectLorePath(project.path);
  const meetingPath = `meetings/${id}.md`;

  let artifact;
  try {
    artifact = await readArtifact(lorePath, meetingPath);
  } catch {
    redirect(`/projects/${encodeURIComponent(projectName)}`);
  }

  const { meta } = artifact;
  const status = meta.status.toLowerCase().trim();

  // Meeting frontmatter stores worker identity name and display title as
  // separate fields. The title field is "Audience with <displayTitle>",
  // so we read the dedicated fields from extras instead.
  const workerName =
    (typeof meta.extras?.worker === "string" ? meta.extras.worker : "") ||
    "Worker";
  const workerDisplayTitle =
    (typeof meta.extras?.workerDisplayTitle === "string"
      ? meta.extras.workerDisplayTitle
      : "") || workerName;

  // Agenda lives in frontmatter, not the markdown body. The daemon writes
  // it as a frontmatter field at meeting creation time.
  const agenda =
    (typeof meta.extras?.agenda === "string" ? meta.extras.agenda : "") ||
    "No agenda provided.";

  // Linked artifacts from meeting frontmatter
  const linkedPaths = Array.isArray(meta.extras?.linked_artifacts)
    ? (meta.extras.linked_artifacts as unknown[]).filter(
        (a): a is string => typeof a === "string",
      )
    : [];

  // Closed meetings show an ended message
  if (status === "closed" || status === "complete") {
    return (
      <div className={styles.meetingView}>
        <MeetingHeader
          projectName={projectName}
          workerName={workerName}
          workerDisplayTitle={workerDisplayTitle}
          agenda={agenda}
        />
        <Panel size="full">
          <div className={styles.ended}>
            <p className={styles.endedText}>This audience has ended.</p>
            <a
              href={`/projects/${encodeURIComponent(projectName)}`}
              className={styles.endedLink}
            >
              Return to project
            </a>
          </div>
        </Panel>
      </div>
    );
  }

  // Load transcript messages for session resume (fallback when sessionStorage is empty).
  // Load linked artifacts for the sidebar panel.
  // These are independent reads so we run them in parallel.
  const [transcriptMessages, initialArtifacts] = await Promise.all([
    loadTranscriptMessages(id),
    resolveLinkedArtifacts(linkedPaths, lorePath, projectName),
  ]);

  return (
    <div className={styles.meetingView}>
      <MeetingHeader
        projectName={projectName}
        workerName={workerName}
        workerDisplayTitle={workerDisplayTitle}
        agenda={agenda}
      />
      <MeetingView
        meetingId={id}
        projectName={projectName}
        workerName={workerName}
        workerDisplayTitle={workerDisplayTitle}
        initialArtifacts={initialArtifacts}
        initialMessages={transcriptMessages}
      />
    </div>
  );
}
