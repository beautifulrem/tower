// @vitest-environment jsdom
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { describe, expect, it, vi } from "vitest";

import type { InboxItem } from "../../gen/InboxItem";

const card: InboxItem = {
  id: "I-9",
  goal_id: "G-0002",
  goal_title: "Add a coupon field",
  kind: "question",
  title: "Which currency?",
  subject: "Which currency?",
  body: "",
  options: ["EUR", "USD"],
  tones: ["primary", "primary"],
  allow_text: false,
  created_at: 5000,
  urgency: 2,
  snoozed_until: null,
};

describe("the first load", () => {
  it("keeps a decision card that arrived live while the snapshot was loading", async () => {
    const handlers: Record<string, (e: { payload: unknown }) => void> = {};
    vi.mocked(listen).mockImplementation(async (name, cb) => {
      handlers[name] = cb as (e: { payload: unknown }) => void;
      return () => {};
    });
    let releaseEnv!: () => void;
    const envGate = new Promise<void>((r) => (releaseEnv = r));
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "goals":
        case "inbox":
        case "projects":
        case "snoozed_inbox":
        case "engines":
          return [];
        case "environment":
          await envGate;
          return { data_dir: "/x", problems: [] };
        case "settings":
          return { language: "en", remote_enabled: false };
        default:
          return null;
      }
    });
    const { init, state } = await import("../store");
    const loading = init();
    // The snapshot has been read (no cards); while the rest of the start-up is still waiting, a card arrives.
    await vi.waitFor(() => expect(handlers["tower://update"]).toBeDefined());
    await new Promise((r) => setTimeout(r, 0));
    handlers["tower://update"]({ payload: { type: "inbox", items: [card], snoozed: [] } });
    releaseEnv();
    await loading;
    expect(state.loaded).toBe(true);
    expect(state.inbox.map((i) => i.id)).toEqual(["I-9"]);
  });
});
