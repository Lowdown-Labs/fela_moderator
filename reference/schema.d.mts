import type { ModerateOpts } from "./engine.mjs";
export interface StandardSchemaV1 {
  "~standard": {
    version: 1;
    vendor: string;
    validate(value: unknown): { value: string } | { issues: { message: string }[] };
  };
}
export function moderationSchema(opts?: ModerateOpts): StandardSchemaV1;
export function zodRefine(
  opts?: ModerateOpts,
): (value: unknown, ctx: { addIssue: (issue: { code: string; message: string }) => void }) => void;
