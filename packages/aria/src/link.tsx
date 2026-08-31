/**
 * Links, and the separators, progress bars and meters that need no state.
 *
 * A link is a press away from a button, and the difference is what the two
 * mean: a link goes somewhere, a button does something. Assistive technology
 * reports them differently, and Enter activates a link where Enter and Space
 * both activate a button — which is why the press hook has to know which it is
 * looking at rather than treating every activation the same.
 */

import { type Accessor, type Child, type Incoming } from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { focusRing } from "./focus.ts";
import { focusable, type FocusableOptions } from "./interactions/focusable.ts";
import { hover } from "./interactions/hover.ts";
import { handleLinkClick, syntheticLinkProps } from "./interactions/open-link.ts";
import { press, type ElementRef, type PressEvent } from "./interactions/press.ts";
import { label as labelHook } from "./label.ts";
import { numberFormatter } from "./i18n.ts";
import {
  access,
  clamp,
  type DOMProps,
  filterDOMProps,
  fromProps,
  type MaybeAccessor,
  mergeProps,
  type StyleProps,
  styleProps,
} from "./utils.ts";

export interface LinkOptions extends FocusableOptions {
  isDisabled?: MaybeAccessor<boolean | undefined>;
  /** @default "a" */
  elementType?: MaybeAccessor<string | undefined>;
  href?: MaybeAccessor<string | undefined>;
  target?: MaybeAccessor<string | undefined>;
  rel?: MaybeAccessor<string | undefined>;
  download?: MaybeAccessor<boolean | string | undefined>;
  ping?: MaybeAccessor<string | undefined>;
  referrerPolicy?: MaybeAccessor<string | undefined>;
  "aria-current"?: MaybeAccessor<boolean | string | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  "aria-describedby"?: MaybeAccessor<string | undefined>;
  onPress?: (event: PressEvent) => void;
  onPressStart?: (event: PressEvent) => void;
  onPressEnd?: (event: PressEvent) => void;
  onPressChange?: (isPressed: boolean) => void;
  onClick?: (event: MouseEvent) => void;
}

export interface LinkResult {
  linkProps: DOMProps;
  isPressed: Accessor<boolean>;
}

export function link(options: LinkOptions, ref?: ElementRef): LinkResult {
  const elementType = (): string => access(options.elementType) ?? "a";
  const isDisabled = (): boolean => access(options.isDisabled) === true;

  const { pressProps, isPressed } = press({ ...options, ref });
  const { focusableProps } = focusable(options, ref);

  const roleProps: DOMProps = {
    // Anything that is not an `<a href>` has to say what it is, and be
    // reachable by Tab, which a `<span>` is not.
    role: () => (elementType() === "a" ? undefined : "link"),
    tabIndex: () => (elementType() === "a" || isDisabled() ? undefined : 0),
  };

  return {
    isPressed,
    linkProps: mergeProps(
      filterDOMProps(options, { labelable: true, isLink: true }),
      // The `data-href` shape, so a non-anchor element can still be opened by
      // the router or by a middle click.
      elementType() === "a" ? {} : syntheticLinkProps(options as never),
      focusableProps,
      pressProps,
      roleProps,
      {
        // A disabled link must not navigate, and `<a>` has no `disabled`.
        href: () => (isDisabled() ? undefined : access(options.href)),
        "aria-disabled": () => isDisabled() || undefined,
        "aria-current": () => access(options["aria-current"]),
        onClick: (event: MouseEvent) => {
          handleLinkClick(event, access(options.href));
        },
      },
    ),
  };
}

// ---------------------------------------------------------------------------
// Separator
// ---------------------------------------------------------------------------

export interface SeparatorOptions {
  /** @default "horizontal" */
  orientation?: MaybeAccessor<"horizontal" | "vertical" | undefined>;
  /** @default "hr" */
  elementType?: MaybeAccessor<string | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
}

/**
 * A divider between groups of content.
 *
 * `<hr>` already has the role and a horizontal orientation, so nothing is
 * written for it. Anything else needs both — and `aria-orientation` only when
 * it is vertical, since horizontal is the role's default.
 */
export function separator(options: SeparatorOptions): { separatorProps: DOMProps } {
  const domProps = filterDOMProps(options, { labelable: true });

  if ((access(options.elementType) ?? "hr") === "hr") return { separatorProps: domProps };

  return {
    separatorProps: mergeProps(domProps, {
      role: "separator",
      "aria-orientation": () =>
        access(options.orientation) === "vertical" ? "vertical" : undefined,
    }),
  };
}

// ---------------------------------------------------------------------------
// Progress and meter
// ---------------------------------------------------------------------------

export interface ProgressBarOptions {
  /** @default 0 */
  value?: MaybeAccessor<number | undefined>;
  /** @default 0 */
  minValue?: MaybeAccessor<number | undefined>;
  /** @default 100 */
  maxValue?: MaybeAccessor<number | undefined>;
  /** Progress that is happening but cannot be measured. */
  isIndeterminate?: MaybeAccessor<boolean | undefined>;
  /** What to say instead of the formatted percentage, e.g. "1 of 4". */
  valueLabel?: MaybeAccessor<string | undefined>;
  /** @default { style: "percent" } */
  formatOptions?: Intl.NumberFormatOptions;
  label?: MaybeAccessor<unknown>;
  id?: MaybeAccessor<string | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
}

export interface ProgressBarResult {
  progressBarProps: DOMProps;
  labelProps: DOMProps;
  /** What a screen reader will read for the value. */
  valueText: Accessor<string | undefined>;
  percentage: Accessor<number>;
}

/**
 * A progress bar.
 *
 * `aria-valuetext` is what a screen reader actually reads; `aria-valuenow`
 * alone is announced as a bare number with no unit, which for a percentage is
 * wrong in most locales. An indeterminate bar has neither: a value it does not
 * know is worse than no value.
 */
export function progressBar(options: ProgressBarOptions): ProgressBarResult {
  const formatOptions = options.formatOptions ?? { style: "percent" as const };
  const format = numberFormatter(formatOptions);

  const { labelProps, fieldProps } = labelHook({
    ...options,
    // A progressbar is not a labelable element.
    labelElementType: "span",
  });

  const min = (): number => access(options.minValue) ?? 0;
  const max = (): number => access(options.maxValue) ?? 100;
  const value = (): number => clamp(access(options.value) ?? 0, min(), max());
  const isIndeterminate = (): boolean => access(options.isIndeterminate) === true;

  const percentage = (): number => {
    const range = max() - min();
    return range === 0 ? 0 : (value() - min()) / range;
  };

  const valueText = (): string | undefined => {
    if (isIndeterminate()) return undefined;
    const given = access(options.valueLabel);
    if (given !== undefined) return given;
    return format().format(formatOptions.style === "percent" ? percentage() : value());
  };

  return {
    percentage,
    valueText,
    labelProps,
    progressBarProps: mergeProps(filterDOMProps(options, { labelable: true }), fieldProps, {
      role: "progressbar",
      "aria-valuenow": () => (isIndeterminate() ? undefined : value()),
      "aria-valuemin": min,
      "aria-valuemax": max,
      "aria-valuetext": valueText,
    }),
  };
}

/**
 * A meter: a quantity within a known range, not progress towards completion.
 *
 * `role="meter progressbar"` is a fallback list, and the reason is browser
 * support: Chrome degrades from `meter` on its own, Firefox does not implement
 * it at all, and `progressbar` is what those two announce instead.
 */
export function meter(options: Omit<ProgressBarOptions, "isIndeterminate">): ProgressBarResult {
  const result = progressBar(options);
  return {
    ...result,
    progressBarProps: mergeProps(result.progressBarProps, { role: "meter progressbar" }),
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export interface LinkComponentProps extends StyleProps {
  children?: Child;
  href?: string;
  target?: string;
  rel?: string;
  download?: boolean | string;
  isDisabled?: boolean;
  autoFocus?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-current"?: boolean | string;
  ref?: RefTarget<HTMLAnchorElement>;
  onPress?: (event: PressEvent) => void;
  onClick?: (event: MouseEvent) => void;
}

/**
 * ```tsx
 * <Link href="/about">About</Link>
 * ```
 */
export function Link(props: Incoming<LinkComponentProps>) {
  const domRef = makeRef<HTMLAnchorElement>();
  const options = fromProps(props);

  const { linkProps, isPressed } = link(options, domRef);
  const { hoverProps, isHovered } = hover({ isDisabled: options.isDisabled });
  const { focusProps, isFocused, isFocusVisible } = focusRing();

  const elementProps = mergeProps(
    linkProps,
    hoverProps,
    focusProps,
    filterDOMProps(options, { global: true }),
    styleProps(props),
    {
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-disabled": () => props.isDisabled?.() === true,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <a {...elementProps} ref={mergeRefs(domRef.set, props.ref?.())}>
      {props.children}
    </a>
  );
}

export interface SeparatorComponentProps extends StyleProps {
  orientation?: "horizontal" | "vertical";
  "aria-label"?: string;
}

export function Separator(props: Incoming<SeparatorComponentProps>) {
  const options = fromProps(props);
  const { separatorProps } = separator({ ...(options as SeparatorOptions), elementType: "hr" });

  const elementProps = mergeProps(
    separatorProps,
    filterDOMProps(options, { global: true }),
    styleProps(props),
    {
      "data-orientation": () => props.orientation?.() ?? "horizontal",
      "aria-orientation": () => (props.orientation?.() === "vertical" ? "vertical" : undefined),
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return <hr {...elementProps} />;
}

export interface ProgressBarComponentProps extends StyleProps {
  children?: Child;
  label?: Child;
  value?: number;
  minValue?: number;
  maxValue?: number;
  isIndeterminate?: boolean;
  valueLabel?: string;
  formatOptions?: Intl.NumberFormatOptions;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/**
 * ```tsx
 * <ProgressBar label="Uploading" value={progress()} />
 * ```
 *
 * The bar itself is the caller's: `data-percentage` carries the fraction so a
 * stylesheet can size a child without a `style` attribute.
 */
export function ProgressBar(props: Incoming<ProgressBarComponentProps>) {
  const options = fromProps(props);
  const { progressBarProps, labelProps, percentage, valueText } = progressBar(
    options as ProgressBarOptions,
  );

  const elementProps = mergeProps(
    progressBarProps,
    filterDOMProps(options, { global: true }),
    styleProps(props),
    {
      "data-indeterminate": () => props.isIndeterminate?.() === true,
      "data-percentage": () => (props.isIndeterminate?.() === true ? undefined : percentage()),
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <div {...elementProps}>
      <span {...labelProps}>{props.label}</span>
      {props.children}
      <span aria-hidden="true">{valueText}</span>
    </div>
  );
}

export interface MeterComponentProps extends Omit<ProgressBarComponentProps, "isIndeterminate"> {}

export function Meter(props: Incoming<MeterComponentProps>) {
  const options = fromProps(props);
  const { progressBarProps, labelProps, percentage, valueText } = meter(
    options as ProgressBarOptions,
  );

  const elementProps = mergeProps(
    progressBarProps,
    filterDOMProps(options, { global: true }),
    styleProps(props),
    {
      "data-percentage": percentage,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <div {...elementProps}>
      <span {...labelProps}>{props.label}</span>
      {props.children}
      <span aria-hidden="true">{valueText}</span>
    </div>
  );
}
