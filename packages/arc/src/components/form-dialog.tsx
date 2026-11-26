import { type Child, Show, createSignal, createUniqueId, provide, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { AnyFormApi } from "@barqjs/form";
import type { Breakpoint } from "@barqjs/ui/conditions";
import { Button } from "@barqjs/ui/button";

import { arcLayer as arc } from "../layer.ts";
import { FormLoading, formSurface } from "../lib/form-surface.tsx";
import { type Classes, type Customisable, parts } from "../lib/parts.ts";
import { openState } from "../lib/search-state.ts";
import { gap, layout, type } from "../style/index.ts";
import { arcFormContext } from "./form.tsx";
import { maybeRouter } from "./link.ts";
import { useArcMessages } from "./messages.ts";
import { ResponsiveOverlay, type responsiveOverlayStyles } from "./responsive-overlay.tsx";
import { type DiscardLabels, UnsavedChangesGuard } from "./unsaved-changes-guard.tsx";

export const formDialogStyles = variants({
  slots: {
    form: arc(layout.column, gap[5]),
    cancel: arc({}),
    submit: arc({}),
    status: arc(type.meta, layout.pushEnd, { alignSelf: "center" }),
  },
});

type Slots = ReturnType<typeof formDialogStyles>;

type OverlaySlots = ReturnType<typeof responsiveOverlayStyles>;

export interface FormDialogProps extends Customisable<Slots & Classes<OverlaySlots>> {
  /** The form, from `useArcForm`. */
  form: AnyFormApi;
  /** Names the dialog and its form. */
  heading: Child;
  description?: Child;
  /** The fields. */
  children?: Child;
  /** The control that opens it. Leave it out to open it with `open` or `param`. */
  trigger?: Child;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Open while this search parameter is in the URL, so a link opens it. */
  param?: string;
  /** Below this viewport step, or under a finger, it is a sheet from the bottom. @default "md" */
  breakpoint?: Breakpoint;
  /** @default "Save" */
  submitLabel?: Child;
  /** @default "Cancel" */
  cancelLabel?: Child;
  /** The submit destroys something. */
  tone?: "default" | "danger";
  /** Close once a submission succeeds. Ignored while `result` is given. @default true */
  closeOnSubmit?: boolean;
  /** What closing with unsaved changes asks. */
  discard?: DiscardLabels;
  /** A line in the foot about the draft. Read politely. */
  status?: Child;
  /** The record is still loading: field skeletons in place of the fields, Save held. */
  loading?: boolean;
  /** Why the record did not load, in place of the fields. */
  loadError?: Child;
  /**
   * Draws what goes in place of the fields once a submission succeeds: what
   * was made and where next, a `SuccessState` or a secret shown once, from
   * what `onSubmit` kept. Its foot is a single Done.
   */
  result?: () => Child;
  /** @default arc's "Done" */
  doneLabel?: Child;
}

/**
 * A form in a dialog, which is a sheet from the bottom on a phone: the
 * fields in the body, Save and Cancel at the foot.
 *
 * ```tsx
 * const form = useArcForm(() => ({ defaultValues: { title: "" }, onSubmit: ({ value }) => open(value) }));
 *
 * <FormDialog form={form} heading="Open an incident" param="open-incident"
 *   trigger={<Button>Open incident</Button>}>
 *   <form.AppField name="title">{(field) => <field.TextField label="Title" />}</form.AppField>
 * </FormDialog>
 * ```
 *
 * `FormSheet`'s rules in a dialog: closing with unsaved changes asks first,
 * and so does leaving the page; it stays open while it submits; a failed
 * submit moves focus to the first field it marked. An edit dialog that
 * fetches its record first shows `loading`, then `loadError` or the fields.
 * With `result` a successful submit shows what it draws in place of the
 * fields, for a key shown once or a link to what was made, and Done closes
 * it:
 *
 * ```tsx
 * const [made, setMade] = createSignal<ApiKey>();
 * const form = useArcForm(() => ({ onSubmit: async ({ value }) => setMade(await api.createKey(value)) }));
 * <FormDialog form={form} heading="New API key" result={() => <SecretReveal value={made()?.secret} />}>…</FormDialog>
 * ```
 */
export function FormDialog(props: FormDialogProps) {
  const form = untrack(() => props.form);
  const formId = createUniqueId();
  const hasRouter = maybeRouter() !== undefined;
  const messages = useArcMessages();
  const [done, setDone] = createSignal(false, { ownedWrite: true });
  const { isOpen, setOpen } = openState({
    param: untrack(() => props.param),
    open: () => props.open,
    defaultOpen: untrack(() => props.defaultOpen),
    onOpenChange: (next) => {
      if (!next) setDone(false);
      props.onOpenChange?.(next);
    },
  });
  const { state, requestClose, submit } = formSurface(form, {
    setOpen,
    discard: () => props.discard,
    messages,
    closeOnSubmit: () => props.result === undefined && props.closeOnSubmit !== false,
  });
  function cls(): Slots {
    return parts(formDialogStyles(), props.classes);
  }
  function ready(): boolean {
    return props.loading !== true && props.loadError === undefined;
  }
  function showsResult(): boolean {
    return done() && props.result !== undefined;
  }
  async function send(element: HTMLFormElement): Promise<void> {
    if (!(await submit(element))) return;
    if (props.result !== undefined) {
      form.reset();
      setDone(true);
    }
  }

  function footer() {
    return (
      <Show
        when={!showsResult()}
        fallback={
          <Button onPress={() => setOpen(false)} data-slot="form-dialog-done">
            {props.doneLabel ?? messages().done}
          </Button>
        }
      >
        <Show when={props.status !== undefined}>
          <span class={cls().status} aria-live="polite" data-slot="form-dialog-status">
            {props.status}
          </span>
        </Show>
        <Button
          variant="outline"
          isDisabled={state().isSubmitting}
          onPress={() => void requestClose()}
          class={cls().cancel}
          data-slot="form-dialog-cancel"
        >
          {props.cancelLabel ?? messages().cancel}
        </Button>
        <Button
          type="submit"
          form={formId}
          variant={props.tone === "danger" ? "destructive" : "default"}
          isPending={state().isSubmitting}
          isDisabled={!state().canSubmit || !ready()}
          class={cls().submit}
          data-slot="form-dialog-submit"
        >
          {props.submitLabel ?? messages().save}
        </Button>
      </Show>
    );
  }

  return (
    <>
      <ResponsiveOverlay
        open={isOpen()}
        onOpenChange={(next: boolean) => {
          if (next) setOpen(true);
          else if (showsResult()) setOpen(false);
          else void requestClose();
        }}
        heading={props.heading}
        description={props.description}
        trigger={props.trigger}
        breakpoint={props.breakpoint}
        class={arc(props.class, props.className)}
        classes={props.classes}
        footer={footer()}
      >
        <Show when={!showsResult()} fallback={props.result?.()}>
          <form
            id={formId}
            class={cls().form}
            noValidate
            aria-busy={props.loading === true ? "true" : undefined}
            data-slot="form-dialog-form"
            onSubmit={(event: Event) => {
              event.preventDefault();
              if (ready()) void send(event.currentTarget as HTMLFormElement);
            }}
          >
            <Show
              when={ready()}
              fallback={<FormLoading error={props.loadError} messages={messages()} />}
            >
              {provide(
                arcFormContext,
                () => form,
                () => props.children,
              )}
            </Show>
          </form>
        </Show>
      </ResponsiveOverlay>
      <Show when={hasRouter}>
        <UnsavedChangesGuard
          when={isOpen() && state().isDirty}
          heading={props.discard?.heading}
          description={props.discard?.description}
          discardLabel={props.discard?.discardLabel}
          keepLabel={props.discard?.keepLabel}
        />
      </Show>
    </>
  );
}
