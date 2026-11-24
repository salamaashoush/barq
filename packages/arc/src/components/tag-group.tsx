import { type Child, Show, createMemo, createSignal } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { Key, SelectionMode } from "@barqjs/aria/collections";
import { Tag, TagGroup as AriaTagGroup } from "@barqjs/aria/tag";
import { X } from "@barqjs/lucide/icons/x";
import { Button } from "@barqjs/ui/button";

import { arcLayer as arc } from "../layer.ts";
import { type ArcFieldProps, Frame, errorsOf, fieldWiring } from "../lib/field.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import { focus, gap, layout, space, type } from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import { type ChipSize, type ChipVariant, chipVariants } from "./chip.tsx";
import { useArcMessages } from "./messages.ts";

export const tagGroupStyles = variants({
  slots: {
    root: arc(layout.column, gap[1.5]),
    list: arc(layout.row, layout.wrap, gap[1.5], { "[data-empty]": { display: "none" } }),
    tag: arc(focus.slot, focus.none),
    cell: arc(layout.inlineRow, layout.minZero, gap[1], { paddingInlineStart: space.x2_5 }),
    remove: arc({}),
    footer: arc(layout.row, layout.wrap, gap[1]),
    empty: arc(type.meta),
  },
});

type OwnSlots = ReturnType<typeof tagGroupStyles>;

export type TagGroupSlots = OwnSlots & { label: string; description: string; error: string };

export interface TagGroupProps<T>
  extends
    Omit<ArcFieldProps, "label" | "classes" | "isRequired" | "isDisabled">,
    Customisable<TagGroupSlots> {
  /** The tags, in order. */
  items: readonly T[];
  /** Names the group above it. Without one, give `aria-label`. */
  label?: Child;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** @default `item.id ?? item.key` */
  getKey?: (item: T) => Key;
  /** What a tag says and is named by. @default `item.label ?? item.name ?? String(item)` */
  getTextValue?: (item: T) => string;
  /** What a tag shows. @default its text */
  children?: (item: T) => Child;
  /** Tags that cannot be selected or removed. */
  disabledKeys?: Iterable<Key>;
  /** @default "none" */
  selectionMode?: SelectionMode;
  selectedKeys?: Iterable<Key>;
  defaultSelectedKeys?: Iterable<Key>;
  onSelectionChange?: (keys: Set<Key>) => void;
  /** Tags get a remove button, and Delete or Backspace removes the focused or selected ones. */
  onRemove?: (keys: Set<Key>) => void;
  /** A tag was pressed or Enter was pressed on it. */
  onAction?: (key: Key) => void;
  /** Show this many and a button for the rest. */
  maxVisible?: number;
  /** A button after the tags that empties the group. */
  onClearAll?: () => void;
  /** Shown when there are no tags. */
  empty?: Child;
  errorMessage?: string | readonly string[];
  isInvalid?: boolean;
  /** @default "neutral" */
  tone?: Tone;
  /** @default "outline" */
  variant?: ChipVariant;
  /** @default "md" */
  size?: ChipSize;
  /** @default the provider's `showAll`, "Show all (12)" */
  showAllLabel?: (count: number) => string;
  /** @default the provider's `showLess`, "Show less" */
  showLessLabel?: string;
  /** @default the provider's `clearAll`, "Clear all" */
  clearAllLabel?: string;
}

function textOf(item: unknown): string {
  const record = item as Record<string, unknown> | null;
  const text = record?.label ?? record?.name ?? record?.textValue ?? record?.title;
  return typeof text === "string" ? text : String(item);
}

/**
 * Tags in a row that wraps: keywords, chosen values, the filters a list is
 * under. On `@barqjs/aria`'s tag group, so it is one Tab stop with the arrows
 * moving across in the reading direction, Delete removes, and removing the
 * last tag puts focus on the group rather than the page.
 *
 * ```tsx
 * <TagGroup
 *   label="Filters"
 *   items={filters()}
 *   onRemove={(keys) => drop(keys)}
 *   onClearAll={() => drop("all")}
 *   maxVisible={6}
 * />
 * ```
 *
 * Each tag wears `chipVariants`, so a tag and a `Chip` are one shape.
 */
export function TagGroup<T>(props: TagGroupProps<T>) {
  const messages = useArcMessages();
  const [expanded, setExpanded] = createSignal(false);
  const errors = (): string[] => errorsOf(props.errorMessage);
  const of = fieldWiring(errors, () => props.isInvalid === true || errors().length > 0);
  const text = (item: T): string => props.getTextValue?.(item) ?? textOf(item);
  const chip = () => chipVariants({ tone: props.tone, variant: props.variant, size: props.size });
  const cls = createMemo((): TagGroupSlots => {
    const own = tagGroupStyles();
    const shape = chip();
    return parts(
      {
        ...own,
        tag: arc(shape.root, own.tag),
        remove: arc(shape.remove, own.remove),
        label: "",
        description: "",
        error: "",
      },
      props.classes,
    );
  });
  const hidden = (): number =>
    props.maxVisible === undefined ? 0 : Math.max(0, props.items.length - props.maxVisible);
  const shown = (): readonly T[] =>
    hidden() > 0 && !expanded() ? props.items.slice(0, props.maxVisible) : props.items;

  const group = () => (
    <div
      class={arc(
        cls().root,
        props.label === undefined ? arc(props.class, props.className) : undefined,
      )}
      data-slot="tag-group-root"
    >
      <AriaTagGroup<T>
        class={cls().list}
        data-slot="tag-group"
        items={shown()}
        getKey={props.getKey}
        getTextValue={text}
        aria-label={props["aria-label"]}
        aria-labelledby={props.label === undefined ? props["aria-labelledby"] : of.ids.label}
        aria-describedby={of.describedBy(props.description !== undefined)}
        selectionMode={props.selectionMode}
        selectedKeys={props.selectedKeys}
        defaultSelectedKeys={props.defaultSelectedKeys}
        disabledKeys={props.disabledKeys}
        onSelectionChange={(keys) =>
          props.onSelectionChange?.(keys === "all" ? new Set(props.items.map(keyOf)) : keys)
        }
        onRemove={props.onRemove === undefined ? undefined : (keys) => props.onRemove?.(keys)}
        onAction={props.onAction === undefined ? undefined : (key) => props.onAction?.(key)}
      >
        {(item: T) => (
          <Tag
            class={cls().tag}
            cellClass={cls().cell}
            removeClass={cls().remove}
            removeIcon={<X aria-hidden="true" />}
            data-slot="tag"
          >
            {props.children === undefined ? text(item) : props.children(item)}
          </Tag>
        )}
      </AriaTagGroup>
      <Show when={props.items.length === 0 && props.empty !== undefined}>
        <p class={cls().empty} data-slot="tag-group-empty">
          {props.empty}
        </p>
      </Show>
      <Show when={hidden() > 0 || (props.onClearAll !== undefined && props.items.length > 0)}>
        <div class={cls().footer} data-slot="tag-group-footer">
          <Show when={hidden() > 0}>
            <Button
              variant="ghost"
              size="xs"
              data-slot="tag-group-toggle"
              aria-expanded={expanded()}
              onPress={() => setExpanded((open) => !open)}
            >
              {expanded()
                ? (props.showLessLabel ?? messages().showLess)
                : (props.showAllLabel ?? messages().showAll)(props.items.length)}
            </Button>
          </Show>
          <Show when={props.onClearAll !== undefined && props.items.length > 0}>
            <Button
              variant="ghost"
              size="xs"
              data-slot="tag-group-clear"
              onPress={() => props.onClearAll?.()}
            >
              {props.clearAllLabel ?? messages().clearAll}
            </Button>
          </Show>
        </div>
      </Show>
    </div>
  );

  function keyOf(item: T, index: number): Key {
    if (props.getKey !== undefined) return props.getKey(item);
    const record = item as Record<string, unknown> | null;
    const id = record?.id ?? record?.key;
    return typeof id === "string" || typeof id === "number" ? id : index;
  }

  return (
    <Show when={props.label !== undefined} fallback={group()}>
      <Frame
        of={of}
        field={{
          label: props.label,
          class: props.class,
          className: props.className,
          classes: {
            label: props.classes?.label,
            description: props.classes?.description,
            error: props.classes?.error,
          },
        }}
        label={props.label}
        description={props.description}
        labelledById
        slot="tag-group-field"
      >
        {group()}
      </Frame>
    </Show>
  );
}
