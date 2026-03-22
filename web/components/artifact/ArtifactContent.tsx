"use client";

import type { Components } from "react-markdown";
import { useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { resolveImageSrc } from "@/web/lib/resolve-image-src";
import styles from "./ArtifactContent.module.css";

interface ArtifactContentProps {
  /** The markdown body (frontmatter already stripped by the server component) */
  body: string;
  /** The full raw file content including frontmatter */
  rawContent: string;
  projectName: string;
  /** Relative path within .lore/ used as the artifact identifier for saves */
  artifactPath: string;
}

export default function ArtifactContent({
  body,
  rawContent,
  projectName,
  artifactPath,
}: ArtifactContentProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(rawContent);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const hasUnsavedChanges = editContent !== rawContent;

  const handleEdit = () => {
    setEditContent(rawContent);
    setSaveError(null);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditContent(rawContent);
    setSaveError(null);
    setIsEditing(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/artifacts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName,
          artifactPath,
          content: editContent,
        }),
      });
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => ({}));
        const errorMessage =
          data && typeof data === "object" && "error" in data
            ? String((data as { error: unknown }).error)
            : "Save failed";
        throw new Error(errorMessage);
      }
      router.refresh();
      setIsEditing(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Save failed";
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div className={styles.editor}>
        <div className={styles.toolbar}>
          <span className={styles.toolbarLabel}>
            Editing{hasUnsavedChanges ? " (unsaved changes)" : ""}
          </span>
          <div className={styles.toolbarActions}>
            <button
              className={styles.cancelButton}
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              className={styles.saveButton}
              onClick={() => void handleSave()}
              disabled={isSaving || !hasUnsavedChanges}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
        {saveError && (
          <p className={styles.error}>{saveError}</p>
        )}
        <textarea
          className={styles.textarea}
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          disabled={isSaving}
          spellCheck={false}
        />
      </div>
    );
  }

  const markdownComponents: Components = {
    img: ({ src, alt, ...props }) => {
      const srcStr = typeof src === "string" ? src : undefined;
      const resolvedSrc = resolveImageSrc(srcStr, projectName, artifactPath);
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          {...props}
          src={resolvedSrc}
          alt={alt ?? ""}
          loading="lazy"
          className={styles.inlineImage}
        />
      );
    },
  };

  return (
    <div className={styles.viewer}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarLabel}>Content</span>
        <button className={styles.editButton} onClick={handleEdit}>
          Edit
        </button>
      </div>
      <div className={styles.markdownContent}>
        {body.trim() ? (
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>{body}</ReactMarkdown>
        ) : (
          <pre className={styles.rawFallback}>{rawContent}</pre>
        )}
      </div>
    </div>
  );
}
