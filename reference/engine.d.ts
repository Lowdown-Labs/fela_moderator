import type { ModerationResult, NeuralOut } from "../react/types";
export interface ModerateOpts { neural?: NeuralOut | null; config?: { heads?: Record<string, { enabled?: boolean; threshold?: number | null }>; detectorOpts?: Record<string, unknown> }; lowercase?: boolean; }
export function moderate(text: string, opts?: ModerateOpts): ModerationResult;
export function moderateAsync(text: string, opts?: Omit<ModerateOpts, "neural"> & { neural?: (text: string) => Promise<NeuralOut> }): Promise<ModerationResult>;
