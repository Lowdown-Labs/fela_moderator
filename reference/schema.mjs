// Validation adapters: make moderation ONE rule in the form stack devs already use. Implements the
// Standard Schema `~standard` interface (works with Zod/Valibot/ArkType — needs NO dependency) plus a
// Zod superRefine callback. Both map each Reason's plain-English "why" into the host library's issues.
import { moderate } from "./engine.mjs";
import { explainReason } from "./explain.mjs";

/** A Standard Schema (standardschema.dev) that fails a string when moderation flags it. */
export function moderationSchema(opts = {}) {
  return {
    "~standard": {
      version: 1,
      vendor: "lowdown-moderate",
      validate(value) {
        const text = typeof value === "string" ? value : String(value ?? "");
        const r = moderate(text, opts);
        if (r.flagged) return { issues: r.reasons.map((reason) => ({ message: explainReason(reason) })) };
        return { value: text };
      },
    },
  };
}

/** A Zod `superRefine` callback: `z.string().superRefine(zodRefine(opts))`. No zod import needed. */
export function zodRefine(opts = {}) {
  return (value, ctx) => {
    const r = moderate(String(value ?? ""), opts);
    for (const reason of r.reasons) ctx.addIssue({ code: "custom", message: explainReason(reason) });
  };
}
