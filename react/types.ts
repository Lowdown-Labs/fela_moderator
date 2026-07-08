export type Severity = "block" | "warn" | "off";
export type Category = "pii" | "toxicity";
export type Decision = "send" | "block" | "redact";
export interface Policy {
  pii: Severity;
  toxicity: Severity;
}
export interface Finding {
  category: Category;
  type: string;
  severity: Severity;
  text: string;
  start: number;
  end: number;
  source: "regex" | "model";
  suggestion?: string;
}
export interface GateResult {
  findings: Finding[];
  blocked: boolean;
  warned: boolean;
}
export type NeuralFn = (text: string) => Promise<{
  toxicity?: Record<string, { prob: number; flagged: boolean }>;
  pii?: Array<{ entity: string; text: string; utf16Start: number; utf16End: number }>;
}>;
export type ReasonSource = "rule" | "wordlist" | "model";
export interface Reason {
  source: ReasonSource;
  detector: string;
  label: string;
  span?: [number, number]; // char offsets INTO THE ORIGINAL text
  matched?: string;
  score?: number;
  language?: string;
}
export interface PiiSpan {
  entity: string;
  span: [number, number];
  source: string;
}
export interface ModerationResult {
  flagged: boolean;
  categories: Record<string, number>;
  piiSpans: PiiSpan[];
  reasons: Reason[];
  normalizedText: string;
}
export interface NeuralOut {
  toxicity?: Record<string, { prob: number; flagged: boolean }>;
  taxonomy?: Record<string, { prob: number; flagged: boolean }>;
  pii?: Array<{ entity: string; text: string; utf16Start: number; utf16End: number; score?: number }>;
  [scalarHead: string]: unknown; // spam_ml / jailbreak / nsfw / target_identity: { prob, flagged }
}
