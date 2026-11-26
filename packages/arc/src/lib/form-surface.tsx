import { type Accessor, type Child, For, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { type AnyFormApi, useSelector } from "@barqjs/form";
import { Skeleton } from "@barqjs/ui/skeleton";

import { arcLayer as arc } from "../layer.ts";
import { gap, layout, space, type } from "../style/index.ts";
import { InlineAlert } from "../components/alert.tsx";
import type { ArcMessages } from "../components/messages.ts";
import { type DiscardLabels, confirmDiscard } from "../components/unsaved-changes-guard.tsx";

export interface FormSurfaceState {
  isDirty: boolean;
  isSubmitting: boolean;
  canSubmit: boolean;
}

export interface FormSurfaceOptions {
  setOpen: (open: boolean) => void;
  discard: () => DiscardLabels | undefined;
  messages: () => ArcMessages;
  /** Whether a successful submission closes it. */
  closeOnSubmit: () => boolean;
}

/** What a sheet or a dialog holding a form shares: its state, closing with a guard, submitting. */
export interface FormSurface {
  state: Accessor<FormSurfaceState>;
  /** Closes it, asking first when it holds unsaved changes. */
  requestClose: () => Promise<void>;
  /** Submits; resolves whether it succeeded. */
  submit: (form: HTMLFormElement | null) => Promise<boolean>;
}

/**
 * Focus goes to the first invalid control after a failed submit, unless the
 * reader moved it somewhere else of their own while the submit ran.
 */
export function focusFirstInvalid(root: HTMLElement | null, before: Element | null): void {
  if (root === null) return;
  requestAnimationFrame(() => {
    const active = root.ownerDocument.activeElement;
    if (active !== before && active !== root.ownerDocument.body && !root.contains(active)) return;
    root.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  });
}

export function formSurface(form: AnyFormApi, options: FormSurfaceOptions): FormSurface {
  const state = useSelector(form.store, (current): FormSurfaceState => ({
    isDirty: current.isDirty,
    isSubmitting: current.isSubmitting,
    canSubmit: current.canSubmit,
  }));

  async function requestClose(): Promise<void> {
    if (state().isSubmitting) return;
    if (state().isDirty) {
      if (!(await confirmDiscard(options.discard(), options.messages()))) return;
      form.reset();
    }
    options.setOpen(false);
  }

  async function submit(element: HTMLFormElement | null): Promise<boolean> {
    const before = element?.ownerDocument.activeElement ?? null;
    await form.handleSubmit();
    // A submission the server refused still completes; the errors it set on
    // the form are what say it failed, and they have to stay in view.
    const done = form.state.isSubmitSuccessful && form.state.isValid;
    if (!done) focusFirstInvalid(element, before);
    else if (options.closeOnSubmit()) options.setOpen(false);
    return done;
  }

  return { state, requestClose, submit };
}

export const formLoadingStyles = variants({
  slots: {
    root: arc(layout.column, gap[5]),
    field: arc(layout.column, gap[2]),
    label: arc({ height: space.x4, width: "8rem" }),
    control: arc({ height: space.x9 }),
    error: arc(type.body),
  },
});

export interface FormLoadingProps {
  /** Why the record did not load. */
  error?: Child;
  /** How many fields the skeleton draws. @default 3 */
  fields?: number;
  messages: ArcMessages;
}

/** A form's body while its record loads, or why it did not. */
export function FormLoading(props: FormLoadingProps) {
  const cls = formLoadingStyles();
  return (
    <Show
      when={props.error === undefined}
      fallback={
        <InlineAlert tone="danger" title={props.messages.recordNotLoaded}>
          {props.error}
        </InlineAlert>
      }
    >
      <div
        class={cls.root}
        role="status"
        aria-label={props.messages.loading}
        data-slot="form-loading"
      >
        <For each={Array.from({ length: props.fields ?? 3 }, (_, index) => index)}>
          {() => (
            <div class={cls.field}>
              <Skeleton class={cls.label} />
              <Skeleton class={cls.control} />
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
