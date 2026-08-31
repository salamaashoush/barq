import { context, getContext, install, getOwner, signal, type Incoming } from "@barqjs/core";
import { clsx, css } from "@barqjs/css";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { Toggle, type ToggleSize, type ToggleVariant } from "./toggle.tsx";

const group = css`
  @layer barq.ui {
    display: flex;
    width: fit-content;
    align-items: center;
    border-radius: calc(var(--radius) - 2px);
    gap: calc(var(--spacing) * var(--barq-toggle-gap, 0));
    &[data-spacing="default"][data-variant="outline"] {
      --ui-shadow: 0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05));
      box-shadow:
        var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
        var(--ui-ring-shadow), var(--ui-shadow);
    }
  }
`;

const item = css`
  @layer barq.ui {
    width: auto;
    min-width: 0px;
    flex-shrink: 0;
    padding-inline: calc(var(--spacing) * 3);
    &[data-spacing="0"] {
      border-radius: 0;
      --ui-shadow: 0 0 #0000;
      box-shadow:
        var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
        var(--ui-ring-shadow), var(--ui-shadow);
    }
    &[data-spacing="0"]:first-child {
      border-top-left-radius: calc(var(--radius) - 2px);
      border-bottom-left-radius: calc(var(--radius) - 2px);
    }
    &[data-spacing="0"]:last-child {
      border-top-right-radius: calc(var(--radius) - 2px);
      border-bottom-right-radius: calc(var(--radius) - 2px);
    }
    &[data-spacing="0"][data-variant="outline"] {
      border-left-style: var(--ui-border-style);
      border-left-width: 0px;
    }
    &[data-spacing="0"][data-variant="outline"]:first-child {
      border-left-style: var(--ui-border-style);
      border-left-width: 1px;
    }
    &[data-focus-visible] {
      z-index: 10;
    }
  }
`;

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

  const className = (): string => clsx(group, props.class?.(), props.className?.());
  return (
    <div
      {...uiProps("toggle-group", className, props)}
      role={props.role?.() ?? "group"}
      data-variant={props.variant?.() ?? "default"}
      data-size={props.size?.() ?? "default"}
      data-spacing={String(props.spacing?.() ?? 0)}
      style={{ ...props.style?.(), "--barq-toggle-gap": String(props.spacing?.() ?? 0) }}
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
      class={clsx(item, props.class?.(), props.className?.())}
    >
      {props.children}
    </Toggle>
  );
}
