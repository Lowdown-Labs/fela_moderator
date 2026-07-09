import type { NeuralOut } from "../reference/types.js";
export interface ModeratorConfig {
  jigsaw_labels?: string[];
  pii_tags?: string[];
  toxicity_thresholds?: Record<string, number>;
  head_thresholds?: Record<string, Record<string, number>>;
  [key: string]: unknown;
}
export interface CreateModeratorOpts {
  ort: unknown;
  model: unknown;
  config: ModeratorConfig;
  dtype?: "int32" | "int64";
}
export function createModerator(opts: CreateModeratorOpts): Promise<(text: string) => Promise<NeuralOut>>;
