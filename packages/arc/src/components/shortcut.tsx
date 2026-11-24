import { For, Show, createEffect, createSignal } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { isAppleDevice } from "@barqjs/aria/platform";
import { isServer } from "@barqjs/web";
import { Kbd, KbdGroup } from "@barqjs/ui/kbd";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, edge, fg, gap, layout, type } from "../style/index.ts";

export const shortcutStyles = variants({
  slots: {
    root: arc(layout.inlineRow, gap[0.5], { verticalAlign: "middle" }),
    key: arc(type.numeric),
    separator: arc(type.caption, fg.muted),
  },
  variants: {
    variant: {
      subtle: {},
      outline: {
        key: arc(edge.all, bg.page, { borderBlockEndWidth: "2px" }),
      },
    },
    size: {
      sm: { key: arc(type.xs) },
      md: {},
    },
  },
  defaults: { variant: "subtle", size: "md" },
});

type Slots = ReturnType<typeof shortcutStyles>;

const APPLE: Record<string, string> = {
  mod: "⌘",
  meta: "⌘",
  cmd: "⌘",
  alt: "⌥",
  option: "⌥",
  shift: "⇧",
  ctrl: "⌃",
  control: "⌃",
};

const OTHER: Record<string, string> = {
  mod: "Ctrl",
  meta: "Win",
  cmd: "Ctrl",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
  ctrl: "Ctrl",
  control: "Ctrl",
};

const NAMED: Record<string, string> = {
  enter: "↵",
  escape: "Esc",
  esc: "Esc",
  backspace: "⌫",
  delete: "Del",
  tab: "Tab",
  space: "Space",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
};

/** A key as it is written on the reader's keyboard: `Mod` is ⌘ on a Mac and Ctrl elsewhere. */
export function keyLabel(key: string, apple: boolean): string {
  const name = key.toLowerCase();
  return (apple ? APPLE[name] : OTHER[name]) ?? NAMED[name] ?? key.toUpperCase();
}

export interface ShortcutProps extends Customisable<Slots> {
  /** The keys pressed together, in order: `["Mod", "K"]`, or `"Mod+K"`. */
  keys: readonly string[] | string;
  /** @default "subtle" */
  variant?: "subtle" | "outline";
  /** @default "md" */
  size?: "sm" | "md";
  /** Between the keys. Apple keyboards write none. @default "+" elsewhere */
  separator?: string;
  id?: string;
}

/**
 * A keyboard shortcut as the reader's own keyboard writes it.
 *
 * ```tsx
 * <Shortcut keys="Mod+K" />
 * <Shortcut keys={["Shift", "Enter"]} variant="outline" />
 * ```
 *
 * `Mod` is ⌘ on a Mac, an iPhone or an iPad and Ctrl elsewhere, and the other
 * modifiers follow. The server and the hydrating page write the names a PC
 * uses, so the two agree; an Apple device swaps in its symbols once it has
 * hydrated. Each key is ui's `Kbd`.
 */
export function Shortcut(props: ShortcutProps) {
  const [apple, setApple] = createSignal(false, { ownedWrite: true });
  if (!isServer) {
    createEffect(
      () => true,
      () => {
        setApple(isAppleDevice());
      },
    );
  }
  const keys = (): readonly string[] =>
    typeof props.keys === "string" ? props.keys.split("+").filter((one) => one !== "") : props.keys;
  const separator = (): string => props.separator ?? (apple() ? "" : "+");
  const cls = (): Slots =>
    parts(shortcutStyles({ variant: props.variant, size: props.size }), props.classes);
  return (
    <KbdGroup
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="shortcut"
      data-platform={apple() ? "apple" : "other"}
    >
      <For each={() => keys().map((key, at) => ({ key, at }))}>
        {(entry: { key: string; at: number }) => (
          <>
            <Show when={entry.at > 0 && separator() !== ""}>
              <span class={cls().separator} data-slot="shortcut-separator" aria-hidden="true">
                {separator()}
              </span>
            </Show>
            <Kbd class={cls().key} data-slot="shortcut-key">
              {keyLabel(entry.key, apple())}
            </Kbd>
          </>
        )}
      </For>
    </KbdGroup>
  );
}
