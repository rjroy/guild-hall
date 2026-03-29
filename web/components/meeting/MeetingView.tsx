"use client";

import { useState, useCallback } from "react";
import { useDaemonStatus } from "@/web/components/ui/DaemonContext";
import InlinePanel from "@/web/components/ui/InlinePanel";
import ChatInterface from "./ChatInterface";
import ArtifactsPanel from "./ArtifactsPanel";
import MeetingHeader from "./MeetingHeader";
import NotesDisplay from "./NotesDisplay";
import type { LinkedArtifact } from "./ArtifactsPanel";
import type { ChatMessage } from "./types";
import styles from "./MeetingView.module.css";

interface MeetingViewProps {
  meetingId: string;
  projectName: string;
  projectTitle?: string;
  workerName: string;
  workerDisplayTitle: string;
  workerPortraitUrl?: string;
  initialArtifacts: LinkedArtifact[];
  initialMessages?: ChatMessage[];
  agenda: string;
  model?: string;
}

/**
 * Client-side wrapper that composes the header, chat interface, artifacts panel,
 * and close-meeting flow into a single meeting view.
 *
 * Manages:
 * - Linked artifacts list (updated via onArtifactLinked callback from ChatInterface)
 * - Close meeting flow (calls DELETE, shows NotesDisplay modal)
 * - Responsive sidebar relocation below 768px (REQ-MTG-LAYOUT-19-23)
 */
export default function MeetingView({
  meetingId,
  projectName,
  projectTitle,
  workerName,
  workerDisplayTitle,
  workerPortraitUrl,
  initialArtifacts,
  initialMessages,
  agenda,
  model,
}: MeetingViewProps) {
  const { isOnline } = useDaemonStatus();
  const [artifacts, setArtifacts] = useState<LinkedArtifact[]>(initialArtifacts);
  const [artifactsPanelExpanded, setArtifactsPanelExpanded] = useState(true);
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState(false);
  const [notes, setNotes] = useState<string | undefined>(undefined);


  const projectHref = `/projects/${encodeURIComponent(projectName)}`;

  const handleArtifactLinked = useCallback(
    (artifactPath: string) => {
      setArtifacts((prev) => {
        if (prev.some((a) => a.path === artifactPath)) return prev;

        const title = artifactPath.split("/").pop()?.replace(/\.md$/, "") || artifactPath;
        return [
          ...prev,
          {
            path: artifactPath,
            title,
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
      setClosed(true);
    } catch {
      setClosed(true);
    } finally {
      setClosing(false);
    }
  }, [meetingId, closing]);

  if (closed) {
    return (
      <>
        <MeetingHeader
          projectName={projectName}
          projectTitle={projectTitle}
          workerName={workerName}
          workerDisplayTitle={workerDisplayTitle}
          workerPortraitUrl={workerPortraitUrl}
          agenda={agenda}
          model={model}
        />
        <NotesDisplay
          notes={notes}
          projectHref={projectHref}
          projectName={projectName}
        />
      </>
    );
  }

  // Sidebar content rendered in two locations depending on viewport
  const sidebarContent = (
    <>
      <ArtifactsPanel
        artifacts={artifacts}
        expanded={artifactsPanelExpanded}
        onToggle={() => setArtifactsPanelExpanded((prev) => !prev)}
      />
      <button
        className={styles.closeButton}
        onClick={() => void handleClose()}
        disabled={closing || !isOnline}
        title={!isOnline ? "Daemon offline" : undefined}
        type="button"
      >
        {closing ? "Closing..." : "Close Audience"}
      </button>
    </>
  );

  return (
    <>
      <MeetingHeader
        projectName={projectName}
        workerName={workerName}
        workerDisplayTitle={workerDisplayTitle}
        workerPortraitUrl={workerPortraitUrl}
        agenda={agenda}
        model={model}
        onClose={() => void handleClose()}
        closing={closing}
        isOnline={isOnline}
      />
      <div className={styles.meetingContent}>
        <div className={styles.chatArea}>
          <ChatInterface
            meetingId={meetingId}
            projectName={projectName}
            workerName={workerName}
            workerDisplayTitle={workerDisplayTitle}
            workerPortraitUrl={workerPortraitUrl}
            initialMessages={initialMessages}
            onArtifactLinked={handleArtifactLinked}
          />

          {/* REQ-MTG-LAYOUT-19/20: Relocated sidebar content as collapsible panel */}
          <div className={styles.mobileSidebar}>
            <InlinePanel label={`Artifacts (${artifacts.length})`}>
              {sidebarContent}
            </InlinePanel>
          </div>
        </div>

        {/* REQ-MTG-LAYOUT-23: Sidebar hidden below 768px via CSS */}
        <div className={styles.sidebar}>
          {sidebarContent}
        </div>
      </div>
    </>
  );
}
