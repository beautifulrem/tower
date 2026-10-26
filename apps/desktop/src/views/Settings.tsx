/**
 * Settings: environment, engine defaults, memory, projects, phone, appearance.
 * Label left, control right, like System Settings; every field saves when
 * you leave it and the block says so — no Save button.
 */
import { For, Show, createResource, createSignal, onMount } from "solid-js";

import { pickQuiet } from "../components/Chrome";
import { DangerMark, Icon, NoticeMark } from "../components/Glyph";
import { TestCheckLine } from "../components/TestCheck";
import { Button, Empty, Field, IconButton, Loading, Select } from "../components/ui";
import type { ProjectView } from "../gen/ProjectView";
import type { Settings as SettingsT } from "../gen/Settings";
import { api } from "../lib/api";
import { clock } from "../lib/format";
import { locale, t } from "../lib/i18n";
import { engineLabel, envIssueLabel, modelsFor } from "../lib/labels";
import { ask } from "../lib/native";
import { act, quietNow, refreshEnvironment, refreshProjects, state, toast } from "../lib/store";
import { type SizeChoice, type ThemeChoice, setSizeChoice, setThemeChoice, sizeChoice, themeChoice } from "../lib/theme";
import { openPiLogin, pickProject } from "./Welcome";

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

/** "Saved · 21:03", shown for five seconds after a write. */
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
  const patch = (p: Partial<SettingsT>) => setS((cur) => (cur ? { ...cur, ...p } : cur));
  const patchNow = (p: Partial<SettingsT>) => {
    patch(p);
    return commit();
  };
  const quietLabel = () => (quietNow() ? t("quiet.until", { time: clock(state.settings!.quiet_until!) }) : t("quiet.on"));

  return (
    <div class="settings">
      <section class="settings-block">
        <h2 class="section-title">{t("settings.environment")}</h2>
        <dl class="kv">
          <dt>Pi</dt>
          <dd>
            <Show when={state.env?.pi_path} fallback={<span class="t2">{t("settings.notFound")}</span>}>
              <span class="t1">{state.env?.pi_version ?? t("settings.cannotRun")}</span>
              <span class="sep">·</span>
              <span class="mono t2 break">{state.env!.pi_path}</span>
            </Show>
          </dd>
          <dt>git</dt>
          <dd class="mono">{state.env?.git_version ?? t("settings.notFound")}</dd>
          <dt>{t("settings.dataDir")}</dt>
          <dd class="mono t2 break">{state.env?.data_dir}</dd>
        </dl>
        <For each={state.env?.issues ?? []}>
          {(i) => (
            <div class="check-row">
              <span class="check-mark">
                <Show when={i.blocking} fallback={<NoticeMark />}>
                  <DangerMark />
                </Show>
              </span>
              <span class="grow meta t1">{envIssueLabel(i, state.env)}</span>
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
        <section class="settings-block" onFocusOut={() => void commit()}>
          <div class="settings-head">
            <h2 class="section-title">{t("settings.engineDefaults")}</h2>
            <saved.Stamp />
          </div>
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
            <Field label={t("settings.notifications")} hint={t("quiet.hint")}>
              <button type="button" class="select" aria-haspopup="menu" aria-label={`${t("settings.notifications")}: ${quietLabel()}`} onClick={() => void pickQuiet()}>
                <span class="ellipsis grow">{quietLabel()}</span>
                <svg width="8" height="10" viewBox="0 0 8 10" aria-hidden="true">
                  <path d="M1 3.5 L4 1 L7 3.5 M1 6.5 L4 9 L7 6.5" fill="none" stroke="currentColor" stroke-width="1.2" />
                </svg>
              </button>
            </Field>
            {/* The engine: which agent new goals run on. The hint belongs to the chosen engine: Claude Code's trust model, or Pi in one line. */}
            <Field label={t("settings.engine")} hint={engine() === "claude-code" ? t("settings.engineTrust") : t("settings.engineHintPi")}>
              <Select value={engine()} options={engineOptions()} onChange={(v) => void patchNow({ engine: v, default_model: "" })} />
            </Field>
            <Show when={engine() === "claude-code"}>
              <Field label={t("settings.claudeAcp")} hint={t("settings.claudeAcpHint")}>
                <input class="mono" value={s()!.claude_acp_command} onInput={(e) => patch({ claude_acp_command: e.currentTarget.value })} placeholder="claude-agent-acp" />
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
              <input class="mono" value={s()!.pi_path} onInput={(e) => patch({ pi_path: e.currentTarget.value })} placeholder="/opt/homebrew/bin/pi" />
            </Field>
            <Field label={t("settings.editor")} hint={t("settings.editorHint")}>
              <input class="mono" value={s()!.editor} onInput={(e) => patch({ editor: e.currentTarget.value })} placeholder="code" />
            </Field>
            <Field label={t("settings.extraExtensions")} hint={t("settings.extraExtensionsHint")}>
              <textarea
                class="mono"
                rows={2}
                value={s()!.extra_extensions.join("\n")}
                onInput={(e) => patch({ extra_extensions: lines(e.currentTarget.value) })}
                placeholder="~/.pi/agent/npm/node_modules/pi-clinepass-provider/src/index.ts"
              />
            </Field>
            <label class="check form-row">
              <input type="checkbox" checked={s()!.load_user_extensions} onChange={(e) => void patchNow({ load_user_extensions: e.currentTarget.checked })} />
              <span>{t("settings.loadAll")}</span>
              <span class="check-desc">{t("settings.loadAllHint")}</span>
            </label>
          </div>
        </section>

        <section class="settings-block" onFocusOut={() => void commit()}>
          <h2 class="section-title">{t("settings.memory")}</h2>
          <p class="field-hint" style={{ "margin-bottom": "8px" }}>
            {t("settings.memoryHint")}
          </p>
          <textarea rows={4} value={s()!.user_memory} onInput={(e) => patch({ user_memory: e.currentTarget.value })} placeholder={t("settings.memoryPlaceholder")} />
          <span class="char-count num" classList={{ over: s()!.user_memory.length > MEMORY_MAX }} aria-live="polite">
            {s()!.user_memory.length} / {MEMORY_MAX}
          </span>
        </section>
      </Show>

      <section class="settings-block">
        <div class="settings-head">
          <h2 class="section-title grow">{t("settings.projects")}</h2>
          <Button size="s" onClick={pickProject}>
            {t("settings.addRepo")}
          </Button>
        </div>
        <For each={state.projects} fallback={<Empty title={t("settings.noProjects")} inline>{t("settings.noProjectsBody")}</Empty>}>
          {(p) => <ProjectRow p={p} />}
        </For>
      </section>

      <Show when={s()}>
        <PhoneBlock s={s()!} patch={patch} commit={commit} />
      </Show>

      <section class="settings-block">
        <h2 class="section-title">{t("settings.appearance")}</h2>
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
  return (
    <section class="settings-block" onFocusOut={() => void props.commit().then((saved) => saved && refetch())}>
      <h2 class="section-title">{t("settings.phone")}</h2>
      <p class="field-hint" style={{ "margin-bottom": "12px" }}>
        {t("settings.phoneHint")}
      </p>
      <div class="settings-form">
        <label class="check form-row">
          <input type="checkbox" checked={props.s.remote_enabled} onChange={(e) => void toggle(e.currentTarget.checked)} />
          <span>{t("settings.phoneEnable")}</span>
          <span class="check-desc">{t("settings.phoneEnableHint")}</span>
        </label>
        <Field label={t("settings.phonePort")} class="field-narrow">
          <input class="num narrow phone-port" type="number" min="1024" max="65535" value={props.s.remote_port} onInput={(e) => props.patch({ remote_port: Number(e.currentTarget.value) || 7317 })} />
        </Field>
        <Show when={props.s.remote_enabled}>
          <Show when={info()} fallback={<span class="field-hint form-row">{info.loading ? t("common.loading") : t("settings.phoneUnavailable")}</span>}>
            {(i) => (
              <>
                <div class="form-row phone-pair">
                  {/* The SVG is the supervisor's own, generated from the first link. */}
                  <div class="phone-qr" innerHTML={i().qr_svg} aria-label={t("settings.phoneQr")} role="img" />
                  <div class="phone-links">
                    <For each={i().links}>
                      {(link) => (
                        <div class="phone-link">
                          <span class="mono t2 ellipsis" title={link}>
                            {link.replace(/#.*$/, "#…")}
                          </span>
                          <IconButton icon="copy" size={22} label={t("settings.phoneCopyLink")} onClick={() => copy(link)} />
                        </div>
                      )}
                    </For>
                    <p class="field-hint phone-transport">
                      <Show when={i().tailscale} fallback={<NoticeMark />}>
                        <Icon name="check" size={10} class="t3" />
                      </Show>
                      <span>{i().tailscale ? t("settings.phoneTailscale") : t("settings.phoneLan")}</span>
                    </p>
                  </div>
                </div>
                <div class="form-row row">
                  <Button size="s" variant="ghost" busy={busy()} onClick={() => void reset()}>
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

function ProjectRow(props: { p: ProjectView }) {
  const [branch, setBranch] = createSignal(props.p.base_branch);
  const [test, setTest] = createSignal(props.p.test_command ?? "");
  const [local, setLocal] = createSignal(props.p.local_files.join("\n"));
  const [holdout, setHoldout] = createSignal(props.p.holdout_files.join("\n"));
  const [memory, setMemory] = createSignal(props.p.memory);
  const [setup, setSetup] = createSignal(props.p.setup_command);
  const saved = useSavedStamp();
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
    <div class="project" onFocusOut={() => void save()}>
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
          <input class="mono" value={test()} onInput={(e) => setTest(e.currentTarget.value)} placeholder="pnpm test" />
        </Field>
        <Field label={t("settings.setupCommand")} hint={t("settings.setupCommandHint")}>
          <input class="mono" value={setup()} onInput={(e) => setSetup(e.currentTarget.value)} placeholder="pnpm install --frozen-lockfile" />
        </Field>
        <Field label={t("settings.localFiles")} hint={t("settings.localFilesHint")}>
          <textarea class="mono" rows={2} value={local()} onInput={(e) => setLocal(e.currentTarget.value)} placeholder={".env\nconfig/*.local.json"} />
        </Field>
        <Field label={t("settings.holdoutFiles")} hint={t("settings.holdoutFilesHint")}>
          <textarea class="mono" rows={2} value={holdout()} onInput={(e) => setHoldout(e.currentTarget.value)} placeholder={"test/holdout/*.test.js"} />
        </Field>
        <Field label={t("settings.projectMemory")} hint={t("settings.projectMemoryHint")}>
          <textarea rows={2} value={memory()} onInput={(e) => setMemory(e.currentTarget.value)} placeholder={t("settings.projectMemoryPlaceholder")} />
        </Field>
      </div>
    </div>
  );
}
