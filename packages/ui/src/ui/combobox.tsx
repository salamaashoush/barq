import type { Key } from "@barqjs/aria/collections";
import { Section } from "@barqjs/aria/listbox";
import type { FilterFn } from "@barqjs/aria/combobox";
import { For, getOwner, isBlock, Show, signal, type Child, type Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import { Check } from "@barqjs/lucide/icons/check";
import { ChevronsUpDown } from "@barqjs/lucide/icons/chevrons-up-down";
import { X } from "@barqjs/lucide/icons/x";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { icon } from "../lib/shared-icon.ts";
import { when } from "../lib/shared-when.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { Button } from "./button.tsx";
import { Command, CommandItem } from "./command.tsx";
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
const content = ui({
  width: "var(--barq-trigger-width, auto)",
  minWidth: "var(--barq-trigger-width, auto)",
  padding: "0px",
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
    paddingRight: "calc(var(--spacing) * 8)",
    paddingLeft: "calc(var(--spacing) * 2)",
  },
);

const indicator = ui({
  pointerEvents: "none",
  position: "absolute",
  right: "calc(var(--spacing) * 2)",
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
  minHeight: "calc(var(--spacing) * 9)",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "calc(var(--spacing) * 1.5)",
  borderRadius: "calc(var(--radius) * 0.8)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  borderColor: "var(--input)",
  backgroundColor: "transparent",
  backgroundClip: "padding-box",
  paddingInline: "calc(var(--spacing) * 2.5)",
  paddingBlock: "calc(var(--spacing) * 1.5)",
  "--ui-shadow": "0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05))",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  transitionProperty: "color, box-shadow",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  ".dark &": {
    backgroundColor: "color-mix(in oklab, var(--input) 30%, transparent)",
  },
  // A chip carries its own padding, so the box stops adding a second one.
  '&:has([data-slot="combobox-chip"])': {
    paddingInline: "calc(var(--spacing) * 1.5)",
  },
  ":focus-within": {
    borderColor: "var(--ring)",
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    "--ui-ring-color": "color-mix(in oklab, var(--ring) 50%, transparent)",
  },
  '&:has([aria-invalid="true"])': {
    borderColor: "var(--destructive)",
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    "--ui-ring-color": "color-mix(in oklab, var(--destructive) 20%, transparent)",
  },
});

const chip = ui(text.medium, {
  display: "flex",
  height: "calc(calc(var(--spacing) * 5.5))",
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
    paddingRight: "0px",
  },
});

const chipRemove = ui({
  marginLeft: "calc(var(--spacing) * -1)",
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
export function Combobox<T>(props: Incoming<ComboboxProps<T>>) {
  const inner = signal<Key | null>(props.defaultValue?.() ?? null);
  const chosen = (): Key | null => props.value?.() ?? inner();
  const innerMany = signal<readonly Key[]>(props.defaultValues?.() ?? []);
  const many = (): readonly Key[] => props.values?.() ?? innerMany();
  const multiple = (): boolean => props.multiple?.() === true;
  const open = signal(false);

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
    if (props.values?.() === undefined) innerMany.set(next);
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
  const render = ((): ((scope: unknown, item: T) => Child) | undefined => {
    const given = props.children as unknown;
    if (given === undefined || given === null) return undefined;
    if (isBlock(given)) return given as (scope: unknown, item: T) => Child;
    return (given as () => (scope: unknown, item: T) => Child)();
  })();

  const label = (entry: T): Child =>
    render === undefined ? textOf(entry) : render(getOwner(), entry);

  return (
    <Popover isOpen={open()} onOpenChange={(next: boolean) => open.set(next)}>
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
            inner.set(next);
            props.onChange?.()?.(next);
            open.set(false);
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
