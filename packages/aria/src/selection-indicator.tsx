/**
 * A selection indicator: the bar under the chosen tab, the pill behind the
 * pressed segment, that slides to the new choice rather than blinking.
 *
 * Every item renders one, and only the selected item's is shown. It is a
 * {@link SharedElement} named `SelectionIndicator`, so inside one
 * {@link SharedElementTransition} the indicator leaving the old item and the
 * one arriving at the new item are drawn as one element moving between them.
 *
 * Whether it is shown comes from the item it is in, which offers its selected
 * state with {@link SelectionIndicatorProvider}, or from `isSelected` when the
 * caller knows better.
 */

import {
  type Accessor,
  type Child,
  createContext,
  getContext,
  type Incoming,
  omit,
  provide,
} from "@barqjs/core";
import type { RefTarget } from "@barqjs/primitives/refs";
import { SharedElement } from "./shared-element-transition.tsx";
import type { StyleProps } from "./utils.ts";

export interface SelectionIndicatorValue {
  isSelected: Accessor<boolean>;
}

const SelectionIndicatorContext = createContext<SelectionIndicatorValue | null>(null);

/** The enclosing item's selected state, if an item offered it. */
export function useSelectionIndicator(): SelectionIndicatorValue | null {
  return getContext(SelectionIndicatorContext) ?? null;
}

export interface SelectionIndicatorProviderProps {
  /** Whether the item the children are in is selected. */
  isSelected: boolean;
  children?: Child;
}

/**
 * Offer an item's selected state to a {@link SelectionIndicator} among its
 * children. An item component wraps its children in it.
 */
export function SelectionIndicatorProvider(props: Incoming<SelectionIndicatorProviderProps>) {
  const value: SelectionIndicatorValue = { isSelected: () => props.isSelected() };
  return provide(
    SelectionIndicatorContext,
    () => value,
    () => props.children as unknown,
  );
}

export interface SelectionIndicatorComponentProps extends StyleProps {
  /** @default the enclosing item's selected state */
  isSelected?: boolean;
  children?: Child;
  ref?: RefTarget<HTMLDivElement>;
}

export function SelectionIndicator(props: SelectionIndicatorComponentProps) {
  const item = useSelectionIndicator();
  return (
    <SharedElement
      {...omit(props, "isSelected")}
      name="SelectionIndicator"
      isVisible={props.isSelected ?? item?.isSelected() ?? false}
    />
  );
}
