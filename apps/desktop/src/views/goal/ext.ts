/**
 * Forward-compatible DTO extensions, safe optional Tauri calls, shared image
 * attachment helpers, and compact bilingual labels for the Command Deck,
 * Review Theater, and Contract Studio.
 */
import { invoke } from "@tauri-apps/api/core";

import type { Contract } from "../../gen/Contract";
import type { CriterionResultView } from "../../gen/CriterionResultView";
import type { CriterionView } from "../../gen/CriterionView";
import type { DiffFile } from "../../gen/DiffFile";
import type { GoalDetail } from "../../gen/GoalDetail";
import type { GoalSummary } from "../../gen/GoalSummary";
import type { Hunk } from "../../gen/Hunk";
import type { LookView } from "../../gen/LookView";
import type { ReviewUnit } from "../../gen/ReviewUnit";
import type { ReviewView } from "../../gen/ReviewView";

export type SandboxTier = "default" | "micro_vm";
export type EngineTrustTier = "full_s2" | "restricted_s2" | "experimental";

export interface AttachmentRef {
  id: string;
  name: string;
  mime: string;
  path: string;
  size_bytes: number;
  created_at: number;
  /** Transient client preview URL (data URL) before persistence or in mock/demo mode. */
  preview?: string;
}

export interface SnapshotPoint {
  rev: string;
  kind: "base" | "run_start" | "verified" | "pin" | "saved";
  label: string;
  run_no: number | null;
  at: number | null;
}

export interface HoldoutDraft {
  id: string;
  filename: string;
  rationale: string;
  code: string;
}

export interface SandboxPosture {
  backend_name: string;
  microvm_available: boolean;
  warnings: string[];
}

export interface EngineDescriptor {
  id: string;
  label: string;
  trust_tier: EngineTrustTier;
  installed: boolean;
  available: boolean;
  note: string;
}

export type ExtContract = Contract & {
  escalation_model?: string;
  escalation_after_reworks?: number;
  attachments?: AttachmentRef[];
  sandbox_tier?: SandboxTier;
  depends_on?: string[];
};

export type ExtGoalSummary = GoalSummary & {
  sandbox_tier?: SandboxTier;
  port_base?: number | null;
  depends_on?: string[];
};

export type ExtGoalDetail = GoalDetail & {
  summary: ExtGoalSummary;
  contract: ExtContract;
  attachments?: AttachmentRef[];
  merge_queue_position?: number | null;
  escalated_model?: string | null;
};

export type ExtLookView = LookView & {
  console_errors?: string[];
  mobile_base?: string | null;
  mobile_pin?: string | null;
};

export type ExtCriterionResult = CriterionResultView & {
  flaky?: boolean | null;
  console_errors?: string[];
  mobile_look?: ExtLookView | null;
};

export type ExtCriterionView = CriterionView & {
  verified: ExtCriterionResult | null;
  look: ExtLookView | null;
};

export type ExtHunk = Hunk & {
  moved_unchanged?: boolean;
  formatting_only?: boolean;
};

export type ExtDiffFile = DiffFile & {
  moved_hunks?: number[];
  formatting_hunks?: number[];
};

export type ExtReviewUnit = ReviewUnit & {
  unit_claim_summary?: string | null;
};

export type ExtReviewView = ReviewView & {
  units: ExtReviewUnit[];
  files: ExtDiffFile[];
  snapshots?: SnapshotPoint[];
  moved_hunks?: Record<string, number[] | undefined>;
  formatting_hunks?: Record<string, number[] | undefined>;
};

export async function callCmd<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try { return (await invoke<T>(cmd, args)) ?? null; } catch { return null; }
}

export const trustTierOf = (e: string): EngineTrustTier =>
  !e || e === "pi" || e === "claude-code" ? "full_s2" : /^(codex|gemini-cli|opencode)$/.test(e) ? "restricted_s2" : "experimental";

export const trustLabel = (t: EngineTrustTier) => (t === "full_s2" ? "Full S2" : t === "restricted_s2" ? "Restricted S2" : "Experimental");

export const sandboxTag = (t: SandboxTier, noSb: boolean) => (t === "micro_vm" ? "MicroVM" : noSb ? "No sandbox S0" : "Sandbox S2");

const IMG_RE = /^image\/(png|jpeg|webp|gif)$/;

export function extractImages(dt: DataTransfer | null | undefined): File[] {
  if (!dt) return [];
  const raw = dt.items ? Array.from(dt.items, (i) => (i.kind === "file" ? i.getAsFile() : null)).filter((f): f is File => !!f) : [];
  const src = raw.length ? raw : Array.from(dt.files ?? []);
  return src.filter((f) => IMG_RE.test(f.type) && f.size <= 8 * 1048576);
}

export async function attachImageFile(file: File, goalId?: string): Promise<AttachmentRef> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result ?? ""));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
  const name = file.name || `shot-${Date.now()}.${file.type.split("/")[1] || "png"}`;
  if (goalId) {
    const saved = await callCmd<AttachmentRef>("save_attachment", { goalId, name, dataBase64: dataUrl.slice(dataUrl.indexOf(",") + 1) });
    if (saved) return { ...saved, preview: dataUrl };
  }
  return { id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, mime: file.type || "image/png", path: `attachments/${name}`, size_bytes: file.size, created_at: Date.now(), preview: dataUrl };
}
