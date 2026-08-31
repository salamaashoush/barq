import type { Key } from "@barqjs/aria/collections";
import type { FilterFn } from "@barqjs/aria/combobox";
import { getOwner, Show, signal, type Child, type Incoming } from "@barqjs/core";
import { clsx, css } from "@barqjs/css";
import { Check } from "@barqjs/lucide/icons/check";
import { ChevronsUpDown } from "@barqjs/lucide/icons/chevrons-up-down";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { Button } from "./button.tsx";
import { Command, CommandItem } from "./command.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.tsx";

const trigger = css`
  @layer barq.ui {
    width: 100%;
    justify-content: space-between;
    --ui-font-weight: var(--font-weight-normal);
    font-weight: var(--font-weight-normal);
  }
`;

const content = css`
  @layer barq.ui {
    width: 100%;
    padding: 0px;
  }
`;

const item = css`
  @layer barq.ui {
    position: relative;
    display: flex;
    width: 100%;
    cursor: default;
    align-items: center;
    gap: calc(var(--spacing) * 2);
    border-radius: calc(var(--radius) - 4px);
    padding-block: calc(var(--spacing) * 1.5);
    padding-right: calc(var(--spacing) * 8);
    padding-left: calc(var(--spacing) * 2);
    font-size: var(--text-sm);
    line-height: var(--ui-leading, var(--text-sm--line-height));
    --ui-outline-style: none;
    outline-style: none;
    @media (forced-colors: active) {
      outline: 2px solid transparent;
      outline-offset: 2px;
    }
    -webkit-user-select: none;
    user-select: none;
    &[data-focused] {
      background-color: var(--accent);
      color: var(--accent-foreground);
    }
    &[data-disabled] {
      pointer-events: none;
      opacity: 50%;
    }
    & svg {
      pointer-events: none;
      flex-shrink: 0;
    }
    & svg:not([class*="size-"]) {
      width: calc(var(--spacing) * 4);
      height: calc(var(--spacing) * 4);
    }
  }
`;

const indicator = css`
  @layer barq.ui {
    pointer-events: none;
    position: absolute;
    right: calc(var(--spacing) * 2);
    display: flex;
    width: calc(var(--spacing) * 4);
    height: calc(var(--spacing) * 4);
    align-items: center;
    justify-content: center;
  }
`;

const chevron = css`
  @layer barq.ui {
    opacity: 50%;
  }
`;

export interface ComboboxProps<T> extends UiProps {
  /** Everything that can be chosen, before the typed text narrows it. */
  items: Iterable<T>;
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
  const open = signal(false);

  const keyOf = (entry: T): Key => (entry as { id: Key }).id;
  const textOf = (entry: T): string => props.label?.()?.(entry) ?? String(keyOf(entry));

  const shown = (): string => {
    const key = chosen();
    if (key === null) return props.placeholder?.() ?? "Select…";
    for (const entry of props.items()) if (keyOf(entry) === key) return textOf(entry);
    return String(key);
  };

  // The scope comes FIRST: the compiler gives a children callback one.
  const render = props.children?.() as unknown as ((scope: unknown, item: T) => Child) | undefined;

  return (
    <Popover isOpen={open()} onOpenChange={(next: boolean) => open.set(next)}>
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
          class={clsx(trigger, props.class?.(), props.className?.())}
        >
          {shown()}
          <ChevronsUpDown class={chevron} aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent data-slot="combobox-content" class={content}>
        <Command
          items={props.items()}
          placeholder={props.searchPlaceholder?.() ?? "Search…"}
          empty={props.empty?.()}
          filterBy={props.filterBy?.()}
          aria-label={props["aria-label"]?.()}
          onAction={(key) => {
            // Once, before the write: reading `chosen()` again afterwards sees
            // the value just set and reports every choice as a clear.
            const next = key === chosen() ? null : key;
            inner.set(next);
            props.onChange?.()?.(next);
            open.set(false);
          }}
        >
          {(entry: T) => (
            <CommandItem data-slot="combobox-item" class={item}>
              {render === undefined ? textOf(entry) : render(getOwner(), entry)}
              <Show when={keyOf(entry) === chosen()}>
                <span data-slot="combobox-item-indicator" class={indicator}>
                  <Check />
                </span>
              </Show>
            </CommandItem>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
