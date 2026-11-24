/**
 * Title bar instrument strip (docs/19 §19.2):
 * Borderless Airbus/Linear lights-out readings — blocking Needs-You count,
 * swept RunsGauge, heartbeat, spend, sandbox posture (framed only on warning),
 * quiet hours, remote phone posture, and active engine.
 */
import { Show } from "solid-js";

import { clock, usd } from "../lib/format";
import { t } from "../lib/i18n";
import { engineLabel, hasIssue, isBlocking } from "../lib/labels";
import { openActivity } from "../lib/layers";
import { go } from "../lib/nav";
import { goalList, quietNow, quietUntil, state } from "../lib/store";
import { Heartbeat, RunsGauge, pickQuiet } from "./Chrome";
import { Icon, NeedsYouMark } from "./Glyph";

export function TelemetryStrip() {
  const running = () => goalList().filter((g) => g.state === "running").length;
  const spent = () => goalList().reduce((s, g) => s + g.cost_usd, 0);
  const max = () => state.settings?.max_concurrent ?? 3;
  const blocking = () => state.inbox.filter(isBlocking).length;
  const engine = () => state.settings?.engine || "pi";
  const engineOk = () => {
    const e = engine();
    if (e === "claude-code") return !hasIssue(state.env, "claude_missing");
    if (e === "pi") return !!state.env?.pi_version;
    return state.engines.find((d) => d.id === e)?.available ?? true;
  };
  const noSandbox = () => hasIssue(state.env, "no_sandbox");
  const sandboxWarn = () => noSandbox() || (state.sandboxPosture?.warnings.length ?? 0) > 0;
  const sandboxLabel = () => {
    const raw = state.sandboxPosture?.backend_name;
    if (raw) return raw.replace(/^macOS\s+Seatbelt\s*\(S2\)$/i, "Seatbelt S2");
    return noSandbox() ? t("chrome.sandboxOff") : t("chrome.sandboxOn");
  };
  const engineMeta = () => {
    const e = engine();
    if (e === "claude-code") {
      const cmd = state.settings?.claude_acp_command || "claude-agent-acp";
      return { title: `${t("chrome.engine")}: Claude Code, ${cmd}`, label: "Claude Code" };
    }
    if (e === "pi") {
      const v = state.env?.pi_version ?? "";
      return { title: `${t("chrome.engine")}: Pi ${v}, ${state.env?.pi_path ?? ""}`, label: "Pi" };
    }
    const lbl = engineLabel(e);
    return { title: `${t("chrome.engine")}: ${lbl}`, label: lbl };
  };

  return (
    <div class="titlebar-gauges num halt" data-tauri-drag-region>
      <Show when={state.unseenActivity > 0}>
        <button
          class="gauge gauge-errors link-plain"
          onClick={() => openActivity()}
          aria-label={t("chrome.unseenErrors", { n: state.unseenActivity })}
          title={t("chrome.unseenErrors", { n: state.unseenActivity })}
        >
          <span class="gauge-dot down" />
          {t("chrome.errorsShort", { n: state.unseenActivity })}
        </button>
      </Show>
      <Show when={blocking() > 0}>
        <button class="tel-blocking" onClick={() => go({ name: "inbox" })} title={t("chrome.openInbox")} aria-label={`${t("common.needsYou")} ${blocking()}`}>
          <NeedsYouMark />
          <span>{blocking()}</span>
        </button>
      </Show>
      <Show when={running() > 0}>
        <span class="gauge gauge-active" title={t("chrome.running", { n: running(), max: max() })}>
          <RunsGauge n={running()} max={max()} />
          {t("chrome.runningShort", { n: running(), max: max() })}
        </span>
      </Show>
      <Heartbeat running={running()} />
      <span class="gauge" title={t("chrome.spent", { usd: usd(spent()) })}>{usd(spent())}</span>
      <button
        class="gauge gauge-sandbox link-plain"
        classList={{ warn: sandboxWarn() }}
        onClick={() => go({ name: "operations" })}
        title={t("chrome.sandboxTitle")}
      >
        <Show when={sandboxWarn()}>
          <NeedsYouMark />
        </Show>
        <span>{sandboxLabel()}</span>
      </button>
      <button
        class="gauge gauge-quiet link-plain"
        onClick={() => void pickQuiet()}
        aria-haspopup="menu"
        aria-label={quietNow() ? t("quiet.until", { time: clock(quietUntil()!) }) : t("quiet.menuTitle")}
        title={quietNow() ? t("quiet.until", { time: clock(quietUntil()!) }) : t("quiet.hint")}
      >
        <Icon name="bell" size={12} />
        <Show when={quietNow()}>{t("quiet.until", { time: clock(quietUntil()!) })}</Show>
      </button>
      <Show when={state.remoteProblem}>
        {(p) => (
          <button class="gauge gauge-down gauge-phone link-plain" onClick={() => go({ name: "settings" })} title={p()}>
            <NeedsYouMark />
            {t("chrome.phoneOff")}
          </button>
        )}
      </Show>
      <Show when={state.settings?.remote_enabled && !state.remoteProblem}>
        <button class="gauge gauge-phone-ok link-plain" onClick={() => go({ name: "settings" })} title={t("chrome.phoneOn")} aria-label={t("chrome.phoneOn")}>
          <Icon name="network" size={12} />
        </button>
      </Show>
      <Show
        when={engineOk()}
        fallback={
          <button class="gauge gauge-down link-plain" onClick={() => go({ name: "settings" })}>
            <span class="gauge-dot down" />
            {engine() === "claude-code" ? t("chrome.claudeNotReady") : t("chrome.piNotReady")}
          </button>
        }
      >
        <span class="gauge gauge-engine" title={engineMeta().title}>
          <span class="gauge-dot" />
          <span>{engineMeta().label}</span>
        </span>
      </Show>
    </div>
  );
}
