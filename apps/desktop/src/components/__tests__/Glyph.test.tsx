import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { noteDetail } from "../../lib/discounted";
import { LifecycleGlyph } from "../Glyph";

const ready = { id: "G-0009", state: "in_review" as const, progress: { verified: 2, observed: 0, machine: 3, human: 0, human_done: 0 }, verified_pin: "ca8ab12aa" };

describe("a goal's glyph", () => {
  it("is the verifier's green check until the goal's detail shows a pass that is not evidence; then the seal's amber ◆, saying so", () => {
    const { container } = render(() => <LifecycleGlyph goal={ready} />);
    const svg = () => container.querySelector("svg")!;
    expect(svg().getAttribute("stroke")).toBe("var(--st-verified)");
    noteDetail({ summary: { id: "G-0009" }, criteria: [{ canary: "intact" }, { canary: "tampered" }] });
    expect(svg().classList.contains("mark-attention")).toBe(true);
    expect(svg().querySelector("path")!.getAttribute("fill")).toBe("var(--st-attention)");
    expect(svg().getAttribute("aria-label")).toBe("Ready to accept · Passed, not evidence");
    // Re-verified without the tampering: green again.
    noteDetail({ summary: { id: "G-0009" }, criteria: [{ canary: "intact" }] });
    expect(svg().getAttribute("stroke")).toBe("var(--st-verified)");
  });

  it("is not touched for a goal that is not ready or accepted", () => {
    noteDetail({ summary: { id: "G-0010" }, criteria: [{ canary: "tampered" }] });
    const { container } = render(() => <LifecycleGlyph goal={{ ...ready, id: "G-0010", state: "running" }} />);
    expect(container.querySelector(".mark-attention")).toBeNull();
  });
});
