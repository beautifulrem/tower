/**
 * Settings: environment, engine defaults, memory, projects, appearance.
 * Label left, control right, like System Settings; every field saves when
 * you leave it and the block says so — no Save button.
 */
import { For, Show, createResource, createSignal, onMount } from "solid-js";

import { pickQuiet } from "../components/Chrome";
import { DangerMark, NoticeMark } from "../components/Glyph";
import { TestCheckLine } from "../components/TestCheck";
import { Button, Empty, Field, Loading, Select } from "../components/ui";
import type { ProjectView } from "../gen/ProjectView";
import type { Settings as SettingsT } from "../gen/Settings";
import { api } from "../lib/api";
import { clock } from "../lib/format";
import { locale, t } from "../lib/i18n";
import { envIssueLabel } from "../lib/labels";
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

export function Settings() {
  const [s, setS] = createSignal<SettingsT | null>(null);
  const [models] = createResource(() => api.models().catch(() => null));
  const [theme, setTheme] = createSignal<ThemeChoice>(themeChoice());
  const [size, setSize] = createSignal<SizeChoice>(sizeChoice());
  const saved = useSavedStamp();
  onMount(async () => setS(await api.settings()));
  const noModels = () => !!state.env?.pi_version && !models.loading && models() !== null && models()!.length === 0;

  let last = "";
  /** Writes the form when a field is left; no-op when nothing changed. */
  const commit = async () => {
    const v = s();
    if (!v) return;
    const now = JSON.stringify(v);
    if (now === last) return;
    last = now;
    const ok = await act(() => api.saveSettings(v));
    if (ok !== undefined) {
      saved.mark();
      await refreshEnvironment();
    }
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
    void commit();
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
                    toast("info", t("welcome.copied"));
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
            <Field label={t("settings.defaultModel")}>
              <Select
                value={s()!.default_model}
                options={[{ value: "", label: t("common.piDefault") }, ...(models() ?? []).map((m) => ({ value: `${m.provider}/${m.id}`, label: `${m.provider}/${m.id}` }))]}
                onChange={(v) => patchNow({ default_model: v })}
              />
            </Field>
            <Field label={t("settings.defaultThinking")}>
              <Select value={s()!.default_thinking} options={thinkingOptions()} onChange={(v) => patchNow({ default_thinking: v })} />
            </Field>
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
              <input type="checkbox" checked={s()!.load_user_extensions} onChange={(e) => patchNow({ load_user_extensions: e.currentTarget.checked })} />
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

      <section class="settings-block">
        <h2 class="section-title">{t("settings.appearance")}</h2>
        <div class="settings-form">
          <div class="field">
            <span class="field-label" id="theme-label">
              {t("settings.theme")}
            </span>
            <div class="row" style={{ gap: "20px" }} role="radiogroup" aria-labelledby="theme-label">
              <For each={["system", "light", "dark"] as ThemeChoice[]}>
                {(choice) => (
                  <label class="radio" style={{ "margin-bottom": "0" }}>
                    <input
                      type="radio"
                      name="theme"
                      checked={theme() === choice}
                      onChange={() => {
                        setThemeChoice(choice);
                        setTheme(choice);
                      }}
                    />
                    <span>{{ system: t("settings.themeSystem"), light: t("settings.themeLight"), dark: t("settings.themeDark") }[choice]}</span>
                  </label>
                )}
              </For>
            </div>
          </div>
          <div class="field">
            <span class="field-label" id="size-label">
              {t("settings.size")}
            </span>
            <div class="row" style={{ gap: "20px" }} role="radiogroup" aria-labelledby="size-label">
              <For each={["compact", "standard", "large"] as SizeChoice[]}>
                {(choice) => (
                  <label class="radio" style={{ "margin-bottom": "0" }}>
                    <input
                      type="radio"
                      name="size"
                      checked={size() === choice}
                      onChange={() => {
                        setSizeChoice(choice);
                        setSize(choice);
                      }}
                    />
                    <span>{{ compact: t("settings.sizeCompact"), standard: t("settings.sizeStandard"), large: t("settings.sizeLarge") }[choice]}</span>
                  </label>
                )}
              </For>
            </div>
            <span class="field-hint">{t("settings.sizeHint")}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProjectRow(props: { p: ProjectView }) {
  const [branch, setBranch] = createSignal(props.p.base_branch);
  const [test, setTest] = createSignal(props.p.test_command ?? "");
  const [local, setLocal] = createSignal(props.p.local_files.join("\n"));
  const [memory, setMemory] = createSignal(props.p.memory);
  const [setup, setSetup] = createSignal(props.p.setup_command);
  const saved = useSavedStamp();
  const dirty = () =>
    branch() !== props.p.base_branch ||
    test() !== (props.p.test_command ?? "") ||
    local() !== props.p.local_files.join("\n") ||
    memory() !== props.p.memory ||
    setup() !== props.p.setup_command;
  const save = async () => {
    if (!dirty()) return;
    const ok = await act(() =>
      api.updateProject(props.p.id, {
        base_branch: branch().trim(),
        test_command: test().trim() || null,
        local_files: lines(local()),
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
        <Field label={t("settings.projectMemory")} hint={t("settings.projectMemoryHint")}>
          <textarea rows={2} value={memory()} onInput={(e) => setMemory(e.currentTarget.value)} placeholder={t("settings.projectMemoryPlaceholder")} />
        </Field>
      </div>
    </div>
  );
}
