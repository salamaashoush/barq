import { type Child, For, Show, createEffect, createSignal, provide, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { type AnyFormApi, useSelector } from "@barqjs/form";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { useSearchParams } from "@barqjs/router";
import { Button } from "@barqjs/ui/button";
import { srOnly } from "@barqjs/ui/sr-only";
import { isServer } from "@barqjs/web";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bound } from "../lib/search-state.ts";
import { fg, focus, gap, layout, panel, type } from "../style/index.ts";
import { DescriptionList, type DescriptionItem } from "./description-list.tsx";
import { arcFormContext } from "./form.tsx";
import { maybeRouter } from "./link.ts";
import { useArcMessages } from "./messages.ts";
import { Stepper } from "./stepper.tsx";

/** One field a step holds: checked before the step is left, and listed in the summary. */
export interface WizardField {
  name: string;
  /** Names the field in the summary. Left out, the field is checked and not listed. */
  label?: string;
  /** How the summary writes its value. @default `String(value)` */
  format?: (value: unknown) => string;
}

export interface WizardStep {
  id: string;
  label: string;
  description?: string;
  /** Next goes past it unchecked, and Skip is offered. */
  optional?: boolean;
  /** The form fields on this step. */
  fields?: readonly (string | WizardField)[];
  /** A step that lists what the steps before it hold, each with a way back to change it. */
  summary?: boolean;
}

export const wizardStyles = variants({
  slots: {
    root: arc(layout.column, gap[6], layout.container),
    stepper: arc({}),
    panel: arc(layout.column, gap[4], focus.outline, { outline: "none" }),
    heading: arc(type.heading),
    description: arc(type.body, fg.muted),
    summary: arc(layout.column, gap[6]),
    summaryGroup: arc(layout.column, gap[2]),
    summaryHeader: arc(layout.row, layout.between, gap[2]),
    summaryHeading: arc(type.subheading),
    footer: arc(panel.footer, gap[2]),
  },
});

type Slots = ReturnType<typeof wizardStyles>;

interface Saved {
  step: string;
  completed: string | null;
  values: unknown;
}

export interface WizardProps extends Customisable<Slots> {
  /** The form the whole wizard fills, from `useArcForm`. Submitted on the last step. */
  form: AnyFormApi;
  steps: readonly WizardStep[];
  /** What one step shows: its fields. A `summary` step draws its list itself. */
  children: (step: WizardStep) => Child;
  /** Names the steps. */
  "aria-label"?: string;
  step?: string;
  defaultStep?: string;
  onStepChange?: (step: string) => void;
  /** Keep the step in this search parameter, so a step has a link and Back in the browser goes back a step. */
  param?: string;
  /**
   * Keep the values and the step in `localStorage` under this key as the
   * reader goes, so a reload or a return resumes where they were; cleared
   * once the form is submitted.
   */
  resume?: string;
  /** Called with the values each time a step is left forward: a draft to save. */
  onStepLeave?: (step: string, values: unknown) => void;
  /** @default arc's "Finish" */
  submitLabel?: Child;
}

function fieldOf(field: string | WizardField): WizardField {
  return typeof field === "string" ? { name: field } : field;
}

/** A value as the summary writes it when its field gives no `format`. */
function written(value: unknown): string {
  if (Array.isArray(value)) return value.map(written).join(", ");
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value.toString();
  }
  return JSON.stringify(value) ?? "";
}

function valueAt(values: unknown, path: string): unknown {
  let at: unknown = values;
  for (const key of path.split(".")) {
    if (at === null || typeof at !== "object") return undefined;
    at = (at as Record<string, unknown>)[key];
  }
  return at;
}

/**
 * A task in several steps over one arc form: `Stepper` above, a step's fields
 * in the middle, Back and Next below, the fields of a step checked before it
 * is left, and the form submitted from the last.
 *
 * ```tsx
 * <Wizard
 *   form={form}
 *   param="step"
 *   resume="new-project"
 *   steps={[
 *     { id: "details", label: "Details", fields: [{ name: "name", label: "Name" }] },
 *     { id: "team", label: "Team", optional: true, fields: ["members"] },
 *     { id: "review", label: "Review", summary: true },
 *   ]}
 * >
 *   {(step) => (step.id === "details" ? <DetailsFields /> : <TeamFields />)}
 * </Wizard>
 * ```
 *
 * A step done can be gone back to from the stepper or with Back; one not
 * reached yet cannot be jumped to. Moving to a step puts focus on its
 * heading and a screen reader hears "Step 2 of 3: Team".
 */
export function Wizard(props: WizardProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(wizardStyles(), props.classes);
  const form = untrack(() => props.form);
  const first = (): string => props.steps[0]?.id ?? "";
  const param = untrack(() => props.param);
  const url = param === undefined || maybeRouter() === undefined ? undefined : useSearchParams();
  const resumeKey = untrack(() => props.resume);

  const saved = ((): Saved | null => {
    if (resumeKey === undefined || isServer) return null;
    try {
      const raw = localStorage.getItem(resumeKey);
      return raw === null ? null : (JSON.parse(raw) as Saved);
    } catch {
      return null;
    }
  })();
  if (saved !== null) form.reset(saved.values, { keepDefaultValues: true });

  const step = bound<string>(
    url,
    param,
    () => props.step,
    untrack(() => props.defaultStep) ?? saved?.step ?? first(),
    (raw) => raw ?? first(),
    (value) => value,
    (value) => props.onStepChange?.(value),
  );
  const [completed, setCompleted] = createSignal<string | null>(saved?.completed ?? null, {
    ownedWrite: true,
  });
  const [invalid, setInvalid] = createSignal<ReadonlySet<string>>(new Set());
  const [said, setSaid] = createSignal("");
  const heading = makeRef<HTMLHeadingElement>();
  let moved = false;

  const index = (): number => {
    const found = props.steps.findIndex((one) => one.id === step.read());
    return found < 0 ? 0 : found;
  };
  const current = (): WizardStep | undefined => props.steps[index()];
  const isLast = (): boolean => index() === props.steps.length - 1;

  const go = (next: string): void => {
    moved = true;
    step.write(next);
    const at = props.steps.findIndex((one) => one.id === next);
    const target = props.steps[at];
    if (target !== undefined) {
      setSaid(messages().stepAnnounce(String(at + 1), String(props.steps.length), target.label));
    }
  };

  const check = async (target: WizardStep): Promise<boolean> => {
    const names = (target.fields ?? []).map((field) => fieldOf(field).name);
    let ok = true;
    for (const name of names) {
      const errors = await form.validateField(name as never, "submit");
      if (errors.length > 0) ok = false;
    }
    const next = new Set(invalid());
    if (ok) next.delete(target.id);
    else next.add(target.id);
    setInvalid(next);
    return ok;
  };

  const markDone = (id: string): void => {
    const done = props.steps.findIndex((one) => one.id === completed());
    const at = props.steps.findIndex((one) => one.id === id);
    if (at > done) setCompleted(id);
  };

  const next = async (skip = false): Promise<void> => {
    const here = current();
    if (here === undefined) return;
    if (!skip && here.optional !== true && !(await check(here))) return;
    markDone(here.id);
    props.onStepLeave?.(here.id, form.state.values);
    const after = props.steps[index() + 1];
    if (after !== undefined) go(after.id);
  };

  const back = (): void => {
    const before = props.steps[index() - 1];
    if (before !== undefined) go(before.id);
  };

  const finish = async (): Promise<void> => {
    for (const each of props.steps) {
      if (each.optional === true || each.summary === true) continue;
      if (!(await check(each))) {
        go(each.id);
        return;
      }
    }
    await form.handleSubmit();
    if (form.state.isSubmitSuccessful && resumeKey !== undefined && !isServer) {
      localStorage.removeItem(resumeKey);
    }
  };

  if (!isServer && resumeKey !== undefined) {
    const values = useSelector(form.store, (state) => state.values);
    createEffect(
      () => [values(), completed(), step.read()] as const,
      ([held, done, at]) => {
        const record: Saved = { step: at, completed: done, values: held };
        localStorage.setItem(resumeKey, JSON.stringify(record));
      },
    );
  }

  if (!isServer) {
    createEffect(
      () => [heading(), step.read()] as const,
      ([element]) => {
        if (element !== null && moved) element.focus();
      },
    );
  }

  const items = () =>
    props.steps.map((one) => ({
      id: one.id,
      label: one.label,
      description: one.description,
      optional: one.optional,
      invalid: invalid().has(one.id),
    }));

  const summaryItems = (target: WizardStep): DescriptionItem[] =>
    (target.fields ?? [])
      .map(fieldOf)
      .filter((field) => field.label !== undefined)
      .map((field) => {
        const value = valueAt(form.state.values, field.name);
        return {
          term: field.label ?? field.name,
          details:
            value === undefined || value === "" || value === null
              ? messages().notGiven
              : (field.format?.(value) ?? written(value)),
        };
      });

  return (
    <div class={arc(cls().root, props.class, props.className)} data-slot="wizard">
      <Stepper
        class={cls().stepper}
        aria-label={props["aria-label"] ?? messages().steps}
        items={items()}
        selectedKey={current()?.id}
        lastCompletedStep={completed()}
        onSelectionChange={(id: string) => go(id)}
      />
      <span class={srOnly} role="status" data-slot="wizard-status">
        {said()}
      </span>
      <form
        noValidate
        data-slot="wizard-form"
        onSubmit={(event: Event) => {
          event.preventDefault();
          if (isLast()) void finish();
          else void next();
        }}
      >
        {provide(
          arcFormContext,
          () => form,
          () => (
            <section
              class={cls().panel}
              data-slot="wizard-panel"
              aria-labelledby="arc-wizard-heading"
            >
              <h2
                id="arc-wizard-heading"
                ref={heading.set}
                tabIndex={-1}
                class={cls().heading}
                data-slot="wizard-heading"
              >
                {current()?.label}
              </h2>
              <Show when={current()?.description !== undefined}>
                <p class={cls().description}>{current()?.description}</p>
              </Show>
              <Show
                when={current()?.summary === true}
                fallback={current() === undefined ? null : props.children(current() as WizardStep)}
              >
                <div class={cls().summary} data-slot="wizard-summary">
                  <For
                    each={props.steps
                      .slice(0, index())
                      .filter((one) => summaryItems(one).length > 0)}
                  >
                    {(done: WizardStep) => (
                      <div class={cls().summaryGroup} data-slot="wizard-summary-step">
                        <div class={cls().summaryHeader}>
                          <h3 class={cls().summaryHeading}>{done.label}</h3>
                          <Button
                            variant="link"
                            size="sm"
                            aria-label={messages().editStep(done.label)}
                            onPress={() => go(done.id)}
                          >
                            {messages().edit}
                          </Button>
                        </div>
                        <DescriptionList items={summaryItems(done)} />
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </section>
          ),
        )}
        <div class={cls().footer} data-slot="wizard-footer">
          <Show when={index() > 0}>
            <Button variant="outline" onPress={back} data-slot="wizard-back">
              {messages().back}
            </Button>
          </Show>
          <Show when={current()?.optional === true && !isLast()}>
            <Button variant="ghost" onPress={() => void next(true)} data-slot="wizard-skip">
              {messages().skip}
            </Button>
          </Show>
          <Button type="submit" data-slot="wizard-next">
            {isLast() ? (props.submitLabel ?? messages().finish) : messages().next}
          </Button>
        </div>
      </form>
    </div>
  );
}
