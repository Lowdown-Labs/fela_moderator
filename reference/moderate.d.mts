export const PAD_ID: number;
export const CLS_ID: number;
export const SEP_ID: number;
export const MAX_LEN: number;
export interface EncodedText {
  ids: Int32Array;
  byteOfToken: Int32Array;
  nBytes: number;
  nTokens: number;
}
export function encodeText(text: string, maxLen?: number): EncodedText;
export function charBoundsByByte(text: string): { startOf: number[]; endOf: number[]; totalUtf16: number };
export interface ModelPiiSpan {
  entity: string;
  byteStart: number;
  byteEnd: number;
  utf16Start: number;
  utf16End: number;
  text: string;
}
export function piiSpans(
  argmaxPerToken: ArrayLike<number>,
  byteOfToken: ArrayLike<number>,
  piiTags: string[],
  text: string,
): ModelPiiSpan[];
export function redact(text: string, spans: Array<{ utf16Start: number; utf16End: number }>, mask?: string): string;
export function toxicity(
  jigsawLogits: ArrayLike<number>,
  labels: string[],
  thresholds?: Record<string, number>,
): Record<string, { prob: number; flagged: boolean }>;
