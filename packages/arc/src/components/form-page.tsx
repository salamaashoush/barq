import {
  type Child,
  For,
  Show,
  createEffect,
  createSignal,
  createUniqueId,
  provide,
  untrack,
} from "@barqjs/core";
import { variants } from "@barqjs/css";
import { type AnyFormApi, useSelector } from "@barqjs/form";
import { CircleAlert } from "@barqjs/lucide/icons/circle-alert";
import { Button } from "@barqjs/ui/button";

import { arcLayer as arc } from "../layer.ts";
import { focusFirstInvalid } from "../lib/form-surface.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  edge,
  fg,
  focus,
  gap,
  glyph,
  layout,
  rounded,
  space,
  tone,
  type,
} from "../style/index.ts";
import { arcFormContext, useArcFormContext } from "./form.tsx";
import { messagesOf } from "../lib/field.tsx";
import { maybeRouter } from "./link.ts";
import { useArcMessages } from "./messages.ts";
import { Status } from "./status.tsx";
import { UnsavedChangesGuard } from "./unsaved-changes-guard.tsx";

export const formPageStyles = variants({
  slots: {
    root: arc(layout.column, gap[8], layout.minZero),
    form: arc(layout.column, gap[8], layout.minZero),
    fields: arc(layout.column, gap[6], layout.minZero),
    bar: arc(layout.row, layout.wrap, gap[2], layout.end, edge.top, bg.page, layout.sticky, {
      insetBlockEnd: "0",
      minHeight: space.x16,
      paddingBlock: space.x3,
      paddingBlockEnd: `max(${space.x3}, env(safe-area-inset-bottom))`,
    }),
    note: arc(layout.row, gap[2], type.meta, layout.minZero, { marginInlineEnd: "auto" }),
    summary: arc(
      layout.column,
      gap[2],
      rounded.lg,
      tone.danger,
      bg.tone,
      edge.all,
      edge.tone,
      focus.visible,
      { padding: space.x4 },
    ),
    summaryHeading: arc(layout.row, gap[2], type.subheading, glyph.md),
    summaryIcon: arc(fg.danger),
    summaryList: arc(layout.column, gap[1.5], type.body, layout.flush, { paddingInlineStart: "0" }),
    summaryLink: arc(type.medium, fg.danger, {
      textDecorationLine: "underline",
      textUnderlineOffset: "2px",
    }),
  },
});

type Slots = ReturnType<typeof formPageStyles>;

/** A second way to submit: "Save and add another". */
export interface SecondarySubmit {
  label: Child;
  /** Handed to `onSubmit` as `meta.intent`. */
  intent: string;
}

/** One thing to fix: the control to go to, its label and what is wrong. */
export interface FormProblem {
  id: string;
  label: string;
  message: string;
}

// --- the error summary -------------------------------------------------------------

export interface ErrorSummaryProps extends Customisable<Slots> {
  problems: readonly FormProblem[];
  /** About the submission as a whole: the server's refusal. */
  failure?: Child;
  /** @default arc's "There is a problem" */
  heading?: Child;
}

/** Takes the reader to the control, with its label scrolled into view above it. */
function goTo(event: MouseEvent, id: string): void {
  const control = document.getElementById(id);
  if (control === null) return;
  event.preventDefault();
  control.closest('[data-slot="arc-field"]')?.scrollIntoView({ block: "start" });
  control.focus({ preventScroll: true });
}

/**
 * What a long form's failed submit has to fix, at its top: each problem a
 * link to its field, and the server's word on the whole.
 *
 * ```tsx
 * <ErrorSummary problems={[{ id: "email-control", label: "Email", message: "Enter an email" }]} />
 * ```
 *
 * An alert that takes focus, so the reader hears what is wrong before the
 * page. A link focuses its control with the label scrolled into view.
 * `RecordFormPage` draws one for itself.
 */
export function ErrorSummary(props: ErrorSummaryProps) {
  const messages = useArcMessages();
  const headingId = createUniqueId();
  function cls(): Slots {
    return parts(formPageStyles(), props.classes);
  }
  return (
    <div
      class={arc(cls().summary, props.class, props.className)}
      tabIndex={-1}
      role="alert"
      aria-labelledby={headingId}
      data-slot="error-summary"
    >
      <h2 id={headingId} class={cls().summaryHeading}>
        <CircleAlert aria-hidden="true" class={cls().summaryIcon} />
        {props.heading ?? messages().errorSummary}
      </h2>
      <Show when={props.failure !== undefined}>
        <p class={type.body}>{props.failure}</p>
      </Show>
      <Show when={props.problems.length > 0}>
        <ul class={cls().summaryList}>
          <For each={props.problems}>
            {(problem: FormProblem) => (
              <li>
                <a
                  href={`#${problem.id}`}
                  class={cls().summaryLink}
                  onClick={(event: MouseEvent) => goTo(event, problem.id)}
                >
                  {messages().errorSummaryItem(problem.label, problem.message)}
                </a>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}

interface Scan {
  fields: number;
  problems: FormProblem[];
}

/** The fields as arc's frames drew them, so the summary lists exactly the errors on screen. */
function scan(root: HTMLElement): Scan {
  const fields = root.querySelectorAll<HTMLElement>('[data-slot="arc-field"]');
  const problems: FormProblem[] = [];
  for (const field of fields) {
    if (!field.hasAttribute("data-invalid")) continue;
    const label = field.querySelector<HTMLElement>('[data-slot="field-label"]');
    if (label === null || !label.id.endsWith("-label")) continue;
    const base = label.id.slice(0, -"-label".length);
    const error = root.ownerDocument.getElementById(`${base}-error`);
    const control =
      root.ownerDocument.getElementById(`${base}-control`) ??
      field.querySelector<HTMLElement>(`[aria-describedby~="${base}-error"]`);
    if (control === null) continue;
    if (control.id === "") control.id = `${base}-control`;
    problems.push({
      id: control.id,
      label: label.textContent?.trim() ?? "",
      message: error?.textContent?.trim() ?? "",
    });
  }
  return { fields: fields.length, problems };
}

// --- the sticky bar ------------------------------------------------------------------

export interface FormActionBarProps extends Customisable<Slots> {
  /** At the start: in place of "Unsaved changes", a save state or what saving does. */
  note?: Child;
  /** @default arc's "Save" */
  submitLabel?: Child;
  secondary?: SecondarySubmit;
  /** A Cancel that leaves: back to the list. Without it, a Discard puts back what was saved. */
  onCancel?: () => void;
  /** @default arc's "Cancel", or "Discard changes" */
  cancelLabel?: Child;
  /** Other actions, before the submit. */
  children?: Child;
}

/**
 * A form's own actions, held at the bottom of the screen while the form
 * scrolls: what is unsaved at the start, Cancel or Discard and Save at the
 * end.
 *
 * ```tsx
 * <form.AppForm>
 *   <form onSubmit={…}>
 *     …fields…
 *     <FormActionBar onCancel={() => navigate({ to: "/windows" })} />
 *   </form>
 * </form.AppForm>
 * ```
 *
 * It reads the form around it: "Unsaved changes" with a dot once a field
 * changed, Save pending while it submits, Discard only while there is
 * something to discard. Clear of the home indicator on a phone.
 */
export function FormActionBar(props: FormActionBarProps) {
  const messages = useArcMessages();
  const form = useArcFormContext();
  const state = form.useSelector((current) => ({
    isDirty: current.isDirty,
    isSubmitting: current.isSubmitting,
    canSubmit: current.canSubmit,
  }));
  function cls(): Slots {
    return parts(formPageStyles(), props.classes);
  }
  function note(): Child {
    return props.note;
  }
  return (
    <div
      class={arc(cls().bar, props.class, props.className)}
      data-slot="form-action-bar"
      data-dirty={state().isDirty ? "" : undefined}
    >
      <span class={cls().note} role="status" data-slot="form-action-bar-note">
        <Show when={props.note === undefined && state().isDirty} fallback={note()}>
          <Status tone="warning">{messages().unsavedChanges}</Status>
        </Show>
      </span>
      {props.children}
      <Show
        when={props.onCancel !== undefined}
        fallback={
          <Show when={state().isDirty}>
            <Button
              variant="outline"
              isDisabled={state().isSubmitting}
              onPress={() => form.reset()}
              data-slot="form-action-bar-discard"
            >
              {props.cancelLabel ?? messages().discardChanges}
            </Button>
          </Show>
        }
      >
        <Button
          variant="outline"
          isDisabled={state().isSubmitting}
          onPress={() => props.onCancel?.()}
          data-slot="form-action-bar-cancel"
        >
          {props.cancelLabel ?? messages().cancel}
        </Button>
      </Show>
      <Show when={props.secondary !== undefined}>
        <Button
          type="submit"
          variant="outline"
          name="intent"
          value={props.secondary?.intent}
          isDisabled={state().isSubmitting || !state().canSubmit}
          data-slot="form-action-bar-secondary"
        >
          {props.secondary?.label}
        </Button>
      </Show>
      <Button
        type="submit"
        isPending={state().isSubmitting}
        isDisabled={!state().canSubmit}
        data-slot="form-action-bar-submit"
      >
        {props.submitLabel ?? messages().save}
      </Button>
    </div>
  );
}

// --- the page form ---------------------------------------------------------------------

export interface RecordFormPageProps extends Customisable<Slots> {
  /** The form, from `useArcForm`. A `secondary` submit arrives in `onSubmit` as `meta.intent`. */
  form: AnyFormApi;
  /** The fields, in sections. */
  children?: Child;
  /** @default arc's "Save" */
  submitLabel?: Child;
  secondary?: SecondarySubmit;
  /** Where Cancel goes. Without it the bar offers Discard. */
  onCancel?: () => void;
  cancelLabel?: Child;
  /** At the start of the bar, in place of "Unsaved changes". */
  note?: Child;
  /** Under the form, past its bar: a `DangerZone`. */
  danger?: Child;
  /** Past this many fields a failed submit opens with a summary of what to fix. @default 5 */
  summaryAfter?: number;
}

interface SubmitMeta {
  intent?: string;
}

interface FieldErrors {
  errors?: unknown[];
}

/**
 * A page that creates or edits one record: the fields in one column, Save
 * and Cancel held at the bottom of the screen, and a danger zone under it.
 *
 * ```tsx
 * const form = useArcForm(() => ({
 *   defaultValues: student,
 *   onSubmitMeta: {} as { intent?: string },
 *   onSubmit: async ({ value, meta }) => {
 *     await save(value);
 *     if (meta.intent === "another") form.reset();
 *     else navigate({ to: "/students" });
 *   },
 * }));
 *
 * <RecordFormPage form={form} secondary={{ label: "Save and add another", intent: "another" }}
 *   onCancel={() => navigate({ to: "/students" })} danger={<DangerZone actions={…} />}>
 *   <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
 * </RecordFormPage>
 * ```
 *
 * A failed submit on a long form opens with an `ErrorSummary` that takes
 * focus and follows the errors as they are fixed; on a short one focus goes
 * to the first field marked. Leaving with unsaved changes asks first, except
 * while a submit is under way, so a save that navigates is not stopped.
 */
export function RecordFormPage(props: RecordFormPageProps) {
  const form = untrack(() => props.form);
  const hasRouter = maybeRouter() !== undefined;
  const [problems, setProblems] = createSignal<Scan>(
    { fields: 0, problems: [] },
    {
      ownedWrite: true,
    },
  );
  const [submitted, setSubmitted] = createSignal(false, { ownedWrite: true });
  const state = useSelector(form.store, (current) => ({
    isDirty: current.isDirty,
    isSubmitting: current.isSubmitting,
    failure: messagesOf(current.errors).join(" "),
    errors: Object.values(current.fieldMeta)
      .map((meta) => messagesOf((meta as FieldErrors | undefined)?.errors ?? []).join(" "))
      .join("\n"),
  }));
  let root: HTMLFormElement | undefined;
  function cls(): Slots {
    return parts(formPageStyles(), props.classes);
  }
  function rescan(): void {
    if (root !== undefined) setProblems(scan(root));
  }
  function shown(): boolean {
    return (
      submitted() &&
      problems().fields > (props.summaryAfter ?? 5) &&
      (problems().problems.length > 0 || state().failure !== "")
    );
  }
  createEffect(
    () => [submitted(), state().errors, state().failure] as const,
    ([after]) => {
      if (!after) return undefined;
      const frame = requestAnimationFrame(rescan);
      return () => cancelAnimationFrame(frame);
    },
  );

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const element = event.currentTarget as HTMLFormElement;
    const before = element.ownerDocument.activeElement;
    const submitter = event.submitter;
    const intent =
      submitter instanceof HTMLButtonElement && submitter.value !== ""
        ? submitter.value
        : undefined;
    const meta: SubmitMeta = intent === undefined ? {} : { intent };
    await form.handleSubmit(meta as never);
    if (form.state.isSubmitSuccessful && form.state.isValid) {
      setSubmitted(false);
      return;
    }
    requestAnimationFrame(() => {
      if (!element.isConnected) return;
      const found = scan(element);
      setProblems(found);
      setSubmitted(true);
      const long = found.fields > (props.summaryAfter ?? 5);
      if (long) {
        requestAnimationFrame(() =>
          element.querySelector<HTMLElement>('[data-slot="error-summary"]')?.focus(),
        );
      } else focusFirstInvalid(element, before);
    });
  }

  return (
    <div class={arc(cls().root, props.class, props.className)} data-slot="record-form-page">
      <form
        ref={(element: HTMLFormElement) => {
          root = element;
        }}
        class={cls().form}
        noValidate
        onSubmit={(event: SubmitEvent) => void submit(event)}
        data-slot="record-form-page-form"
      >
        {provide(
          arcFormContext,
          () => form,
          () => (
            <>
              <Show when={shown()}>
                <ErrorSummary
                  problems={problems().problems}
                  failure={state().failure === "" ? undefined : state().failure}
                  classes={props.classes}
                />
              </Show>
              <div class={cls().fields} data-slot="record-form-page-fields">
                {props.children}
              </div>
              <FormActionBar
                note={props.note}
                submitLabel={props.submitLabel}
                secondary={props.secondary}
                onCancel={props.onCancel}
                cancelLabel={props.cancelLabel}
                classes={props.classes}
              />
            </>
          ),
        )}
      </form>
      {props.danger}
      <Show when={hasRouter}>
        <UnsavedChangesGuard when={state().isDirty && !state().isSubmitting} />
      </Show>
    </div>
  );
}
