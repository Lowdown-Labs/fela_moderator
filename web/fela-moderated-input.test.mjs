import { describe, it, expect, vi, beforeEach } from "vitest";
import "./fela-moderated-input.js";

const mount = () => {
  const el = document.createElement("fela-moderated-input");
  document.body.appendChild(el);
  return el;
};

describe("<fela-moderated-input>", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("emits flagged with findings on PII input", async () => {
    const el = mount();
    el.setAttribute("debounce", "0");
    const spy = vi.fn();
    el.addEventListener("flagged", spy);
    const ta = el.querySelector("textarea");
    ta.value = "email joe@example.com";
    ta.dispatchEvent(new Event("input"));
    await new Promise((r) => setTimeout(r, 10));
    expect(spy).toHaveBeenCalled();
    const detail = spy.mock.calls[0][0].detail;
    expect(detail.blocked).toBe(true);
    expect(detail.findings.some((f) => f.type === "EMAIL")).toBe(true);
    expect(typeof detail.decide).toBe("function");
  });

  it("decide('redact') rewrites the textarea value", async () => {
    const el = mount();
    el.setAttribute("debounce", "0");
    let detail;
    el.addEventListener("flagged", (e) => {
      detail = e.detail;
    });
    const ta = el.querySelector("textarea");
    ta.value = "call 415-555-0199 now";
    ta.dispatchEvent(new Event("input"));
    await new Promise((r) => setTimeout(r, 10));
    detail.decide("redact");
    expect(ta.value).not.toContain("415-555-0199");
  });
});
