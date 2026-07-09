import type { Policy, GateResult, Finding } from "./types.js";
export const DEFAULT_POLICY: Policy;
export function check(text: string, opts?: { neural?: unknown; policy?: Policy }): GateResult;
export function redactText(text: string, findings: Finding[]): string;
export function maskValue(finding: Pick<Finding, "type" | "text">): string;
export { moderate, moderateAsync } from "./engine.mjs";
export { explain, explainReason } from "./explain.mjs";
export { moderationSchema, zodRefine } from "./schema.mjs";
