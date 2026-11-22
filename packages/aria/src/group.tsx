/**
 * A group: a set of related controls that reads, and styles, as one.
 *
 * An input with a button stuck to it, a date field's segments, a toolbar's
 * cluster of toggles. What the group adds is the state of the WHOLE: whether
 * the pointer is over any of it, and whether focus is anywhere inside, so the
 * border drawn around the set can follow the control the user is in.
 *
 * `role="group"` by default. `region` puts it in the page's landmarks, for a
 * group important enough to be jumped to; `presentation` is for one that is
 * only drawn and means nothing to a screen reader.
 */

import { cells, type Accessor, type Child } from "@barqjs/core";
import { mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { focusRing } from "./focus.ts";
import { hover, type HoverEvent } from "./interactions/hover.ts";
import {
  access,
  type DOMProps,
  filterDOMProps,
  fromProps,
  type MaybeAccessor,
  mergeProps,
  type StyleProps,
  styleProps,
} from "./utils.ts";

export type GroupRole = "group" | "region" | "presentation";

export interface GroupOptions {
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isInvalid?: MaybeAccessor<boolean | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  /** @default "group" */
  role?: MaybeAccessor<GroupRole | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  "aria-describedby"?: MaybeAccessor<string | undefined>;
  "aria-details"?: MaybeAccessor<string | undefined>;
  /** Read as `isDisabled` when that is not given, as a caller writing ARIA directly expects. */
  "aria-disabled"?: MaybeAccessor<boolean | "true" | "false" | undefined>;
  /** Read as `isInvalid` when that is not given. */
  "aria-invalid"?: MaybeAccessor<boolean | "true" | "false" | undefined>;
  onHoverStart?: (event: HoverEvent) => void;
  onHoverEnd?: (event: HoverEvent) => void;
  onHoverChange?: (isHovered: boolean) => void;
}

export interface GroupResult {
  groupProps: DOMProps;
  isHovered: Accessor<boolean>;
  /** Whether focus is anywhere inside. */
  isFocusWithin: Accessor<boolean>;
  /** Whether focus inside arrived by keyboard. */
  isFocusVisible: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
  isInvalid: Accessor<boolean>;
  isReadOnly: Accessor<boolean>;
}

function isTrue(value: boolean | "true" | "false" | undefined): boolean {
  return value === true || value === "true";
}

export function group(options: GroupOptions = {}): GroupResult {
  const isDisabled = (): boolean =>
    access(options.isDisabled) ?? isTrue(access(options["aria-disabled"]));
  const isInvalid = (): boolean =>
    access(options.isInvalid) ?? isTrue(access(options["aria-invalid"]));
  const isReadOnly = (): boolean => access(options.isReadOnly) === true;

  const { hoverProps, isHovered } = hover({
    isDisabled,
    onHoverStart: options.onHoverStart,
    onHoverEnd: options.onHoverEnd,
    onHoverChange: options.onHoverChange,
  });
  const { focusProps, isFocused, isFocusVisible } = focusRing({ within: true });

  return {
    isHovered,
    isFocusWithin: isFocused,
    isFocusVisible,
    isDisabled,
    isInvalid,
    isReadOnly,
    groupProps: mergeProps(filterDOMProps(options, { labelable: true }), hoverProps, focusProps, {
      role: () => access(options.role) ?? "group",
      "aria-disabled": () => access(options["aria-disabled"]),
      "aria-invalid": () => access(options["aria-invalid"]),
      "data-hovered": isHovered,
      "data-focus-within": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-disabled": isDisabled,
      "data-invalid": isInvalid,
      "data-readonly": isReadOnly,
    }),
  };
}

export interface GroupComponentProps extends Omit<StyleProps, "role"> {
  children?: Child;
  isDisabled?: boolean;
  isInvalid?: boolean;
  isReadOnly?: boolean;
  /** @default "group" */
  role?: GroupRole;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-details"?: string;
  "aria-disabled"?: boolean | "true" | "false";
  "aria-invalid"?: boolean | "true" | "false";
  ref?: RefTarget<HTMLDivElement>;
  onHoverStart?: (event: HoverEvent) => void;
  onHoverEnd?: (event: HoverEvent) => void;
  onHoverChange?: (isHovered: boolean) => void;
}

/**
 * ```tsx
 * <Group aria-label="Quantity">
 *   <button>-</button>
 *   <input />
 *   <button>+</button>
 * </Group>
 * ```
 */
export function Group(props: GroupComponentProps) {
  const options = fromProps(cells(props));
  const { groupProps } = group(options);

  const elementProps = mergeProps(
    groupProps,
    filterDOMProps(options, { global: true }),
    styleProps(cells(props)),
    { "data-testid": () => props["data-testid"] },
  );

  return (
    <div {...elementProps} ref={mergeRefs(props.ref)}>
      {props.children}
    </div>
  );
}
