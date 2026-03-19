/**
 * Resolves an image src from markdown to a serveable URL via the image proxy.
 *
 * - External URLs (http/https) pass through unchanged.
 * - Absolute paths (starting with /) resolve from the .lore/ root.
 * - Relative paths resolve from the referencing artifact's directory.
 */
export function resolveImageSrc(
  src: string | undefined,
  projectName: string,
  artifactPath: string,
): string {
  if (!src) return "";

  // External URLs pass through
  if (src.startsWith("http://") || src.startsWith("https://")) {
    return src;
  }

  const encodedProject = encodeURIComponent(projectName);

  // Absolute paths from .lore/ root
  if (src.startsWith("/")) {
    const cleanPath = src.slice(1);
    return `/api/artifacts/image?project=${encodedProject}&path=${encodeURIComponent(cleanPath)}`;
  }

  // Relative paths from the artifact's directory
  const artifactDir = artifactPath.split("/").slice(0, -1).join("/");
  const resolved = artifactDir ? `${artifactDir}/${src}` : src;
  return `/api/artifacts/image?project=${encodedProject}&path=${encodeURIComponent(resolved)}`;
}
