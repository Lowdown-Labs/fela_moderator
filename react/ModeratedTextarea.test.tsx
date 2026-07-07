import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { createRef } from "react";
import { ModeratedTextarea } from "./ModeratedTextarea";
import type { Decision } from "./types";

const type = (t: string) => fireEvent.change(screen.getByRole("textbox"), { target: { value: t } });

describe("<ModeratedTextarea>", () => {
  it("blocks by default and shows a banner", async () => {
    render(<ModeratedTextarea debounceMs={0} />);
    type("email me at joe@example.com");
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveAttribute("data-blocked", "true"));
    expect(screen.getByRole("alert")).toHaveTextContent(/EMAIL/);
  });

  it("fires onBlocked then onClean across transitions", async () => {
    const onBlocked = vi.fn(), onClean = vi.fn();
    render(<ModeratedTextarea debounceMs={0} onBlocked={onBlocked} onClean={onClean} />);
    type("joe@example.com");
    await waitFor(() => expect(onBlocked).toHaveBeenCalledTimes(1));
    type("hello friend");
    await waitFor(() => expect(onClean).toHaveBeenCalledTimes(1));
  });

  it("renderBlocked replaces the default banner", async () => {
    render(<ModeratedTextarea debounceMs={0} renderBlocked={(f) => <div>custom {f.length}</div>} />);
    type("joe@example.com");
    await waitFor(() => expect(screen.getByText(/custom 1/)).toBeInTheDocument());
    expect(screen.queryByText(/EMAIL/i)).not.toBeInTheDocument();
  });

  it("applies classNames slot to the input", async () => {
    render(<ModeratedTextarea debounceMs={0} classNames={{ input: "my-input" }} />);
    expect(screen.getByRole("textbox")).toHaveClass("my-input");
  });

  it("renders a highlight mark for a spanned finding", async () => {
    const { container } = render(<ModeratedTextarea debounceMs={0} />);
    type("call 415-555-0199 now");
    await waitFor(() => expect(container.querySelector('mark[part="finding"]')).toBeTruthy());
    expect(container.querySelector('mark[part="finding"]')!.textContent).toContain("415-555-0199");
  });

  it("highlight=false renders no marks", async () => {
    const { container } = render(<ModeratedTextarea debounceMs={0} highlight={false} />);
    type("call 415-555-0199 now");
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveAttribute("data-blocked", "true"));
    expect(container.querySelector('mark[part="finding"]')).toBeNull();
  });

  it("exposes guardSubmit via ref and runs onFlagged", async () => {
    const onFlagged = vi.fn(async (): Promise<Decision> => "send");
    const ref = createRef<{ guardSubmit: () => Promise<Decision>; redact: () => string }>();
    render(<ModeratedTextarea ref={ref} debounceMs={0} onFlagged={onFlagged} />);
    type("joe@example.com");
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveAttribute("data-blocked", "true"));
    await waitFor(async () => expect(await ref.current!.guardSubmit()).toBe("send"));
    expect(onFlagged).toHaveBeenCalled();
  });

  it("uncontrolled redact decision rewrites the textarea value", async () => {
    const ref = createRef<{ guardSubmit: () => Promise<Decision>; redact: () => string }>();
    render(<ModeratedTextarea ref={ref} debounceMs={0} onFlagged={async () => "redact"} />);
    type("call 415-555-0199 now");
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveAttribute("data-blocked", "true"));
    await act(async () => { await ref.current!.guardSubmit(); });
    await waitFor(() => expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).not.toContain("415-555-0199"));
  });
});
