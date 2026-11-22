/**
 * A toggle button group: the component over `togglegroup.ts`.
 *
 * The state and the keyboard are that module's, and so is the one decision
 * that sets this apart from React Aria's component: a `single` group stays a
 * `group` of `aria-pressed` buttons rather than becoming a `radiogroup` of
 * `radio`s, because pressing the pressed item releases it and a radio promises
 * a choice that cannot be undone. `disallowEmptySelection` is the way to make
 * one that cannot be emptied.
 *
 * The items sit in a {@link SharedElementTransition} and offer their pressed
 * state to a {@link SelectionIndicator}, so a pill drawn behind the pressed
 * item slides to the next one.
 */

import { cells, type Child, createContext, getContext, omit, provide } from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { ToggleButton } from "./button.tsx";
import type { PressEvent } from "./interactions/press.ts";
import type { Orientation } from "./selection.ts";
import { SharedElementTransition } from "./shared-element-transition.tsx";
import {
  toggleGroup,
  toggleGroupItem,
  toggleGroupState,
  type ToggleGroupSelectionMode,
  type ToggleGroupState,
} from "./togglegroup.ts";
import { filterDOMProps, fromProps, mergeProps, type StyleProps, styleProps } from "./utils.ts";

interface ToggleButtonGroupValue {
  state: ToggleGroupState;
  disallowEmptySelection: () => boolean;
}

const ToggleButtonGroupContext = createContext<ToggleButtonGroupValue | null>(null);

/** The enclosing {@link ToggleButtonGroup}'s state, for an item of the caller's own. */
export function useToggleButtonGroup(): ToggleGroupState | null {
  return getContext(ToggleButtonGroupContext)?.state ?? null;
}

export interface ToggleButtonGroupComponentProps extends StyleProps {
  children?: Child;
  /** @default "single" */
  selectionMode?: ToggleGroupSelectionMode;
  selectedKeys?: readonly string[];
  defaultSelectedKeys?: readonly string[];
  /** Pressing the last pressed item does not release it. */
  disallowEmptySelection?: boolean;
  isDisabled?: boolean;
  /** @default "horizontal" */
  orientation?: Orientation;
  /** One tab stop, with the arrows moving inside. @default true */
  rovingFocus?: boolean;
  /** Whether the arrows wrap from the last item to the first. @default true */
  loop?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  ref?: RefTarget<HTMLDivElement>;
  onSelectionChange?: (keys: string[]) => void;
}

/**
 * ```tsx
 * <ToggleButtonGroup aria-label="Alignment" defaultSelectedKeys={["left"]}>
 *   <ToggleButtonGroupItem id="left">Left</ToggleButtonGroupItem>
 *   <ToggleButtonGroupItem id="center">Center</ToggleButtonGroupItem>
 * </ToggleButtonGroup>
 * ```
 */
export function ToggleButtonGroup(props: ToggleButtonGroupComponentProps) {
  const domRef = makeRef<HTMLDivElement>();
  const state = toggleGroupState({
    selectionMode: () => props.selectionMode,
    selectedKeys: () => props.selectedKeys,
    defaultSelectedKeys: () => props.defaultSelectedKeys,
    isDisabled: () => props.isDisabled,
    rovingFocus: () => props.rovingFocus,
    onSelectionChange: (keys) => props.onSelectionChange?.(keys),
  });
  const { groupProps } = toggleGroup(
    {
      ref: domRef,
      orientation: () => props.orientation ?? "horizontal",
      direction: () => (props.dir === "auto" ? undefined : props.dir),
      loop: () => props.loop,
      "aria-label": () => props["aria-label"],
      "aria-labelledby": () => props["aria-labelledby"],
      "aria-describedby": () => props["aria-describedby"],
    },
    state,
  );

  const value: ToggleButtonGroupValue = {
    state,
    disallowEmptySelection: () => props.disallowEmptySelection === true,
  };

  const elementProps = mergeProps(
    groupProps,
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      "data-orientation": () => props.orientation ?? "horizontal",
      "data-disabled": state.isDisabled,
      "data-testid": () => props["data-testid"],
    },
  );

  return (
    <div {...elementProps} ref={mergeRefs(domRef.set, props.ref)}>
      <GroupProvider value={value}>
        <SharedElementTransition>{props.children}</SharedElementTransition>
      </GroupProvider>
    </div>
  );
}

function GroupProvider(props: { value: ToggleButtonGroupValue; children?: Child }) {
  return provide(
    ToggleButtonGroupContext,
    () => props.value,
    () => props.children as unknown,
  );
}

export interface ToggleButtonGroupItemComponentProps extends StyleProps {
  /** What this item contributes to the group's `selectedKeys`. */
  id: string;
  children?: Child;
  isDisabled?: boolean;
  autoFocus?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  ref?: RefTarget<HTMLButtonElement>;
  onPress?: (event: PressEvent) => void;
  onPressStart?: (event: PressEvent) => void;
  onPressEnd?: (event: PressEvent) => void;
  onPressChange?: (isPressed: boolean) => void;
}

/** One item: a {@link ToggleButton} whose pressed state is the group's. */
export function ToggleButtonGroupItem(props: ToggleButtonGroupItemComponentProps) {
  const group = getContext(ToggleButtonGroupContext);
  if (group === null || group === undefined) {
    throw new Error("A ToggleButtonGroupItem must be rendered inside a ToggleButtonGroup.");
  }
  const domRef = makeRef<HTMLButtonElement>();
  const item = toggleGroupItem(
    { value: () => props.id, isDisabled: () => props.isDisabled, ref: domRef },
    group.state,
  );

  const onChange = (next: boolean): void => {
    // Releasing the only pressed item would leave the group empty.
    if (!next && group.disallowEmptySelection() && group.state.selectedKeys().length <= 1) return;
    item.onChange(next);
  };

  return (
    <ToggleButton
      {...omit(props, "id", "children", "isDisabled", "ref")}
      isSelected={item.isSelected()}
      isDisabled={item.isDisabled()}
      excludeFromTabOrder={item.excludeFromTabOrder()}
      onChange={onChange}
      ref={mergeRefs(domRef.set, props.ref)}
    >
      {props.children}
    </ToggleButton>
  );
}
