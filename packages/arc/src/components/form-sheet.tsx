import { type Child, Show, createUniqueId, provide, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { AnyFormApi } from "@barqjs/form";
import { Button } from "@barqjs/ui/button";

import { arcLayer as arc } from "../layer.ts";
import { FormLoading, formSurface } from "../lib/form-surface.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import { openState } from "../lib/search-state.ts";
import { gap, layout, type } from "../style/index.ts";
import { DetailSheet, type DetailSheetClasses, type DetailSheetSize } from "./detail-sheet.tsx";
import { useArcMessages } from "./messages.ts";
import { arcFormContext } from "./form.tsx";
import { maybeRouter } from "./link.ts";
import { type DiscardLabels, UnsavedChangesGuard } from "./unsaved-changes-guard.tsx";

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
  /**
   * A line at the end of the foot about what is written so far: "Draft kept
   * on this device", a `SaveStatus`. Read politely.
   */
  status?: Child;
  /** The record is still loading: field skeletons in place of the fields, Save held. */
  loading?: boolean;
  /** Why the record did not load, in place of the fields. */
  loadError?: Child;
}

export const formSheetStyles = variants({
  slots: {
    root: arc({}),
    form: arc(layout.column, gap[5]),
    cancel: arc({}),
    submit: arc({}),
    status: arc(type.meta, layout.pushEnd, { alignSelf: "center" }),
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
 * succeeds; one that fails moves focus to the first field it marked.
 * `form.SubmitButton` and `form.FormError` work inside it. `status` is a
 * line in the foot about the draft; `loading` and `loadError` stand in for
 * the fields while the record it edits is fetched. `FormDialog` is the same
 * form in a dialog.
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

  const { state, requestClose, submit } = formSurface(form, {
    setOpen,
    discard: () => props.discard,
    messages,
    closeOnSubmit: () => props.closeOnSubmit !== false,
  });
  function ready(): boolean {
    return props.loading !== true && props.loadError === undefined;
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
              isDisabled={!state().canSubmit || !ready()}
              class={cls().submit}
              data-slot="form-sheet-submit"
            >
              {props.submitLabel ?? messages().save}
            </Button>
            <Show when={props.status !== undefined}>
              <span class={cls().status} aria-live="polite" data-slot="form-sheet-status">
                {props.status}
              </span>
            </Show>
          </>
        }
      >
        <form
          id={formId}
          class={cls().form}
          noValidate
          aria-busy={props.loading === true ? "true" : undefined}
          data-slot="form-sheet-form"
          onSubmit={(event: Event) => {
            event.preventDefault();
            if (ready()) void submit(event.currentTarget as HTMLFormElement);
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
