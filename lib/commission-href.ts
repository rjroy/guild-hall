/**
 * URL helper for commission detail pages. Extracted from DependencyMap.tsx
 * so client components can import it without pulling in node:fs/promises.
 */
export function commissionHref(
  projectName: string,
  commissionId: string,
): string {
  return `/projects/${encodeURIComponent(projectName)}/commissions/${encodeURIComponent(commissionId)}`;
}
