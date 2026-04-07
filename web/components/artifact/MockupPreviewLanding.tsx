"use client";

import styles from "./MockupPreviewLanding.module.css";

interface MockupPreviewLandingProps {
  previewUrl: string;
  filename: string;
}

export default function MockupPreviewLanding({
  previewUrl,
  filename,
}: MockupPreviewLandingProps) {
  const handleOpen = () => {
    window.open(previewUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className={styles.landing}>
      <span className={styles.icon} aria-hidden="true">{"\uD83D\uDDA5"}</span>
      <h2 className={styles.filename}>{filename}</h2>
      <p className={styles.description}>
        This is an HTML mockup. Click Open Preview to view it in a new tab.
      </p>
      <button
        type="button"
        className={styles.previewButton}
        onClick={handleOpen}
      >
        Open Preview
      </button>
    </div>
  );
}
