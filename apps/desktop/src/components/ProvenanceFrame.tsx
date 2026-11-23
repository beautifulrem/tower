/**
 * Shared physical provenance containers (docs/19 §19.3) and instrument pills.
 * Distinguishable by border geometry in greyscale:
 *   - fact:        solid hairline + 2px solid precision rule
 *   - observation: dotted neutral surround, never colored
 *   - claim:       2px dashed left rule + dashed surround, never green
 *   - human:       2px solid ink rule, uncolored authority
 */
import type { JSX } from "solid-js";

import type { EngineTrustTier, TaintLevel } from "../lib/apiTypes";
import { t } from "../lib/i18n";
import { Icon } from "./Glyph";

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
      class={`prov-frame prov-${props.kind} ${props.class ?? ""}`}
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
          {props.label ?? t(PROV_LABELS[props.kind])}
        </span>
        {props.meta && <span class="prov-meta">{props.meta}</span>}
        <span class="grow" />
        {props.aside}
      </div>
      <div class="prov-body">{props.children}</div>
    </div>
  );
}

const TRUST_CLS: Record<EngineTrustTier, string> = {
  full_s2: "trust-full",
  restricted_s2: "trust-restricted",
  experimental: "trust-experimental",
};

/** Engine sandbox trust-tier instrument pill (`Full S2` / `Restricted S2` / `Experimental`). */
export function TrustPill(props: { tier: EngineTrustTier; label: string; title?: string }) {
  return <span class={`trust-pill ${TRUST_CLS[props.tier]}`} title={props.title}>{props.label}</span>;
}

/** Memory proposal taint-level pill (`None` / `Standard` / `High`). */
export function TaintPill(props: { level: TaintLevel; label: string; title?: string }) {
  return <span class={`taint-pill taint-${props.level}`} title={props.title}>{props.label}</span>;
}
