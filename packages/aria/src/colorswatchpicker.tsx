/**
 * A colour swatch picker: a set of swatches, one of which is the value.
 *
 * It is a listbox with single selection that cannot be emptied, keyed by each
 * swatch's colour, so everything a listbox does a screen reader already knows
 * how to announce: "vibrant red, 1 of 8, selected". Two choices are its own:
 *
 * - **A swatch is named by its colour.** The option's name is a description a
 *   person would use ("dark vibrant blue"), and typing its first letters finds
 *   it. Naming one by its hex code reads out six characters nobody can picture.
 * - **The swatches are a grid by default.** Left and right step through them in
 *   order, and up and down move to the swatch above or below, measured from
 *   where the swatches are drawn. `layout="stack"` makes it a single column.
 *
 * The value is a colour, not a key: a value that matches no swatch selects
 * nothing, and choosing a swatch reports the colour it was given.
 */

import {
  cells,
  type Accessor,
  type Child,
  createContext,
  createMemo,
  getContext,
  isBlock,
  omit,
  onCleanup,
  provide,
  untrack,
} from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { listState, type Key } from "./collections.ts";
import { type Color, defaultColor, parseColor } from "./color.ts";
import { collator, useLocale } from "./i18n.ts";
import { listBox, ListBoxProvider, Option, type ListBoxContextValue } from "./listbox.tsx";
import { ListKeyboardDelegate } from "./selection.ts";
import { staticAccessors, staticCollection, type StaticEntry } from "./static-collection.ts";
import {
  controllable,
  filterDOMProps,
  fromProps,
  mergeProps,
  type StyleProps,
  styleProps,
} from "./utils.ts";

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function asColor(value: Color | string | null | undefined): Color | undefined {
  if (value === null || value === undefined) return undefined;
  return typeof value === "string" ? parseColor(value) : value;
}

/** The key a swatch is selected by. */
function keyOf(color: Color): string {
  return color.toString("hexa");
}

interface PickerValue {
  /** Every swatch's colour, by its key, so a selected key becomes a colour again. */
  colors: Map<string, Color>;
}

const PickerContext = createContext<PickerValue | null>(null);
const SwatchColorContext = createContext<Accessor<Color> | null>(null);

/** The colour of the swatch being built, for a swatch element of the caller's own. */
export function useColorSwatchPickerItem(): Accessor<Color> | null {
  return getContext(SwatchColorContext) ?? null;
}

export type ColorSwatchPickerLayout = "grid" | "stack";

export interface ColorSwatchPickerComponentProps extends StyleProps {
  /** The {@link ColorSwatchPickerItem}s. */
  children?: Child;
  value?: Color | string;
  defaultValue?: Color | string;
  /** @default "grid" */
  layout?: ColorSwatchPickerLayout;
  /** @default "Color swatches", unless `aria-labelledby` names it */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  ref?: RefTarget<HTMLUListElement>;
  onChange?: (value: Color) => void;
}

/**
 * ```tsx
 * <ColorSwatchPicker defaultValue="#f00" onChange={(colour) => brand.set(colour)}>
 *   <ColorSwatchPickerItem color="#f00">{(colour) => <ColorSwatch color={colour} />}</ColorSwatchPickerItem>
 *   <ColorSwatchPickerItem color="#0f0">{(colour) => <ColorSwatch color={colour} />}</ColorSwatchPickerItem>
 * </ColorSwatchPicker>
 * ```
 */
export function ColorSwatchPicker(props: ColorSwatchPickerComponentProps) {
  const domRef = makeRef<HTMLUListElement>();
  const rendered = staticCollection();
  const colors = new Map<string, Color>();
  const locale = useLocale();
  const search = collator({ usage: "search", sensitivity: "base" });

  const [value, setValue] = controllable<Color>(
    () => asColor(props.value),
    () => asColor(props.defaultValue) ?? defaultColor(),
    (next) => props.onChange?.(next),
  );

  const state = listState<StaticEntry>({
    items: rendered.entries,
    ...staticAccessors,
    selectionMode: "single",
    disallowEmptySelection: true,
    selectedKeys: () => [keyOf(value())],
    onSelectionChange: (keys) => {
      if (keys === "all") return;
      const [key] = keys;
      const chosen = key === undefined ? undefined : colors.get(String(key));
      if (chosen !== undefined) setValue(chosen);
    },
  });

  const delegate = new ListKeyboardDelegate({
    collection: state.collection,
    ref: domRef,
    disabledKeys: state.disabledKeys,
    disabledBehavior: () => state.selectionManager().disabledBehavior,
    collator: search,
    layout: untrack(() => props.layout) === "stack" ? "stack" : "grid",
    orientation: "vertical",
    direction: () => locale().direction,
  });

  const { listBoxProps, baseId } = listBox(
    {
      ref: domRef,
      keyboardDelegate: delegate,
      disallowEmptySelection: true,
      "aria-label": () =>
        props["aria-label"] ??
        (props["aria-labelledby"] === undefined ? "Color swatches" : undefined),
      "aria-labelledby": () => props["aria-labelledby"],
      "aria-describedby": () => props["aria-describedby"],
    },
    state,
  );

  const list: ListBoxContextValue = {
    state,
    baseId,
    shouldSelectOnPressUp: () => undefined,
    shouldUseVirtualFocus: () => undefined,
    staticItems: rendered,
  };
  const picker: PickerValue = { colors };

  const elementProps = mergeProps(
    listBoxProps,
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      "data-layout": () => props.layout ?? "grid",
      "data-empty": () => state.collection().size === 0,
      "data-testid": () => props["data-testid"],
    },
  );

  return (
    <ul {...elementProps} ref={mergeRefs(domRef.set, props.ref)}>
      <ListBoxProvider value={list}>
        {provide(
          PickerContext,
          () => picker,
          () => props.children,
        )}
      </ListBoxProvider>
    </ul>
  );
}

type SwatchRender = (color: Color) => Child;

/** The callback among the children, when they are one. */
function swatchRender(children: unknown): SwatchRender | null {
  if (typeof children !== "function") return null;
  if (children.length > 0) return children as SwatchRender;
  if (isBlock(children)) return null;
  const inner: unknown = (children as () => unknown)();
  return typeof inner === "function" && inner.length > 0 ? (inner as SwatchRender) : null;
}

export interface ColorSwatchPickerItemComponentProps extends StyleProps {
  color: Color | string;
  /** What is drawn: a `<ColorSwatch>`, or a function given the colour that returns one. */
  children?: Child | SwatchRender;
  isDisabled?: boolean;
  /** @default the colour's name */
  "aria-label"?: string;
  ref?: RefTarget<HTMLLIElement>;
}

/** One swatch. Its key is its colour as first given, as an option's `value` is. */
export function ColorSwatchPickerItem(props: ColorSwatchPickerItemComponentProps) {
  const picker = getContext(PickerContext);
  if (picker === null || picker === undefined) {
    throw new Error("A ColorSwatchPickerItem must be rendered inside a ColorSwatchPicker.");
  }
  const color = createMemo(() => asColor(props.color) ?? parseColor("#0000"));
  const key: Key = untrack(() => keyOf(color()));
  const held = untrack(color);
  picker.colors.set(key, held);
  onCleanup(() => {
    if (picker.colors.get(key) === held) picker.colors.delete(key);
  });

  const locale = useLocale();
  const render = swatchRender(cells(props).children);
  function name(): string {
    return color().getColorName(locale().locale);
  }

  return (
    <Option
      {...omit(props, "color", "children", "isDisabled", "aria-label", "ref")}
      value={key}
      textValue={name()}
      aria-label={props["aria-label"] ?? name()}
      isDisabled={props.isDisabled}
      ref={mergeRefs(props.ref)}
    >
      {provide(
        SwatchColorContext,
        () => color,
        () => (render === null ? props.children : render(color())),
      )}
    </Option>
  );
}
