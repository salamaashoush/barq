import { type Child, Show, createUniqueId, provide, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { type AnyFormApi, useSelector } from "@barqjs/form";
import { Button } from "@barqjs/ui/button";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { openState } from "../lib/search-state.ts";
import { gap, layout } from "../style/index.ts";
import { DetailSheet, type DetailSheetClasses, type DetailSheetSize } from "./detail-sheet.tsx";
import { useArcMessages } from "./messages.ts";
import { arcFormContext } from "./form.tsx";
import { maybeRouter } from "./link.ts";
import {
  type DiscardLabels,
  UnsavedChangesGuard,
  confirmDiscard,
} from "./unsaved-changes-guard.tsx";

export interface FormSheetProps extends Customisable<Slots & DetailSheetClasses> {
  /** The form, from `useArcForm`. */
  form: AnyFormApi;
  /** Names the sheet and its form. */
  heading: Child;
  description?: Child;
  /** The fields. */
  children?: Child;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Open while this search parameter is in the URL, as `DetailSheet`'s is. */
  param?: string;
  /** @default "md" */
  size?: DetailSheetSize;
  /** @default "Save" */
  submitLabel?: Child;
  /** @default "Cancel" */
  cancelLabel?: Child;
  /** The submit destroys something. */
  tone?: "default" | "danger";
  /** Close once a submission succeeds. @default true */
  closeOnSubmit?: boolean;
  /** What closing with unsaved changes asks. */
  discard?: DiscardLabels;
}

export const formSheetStyles = variants({
  slots: {
    root: arc({}),
    form: arc(layout.column, gap[5]),
    cancel: arc({}),
    submit: arc({}),
  },
});

type Slots = ReturnType<typeof formSheetStyles>;

/**
 * A form in a sheet: its fields in the body, Save and Cancel at the foot.
 *
 * ```tsx
 * const form = useArcForm(() => ({ defaultValues: invoice, onSubmit: ({ value }) => save(value) }));
 *
 * <FormSheet form={form} heading="Edit invoice" param="edit">
 *   <form.AppField name="number">{(field) => <field.TextField label="Number" />}</form.AppField>
 * </FormSheet>
 * ```
 *
 * Closing it with unsaved changes, by Cancel, Escape or the close button,
 * asks through `confirm()` first, and so does leaving the page while it is
 * open. It stays open while it submits and closes once a submission
 * succeeds. `form.SubmitButton` and `form.FormError` work inside it.
 */
export function FormSheet(props: FormSheetProps) {
  const form = untrack(() => props.form);
  const formId = createUniqueId();
  const hasRouter = maybeRouter() !== undefined;
  const messages = useArcMessages();
  const { isOpen, setOpen } = openState({
    param: untrack(() => props.param),
    open: () => props.open,
    defaultOpen: untrack(() => props.defaultOpen),
    onOpenChange: (next) => props.onOpenChange?.(next),
  });
  function cls(): Slots {
    return parts(formSheetStyles(), props.classes);
  }

  const state = useSelector(form.store, (current) => ({
    isDirty: current.isDirty,
    isSubmitting: current.isSubmitting,
    canSubmit: current.canSubmit,
  }));

  async function requestClose(): Promise<void> {
    if (state().isSubmitting) return;
    if (state().isDirty) {
      if (!(await confirmDiscard(props.discard, messages()))) return;
      form.reset();
    }
    setOpen(false);
  }

  async function submit(): Promise<void> {
    await form.handleSubmit();
    // A submission the server refused still completes; the errors it set on
    // the form are what say it failed, and they have to stay in view.
    if (form.state.isSubmitSuccessful && form.state.isValid && props.closeOnSubmit !== false) {
      setOpen(false);
    }
  }

  return (
    <>
      <DetailSheet
        open={isOpen()}
        onOpenChange={(next: boolean) => {
          if (next) setOpen(true);
          else void requestClose();
        }}
        heading={props.heading}
        description={props.description}
        size={props.size}
        class={arc(cls().root, props.class, props.className)}
        classes={props.classes}
        data-slot="form-sheet"
        footer={
          <>
            <Button
              variant="outline"
              isDisabled={state().isSubmitting}
              onPress={() => void requestClose()}
              class={cls().cancel}
              data-slot="form-sheet-cancel"
            >
              {props.cancelLabel ?? messages().cancel}
            </Button>
            <Button
              type="submit"
              form={formId}
              variant={props.tone === "danger" ? "destructive" : "default"}
              isPending={state().isSubmitting}
              isDisabled={!state().canSubmit}
              class={cls().submit}
              data-slot="form-sheet-submit"
            >
              {props.submitLabel ?? messages().save}
            </Button>
          </>
        }
      >
        <form
          id={formId}
          class={cls().form}
          noValidate
          data-slot="form-sheet-form"
          onSubmit={(event: Event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {provide(
            arcFormContext,
            () => form,
            () => props.children,
          )}
        </form>
      </DetailSheet>
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
