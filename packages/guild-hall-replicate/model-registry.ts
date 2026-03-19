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
  capabilities: Capability[];
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
    capabilities: ["text-to-image"],
    cost: "$0.003/image",
    speed: "~2s",
    notes: "Default model. Best for rapid iteration.",
  },
  {
    id: "black-forest-labs/flux-2-pro",
    name: "FLUX 2 Pro",
    description: "High-quality generation and image-to-image transformation using FLUX architecture.",
    capabilities: ["text-to-image", "image-to-image"],
    cost: "$0.05/image",
    speed: "~15s",
    notes: "Best for production images and image-to-image transformation.",
  },
  {
    id: "google/nano-banana-pro",
    name: "Nano Banana Pro",
    description: "Premium text-to-image optimized for infographics, UI mockups, and high-fidelity visual content.",
    capabilities: ["text-to-image"],
    cost: "$0.15/image",
    speed: "~10s",
    notes: "Best for infographics, UI mockups, and high-fidelity visual content. Most expensive option.",
  },
  {
    id: "ideogram-ai/ideogram-v3-turbo",
    name: "Ideogram V3 Turbo",
    description: "Fast text-to-image with strong text rendering in images.",
    capabilities: ["text-to-image"],
    cost: "$0.03/image",
    speed: "~5s",
    notes: "Best for text rendering in images.",
  },
  // -- Background removal --
  {
    id: "lucataco/remove-bg",
    name: "Remove Background",
    description: "Fast background removal producing transparent PNGs.",
    capabilities: ["background-removal"],
    cost: "$0.003/image",
    speed: "~3s",
  },
  // -- Upscale --
  {
    id: "google/upscaler",
    name: "Google Upscaler",
    description: "AI image upscaling for increasing resolution.",
    capabilities: ["upscale"],
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
  return MODEL_REGISTRY.filter((m) => m.capabilities.includes(capability as Capability));
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
