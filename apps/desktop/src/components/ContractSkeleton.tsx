import { For } from "solid-js";

import { t } from "../lib/i18n";

/**
 * The contract editor before its chunk and words arrive (measured on a production build: 90–180 ms from the board,
 * up to 400 ms opened cold), and before the draft or contract it edits is read: the document's shape in the board's
 * ghost language — the masthead's place, three clause heads with their numbers and rules, hollow lines where the
 * fields will be. It shows only past 150 ms, so a fast open never flashes it, and it appears without fading (with
 * reduced motion too).
 */
export function ContractSkeleton() {
  const clauses = [
    [72, 100, 100],
    [48, 100],
    [56, 100, 64],
  ];
  return (
    <div class="editor contract-skeleton" role="status" aria-label={t("common.loading")}>
      <div class="editor-main" aria-hidden="true">
        <div class="contract-mast">
          <i class="ghost-bar" style={{ width: "14em" }} />
        </div>
        <For each={clauses}>
          {(fields, i) => (
            <div class="editor-block">
              <header class="clause-head">
                <span class="clause-no num">{String(i() + 1).padStart(2, "0")}</span>
                <i class="ghost-bar" style={{ width: `${fields[0] / 8}em` }} />
                <span class="clause-rule" />
              </header>
              <For each={fields.slice(1)}>{(w) => <i class="ghost-field" style={{ width: `${w}%` }} />}</For>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
