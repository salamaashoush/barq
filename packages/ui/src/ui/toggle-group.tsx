import { context, getContext, install, getOwner, signal, type Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { Toggle, type ToggleSize, type ToggleVariant } from "./toggle.tsx";

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

const item = ui({
  flexShrink: "0",
  ':is(:where(.group\\/toggle-group)[data-spacing="0"] *)': {
    borderRadius: "0",
    paddingInline: "calc(var(--spacing) * 2)",
  },
  ':is(:where(.group\\/toggle-group)[data-spacing="0"] *):has([data-icon="inline-end"])': {
    paddingRight: "calc(var(--spacing) * 1.5)",
  },
  ':is(:where(.group\\/toggle-group)[data-spacing="0"] *):has([data-icon="inline-start"])': {
    paddingLeft: "calc(var(--spacing) * 1.5)",
  },
  ':is(:where(.group\\/toggle-group):where([data-orientation="horizontal"]) *)[data-spacing="0"]:first-child':
    {
      borderTopLeftRadius: "var(--radius)",
      borderBottomLeftRadius: "var(--radius)",
    },
  ':is(:where(.group\\/toggle-group):where([data-orientation="vertical"]) *)[data-spacing="0"]:first-child':
    {
      borderTopLeftRadius: "var(--radius)",
      borderTopRightRadius: "var(--radius)",
    },
  ':is(:where(.group\\/toggle-group):where([data-orientation="horizontal"]) *)[data-spacing="0"]:last-child':
    {
      borderTopRightRadius: "var(--radius)",
      borderBottomRightRadius: "var(--radius)",
    },
  ':is(:where(.group\\/toggle-group):where([data-orientation="vertical"]) *)[data-spacing="0"]:last-child':
    {
      borderBottomRightRadius: "var(--radius)",
      borderBottomLeftRadius: "var(--radius)",
    },
  ':is(:where(.group\\/toggle-group):where([data-orientation="horizontal"]) *)[data-spacing="0"][data-variant="outline"]':
    {
      borderLeftStyle: "var(--ui-border-style)",
      borderLeftWidth: "0px",
    },
  ':is(:where(.group\\/toggle-group):where([data-orientation="vertical"]) *)[data-spacing="0"][data-variant="outline"]':
    {
      borderTopStyle: "var(--ui-border-style)",
      borderTopWidth: "0px",
    },
  ':is(:where(.group\\/toggle-group):where([data-orientation="horizontal"]) *)[data-spacing="0"][data-variant="outline"]:first-child':
    {
      borderLeftStyle: "var(--ui-border-style)",
      borderLeftWidth: "1px",
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
  readonly variant: () => ToggleVariant | undefined;
  readonly size: () => ToggleSize | undefined;
  readonly spacing: () => number;
  readonly isSelected: (value: string) => boolean;
  readonly toggle: (value: string) => void;
}

const GroupContext = context<GroupValue | null>(null);

export type ToggleGroupType = "single" | "multiple";

export interface ToggleGroupProps extends UiProps {
  /** `single` keeps one pressed, `multiple` any number. @default "single" */
  type?: ToggleGroupType;
  value?: readonly string[];
  defaultValue?: readonly string[];
  /** @default "default" */
  variant?: ToggleVariant;
  /** @default "default" */
  size?: ToggleSize;
  /** Spacing units between items. `0` welds them into one control. @default 0 */
  spacing?: number;
  /** @default "horizontal" */
  orientation?: "horizontal" | "vertical";
  onChange?: (value: string[]) => void;
}

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
 */
export function ToggleGroup(props: Incoming<ToggleGroupProps>) {
  const inner = signal<readonly string[]>(props.defaultValue?.() ?? []);
  const value = (): readonly string[] => props.value?.() ?? inner();

  const toggle = (key: string): void => {
    const held = value();
    const next =
      props.type?.() === "multiple"
        ? held.includes(key)
          ? held.filter((entry) => entry !== key)
          : [...held, key]
        : held.includes(key)
          ? []
          : [key];
    inner.set(next);
    props.onChange?.()?.([...next]);
  };

  const owner = getOwner();
  if (owner !== null) {
    install(owner, GroupContext, () => ({
      variant: () => props.variant?.(),
      size: () => props.size?.(),
      spacing: () => props.spacing?.() ?? 0,
      isSelected: (key: string) => value().includes(key),
      toggle,
    }));
  }

  const className = (): string => ui(group, props.class?.(), props.className?.());
  return (
    <div
      {...uiProps("toggle-group", className, props)}
      role={props.role?.() ?? "group"}
      data-variant={props.variant?.() ?? "default"}
      data-size={props.size?.() ?? "default"}
      data-spacing={String(props.spacing?.() ?? 0)}
      data-orientation={props.orientation?.() ?? "horizontal"}
      style={{ ...props.style?.(), "--gap": String(props.spacing?.() ?? 0) }}
    >
      {props.children}
    </div>
  );
}

export interface ToggleGroupItemProps extends UiProps {
  /** What this item contributes to the group's value. */
  value: string;
  isDisabled?: boolean;
}

export function ToggleGroupItem(props: Incoming<ToggleGroupItemProps>) {
  const held = getContext(GroupContext);
  if (held === null || held === undefined) {
    throw new Error("A ToggleGroupItem has to be inside a ToggleGroup.");
  }

  // `variant` and `size` rather than the attributes they produce: `<Toggle>`
  // writes both itself, from the props it was given, and applies the classes
  // that go with them.
  return (
    <Toggle
      isSelected={held.isSelected(props.value())}
      onChange={() => held.toggle(props.value())}
      isDisabled={props.isDisabled?.()}
      aria-label={props["aria-label"]?.()}
      variant={held.variant()}
      size={held.size()}
      data-slot="toggle-group-item"
      data-spacing={String(held.spacing())}
      class={ui(item, props.class?.(), props.className?.())}
    >
      {props.children}
    </Toggle>
  );
}
