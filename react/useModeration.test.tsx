import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useModeration } from "./useModeration";
import type { Decision } from "./types";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useModeration", () => {
  it("blocks on regex PII after debounce", async () => {
    const { result } = renderHook(() => useModeration("email joe@example.com"));
    expect(result.current.pending).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.blocked).toBe(true);
    expect(result.current.findings.some((f) => f.type === "EMAIL")).toBe(true);
  });

  it("warns (not blocks) when policy pii=warn", async () => {
    const { result } = renderHook(() =>
      useModeration("call 415-555-0199", { policy: { pii: "warn", toxicity: "block" } }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.blocked).toBe(false);
    expect(result.current.warned).toBe(true);
  });

  it("redact() returns text with PII masked", async () => {
    const { result } = renderHook(() => useModeration("call 415-555-0199"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.redact()).not.toContain("415-555-0199");
  });

  it("empty text is clean and not pending", () => {
    const { result } = renderHook(() => useModeration("   "));
    expect(result.current.blocked).toBe(false);
    expect(result.current.pending).toBe(false);
  });

  it("fails open + calls onError when neural throws", async () => {
    const onError = vi.fn();
    const neural = vi.fn().mockRejectedValue(new Error("model down"));
    const { result } = renderHook(() => useModeration("email joe@example.com", { neural, onError }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(onError).toHaveBeenCalled();
    expect(result.current.blocked).toBe(true); // regex still gates
  });
});

describe("guardSubmit", () => {
  it("returns 'send' for clean text", async () => {
    const { result } = renderHook(() => useModeration("hello there"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    await act(async () => {
      expect(await result.current.guardSubmit()).toBe("send");
    });
  });

  it("returns 'block' when blocked and no resolver", async () => {
    const { result } = renderHook(() => useModeration("email joe@example.com"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    await act(async () => {
      expect(await result.current.guardSubmit()).toBe("block");
    });
  });

  it("defers to onFlagged and returns its decision", async () => {
    const onFlagged = vi.fn(async (): Promise<Decision> => "redact");
    const { result } = renderHook(() => useModeration("email joe@example.com", { onFlagged }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    await act(async () => {
      expect(await result.current.guardSubmit()).toBe("redact");
    });
    expect(onFlagged).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ type: "EMAIL" })]));
  });

  it("treats a throwing resolver as 'block' and reports it", async () => {
    const onError = vi.fn();
    const onFlagged = vi.fn(async () => {
      throw new Error("dialog crashed");
    });
    const { result } = renderHook(() => useModeration("email joe@example.com", { onFlagged, onError }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    await act(async () => {
      expect(await result.current.guardSubmit()).toBe("block");
    });
    expect(onError).toHaveBeenCalled();
  });

  it("getInputProps reflects gate state", async () => {
    const { result } = renderHook(() => useModeration("email joe@example.com"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.getInputProps()["data-blocked"]).toBe(true);
    expect(result.current.getInputProps()["aria-invalid"]).toBe(true);
  });
});
