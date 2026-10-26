import { describe, expect, it } from "vitest";

import type { InboxItem } from "../../gen/InboxItem";
import { dedupeInbox } from "../store";

const item = (over: Partial<InboxItem>): InboxItem => ({
  id: "I-1",
  goal_id: "G-0004",
  goal_title: "Find out why checkout is slow",
  kind: "paused",
  title: "Paused: stopped",
  subject: "The agent stopped without submitting",
  body: "",
  options: ["Continue", "Abandon this goal"],
  tones: ["primary", "destructive"],
  allow_text: true,
  created_at: 1000,
  urgency: 1,
  snoozed_until: null,
  ...over,
});

describe("inbox replica", () => {
  it("shows the same question once, keeping the newest card in the original order", () => {
    const a = item({ id: "I-1", created_at: 1000 });
    const b = item({ id: "I-2", created_at: 2000 });
    const other = item({ id: "I-3", kind: "question", subject: "Which currency?" });
    expect(dedupeInbox([a, other, b]).map((i) => i.id)).toEqual(["I-3", "I-2"]);
    // A different subject on the same goal and kind is a different card.
    expect(dedupeInbox([a, item({ id: "I-4", subject: "Reached the soft budget cap" })])).toHaveLength(2);
  });
});
