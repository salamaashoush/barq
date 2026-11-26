import { type Child, For, Show, createSignal } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { KeyRound } from "@barqjs/lucide/icons/key-round";
import { Input } from "@barqjs/ui/input";
import { Select, SelectItem } from "@barqjs/ui/select";

import { arcLayer as arc } from "../layer.ts";
import {
  type ArcFieldProps,
  type Binding,
  type FieldSlots,
  type FieldValueProps,
  Frame,
  bindField,
  fieldStyles,
  useSubmitted,
  withOwnErrors,
} from "../lib/field.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import { edge, fg, gap, glyph, layout, plainList, rounded, space, type } from "../style/index.ts";
import { type ArcMessages, useArcMessages } from "./messages.ts";

/** A secret something needs, by name, and where it was met. */
export interface RequiredCredential {
  /** `PASSWORD`, as what reads it names it. */
  name: string;
  /** Where it came from, as the end of a sentence: "from the field 'Password' on shop.example.com". */
  origin?: Child;
}

/**
 * Where one secret comes from: the value captured with it saved as a new
 * secret, a secret already stored, or a value typed here.
 */
export type CredentialSource = "capture" | "existing" | "new";

export interface CredentialBinding {
  source: CredentialSource;
  /** With `existing`, the stored secret it reads. */
  secret?: string;
  /** With `new`, the value typed. */
  value?: string;
  /** With `capture` and `new`, where it is saved: one of `scopes`, or `""` for every one. */
  scope?: string;
}

export type CredentialBindings = Readonly<Record<string, CredentialBinding>>;

/** A place a secret can be saved: an environment, a project. */
export interface CredentialScope {
  value: string;
  label: string;
}

/**
 * Where a secret comes from before anyone chose: the stored secret of the
 * same name, else the captured value when that may be saved, else a value
 * to type.
 */
export function defaultCredentialBinding(
  name: string,
  existing: readonly string[],
  canCapture: boolean,
): CredentialBinding {
  if (existing.includes(name)) return { source: "existing", secret: name };
  if (canCapture) return { source: "capture", scope: "" };
  return { source: "new", value: "", scope: "" };
}

/** Each credential's binding, its default where none is chosen. */
export function credentialBindings(
  credentials: readonly RequiredCredential[],
  chosen: CredentialBindings,
  existing: readonly string[],
  canCapture: boolean,
): CredentialBindings {
  const out: Record<string, CredentialBinding> = {};
  for (const credential of credentials) {
    out[credential.name] =
      chosen[credential.name] ?? defaultCredentialBinding(credential.name, existing, canCapture);
  }
  return out;
}

/** What a binding still lacks, in words, or `undefined` when it is complete. */
export function credentialBindingProblem(
  name: string,
  binding: CredentialBinding,
  messages: ArcMessages,
): string | undefined {
  if (binding.source === "existing" && (binding.secret ?? "") === "") {
    return messages.chooseSecretFor(name);
  }
  if (binding.source === "new" && (binding.value ?? "") === "") return messages.typeValueOf(name);
  return undefined;
}

const SOURCES: readonly CredentialSource[] = ["capture", "existing", "new"];

interface SelectOption {
  id: string;
  label: string;
}

interface RowProps {
  credential: RequiredCredential;
}

export const credentialBindingListStyles = variants({
  slots: {
    list: arc(plainList, edge.all, rounded.md, layout.column, {
      "& > li:first-child": { borderBlockStartWidth: "0px" },
    }),
    item: arc(edge.top, layout.column, gap[2], { padding: space.x3 }),
    head: arc(layout.row, layout.wrap, gap[3], layout.minZero),
    icon: arc(fg.faint, glyph.md, layout.noShrink),
    name: arc(type.mono, type.sm),
    origin: arc(type.meta, layout.minZero),
    controls: arc(layout.row, layout.wrap, gap[2], {
      paddingInlineStart: `calc(${space.x4} + ${space.x3})`,
    }),
    select: arc({ width: "15rem", maxWidth: "100%" }),
    problem: arc(type.meta, fg.danger, { flexBasis: "100%" }),
    read: arc(type.body, fg.muted),
  },
});

type Slots = ReturnType<typeof credentialBindingListStyles> & FieldSlots;

export interface CredentialBindingListProps
  extends Omit<ArcFieldProps, "classes">, FieldValueProps<CredentialBindings>, Customisable<Slots> {
  credentials: readonly RequiredCredential[];
  /** The names of the secrets already stored, any of which a credential may read. */
  existing: readonly string[];
  /** The reader may save a captured value as a new secret. @default false */
  canCapture?: boolean;
  /** Where a saved value may go. Left out or empty, the choice is not offered. */
  scopes?: readonly CredentialScope[];
  /** The scope that is every one. @default "Everywhere" */
  everyScopeLabel?: string;
  /** Lists what each reads, and nothing to change it. */
  isReadOnly?: boolean;
}

/**
 * Where each secret a thing needs comes from: the value captured with it,
 * saved; a secret already stored; or a value typed now, a row per secret.
 *
 * ```tsx
 * <form.AppField name="secrets">
 *   {(field) => <field.CredentialBindingList label="Secrets" credentials={kept} existing={names} canCapture scopes={environments} />}
 * </form.AppField>
 * ```
 *
 * Held as a binding per name; a credential with none reads as its
 * `defaultCredentialBinding`, and `credentialBindings` fills them in for a
 * form's starting value. Each choice brings its own control, and a row that
 * still lacks one says so once the field is touched or the form submitted.
 */
export function CredentialBindingList(props: CredentialBindingListProps) {
  const messages = useArcMessages();
  const of = bindField<CredentialBindings>(props, {});
  const submitted = useSubmitted(of as Binding<unknown>);
  const [touched, setTouched] = createSignal(false);
  function cls(): Slots {
    return parts({ ...fieldStyles(), ...credentialBindingListStyles() }, props.classes);
  }
  function all(): CredentialBindings {
    return credentialBindings(
      props.credentials,
      of.value() ?? {},
      props.existing,
      props.canCapture === true,
    );
  }
  function bindingOf(name: string): CredentialBinding {
    return all()[name] ?? defaultCredentialBinding(name, props.existing, props.canCapture === true);
  }
  function set(name: string, binding: CredentialBinding): void {
    setTouched(true);
    of.change({ ...all(), [name]: binding });
  }
  function choose(name: string, source: CredentialSource): void {
    if (source === "existing") {
      set(name, { source, secret: props.existing.includes(name) ? name : "" });
    } else if (source === "capture") {
      set(name, { source, scope: "" });
    } else {
      set(name, { source, value: "", scope: "" });
    }
  }
  function problem(name: string): string | undefined {
    if (!(touched() || submitted())) return undefined;
    return credentialBindingProblem(name, bindingOf(name), messages());
  }
  const wiring = withOwnErrors(of, () =>
    props.isReadOnly !== true && props.credentials.some((one) => problem(one.name) !== undefined)
      ? [messages().credentialsUnbound]
      : [],
  );
  function sourceLabel(source: CredentialSource): string {
    if (source === "capture") return messages().credentialCapture;
    if (source === "existing") return messages().credentialExisting;
    return messages().credentialNew;
  }
  function sources(): SelectOption[] {
    return SOURCES.filter((source) => source !== "capture" || props.canCapture === true).map(
      (source) => ({ id: source, label: sourceLabel(source) }),
    );
  }
  function scopeOptions(): SelectOption[] {
    return [
      { id: "", label: props.everyScopeLabel ?? messages().everywhere },
      ...(props.scopes ?? []).map((scope) => ({
        id: scope.value,
        label: messages().onlyIn(scope.label),
      })),
    ];
  }
  function readOut(name: string): string {
    const binding = bindingOf(name);
    if (binding.source === "existing") return messages().readsSecret(binding.secret ?? "");
    if (binding.source === "capture") return messages().credentialCaptured;
    return messages().credentialTyped;
  }

  function scopeSelect(credential: RequiredCredential, binding: CredentialBinding) {
    return (
      <Show when={(props.scopes ?? []).length > 0}>
        <Select
          items={scopeOptions()}
          value={binding.scope ?? ""}
          size="sm"
          class={cls().select}
          data-slot="credential-binding-scope"
          aria-label={messages().credentialScopeOf(credential.name)}
          isDisabled={props.isDisabled}
          onValueChange={(scope: string) => set(credential.name, { ...binding, scope })}
        >
          {(option: SelectOption) => <SelectItem>{option.label}</SelectItem>}
        </Select>
      </Show>
    );
  }

  function Row(rowProps: RowProps) {
    const credential = rowProps.credential;
    const problemId = `${of.ids.control}-${credential.name}-problem`;
    function binding(): CredentialBinding {
      return bindingOf(credential.name);
    }
    function invalid(): boolean {
      return problem(credential.name) !== undefined;
    }
    return (
      <li class={cls().item} data-slot="credential-binding" data-source={binding().source}>
        <div class={cls().head} data-slot="credential-binding-head">
          <span class={cls().icon} aria-hidden="true">
            <KeyRound />
          </span>
          <code class={cls().name} data-slot="credential-binding-name">
            {credential.name}
          </code>
          <Show when={credential.origin !== undefined}>
            <span class={cls().origin} data-slot="credential-binding-origin">
              {credential.origin}
            </span>
          </Show>
        </div>
        <Show
          when={props.isReadOnly !== true}
          fallback={
            <p class={cls().read} data-slot="credential-binding-read">
              {readOut(credential.name)}
            </p>
          }
        >
          <div class={cls().controls} data-slot="credential-binding-controls">
            <Select
              items={sources()}
              value={binding().source}
              size="sm"
              class={cls().select}
              data-slot="credential-binding-source"
              aria-label={messages().credentialSourceOf(credential.name)}
              disabledKeys={props.existing.length === 0 ? ["existing"] : []}
              isDisabled={props.isDisabled}
              onValueChange={(source: string) =>
                choose(credential.name, source as CredentialSource)
              }
            >
              {(option: SelectOption) => <SelectItem>{option.label}</SelectItem>}
            </Select>
            <Show when={binding().source === "existing"}>
              <Select
                items={props.existing.map((name) => ({ id: name, label: name }))}
                value={binding().secret === "" ? undefined : binding().secret}
                placeholder={messages().chooseSecret}
                size="sm"
                class={cls().select}
                data-slot="credential-binding-secret"
                aria-label={messages().credentialSecretOf(credential.name)}
                aria-describedby={invalid() ? problemId : undefined}
                isInvalid={invalid()}
                isDisabled={props.isDisabled}
                onValueChange={(secret: string) =>
                  set(credential.name, { source: "existing", secret })
                }
              >
                {(option: SelectOption) => <SelectItem>{option.label}</SelectItem>}
              </Select>
            </Show>
            <Show when={binding().source === "new"}>
              <Input
                type="password"
                size="sm"
                class={cls().select}
                data-slot="credential-binding-value"
                aria-label={messages().credentialValueOf(credential.name)}
                aria-describedby={invalid() ? problemId : undefined}
                aria-invalid={invalid() ? true : undefined}
                autoComplete="new-password"
                spellCheck={false}
                dir="ltr"
                value={binding().value ?? ""}
                disabled={props.isDisabled}
                onInput={(event: Event) =>
                  set(credential.name, {
                    ...binding(),
                    value: (event.currentTarget as HTMLInputElement).value,
                  })
                }
                onBlur={() => {
                  setTouched(true);
                  of.blur();
                }}
              />
            </Show>
            <Show when={binding().source !== "existing"}>{scopeSelect(credential, binding())}</Show>
            <Show when={invalid()}>
              <p class={cls().problem} id={problemId} data-slot="credential-binding-problem">
                {problem(credential.name)}
              </p>
            </Show>
          </div>
        </Show>
      </li>
    );
  }

  return (
    <Frame
      of={wiring}
      label={props.label}
      description={props.description}
      field={props}
      labelledById
      slot="credential-binding-list"
    >
      <ul
        class={cls().list}
        data-slot="credential-binding-items"
        aria-labelledby={of.ids.label}
        aria-describedby={wiring.describedBy(props.description !== undefined)}
      >
        <For each={props.credentials}>
          {(credential: RequiredCredential) => <Row credential={credential} />}
        </For>
      </ul>
    </Frame>
  );
}
