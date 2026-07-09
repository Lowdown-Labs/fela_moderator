import { moderate } from "./engine.mjs";
import { explainReason } from "./explain.mjs";

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

export function zodRefine(opts = {}) {
  return (value, ctx) => {
    const r = moderate(String(value ?? ""), opts);
    for (const reason of r.reasons) ctx.addIssue({ code: "custom", message: explainReason(reason) });
  };
}
