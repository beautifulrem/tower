/**
 * The review's colours, ready before it opens. A goal waiting for review is
 * the next thing you are likely to read: while the window idles, its diff is
 * fetched once and its hunks are highlighted into the cache the review reads
 * from, so the first frame of the review is already coloured instead of
 * tinting in a second or two later. Once per goal and snapshot, at most three
 * goals, never before the first frame.
 */
import { createEffect } from "solid-js";

import { api } from "./api";
import { goalList } from "./store";

const done = new Set<string>();
const MAX_GOALS = 3;

type IdleWindow = { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
/** WebKit has no requestIdleCallback: there, a beat after the frame. */
const idle = (run: () => void) => {
  const w = window as unknown as IdleWindow;
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 2000 });
  else setTimeout(run, 300);
};

/** Call from inside a component: follows the goals waiting for review for its lifetime. */
export function prewarmReviews() {
  createEffect(() => {
    for (const g of goalList().filter((x) => x.state === "in_review" && x.diffstat).slice(0, MAX_GOALS)) {
      const key = `${g.id}@${g.verified_pin ?? ""}`;
      if (done.has(key)) continue;
      done.add(key);
      idle(() => {
        void api
          .review(g.id)
          .then((v) => import("./highlight").then((m) => m.prewarm(v.files)))
          .catch(() => {});
      });
    }
  });
}
