import type { Policy, GateResult, Finding } from "../react/types";
export const DEFAULT_POLICY: Policy;
export function check(text: string, opts?: { neural?: unknown; policy?: Policy }): GateResult;
export function redactText(text: string, findings: Finding[]): string;
export function maskValue(finding: Pick<Finding, "type" | "text">): string;
