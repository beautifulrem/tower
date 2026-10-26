/** Settings: engine, defaults, memory, projects, appearance, environment. */
import { For, Show, createResource, createSignal, onMount } from "solid-js";

import { Button, Field, Select } from "../components/ui";
import type { ProjectView } from "../gen/ProjectView";
import type { Settings as SettingsT } from "../gen/Settings";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { act, refreshEnvironment, refreshProjects, state } from "../lib/store";
import { type ThemeChoice, setThemeChoice, themeChoice } from "../lib/theme";
import { pickProject } from "./Welcome";

/** Thinking levels; call inside a reactive scope so "Pi default" follows the locale. */
export const thinkingOptions = () =>
  ["", "off", "minimal", "low", "medium", "high", "xhigh"].map((level) => ({
    value: level,
    label: level || t("common.piDefault"),
  }));

const lines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export function Settings() {
  const [s, setS] = createSignal<SettingsT | null>(null);
  const [models] = createResource(() => api.models().catch(() => []));
  const [theme, setTheme] = createSignal<ThemeChoice>(themeChoice());
  onMount(async () => setS(await api.settings()));

  const save = async () => {
    const v = s();
    if (!v) return;
    await act(() => api.saveSettings(v), t("settings.saved"));
    await refreshEnvironment();
  };
  /**
   * The language applies at once: only the language is saved (other unsaved
   * edits stay in the form), and reloading the settings re-renders the
   * interface in the new language.
   */
  const setLanguage = async (language: string) => {
    patch({ language });
    const saved = state.settings ?? (await api.settings());
    await act(() => api.saveSettings({ ...saved, language }));
    // Reloads `state.settings`: on success the interface switches; on
    // failure it stays in the saved language.
    await refreshEnvironment();
    patch({ language: state.settings?.language ?? language });
  };
  const patch = (p: Partial<SettingsT>) => setS((cur) => (cur ? { ...cur, ...p } : cur));

  return (
    <div class="settings">
      <section class="settings-block">
        <h2 class="section-title">{t("settings.environment")}</h2>
        <dl class="kv">
          <dt>Pi</dt>
          <dd class="mono">
            <Show when={state.env?.pi_path} fallback={<span class="t2">{t("settings.notFound")}</span>}>
              {state.env!.pi_path} <span class="t2">{state.env?.pi_version ?? t("settings.cannotRun")}</span>
            </Show>
          </dd>
          <dt>git</dt>
          <dd class="mono">{state.env?.git_version ?? t("settings.notFound")}</dd>
          <dt>{t("settings.dataDir")}</dt>
          <dd class="mono">{state.env?.data_dir}</dd>
        </dl>
        <For each={state.env?.problems ?? []}>{(p) => <p class="meta">◇ {p}</p>}</For>
      </section>

      <Show when={s()}>
        <section class="settings-block">
          <h2 class="section-title">{t("settings.engineDefaults")}</h2>
          <Field label={t("settings.piPath")} hint={t("settings.piPathHint")}>
            <input class="mono" value={s()!.pi_path} onInput={(e) => patch({ pi_path: e.currentTarget.value })} placeholder="/opt/homebrew/bin/pi" />
          </Field>
          <div class="editor-grid2">
            <Field label={t("settings.defaultModel")}>
              <Select
                value={s()!.default_model}
                options={[{ value: "", label: t("common.piDefault") }, ...(models() ?? []).map((m) => ({ value: `${m.provider}/${m.id}`, label: `${m.provider}/${m.id}` }))]}
                onChange={(v) => patch({ default_model: v })}
              />
            </Field>
            <Field label={t("settings.defaultThinking")}>
              <Select
                value={s()!.default_thinking}
                options={thinkingOptions()}
                onChange={(v) => patch({ default_thinking: v })}
              />
            </Field>
            <Field label={t("settings.maxConcurrent")} hint={t("settings.maxConcurrentHint")}>
              <input class="num" type="number" min="1" max="10" value={s()!.max_concurrent} onInput={(e) => patch({ max_concurrent: Number(e.currentTarget.value) || 1 })} />
            </Field>
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
          </div>
          <Field label={t("settings.extraExtensions")} hint={t("settings.extraExtensionsHint")}>
            <textarea
              class="mono"
              rows={2}
              value={s()!.extra_extensions.join("\n")}
              onInput={(e) => patch({ extra_extensions: lines(e.currentTarget.value) })}
              placeholder="~/.pi/agent/npm/node_modules/pi-clinepass-provider/src/index.ts"
            />
          </Field>
          <label class="check">
            <input type="checkbox" checked={s()!.load_user_extensions} onChange={(e) => patch({ load_user_extensions: e.currentTarget.checked })} />
            <span>
              {t("settings.loadAll")}
              <span class="meta">{t("settings.loadAllHint")}</span>
            </span>
          </label>
          <Field label={t("settings.editor")} hint={t("settings.editorHint")}>
            <input class="mono" value={s()!.editor} onInput={(e) => patch({ editor: e.currentTarget.value })} placeholder="code" />
          </Field>
        </section>

        <section class="settings-block">
          <h2 class="section-title">{t("settings.memory")}</h2>
          <p class="field-hint">{t("settings.memoryHint")}</p>
          <textarea
            rows={4}
            value={s()!.user_memory}
            onInput={(e) => patch({ user_memory: e.currentTarget.value })}
            placeholder={t("settings.memoryPlaceholder")}
          />
        </section>

        <div class="settings-save">
          <Button variant="primary" onClick={save}>
            {t("settings.saveSettings")}
          </Button>
        </div>
      </Show>

      <section class="settings-block">
        <div class="row">
          <h2 class="section-title grow">{t("settings.projects")}</h2>
          <Button size="s" onClick={pickProject}>
            {t("settings.addRepo")}
          </Button>
        </div>
        <For each={state.projects} fallback={<p class="meta">{t("settings.noProjects")}</p>}>
          {(p) => <ProjectRow p={p} />}
        </For>
      </section>

      <section class="settings-block">
        <h2 class="section-title">{t("settings.appearance")}</h2>
        <div class="row">
          <For each={["system", "light", "dark"] as ThemeChoice[]}>
            {(choice) => (
              <label class="radio">
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
  const dirty = () =>
    branch() !== props.p.base_branch ||
    test() !== (props.p.test_command ?? "") ||
    local() !== props.p.local_files.join("\n") ||
    memory() !== props.p.memory ||
    setup() !== props.p.setup_command;
  const save = async () => {
    await act(
      () =>
        api.updateProject(props.p.id, {
          base_branch: branch().trim(),
          test_command: test().trim() || null,
          local_files: lines(local()),
          memory: memory(),
          setup_command: setup(),
        }),
      t("settings.projectSaved"),
    );
    await refreshProjects();
  };
  return (
    <div class="project">
      <div class="project-head">
        <div class="col grow">
          <b>{props.p.name}</b>
          <span class="mono meta">{props.p.root}</span>
        </div>
        <Show when={dirty()}>
          <Button size="s" variant="primary" onClick={save}>
            {t("common.save")}
          </Button>
        </Show>
        <Button
          size="s"
          variant="ghost"
          onClick={async () => {
            if (confirm(t("settings.removeConfirm", { name: props.p.name }))) {
              await act(() => api.removeProject(props.p.id), t("settings.removed"));
              await refreshProjects();
            }
          }}
        >
          {t("common.remove")}
        </Button>
      </div>
      <div class="editor-grid2">
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
          <textarea class="mono" rows={3} value={local()} onInput={(e) => setLocal(e.currentTarget.value)} placeholder={".env\nconfig/*.local.json"} />
        </Field>
        <Field label={t("settings.projectMemory")} hint={t("settings.projectMemoryHint")}>
          <textarea rows={3} value={memory()} onInput={(e) => setMemory(e.currentTarget.value)} placeholder={t("settings.projectMemoryPlaceholder")} />
        </Field>
      </div>
    </div>
  );
}
