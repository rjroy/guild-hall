import Link from "next/link";
import Panel from "@/apps/web/components/ui/Panel";
import styles from "./ImageMetadataSidebar.module.css";

interface ImageMetadataSidebarProps {
  filename: string;
  mimeType: string;
  fileSize: number;
  lastModified: string;
  projectName: string;
}

/**
 * Formats a byte count into a human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Derives a short format label from a MIME type.
 */
export function formatLabel(mimeType: string): string {
  const map: Record<string, string> = {
    "image/png": "PNG",
    "image/jpeg": "JPEG",
    "image/webp": "WebP",
    "image/gif": "GIF",
    "image/svg+xml": "SVG",
  };
  return map[mimeType] ?? mimeType;
}

export default function ImageMetadataSidebar({
  filename,
  mimeType,
  fileSize,
  lastModified,
  projectName,
}: ImageMetadataSidebarProps) {
  const encodedName = encodeURIComponent(projectName);

  return (
    <Panel size="sm">
      <div className={styles.sidebar}>
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Filename</h3>
          <p className={styles.value}>{filename}</p>
        </div>

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Format</h3>
          <p className={styles.value}>{formatLabel(mimeType)}</p>
        </div>

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>File Size</h3>
          <p className={styles.value}>{formatFileSize(fileSize)}</p>
        </div>

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Last Modified</h3>
          <p className={styles.value}>
            {new Date(lastModified).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Project</h3>
          <Link
            href={`/projects/${encodedName}`}
            className={styles.projectLink}
          >
            {projectName}
          </Link>
        </div>
      </div>
    </Panel>
  );
}
