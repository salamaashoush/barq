/**
 * One control of the customizer, the shape shadcn's `/create` uses for all of
 * them.
 *
 * A trigger showing two lines — what this decides, and what it is set to — with
 * a swatch on the right, opening a dark list of the choices. The classes are
 * transcribed from `apps/v4/app/(app)/(create)/components/picker.tsx` through
 * `tools/css.ts`, like every other look in this package.
 *
 * The HOVER PREVIEW is the part worth keeping rather than the part worth
 * copying: choosing a colour scheme is comparing, so sweeping a list and
 * watching the page follow is a different task from clicking one and undoing
 * it. Moving off the list puts the committed value straight back.
 */

import type { Incoming } from "@barqjs/core";
import type { Key } from "@barqjs/aria/collections";
import { css, layer } from "@barqjs/css";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@barqjs/ui";

import { labelOf, swatchOf, type Option } from "./options.ts";

const ui = layer("barq.ui");

const trigger = ui({
  position: "relative",
  width: "calc(var(--spacing) * 36)",
  flexShrink: "0",
  touchAction: "manipulation",
  borderRadius: "calc(var(--radius) + 4px)",
  padding: "calc(var(--spacing) * 3)",
  textAlign: "left",
  backgroundColor: "transparent",
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
    "&:hover": {
      backgroundColor: "var(--muted)",
    },
  },
  "&[data-focus-visible]": {
    "--ui-outline-style": "none",
    outlineStyle: "none",
  },
  "&[data-expanded]": {
    backgroundColor: "var(--muted)",
  },
  // A `<Button>` is a centred row of a fixed height; a picker is a left-aligned
  // stack that grows. These four undo that, and they come after `box.*` in the
  // call so they win.
  height: "auto",
  justifyContent: "flex-start",
  alignItems: "center",
  gap: "0",
  "@media (width >= 48rem)": {
    width: "100%",
    borderRadius: "var(--radius)",
    paddingInline: "calc(var(--spacing) * 2.5)",
    paddingBlock: "calc(var(--spacing) * 2)",
  },
});

/** The two lines, so the button's own flex row does not put them side by side. */
const stack = ui({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "flex-start",
  minWidth: "0",
  width: "100%",
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

const dot = ui({
  pointerEvents: "none",
  position: "absolute",
  top: "50%",
  right: "calc(var(--spacing) * 4)",
  width: "calc(var(--spacing) * 4)",
  height: "calc(var(--spacing) * 4)",
  "--ui-translate-y": "-50%",
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

const list = ui({
  maxHeight: "calc(var(--spacing) * 96)",
  "@media (width >= 48rem)": {
    width: "calc(var(--spacing) * 52)",
  },
});

const itemDot = css`
  display: inline-block;
  flex: none;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 9999px;
`;

const itemRow = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
`;

export interface PickerProps {
  /** What this decides: "Base Color", "Radius". */
  label: string;
  options: readonly Option[];
  value: string;
  onPick: (value: string) => void;
  /** Applied while the pointer rests on an item, and undone on leaving. */
  onPreview?: (value: string | null) => void;
}

export function Picker(props: Incoming<PickerProps>) {
  const current = (): string => props.value();
  const swatch = (): string | undefined => swatchOf(props.options(), current());

  return (
    // Clearing on CLOSE, not only on leaving the list. Selecting removes the
    // content, so its `mouseleave` never fires and the preview would stay
    // applied forever, which looks exactly like a commit and is not one.
    <DropdownMenu
      onOpenChange={(open: boolean) => {
        if (!open) props.onPreview?.()?.(null);
      }}
    >
      <DropdownMenuTrigger>
        {/* A `<Button>`, not a bare `<button>`. The trigger renders no element
            and hands `aria-expanded`, `aria-haspopup` and the press handling
            through a SLOT, which only a component that consumes one receives:
            a plain element takes none of it and the menu never opens. */}
        <Button variant="ghost" class={trigger} data-slot="picker-trigger">
          <span class={stack}>
            <span class={name}>{props.label()}</span>
            <span class={chosen} data-slot="picker-value">
              {labelOf(props.options(), current())}
            </span>
          </span>
          <span
            class={swatch() === undefined ? ui(dot, hollow) : dot}
            data-slot="picker-dot"
            style={{ background: swatch() ?? "transparent" }}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        items={props.options()}
        // A collection keys on `id` or `key` by default, and an Option has
        // neither; without this every row is keyed `undefined` and the list
        // selects the same one whatever you press.
        getKey={(option: Option) => option.value}
        aria-label={props.label()}
        class={list}
        placement="right top"
        // `onAction`, not `onSelectionChange`: a menu item is chosen by a
        // PRESS here and routes through `onPress`, so a selection listener is
        // never called and every click was silently a no-op.
        onAction={(key: Key) => props.onPick()(String(key))}
        onMouseLeave={() => props.onPreview?.()?.(null)}
      >
        {(option: Option) => (
          // The preview is on the ITEM's pointer, not on the menu's selection:
          // selecting is the commit, and previewing has to happen before one.
          <DropdownMenuItem onMouseEnter={() => props.onPreview?.()?.(option.value)}>
            <span class={itemRow}>
              <span class={itemDot} style={{ background: option.swatch ?? "transparent" }} />
              {option.label}
            </span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
