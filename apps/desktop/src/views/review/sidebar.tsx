/**
 * The review's left column and its path palette: risk-ordered units, the
 * file tree, and ⌘P to jump by path.
 */
import { For, Show, createMemo, createSignal } from "solid-js";

import { Icon } from "../../components/Glyph";
import { Overlay } from "../../components/ui";
import type { DiffFile } from "../../gen/DiffFile";
import type { ReviewUnit } from "../../gen/ReviewUnit";
import type { TreeNode } from "../../lib/filetree";
import { type Match, matchText, segments } from "../../lib/fuzzy";
import { t } from "../../lib/i18n";

/** A unit as a group row of the tree: its title, line count; risk bars only when present. Its files are named once, under it.
    The current unit is the one on the selected ground; no caret, because nothing here folds (an always-open tree item). */
export function UnitItem(props: { u: ReviewUnit; active: boolean; viewed: boolean; onClick: () => void }) {
  return (
    <button
      class="unit"
      role="treeitem"
      aria-expanded="true"
      aria-selected={props.active}
      classList={{ active: props.active }}
      aria-current={props.active ? "true" : undefined}
      onClick={props.onClick}
      title={props.u.risk_reasons.join("\n") || props.u.title}
    >
      <span class="unit-name">
        {props.u.title}
        <span class="unit-dir"> {t("common.files", { n: props.u.files.length })}</span>
      </span>
      <span class="unit-lines num">{t("review.lines", { n: props.u.lines })}</span>
      <span class="unit-flags">
        <Show when={props.u.risk >= 2}>
          <span class="unit-risk" role="img" aria-label={t("review.risk", { n: props.u.risk })}>
            <i />
            <Show when={props.u.risk >= 3}>
              <i />
            </Show>
          </span>
        </Show>
        <Show when={props.viewed}>
          <Icon name="check" size={10} label={t("review.viewed")} />
        </Show>
      </span>
    </button>
  );
}

/** A row of the file tree: directories fold, files show +/−, viewed files step back. */
export function TreeRow(props: {
  node: TreeNode;
  depth: number;
  fileOf: (path: string) => DiffFile | undefined;
  viewed: (path: string) => boolean;
  shown: (path: string) => boolean;
  onOpen: (path: string) => void;
}) {
  const [open, setOpen] = createSignal(true);
  const f = () => props.fileOf(props.node.path);
  return (
    <Show
      when={props.node.file}
      fallback={
        <>
          <button class="tree-row tree-dir" role="treeitem" aria-expanded={open()} style={{ "--depth": props.depth }} onClick={() => setOpen((o) => !o)}>
            <Icon name={open() ? "caret-down" : "caret-right"} size={10} />
            <span class="ellipsis">{props.node.name}</span>
          </button>
          <Show when={open()}>
            <div role="group" aria-label={props.node.name}>
              <For each={props.node.children}>{(c) => <TreeRow {...props} node={c} depth={props.depth + 1} />}</For>
            </div>
          </Show>
        </>
      }
    >
      <button
        class="tree-row tree-file"
        role="treeitem"
        aria-selected={props.shown(props.node.path)}
        classList={{ viewed: props.viewed(props.node.path), shown: props.shown(props.node.path) }}
        aria-current={props.shown(props.node.path) ? "true" : undefined}
        style={{ "--depth": props.depth }}
        title={props.node.path}
        onClick={() => props.onOpen(props.node.path)}
      >
        <span class="ellipsis grow">{props.node.name}</span>
        <Show when={f()}>
          {(file) => (
            <span class="num tree-stat">
              <span class="diff-add">+{file().additions}</span> <span class="diff-del">−{file().deletions}</span>
            </span>
          )}
        </Show>
        <Show when={props.viewed(props.node.path)}>
          <Icon name="check" size={10} label={t("review.viewed")} />
        </Show>
      </button>
    </Show>
  );
}

/** ⌘P: type part of a path, land on the file. */
export function PathPalette(props: { paths: string[]; fileOf: (path: string) => DiffFile | undefined; onClose: () => void; onPick: (path: string) => void }) {
  const [q, setQ] = createSignal("");
  const [sel, setSel] = createSignal(0);
  const hits = createMemo<{ path: string; m: Match | null }[]>(() => {
    const n = q().trim();
    if (!n) return props.paths.map((path) => ({ path, m: null }));
    return props.paths
      .map((path) => ({ path, m: matchText(n, path) }))
      .filter((x): x is { path: string; m: Match } => x.m !== null)
      .sort((a, b) => b.m.score - a.m.score)
      .slice(0, 12);
  });
  const pick = (i: number) => {
    const h = hits()[i];
    if (h) props.onPick(h.path);
  };
  return (
    <Overlay onClose={props.onClose} label={t("review.pathPalette")} instant class="palette" top>
      <div class="palette-field">
        <span class="palette-prompt" aria-hidden="true">
          ›
        </span>
        <input
          class="palette-input"
          role="combobox"
          aria-expanded="true"
          aria-controls="path-list"
          aria-autocomplete="list"
          aria-label={t("review.pathPalette")}
          placeholder={t("review.pathPlaceholder")}
          value={q()}
          onInput={(e) => (setQ(e.currentTarget.value), setSel(0))}
          onKeyDown={(e) => {
            if (e.isComposing) return;
            if (e.key === "ArrowDown") (e.preventDefault(), setSel((s) => Math.min(s + 1, hits().length - 1)));
            else if (e.key === "ArrowUp") (e.preventDefault(), setSel((s) => Math.max(s - 1, 0)));
            else if (e.key === "Enter") pick(sel());
          }}
        />
      </div>
      <div class="palette-list" id="path-list" role="listbox" aria-label={t("review.filesLabel")}>
        <For each={hits()} fallback={<div class="palette-empty"><span class="t2">{t("chrome.noMatchesFor", { q: q().trim() })}</span></div>}>
          {(h, i) => (
            <div class="palette-item mono" role="option" aria-selected={i() === sel()} classList={{ selected: i() === sel() }} onMouseMove={() => sel() !== i() && setSel(i())} onClick={() => pick(i())}>
              <span class="palette-icon">
                <Icon name="chevron-right" />
              </span>
              <span class="ellipsis grow">
                <For each={h.m ? segments(h.path, h.m.positions) : [[h.path, false] as [string, boolean]]}>{([s, hit]) => (hit ? <span class="hl">{s}</span> : s)}</For>
              </span>
              {/* The same reading the tree shows, so the two places agree. */}
              <Show when={props.fileOf(h.path)}>
                {(f) => (
                  <span class="num tree-stat t3">
                    <span class="diff-add">+{f().additions}</span> <span class="diff-del">−{f().deletions}</span>
                  </span>
                )}
              </Show>
            </div>
          )}
        </For>
      </div>
      <div class="palette-foot">
        <span>{t("chrome.paletteHints")}</span>
        <span class="grow" />
        <span class="num">{t("chrome.paletteCount", { n: hits().length })}</span>
      </div>
    </Overlay>
  );
}
