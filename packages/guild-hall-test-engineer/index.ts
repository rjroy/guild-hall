import type { ActivationContext, ActivationResult } from "@/lib/types";
import { activateWorkerWithSharedPattern } from "@/packages/shared/worker-activation";

export function activate(context: ActivationContext): ActivationResult {
  return activateWorkerWithSharedPattern(context);
}