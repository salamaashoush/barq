/**
 * One control of the customizer, ported from
 * `apps/v4/app/(app)/(create)/components/picker.tsx`.
 *
 * A trigger showing two lines — what this decides, and what it is set to — with
 * a swatch or a glyph on the right, opening a dark translucent list of the
 * choices. Every class list here is upstream's, translated by
 * `tools/transcribe.ts` like every other look in this package.
 *
 * THE POPUP IS NOT THEMED, and that is the design rather than an oversight.
 * `bg-neutral-950/80 text-neutral-100 ring-neutral-950/80` is shadcn's raw
 * palette, not the semantic tokens, because the customizer is chrome: a menu
 * that changed colour with the theme it is configuring would stop being a fixed
 * point to judge the change against, and on a light theme it would be white on
 * white — which is exactly how this page looked before, with the surface
 * "missing" because it was there and invisible.
 *
 * The three custom properties the width, the height and the origin read come
 * from `@barqjs/aria`'s positioner. Upstream reads Base UI's names for them,
 * so the popup aliases ours onto theirs rather than rewriting shadcn's class
 * list: the transcription stays a transcription.
 */

import type { Child, Incoming } from "@barqjs/core";
import type { Key } from "@barqjs/aria/collections";
import { layer } from "@barqjs/css";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@barqjs/ui";
import { Check } from "@barqjs/lucide/icons/check";

import { optionOf, type Option } from "./options.ts";

const ui = layer("barq.ui");

/** `group/picker relative`: the lock button and the glyph are positioned off it. */
const group = ui({
  position: "relative",
});

const trigger = ui({
  position: "relative",
  width: "calc(var(--spacing) * 36)",
  flexShrink: "0",
  touchAction: "manipulation",
  borderRadius: "calc(var(--radius) + 4px)",
  padding: "calc(var(--spacing) * 3)",
  "--ui-ring-shadow":
    "var(--ui-ring-inset,) 0 0 0 calc(1px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  "--ui-ring-color": "var(--foreground)",
  "@supports (color: color-mix(in lab, red, red))": {
    "--ui-ring-color": "color-mix(in oklab, var(--foreground) 10%, transparent)",
  },
  userSelect: "none",
  "@media (hover: hover)": {
    "&:hover": { backgroundColor: "var(--muted)" },
  },
  "&[data-focus-visible]": {
    "--ui-ring-color": "var(--foreground)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--foreground) 50%, transparent)",
    },
    "--ui-outline-style": "none",
    outlineStyle: "none",
  },
  "&[data-disabled]": { opacity: "50%" },
  // `data-popup-open` upstream, which is Base UI's name for it.
  "&[data-expanded]": { backgroundColor: "var(--muted)" },
  "@media (width >= 48rem)": {
    width: "100%",
    borderRadius: "var(--radius)",
    paddingInline: "calc(var(--spacing) * 2.5)",
    paddingBlock: "calc(var(--spacing) * 2)",
  },
  // A `<Button>` is a centred row of a fixed height; a picker is a left-aligned
  // stack that grows. These four undo that, and they come last so they win.
  height: "auto",
  justifyContent: "flex-start",
  alignItems: "center",
  gap: "0",
  backgroundColor: "transparent",
});

const label = ui({
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-start",
  textAlign: "left",
  minWidth: "0",
  // The glyph is absolutely positioned at `right-2.5` and is 16px wide, so the
  // column stops short of it rather than running underneath: without this the
  // value's ellipsis appeared while there was still room, and every trigger
  // read "Theme'…".
  width: "calc(100% - calc(var(--spacing) * 6))",
});

const name = ui({
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  color: "var(--muted-foreground)",
});

const chosen = ui({
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
  color: "var(--foreground)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

/** The dot on the right of a trigger, where the choice has a colour. */
const dot = ui({
  pointerEvents: "none",
  position: "absolute",
  top: "calc(1 / 2 * 100%)",
  right: "calc(var(--spacing) * 4)",
  width: "calc(var(--spacing) * 4)",
  height: "calc(var(--spacing) * 4)",
  "--ui-translate-y": "calc(calc(1 / 2 * 100%) * -1)",
  translate: "var(--ui-translate-x) var(--ui-translate-y)",
  borderRadius: "calc(infinity * 1px)",
  userSelect: "none",
  "@media (width >= 48rem)": {
    right: "calc(var(--spacing) * 2.5)",
  },
});

/** An empty ring where a choice has no colour, so every trigger is the same width. */
const hollow = ui({
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  borderColor: "var(--border)",
});

/** The glyph on the right of a trigger, where the choice has a shape rather than a colour. */
const glyph = ui({
  pointerEvents: "none",
  position: "absolute",
  top: "calc(1 / 2 * 100%)",
  right: "calc(var(--spacing) * 4)",
  display: "flex",
  width: "calc(var(--spacing) * 4)",
  height: "calc(var(--spacing) * 4)",
  "--ui-translate-y": "calc(calc(1 / 2 * 100%) * -1)",
  translate: "var(--ui-translate-x) var(--ui-translate-y)",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "var(--text-base)",
  lineHeight: "var(--ui-leading, var(--text-base--line-height))",
  color: "var(--foreground)",
  userSelect: "none",
  "@media (width >= 48rem)": {
    right: "calc(var(--spacing) * 2.5)",
  },
});

/**
 * `--available-*` and `--transform-origin` are Base UI's names, which shadcn's
 * class list reads. `@barqjs/aria`'s positioner publishes the same three
 * measurements under its own prefix, so three aliases keep the class list a
 * transcription instead of a rewrite.
 */
const positioned = ui({
  "--available-width": "var(--barq-available-width)",
  "--available-height": "var(--barq-available-height)",
  "--transform-origin": "var(--barq-transform-origin)",
});

const popup = ui({
  zIndex: "50",
  msOverflowStyle: "none",
  scrollbarWidth: "none",
  "&::-webkit-scrollbar": { display: "none" },
  maxHeight: "var(--available-height)",
  width: "calc(var(--available-width) - (calc(var(--spacing) * 6)))",
  minWidth: "calc(var(--spacing) * 32)",
  transformOrigin: "var(--transform-origin)",
  "--ui-translate-y": "calc(var(--spacing) * 2)",
  translate: "var(--ui-translate-x) var(--ui-translate-y)",
  overflowX: "hidden",
  overflowY: "auto",
  borderRadius: "calc(var(--radius) + 4px)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "0px",
  backgroundColor: "color-mix(in srgb, oklch(14.5% 0 none) 80%, transparent)",
  padding: "calc(var(--spacing) * 1.5)",
  color: "var(--color-neutral-100)",
  "--ui-ring-shadow":
    "var(--ui-ring-inset,) 0 0 0 calc(1px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  "--ui-ring-color": "color-mix(in srgb, oklch(14.5% 0 none) 80%, transparent)",
  "@supports (color: color-mix(in lab, red, red))": {
    backgroundColor: "color-mix(in oklab, var(--color-neutral-950) 80%, transparent)",
    "--ui-ring-color": "color-mix(in oklab, var(--color-neutral-950) 80%, transparent)",
  },
  "--ui-backdrop-blur": "blur(var(--blur-xl))",
  backdropFilter: "var(--ui-backdrop-blur,)",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  "@media (width >= 48rem)": {
    width: "calc(var(--spacing) * 52)",
  },
  ":is(.dark *)": {
    backgroundColor: "color-mix(in srgb, oklch(26.9% 0 none) 90%, transparent)",
    "--ui-ring-color": "color-mix(in srgb, oklch(37.1% 0 none) 50%, transparent)",
    "@supports (color: color-mix(in lab, red, red))": {
      backgroundColor: "color-mix(in oklab, var(--color-neutral-800) 90%, transparent)",
      "--ui-ring-color": "color-mix(in oklab, var(--color-neutral-700) 50%, transparent)",
    },
  },
  "[data-closed] &": { overflow: "hidden" },
});

const radioItem = ui({
  position: "relative",
  display: "flex",
  cursor: "default",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
  borderRadius: "var(--radius)",
  paddingBlock: "calc(var(--spacing) * 1.5)",
  paddingRight: "calc(var(--spacing) * 8)",
  paddingLeft: "calc(var(--spacing) * 2)",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  userSelect: "none",
  ":is(& *)": { color: "var(--color-neutral-100)" },
  // `focus:` upstream, which is real DOM focus there and here alike; a menu in
  // this package moves focus rather than a virtual highlight, and writes
  // `data-focused` alongside it.
  "&[data-focused]": {
    backgroundColor: "var(--color-neutral-600)",
    color: "var(--color-neutral-100)",
  },
  ":is(&[data-focused] *)": { color: "var(--color-neutral-100)" },
  ":is(.dark *)[data-focused]": {
    backgroundColor: "color-mix(in srgb, oklch(37.1% 0 none) 80%, transparent)",
    "@supports (color: color-mix(in lab, red, red))": {
      backgroundColor: "color-mix(in oklab, var(--color-neutral-700) 80%, transparent)",
    },
  },
  "@media (pointer: coarse)": {
    gap: "calc(var(--spacing) * 3)",
    paddingBlock: "calc(var(--spacing) * 2.5)",
    paddingLeft: "calc(var(--spacing) * 3)",
    fontSize: "var(--text-base)",
    lineHeight: "var(--ui-leading, var(--text-base--line-height))",
  },
  "&[data-disabled]": { pointerEvents: "none", opacity: "50%" },
});

/** The tick, on the RIGHT: shadcn's picker puts it there, not in a left gutter. */
const tick = ui({
  pointerEvents: "none",
  position: "absolute",
  right: "calc(var(--spacing) * 2)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  "& > svg": {
    display: "none",
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
  },
  "[data-selected] & > svg": { display: "block" },
});

const groupLabel = ui({
  paddingInline: "calc(var(--spacing) * 2)",
  paddingBlock: "calc(var(--spacing) * 1.5)",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
  color: "var(--color-neutral-400)",
});

const rule = ui({
  marginInline: "calc(var(--spacing) * -1.5)",
  marginBlock: "calc(var(--spacing) * 1.5)",
  height: "1px",
  backgroundColor: "var(--color-neutral-600)",
  ":is(.dark *)": { backgroundColor: "var(--color-neutral-700)" },
});

/** The dot beside an item, which is the same colour the trigger shows. */
const itemDot = ui({
  display: "inline-block",
  flex: "none",
  width: "calc(var(--spacing) * 3)",
  height: "calc(var(--spacing) * 3)",
  borderRadius: "calc(infinity * 1px)",
});

const itemDotHollow = ui({
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  borderColor: "var(--color-neutral-600)",
});

const itemLabel = ui({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export interface PickerProps {
  /** What this decides: "Base Color", "Radius". */
  label: string;
  options: readonly Option[];
  value: string;
  /** Nothing to pick, which is what a style that fixes the radius leaves behind. */
  disabled?: boolean;
  onPick: (value: string) => void;
  /**
   * Applied while the pointer rests on an item, and undone on leaving.
   *
   * Called with the hovered value; the caller turns it into a parameter. The
   * clear is a separate prop because it must not be debounced with this one.
   */
  onPreview?: (value: string) => void;
  clearPreview?: () => void;
  /** Drawn on the right of the trigger where the choice has a shape rather than a colour. */
  glyph?: Child;
}

/** One option, and whether a rule is drawn above it. */
interface Row {
  readonly option: Option;
  readonly first: boolean;
}

/** A rule above every group after the first, which is how upstream separates them. */
function grouped(options: readonly Option[]): Row[] {
  let previous: string | undefined;
  return options.map((option) => {
    const first = option.group !== undefined && option.group !== previous;
    previous = option.group;
    return { option, first };
  });
}

export function Picker(props: Incoming<PickerProps>) {
  const current = (): Option | undefined => optionOf(props.options(), props.value());
  const rows = (): Row[] => grouped(props.options());

  return (
    <div class={group} data-slot="picker">
      <DropdownMenu
        onOpenChange={(open: boolean) => {
          // Clearing on CLOSE, not only on leaving the list. Selecting removes
          // the content, so its `mouseleave` never fires and the preview would
          // stay applied forever, which looks exactly like a commit and is not.
          if (!open) props.clearPreview?.()?.();
        }}
      >
        <DropdownMenuTrigger>
          {/* A `<Button>`, not a bare `<button>`. The trigger renders no element
              and hands `aria-expanded`, `aria-haspopup` and the press handling
              through a SLOT, which only a component that consumes one receives:
              a plain element takes none of it and the menu never opens. */}
          <Button
            variant="ghost"
            class={trigger}
            data-slot="picker-trigger"
            isDisabled={props.disabled?.()}
          >
            <span class={label}>
              <span class={name}>{props.label()}</span>
              <span class={chosen} data-slot="picker-value">
                {current()?.label ?? props.value()}
              </span>
            </span>
            {/* `props.glyph`, not `props.glyph()`. A children-shaped prop that
                BUILDS an element is a Block: it takes its scope as the first
                argument and throws when called with none, so what decides
                between the dot and the glyph is whether the prop was PASSED,
                and the value itself is handed to the runtime unread. */}
            {props.glyph === undefined ? (
              <span
                class={current()?.swatch === undefined ? ui(dot, hollow) : dot}
                data-slot="picker-dot"
                style={{ background: current()?.swatch ?? "transparent" }}
              />
            ) : (
              <span class={glyph} data-slot="picker-glyph">
                {props.glyph}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          items={rows()}
          // A collection keys on `id` or `key` by default, and an Option has
          // neither; without this every row is keyed `undefined` and the list
          // selects the same one whatever you press.
          getKey={(row: Row) => row.option.value}
          getTextValue={(row: Row) => row.option.label}
          aria-label={props.label()}
          data-slot="picker-content"
          class={ui(positioned, popup)}
          placement="right top"
          offset={20}
          selectionMode="single"
          selectedKeys={[props.value()]}
          // `onAction`, not `onSelectionChange`: a menu item is chosen by a
          // PRESS here and routes through `onPress`, so a selection listener is
          // never called and every click was silently a no-op.
          onAction={(key: Key) => props.onPick()(String(key))}
          onMouseLeave={() => props.clearPreview?.()?.()}
        >
          {(row: Row) => (
            <>
              {row.first ? (
                <div class={rule} role="separator" data-slot="picker-separator" />
              ) : null}
              <DropdownMenuItem
                data-slot="picker-item"
                class={radioItem}
                // Both, because both are how a person browses a list: the
                // pointer settles on one, or the arrow keys move focus to it.
                // The provider debounces, so a sweep applies nothing until it
                // stops.
                onMouseMove={() => props.onPreview?.()?.(row.option.value)}
                onFocus={() => props.onPreview?.()?.(row.option.value)}
              >
                {row.option.swatch === undefined ? null : (
                  <span class={itemDot} style={{ background: row.option.swatch }} />
                )}
                {row.option.swatch === undefined && hasSwatches(props.options()) ? (
                  <span class={ui(itemDot, itemDotHollow)} />
                ) : null}
                <span class={itemLabel}>{row.option.label}</span>
                <span class={tick} data-slot="picker-item-indicator">
                  <Check />
                </span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** A list where some options have a colour lines them all up against a gutter. */
function hasSwatches(options: readonly Option[]): boolean {
  return options.some((option) => option.swatch !== undefined);
}

export interface PickerLabelProps {
  children?: unknown;
}

/** A heading inside a popup, which a grouped list draws above each run. */
export function PickerGroupLabel(props: Incoming<PickerLabelProps>) {
  return (
    <div class={groupLabel} data-slot="picker-label">
      {props.children as never}
    </div>
  );
}

/**
 * The popup, the item and the rule, for the menus that are not pickers.
 *
 * The main menu and the action menu wear the same dark surface, and it is one
 * surface rather than three copies: the page has exactly one idea of what a
 * customizer menu looks like, and a second copy is what drifts.
 */
export { popup as popupClass, radioItem as radioItemClass, rule as ruleClass };
