/**
 * What a look criterion does on the page before its picture, as numbered
 * lines in mono — the clause's own small list, numbered like the clauses:
 * editable in the contract, readable on the goal page. Nothing in a contract
 * is invisible: a criterion with steps always shows them.
 */
import { For, Index, Show } from "solid-js";

import { t } from "../lib/i18n";
import { STEP_EXAMPLES, lookStepOk } from "../lib/lookSteps";
import { Icon } from "./Glyph";
import { Button, IconButton } from "./ui";

const no = (i: number) => String(i + 1).padStart(2, "0");

/** The steps of criterion `id`, one input a line; Enter opens the next line, ⌫ on an empty one closes it. */
export function LookStepsEdit(props: { id: string; steps: string[]; issues: string[]; onChange: (steps: string[]) => void }) {
  let box!: HTMLDivElement;
  // Focus follows the line you made or closed; with none left, it goes back to "+ Step".
  // The rows are in the document as soon as the change is (Solid updates synchronously): focus moves at once, so a
  // fast typist's next key lands in the new line, not the old one.
  const focusAt = (i: number) => (box.querySelectorAll<HTMLInputElement>(".look-step input")[i] ?? box.querySelector<HTMLElement>(".look-steps-head .btn"))?.focus();
  const insert = (at: number) => {
    props.onChange([...props.steps.slice(0, at), "", ...props.steps.slice(at)]);
    focusAt(at);
  };
  const remove = (at: number) => {
    props.onChange(props.steps.filter((_, j) => j !== at));
    focusAt(Math.max(0, at - 1));
  };
  return (
    <div ref={box} class="criterion-cmd-row look-steps" role="group" aria-label={t("contract.lookStepsLabel", { id: props.id })}>
      <div class="look-steps-head">
        <span class="look-steps-title">{t("contract.lookStepsTitle")}</span>
        <Button size="s" variant="ghost" onClick={() => insert(props.steps.length)}>
          <Icon name="plus" size={10} />
          {t("contract.addStep")}
        </Button>
      </div>
      <Show when={props.steps.length} fallback={<span class="field-hint">{t("contract.lookStepsHint")}</span>}>
        <ol class="look-step-list">
          {/* By position, not by text: typing in a line keeps its input (and the focus). */}
          <Index each={props.steps}>
            {(s, i) => {
              const bad = () => s().trim() !== "" && !lookStepOk(s());
              return (
                <li class="look-step" classList={{ invalid: bad() }}>
                  <span class="look-step-no num" aria-hidden="true">
                    {no(i)}
                  </span>
                  <input
                    class="mono"
                    value={s()}
                    spellcheck={false}
                    aria-label={t("contract.lookStepLabel", { id: props.id, n: i + 1 })}
                    aria-invalid={bad() ? "true" : undefined}
                    placeholder={STEP_EXAMPLES[i % STEP_EXAMPLES.length]}
                    onInput={(e) => props.onChange(props.steps.map((x, j) => (j === i ? e.currentTarget.value : x)))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.isComposing) {
                        e.preventDefault();
                        insert(i + 1);
                      } else if (e.key === "Backspace" && e.currentTarget.value === "") {
                        e.preventDefault();
                        remove(i);
                      }
                    }}
                  />
                  <IconButton icon="cross" size={22} label={t("contract.removeStep", { n: i + 1 })} onClick={() => remove(i)} />
                </li>
              );
            }}
          </Index>
        </ol>
      </Show>
      <For each={props.issues}>{(m) => <p class="field-error">{m}</p>}</For>
    </div>
  );
}

/** The steps as the goal page reads them: the same numbered lines, nothing to type into. */
export function LookStepsRead(props: { steps: string[] }) {
  return (
    <ol class="look-step-list look-step-list-read">
      <For each={props.steps}>
        {(s, i) => (
          <li class="look-step">
            <span class="look-step-no num" aria-hidden="true">
              {no(i())}
            </span>
            <code class="code-val">{s}</code>
          </li>
        )}
      </For>
    </ol>
  );
}
