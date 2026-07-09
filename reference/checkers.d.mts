export interface StructuredHit {
  type: string;
  text: string;
  start: number;
  end: number;
  source: "regex";
}
export function structuredPII(text: string): StructuredHit[];
export const MODEL_OWNED: Set<string>;
