import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useModeration, type UseModerationOptions } from "./useModeration";
import type { Decision, Finding, Policy } from "./types";
import "./fela.css";

type Slots = { root?: string; input?: string; banner?: string };

export interface ModeratedTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  policy?: Policy;
  neural?: UseModerationOptions["neural"];
  debounceMs?: number;
  onBlocked?: (findings: Finding[]) => void;
  onWarn?: (findings: Finding[]) => void;
  onClean?: () => void;
  onError?: (err: unknown) => void;
  onFlagged?: (findings: Finding[]) => Decision | Promise<Decision>;
  renderBlocked?: (findings: Finding[]) => React.ReactNode;
  renderFinding?: (finding: Finding) => React.ReactNode;
  highlight?: boolean;
  classNames?: Slots;
  className?: string;
}

export interface ModeratedTextareaHandle {
  guardSubmit: () => Promise<Decision>;
  redact: () => string;
}

const cx = (base: string, extra?: string) => (extra ? `${base} ${extra}` : base);

function summarize(findings: Finding[]): string {
  const types = [...new Set(findings.filter((f) => f.severity !== "off").map((f) => f.type))];
  return types.join(", ");
}

/** Split text into segments by spanned findings, so each can be wrapped in a highlight <mark>. */
function segments(text: string, findings: Finding[]) {
  const spans = findings.filter((f) => f.start >= 0 && f.end > f.start).sort((a, b) => a.start - b.start);
  const out: Array<{ text: string; finding?: Finding }> = [];
  let i = 0;
  for (const f of spans) {
    if (f.start < i) continue; // skip overlaps
    if (f.start > i) out.push({ text: text.slice(i, f.start) });
    out.push({ text: text.slice(f.start, f.end), finding: f });
    i = f.end;
  }
  if (i < text.length) out.push({ text: text.slice(i) });
  return out;
}

export const ModeratedTextarea = forwardRef<ModeratedTextareaHandle, ModeratedTextareaProps>(function ModeratedTextarea({
  value, onChange, policy, neural, debounceMs, onBlocked, onWarn, onClean, onError, onFlagged,
  renderBlocked, renderFinding, highlight = true, classNames = {}, className, ...textareaProps
}, ref) {
  const [inner, setInner] = useState("");
  const text = value ?? inner;
  const { findings, blocked, warned, getInputProps, guardSubmit, redact } =
    useModeration(text, { policy, neural, debounceMs, onError, onFlagged });

  useImperativeHandle(ref, () => ({
    redact,
    guardSubmit: async () => {
      const decision = await guardSubmit();
      if (decision === "redact" && value === undefined) setInner(redact());
      return decision;
    },
  }), [guardSubmit, redact, value]);

  // transition-only callbacks
  const prev = useRef<"clean" | "warn" | "block">("clean");
  useEffect(() => {
    const now = blocked ? "block" : warned ? "warn" : "clean";
    if (now === prev.current) return;
    prev.current = now;
    if (now === "block") onBlocked?.(findings);
    else if (now === "warn") onWarn?.(findings);
    else onClean?.();
  }, [blocked, warned, findings, onBlocked, onWarn, onClean]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (value === undefined) setInner(e.target.value);
    onChange?.(e);
  };

  const show = blocked || warned;

  return (
    <div className={cx(cx("fela-root", classNames.root), className)} part="root" data-blocked={blocked} data-warned={warned}>
      <div className="fela-field">
        {highlight && (
          <div className="fela-backdrop" aria-hidden="true">
            {segments(text, findings).map((s, i) =>
              s.finding
                ? <mark key={i} part="finding" data-category={s.finding.category} data-severity={s.finding.severity}>{s.text}</mark>
                : <span key={i}>{s.text}</span>
            )}
          </div>
        )}
        <textarea
          {...textareaProps}
          {...getInputProps()}
          part="input"
          className={cx("fela-input", classNames.input)}
          value={text}
          onChange={handleChange}
        />
      </div>
      {show && (renderBlocked ? renderBlocked(findings) : (
        <p className={cx("fela-banner", classNames.banner)} part="banner" role="alert" data-severity={blocked ? "block" : "warn"}>
          {renderFinding
            ? findings.map((f, i) => <span key={i}>{renderFinding(f)}</span>)
            : `${blocked ? "🚫 Can’t send" : "⚠️ Heads up"} — ${summarize(findings)}`}
        </p>
      ))}
    </div>
  );
});
