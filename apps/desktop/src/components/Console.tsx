/**
 * The consoles' shared parts (Learning, Operations, the peek drawer): section heads, compact buttons, meter cells, the
 * project filter, provenance rows, the instrument table, and list storage that updates rows in place.
 */
import { For, type JSX, Show, type Signal } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import { t } from "../lib/i18n";
import { state } from "../lib/store";
import { ProvenanceFrame } from "./ProvenanceFrame";
import { Empty, Failed, Select } from "./ui";

/** The project filter's "all projects". */
export const ALL = "__all__";

/**
 * A console list's resource storage: each load is merged into the last one by `key`, so a refetch after an action
 * updates the rows in place instead of drawing them anew, and the control you used keeps its focus.
 */
export const inPlace = (key = "id") => <T,>(init: T | undefined): Signal<T | undefined> => {
  const [s, set] = createStore({ v: init });
  return [() => s.v, (v: unknown) => (set("v", reconcile(typeof v === "function" ? v(s.v) : v, { key })), s.v)] as Signal<T | undefined>;
};

/** Shared section header with calm inline tabular metadata and right-aligned controls. */
export function SecHead(props: { title: string; meta?: JSX.Element; children?: JSX.Element }) {
  return (
    <div class="console-sec-head halt">
      <div class="meta-inline">
        <h2 class="section-title">{props.title}</h2>
        {props.meta}
      </div>
      <span class="grow" />
      {props.children}
    </div>
  );
}

/** Shared compact action button for console tables and ledgers. */
export function SmBtn(props: { variant?: "primary" | "default" | "ghost"; disabled?: boolean; type?: "button" | "submit"; label?: string; hidden?: boolean; onClick?: () => void; children: JSX.Element }) {
  return (
    <button type={props.type ?? "button"} class={`btn btn-${props.variant ?? "ghost"} btn-s`} disabled={props.disabled} hidden={props.hidden} aria-label={props.label} onClick={props.onClick}>
      <span class="btn-label">{props.children}</span>
    </button>
  );
}

/** Shared micro meter cell used in Calibration and Storage tables. */
export function MeterCell(props: { label: string; width: string; cls?: string; wrapCls?: string }) {
  return (
    <span class={props.wrapCls ?? "rate-cell"}>
      <span>{props.label}</span>
      <span class="meter-micro"><i class={`meter-micro-fill${props.cls ? ` ${props.cls}` : ""}`} style={{ width: props.width }} /></span>
    </span>
  );
}

/** Shared all-projects filter dropdown for console tables. */
export function ProjectFilter(props: { value: string; onChange: (v: string) => void; min?: number }) {
  return (
    <Show when={state.projects.length > (props.min ?? 0)}>
      <Select class="overview-filter" label={t("overview.filterLabel")} value={props.value} options={[{ value: ALL, label: t("overview.allProjects") }, ...state.projects.map((p) => ({ value: p.id, label: p.name }))]} onChange={props.onChange} />
    </Show>
  );
}

/** Shared Swiss hanging-label provenance row used by lazy console views (Fact / Claim / Human). */
export function ProvBox(props: { kind: "fact" | "claim" | "human"; badge?: string; meta?: string; aside?: JSX.Element; danger?: boolean; children: JSX.Element }) {
  return <ProvenanceFrame kind={props.kind} label={props.badge} meta={props.meta} aside={props.aside} danger={props.danger}>{props.children}</ProvenanceFrame>;
}

/** Shared single-border numeric instrument table with empty state. */
export function DataTable<T>(props: { headers: [string, boolean?][]; empty: string; items: T[]; row: (item: T) => JSX.Element; error?: unknown; onRetry?: () => void }) {
  return (
    <Show when={props.items.length > 0} fallback={<Failed inline error={props.error} onRetry={() => props.onRetry?.()} pending={<Empty title={props.empty} inline />} />}>
      <div class="data-table-wrap">
        <table class="data-table num">
          <thead>
            <tr>
              <For each={props.headers}>{([h, r]) => <th classList={{ "col-r": !!r }}>{h}</th>}</For>
            </tr>
          </thead>
          <tbody>
            <For each={props.items}>{(it) => props.row(it)}</For>
          </tbody>
        </table>
      </div>
    </Show>
  );
}
