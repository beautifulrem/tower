/**
 * git has no name and email: Tower commits accepted work as you, so it asks
 * for them here — two fields and one button, written by the supervisor to
 * git's config — with the command itself kept beside it for anyone who would
 * rather run it. Shown wherever the environment issue is: the welcome
 * screen's checks, Settings › Environment, and the accept sheet of a goal.
 *
 * Where it is written is yours to choose: in a project's context (the accept
 * sheet) the default is that repository alone and the global config is the
 * explicit option; in Settings, with several projects, a scope picker offers
 * each of them and "every repository".
 */
import { Show, createSignal } from "solid-js";

import type { ProjectView } from "../gen/ProjectView";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { act, refreshEnvironment, toast } from "../lib/store";
import { Button, Select } from "./ui";

export function GitIdentityForm(props: {
  /** A project this form is shown for: the identity goes into its repository unless you say otherwise. */
  projectId?: string;
  projectName?: string;
  /** The projects to choose a scope from, when there is no one project context. */
  projects?: ProjectView[];
}) {
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  // "" is git's global config; a project id is that repository's own.
  const [scope, setScope] = createSignal(props.projectId ?? "");
  const scopeName = () => (scope() === props.projectId ? props.projectName : props.projects?.find((p) => p.id === scope())?.name) ?? "";
  const ready = () => name().trim().length > 0 && email().includes("@");
  const submit = async (e: Event) => {
    e.preventDefault();
    if (!ready() || busy()) return;
    setBusy(true);
    const ok = await act(() => api.setGitIdentity(name().trim(), email().trim(), scope() || undefined));
    setBusy(false);
    if (ok === undefined) return;
    toast("success", scope() ? t("settings.gitIdentitySetIn", { name: name().trim(), project: scopeName() }) : t("settings.gitIdentitySet", { name: name().trim() }));
    await refreshEnvironment();
  };
  return (
    <form class="identity-form" onSubmit={(e) => void submit(e)}>
      <input class="identity-name" value={name()} placeholder={t("settings.gitName")} aria-label={t("settings.gitName")} autocomplete="name" onInput={(e) => setName(e.currentTarget.value)} />
      <input class="identity-email mono" type="email" value={email()} placeholder={t("settings.gitEmail")} aria-label={t("settings.gitEmail")} autocomplete="email" spellcheck={false} onInput={(e) => setEmail(e.currentTarget.value)} />
      <Show when={!props.projectId && props.projects?.length}>
        <Select
          class="identity-scope"
          label={t("settings.gitScope")}
          value={scope()}
          options={[{ value: "", label: t("settings.gitScopeGlobal") }, ...props.projects!.map((p) => ({ value: p.id, label: t("settings.gitScopeProject", { name: p.name }) }))]}
          onChange={setScope}
        />
      </Show>
      <Button type="submit" disabled={!ready()} busy={busy()}>
        {t("settings.gitIdentitySave")}
      </Button>
      <Show when={props.projectId}>
        <label class="identity-only meta">
          <input type="checkbox" checked={scope() === props.projectId} onChange={(e) => setScope(e.currentTarget.checked ? props.projectId! : "")} />
          <span>{t("settings.gitScopeOnly", { name: props.projectName ?? "" })}</span>
        </label>
      </Show>
      <Show when={!ready()}>
        <span class="field-hint identity-hint">{scope() ? t("settings.gitIdentityHintProject", { name: scopeName() }) : t("settings.gitIdentityHint")}</span>
      </Show>
    </form>
  );
}
