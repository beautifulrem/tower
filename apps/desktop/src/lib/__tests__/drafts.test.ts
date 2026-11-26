// @vitest-environment jsdom
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { describe, expect, it, vi } from "vitest";

import type { InboxItem } from "../../gen/InboxItem";

const item = (id: string, subject: string, over: Partial<InboxItem> = {}): InboxItem => ({
  id,
  goal_id: "G-0002",
  goal_title: "Add a coupon field",
  kind: "question",
  title: subject,
  subject,
  body: "",
  options: [],
  tones: [],
  allow_text: true,
  created_at: 5000,
  urgency: 2,
  snoozed_until: null,
  ...over,
});

// Review 24 (record only 4): words typed in a card are the item's. A newer item that replaces it (the same goal, kind and
// words, in the same update, D259) finds them; an item that leaves otherwise (answered on the phone, withdrawn) takes
// them along; two such items open at once each keep their own; an item put aside keeps them.
describe("what you typed and did not send", () => {
  it("follows its item: to the item that replaced it, away with one that left, never to a twin", async () => {
    const handlers: Record<string, (e: { payload: unknown }) => void> = {};
    vi.mocked(listen).mockImplementation(async (name, cb) => {
      handlers[name] = cb as (e: { payload: unknown }) => void;
      return () => {};
    });
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "goals":
        case "inbox":
        case "projects":
        case "snoozed_inbox":
        case "engines":
          return [];
        case "environment":
          return { data_dir: "/x", problems: [] };
        case "settings":
          return { language: "en", remote_enabled: false };
        default:
          return null;
      }
    });
    const { init, drafts } = await import("../store");
    await init();
    const update = (items: InboxItem[], snoozed: InboxItem[] = []) => handlers["tower://update"]({ payload: { type: "inbox", items, snoozed } });
    const q = "Percentage or fixed amount?";

    update([item("I-1", q)]);
    drafts["I-1"] = "percentage first";
    update([item("I-2", q)]);
    expect(drafts, "the item that replaced it finds the words").toEqual({ "I-2": "percentage first" });

    update([], [item("I-2", q, { snoozed_until: 9e12 })]);
    expect(drafts, "put aside, the item keeps them").toEqual({ "I-2": "percentage first" });
    update([item("I-2", q)]);
    expect(drafts, "back from aside, still there").toEqual({ "I-2": "percentage first" });

    update([]);
    expect(drafts, "answered elsewhere, the words go with it").toEqual({});
    update([item("I-3", q)]);
    expect(drafts, "a later item of the same words starts empty").toEqual({});

    // Two dialogs asking the same, open at once: each its own words, and one leaving leaves the other's alone.
    update([item("I-3", q), item("I-4", q)]);
    drafts["I-3"] = "fixed";
    drafts["I-4"] = "percentage";
    update([item("I-4", q)]);
    expect(drafts, "a twin that stays is not an heir").toEqual({ "I-4": "percentage" });
    update([item("I-4", q), item("I-5", q)]);
    expect(drafts, "a new twin beside it finds nothing").toEqual({ "I-4": "percentage" });

    // Another goal's item with the same words is not an heir either.
    update([item("I-5", q), item("I-6", q, { goal_id: "G-0003" })]);
    expect(drafts).toEqual({});
  });
});
