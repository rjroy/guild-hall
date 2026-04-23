import styles from "./ImageArtifactView.module.css";

interface ImageArtifactViewProps {
  projectName: string;
  artifactPath: string;
}

export default function ImageArtifactView({
  projectName,
  artifactPath,
}: ImageArtifactViewProps) {
  const src = `/api/artifacts/image?project=${encodeURIComponent(projectName)}&path=${encodeURIComponent(artifactPath)}`;
  const filename = artifactPath.split("/").pop() ?? "Image artifact";

  return (
    <div className={styles.viewer}>
      <div className={styles.imageContainer}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={filename}
          className={styles.image}
        />
      </div>
    </div>
  );
}
