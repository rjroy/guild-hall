/**
 * Curated model registry for the Replicate toolbox.
 *
 * A static registry with cost/speed metadata is more useful to workers than
 * a raw dump of Replicate's 100,000+ community models (REQ-RPL-23).
 * Workers can still use any valid model ID; unlisted models just won't
 * have cost estimate data (REQ-RPL-25).
 */

export type Capability = "text-to-image" | "image-to-image" | "background-removal" | "upscale";

export interface ModelEntry {
  id: string;
  name: string;
  description: string;
  capability: Capability;
  cost: string;
  speed: string;
  notes?: string;
}

export const MODEL_REGISTRY: ModelEntry[] = [
  // -- Text-to-image --
  {
    id: "black-forest-labs/flux-schnell",
    name: "FLUX Schnell",
    description: "Fast, high-quality text-to-image generation. Best balance of speed and quality.",
    capability: "text-to-image",
    cost: "$0.003/image",
    speed: "~2s",
    notes: "Default model. Best for rapid iteration.",
  },
  {
    id: "black-forest-labs/flux-1.1-pro",
    name: "FLUX 1.1 Pro",
    description: "High-quality text-to-image with superior prompt adherence.",
    capability: "text-to-image",
    cost: "$0.04/image",
    speed: "~10s",
    notes: "Best for final production images.",
  },
  {
    id: "black-forest-labs/flux-dev",
    name: "FLUX Dev",
    description: "Development-quality text-to-image. Good quality at moderate cost.",
    capability: "text-to-image",
    cost: "$0.025/image",
    speed: "~8s",
  },
  {
    id: "ideogram-ai/ideogram-v3-turbo",
    name: "Ideogram V3 Turbo",
    description: "Fast text-to-image with strong text rendering in images.",
    capability: "text-to-image",
    cost: "$0.03/image",
    speed: "~5s",
    notes: "Best for text rendering in images.",
  },
  // -- Image-to-image --
  {
    id: "black-forest-labs/flux-2-pro",
    name: "FLUX 2 Pro",
    description: "Image-to-image transformation using FLUX architecture.",
    capability: "image-to-image",
    cost: "$0.05/image",
    speed: "~15s",
  },
  // -- Background removal --
  {
    id: "lucataco/remove-bg",
    name: "Remove Background",
    description: "Fast background removal producing transparent PNGs.",
    capability: "background-removal",
    cost: "$0.003/image",
    speed: "~3s",
  },
  // -- Upscale --
  {
    id: "google/upscaler",
    name: "Google Upscaler",
    description: "AI image upscaling for increasing resolution.",
    capability: "upscale",
    cost: "$0.01/image",
    speed: "~10s",
  },
];

const DEFAULT_MODELS: Record<string, string> = {
  "text-to-image": "black-forest-labs/flux-schnell",
  "image-to-image": "black-forest-labs/flux-2-pro",
  "background-removal": "lucataco/remove-bg",
  "upscale": "google/upscaler",
};

export function getModels(capability?: string): ModelEntry[] {
  if (!capability) return [...MODEL_REGISTRY];
  return MODEL_REGISTRY.filter((m) => m.capability === capability);
}

export function findModel(id: string): ModelEntry | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}

export function getCostEstimate(modelId: string): string {
  const entry = findModel(modelId);
  return entry?.cost ?? "unknown";
}

export function getDefaultModel(capability: string): string {
  const id = DEFAULT_MODELS[capability];
  if (!id) throw new Error(`No default model for capability: ${capability}`);
  return id;
}
