import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModerationBadge } from "./ModerationBadge";
import { moderate } from "../reference/engine.mjs";

describe("<ModerationBadge>", () => {
  it("shows the reason count and reveals the why on hover", () => {
    render(<ModerationBadge result={moderate("mail joe@example.com")} />);
    const badge = screen.getByRole("button");
    expect(badge).toHaveAttribute("data-flagged", "true");
    fireEvent.mouseEnter(badge);
    expect(screen.getByRole("tooltip").textContent).toContain("EMAIL");
  });

  it("reveals the why on keyboard focus too", () => {
    render(<ModerationBadge result={moderate("mail joe@example.com")} />);
    fireEvent.focus(screen.getByRole("button"));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("clean result shows a clean state and no tooltip", () => {
    render(<ModerationBadge result={moderate("a friendly hello")} />);
    const badge = screen.getByRole("button");
    expect(badge).toHaveAttribute("data-flagged", "false");
    fireEvent.mouseEnter(badge);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
