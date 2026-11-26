import { type Child, Show, createMemo, createUniqueId, hasContext, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { controllable } from "@barqjs/aria/utils";
import { type AnyFieldApi, type AnyFormApi, createFormHookContexts } from "@barqjs/form";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@barqjs/ui/field";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "./parts.ts";

export const {
  fieldContext: arcFieldContext,
  formContext: arcFormContext,
  useFieldContext: useArcField,
  useFormContext: useArcFormContext,
} = createFormHookContexts();

/** One message, from a validator's string or a schema's issue. */
function messageOf(error: unknown): string | undefined {
  if (typeof error === "string") return error === "" ? undefined : error;
  if (error !== null && typeof error === "object" && "message" in error) {
    const message = error.message;
    return typeof message === "string" && message !== "" ? message : undefined;
  }
  return undefined;
}

export function messagesOf(errors: readonly unknown[]): string[] {
  const found: string[] = [];
  for (const error of errors) {
    const message = messageOf(error);
    if (message !== undefined && !found.includes(message)) found.push(message);
  }
  return found;
}

export const fieldStyles = variants({
  slots: {
    root: arc({}),
    label: arc({}),
    content: arc({}),
    description: arc({}),
    error: arc({}),
    control: arc({}),
  },
});

export type FieldSlots = ReturnType<typeof fieldStyles>;

/** The labels and messages every field takes. */
export interface ArcFieldProps extends Customisable<FieldSlots> {
  label: Child;
  description?: Child;
  isDisabled?: boolean;
  isRequired?: boolean;
}

/**
 * The value side of a field that also stands alone. Inside `form.AppField`
 * with none of these given, the field is the form's; given any of `value`,
 * `defaultValue` or `onChange`, it is the caller's.
 */
export interface FieldValueProps<T> {
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  onBlur?: () => void;
  /** Submitted under this name by a plain `<form>`. */
  name?: string;
  /** Shown under the control, and marks it invalid. */
  errorMessage?: string | readonly string[];
  isInvalid?: boolean;
}

export interface WiringIds {
  control: string;
  label: string;
  description: string;
  error: string;
}

/** What the frame reads of a field, whatever its value. */
export interface Wiring {
  ids: WiringIds;
  errors: () => string[];
  isInvalid: () => boolean;
  describedBy: (hasDescription: boolean) => string | undefined;
}

/** A field's wiring and its value, from a form or from the caller. */
export interface Binding<T> extends Wiring {
  value: () => T;
  change: (value: T) => void;
  blur: () => void;
  name: () => string | undefined;
}

/** A caller's `errorMessage` as the list the frame shows. */
export function errorsOf(given: string | readonly string[] | undefined): string[] {
  if (given === undefined) return [];
  return (typeof given === "string" ? [given] : [...given]).filter((one) => one !== "");
}

/** Ids for a field's parts, and the describedby that names its description and its error. */
export function fieldWiring(errors: () => string[], isInvalid: () => boolean): Wiring {
  const id = createUniqueId();
  const ids = {
    control: `${id}-control`,
    label: `${id}-label`,
    description: `${id}-description`,
    error: `${id}-error`,
  };
  function describedBy(hasDescription: boolean): string | undefined {
    const pieces = [hasDescription ? ids.description : "", isInvalid() ? ids.error : ""];
    const joined = pieces.filter((part) => part !== "").join(" ");
    return joined === "" ? undefined : joined;
  }
  return { ids, errors, isInvalid, describedBy };
}

/**
 * A field's wiring with errors of the control's own before the form's or
 * the caller's: a tag it refused, a number too short to dial.
 */
export function withOwnErrors(of: Wiring, own: () => string[]): Wiring {
  function errors(): string[] {
    return [...own(), ...of.errors()];
  }
  function isInvalid(): boolean {
    return own().length > 0 || of.isInvalid();
  }
  return {
    ids: of.ids,
    errors,
    isInvalid,
    describedBy: (hasDescription: boolean): string | undefined => {
      const ids = [hasDescription ? of.ids.description : "", isInvalid() ? of.ids.error : ""];
      const joined = ids.filter((id) => id !== "").join(" ");
      return joined === "" ? undefined : joined;
    },
  };
}

/** A server's word on a value goes once the value changes. */
function retireServerError(api: AnyFieldApi): void {
  if (api.state.meta.errorMap.onServer !== undefined) {
    api.setMeta((meta) => ({
      ...meta,
      errorMap: { ...meta.errorMap, onServer: undefined },
    }));
  }
  const form = api.form as AnyFormApi;
  if (form.state.errorMap.onServer !== undefined)
    form.setErrorMap({ onServer: undefined } as never);
}

export interface FieldBinding<T> {
  field: ReturnType<typeof useArcField<T>>;
}

/**
 * The wiring one form field needs: its ids, whether it is showing an error,
 * and the change and blur that also retire an error the server sent for it.
 */
export function formControl<T>(): Binding<T> & FieldBinding<T> {
  const field = useArcField<T>();
  const errors = createMemo((): string[] => messagesOf(field().state.meta.errors));
  function isInvalid(): boolean {
    return field().state.meta.isTouched && errors().length > 0;
  }
  return {
    ...fieldWiring(errors, isInvalid),
    field,
    value: () => field().state.value,
    change: (value: T): void => {
      const api = untrack(field);
      api.handleChange(value);
      retireServerError(api);
    },
    blur: () => untrack(field).handleBlur(),
    name: () => field().name,
  };
}

/**
 * A field's binding: the form's when it is rendered by `form.AppField` and
 * given no value of its own, the caller's otherwise, held by the field when
 * the caller gives only a `defaultValue`.
 */
export function bindField<T>(props: FieldValueProps<T>, empty: T): Binding<T> {
  const own =
    props.value !== undefined || props.defaultValue !== undefined || props.onChange !== undefined;
  if (!own && hasContext(arcFieldContext)) return formControl<T>();
  const [value, setValue] = controllable<T>(
    () => props.value,
    () => props.defaultValue ?? empty,
    (next) => props.onChange?.(next),
  );
  function errors(): string[] {
    return errorsOf(props.errorMessage);
  }
  function isInvalid(): boolean {
    return props.isInvalid === true || errors().length > 0;
  }
  return {
    ...fieldWiring(errors, isInvalid),
    value,
    change: (next: T) => setValue(next),
    blur: () => props.onBlur?.(),
    name: () => props.name,
  };
}

/**
 * Whether the form has been submitted at least once, so a rule the field
 * keeps itself shows on a field nobody touched.
 */
export function useSubmitted(own: Binding<unknown>): () => boolean {
  if (!("field" in own)) return () => false;
  const form = useArcFormContext();
  return form.useSelector((state) => state.submissionAttempts > 0);
}

export interface FrameProps {
  of: Wiring;
  /** The field's own props, for its class and its parts' classes. */
  field: ArcFieldProps;
  label: Child;
  description?: Child;
  /** Beside the control rather than over it: a switch, a checkbox. */
  inline?: boolean;
  /** The control is named from the label's id: a group of segments has nothing for `<label for>`. */
  labelledById?: boolean;
  /** Renames the root's slot, for a field that is a component of its own. */
  slot?: string;
  children?: Child;
}

/** `<Field>` with the label, the description and the error wired to the control's ids. */
export function Frame(props: FrameProps) {
  const of = props.of;
  function cls(): FieldSlots {
    return parts(fieldStyles(), props.field.classes);
  }
  function error() {
    return (
      <FieldError
        class={cls().error}
        id={of.ids.error}
        errors={of.isInvalid() ? of.errors().map((message) => ({ message })) : []}
      />
    );
  }
  function description() {
    return (
      <Show when={props.description !== undefined}>
        <FieldDescription class={cls().description} id={of.ids.description}>
          {props.description}
        </FieldDescription>
      </Show>
    );
  }
  return (
    <Field
      class={arc(cls().root, props.field.class, props.field.className)}
      orientation={props.inline === true ? "horizontal" : "vertical"}
      isInvalid={of.isInvalid()}
      data-slot={props.slot ?? "arc-field"}
    >
      <Show
        when={props.inline === true}
        fallback={
          <>
            <FieldLabel
              class={cls().label}
              id={of.ids.label}
              for={props.labelledById === true ? undefined : of.ids.control}
            >
              {props.label}
            </FieldLabel>
            {props.children}
            {description()}
            {error()}
          </>
        }
      >
        {props.children}
        <FieldContent class={cls().content}>
          <FieldLabel class={cls().label} id={of.ids.label} for={of.ids.control}>
            {props.label}
          </FieldLabel>
          {description()}
          {error()}
        </FieldContent>
      </Show>
    </Field>
  );
}
