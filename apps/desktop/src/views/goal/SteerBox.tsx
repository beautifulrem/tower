/**
 * Multimodal Directive / Steering Console (lazy-loaded out of GoalPage):
 * Steer Now vs Queue for Next Turn, clipboard/drop screenshots, `@file` fuzzy autocomplete.
 */
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";

import { Icon } from "../../components/Glyph";
import { Button } from "../../components/ui";
import { api, errorText } from "../../lib/api";
import { matchText } from "../../lib/fuzzy";
import { t } from "../../lib/i18n";
import { act, toast } from "../../lib/store";
import type { AttachmentRef } from "./ext";

const IMG_RE = /^image\/(png|jpeg|webp|gif)$/;

export function extractImages(dt: DataTransfer | null | undefined): File[] {
  if (!dt) return [];
  const raw = dt.items ? Array.from(dt.items, (i) => (i.kind === "file" ? i.getAsFile() : null)).filter((f): f is File => !!f) : [];
  return (raw.length ? raw : Array.from(dt.files ?? [])).filter((f) => IMG_RE.test(f.type) && f.size <= 8 * 1048576);
}

export async function attachImageFile(file: File, goalId?: string): Promise<AttachmentRef> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result ?? ""));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
  const name = file.name || `shot-${Date.now()}.${file.type.split("/")[1] || "png"}`;
  // A contract being written has no goal yet: its images wait in the draft slot, and creating the goal moves them in.
  const saved = await api.saveAttachment(goalId ?? "draft", name, dataUrl.slice(dataUrl.indexOf(",") + 1));
  return { ...saved, preview: dataUrl };
}

export async function collectImages(files: File[], goalId: string | undefined, add: (ref: AttachmentRef) => void) {
  for (const f of files) {
    try {
      add(await attachImageFile(f, goalId));
    } catch (e) {
      toast("error", errorText(e));
    }
  }
}

export function AttachChips(props: { items: AttachmentRef[]; onRemove: (a: AttachmentRef) => void }) {
  return (
    <Show when={props.items.length > 0}>
      <div class="att-list">
        <For each={props.items}>
          {(a) => (
            <span class="att-chip">
              <Show when={a.preview}><img class="att-thumb" src={a.preview} alt={a.name} /></Show>
              <span class="ellipsis mono">{a.name}</span>
              <button type="button" class="icon-btn" aria-label={t("common.remove")} onClick={() => props.onRemove(a)}>×</button>
            </span>
          )}
        </For>
      </div>
    </Show>
  );
}

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
  const ensureFiles = () => !loaded && ((loaded = true), void api.workspaceFiles(props.id).catch(() => null).then((l) => l?.length && setWsFiles(l)));

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

  const addImgs = (files: File[]) => void collectImages(files, props.id, (ref) => setAtts((p) => [...p, ref]));

  const send = async (override?: SteerMode) => {
    const q = (override ?? mode()) === "queue";
    const body = `${text().trim()}${atts().length ? `\n${atts().map((a) => `[attachment: ${a.path}]`).join("\n")}` : ""}`.trim();
    if (!body) return;
    const r = await act(() => api.steer(props.id, body, q));
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
        <span class="steer-title">{t("goal.steerTitle")}</span>
        <div class="steer-mode" role="tablist" aria-label={t("goal.steerNow")}>
          <button type="button" class="tab" role="tab" aria-selected={mode() === "now"} classList={{ active: mode() === "now" }} disabled={!props.running} onClick={() => setMode("now")}>{t("goal.steerNow")}</button>
          <button type="button" class="tab" role="tab" aria-selected={mode() === "queue"} classList={{ active: mode() === "queue" }} onClick={() => setMode("queue")}>{t("goal.steerNext")}</button>
        </div>
        <span class="grow" />
        <input ref={fileIn} type="file" accept="image/*" multiple hidden onChange={(e) => (e.currentTarget.files?.length && void addImgs(Array.from(e.currentTarget.files)), (e.currentTarget.value = ""))} />
        <button type="button" class="link-quiet text-btn meta" onClick={() => fileIn.click()}><Icon name="plus" size={10} /> {t("goal.attach")}</button>
      </div>
      <AttachChips items={atts()} onRemove={(a) => (setAtts((p) => p.filter((x) => x.id !== a.id)), void api.deleteAttachment(props.id, a.id).catch(() => {}))} />
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
          aria-label={t("goal.steerTitle")}
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
          {mode() === "queue" ? t("goal.steerQueueBtn") : t("common.send")}
        </Button>
      </div>
    </div>
  );
}
