/**
 * Shared Four-Provenance Swiss hanging-gutter layout (docs/19 §19.3) and
 * exception-only trust/taint indicators.
 *
 *   - fact:        scale mark + hanging label (`--text-3`), `--text-1` body
 *   - observation: hollow ring + hanging label, `--text-2` body, never colored
 *   - claim:       `┆` rule + hanging label, `--text-2` body, NEVER green
 *   - human:       uncolored authority label, `--text-1` primary ink body
 */
import type { JSX } from "solid-js";

import type { EngineTrustTier, TaintLevel } from "../lib/apiTypes";
import { t } from "../lib/i18n";
import { DangerMark, Icon, NoticeMark } from "./Glyph";

export type ProvenanceKind = "fact" | "observation" | "claim" | "human";

const PROV_LABELS = {
  fact: "honesty.measured",
  observation: "honesty.observation",
  claim: "honesty.agentSaysPlain",
  human: "common.you",
} as const;

export function ProvenanceFrame(props: {
  kind: ProvenanceKind;
  label?: string;
  meta?: JSX.Element;
  aside?: JSX.Element;
  verified?: boolean;
  danger?: boolean;
  class?: string;
  children: JSX.Element;
}) {
  return (
    <div
      class={`prov-frame prov-${props.kind}${props.class ? ` ${props.class}` : ""}`}
      classList={{ "prov-verified": props.kind === "fact" && !!props.verified, "prov-danger": props.kind === "fact" && !!props.danger }}
    >
      <div class="prov-head halt">
        <span class="prov-badge">
          {props.kind === "fact" ? (
            <Icon name="harness" size={10} />
          ) : props.kind === "observation" ? (
            <Icon name="ring" size={10} />
          ) : props.kind === "claim" ? (
            <span class="claim-rule" aria-hidden="true">┆</span>
          ) : null}
          {/* A claim's frame names its speaker before its kind: "Agent says · Next", never "Next" alone. */}
          <span>{props.kind === "claim" && props.label ? `${t("honesty.agentSaysPlain")} · ${props.label}` : (props.label ?? t(PROV_LABELS[props.kind]))}</span>
        </span>
        {props.meta && <span class="prov-meta">{props.meta}</span>}
      </div>
      <div class="prov-body">{props.children}</div>
      {props.aside && <div class="prov-aside">{props.aside}</div>}
    </div>
  );
}

const TRUST_CLS: Record<EngineTrustTier, string> = {
  full_s2: "trust-full",
  restricted_s2: "trust-restricted",
  experimental: "trust-experimental",
};

/** Engine sandbox trust-tier indicator (`Full S2` / `Restricted S2` plain text; `Experimental` framed). */
export function TrustPill(props: { tier: EngineTrustTier; label: string; title?: string }) {
  return <span class={`trust-pill ${TRUST_CLS[props.tier]}`} title={props.title}>{props.label}</span>;
}

/** Memory proposal taint-level indicator (`None` quiet; `Standard` glyph + text; `High` danger chip). */
export function TaintPill(props: { level: TaintLevel; label: string; title?: string }) {
  return (
    <span class={`taint-pill taint-${props.level}`} title={props.title}>
      {props.level === "high" ? <DangerMark /> : props.level === "standard" ? <NoticeMark /> : null}
      <span>{props.label}</span>
    </span>
  );
}
