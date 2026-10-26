/**
 * git has no name and email: Tower commits accepted work as you, so it asks
 * for them here — two fields and one button, written to git's global config
 * by the supervisor — with the command itself kept beside it for anyone who
 * would rather run it. Shown wherever the environment issue is: the welcome
 * screen's checks and Settings › Environment.
 */
import { Show, createSignal } from "solid-js";

import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { act, refreshEnvironment, toast } from "../lib/store";
import { Button } from "./ui";

export function GitIdentityForm() {
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const ready = () => name().trim().length > 0 && email().includes("@");
  const submit = async (e: Event) => {
    e.preventDefault();
    if (!ready() || busy()) return;
    setBusy(true);
    const ok = await act(() => api.setGitIdentity(name().trim(), email().trim()));
    setBusy(false);
    if (ok === undefined) return;
    toast("success", t("settings.gitIdentitySet", { name: name().trim() }));
    await refreshEnvironment();
  };
  return (
    <form class="identity-form" onSubmit={(e) => void submit(e)}>
      <input class="identity-name" value={name()} placeholder={t("settings.gitName")} aria-label={t("settings.gitName")} autocomplete="name" onInput={(e) => setName(e.currentTarget.value)} />
      <input class="identity-email mono" type="email" value={email()} placeholder={t("settings.gitEmail")} aria-label={t("settings.gitEmail")} autocomplete="email" spellcheck={false} onInput={(e) => setEmail(e.currentTarget.value)} />
      <Button size="s" type="submit" disabled={!ready()} busy={busy()}>
        {t("settings.gitIdentitySave")}
      </Button>
      <Show when={!ready()}>
        <span class="field-hint identity-hint">{t("settings.gitIdentityHint")}</span>
      </Show>
    </form>
  );
}
