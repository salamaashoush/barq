/**
 * The customizer's header menu, ported from
 * `apps/v4/app/(app)/(create)/components/main-menu.tsx`.
 *
 * A trigger reading "Menu" with a hamburger, opening the same dark popup the
 * pickers use: the actions, a rule, then the destructive one. Every item has
 * its keyboard shortcut on the right, and the shortcuts are real — the page
 * binds them, so the menu is documentation of something rather than decoration.
 */

import type { Incoming } from "@barqjs/core";
import type { Key } from "@barqjs/aria/collections";
import { layer } from "@barqjs/css";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@barqjs/ui";
import { Menu as MenuIcon } from "@barqjs/lucide/icons/menu";

import { popupClass, radioItemClass, ruleClass } from "./picker.tsx";
import type { Design } from "./params.ts";

const ui = layer("barq.ui");

const trigger = ui({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "calc(var(--spacing) * 2)",
  borderRadius: "var(--radius)",
  paddingInline: "calc(var(--spacing) * 1.75)",
  "--ui-ring-shadow":
    "var(--ui-ring-inset,) 0 0 0 calc(1px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  "--ui-ring-color": "var(--foreground)",
  "@supports (color: color-mix(in lab, red, red))": {
    "--ui-ring-color": "color-mix(in oklab, var(--foreground) 10%, transparent)",
  },
  backgroundColor: "transparent",
  "@media (hover: hover)": {
    "&:hover": { backgroundColor: "var(--muted)" },
  },
});

const word = ui({
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
});

const icon = ui({
  width: "calc(var(--spacing) * 5)",
  height: "calc(var(--spacing) * 5)",
});

const shortcut = ui({
  marginLeft: "auto",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  "--ui-tracking": "var(--tracking-widest)",
  letterSpacing: "var(--tracking-widest)",
  color: "var(--color-neutral-400)",
});

interface Entry {
  readonly id: string;
  readonly name: string;
  readonly keys?: string;
  /** A rule above this entry, which is how upstream groups them. */
  readonly first?: boolean;
}

export interface MainMenuProps {
  design: Design;
  onShuffle: () => void;
  onToggleDark: () => void;
  onToggleRtl: () => void;
  onSearch: () => void;
  onReset: () => void;
}

export function MainMenu(props: Incoming<MainMenuProps>) {
  // `navigator.platform` is only readable in a browser, and the menu renders
  // once — so the symbol is decided at first paint rather than per render.
  const mac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

  const entries = (): Entry[] => [
    { id: "search", name: "Search…", keys: mac ? "⌘K" : "Ctrl+K" },
    { id: "shuffle", name: "Shuffle", keys: "R" },
    { id: "dark", name: "Light/Dark", keys: "D" },
    { id: "rtl", name: "LTR/RTL" },
    { id: "copy", name: "Copy CSS", keys: mac ? "⌘C" : "Ctrl+C" },
    { id: "reset", name: "Reset", keys: "⇧R", first: true },
  ];

  const run = (key: Key): void => {
    if (key === "shuffle") props.onShuffle()();
    else if (key === "dark") props.onToggleDark()();
    else if (key === "rtl") props.onToggleRtl()();
    else if (key === "search") props.onSearch()();
    else if (key === "reset") props.onReset()();
    else if (key === "copy") {
      void import("./params.ts").then(async ({ selectionOf }) => {
        const { themeCss } = await import("@barqjs/ui");
        await navigator.clipboard.writeText(themeCss(selectionOf(props.design().params())));
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="ghost" class={trigger} data-slot="main-menu-trigger">
          <span class={word}>Menu</span>
          <MenuIcon class={icon} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        items={entries()}
        aria-label="Menu"
        data-slot="main-menu"
        class={popupClass}
        placement="right top"
        offset={20}
        onAction={run}
      >
        {(entry: Entry) => (
          <>
            {entry.first === true ? (
              <div class={ruleClass} role="separator" data-slot="picker-separator" />
            ) : null}
            <DropdownMenuItem data-slot="picker-item" class={radioItemClass}>
              {entry.name}
              {entry.keys === undefined ? null : (
                <DropdownMenuShortcut class={shortcut}>{entry.keys}</DropdownMenuShortcut>
              )}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
