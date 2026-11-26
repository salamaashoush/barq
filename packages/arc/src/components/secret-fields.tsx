import { type Child, Show, createSignal, createUniqueId, flush, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Eye } from "@barqjs/lucide/icons/eye";
import { EyeOff } from "@barqjs/lucide/icons/eye-off";
import { Button } from "@barqjs/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
} from "@barqjs/ui/input-group";
import { Select, SelectItem } from "@barqjs/ui/select";
import { Switch } from "@barqjs/ui/switch";
import { Label } from "@barqjs/ui/label";

import { arcLayer as arc } from "../layer.ts";
import {
  type ArcFieldProps,
  type Binding,
  type FieldSlots,
  type FieldValueProps,
  Frame,
  bindField,
  fieldStyles,
  fieldWiring,
  useSubmitted,
  withOwnErrors,
} from "../lib/field.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, layout, space, type } from "../style/index.ts";
import { CopyButton } from "./copy-button.tsx";
import { FormattedDate, type Moment } from "./format.tsx";
import { useArcMessages } from "./messages.ts";
import { Sentence } from "./sentence.tsx";

/** Text drawn as dots while it is hidden, which a text area has no type for. */
const concealed = arc({ "-webkit-text-security": "disc" });

export const secretFieldStyles = variants({
  slots: {
    group: arc({}),
    input: arc(type.mono),
    reveal: arc({}),
    lines: arc(layout.row, gap[2], type.body, fg.muted),
  },
  variants: {
    hidden: { true: { input: concealed }, false: {} },
  },
  defaults: { hidden: true },
});

type SecretSlots = ReturnType<typeof secretFieldStyles> & FieldSlots;

export interface SecretFieldProps
  extends Omit<ArcFieldProps, "classes">, FieldValueProps<string>, Customisable<SecretSlots> {
  /**
   * Several lines, for a private key or a certificate, which a password
   * input would run into one. `"choose"` adds a switch for it, and a paste
   * of several lines turns it on. @default false
   */
  multiline?: boolean | "choose";
  /** Lines a several-line field shows. @default 5 */
  rows?: number;
  placeholder?: string;
  /** @default "Show the value" */
  showLabel?: string;
  /** @default "Hide the value" */
  hideLabel?: string;
}

/**
 * A secret typed in: an API token, a password a check signs in with, a
 * private key. Hidden as it is typed, with a button that shows it.
 *
 * ```tsx
 * <form.AppField name="value">{(field) => <field.SecretField label="Value" multiline="choose" />}</form.AppField>
 * ```
 *
 * A password input runs a pasted key into one line, so `multiline` makes it
 * a text area drawn as dots until shown. Nothing fills it in: the browser's
 * password manager and its spelling check are kept out of it.
 */
export function SecretField(props: SecretFieldProps) {
  const messages = useArcMessages();
  const of = bindField<string>(props, "");
  const switchId = createUniqueId();
  const [shown, setShown] = createSignal(false);
  const [several, setSeveral] = createSignal(
    untrack(() => props.multiline === true || (of.value() ?? "").includes("\n")),
  );
  function cls(): SecretSlots {
    return parts({ ...fieldStyles(), ...secretFieldStyles({ hidden: !shown() }) }, props.classes);
  }
  function lines(): boolean {
    return props.multiline === true || (props.multiline === "choose" && several());
  }
  function onPaste(event: ClipboardEvent): void {
    if (props.multiline !== "choose" || several()) return;
    const pasted = event.clipboardData?.getData("text/plain") ?? "";
    if (!pasted.includes("\n")) return;
    event.preventDefault();
    setSeveral(true);
    of.change(pasted);
  }
  function common() {
    return {
      id: of.ids.control,
      name: of.name(),
      value: of.value() ?? "",
      placeholder: props.placeholder,
      autoComplete: "off",
      autoCapitalize: "off",
      spellCheck: false,
      dir: "ltr",
      "data-1p-ignore": "",
      disabled: props.isDisabled,
      required: props.isRequired,
      "aria-invalid": of.isInvalid() ? true : undefined,
      "aria-describedby": of.describedBy(props.description !== undefined),
      onBlur: of.blur,
    } as const;
  }
  function reveal() {
    return (
      <InputGroupButton
        size="icon-xs"
        class={cls().reveal}
        data-slot="secret-field-reveal"
        aria-label={
          shown()
            ? (props.hideLabel ?? messages().hideValue)
            : (props.showLabel ?? messages().showValue)
        }
        aria-pressed={shown()}
        isDisabled={props.isDisabled}
        onPress={() => setShown((visible) => !visible)}
      >
        {shown() ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </InputGroupButton>
    );
  }
  return (
    <Frame
      of={of}
      label={props.label}
      description={props.description}
      field={props}
      slot="secret-field"
    >
      <InputGroup
        class={arc(cls().group, cls().control)}
        data-slot="secret-field-group"
        isDisabled={props.isDisabled}
      >
        <Show
          when={lines()}
          fallback={
            <>
              <InputGroupInput
                {...common()}
                class={cls().input}
                data-slot="secret-field-input"
                type={shown() ? "text" : "password"}
                onInput={(event: Event) =>
                  of.change((event.currentTarget as HTMLInputElement).value)
                }
                onPaste={onPaste}
              />
              <InputGroupAddon align="inline-end">{reveal()}</InputGroupAddon>
            </>
          }
        >
          <InputGroupTextarea
            {...common()}
            class={cls().input}
            data-slot="secret-field-input"
            rows={props.rows ?? 5}
            onInput={(event: Event) =>
              of.change((event.currentTarget as HTMLTextAreaElement).value)
            }
          />
          <InputGroupAddon align="block-end">{reveal()}</InputGroupAddon>
        </Show>
      </InputGroup>
      <Show when={props.multiline === "choose"}>
        <div class={cls().lines} data-slot="secret-field-lines">
          <Switch
            id={switchId}
            isSelected={several()}
            isDisabled={props.isDisabled}
            onChange={(on: boolean) => setSeveral(on)}
          />
          <Label for={switchId}>{messages().severalLines}</Label>
        </div>
      </Show>
    </Frame>
  );
}

/** What the server keeps about a secret it never sends back. */
export interface StoredSecret {
  /** Its last few characters, kept to tell one value from another: `"x7Qa"`. */
  hint?: string;
  /** When it was set. */
  since?: Moment;
}

export const storedSecretFieldStyles = variants({
  slots: {
    group: arc({}),
    input: arc(type.mono),
    reveal: arc({}),
    state: arc(layout.row, layout.wrap, layout.between, gap[2], type.meta),
    stateText: arc(layout.minZero),
    forgotten: arc(type.body, fg.muted, layout.row, layout.wrap, gap[1]),
    action: arc({ height: "auto", paddingInline: space.x0 }),
  },
});

type StoredSlots = ReturnType<typeof storedSecretFieldStyles> & FieldSlots;

export interface StoredSecretFieldProps
  extends
    Omit<ArcFieldProps, "classes">,
    FieldValueProps<string | null>,
    Customisable<StoredSlots> {
  /** The secret the server keeps now. Left out, none is kept, and the field is a plain secret to type. */
  stored?: StoredSecret | null;
  /**
   * Where the secret is sent has changed since it was kept: an address, a
   * host, a certificate authority. A kept secret goes only where it was
   * given, so it has to be typed again.
   */
  mustReenter?: boolean;
  /** Offers to forget the kept secret, which the field then holds as `null`. */
  forgettable?: boolean;
  /** @default "Forget it" */
  forgetLabel?: Child;
  /** What a forgotten secret's field says instead. @default "It is forgotten once you save." */
  forgottenText?: Child;
  /** @default "Keep it" */
  keepLabel?: Child;
  placeholder?: string;
}

/**
 * A secret the server keeps and never shows again: a webhook's signing
 * secret, an API key for a provider, a token for a store.
 *
 * ```tsx
 * <form.AppField name="token">
 *   {(field) => <field.StoredSecretField label="Token" stored={store.token} forgettable mustReenter={moved()} />}
 * </form.AppField>
 * ```
 *
 * Held as what to send: `""` keeps the kept secret, a string replaces it and
 * `null` forgets it. Its placeholder and the line under it say a secret is
 * kept and how it ends, so a blank field never reads as an empty one. Once
 * where it goes changes (`mustReenter`) a blank field is refused with why.
 */
export function StoredSecretField(props: StoredSecretFieldProps) {
  const messages = useArcMessages();
  const of = bindField<string | null>(props, "");
  const submitted = useSubmitted(of as Binding<unknown>);
  const [touched, setTouched] = createSignal(false);
  const [shown, setShown] = createSignal(false);
  let input: HTMLInputElement | undefined;
  function cls(): StoredSlots {
    return parts({ ...fieldStyles(), ...storedSecretFieldStyles() }, props.classes);
  }
  function kept(): StoredSecret | undefined {
    return props.stored ?? undefined;
  }
  function typed(): string {
    return of.value() ?? "";
  }
  function forgotten(): boolean {
    return of.value() === null;
  }
  const wiring = withOwnErrors(of, () => {
    if (forgotten() || typed() !== "" || !(touched() || submitted())) return [];
    if (props.mustReenter === true && kept() !== undefined) return [messages().typeSecretAgain];
    if (props.isRequired === true && kept() === undefined) return [messages().typeSecret];
    return [];
  });
  function hasState(): boolean {
    return !forgotten() && (kept() !== undefined || props.description !== undefined);
  }
  function placeholder(): string | undefined {
    if (props.placeholder !== undefined) return props.placeholder;
    const secret = kept();
    if (secret === undefined) return undefined;
    if (props.mustReenter === true) return messages().typeItAgain;
    return secret.hint === undefined
      ? messages().storedSecretPlaceholder
      : messages().storedSecretEnding(secret.hint);
  }
  function state(): Child {
    const secret = kept();
    if (secret === undefined) return undefined;
    if (props.mustReenter === true) return messages().storedSecretMoved;
    const since = secret.since;
    if (secret.hint !== undefined && since !== undefined) {
      return (
        <Sentence words={(part) => messages().storedSecretSince(secret.hint ?? "", part)}>
          <FormattedDate value={since} />
        </Sentence>
      );
    }
    return messages().storedSecretKept;
  }
  return (
    <Frame
      of={wiring}
      label={props.label}
      field={props}
      labelledById={forgotten()}
      slot="stored-secret-field"
    >
      <Show
        when={!forgotten()}
        fallback={
          <p class={cls().forgotten} data-slot="stored-secret-field-forgotten">
            <span id={of.ids.control}>{props.forgottenText ?? messages().forgottenOnSave}</span>
            <Button
              variant="link"
              size="sm"
              class={cls().action}
              data-slot="stored-secret-field-keep"
              aria-describedby={of.ids.control}
              isDisabled={props.isDisabled}
              onPress={() => {
                of.change("");
                flush();
                input?.focus();
              }}
            >
              {props.keepLabel ?? messages().keepIt}
            </Button>
          </p>
        }
      >
        <InputGroup
          class={arc(cls().group, cls().control)}
          data-slot="stored-secret-field-group"
          isDisabled={props.isDisabled}
        >
          <InputGroupInput
            class={cls().input}
            data-slot="stored-secret-field-input"
            id={of.ids.control}
            name={of.name()}
            type={shown() ? "text" : "password"}
            value={typed()}
            placeholder={placeholder()}
            autoComplete="new-password"
            autoCapitalize="off"
            spellCheck={false}
            dir="ltr"
            data-1p-ignore=""
            disabled={props.isDisabled}
            required={props.isRequired === true && kept() === undefined}
            aria-invalid={wiring.isInvalid() ? true : undefined}
            aria-describedby={wiring.describedBy(hasState())}
            ref={(element: HTMLInputElement) => {
              input = element;
            }}
            onInput={(event: Event) => of.change((event.currentTarget as HTMLInputElement).value)}
            onBlur={() => {
              setTouched(true);
              of.blur();
            }}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              class={cls().reveal}
              data-slot="stored-secret-field-reveal"
              aria-label={shown() ? messages().hideValue : messages().showValue}
              aria-pressed={shown()}
              isDisabled={props.isDisabled === true || typed() === ""}
              onPress={() => setShown((visible) => !visible)}
            >
              {shown() ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Show>
      <Show when={hasState()}>
        <div class={cls().state} data-slot="stored-secret-field-state">
          <span class={cls().stateText} id={of.ids.description}>
            <Show when={props.description !== undefined}>{props.description} </Show>
            {state()}
          </span>
          <Show when={props.forgettable === true && kept() !== undefined}>
            <Button
              variant="link"
              size="sm"
              class={cls().action}
              data-slot="stored-secret-field-forget"
              isDisabled={props.isDisabled}
              onPress={() => {
                setShown(false);
                of.change(null);
                of.blur();
              }}
            >
              {props.forgetLabel ?? messages().forgetIt}
            </Button>
          </Show>
        </div>
      </Show>
    </Frame>
  );
}

/** `{{NAME}}`, the reference a value holds to the stored secret named `NAME`. */
export function secretReference(name: string): string {
  return `{{${name}}}`;
}

const REFERENCE = /^\s*\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}\s*$/;

/** The name a value that is one `{{NAME}}` reference points at, or `undefined`. */
export function referencedSecret(value: string): string | undefined {
  return REFERENCE.exec(value)?.[1];
}

const NONE = "__arc-no-secret";
const LOOSE = "__arc-not-a-reference";

interface ReferenceOption {
  id: string;
  label: string;
}

export const secretReferenceFieldStyles = variants({
  slots: { select: arc(layout.fill), item: arc(type.mono) },
});

type ReferenceSlots = ReturnType<typeof secretReferenceFieldStyles> & FieldSlots;

export interface SecretReferenceFieldProps
  extends Omit<ArcFieldProps, "classes">, FieldValueProps<string>, Customisable<ReferenceSlots> {
  /** The names of the stored secrets it may point at. */
  secrets: readonly string[];
  /** The first option, which holds `""`. @default "None" */
  noneLabel?: string;
  /** How a name is written as a reference. @default `secretReference`, `{{NAME}}` */
  toReference?: (name: string) => string;
  /** The name a held value points at, or `undefined` when it is no reference. @default `referencedSecret` */
  fromReference?: (value: string) => string | undefined;
  /** @default "Choose a secret" */
  placeholder?: string;
}

/**
 * A stored secret picked by its name, held as a reference to it rather than
 * its value: `{{CLIENT_KEY}}`, which what runs it resolves.
 *
 * ```tsx
 * <form.AppField name="clientKey">
 *   {(field) => <field.SecretReferenceField label="Client key" secrets={names} />}
 * </form.AppField>
 * ```
 *
 * A reference to a secret no longer stored stays chosen, named as missing
 * and marked invalid, so a renamed or deleted secret is never silently
 * dropped; so does a held value that is no reference at all.
 */
export function SecretReferenceField(props: SecretReferenceFieldProps) {
  const messages = useArcMessages();
  const of = bindField<string>(props, "");
  function cls(): ReferenceSlots {
    return parts({ ...fieldStyles(), ...secretReferenceFieldStyles() }, props.classes);
  }
  function held(): string {
    return of.value() ?? "";
  }
  function pointsAt(): string | undefined {
    const value = held();
    if (value.trim() === "") return undefined;
    return (props.fromReference ?? referencedSecret)(value);
  }
  function missing(): string | undefined {
    const name = pointsAt();
    return name !== undefined && !props.secrets.includes(name) ? name : undefined;
  }
  function loose(): boolean {
    return held().trim() !== "" && pointsAt() === undefined;
  }
  const wiring = withOwnErrors(of, () => {
    const name = missing();
    if (name !== undefined) return [messages().secretNotFound(name)];
    return loose() ? [messages().notASecretReference] : [];
  });
  function options(): ReferenceOption[] {
    const out: ReferenceOption[] = [{ id: NONE, label: props.noneLabel ?? messages().none }];
    const name = missing();
    if (name !== undefined) out.push({ id: name, label: messages().missingSecret(name) });
    if (loose()) out.push({ id: LOOSE, label: messages().notASecretReference });
    for (const secret of props.secrets) out.push({ id: secret, label: secret });
    return out;
  }
  function selected(): string {
    if (held().trim() === "") return NONE;
    return pointsAt() ?? LOOSE;
  }
  return (
    <Frame
      of={wiring}
      label={props.label}
      description={props.description}
      field={props}
      slot="secret-reference-field"
    >
      <Select
        items={options()}
        id={of.ids.control}
        value={selected()}
        placeholder={props.placeholder ?? messages().chooseSecret}
        isDisabled={props.isDisabled}
        isRequired={props.isRequired}
        isInvalid={wiring.isInvalid()}
        aria-labelledby={of.ids.label}
        aria-describedby={wiring.describedBy(props.description !== undefined)}
        class={arc(cls().select, cls().control)}
        data-slot="secret-reference-field-select"
        onValueChange={(value: string) => {
          if (value === LOOSE) return;
          of.change(value === NONE ? "" : (props.toReference ?? secretReference)(value));
          of.blur();
        }}
      >
        {(option: ReferenceOption) => (
          <SelectItem class={option.id === NONE ? undefined : cls().item}>
            {option.label}
          </SelectItem>
        )}
      </Select>
      <Show when={of.name() !== undefined}>
        <input type="hidden" name={of.name()} value={held()} />
      </Show>
    </Frame>
  );
}

export const copyableFieldStyles = variants({
  slots: { group: arc({}), input: arc({}), copy: arc({}) },
  variants: {
    mono: { true: { input: type.mono }, false: {} },
  },
  defaults: { mono: true },
});

type CopyableSlots = ReturnType<typeof copyableFieldStyles> & FieldSlots;

export interface CopyableFieldProps
  extends Omit<ArcFieldProps, "classes" | "isRequired">, Customisable<CopyableSlots> {
  value: string;
  /** In the code face, for an identifier or a key. @default true */
  mono?: boolean;
  /** Names the copy button. @default "Copy" and the label, when the label is text */
  copyLabel?: string;
  onCopy?: (value: string) => void;
}

/**
 * A value to read and copy, never to change: an identifier the API calls
 * something by, a signing secret shown once, an address to connect at.
 *
 * ```tsx
 * <CopyableField label="Location ID" value={location.slug} description="It never changes." />
 * ```
 *
 * A read-only input, so it reads as a field among the others and selects
 * whole when focused, with a copy button inside its edge.
 */
export function CopyableField(props: CopyableFieldProps) {
  const messages = useArcMessages();
  const of = fieldWiring(
    () => [],
    () => false,
  );
  function cls(): CopyableSlots {
    return parts(
      { ...fieldStyles(), ...copyableFieldStyles({ mono: props.mono !== false }) },
      props.classes,
    );
  }
  function copyLabel(): string {
    if (props.copyLabel !== undefined) return props.copyLabel;
    return typeof props.label === "string" ? messages().copyOf(props.label) : messages().copy;
  }
  return (
    <Frame
      of={of}
      label={props.label}
      description={props.description}
      field={props}
      slot="copyable-field"
    >
      <InputGroup
        class={arc(cls().group, cls().control)}
        data-slot="copyable-field-group"
        isDisabled={props.isDisabled}
      >
        <InputGroupInput
          class={cls().input}
          data-slot="copyable-field-input"
          id={of.ids.control}
          value={props.value}
          readOnly
          dir="ltr"
          spellCheck={false}
          disabled={props.isDisabled}
          aria-describedby={of.describedBy(props.description !== undefined)}
          onFocus={(event: FocusEvent) => (event.currentTarget as HTMLInputElement).select()}
        />
        <InputGroupAddon align="inline-end">
          <CopyButton
            value={props.value}
            label={copyLabel()}
            size="icon-xs"
            class={cls().copy}
            disabled={props.isDisabled}
            onCopy={props.onCopy}
          />
        </InputGroupAddon>
      </InputGroup>
    </Frame>
  );
}
