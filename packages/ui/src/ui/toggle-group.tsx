import {
  toggleGroup,
  toggleGroupItem,
  toggleGroupState,
  type ToggleGroupState,
} from "@barqjs/aria/togglegroup";
import { createContext, getContext, provide, type Child, type Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";
import { mergeRefs, ref as makeRef } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { omit, uiProps } from "../lib/slot.ts";
import { Toggle, type ToggleProps, type ToggleSize, type ToggleVariant } from "./toggle.tsx";

const ui = layer("barq.ui");

// A marker: every rule that welds the items together is written against
// `.group\/toggle-group`, so the group's orientation and spacing reach them.
const group = ui("group/toggle-group", {
  display: "flex",
  width: "fit-content",
  flexDirection: "row",
  alignItems: "center",
  gap: "calc(var(--spacing) * var(--gap))",
  borderRadius: "var(--radius)",
  '[data-size="sm"]': {
    borderRadius: "min(var(--radius-md), 10px)",
  },
  ':where([data-orientation="vertical"])': {
    flexDirection: "column",
    alignItems: "stretch",
  },
});

const item_ = ui({
  flexShrink: "0",
  ':is(:where(.group\\/toggle-group)[data-spacing="0"] *)': {
    borderRadius: "0",
    paddingInline: "calc(var(--spacing) * 2)",
  },
  ':is(:where(.group\\/toggle-group)[data-spacing="0"] *):has([data-icon="inline-end"])': {
    paddingInlineEnd: "calc(var(--spacing) * 1.5)",
  },
  ':is(:where(.group\\/toggle-group)[data-spacing="0"] *):has([data-icon="inline-start"])': {
    paddingInlineStart: "calc(var(--spacing) * 1.5)",
  },
  ':is(:where(.group\\/toggle-group):where([data-orientation="horizontal"]) *)[data-spacing="0"]:first-child':
    {
      borderStartStartRadius: "var(--radius)",
      borderEndStartRadius: "var(--radius)",
    },
  ':is(:where(.group\\/toggle-group):where([data-orientation="vertical"]) *)[data-spacing="0"]:first-child':
    {
      borderTopLeftRadius: "var(--radius)",
      borderTopRightRadius: "var(--radius)",
    },
  ':is(:where(.group\\/toggle-group):where([data-orientation="horizontal"]) *)[data-spacing="0"]:last-child':
    {
      borderStartEndRadius: "var(--radius)",
      borderEndEndRadius: "var(--radius)",
    },
  ':is(:where(.group\\/toggle-group):where([data-orientation="vertical"]) *)[data-spacing="0"]:last-child':
    {
      borderBottomRightRadius: "var(--radius)",
      borderBottomLeftRadius: "var(--radius)",
    },
  ':is(:where(.group\\/toggle-group):where([data-orientation="horizontal"]) *)[data-spacing="0"][data-variant="outline"]':
    {
      // The style is the same on all four sides, so naming the left one is
      // right in either direction; the WIDTH is what follows the reading order.
      borderLeftStyle: "var(--ui-border-style)",
      borderInlineStartWidth: "0px",
    },
  ':is(:where(.group\\/toggle-group):where([data-orientation="vertical"]) *)[data-spacing="0"][data-variant="outline"]':
    {
      borderTopStyle: "var(--ui-border-style)",
      borderTopWidth: "0px",
    },
  ':is(:where(.group\\/toggle-group):where([data-orientation="horizontal"]) *)[data-spacing="0"][data-variant="outline"]:first-child':
    {
      borderInlineStartStyle: "var(--ui-border-style)",
      borderInlineStartWidth: "1px",
    },
  ':is(:where(.group\\/toggle-group):where([data-orientation="vertical"]) *)[data-spacing="0"][data-variant="outline"]:first-child':
    {
      borderTopStyle: "var(--ui-border-style)",
      borderTopWidth: "1px",
    },
  ":focus": {
    zIndex: "10",
  },
  "[data-focus-visible]": {
    zIndex: "10",
  },
});

interface GroupValue {
  readonly state: ToggleGroupState;
  readonly variant: () => ToggleVariant | undefined;
  readonly size: () => ToggleSize | undefined;
  readonly spacing: () => number;
  readonly orientation: () => ToggleGroupOrientation;
}

const GroupContext = createContext<GroupValue | null>(null);

export type ToggleGroupType = "single" | "multiple";
export type ToggleGroupOrientation = "horizontal" | "vertical";

export interface ToggleGroupProps extends UiProps {
  /** `single` keeps one pressed, `multiple` any number. @default "single" */
  type?: ToggleGroupType;
  /** A list, or for a `single` group the one value as a string. */
  value?: string | readonly string[];
  defaultValue?: string | readonly string[];
  /** @default "default" */
  variant?: ToggleVariant;
  /** @default "default" */
  size?: ToggleSize;
  /** Spacing units between items. `0` welds them into one control. @default 0 */
  spacing?: number;
  /**
   * The layout, and which arrows move focus. Unset, it is laid out as a row
   * and all four arrows move.
   *
   * @default "horizontal"
   */
  orientation?: ToggleGroupOrientation;
  /** Disables every item. */
  disabled?: boolean;
  /** The same as `disabled`. */
  isDisabled?: boolean;
  /** One tab stop for the group, with the arrows moving inside it. @default true */
  rovingFocus?: boolean;
  /** Whether the arrows go round from the last item to the first. @default true */
  loop?: boolean;
  /** Always the list, whatever `type` is. */
  onChange?: (value: string[]) => void;
  /** The one value for a `single` group (empty when nothing is pressed), the list for `multiple`. */
  onValueChange?: (value: string | string[]) => void;
}

const listOf = (value: string | readonly string[] | undefined): readonly string[] | undefined => {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value === "" ? [] : [value];
  return value;
};

/**
 * ```tsx
 * <ToggleGroup type="multiple" variant="outline">
 *   <ToggleGroupItem value="bold" aria-label="Bold"><Bold /></ToggleGroupItem>
 *   <ToggleGroupItem value="italic" aria-label="Italic"><Italic /></ToggleGroupItem>
 * </ToggleGroup>
 * ```
 *
 * At `spacing={0}` the items share their borders and only the ends are
 * rounded, which is what makes a row of toggles read as one control.
 *
 * Tab enters it once and the arrows, Home and End move among the items; see
 * `@barqjs/aria/togglegroup` for which item Tab lands on.
 */
export function ToggleGroup(props: Incoming<ToggleGroupProps>) {
  const type = (): ToggleGroupType => props.type?.() ?? "single";
  const state = toggleGroupState({
    selectionMode: type,
    selectedKeys: () => listOf(props.value?.()),
    defaultSelectedKeys: () => listOf(props.defaultValue?.()),
    isDisabled: () => (props.disabled?.() ?? props.isDisabled?.()) === true,
    rovingFocus: () => props.rovingFocus?.(),
    onSelectionChange(keys) {
      props.onChange?.()?.(keys);
      props.onValueChange?.()?.(type() === "multiple" ? keys : (keys[0] ?? ""));
    },
  });
  const orientation = (): ToggleGroupOrientation => props.orientation?.() ?? "horizontal";
  const groupRef = makeRef<HTMLDivElement>();
  const { groupProps } = toggleGroup(
    {
      ref: groupRef,
      orientation: () => props.orientation?.(),
      direction: () => {
        const dir = props.dir?.();
        return dir === "auto" ? undefined : dir;
      },
      loop: () => props.loop?.(),
    },
    state,
  );

  const value: GroupValue = {
    state,
    variant: () => props.variant?.(),
    size: () => props.size?.(),
    spacing: () => props.spacing?.() ?? 0,
    orientation,
  };

  const className = (): string => ui(group, props.class?.(), props.className?.());
  return (
    <div
      {...groupProps}
      {...uiProps("toggle-group", className, omit(props, ["dir"]))}
      ref={mergeRefs(groupRef.set, props.ref?.())}
      role={props.role?.() ?? "group"}
      data-variant={props.variant?.() ?? "default"}
      data-size={props.size?.() ?? "default"}
      data-spacing={String(props.spacing?.() ?? 0)}
      data-orientation={orientation()}
      data-disabled={() => (state.isDisabled() ? "" : undefined)}
      style={{ ...props.style?.(), "--gap": String(props.spacing?.() ?? 0) }}
    >
      <GroupProvider value={value}>{props.children}</GroupProvider>
    </div>
  );
}

/**
 * Its own component, because a `provide` callback that BUILDS the children is
 * the only place the scope exists.
 */
function GroupProvider(props: Incoming<{ value: GroupValue; children?: Child }>) {
  return provide(
    GroupContext,
    () => props.value(),
    () => props.children,
  );
}

export interface ToggleGroupItemProps extends Omit<
  ToggleProps,
  "value" | "isSelected" | "defaultSelected" | "pressed" | "defaultPressed"
> {
  /** What this item contributes to the group's value. */
  value: string;
}

const OWN = ["value", "variant", "size", "disabled", "isDisabled", "onChange", "ref"];

export function ToggleGroupItem(props: Incoming<ToggleGroupItemProps>) {
  const held = getContext(GroupContext);
  if (held === null || held === undefined) {
    throw new Error("A ToggleGroupItem has to be inside a ToggleGroup.");
  }
  const domRef = makeRef<HTMLButtonElement>();
  const item = toggleGroupItem(
    {
      value: () => props.value(),
      isDisabled: () => (props.disabled?.() ?? props.isDisabled?.()) === true,
      ref: domRef,
    },
    held.state,
  );
  const forward = mergeRefs<HTMLButtonElement>(domRef.set, props.ref?.());

  // `variant` and `size` rather than the attributes they produce: `<Toggle>`
  // writes both itself, from the props it was given, and applies the classes
  // that go with them.
  return (
    <Toggle
      {...omit(props, OWN)}
      ref={(element: unknown) => {
        if (element instanceof HTMLButtonElement) forward(element);
      }}
      isSelected={item.isSelected()}
      onChange={(next: boolean) => {
        item.onChange(next);
        props.onChange?.()?.(next);
      }}
      isDisabled={item.isDisabled()}
      excludeFromTabOrder={item.excludeFromTabOrder()}
      variant={held.variant() ?? props.variant?.()}
      size={held.size() ?? props.size?.()}
      data-slot="toggle-group-item"
      data-spacing={String(held.spacing())}
      data-orientation={held.orientation()}
      class={ui(item_, props.class?.(), props.className?.())}
    >
      {props.children}
    </Toggle>
  );
}
