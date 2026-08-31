/**
 * A form, and the validation that belongs to the whole of it rather than to
 * one field.
 *
 * Three things a `<form>` cannot do on its own:
 *
 * - **Hand a submission's errors back to the fields they belong to.** A server
 *   answering "that address is already taken" knows the field name and nothing
 *   else; `<Form validationErrors={…}>` puts each message where its field can
 *   find it, and the field clears it the moment the user edits the value.
 * - **Choose one validation behaviour for everything inside.** Setting
 *   `validationBehavior` per field is how a form ends up half native and half
 *   ARIA, which means half of it blocks submission and half does not.
 * - **Give a submit handler the values.** `onSubmit` here is called with a
 *   `FormData`, and the default is prevented, because a form that both calls a
 *   handler AND navigates does both.
 */

import { type Child, type Incoming } from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import {
  provideValidationBehavior,
  provideValidationErrors,
  type ValidationBehavior,
  type ValidationErrors,
} from "./validation.ts";
import { filterDOMProps, fromProps, mergeProps, type StyleProps, styleProps } from "./utils.ts";

export interface FormComponentProps extends StyleProps {
  children?: Child;
  /** Errors a submission came back with, by field name. */
  validationErrors?: ValidationErrors;
  /** @default "aria" */
  validationBehavior?: ValidationBehavior;
  action?: string;
  method?: "get" | "post" | "dialog";
  encType?: string;
  target?: string;
  autoComplete?: "on" | "off";
  /** Turn off the browser's own validation UI. */
  noValidate?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  ref?: RefTarget<HTMLFormElement>;
  onSubmit?: (data: FormData, event: SubmitEvent) => void;
  onReset?: (event: Event) => void;
}

/**
 * ```tsx
 * <Form validationErrors={errors()} onSubmit={(data) => save(data)}>
 *   <TextField label="Email" name="email" type="email" isRequired />
 *   <Button type="submit">Save</Button>
 * </Form>
 * ```
 */
export function Form(props: Incoming<FormComponentProps>) {
  const domRef = makeRef<HTMLFormElement>();

  provideValidationErrors(() => props.validationErrors?.() ?? {});
  provideValidationBehavior(() => props.validationBehavior?.());

  const onSubmit = (event: SubmitEvent): void => {
    const handler = props.onSubmit?.();
    if (handler === undefined) return;
    // Both calling a handler and navigating is doing the thing twice.
    event.preventDefault();
    handler(new FormData(event.currentTarget as HTMLFormElement), event);
  };

  const elementProps = mergeProps(
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      action: () => props.action?.(),
      method: () => props.method?.(),
      enctype: () => props.encType?.(),
      target: () => props.target?.(),
      autocomplete: () => props.autoComplete?.(),
      novalidate: () => props.noValidate?.() === true || undefined,
      "aria-label": () => props["aria-label"]?.(),
      "aria-labelledby": () => props["aria-labelledby"]?.(),
      "data-testid": () => props["data-testid"]?.(),
      onSubmit,
      onReset: (event: Event) => props.onReset?.()?.(event),
    },
  );

  return (
    <form {...elementProps} ref={mergeRefs(domRef.set, props.ref?.())}>
      {props.children}
    </form>
  );
}
