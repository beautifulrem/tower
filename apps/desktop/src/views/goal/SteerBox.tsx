/**
 * Multimodal Directive / Steering Console (lazy-loaded out of GoalPage):
 * Steer Now vs Queue for Next Turn, clipboard/drop screenshots, `@file` fuzzy autocomplete.
 */
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

import { Icon } from "../../components/Glyph";
import { Button } from "../../components/ui";
import { api } from "../../lib/api";
import { matchText } from "../../lib/fuzzy";
import { t } from "../../lib/i18n";
import { act, toast } from "../../lib/store";
import { type AttachmentRef, attachImageFile, callCmd, extractImages } from "./ext";

export type SteerMode = "now" | "queue";

export function atTokenAt(text: string, caret: number): { start: number; query: string } | null {
  const m = /(?:^|\s)@([^\s@]*)$/.exec(text.slice(0, caret));
  return m ? { start: caret - m[1].length - 1, query: m[1] } : null;
}

export function SteerBox(props: { id: string; running: boolean; files?: string[] }) {
  const [text, setText] = createSignal("");
  const [mode, setMode] = createSignal<SteerMode>(props.running ? "now" : "queue");
  const [atts, setAtts] = createSignal<AttachmentRef[]>([]);
  const [drag, setDrag] = createSignal(false);
  const [receipt, setReceipt] = createSignal<string | null>(null);
  const [wsFiles, setWsFiles] = createSignal<string[]>([]);
  const [at, setAt] = createSignal<{ start: number; query: string } | null>(null);
  const [sel, setSel] = createSignal(0);
  let ta!: HTMLTextAreaElement, fileIn!: HTMLInputElement, loaded = false;

  createEffect(() => setMode(props.running ? "now" : "queue"));
  const ensureFiles = () => !loaded && ((loaded = true), void callCmd<string[]>("workspace_files", { id: props.id }).then((l) => l?.length && setWsFiles(l)));

  const hits = createMemo<string[]>(() => {
    const a = at();
    if (!a) return [];
    const list = [...new Set([...(props.files ?? []), ...wsFiles()])];
    return a.query
      ? list.map((p) => [p, matchText(a.query, p)?.score ?? -1] as [string, number]).filter((x) => x[1] >= 0).sort((x, y) => y[1] - x[1]).slice(0, 8).map((x) => x[0])
      : list.slice(0, 8);
  });

  const pick = (path: string) => {
    const tok = at();
    if (!tok) return;
    const caret = ta?.selectionStart ?? tok.start + tok.query.length + 1;
    setText(`${text().slice(0, tok.start)}@${path} ${text().slice(caret)}`);
    setAt(null);
    queueMicrotask(() => (ta?.focus(), ta?.setSelectionRange(tok.start + path.length + 2, tok.start + path.length + 2)));
  };

  const addImgs = async (files: File[]) => {
    for (const f of files) {
      try {
        const ref = await attachImageFile(f, props.id);
        setAtts((p) => [...p, ref]);
      } catch {
        toast("error", "Attach failed");
      }
    }
  };

  const send = async (override?: SteerMode) => {
    const q = (override ?? mode()) === "queue";
    const body = `${text().trim()}${atts().length ? `\n${atts().map((a) => `[attachment: ${a.path}]`).join("\n")}` : ""}`.trim();
    if (!body) return;
    const r = await act(() => (q ? invoke<string>("steer", { id: props.id, text: body, queue: true }).catch(() => api.steer(props.id, body)) : api.steer(props.id, body)));
    if (r) {
      setText("");
      setAtts([]);
      setAt(null);
      setReceipt(r === "queued_for_next_run" || q ? t("goal.queuedNextRun") : t("goal.delivered", { what: r === "queued" ? t("goal.afterCurrentStep") : r }));
      setTimeout(() => setReceipt(null), 5000);
    }
  };

  return (
    <div
      class="steer-console"
      classList={{ "drag-over": drag() }}
      onDragOver={(e) => (e.preventDefault(), setDrag(true))}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => (e.preventDefault(), setDrag(false), void addImgs(extractImages(e.dataTransfer)))}
    >
      <div class="steer-bar">
        <span class="steer-title">Steering directive</span>
        <div class="steer-mode" role="tablist" aria-label="Delivery timing">
          <button type="button" class="tab" role="tab" aria-selected={mode() === "now"} classList={{ active: mode() === "now" }} disabled={!props.running} onClick={() => setMode("now")}>Steer now</button>
          <button type="button" class="tab" role="tab" aria-selected={mode() === "queue"} classList={{ active: mode() === "queue" }} onClick={() => setMode("queue")}>Queue for next turn</button>
        </div>
        <span class="grow" />
        <input ref={fileIn} type="file" accept="image/*" multiple hidden onChange={(e) => (e.currentTarget.files?.length && void addImgs(Array.from(e.currentTarget.files)), (e.currentTarget.value = ""))} />
        <button type="button" class="link-quiet text-btn meta" onClick={() => fileIn.click()}><Icon name="plus" size={10} /> Attach</button>
      </div>
      <Show when={atts().length > 0}>
        <div class="att-list">
          <For each={atts()}>
            {(a) => (
              <span class="att-chip">
                <Show when={a.preview}><img class="att-thumb" src={a.preview} alt={a.name} /></Show>
                <span class="ellipsis mono">{a.name}</span>
                <button type="button" class="icon-btn" aria-label={t("common.remove")} onClick={() => (setAtts((p) => p.filter((x) => x.id !== a.id)), void callCmd("delete_attachment", { goalId: props.id, attachmentId: a.id }))}>×</button>
              </span>
            )}
          </For>
        </div>
      </Show>
      <div class="steer-input-wrap">
        <Show when={at() && hits().length > 0}>
          <div class="steer-at-pop" role="listbox">
            <For each={hits()}>
              {(p, i) => <button type="button" class="steer-at-item ellipsis" role="option" aria-selected={i() === sel()} classList={{ selected: i() === sel() }} onMouseDown={(e) => (e.preventDefault(), pick(p))}>{p}</button>}
            </For>
          </div>
        </Show>
        <textarea
          ref={ta}
          rows={1}
          aria-label="Steering directive"
          placeholder={mode() === "queue" ? t("goal.steerPaused") : t("goal.steerRunning")}
          value={text()}
          onFocus={ensureFiles}
          onInput={(e) => {
            const v = e.currentTarget.value, tok = atTokenAt(v, e.currentTarget.selectionStart ?? v.length);
            setText(v);
            if (tok) ensureFiles();
            setAt(tok);
            setSel(0);
          }}
          onPaste={(e) => {
            const imgs = extractImages(e.clipboardData);
            if (imgs.length) (e.preventDefault(), void addImgs(imgs));
          }}
          onKeyDown={(e) => {
            const h = hits();
            if (at() && h.length) {
              if (e.key === "ArrowDown") return (e.preventDefault(), setSel((s) => Math.min(s + 1, h.length - 1)));
              if (e.key === "ArrowUp") return (e.preventDefault(), setSel((s) => Math.max(s - 1, 0)));
              if (e.key === "Enter" || e.key === "Tab") return (e.preventDefault(), pick(h[sel()]));
              if (e.key === "Escape") return (e.stopPropagation(), setAt(null));
            }
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") (e.preventDefault(), void send(e.altKey ? "queue" : mode()));
          }}
        />
        <Show when={receipt()}><span class="meta saved-stamp" role="status">{receipt()}</span></Show>
        <Button size="s" disabled={!text().trim() && !atts().length} onClick={() => void send()} kbd={mode() === "queue" ? "alt+mod+enter" : "mod+enter"}>
          {mode() === "queue" ? "Queue" : t("common.send")}
        </Button>
      </div>
    </div>
  );
}
