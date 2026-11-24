import {
  type Child,
  For,
  Show,
  createMemo,
  createSignal,
  createUniqueId,
  untrack,
} from "@barqjs/core";
import { variants } from "@barqjs/css";
import { type CalendarDate, type ZonedDateTime, now, toTimeZone } from "@barqjs/aria/date";
import { DateField as AriaDateField } from "@barqjs/aria/datefield";
import {
  type AnyFieldApi,
  type AnyFormApi,
  type Components,
  type FormHook,
  createFormHook,
  createFormHookContexts,
} from "@barqjs/form";
import { CircleAlert } from "@barqjs/lucide/icons/circle-alert";
import { Eye } from "@barqjs/lucide/icons/eye";
import { EyeOff } from "@barqjs/lucide/icons/eye-off";
import { Alert, AlertDescription } from "@barqjs/ui/alert";
import { Button, type ButtonVariant } from "@barqjs/ui/button";
import { Checkbox } from "@barqjs/ui/checkbox";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@barqjs/ui/combobox";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@barqjs/ui/field";
import { Input } from "@barqjs/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@barqjs/ui/input-group";
import { Select, SelectItem } from "@barqjs/ui/select";
import { Switch } from "@barqjs/ui/switch";
import { Textarea } from "@barqjs/ui/textarea";

import { srOnly } from "@barqjs/ui/sr-only";
import { when } from "@barqjs/ui/shared-when";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, edge, focus, interaction, layout, rounded, space, type } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

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

function messagesOf(errors: readonly unknown[]): string[] {
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

type FieldSlots = ReturnType<typeof fieldStyles>;

/** The labels and messages every field takes. */
export interface ArcFieldProps extends Customisable<FieldSlots> {
  label: Child;
  description?: Child;
  isDisabled?: boolean;
  isRequired?: boolean;
}

/**
 * The wiring one field needs: its ids, whether it is showing an error, and
 * the change and blur that also retire an error the server sent for it.
 */
function control<T>() {
  const field = useArcField<T>();
  const id = createUniqueId();
  const ids = {
    control: `${id}-control`,
    label: `${id}-label`,
    description: `${id}-description`,
    error: `${id}-error`,
  };
  const errors = createMemo((): string[] => messagesOf(field().state.meta.errors));
  const isInvalid = (): boolean => field().state.meta.isTouched && errors().length > 0;
  const describedBy = (hasDescription: boolean): string | undefined => {
    const pieces = [hasDescription ? ids.description : "", isInvalid() ? ids.error : ""];
    const joined = pieces.filter((part) => part !== "").join(" ");
    return joined === "" ? undefined : joined;
  };
  const change = (value: T): void => {
    const api = untrack(field);
    api.handleChange(value);
    retireServerError(api);
  };
  const blur = (): void => untrack(field).handleBlur();
  return { field, ids, errors, isInvalid, describedBy, change, blur };
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

type Control<T> = ReturnType<typeof control<T>>;

/** What the frame reads of a field, whatever its value. */
interface Wiring {
  ids: Control<unknown>["ids"];
  errors: () => string[];
  isInvalid: () => boolean;
  describedBy: (hasDescription: boolean) => string | undefined;
}

interface FrameProps {
  of: Wiring;
  /** The field's own props, for its class and its parts' classes. */
  field: ArcFieldProps;
  label: Child;
  description?: Child;
  /** Beside the control rather than over it: a switch, a checkbox. */
  inline?: boolean;
  /** The control is named from the label's id: a group of segments has nothing for `<label for>`. */
  labelledById?: boolean;
  children?: Child;
}

/** `<Field>` with the label, the description and the error wired to the control's ids. */
function Frame(props: FrameProps) {
  const of = props.of;
  const cls = (): FieldSlots => parts(fieldStyles(), props.field.classes);
  const error = () => (
    <FieldError
      class={cls().error}
      id={of.ids.error}
      errors={of.isInvalid() ? of.errors().map((message) => ({ message })) : []}
    />
  );
  const description = () => (
    <Show when={props.description !== undefined}>
      <FieldDescription class={cls().description} id={of.ids.description}>
        {props.description}
      </FieldDescription>
    </Show>
  );
  return (
    <Field
      class={arc(cls().root, props.field.class, props.field.className)}
      orientation={props.inline === true ? "horizontal" : "vertical"}
      isInvalid={of.isInvalid()}
      data-slot="arc-field"
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

export interface TextFieldProps extends ArcFieldProps {
  /** @default "text" */
  type?: "text" | "email" | "url" | "tel" | "search";
  placeholder?: string;
  autoComplete?: string;
  inputMode?: string;
}

/** A line of text. */
export function TextField(props: TextFieldProps) {
  const of = control<string>();
  return (
    <Frame of={of} label={props.label} description={props.description} field={props}>
      <Input
        class={props.classes?.control}
        id={of.ids.control}
        name={of.field().name}
        type={props.type ?? "text"}
        value={of.field().state.value ?? ""}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete}
        inputMode={props.inputMode}
        disabled={props.isDisabled}
        required={props.isRequired}
        aria-invalid={of.isInvalid() ? true : undefined}
        aria-describedby={of.describedBy(props.description !== undefined)}
        onInput={(event: Event) => of.change((event.currentTarget as HTMLInputElement).value)}
        onBlur={of.blur}
      />
    </Frame>
  );
}

export interface PasswordFieldProps extends ArcFieldProps {
  /** @default "current-password" */
  autoComplete?: "current-password" | "new-password";
  /** @default "Show password" */
  showLabel?: string;
  /** @default "Hide password" */
  hideLabel?: string;
}

/** A password, with a button that shows what was typed. */
export function PasswordField(props: PasswordFieldProps) {
  const messages = useArcMessages();
  const of = control<string>();
  const [shown, setShown] = createSignal(false);
  return (
    <Frame of={of} label={props.label} description={props.description} field={props}>
      <InputGroup class={props.classes?.control}>
        <InputGroupInput
          id={of.ids.control}
          name={of.field().name}
          type={shown() ? "text" : "password"}
          value={of.field().state.value ?? ""}
          autoComplete={props.autoComplete ?? "current-password"}
          disabled={props.isDisabled}
          required={props.isRequired}
          aria-invalid={of.isInvalid() ? true : undefined}
          aria-describedby={of.describedBy(props.description !== undefined)}
          onInput={(event: Event) => of.change((event.currentTarget as HTMLInputElement).value)}
          onBlur={of.blur}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={
              shown()
                ? (props.hideLabel ?? messages().hidePassword)
                : (props.showLabel ?? messages().showPassword)
            }
            aria-pressed={shown()}
            isDisabled={props.isDisabled}
            onPress={() => setShown((visible) => !visible)}
          >
            {shown() ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </Frame>
  );
}

export interface NumberFieldProps extends ArcFieldProps {
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  /** Shown at the end of the field: `"ms"`, `"%"`. */
  unit?: string;
  /** The unit in words, read after the label: `"milliseconds"`. */
  unitLabel?: string;
}

/** A number, held as `undefined` while the field is empty. */
export function NumberField(props: NumberFieldProps) {
  const of = control<number | undefined>();
  const read = (event: Event): number | undefined => {
    const raw = (event.currentTarget as HTMLInputElement).value;
    if (raw.trim() === "") return undefined;
    const value = Number(raw);
    return Number.isNaN(value) ? undefined : value;
  };
  const input = () => (
    <InputGroupInput
      id={of.ids.control}
      name={of.field().name}
      type="number"
      inputMode="decimal"
      value={of.field().state.value ?? ""}
      min={props.min}
      max={props.max}
      step={props.step}
      placeholder={props.placeholder}
      disabled={props.isDisabled}
      required={props.isRequired}
      aria-invalid={of.isInvalid() ? true : undefined}
      aria-describedby={of.describedBy(props.description !== undefined)}
      onInput={(event: Event) => of.change(read(event))}
      onBlur={of.blur}
    />
  );
  return (
    <Frame
      of={of}
      label={
        <>
          {props.label}
          <Show when={props.unitLabel !== undefined}>
            <span class={srOnly}>{` (${props.unitLabel ?? ""})`}</span>
          </Show>
        </>
      }
      description={props.description}
      field={props}
    >
      <InputGroup class={props.classes?.control}>
        {input()}
        <Show when={props.unit !== undefined}>
          <InputGroupAddon align="inline-end" aria-hidden="true">
            <InputGroupText>{props.unit}</InputGroupText>
          </InputGroupAddon>
        </Show>
      </InputGroup>
    </Frame>
  );
}

export interface TextareaFieldProps extends ArcFieldProps {
  rows?: number;
  placeholder?: string;
  maxLength?: number;
}

/** Text over several lines. */
export function TextareaField(props: TextareaFieldProps) {
  const of = control<string>();
  return (
    <Frame of={of} label={props.label} description={props.description} field={props}>
      <Textarea
        class={props.classes?.control}
        id={of.ids.control}
        name={of.field().name}
        value={of.field().state.value ?? ""}
        rows={props.rows}
        placeholder={props.placeholder}
        maxLength={props.maxLength}
        disabled={props.isDisabled}
        required={props.isRequired}
        aria-invalid={of.isInvalid() ? true : undefined}
        aria-describedby={of.describedBy(props.description !== undefined)}
        onInput={(event: Event) => of.change((event.currentTarget as HTMLTextAreaElement).value)}
        onBlur={of.blur}
      />
    </Frame>
  );
}

/** A setting that is on or off, beside its label. */
export function SwitchField(props: ArcFieldProps) {
  const of = control<boolean>();
  return (
    <Frame of={of} label={props.label} description={props.description} field={props} inline>
      <Switch
        class={props.classes?.control}
        id={of.ids.control}
        name={of.field().name}
        isSelected={of.field().state.value}
        isDisabled={props.isDisabled}
        aria-describedby={of.describedBy(props.description !== undefined)}
        onChange={(checked: boolean) => {
          of.change(checked);
          of.blur();
        }}
      />
    </Frame>
  );
}

/** Something agreed to or chosen, beside its label. */
export function CheckboxField(props: ArcFieldProps) {
  const of = control<boolean>();
  return (
    <Frame of={of} label={props.label} description={props.description} field={props} inline>
      <Checkbox
        class={props.classes?.control}
        id={of.ids.control}
        name={of.field().name}
        isSelected={of.field().state.value}
        isDisabled={props.isDisabled}
        isRequired={props.isRequired}
        isInvalid={of.isInvalid()}
        aria-describedby={of.describedBy(props.description !== undefined)}
        onChange={(checked: boolean) => {
          of.change(checked);
          of.blur();
        }}
      />
    </Frame>
  );
}

export interface FieldOption {
  value: string;
  label: string;
  isDisabled?: boolean;
}

export interface SelectFieldProps extends ArcFieldProps {
  options: readonly FieldOption[];
  /** @default "Select" */
  placeholder?: string;
}

/** One of a few values, from a list. Held as the option's `value`, or `null`. */
export function SelectField(props: SelectFieldProps) {
  const messages = useArcMessages();
  const of = control<string | null>();
  const items = () => props.options.map((option) => ({ id: option.value, ...option }));
  return (
    <Frame of={of} label={props.label} description={props.description} field={props}>
      <Select
        items={items()}
        id={of.ids.control}
        name={of.field().name}
        value={of.field().state.value ?? undefined}
        placeholder={props.placeholder ?? messages().selectPlaceholder}
        isDisabled={props.isDisabled}
        isRequired={props.isRequired}
        isInvalid={of.isInvalid()}
        disabledKeys={props.options
          .filter((option) => option.isDisabled === true)
          .map((option) => option.value)}
        aria-labelledby={of.ids.label}
        aria-describedby={of.describedBy(props.description !== undefined)}
        onValueChange={(value: string) => {
          of.change(value);
          of.blur();
        }}
        class={arc(layout.fill, props.classes?.control)}
      >
        {(option: FieldOption) => <SelectItem>{option.label}</SelectItem>}
      </Select>
    </Frame>
  );
}

export interface ComboboxFieldProps extends ArcFieldProps {
  options: readonly FieldOption[];
  placeholder?: string;
  /** Shown when the text matches nothing. @default "No matches" */
  emptyLabel?: Child;
}

/** One of many values, found by typing. Held as the option's `value`, or `null`. */
export function ComboboxField(props: ComboboxFieldProps) {
  const of = control<string | null>();
  const chosen = (): FieldOption | null =>
    props.options.find((option) => option.value === of.field().state.value) ?? null;
  return (
    <Frame of={of} label={props.label} description={props.description} field={props}>
      <ComboboxOver
        control={props.classes?.control}
        of={of}
        options={props.options}
        chosen={chosen()}
        placeholder={props.placeholder}
        emptyLabel={props.emptyLabel}
        isDisabled={props.isDisabled}
        isRequired={props.isRequired}
        hasDescription={props.description !== undefined}
      />
    </Frame>
  );
}

interface ComboboxOverProps {
  of: Control<string | null>;
  control?: string;
  options: readonly FieldOption[];
  chosen: FieldOption | null;
  placeholder?: string;
  emptyLabel?: Child;
  isDisabled?: boolean;
  isRequired?: boolean;
  hasDescription: boolean;
}

function ComboboxOver(props: ComboboxOverProps) {
  const messages = useArcMessages();
  const of = props.of;
  return (
    <Combobox
      items={props.options}
      value={props.chosen}
      disabled={props.isDisabled}
      name={of.field().name}
      itemToStringLabel={(option: FieldOption) => option.label}
      itemToStringValue={(option: FieldOption) => option.value}
      onValueChange={(value: unknown) => {
        of.change((value as FieldOption | null)?.value ?? null);
      }}
    >
      <ComboboxInput
        class={props.control}
        id={of.ids.control}
        placeholder={props.placeholder}
        disabled={props.isDisabled}
        required={props.isRequired}
        aria-invalid={of.isInvalid() ? true : undefined}
        aria-describedby={of.describedBy(props.hasDescription)}
      />
      <ComboboxContent>
        <ComboboxEmpty>{props.emptyLabel ?? messages().noMatches}</ComboboxEmpty>
        <ComboboxList>
          {(option: FieldOption) => (
            <ComboboxItem value={option} disabled={option.isDisabled}>
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/** Every zone this runtime knows, by its IANA name. */
function timeZones(): string[] {
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  return supported === undefined ? ["UTC"] : supported("timeZone");
}

export interface TimeZoneFieldProps extends ArcFieldProps {
  /** @default "Search time zones" */
  placeholder?: string;
}

/**
 * A time zone, found by typing a city: "new york" finds America/New_York.
 * Held as its IANA name.
 */
export function TimeZoneField(props: TimeZoneFieldProps) {
  const messages = useArcMessages();
  const of = control<string | null>();
  const options = createMemo((): FieldOption[] => {
    const zones = timeZones();
    const held = of.field().state.value;
    const all =
      held !== null && held !== undefined && !zones.includes(held) ? [held, ...zones] : zones;
    return all.map((zone) => ({ value: zone, label: zone.replaceAll("_", " ") }));
  });
  const chosen = (): FieldOption | null =>
    options().find((option) => option.value === of.field().state.value) ?? null;
  return (
    <Frame of={of} label={props.label} description={props.description} field={props}>
      <ComboboxOver
        control={props.classes?.control}
        of={of}
        options={options()}
        chosen={chosen()}
        placeholder={props.placeholder ?? messages().searchTimeZones}
        isDisabled={props.isDisabled}
        isRequired={props.isRequired}
        hasDescription={props.description !== undefined}
      />
    </Frame>
  );
}

const segments = arc(
  layout.row,
  layout.fill,
  edge.input,
  rounded.md,
  bg.transparent,
  type.sm,
  type.numeric,
  focus.within,
  interaction.invalid,
  when.disabledCursor,
  {
    minHeight: space.x8,
    gap: "1px",
    paddingInline: space.x2_5,
    '& [role="spinbutton"]': {
      borderRadius: "calc(var(--radius) * 0.5)",
      paddingInline: "1px",
      outline: "none",
    },
    '& [role="spinbutton"]:focus': {
      backgroundColor: "var(--accent)",
      color: "var(--accent-foreground)",
    },
    "& [data-placeholder]": { color: "var(--muted-foreground)" },
  },
);

/** A day, typed segment by segment. Held as a `CalendarDate`, or `null`. */
export function DateField(props: ArcFieldProps) {
  const of = control<CalendarDate | null>();
  return (
    <Frame of={of} label={props.label} description={props.description} field={props} labelledById>
      <AriaDateField<CalendarDate>
        class={arc(segments, props.classes?.control)}
        aria-labelledby={of.ids.label}
        aria-describedby={of.describedBy(props.description !== undefined)}
        value={of.field().state.value ?? null}
        granularity="day"
        name={of.field().name}
        isDisabled={props.isDisabled}
        isRequired={props.isRequired}
        isInvalid={of.isInvalid()}
        onChange={(value: CalendarDate | null) => of.change(value)}
      />
    </Frame>
  );
}

export interface DateTimeFieldProps extends ArcFieldProps {
  /**
   * The zone the field is read and written in, by IANA name. A value held in
   * another zone is shown as the same instant here. @default the value's own,
   * else the browser's
   */
  timeZone?: string;
  /** Leave the zone's name out of the segments. @default false */
  hideTimeZone?: boolean;
  /** @default "minute" */
  granularity?: "hour" | "minute" | "second";
  hourCycle?: 12 | 24;
}

/**
 * A date and a time in a named zone, typed segment by segment. Held as a
 * `ZonedDateTime`, or `null`, so the instant is never ambiguous.
 */
export function DateTimeField(props: DateTimeFieldProps) {
  const of = control<ZonedDateTime | null>();
  const shown = (): ZonedDateTime | null => {
    const value = of.field().state.value ?? null;
    if (value === null || props.timeZone === undefined) return value;
    return toTimeZone(value, props.timeZone);
  };
  const placeholder = (): ZonedDateTime | undefined =>
    props.timeZone === undefined
      ? undefined
      : now(props.timeZone).set({ minute: 0, second: 0, millisecond: 0 });
  return (
    <Frame of={of} label={props.label} description={props.description} field={props} labelledById>
      <AriaDateField<ZonedDateTime>
        class={arc(segments, props.classes?.control)}
        aria-labelledby={of.ids.label}
        aria-describedby={of.describedBy(props.description !== undefined)}
        value={shown()}
        placeholderValue={placeholder()}
        granularity={props.granularity ?? "minute"}
        hourCycle={props.hourCycle}
        hideTimeZone={props.hideTimeZone}
        name={of.field().name}
        isDisabled={props.isDisabled}
        isRequired={props.isRequired}
        isInvalid={of.isInvalid()}
        onChange={(value: ZonedDateTime | null) => of.change(value)}
      />
    </Frame>
  );
}

const rootOnly = variants({ slots: { root: arc({}) } });

type RootSlots = ReturnType<typeof rootOnly>;

export interface SubmitButtonProps extends Customisable<RootSlots> {
  children?: Child;
  /** @default "default" */
  variant?: ButtonVariant;
}

/**
 * The form's submit: pending while it submits, and disabled while the form
 * holds an error it already showed.
 */
export function SubmitButton(props: SubmitButtonProps) {
  const messages = useArcMessages();
  const form = useArcFormContext();
  const state = form.useSelector((current) => ({
    canSubmit: current.canSubmit,
    isSubmitting: current.isSubmitting,
  }));
  return (
    <Button
      type="submit"
      variant={props.variant ?? "default"}
      class={arc(props.classes?.root, props.class, props.className)}
      isPending={state().isSubmitting}
      isDisabled={!state().canSubmit}
      data-slot="submit-button"
    >
      {props.children ?? messages().save}
    </Button>
  );
}

/** What went wrong with the form as a whole: a form validator's error, or the server's. */
export function FormError(props: Customisable<RootSlots>) {
  const form = useArcFormContext();
  const errors = form.useSelector((current) => messagesOf(current.errors));
  return (
    <Show when={errors().length > 0}>
      <Alert
        variant="destructive"
        class={arc(props.classes?.root, props.class, props.className)}
        role="alert"
        data-slot="form-error"
      >
        <CircleAlert aria-hidden="true" />
        <AlertDescription>
          <For each={errors()}>{(message: string) => <p>{message}</p>}</For>
        </AlertDescription>
      </Alert>
    </Show>
  );
}

export interface ServerErrors {
  /** About the whole submission. */
  form?: string;
  /** By field name. */
  fields?: Record<string, string>;
}

/**
 * Put a failed submission's errors on the fields they name, as TanStack's
 * `onServer` errors, and the rest on the form. Each field's error goes once
 * its value changes.
 *
 * ```ts
 * onSubmit: async ({ value, formApi }) => {
 *   const result = await save(value);
 *   if (!result.ok) setServerErrors(formApi, { fields: result.fieldErrors });
 * },
 * ```
 *
 * Returns the messages of fields the form does not have, which are added to
 * the form's own error so the reader still sees them.
 */
export function setServerErrors(form: AnyFormApi, errors: ServerErrors): string[] {
  const fields: Record<string, string> = {};
  const unplaced: string[] = [];
  for (const [name, message] of Object.entries(errors.fields ?? {})) {
    if (!form.fieldInfo[name]?.instance) unplaced.push(message);
    else fields[name] = message;
  }
  const formMessage = [errors.form, ...unplaced].filter((part) => part !== undefined).join(" ");
  form.setErrorMap({
    onServer: { form: formMessage === "" ? undefined : formMessage, fields },
  } as never);
  for (const name of Object.keys(fields)) {
    form.setFieldMeta(name, (meta) => ({ ...meta, isTouched: true }));
  }
  return unplaced;
}

/** Take every error the server sent off the form and its fields. */
export function clearServerErrors(form: AnyFormApi): void {
  form.setErrorMap({ onServer: undefined } as never);
  for (const name of Object.keys(form.fieldInfo)) {
    const meta = form.getFieldMeta(name);
    if (meta?.errorMap.onServer !== undefined) {
      form.setFieldMeta(name, (previous) => ({
        ...previous,
        errorMap: { ...previous.errorMap, onServer: undefined },
      }));
    }
  }
}

const arcFieldComponents = {
  TextField,
  PasswordField,
  NumberField,
  TextareaField,
  SwitchField,
  CheckboxField,
  SelectField,
  ComboboxField,
  DateField,
  DateTimeField,
  TimeZoneField,
};

const arcFormComponents = { SubmitButton, FormError };

const arcForm = createFormHook({
  fieldContext: arcFieldContext,
  formContext: arcFormContext,
  fieldComponents: arcFieldComponents,
  formComponents: arcFormComponents,
});

/**
 * A form whose fields are arc's: `field.TextField`, `field.DateTimeField`,
 * `form.SubmitButton` and the rest.
 *
 * ```tsx
 * const form = useArcForm(() => ({
 *   defaultValues: { email: "", remember: false },
 *   onSubmit: ({ value }) => signIn(value),
 * }));
 *
 * <form.AppForm>
 *   <form onSubmit={(event) => { event.preventDefault(); void form.handleSubmit(); }}>
 *     <form.AppField name="email">{(field) => <field.TextField label="Email" type="email" />}</form.AppField>
 *     <form.SubmitButton>Sign in</form.SubmitButton>
 *   </form>
 * </form.AppForm>
 * ```
 */
export const useArcForm = arcForm.useAppForm;
export const withArcForm = arcForm.withForm;
export const withArcFieldGroup = arcForm.withFieldGroup;

/**
 * arc's form hook with an app's own field and form components added, under
 * names that must not collide with arc's.
 */
export function createArcForm<
  const TField extends Components,
  const TForm extends Components,
>(extension: {
  fieldComponents?: TField;
  formComponents?: TForm;
}): FormHook<typeof arcFieldComponents & TField, typeof arcFormComponents & TForm> {
  for (const name of Object.keys(extension.fieldComponents ?? {})) {
    if (name in arcFieldComponents) throw new Error(`arc already has a field named ${name}`);
  }
  for (const name of Object.keys(extension.formComponents ?? {})) {
    if (name in arcFormComponents)
      throw new Error(`arc already has a form component named ${name}`);
  }
  return arcForm.extendForm(extension);
}
