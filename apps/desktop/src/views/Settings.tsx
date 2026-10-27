/**
 * Settings: the standing terms every goal starts from, set out like the
 * contract — numbered clauses (environment, engine defaults, memory,
 * projects, phone, attention, appearance) with an index of them beside the
 * page; each term's name left, its value right; every on/off a switch, as in
 * the contract. Every field saves when you leave it and the clause says so —
 * no Save button.
 */
import { For, Match, Show, Switch, createResource, createSignal, onMount } from "solid-js";

import { pickQuiet } from "../components/Chrome";
import { GitIdentityForm } from "../components/GitIdentity";
import { DangerMark, Icon, NeedsYouMark, NoticeMark } from "../components/Glyph";
import { TestCheckLine } from "../components/TestCheck";
import { Button, ClauseHead, Empty, Field, IconButton, Loading, Select, Toggle } from "../components/ui";
import { SETTINGS_CLAUSES, SettingsIndex } from "./SettingsIndex";
import type { ProjectView } from "../gen/ProjectView";
import type { PushStatus } from "../gen/PushStatus";
import type { QuietHours } from "../gen/QuietHours";
import type { Settings as SettingsT } from "../gen/Settings";
import { api, errorText } from "../lib/api";
import { clock } from "../lib/format";
import { locale, t } from "../lib/i18n";
import { engineLabel, envGauges, envIssueLabel, modelsFor } from "../lib/labels";
import { ask } from "../lib/native";
import { takeProjectField } from "../lib/nav";
import { act, quietNow, quietUntil, refreshEnvironment, refreshProjects, state, toast } from "../lib/store";
import { type SizeChoice, type ThemeChoice, setSizeChoice, setThemeChoice, sizeChoice, themeChoice } from "../lib/theme";
import { openPiLogin, pickProject } from "../components/Demo";

/** Thinking levels; call inside a reactive scope so "Pi default" follows the locale. */
export const thinkingOptions = () =>
  ["", "off", "minimal", "low", "medium", "high", "xhigh"].map((level) => ({
    value: level,
    label: level || t("common.piDefault"),
  }));

/** The engines a goal can run on. */
export const engineOptions = () => [
  { value: "pi", label: "Pi" },
  { value: "claude-code", label: "Claude Code" },
];

const MEMORY_MAX = 800;

const lines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** "Saved at 21:03", shown for five seconds after a write. */
function useSavedStamp() {
  const [at, setAt] = createSignal<number | null>(null);
  let timer: number | undefined;
  const mark = () => {
    setAt(Date.now());
    clearTimeout(timer);
    timer = window.setTimeout(() => setAt(null), 5000);
  };
  const Stamp = () => (
    <Show when={at()}>
      <span class="saved-stamp num">{t("settings.savedAt", { time: clock(at()!) })}</span>
    </Show>
  );
  return { mark, Stamp };
}

/** A segmented control: one selected ground, 22px tabs — the review's scope switch, reused. */
function Segmented<T extends string>(props: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; labelledBy: string }) {
  return (
    <span class="scope-switch" role="radiogroup" aria-labelledby={props.labelledBy}>
      <For each={props.options}>
        {(o) => (
          <button type="button" class="tab" role="radio" aria-checked={props.value === o.value} classList={{ active: props.value === o.value }} onClick={() => props.onChange(o.value)}>
            {o.label}
          </button>
        )}
      </For>
    </span>
  );
}

export function Settings() {
  const [s, setS] = createSignal<SettingsT | null>(null);
  const [models] = createResource(() => api.models().catch(() => null));
  const [theme, setTheme] = createSignal<ThemeChoice>(themeChoice());
  const [size, setSize] = createSignal<SizeChoice>(sizeChoice());
  const saved = useSavedStamp();
  onMount(async () => setS(await api.settings()));
  const noModels = () => !!state.env?.pi_version && !models.loading && models() !== null && models()!.length === 0;
  const engine = () => s()?.engine || "pi";
  const modelOptions = () => [
    { value: "", label: t("common.engineDefault", { engine: engineLabel(engine()) }) },
    ...modelsFor(models() ?? [], engine()).map((m) => ({ value: `${m.provider}/${m.id}`, label: engine() === "claude-code" ? m.name : `${m.provider}/${m.id}` })),
  ];

  let last = "";
  /** Writes the form when a field is left; no-op when nothing changed. */
  const commit = async (): Promise<boolean> => {
    const v = s();
    if (!v) return false;
    const now = JSON.stringify(v);
    if (now === last) return false;
    last = now;
    const ok = await act(() => api.saveSettings(v));
    if (ok === undefined) return false;
    saved.mark();
    await refreshEnvironment();
    // The supervisor may have filled in what we left blank (a generated pairing token).
    const fresh = state.settings;
    if (fresh) setS((cur) => (cur ? { ...cur, remote_token: fresh.remote_token } : cur));
    return true;
  };
  /**
   * The language applies at once: only the language is saved (other unsaved
   * edits stay in the form), and reloading the settings re-renders the
   * interface in the new language. The environment is fetched again too,
   * since the supervisor words its problems in the language it was asked in.
   */
  const setLanguage = async (language: string) => {
    patch({ language });
    const current = state.settings ?? (await api.settings());
    const ok = await act(() => api.saveSettings({ ...current, language }));
    if (ok !== undefined) saved.mark();
    await refreshEnvironment();
    patch({ language: state.settings?.language ?? language });
  };
  const [rechecking, setRechecking] = createSignal(false);
  const recheck = async () => {
    setRechecking(true);
    await refreshEnvironment();
    setRechecking(false);
  };
  const patch = (p: Partial<SettingsT>) => setS((cur) => (cur ? { ...cur, ...p } : cur));
  const patchNow = (p: Partial<SettingsT>) => {
    patch(p);
    return commit();
  };
  const quietLabel = () => (quietNow() ? t("quiet.until", { time: clock(quietUntil()!) }) : t("quiet.on"));

  return (
    <div class="settings-page">
    <div class="settings">
      <section class="settings-block" id={SETTINGS_CLAUSES[0].id}>
        {/* The hints below say "click Check again": the button is here, on the clause's head, as on the welcome page. */}
        <ClauseHead n={1} title={t("settings.environment")}>
          <Button size="s" variant="ghost" busy={rechecking()} onClick={() => void recheck()}>
            {t("welcome.recheck")}
          </Button>
        </ClauseHead>
        {/* The title bar's gauge cluster, brought down to the page: one line of readings — name, mark, value — and every problem
            spelled out under it in its check row, with its fix. The engine's path and the data folder are the quiet line between. */}
        <div class="env-gauges halt" role="list" aria-label={t("settings.environment")}>
          <For each={envGauges(state.env, state.settings?.engine)}>
            {(g) => (
              <span class="gauge env-gauge" role="listitem" data-key={g.key} data-mark={g.mark} title={g.title}>
                <span class="env-gauge-name">{g.label}</span>
                <Switch>
                  <Match when={g.mark === "ok"}>
                    <Icon name="check" size={10} class="t3" label={t("settings.gaugeOk")} />
                  </Match>
                  <Match when={g.mark === "danger"}>
                    <DangerMark />
                  </Match>
                  <Match when={g.mark === "attention"}>
                    <NeedsYouMark />
                  </Match>
                  <Match when={g.mark === "notice"}>
                    <NoticeMark />
                  </Match>
                </Switch>
                <span class="env-gauge-value num" classList={{ t1: g.mark !== "ok" }}>
                  {g.value}
                </span>
              </span>
            )}
          </For>
        </div>
        <p class="meta env-paths">
          <Show when={state.env?.pi_path && state.settings?.engine !== "claude-code"}>
            <span class="t3">Pi</span>
            <span class="code-val t2 break">{state.env!.pi_path}</span>
          </Show>
          <span class="t3">{t("settings.dataDir")}</span>
          <span class="code-val t2 break">{state.env?.data_dir}</span>
        </p>
        <For each={state.env?.issues ?? []}>
          {(i) => (
            <div class="check-row">
              <span class="check-mark">
                <Show when={i.blocking} fallback={<NoticeMark />}>
                  <DangerMark />
                </Show>
              </span>
              <span class="grow meta t1">{envIssueLabel(i, state.env)}</span>
              {/* A missing git identity is set here, in two fields, for every repository or one of them; the command stays beside them for a terminal. */}
              <Show when={i.kind === "git_identity_missing"}>
                <div class="check-action">
                  <GitIdentityForm projects={state.projects} />
                </div>
              </Show>
              <Show when={i.fix}>
                <button
                  class="fix code-val"
                  title={t("welcome.clickToCopy")}
                  onClick={() => {
                    void navigator.clipboard.writeText(i.fix!);
                    toast("success", t("welcome.copied"));
                  }}
                >
                  {i.fix}
                </button>
              </Show>
            </div>
          )}
        </For>
        <Show when={noModels()}>
          <div class="check-row">
            <span class="check-mark">
              <DangerMark />
            </span>
            <span class="grow meta t1">{t("welcome.noModels")}</span>
            <div class="check-action">
              <Button size="s" onClick={openPiLogin}>
                {t("welcome.openPiLogin")}
              </Button>
              <span>{t("welcome.openPiLoginHint")}</span>
            </div>
          </div>
        </Show>
      </section>

      <Show when={s()} fallback={<Loading text={t("settings.loading")} />}>
        <section class="settings-block" id={SETTINGS_CLAUSES[1].id} onFocusOut={() => void commit()}>
          <ClauseHead n={2} title={t("settings.engineDefaults")}>
            <saved.Stamp />
          </ClauseHead>
          <div class="settings-form">
            <Field label={t("settings.language")} hint={t("settings.languageHint")}>
              <Select
                value={s()!.language}
                options={[
                  { value: "zh-CN", label: "简体中文" },
                  { value: "en", label: "English" },
                ]}
                onChange={(v) => void setLanguage(v)}
              />
            </Field>
            {/* The engine: which agent new goals run on. The hint belongs to the chosen engine: Claude Code's trust model, or Pi in one line. */}
            <Field label={t("settings.engine")} hint={engine() === "claude-code" ? t("settings.engineTrust") : t("settings.engineHintPi")}>
              <Select value={engine()} options={engineOptions()} onChange={(v) => void patchNow({ engine: v, default_model: "" })} />
            </Field>
            <Show when={engine() === "claude-code"}>
              <Field label={t("settings.claudeAcp")} hint={t("settings.claudeAcpHint")}>
                <input class="mono" value={s()!.claude_acp_command} onInput={(e) => patch({ claude_acp_command: e.currentTarget.value })} placeholder={t("common.eg", { x: "claude-agent-acp" })} />
              </Field>
            </Show>
            <Field label={t("settings.defaultModel")}>
              <Select value={s()!.default_model} options={modelOptions()} onChange={(v) => void patchNow({ default_model: v })} />
            </Field>
            <Show when={engine() !== "claude-code"}>
              <Field label={t("settings.defaultThinking")}>
                <Select value={s()!.default_thinking} options={thinkingOptions()} onChange={(v) => void patchNow({ default_thinking: v })} />
              </Field>
            </Show>
            {/* A count takes a measure word in Chinese and nothing in English. */}
            <Field label={t("settings.maxConcurrent")} hint={t("settings.maxConcurrentHint")} unit={locale() === "zh-CN" ? "个" : undefined} class="field-narrow">
              <input class="num narrow" type="number" min="1" max="10" value={s()!.max_concurrent} onInput={(e) => patch({ max_concurrent: Number(e.currentTarget.value) || 1 })} />
            </Field>
            <Field label={t("settings.piPath")} hint={t("settings.piPathHint")}>
              <input class="mono" value={s()!.pi_path} onInput={(e) => patch({ pi_path: e.currentTarget.value })} placeholder={t("common.eg", { x: "/opt/homebrew/bin/pi" })} />
            </Field>
            <Field label={t("settings.editor")} hint={t("settings.editorHint")}>
              <input class="mono" value={s()!.editor} onInput={(e) => patch({ editor: e.currentTarget.value })} placeholder={t("common.eg", { x: "code" })} />
            </Field>
            <Field label={t("settings.extraExtensions")} hint={t("settings.extraExtensionsHint")}>
              <textarea
                class="mono"
                rows={2}
                value={s()!.extra_extensions.join("\n")}
                onInput={(e) => patch({ extra_extensions: lines(e.currentTarget.value) })}
                placeholder={t("common.eg", { x: "~/.pi/agent/npm/node_modules/pi-clinepass-provider/src/index.ts" })}
              />
            </Field>
            <div class="form-row">
              <Toggle checked={s()!.load_user_extensions} onChange={(v) => void patchNow({ load_user_extensions: v })} label={t("settings.loadAll")} hint={t("settings.loadAllHint")} />
            </div>
          </div>
        </section>

        <section class="settings-block" id={SETTINGS_CLAUSES[2].id} onFocusOut={() => void commit()}>
          <ClauseHead n={3} title={t("settings.memory")} />
          <p class="field-hint" style={{ "margin-bottom": "8px" }}>
            {t("settings.memoryHint")}
          </p>
          <textarea rows={4} value={s()!.user_memory} onInput={(e) => patch({ user_memory: e.currentTarget.value })} placeholder={t("settings.memoryPlaceholder")} />
          <span class="char-count num" classList={{ over: s()!.user_memory.length > MEMORY_MAX }} aria-live="polite">
            {s()!.user_memory.length} / {MEMORY_MAX}
          </span>
        </section>
      </Show>

      <section class="settings-block" id={SETTINGS_CLAUSES[3].id}>
        <ClauseHead n={4} title={t("settings.projects")}>
          <Button size="s" onClick={pickProject}>
            {t("settings.addRepo")}
          </Button>
        </ClauseHead>
        <For each={state.projects} fallback={<Empty title={t("settings.noProjects")} inline>{t("settings.noProjectsBody")}</Empty>}>
          {(p) => <ProjectRow p={p} />}
        </For>
      </section>

      <Show when={s()}>
        <PhoneBlock s={s()!} patch={patch} commit={commit} />
        <AttentionBlock s={s()!} patch={patch} commit={commit} quietLabel={quietLabel()} />
      </Show>

      <section class="settings-block" id={SETTINGS_CLAUSES[6].id}>
        <ClauseHead n={7} title={t("settings.appearance")} />
        <div class="settings-form">
          <div class="field">
            <span class="field-label" id="theme-label">
              {t("settings.theme")}
            </span>
            <Segmented
              labelledBy="theme-label"
              value={theme()}
              options={[
                { value: "system", label: t("settings.themeSystem") },
                { value: "light", label: t("settings.themeLight") },
                { value: "dark", label: t("settings.themeDark") },
              ]}
              onChange={(c) => {
                setThemeChoice(c);
                setTheme(c);
              }}
            />
          </div>
          <div class="field">
            <span class="field-label" id="size-label">
              {t("settings.size")}
            </span>
            <Segmented
              labelledBy="size-label"
              value={size()}
              options={[
                { value: "compact", label: t("settings.sizeCompact") },
                { value: "standard", label: t("settings.sizeStandard") },
                { value: "large", label: t("settings.sizeLarge") },
              ]}
              onChange={(c) => {
                setSizeChoice(c);
                setSize(c);
              }}
            />
            <span class="field-hint">{t("settings.sizeHint")}</span>
          </div>
        </div>
      </section>
    </div>
    <SettingsIndex />
    </div>
  );
}

/**
 * The phone page: what needs you, on your own network. Tower serves the
 * page itself; the pairing link carries the token in its fragment. One
 * honest line about the transport: a plain LAN is readable by anyone on
 * it, Tailscale is not.
 */
function PhoneBlock(props: { s: SettingsT; patch: (p: Partial<SettingsT>) => void; commit: () => Promise<boolean> }) {
  const [info, { refetch }] = createResource(
    () => props.s.remote_enabled,
    (on) => (on ? api.remoteInfo().catch(() => null) : Promise.resolve(null)),
  );
  const [busy, setBusy] = createSignal(false);
  const toggle = async (on: boolean) => {
    props.patch({ remote_enabled: on });
    await props.commit();
    await refetch();
  };
  const reset = async () => {
    const ok = await ask(t("settings.phoneResetConfirm"), { title: t("settings.phoneReset"), ok: t("settings.phoneResetVerb"), cancel: t("common.cancel"), kind: "warning" });
    if (!ok) return;
    setBusy(true);
    await act(() => api.resetRemoteToken(), t("settings.phoneResetDone"));
    await refreshEnvironment();
    await refetch();
    setBusy(false);
  };
  const copy = (link: string) => {
    void navigator.clipboard.writeText(link);
    toast("success", t("common.copied"));
  };
  /** A pairing link as a reading: which network (the supervisor says), then host:port; the scheme and the token stay out of sight. */
  const hostOf = (link: string) => link.replace(/^https?:\/\//, "").replace(/\/?#.*$/, "");
  const kindOf = (i: number) => info()?.kinds?.[i] ?? "lan";
  const lan = () => (info()?.kinds ?? []).some((k) => k !== "tailscale");
  return (
    <section class="settings-block" id={SETTINGS_CLAUSES[4].id} onFocusOut={() => void props.commit().then((saved) => saved && refetch())}>
      <ClauseHead n={5} title={t("settings.phone")} />
      <p class="field-hint" style={{ "margin-bottom": "12px" }}>
        {t("settings.phoneHint")}
      </p>
      <div class="settings-form">
        <div class="form-row">
          <Toggle checked={props.s.remote_enabled} onChange={(v) => void toggle(v)} label={t("settings.phoneEnable")} hint={t("settings.phoneEnableHint")} />
        </div>
        {/* Switched on but not served: the supervisor's sentence names the cause and the way out, in the attention register, right under the
            switch — the problem before the details, and "allow the local network below" pointing where that switch is. No link or QR is shown
            for a page nobody can reach. */}
        <Show when={props.s.remote_enabled && info()?.problem}>
          {(problem) => (
            <p class="form-row phone-problem" role="status">
              <NeedsYouMark />
              <span>{problem()}</span>
            </p>
          )}
        </Show>
        {/* The port and the network are readings of a page that is on; off, they wait. */}
        <Field label={t("settings.phonePort")} class="field-narrow">
          <input
            class="num narrow phone-port"
            type="number"
            min="1024"
            max="65535"
            value={props.s.remote_port}
            disabled={!props.s.remote_enabled}
            onInput={(e) => props.patch({ remote_port: Number(e.currentTarget.value) || 7317 })}
          />
        </Field>
        <div class="form-row">
          <Toggle
            checked={props.s.remote_local_network}
            disabled={!props.s.remote_enabled}
            onChange={(v) => {
              props.patch({ remote_local_network: v });
              void props.commit().then(() => refetch());
            }}
            label={t("settings.phoneLocalNetwork")}
            hint={t("settings.phoneLocalNetworkHint")}
          />
        </div>
        <Show when={props.s.remote_enabled}>
          <Show when={info()} fallback={<span class="field-hint form-row">{info.loading ? t("common.loading") : t("settings.phoneUnavailable")}</span>}>
            {(i) => (
              <>
                <Show
                  when={i().links.length > 0 && !i().problem}
                  fallback={
                    <Show when={!i().problem}>
                      <p class="field-hint form-row phone-transport">
                        <NoticeMark />
                        <span>{t("settings.phoneNoLinks")}</span>
                      </p>
                    </Show>
                  }
                >
                  <div class="form-row phone-pair">
                    {/* The SVG is the supervisor's own, generated from the first link. */}
                    <div class="phone-qr" innerHTML={i().qr_svg} aria-label={t("settings.phoneQr")} role="img" />
                    <div class="phone-links">
                      <For each={i().links}>
                        {(link, n) => (
                          <div class="phone-link">
                            <span class="phone-link-net t3">{kindOf(n()) === "tailscale" ? t("settings.phoneLinkTailscale") : t("settings.phoneLinkLan")}</span>
                            <span class="mono t1 ellipsis" title={link}>
                              {hostOf(link)}
                            </span>
                            <IconButton icon="copy" size={22} label={t("settings.phoneCopyLink")} onClick={() => copy(link)} />
                          </div>
                        )}
                      </For>
                      <Show when={i().tailscale}>
                        <p class="field-hint phone-transport">
                          <Icon name="check" size={10} class="t3" />
                          <span>{t("settings.phoneTailscale")}</span>
                        </p>
                      </Show>
                      <Show when={lan()}>
                        <p class="field-hint phone-transport">
                          <NoticeMark />
                          <span>{t("settings.phoneLan")}</span>
                        </p>
                      </Show>
                    </div>
                  </div>
                </Show>
                {/* An action looks like one: a plain button, not a ghost that weighs the same as the hint beside it. */}
                <div class="form-row row">
                  <Button size="s" busy={busy()} onClick={() => void reset()}>
                    {t("settings.phoneReset")}
                  </Button>
                  <span class="field-hint">{t("settings.phoneResetHint")}</span>
                </div>
              </>
            )}
          </Show>
        </Show>
      </div>
    </section>
  );
}

/** "HH:MM" for a minute after midnight, the value a time field takes. */
export const hhmm = (minute: number) => `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** The minute after midnight a time field's "HH:MM" names; null when the field is empty or not a time. */
export function parseHhmm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** The window quiet hours start from when switched on: late evening to early morning, across midnight. */
export const DEFAULT_QUIET_HOURS: QuietHours = { start: 22 * 60, end: 8 * 60 };

/**
 * Notifications and pushes: when Tower may interrupt you (now, and every
 * day), where pushes go, and what the last one did. The last push is read
 * when the block opens and after a test, so a push that fails silently in
 * the background has a line here.
 */
function AttentionBlock(props: { s: SettingsT; patch: (p: Partial<SettingsT>) => void; commit: () => Promise<boolean>; quietLabel: string }) {
  const [status, setStatus] = createSignal<PushStatus | null | undefined>(undefined);
  const [sending, setSending] = createSignal(false);
  const readStatus = async () => setStatus(await api.pushStatus().catch(() => null));
  onMount(() => void readStatus());
  const hours = () => props.s.quiet_hours;
  const setHours = (q: QuietHours | null) => {
    props.patch({ quiet_hours: q });
    void props.commit();
  };
  const setEdge = (edge: "start" | "end", value: string) => {
    const minute = parseHhmm(value);
    const q = hours();
    if (!q) return;
    // Not a time: the field goes back to the saved edge rather than keeping a value that saves nothing.
    if (minute === null) return setHours({ ...q });
    setHours({ ...q, [edge]: minute });
  };
  const testPush = async () => {
    setSending(true);
    // The URL in the field may not be saved yet: commit first, so the test sends where the field points.
    await props.commit();
    try {
      await api.testPush();
      toast("success", t("settings.pushTestSent"));
    } catch (e) {
      toast("error", errorText(e));
    }
    await readStatus();
    setSending(false);
  };
  return (
    <section class="settings-block" id={SETTINGS_CLAUSES[5].id} onFocusOut={() => void props.commit()}>
      <ClauseHead n={6} title={t("settings.attention")} />
      <div class="settings-form">
        <Field label={t("settings.notifications")} hint={t("quiet.hint")}>
          <button type="button" class="select" aria-haspopup="menu" aria-label={`${t("settings.notifications")}: ${props.quietLabel}`} onClick={() => void pickQuiet()}>
            <span class="ellipsis grow">{props.quietLabel}</span>
            <svg width="8" height="10" viewBox="0 0 8 10" aria-hidden="true">
              <path d="M1 3.5 L4 1 L7 3.5 M1 6.5 L4 9 L7 6.5" fill="none" stroke="currentColor" stroke-width="1.2" />
            </svg>
          </button>
        </Field>
        {/* The daily window: a switch, then the two edges in one line, so "from 22:00 to 08:00" reads as a sentence. Plain 24-hour
            fields, as every clock on the desk: WebKit's native time field follows the system's 12-hour locale and would show 22:00 as 10:00. */}
        <div class="form-row">
          <Toggle checked={!!hours()} onChange={(v) => setHours(v ? DEFAULT_QUIET_HOURS : null)} label={t("settings.quietHoursEnable")} hint={t("settings.quietHoursHint")} />
        </div>
        <Show when={hours()}>
          {(q) => (
            <div class="form-row quiet-hours num" role="group" aria-label={t("settings.quietHours")}>
              <label>
                <span class="t3">{t("settings.quietFrom")}</span>
                <input class="quiet-time num" inputmode="numeric" placeholder="22:00" value={hhmm(q().start)} onChange={(e) => setEdge("start", e.currentTarget.value)} aria-label={`${t("settings.quietHours")} · ${t("settings.quietFrom")}`} />
              </label>
              <label>
                <span class="t3">{t("settings.quietTo")}</span>
                <input class="quiet-time num" inputmode="numeric" placeholder="08:00" value={hhmm(q().end)} onChange={(e) => setEdge("end", e.currentTarget.value)} aria-label={`${t("settings.quietHours")} · ${t("settings.quietTo")}`} />
              </label>
            </div>
          )}
        </Show>
        {/* Pushes go through ntfy; what leaves the machine is said in one line, with where to point it. */}
        <Field label={t("settings.pushUrl")} hint={t("settings.pushUrlHint")}>
          <input class="mono" value={props.s.push_url} onInput={(e) => props.patch({ push_url: e.currentTarget.value })} placeholder={t("common.eg", { x: "https://ntfy.example.net/tower" })} spellcheck={false} />
        </Field>
        <div class="form-row">
          <Toggle checked={props.s.push_ready} onChange={(v) => (props.patch({ push_ready: v }), void props.commit())} label={t("settings.pushReady")} hint={t("settings.pushReadyHint")} />
        </div>
        {/* The test and the last outcome share a line: a failure is a fact with its time and the supervisor's sentence, never a silent one. */}
        <div class="form-row row push-test">
          <Button size="s" busy={sending()} disabled={!props.s.push_url.trim()} onClick={() => void testPush()}>
            {t("settings.testPush")}
          </Button>
          <Show when={status() !== undefined}>
            <span class="meta push-status" classList={{ t1: !!status()?.error }} role="status">
              <Show when={status()} fallback={<span class="t3">{t("settings.pushNone")}</span>}>
                {(st) => (
                  <>
                    <Show when={st().error} fallback={<Icon name="check" size={10} class="t3" />}>
                      <DangerMark />
                    </Show>
                    <span class="num">{st().error ? t("settings.pushFailedAt", { time: clock(st().at) }) : t("settings.pushSentAt", { time: clock(st().at) })}</span>
                    <Show when={st().error}>
                      <span class="sep">·</span>
                      <span class="t2">{st().error}</span>
                    </Show>
                  </>
                )}
              </Show>
            </span>
          </Show>
        </div>
      </div>
    </section>
  );
}

function ProjectRow(props: { p: ProjectView }) {
  const [branch, setBranch] = createSignal(props.p.base_branch);
  const [test, setTest] = createSignal(props.p.test_command ?? "");
  const [local, setLocal] = createSignal(props.p.local_files.join("\n"));
  const [holdout, setHoldout] = createSignal(props.p.holdout_files.join("\n"));
  const [memory, setMemory] = createSignal(props.p.memory);
  const [setup, setSetup] = createSignal(props.p.setup_command);
  const saved = useSavedStamp();
  // Sent here by a link ("Set held-out tests", a refused path): that field, in the middle of the window, with the caret in it.
  let row!: HTMLDivElement;
  onMount(() => {
    const field = takeProjectField(props.p.id);
    const el = field && row.querySelector<HTMLElement>(`[data-field="${field}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.focus({ preventScroll: true });
  });
  const dirty = () =>
    branch() !== props.p.base_branch ||
    test() !== (props.p.test_command ?? "") ||
    local() !== props.p.local_files.join("\n") ||
    holdout() !== props.p.holdout_files.join("\n") ||
    memory() !== props.p.memory ||
    setup() !== props.p.setup_command;
  const save = async () => {
    if (!dirty()) return;
    const ok = await act(() =>
      api.updateProject(props.p.id, {
        base_branch: branch().trim(),
        test_command: test().trim() || null,
        local_files: lines(local()),
        holdout_files: lines(holdout()),
        memory: memory(),
        setup_command: setup(),
      }),
    );
    if (ok !== undefined) {
      saved.mark();
      await refreshProjects();
    }
  };
  const remove = async () => {
    const ok = await ask(t("settings.removeConfirm", { name: props.p.name }), {
      title: t("settings.removeTitle"),
      ok: t("common.remove"),
      cancel: t("common.cancel"),
      kind: "warning",
    });
    if (!ok) return;
    await act(() => api.removeProject(props.p.id), t("settings.removed"));
    await refreshProjects();
  };
  return (
    <div ref={row} class="project" data-project-id={props.p.id} onFocusOut={() => void save()}>
      <div class="project-head">
        <div class="col grow">
          <b>{props.p.name}</b>
          <span class="mono meta t3">{props.p.root}</span>
        </div>
        <saved.Stamp />
        <Button size="s" variant="ghost" onClick={() => void remove()}>
          {t("common.remove")}
        </Button>
      </div>
      <TestCheckLine p={props.p} />
      <div class="settings-form">
        <Field label={t("settings.baseBranch")} hint={t("settings.baseBranchHint")}>
          <input class="mono" value={branch()} onInput={(e) => setBranch(e.currentTarget.value)} />
        </Field>
        <Field label={t("settings.testCommand")} hint={t("settings.testCommandHint")}>
          <input class="mono" data-field="test" value={test()} onInput={(e) => setTest(e.currentTarget.value)} placeholder={t("common.eg", { x: "pnpm test" })} />
        </Field>
        <Field label={t("settings.setupCommand")} hint={t("settings.setupCommandHint")}>
          <input class="mono" data-field="setup" value={setup()} onInput={(e) => setSetup(e.currentTarget.value)} placeholder={t("common.eg", { x: "pnpm install --frozen-lockfile" })} />
        </Field>
        <Field label={t("settings.localFiles")} hint={t("settings.localFilesHint")}>
          <textarea class="mono" data-field="local" rows={2} value={local()} onInput={(e) => setLocal(e.currentTarget.value)} placeholder={t("common.eg", { x: ".env" })} />
        </Field>
        <Field label={t("settings.holdoutFiles")} hint={t("settings.holdoutFilesHint")}>
          <textarea class="mono" data-field="holdout" rows={2} value={holdout()} onInput={(e) => setHoldout(e.currentTarget.value)} placeholder={t("common.eg", { x: "test/holdout/*.test.js" })} />
        </Field>
        <Field label={t("settings.projectMemory")} hint={t("settings.projectMemoryHint")}>
          <textarea rows={2} value={memory()} onInput={(e) => setMemory(e.currentTarget.value)} placeholder={t("settings.projectMemoryPlaceholder")} />
        </Field>
      </div>
    </div>
  );
}
