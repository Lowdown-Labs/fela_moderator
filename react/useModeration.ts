import { useCallback, useEffect, useRef, useState } from "react";
import { check, redactText, DEFAULT_POLICY } from "../reference/validate.mjs";
import type { GateResult, Policy, NeuralFn, Decision, Finding } from "./types";

export interface UseModerationOptions {
  policy?: Policy;
  neural?: NeuralFn;
  debounceMs?: number;
  onError?: (err: unknown) => void;
  onFlagged?: (findings: Finding[]) => Decision | Promise<Decision>;
}

const EMPTY: GateResult = { findings: [], blocked: false, warned: false };

export function useModeration(text: string, opts: UseModerationOptions = {}) {
  const { policy = DEFAULT_POLICY, neural, debounceMs = 200, onError, onFlagged } = opts;
  const [gate, setGate] = useState<GateResult>(EMPTY);
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const latest = useRef(text);
  latest.current = text;

  // Depend on policy.* (not the object) so inline `{pii,toxicity}` literals don't loop the effect.
  useEffect(() => {
    clearTimeout(timer.current);
    if (!text.trim()) {
      setGate(EMPTY);
      setPending(false);
      return;
    }
    setPending(true);
    timer.current = setTimeout(async () => {
      let n: unknown = null;
      if (neural) {
        try {
          n = await neural(text);
        } catch (e) {
          onError?.(e);
        }
      }
      if (latest.current !== text) return; // stale response, a newer keystroke won
      setGate(check(text, { neural: n, policy }));
      setPending(false);
    }, debounceMs);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, policy.pii, policy.toxicity, neural, debounceMs]);

  const redact = useCallback(() => redactText(latest.current, gate.findings), [gate]);

  const guardSubmit = useCallback(async (): Promise<Decision> => {
    if (!gate.blocked && !gate.warned) return "send";
    if (onFlagged) {
      try {
        return await onFlagged(gate.findings);
      } catch (e) {
        onError?.(e);
        return "block";
      }
    }
    return gate.blocked ? "block" : "send";
  }, [gate, onFlagged, onError]);

  const getInputProps = useCallback(
    () => ({
      "aria-invalid": gate.blocked,
      "data-blocked": gate.blocked,
      "data-warned": gate.warned,
    }),
    [gate],
  );

  return {
    findings: gate.findings,
    blocked: gate.blocked,
    warned: gate.warned,
    pending,
    redact,
    guardSubmit,
    getInputProps,
  };
}
