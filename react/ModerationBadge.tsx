import { useState } from "react";
import { explainReason } from "../reference/explain.mjs";
import type { ModerationResult } from "./types";
import "./fela.css";

export interface ModerationBadgeProps {
  result: ModerationResult;
  className?: string;
}

/** A pill that shows moderation state and reveals each structured reason ("why") on hover/focus. */
export function ModerationBadge({ result, className }: ModerationBadgeProps) {
  const [open, setOpen] = useState(false);
  const count = result.reasons.length;
  const show = open && result.flagged;
  return (
    <span
      className={"fela-badge" + (className ? " " + className : "")}
      part="badge"
      data-flagged={result.flagged}
      tabIndex={0}
      role="button"
      aria-label={
        result.flagged ? `Moderation: ${count} reason${count === 1 ? "" : "s"}. Focus to see why.` : "Moderation: clean"
      }
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {result.flagged ? `⚠ ${count} reason${count === 1 ? "" : "s"}` : "✓ clean"}
      {show && (
        <ul className="fela-badge-tip" part="badge-tip" role="tooltip">
          {result.reasons.map((r, i) => (
            <li key={i}>{explainReason(r)}</li>
          ))}
        </ul>
      )}
    </span>
  );
}
