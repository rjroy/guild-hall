"use client";

import { useState, useCallback } from "react";
import ChatInterface from "./ChatInterface";
import ArtifactsPanel from "./ArtifactsPanel";
import NotesDisplay from "./NotesDisplay";
import type { LinkedArtifact } from "./ArtifactsPanel";
import type { ChatMessage } from "./types";
import styles from "./MeetingView.module.css";

interface MeetingViewProps {
  meetingId: string;
  projectName: string;
  workerName: string;
  workerDisplayTitle: string;
  initialArtifacts: LinkedArtifact[];
  initialMessages?: ChatMessage[];
}

/**
 * Client-side wrapper that composes the chat interface, artifacts panel,
 * and close-meeting flow into a single meeting view.
 *
 * Manages:
 * - Linked artifacts list (updated via onArtifactLinked callback from ChatInterface)
 * - Close meeting flow (calls DELETE, shows NotesDisplay modal)
 */
export default function MeetingView({
  meetingId,
  projectName,
  workerName,
  workerDisplayTitle,
  initialArtifacts,
  initialMessages,
}: MeetingViewProps) {
  const [artifacts, setArtifacts] = useState<LinkedArtifact[]>(initialArtifacts);
  const [artifactsPanelExpanded, setArtifactsPanelExpanded] = useState(true);
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState(false);
  const [notes, setNotes] = useState<string | undefined>(undefined);

  const projectHref = `/projects/${encodeURIComponent(projectName)}`;

  const handleArtifactLinked = useCallback(
    (artifactPath: string) => {
      setArtifacts((prev) => {
        // Avoid duplicates
        if (prev.some((a) => a.path === artifactPath)) return prev;

        const title = artifactPath.split("/").pop()?.replace(/\.md$/, "") || artifactPath;
        return [
          ...prev,
          {
            path: artifactPath,
            title,
            // We can't verify existence client-side, assume true for live-linked artifacts
            exists: true,
            href: `/projects/${encodeURIComponent(projectName)}/artifacts/${artifactPath}`,
          },
        ];
      });
    },
    [projectName],
  );

  const handleClose = useCallback(async () => {
    if (closing) return;
    setClosing(true);

    try {
      const response = await fetch(
        `/api/meetings/${encodeURIComponent(meetingId)}`,
        { method: "DELETE" },
      );

      if (response.ok) {
        const data = (await response.json()) as { status: string; notes?: string };
        setNotes(data.notes);
      }
      // Show the notes/ended display regardless of response status
      setClosed(true);
    } catch {
      // Network error, still show ended state
      setClosed(true);
    } finally {
      setClosing(false);
    }
  }, [meetingId, closing]);

  if (closed) {
    return (
      <NotesDisplay
        notes={notes}
        projectHref={projectHref}
        projectName={projectName}
      />
    );
  }

  return (
    <div className={styles.meetingContent}>
      <div className={styles.chatArea}>
        <ChatInterface
          meetingId={meetingId}
          projectName={projectName}
          workerName={workerName}
          workerDisplayTitle={workerDisplayTitle}
          initialMessages={initialMessages}
          onArtifactLinked={handleArtifactLinked}
        />
      </div>
      <div className={styles.sidebar}>
        <ArtifactsPanel
          artifacts={artifacts}
          expanded={artifactsPanelExpanded}
          onToggle={() => setArtifactsPanelExpanded((prev) => !prev)}
        />
        <button
          className={styles.closeButton}
          onClick={() => void handleClose()}
          disabled={closing}
          type="button"
        >
          {closing ? "Closing..." : "Close Audience"}
        </button>
      </div>
    </div>
  );
}
