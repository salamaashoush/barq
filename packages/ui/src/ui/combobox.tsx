import type { Key } from "@barqjs/aria/collections";
import { Section } from "@barqjs/aria/listbox";
import {
  ComboboxChip as AriaComboboxChip,
  ComboboxChipRemove as AriaComboboxChipRemove,
  ComboboxChips as AriaComboboxChips,
  ComboboxClear as AriaComboboxClear,
  ComboboxCollection as AriaComboboxCollection,
  ComboboxEmpty as AriaComboboxEmpty,
  ComboboxGroup as AriaComboboxGroup,
  ComboboxGroupLabel as AriaComboboxGroupLabel,
  ComboboxInput as AriaComboboxInput,
  ComboboxItem as AriaComboboxItem,
  ComboboxList as AriaComboboxList,
  ComboboxPopup as AriaComboboxPopup,
  ComboboxRoot as AriaComboboxRoot,
  ComboboxTrigger as AriaComboboxTrigger,
  ComboboxValue as AriaComboboxValue,
  useComboboxChip,
  useComboboxItem,
  useComboboxRoot,
  type ComboboxAnchor,
  type ComboboxRootProps,
  type ComboboxValueProps,
  type FilterFn,
} from "@barqjs/aria/combobox";
import type { Align, Side } from "@barqjs/aria/overlays";
import {
  For,
  isBlock,
  Show,
  createSignal,
  type Child,
  type Incoming,
  type JSXElement,
} from "@barqjs/core";
import { firstThatWorks, layer } from "@barqjs/css";
import type { RefTarget } from "@barqjs/primitives/refs";

import { Check } from "@barqjs/lucide/icons/check";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { ChevronsUpDown } from "@barqjs/lucide/icons/chevrons-up-down";
import { X } from "@barqjs/lucide/icons/x";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { icon } from "../lib/shared-icon.ts";
import { when } from "../lib/shared-when.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { Button, type ButtonProps } from "./button.tsx";
import { Command, CommandItem } from "./command.tsx";
import { InputGroup, InputGroupAddon, InputGroupButton } from "./input-group.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.tsx";
import { srOnly } from "./sr-only.ts";

const ui = layer("barq.ui");

const trigger = ui({
  width: "100%",
  justifyContent: "space-between",
  "--ui-font-weight": "var(--font-weight-normal)",
  fontWeight: "var(--font-weight-normal)",
});

/**
 * The TRIGGER's width, published by `overlayPosition`.
 *
 * shadcn asks for `w-[200px]` on both halves and leaves matching them to you.
 * `width: 100%` cannot do it: the popover is portalled, so 100% resolves
 * against the body and the list came out as wide as the page.
 */
const content = ui("group/combobox-content", {
  position: "relative",
  maxHeight: "var(--barq-available-height)",
  width: "var(--barq-trigger-width, auto)",
  maxWidth: "var(--barq-available-width)",
  minWidth: "calc(var(--barq-trigger-width) + calc(var(--spacing) * 7))",
  overflow: "hidden",
  padding: "0px",
  // A chips box is already as wide as its content, so the list matches it
  // exactly rather than reserving room for a tick column.
  '[data-chips="true"]': {
    minWidth: "var(--barq-trigger-width)",
  },
  // The search row is an input group inside the panel, inset by a spacing unit
  // and flush with the list below it.
  ':is(& > *)[data-slot="input-group"]': {
    margin: "var(--spacing)",
    marginBottom: "0px",
    height: "calc(var(--spacing) * 8)",
    borderColor: "var(--input)",
    backgroundColor: "var(--input)",
    "--ui-shadow": "0 0 #0000",
    "@supports (color: color-mix(in lab, red, red))": {
      borderColor: "color-mix(in oklab, var(--input) 30%, transparent)",
      backgroundColor: "color-mix(in oklab, var(--input) 30%, transparent)",
    },
  },
});

const item = ui(
  text.sm,
  box.outline,
  box.noSelect,
  box.forcedColors,
  when.focused,
  when.disabled,
  icon.plain,
  icon.sized,
  {
    position: "relative",
    display: "flex",
    width: "100%",
    cursor: "default",
    alignItems: "center",
    gap: "calc(var(--spacing) * 2)",
    borderRadius: "calc(var(--radius) * 0.6)",
    paddingBlock: "calc(var(--spacing) * 1.5)",
    paddingInlineEnd: "calc(var(--spacing) * 8)",
    paddingInlineStart: "calc(var(--spacing) * 2)",
    // Upstream's name for the highlight, beside `data-focused`, which is what
    // `@barqjs/aria` calls the same thing.
    "[data-highlighted]": {
      backgroundColor: "var(--accent)",
      color: "var(--accent-foreground)",
    },
  },
);

const indicator = ui({
  pointerEvents: "none",
  position: "absolute",
  insetInlineEnd: "calc(var(--spacing) * 2)",
  display: "flex",
  width: "calc(var(--spacing) * 4)",
  height: "calc(var(--spacing) * 4)",
  alignItems: "center",
  justifyContent: "center",
});

const chevron = ui({
  opacity: "50%",
});

/**
 * The BOX, when the combobox holds several values.
 *
 * It looks like an input and is a `<div>`, because the chips inside carry
 * remove buttons and a button inside a button is markup no browser renders and
 * no screen reader can describe. The focus ring is `:focus-within`, so the box
 * lights up for whichever control inside took focus.
 */
const chips = ui(text.sm, {
  display: "flex",
  minHeight: "calc(var(--spacing) * 8)",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "var(--spacing)",
  borderRadius: "var(--radius)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  borderColor: "var(--input)",
  backgroundColor: "transparent",
  backgroundClip: "padding-box",
  paddingInline: "calc(var(--spacing) * 2.5)",
  paddingBlock: "var(--spacing)",
  transitionProperty:
    "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --ui-gradient-from, --ui-gradient-via, --ui-gradient-to",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  ".dark &": {
    backgroundColor: "var(--input)",
    "@supports (color: color-mix(in lab, red, red))": {
      backgroundColor: "color-mix(in oklab, var(--input) 30%, transparent)",
    },
  },
  // A chip carries its own padding, so the box stops adding a second one.
  '&:has([data-slot="combobox-chip"])': {
    paddingInline: "var(--spacing)",
  },
  ":focus-within": {
    borderColor: "var(--ring)",
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    "--ui-ring-color": "var(--ring)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--ring) 50%, transparent)",
    },
  },
  '&:has([aria-invalid="true"])': {
    borderColor: "var(--destructive)",
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    "--ui-ring-color": "var(--destructive)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--destructive) 20%, transparent)",
    },
  },
  '.dark &:has([aria-invalid="true"])': {
    borderColor: "var(--destructive)",
    "--ui-ring-color": "var(--destructive)",
    "@supports (color: color-mix(in lab, red, red))": {
      borderColor: "color-mix(in oklab, var(--destructive) 50%, transparent)",
      "--ui-ring-color": "color-mix(in oklab, var(--destructive) 40%, transparent)",
    },
  },
});

const chip = ui(text.medium, {
  display: "flex",
  height: "calc(calc(var(--spacing) * 5.25))",
  width: "fit-content",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--spacing)",
  borderRadius: "calc(var(--radius) * 0.6)",
  backgroundColor: "var(--muted)",
  paddingInline: "calc(var(--spacing) * 1.5)",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  whiteSpace: "nowrap",
  color: "var(--foreground)",
  "&:has(:disabled)": {
    pointerEvents: "none",
    cursor: "not-allowed",
    opacity: "50%",
  },
  '&:has([data-slot="combobox-chip-remove"])': {
    paddingInlineEnd: "0px",
  },
  // The chip the arrows are on, which is the one Backspace takes off.
  "[data-highlighted]": {
    outlineStyle: "solid",
    outlineWidth: "2px",
    outlineColor: "var(--ring)",
  },
});

const chipRemove = ui({
  marginInlineStart: "calc(var(--spacing) * -1)",
  opacity: "50%",
  "@media (hover: hover)": {
    ":hover": { opacity: "100%" },
  },
});

const groupLabel = ui(text.medium, {
  paddingInline: "calc(var(--spacing) * 2)",
  paddingBlock: "calc(var(--spacing) * 1.5)",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  color: "var(--muted-foreground)",
});

const groupSeparator = ui({
  marginInline: "calc(var(--spacing) * -1)",
  marginBlock: "var(--spacing)",
  height: "1px",
  backgroundColor: "var(--border)",
});

/** The button that opens the list, when the box is a row of chips. */
const chipsTrigger = ui({
  "--ui-font-weight": "var(--font-weight-normal)",
  fontWeight: "var(--font-weight-normal)",
  height: "auto",
  flex: "1",
  justifyContent: "space-between",
  borderStyle: "none",
  backgroundColor: "transparent",
  paddingInline: "0px",
  boxShadow: "none",
  minWidth: "calc(var(--spacing) * 16)",
});

/**
 * A heading over a run of options.
 *
 * Give the combobox `getChildren` and each group arrives at the children
 * callback as its own value; return one of these for it. The options under it
 * are built by the same callback, so the two cannot disagree about what an
 * option looks like.
 */
export function ComboboxLabel(props: Incoming<Omit<UiProps, "title"> & { title?: Child }>) {
  // Written inside a `<ComboboxGroup>` it has no `title`: it IS the heading,
  // and the group around it is somebody else's element.
  if (props.title === undefined) {
    const { title: _title, ...rest } = props;
    return (
      <AriaComboboxGroupLabel
        {...rest}
        data-slot={props["data-slot"]?.() ?? "combobox-label"}
        class={ui(groupLabel, props.class?.(), props.className?.())}
      />
    );
  }

  return (
    <Section
      {...props}
      data-slot={props["data-slot"]?.() ?? "combobox-group"}
      titleSlot="combobox-label"
      titleClass={groupLabel}
    />
  );
}

/** A rule between two runs of options. */
export function ComboboxSeparator(props: Incoming<UiProps>) {
  return <li {...uiProps("combobox-separator", groupSeparator, props)} role="separator" />;
}

export interface ComboboxProps<T> extends UiProps {
  /** Everything that can be chosen, before the typed text narrows it. */
  items: Iterable<T>;
  /**
   * What is inside a group, for a list with headings.
   *
   * A value that answers with a list is a SECTION and arrives at the children
   * callback as one; return a `<ComboboxLabel>` for it.
   */
  getChildren?: (item: T) => Iterable<T> | undefined;
  /**
   * How one value renders inside its option. Defaults to its `label`.
   *
   * It has to return JSX. A children callback whose body builds none of its own
   * is wrapped as a Cell by the compiler rather than given a scope parameter,
   * so `{(entry) => entry.name}` arrives as something that takes no item at
   * all. That is what `label` is for.
   */
  children?: (item: T) => Child;
  /** What the closed trigger shows when nothing is chosen. */
  placeholder?: string;
  /** How to search. @default a locale-aware `contains` */
  filterBy?: FilterFn;
  searchPlaceholder?: string;
  /** Shown when the text matches nothing. */
  empty?: Child;
  value?: Key | null;
  defaultValue?: Key | null;
  /**
   * Several values rather than one, shown as chips.
   *
   * The list stays open while picking, because choosing four things and having
   * the list close four times is four reopenings nobody asked for.
   */
  multiple?: boolean;
  values?: readonly Key[];
  defaultValues?: readonly Key[];
  onValuesChange?: (keys: readonly Key[]) => void;
  /** @default "Remove" */
  removeLabel?: string;
  isDisabled?: boolean;
  "aria-label"?: string;
  /** How a chosen value reads on the closed trigger. @default its key */
  label?: (item: T) => string;
  onChange?: (key: Key | null) => void;
}

/**
 * ```tsx
 * <Combobox items={FRAMEWORKS} placeholder="Select a framework" onChange={pick}>
 *   {(entry) => entry.name}
 * </Combobox>
 * ```
 *
 * A button that opens a `<Command>` in a `<Popover>`, which is what shadcn's
 * combobox has always been: a search over a list, rather than a `<select>` with
 * a text box glued to it. The chosen value is shown on the trigger and ticked
 * in the list.
 */
function ComboboxPicker<T>(props: Incoming<ComboboxProps<T>>) {
  const [inner, setInner] = createSignal<Key | null>(props.defaultValue?.() ?? null);
  const chosen = (): Key | null => props.value?.() ?? inner();
  const [innerMany, setInnerMany] = createSignal<readonly Key[]>(props.defaultValues?.() ?? []);
  const many = (): readonly Key[] => props.values?.() ?? innerMany();
  const multiple = (): boolean => props.multiple?.() === true;
  const [open, setOpen] = createSignal(false);

  const keyOf = (entry: T): Key => (entry as { id: Key }).id;
  const textOf = (entry: T): string => props.label?.()?.(entry) ?? String(keyOf(entry));

  const shown = (): string => {
    const key = chosen();
    if (key === null) return props.placeholder?.() ?? "Select…";
    for (const entry of props.items()) if (keyOf(entry) === key) return textOf(entry);
    return String(key);
  };

  const itemFor = (key: Key): T | undefined => {
    for (const entry of props.items()) if (keyOf(entry) === key) return entry;
    return undefined;
  };

  const setMany = (next: readonly Key[]): void => {
    if (props.values?.() === undefined) setInnerMany(next);
    props.onValuesChange?.()?.(next);
  };

  const remove = (key: Key): void => setMany(many().filter((each) => each !== key));

  const isPicked = (key: Key): boolean => (multiple() ? many().includes(key) : key === chosen());

  /**
   * Both shapes the compiler produces for a children callback.
   *
   * One whose body builds no JSX of its own — `{(entry) => entry.name}` — is a
   * Cell, and calling it yields the callback. One that builds an element is a
   * BLOCK, which takes its scope as the first argument and throws when called
   * with none. Reading only the first crashed the moment anyone grouped their
   * options, because a group's callback has to return an element.
   */
  const render = ((): ((item: T) => Child) | undefined => {
    const given = props.children as unknown;
    if (given === undefined || given === null) return undefined;
    if (isBlock(given)) return given as (item: T) => Child;
    return (given as () => (item: T) => Child)();
  })();

  const label = (entry: T): Child => (render === undefined ? textOf(entry) : render(entry));

  return (
    <Popover isOpen={open()} onOpenChange={(next: boolean) => setOpen(next)}>
      <Show when={multiple()}>
        <div data-slot="combobox-chips" class={ui(chips, props.class?.(), props.className?.())}>
          <For each={many}>
            {(key: Key) => (
              <span data-slot="combobox-chip" class={chip}>
                {(() => {
                  const entry = itemFor(key);
                  return entry === undefined ? String(key) : label(entry);
                })()}
                <Button
                  data-slot="combobox-chip-remove"
                  variant="ghost"
                  size="icon-xs"
                  class={chipRemove}
                  isDisabled={props.isDisabled?.()}
                  onPress={() => remove(key)}
                >
                  <X />
                  <span
                    class={srOnly}
                  >{`${props.removeLabel?.() ?? "Remove"} ${String(key)}`}</span>
                </Button>
              </span>
            )}
          </For>
          <PopoverTrigger>
            <Button
              variant="ghost"
              size="sm"
              aria-label={props["aria-label"]?.()}
              isDisabled={props.isDisabled?.()}
              data-slot="combobox-trigger"
              class={chipsTrigger}
            >
              {many().length === 0 ? (props.placeholder?.() ?? "Select…") : ""}
              <ChevronsUpDown class={chevron} aria-hidden="true" />
            </Button>
          </PopoverTrigger>
        </div>
      </Show>
      <Show when={!multiple()}>
        <PopoverTrigger>
          {/* No `role="combobox"` on the trigger. shadcn puts one here AND on
            cmdk's input inside, which is two comboboxes for one control; the
            input is the combobox, and `<PopoverTrigger>` gives this button the
            `aria-haspopup` and `aria-expanded` that say what it opens. */}
          <Button
            variant="outline"
            aria-label={props["aria-label"]?.()}
            isDisabled={props.isDisabled?.()}
            data-slot="combobox-trigger"
            class={ui(trigger, props.class?.(), props.className?.())}
          >
            {shown()}
            <ChevronsUpDown class={chevron} aria-hidden="true" />
          </Button>
        </PopoverTrigger>
      </Show>
      <PopoverContent data-slot="combobox-content" class={content}>
        <Command
          items={props.items()}
          getChildren={props.getChildren?.()}
          placeholder={props.searchPlaceholder?.() ?? "Search…"}
          empty={props.empty?.()}
          emptySlot="combobox-empty"
          listSlot="combobox-list"
          filterBy={props.filterBy?.()}
          aria-label={props["aria-label"]?.()}
          onAction={(key) => {
            if (multiple()) {
              const held = many();
              // Toggling, and the list STAYS OPEN: choosing four things and
              // having it close four times is four reopenings nobody asked for.
              setMany(held.includes(key) ? held.filter((each) => each !== key) : [...held, key]);
              return;
            }
            // Once, before the write: reading `chosen()` again afterwards sees
            // the value just set and reports every choice as a clear.
            const next = key === chosen() ? null : key;
            setInner(next);
            props.onChange?.()?.(next);
            setOpen(false);
          }}
        >
          {(entry: T) =>
            // A SECTION is not an option: what the caller returned for it is
            // the heading and the run under it, and wrapping that in a
            // `<CommandItem>` would make the group itself selectable.
            props.getChildren?.()?.(entry) !== undefined ? (
              label(entry)
            ) : (
              <CommandItem data-slot="combobox-item" class={item}>
                {label(entry)}
                <Show when={isPicked(keyOf(entry))}>
                  <span data-slot="combobox-item-indicator" class={indicator}>
                    <Check />
                  </span>
                </Show>
              </CommandItem>
            )
          }
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The panel's own look, for a combobox written as parts.
 *
 * The one-component form borrows it from `<PopoverContent>`; here the panel is
 * `@barqjs/aria`'s element and has to carry it itself. The slide reads
 * `data-side`, which is the side the panel ENDED UP on after any flip.
 */
const panel = ui(box.shadow, box.outline, box.forcedColors, when.closing, {
  transformOrigin: "var(--barq-transform-origin)",
  animation:
    "enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
  borderRadius: "calc(var(--radius) * 0.8)",
  backgroundColor: "var(--popover)",
  color: "var(--popover-foreground)",
  "--ui-shadow":
    "0 4px 6px -1px var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 2px 4px -2px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
  "--ui-ring-shadow":
    "var(--ui-ring-inset,) 0 0 0 calc(1px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
  "--ui-ring-color": "var(--foreground)",
  "@supports (color: color-mix(in lab, red, red))": {
    "--ui-ring-color": "color-mix(in oklab, var(--foreground) 10%, transparent)",
  },
  "--ui-duration": "100ms",
  transitionDuration: "100ms",
  "--ui-enter-opacity": firstThatWorks("0", "calc(0/100)"),
  "--ui-enter-scale": firstThatWorks("0.95", "calc(95*1%)"),
  '[data-side="bottom"]': {
    "--ui-enter-translate-y": "calc(2*var(--spacing)*-1)",
  },
  '[data-side="left"]': {
    "--ui-enter-translate-x": "calc(2*var(--spacing))",
  },
  '[data-side="right"]': {
    "--ui-enter-translate-x": "calc(2*var(--spacing)*-1)",
  },
  '[data-side="top"]': {
    "--ui-enter-translate-y": "calc(2*var(--spacing))",
  },
});

const list = ui({
  margin: "0px",
  listStyleType: "none",
  maxHeight:
    "min(calc(calc(var(--spacing) * 96) - calc(var(--spacing) * 9)), calc(var(--barq-available-height) - calc(var(--spacing) * 9)))",
  scrollPaddingBlock: "var(--spacing)",
  overflowY: "auto",
  overscrollBehavior: "contain",
  padding: "var(--spacing)",
  "[data-empty]": {
    padding: "0px",
  },
});

/**
 * Two elements, because a `<li>` cannot hold another: the outer one is this
 * class and the inner `<ul>` is the group, which lays nothing out.
 */
const group = ui({
  "& > ul": {
    margin: "0px",
    listStyleType: "none",
    padding: "0px",
  },
  // Every option in it has been filtered away, and a heading over nothing is
  // noise.
  "[data-empty]": {
    display: "none",
  },
});

const empty = ui(text.sm, {
  display: "none",
  width: "100%",
  justifyContent: "center",
  paddingBlock: "calc(var(--spacing) * 2)",
  textAlign: "center",
  color: "var(--muted-foreground)",
  ":is(:where(.group\\/combobox-content)[data-empty] *)": {
    display: "flex",
  },
});

/** The field inside the input group: the group draws the border and the ring. */
const control = ui(box.outline, {
  flex: "1",
  minWidth: "0px",
  height: "100%",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "0px",
  borderRadius: "0",
  backgroundColor: "transparent",
  paddingInline: "calc(var(--spacing) * 2.5)",
  paddingBlock: "var(--spacing)",
  fontSize: "var(--text-base)",
  lineHeight: "var(--ui-leading, var(--text-base--line-height))",
  "::placeholder": {
    color: "var(--muted-foreground)",
  },
  ":disabled": {
    pointerEvents: "none",
    cursor: "not-allowed",
  },
  "@media (width >= 48rem)": {
    "&": {
      fontSize: "var(--text-sm)",
      lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
    },
  },
});

const inputGroup = ui({
  width: "auto",
});

const chipsInput = ui(box.outline, {
  minWidth: "calc(var(--spacing) * 16)",
  flex: "1",
  borderStyle: "none",
  backgroundColor: "transparent",
  padding: "0px",
  "::placeholder": {
    color: "var(--muted-foreground)",
  },
});

const partTrigger = ui(icon.sized, {
  justifyContent: "space-between",
  "--ui-font-weight": "var(--font-weight-normal)",
  fontWeight: "var(--font-weight-normal)",
});

/**
 * The toggle beside the input. A clear button takes its place rather than
 * sitting next to it, and it does not darken while the list it opened is up.
 */
const inputTrigger = ui(icon.sized, {
  '[data-slot="input-group"]:has([data-slot="combobox-clear"]) &': {
    display: "none",
  },
  "[data-pressed]": {
    backgroundColor: "transparent",
  },
  '[data-state="open"]': {
    backgroundColor: "transparent",
  },
});

const triggerIcon = ui({
  pointerEvents: "none",
  width: "calc(var(--spacing) * 4)",
  height: "calc(var(--spacing) * 4)",
  color: "var(--muted-foreground)",
});

/**
 * Whether these children are parts rather than a callback.
 *
 * Children arrive as a Block either way. Written parts take nothing; a
 * callback that renders one item takes the item.
 */
function isWritten(children: unknown): boolean {
  return typeof children === "function" && isBlock(children) && children.length === 0;
}

/**
 * ```tsx
 * <Combobox items={frameworks} onValueChange={pick}>
 *   <ComboboxInput placeholder="Select a framework" />
 *   <ComboboxContent>
 *     <ComboboxEmpty>No frameworks found.</ComboboxEmpty>
 *     <ComboboxList>
 *       {(item) => <ComboboxItem value={item}>{item}</ComboboxItem>}
 *     </ComboboxList>
 *   </ComboboxContent>
 * </Combobox>
 * ```
 *
 * Two shapes under one name. Given parts as children it is the root they find
 * one another through, and renders nothing itself. Given `items` and a callback
 * (or nothing) it is the whole control: a button that opens a searchable list,
 * which is what this component was before the parts existed.
 */
export function Combobox<T>(props: Incoming<ComboboxProps<T>>): JSXElement;
export function Combobox<V>(props: Incoming<ComboboxRootProps<V>>): JSXElement;
export function Combobox(
  props: Incoming<ComboboxProps<unknown>> | Incoming<ComboboxRootProps<unknown>>,
): JSXElement {
  if (isWritten(props.children)) {
    return <AriaComboboxRoot {...props} />;
  }
  return <ComboboxPicker {...(props as Incoming<ComboboxProps<unknown>>)} />;
}

/** What is chosen: its label, or whatever a callback makes of it. */
export function ComboboxValue(props: Incoming<ComboboxValueProps>) {
  return <AriaComboboxValue {...props} />;
}

export interface ComboboxTriggerProps extends ButtonProps {}

/**
 * The button that opens the list.
 *
 * shadcn writes `<ComboboxTrigger render={<Button variant="outline" />}>`. This
 * IS the button and takes the same `variant` and `size`, so nothing is cloned.
 */
export function ComboboxTrigger(props: Incoming<ComboboxTriggerProps>) {
  return (
    <AriaComboboxTrigger>
      <Button
        {...props}
        data-slot={props["data-slot"]?.() ?? "combobox-trigger"}
        variant={props.variant?.() ?? "outline"}
        class={ui(partTrigger, props.class?.(), props.className?.())}
      >
        {props.children}
        <ChevronDown data-slot="combobox-trigger-icon" class={triggerIcon} aria-hidden="true" />
      </Button>
    </AriaComboboxTrigger>
  );
}

export interface ComboboxClearProps extends Omit<ButtonProps, "size"> {
  /** What the button says to a screen reader. @default "Clear" */
  clearLabel?: string;
  "data-slot"?: string;
}

/** Empties the value and the text. There only while there is something to empty. */
export function ComboboxClear(props: Incoming<ComboboxClearProps>) {
  return (
    <AriaComboboxClear>
      <InputGroupButton
        {...props}
        data-slot={props["data-slot"]?.() ?? "combobox-clear"}
        variant={props.variant?.() ?? "ghost"}
        size="icon-xs"
      >
        <X aria-hidden="true" />
        <span class={srOnly}>{props.clearLabel?.() ?? "Clear"}</span>
      </InputGroupButton>
    </AriaComboboxClear>
  );
}

export interface ComboboxInputProps extends Omit<UiProps, "ref"> {
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** The toggle at the end of the field. @default true */
  showTrigger?: boolean;
  /** A button that empties the field, in the toggle's place. @default false */
  showClear?: boolean;
  /** What the toggle says to a screen reader. @default "Show suggestions" */
  triggerLabel?: string;
  /** What the clear button says to a screen reader. @default "Clear" */
  clearLabel?: string;
  "aria-invalid"?: boolean | "true" | "false";
  ref?: RefTarget<HTMLInputElement>;
  onKeyDown?: (event: KeyboardEvent) => void;
}

/**
 * The field, in an input group with its toggle.
 *
 * `class` styles the group, which is the box a caller sees; the labelling and
 * everything else goes on the input, which is the control. Addons written as
 * children land in the same group.
 */
export function ComboboxInput(props: Incoming<ComboboxInputProps>) {
  return (
    <InputGroup
      class={ui(inputGroup, props.class?.(), props.className?.())}
      style={props.style?.()}
      isDisabled={props.disabled?.()}
    >
      <AriaComboboxInput
        id={props.id?.()}
        placeholder={props.placeholder?.()}
        disabled={props.disabled?.()}
        required={props.required?.()}
        aria-label={props["aria-label"]?.()}
        aria-labelledby={props["aria-labelledby"]?.()}
        aria-describedby={props["aria-describedby"]?.()}
        aria-invalid={props["aria-invalid"]?.()}
        data-testid={props["data-testid"]?.()}
        data-slot={props["data-slot"]?.() ?? "input-group-control"}
        class={control}
        ref={props.ref?.()}
        onKeyDown={props.onKeyDown?.()}
      />
      <InputGroupAddon align="inline-end">
        <Show when={props.showTrigger?.() !== false}>
          <AriaComboboxTrigger>
            <InputGroupButton
              size="icon-xs"
              variant="ghost"
              data-slot="combobox-trigger"
              class={inputTrigger}
            >
              <ChevronDown
                data-slot="combobox-trigger-icon"
                class={triggerIcon}
                aria-hidden="true"
              />
              <span class={srOnly}>{props.triggerLabel?.() ?? "Show suggestions"}</span>
            </InputGroupButton>
          </AriaComboboxTrigger>
        </Show>
        <Show when={props.showClear?.() === true}>
          <ComboboxClear clearLabel={props.clearLabel?.()} />
        </Show>
      </InputGroupAddon>
      {props.children}
    </InputGroup>
  );
}

export interface ComboboxContentProps extends UiProps {
  /** @default "bottom" */
  side?: Side;
  /** @default "start" */
  align?: Align;
  /** @default 6 */
  sideOffset?: number;
  /** @default 0 */
  alignOffset?: number;
  /** What to place against. @default the chips box, the input, or the trigger */
  anchor?: ComboboxAnchor;
}

/** The panel the list is in: portalled, placed, and as wide as what it hangs off. */
export function ComboboxContent(props: Incoming<ComboboxContentProps>) {
  const root = useComboboxRoot();
  const hasChips = (): boolean => {
    const anchor = props.anchor?.();
    return (anchor !== undefined && anchor !== null) || root.hasChips();
  };

  return (
    <AriaComboboxPopup
      {...props}
      data-slot={props["data-slot"]?.() ?? "combobox-content"}
      data-chips={hasChips() ? "true" : "false"}
      class={ui(content, panel, props.class?.(), props.className?.())}
    />
  );
}

export interface ComboboxListProps<T> extends UiProps {
  /** A callback building an item from each of the root's `items`, or the items themselves. */
  children?: Child | ((item: T, index: number) => Child);
}

export function ComboboxList<T>(props: Incoming<ComboboxListProps<T>>) {
  return (
    <AriaComboboxList
      {...props}
      data-slot={props["data-slot"]?.() ?? "combobox-list"}
      class={ui(list, props.class?.(), props.className?.())}
    />
  );
}

/** The tick, there only on what is chosen. */
function ComboboxItemIndicator() {
  const option = useComboboxItem();
  return (
    <Show when={option.isSelected()}>
      <span data-slot="combobox-item-indicator" class={indicator}>
        <Check />
      </span>
    </Show>
  );
}

export interface ComboboxItemProps extends UiProps {
  /** The item this option stands for, handed back by `onValueChange`. */
  value: unknown;
  disabled?: boolean;
  /** What the filter and the field read. @default the item's label, or this option's text */
  textValue?: string;
}

export function ComboboxItem(props: Incoming<ComboboxItemProps>) {
  return (
    <AriaComboboxItem
      {...props}
      data-slot={props["data-slot"]?.() ?? "combobox-item"}
      class={ui(item, props.class?.(), props.className?.())}
    >
      {props.children}
      <ComboboxItemIndicator />
    </AriaComboboxItem>
  );
}

export interface ComboboxGroupProps extends UiProps {
  /** The items a `<ComboboxCollection>` inside renders. */
  items?: readonly unknown[];
}

/** A run of items under a `<ComboboxLabel>`. */
export function ComboboxGroup(props: Incoming<ComboboxGroupProps>) {
  return (
    <AriaComboboxGroup
      {...props}
      data-slot={props["data-slot"]?.() ?? "combobox-group"}
      class={ui(group, props.class?.(), props.className?.())}
    />
  );
}

export interface ComboboxCollectionProps<T> {
  /** How one of the enclosing group's items renders. */
  children: (item: T, index: number) => Child;
}

/** The enclosing group's own items, each through the callback. */
export function ComboboxCollection<T>(props: Incoming<ComboboxCollectionProps<T>>) {
  return <AriaComboboxCollection {...props} />;
}

/**
 * What the panel says when nothing matches.
 *
 * Always in the panel and shown by it: the panel knows it is empty, and a rule
 * reading that costs one attribute where a conditional would rebuild the row.
 */
export function ComboboxEmpty(props: Incoming<UiProps>) {
  return (
    <AriaComboboxEmpty
      {...props}
      data-slot={props["data-slot"]?.() ?? "combobox-empty"}
      class={ui(empty, props.class?.(), props.className?.())}
    />
  );
}

export interface ComboboxChipsProps extends Omit<UiProps, "ref"> {
  ref?: RefTarget<HTMLDivElement>;
}

/**
 * The box the chips and their input sit in.
 *
 * ```tsx
 * <ComboboxChips>
 *   <ComboboxValue>
 *     {(values) => (
 *       <>
 *         <For each={values}>{(value) => <ComboboxChip>{value}</ComboboxChip>}</For>
 *         <ComboboxChipsInput />
 *       </>
 *     )}
 *   </ComboboxValue>
 * </ComboboxChips>
 * ```
 */
export function ComboboxChips(props: Incoming<ComboboxChipsProps>) {
  return (
    <AriaComboboxChips
      {...props}
      data-slot={props["data-slot"]?.() ?? "combobox-chips"}
      class={ui(chips, props.class?.(), props.className?.())}
    />
  );
}

function ComboboxChipRemove(props: Incoming<{ label: string }>) {
  const held = useComboboxChip();
  return (
    <AriaComboboxChipRemove>
      <Button variant="ghost" size="icon-xs" data-slot="combobox-chip-remove" class={chipRemove}>
        <X aria-hidden="true" />
        {/* Named after the chip: "Remove" three times over is three buttons a
            screen reader cannot tell apart. */}
        <span class={srOnly}>{`${props.label()} ${held.label()}`}</span>
      </Button>
    </AriaComboboxChipRemove>
  );
}

export interface ComboboxChipProps extends UiProps {
  /** @default true */
  showRemove?: boolean;
  /** @default "Remove" */
  removeLabel?: string;
}

/** One chosen value. Which one is its place among the chips. */
export function ComboboxChip(props: Incoming<ComboboxChipProps>) {
  return (
    <AriaComboboxChip
      {...props}
      data-slot={props["data-slot"]?.() ?? "combobox-chip"}
      class={ui(chip, props.class?.(), props.className?.())}
    >
      {props.children}
      <Show when={props.showRemove?.() !== false}>
        <ComboboxChipRemove label={props.removeLabel?.() ?? "Remove"} />
      </Show>
    </AriaComboboxChip>
  );
}

export interface ComboboxChipsInputProps extends Omit<UiProps, "ref"> {
  placeholder?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean | "true" | "false";
  ref?: RefTarget<HTMLInputElement>;
  onKeyDown?: (event: KeyboardEvent) => void;
}

/** The field at the end of the chips, bare: the box around it is the field's look. */
export function ComboboxChipsInput(props: Incoming<ComboboxChipsInputProps>) {
  return (
    <AriaComboboxInput
      {...props}
      data-slot={props["data-slot"]?.() ?? "combobox-chip-input"}
      class={ui(chipsInput, props.class?.(), props.className?.())}
    />
  );
}

/**
 * A place to put the chips box, for a `<ComboboxContent anchor>` to read.
 *
 * ```tsx
 * const anchor = useComboboxAnchor();
 * <ComboboxChips ref={anchor}>…</ComboboxChips>
 * <ComboboxContent anchor={anchor}>…</ComboboxContent>
 * ```
 *
 * The content already hangs off the chips box when there is one, so this is
 * for anchoring to something else.
 */
export function useComboboxAnchor(): { current: HTMLDivElement | null } {
  return { current: null };
}
