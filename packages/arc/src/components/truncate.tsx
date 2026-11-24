import { type Child, Show, createEffect, createSignal, createUniqueId } from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { variants } from "@barqjs/css";
import { Button as AriaButton } from "@barqjs/aria/button";
import { resizeObserver } from "@barqjs/primitives/observers";
import { ref as makeRef } from "@barqjs/primitives/refs";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  edge,
  fg,
  focus,
  interaction,
  layout,
  rounded,
  target,
  truncate,
  type,
} from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

export const truncateStyles = variants({
  slots: {
    root: arc(layout.minZero, { display: "block" }),
    text: arc({ display: "block", overflowWrap: "anywhere" }),
    toggle: arc(
      type.label,
      fg.link,
      bg.transparent,
      edge.none,
      rounded.xs,
      focus.visible,
      target.size,
      interaction.pressable,
      { padding: "0", textAlign: "start" },
    ),
  },
  variants: {
    lines: {
      1: { text: truncate },
      2: { text: layout.clamp2 },
      3: { text: layout.clamp3 },
      4: { text: arc(layout.clamp3, { "-webkit-line-clamp": "4" }) },
      5: { text: arc(layout.clamp3, { "-webkit-line-clamp": "5" }) },
    },
    open: { true: { text: arc({ display: "block", whiteSpace: "normal" }) }, false: {} },
  },
  defaults: { lines: 1, open: false },
});

type Slots = ReturnType<typeof truncateStyles>;

export interface TruncateProps extends Customisable<Slots> {
  children?: Child;
  /** How many lines show before it is cut. @default 1 */
  lines?: 1 | 2 | 3 | 4 | 5;
  /**
   * A button that shows the rest, drawn only while the text is cut. Without
   * it, the whole text is the element's `title` while it is cut. @default true
   */
  expandable?: boolean;
  /** Shown in full: the caller's. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** @default the provider's `showMore` and `showLess` */
  moreLabel?: string;
  lessLabel?: string;
  id?: string;
}

/**
 * Text cut to a few lines with a way to read the rest.
 *
 * ```tsx
 * <Truncate lines={3}>{comment.body}</Truncate>
 * <Truncate expandable={false}>{project.name}</Truncate>
 * ```
 *
 * The button appears only once the text is measured as cut, so a short line
 * has none, and it is a press, never a hover, so a touch screen reads the rest
 * as easily as a mouse. The server writes the text cut and no button; the
 * browser measures and adds it after hydration.
 */
export function Truncate(props: TruncateProps) {
  const messages = useArcMessages();
  const textId = createUniqueId();
  const node = makeRef<HTMLElement>();
  const [cut, setCut] = createSignal(false, { ownedWrite: true });
  const [own, setOwn] = createSignal(props.defaultOpen ?? false);
  const open = (): boolean => props.open ?? own();
  const setOpen = (next: boolean): void => {
    setOwn(next);
    props.onOpenChange?.(next);
  };
  const measure = (element: HTMLElement | null, shown: boolean): void => {
    if (element === null || shown) return;
    setCut(
      element.scrollHeight > element.clientHeight + 1 ||
        element.scrollWidth > element.clientWidth + 1,
    );
  };
  resizeObserver(
    () => node(),
    () => measure(node(), open()),
  );
  if (!isServer) {
    createEffect(
      () => [node(), open()] as const,
      ([element, shown]) => measure(element, shown),
    );
  }
  const cls = (): Slots =>
    parts(truncateStyles({ lines: props.lines ?? 1, open: open() }), props.classes);
  const shows = (): boolean => props.expandable !== false && (cut() || open());

  return (
    <span
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="truncate"
      data-cut={cut() && !open() ? "" : undefined}
      data-open={open() ? "" : undefined}
    >
      <span
        ref={node.set}
        class={cls().text}
        id={textId}
        data-slot="truncate-text"
        title={props.expandable === false && cut() ? (node()?.textContent ?? undefined) : undefined}
      >
        {props.children}
      </span>
      <Show when={shows()}>
        <AriaButton
          class={cls().toggle}
          data-slot="truncate-toggle"
          aria-expanded={open()}
          aria-controls={textId}
          onPress={() => setOpen(!open())}
        >
          {open()
            ? (props.lessLabel ?? messages().showLess)
            : (props.moreLabel ?? messages().showMore)}
        </AriaButton>
      </Show>
    </span>
  );
}
