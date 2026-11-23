import { type Child, Show, createSignal, createUniqueId, provide, untrack } from "@barqjs/core";
import { type AnyFormApi, useSelector } from "@barqjs/form";
import { useSearchParams } from "@barqjs/router";
import { Button } from "@barqjs/ui/button";

import { arcLayer as arc } from "../layer.ts";
import { DetailSheet, type DetailSheetSize } from "./detail-sheet.tsx";
import { arcFormContext } from "./form.tsx";
import { maybeRouter } from "./link.ts";
import {
  type DiscardLabels,
  UnsavedChangesGuard,
  confirmDiscard,
} from "./unsaved-changes-guard.tsx";

export interface FormSheetProps {
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
  class?: string;
}

const body = arc({
  display: "flex",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 5)",
});

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
  const param = untrack(() => props.param);
  const url = param === undefined ? undefined : useSearchParams();
  const hasRouter = maybeRouter() !== undefined;
  const [own, setOwn] = createSignal(untrack(() => props.defaultOpen) ?? false);

  const state = useSelector(form.store, (current) => ({
    isDirty: current.isDirty,
    isSubmitting: current.isSubmitting,
    canSubmit: current.canSubmit,
  }));

  const isOpen = (): boolean => {
    if (url !== undefined && param !== undefined) return url[0]().has(param);
    return props.open ?? own();
  };

  const setOpen = (next: boolean): void => {
    if (url !== undefined && param !== undefined) {
      if (!next) {
        url[1]((current) => {
          const kept: Record<string, string> = {};
          for (const [key, value] of current) if (key !== param) kept[key] = value;
          return kept;
        });
      }
    } else if (props.open === undefined) {
      setOwn(next);
    }
    props.onOpenChange?.(next);
  };

  const requestClose = async (): Promise<void> => {
    if (state().isSubmitting) return;
    if (state().isDirty) {
      if (!(await confirmDiscard(props.discard))) return;
      form.reset();
    }
    setOpen(false);
  };

  const submit = async (): Promise<void> => {
    await form.handleSubmit();
    if (form.state.isSubmitSuccessful && props.closeOnSubmit !== false) setOpen(false);
  };

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
        class={props.class}
        data-slot="form-sheet"
        footer={
          <>
            <Button
              variant="outline"
              isDisabled={state().isSubmitting}
              onPress={() => void requestClose()}
              data-slot="form-sheet-cancel"
            >
              {props.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              type="submit"
              form={formId}
              variant={props.tone === "danger" ? "destructive" : "default"}
              isPending={state().isSubmitting}
              isDisabled={!state().canSubmit}
              data-slot="form-sheet-submit"
            >
              {props.submitLabel ?? "Save"}
            </Button>
          </>
        }
      >
        <form
          id={formId}
          class={body}
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
