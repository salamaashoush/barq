import { type Child, For, Show, createSignal } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { on } from "@barqjs/ui/conditions";

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
import { edge, fg, gap, layout, rounded, space, type } from "../style/index.ts";
import { CheckboxGroupField, type GroupOption } from "./choice-group.tsx";
import { useArcMessages } from "./messages.ts";

/** One permission a key, a token or an agent may be granted. */
export interface PermissionScope {
  /** As the API names it: `checks:write`. */
  value: string;
  /** @default the value, in the code face */
  label?: Child;
  /** What it allows, to the person granting it. */
  description?: Child;
  /** What it lets an agent do, in terms of its tools, for a consent screen. @default `description` */
  agentDescription?: Child;
  /** Scopes it includes, left unsaid beside it in a summary: a write's read. */
  implies?: readonly string[];
  /** Includes every other scope, which a summary then says alone: `admin`. */
  impliesAll?: boolean;
}

/** Scopes of one resource, under its name. */
export interface ScopeGroup {
  label: string;
  scopes: readonly PermissionScope[];
}

export const permissionScopePickerStyles = variants({
  slots: {
    panel: arc(edge.all, rounded.md, layout.column, layout.container, {
      "& > :first-child": { borderBlockStartWidth: "0px" },
    }),
    group: arc(edge.top, gap[2], {
      padding: space.x3,
      [on.cqSm]: {
        display: "grid",
        gridTemplateColumns: "7rem minmax(0, 1fr)",
        alignItems: "start",
        columnGap: space.x4,
      },
    }),
    groupLabel: arc(type.label, fg.muted),
    scope: arc(type.mono, type.xs),
    empty: arc(type.body, fg.muted, { padding: space.x3 }),
  },
});

type Slots = ReturnType<typeof permissionScopePickerStyles> & FieldSlots;

export interface PermissionScopePickerProps
  extends Omit<ArcFieldProps, "classes">, FieldValueProps<readonly string[]>, Customisable<Slots> {
  groups: readonly ScopeGroup[];
  /**
   * The scopes this reader may grant. The rest still show, disabled, with
   * `blockedReason`, so a person sees what their role keeps from them.
   * Left out, every scope can be granted.
   */
  allowed?: readonly string[];
  /** Why a scope outside `allowed` cannot be ticked. @default "Your role here does not include this." */
  blockedReason?: Child;
  /** `agent` describes each scope by what it lets an agent do. @default "person" */
  audience?: "person" | "agent";
  /** Lists the granted scopes, and nothing to change them. */
  isReadOnly?: boolean;
}

/**
 * The permissions to grant a key, a token or a connected agent, a checkbox
 * each with what it allows, grouped by resource.
 *
 * ```tsx
 * <form.AppField name="scopes">
 *   {(field) => <field.PermissionScopePicker label="Allowed scopes" groups={SCOPES} allowed={role.scopes} isRequired />}
 * </form.AppField>
 * ```
 *
 * Held as the granted values in the groups' order; a held scope no group
 * lists is kept. A group's name sits beside its scopes across a wide
 * container and over them across a narrow one. `isRequired` asks for one
 * once the field is touched or the form submitted. `scopeSummary` says a
 * set briefly, for a table cell.
 */
export function PermissionScopePicker(props: PermissionScopePickerProps) {
  const messages = useArcMessages();
  const of = bindField<readonly string[]>(props, []);
  const submitted = useSubmitted(of as Binding<unknown>);
  const [touched, setTouched] = createSignal(false);
  function cls(): Slots {
    return parts({ ...fieldStyles(), ...permissionScopePickerStyles() }, props.classes);
  }
  function chosen(): readonly string[] {
    return of.value() ?? [];
  }
  function listed(): string[] {
    return props.groups.flatMap((group) => group.scopes.map((scope) => scope.value));
  }
  function valuesOf(group: ScopeGroup): string[] {
    return group.scopes.map((scope) => scope.value);
  }
  function blocked(scope: PermissionScope): boolean {
    return props.allowed !== undefined && !props.allowed.includes(scope.value);
  }
  function optionsOf(group: ScopeGroup): GroupOption[] {
    return group.scopes.map((scope) => ({
      value: scope.value,
      label: scope.label ?? <span class={cls().scope}>{scope.value}</span>,
      description:
        props.audience === "agent"
          ? (scope.agentDescription ?? scope.description)
          : scope.description,
      caveat: blocked(scope) ? (props.blockedReason ?? messages().scopeOutsideRole) : undefined,
      isDisabled: blocked(scope),
    }));
  }
  /** Read only, the groups with nothing granted say nothing. */
  function shownGroups(): readonly ScopeGroup[] {
    if (props.isReadOnly !== true) return props.groups;
    return props.groups.filter((group) =>
      group.scopes.some((scope) => chosen().includes(scope.value)),
    );
  }
  function setGroup(group: ScopeGroup, next: readonly string[]): void {
    const mine = valuesOf(group);
    const kept = chosen().filter((value) => !mine.includes(value));
    const all = [...kept, ...next];
    const order = listed();
    const ordered = order.filter((value) => all.includes(value));
    const unknown = all.filter((value) => !order.includes(value));
    setTouched(true);
    of.change([...ordered, ...unknown]);
    of.blur();
  }
  const wiring = withOwnErrors(of, () =>
    props.isRequired === true &&
    props.isReadOnly !== true &&
    chosen().length === 0 &&
    (touched() || submitted())
      ? [messages().pickAtLeastOne]
      : [],
  );
  return (
    <Frame
      of={wiring}
      label={props.label}
      description={props.description}
      field={props}
      labelledById
      slot="permission-scope-picker"
    >
      <div
        class={cls().panel}
        role="group"
        data-slot="permission-scope-picker-groups"
        aria-labelledby={of.ids.label}
        aria-describedby={wiring.describedBy(props.description !== undefined)}
        aria-required={props.isRequired === true ? true : undefined}
        aria-invalid={wiring.isInvalid() ? true : undefined}
      >
        <Show when={shownGroups().length === 0}>
          <p class={cls().empty} data-slot="permission-scope-picker-empty">
            {messages().noneChosen}
          </p>
        </Show>
        <For each={shownGroups()}>
          {(group: ScopeGroup) => (
            <CheckboxGroupField
              label={group.label}
              options={optionsOf(group)}
              value={chosen().filter((value) => valuesOf(group).includes(value))}
              onChange={(next: readonly string[]) => setGroup(group, next)}
              isDisabled={props.isDisabled}
              isReadOnly={props.isReadOnly}
              emptyLabel={messages().none}
              classes={{ root: cls().group, label: cls().groupLabel }}
            />
          )}
        </For>
      </div>
      <Show when={of.name() !== undefined}>
        <For each={chosen()}>
          {(value: string) => <input type="hidden" name={of.name()} value={value} />}
        </For>
      </Show>
    </Frame>
  );
}

/**
 * A scope set as briefly as it can be said, for a table cell: a scope
 * another one in the set implies goes unsaid, and one that implies all is
 * said alone.
 */
export function scopeSummary(
  scopes: readonly string[],
  groups: readonly ScopeGroup[],
): readonly string[] {
  const known = new Map<string, PermissionScope>();
  for (const group of groups) for (const scope of group.scopes) known.set(scope.value, scope);
  const all = scopes.find((value) => known.get(value)?.impliesAll === true);
  if (all !== undefined) return [all];
  return scopes.filter(
    (value) =>
      !scopes.some((other) => other !== value && (known.get(other)?.implies ?? []).includes(value)),
  );
}
