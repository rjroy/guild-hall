import { redirect } from "next/navigation";
import { getProject } from "@/lib/config";
import { readArtifact } from "@/lib/artifacts";
import { projectLorePath } from "@/lib/paths";
import MeetingHeader from "@/components/meeting/MeetingHeader";
import ChatInterface from "@/components/meeting/ChatInterface";
import Panel from "@/components/ui/Panel";
import styles from "./page.module.css";

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

  return (
    <div className={styles.meetingView}>
      <MeetingHeader
        projectName={projectName}
        workerName={workerName}
        workerDisplayTitle={workerDisplayTitle}
        agenda={agenda}
      />
      <ChatInterface
        meetingId={id}
        projectName={projectName}
        workerName={workerName}
        workerDisplayTitle={workerDisplayTitle}
      />
    </div>
  );
}
