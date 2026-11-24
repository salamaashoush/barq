import { type Child, Show, createSignal, onSettled } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { type MoveMoveEvent, move } from "@barqjs/aria/interactions";
import { GripHorizontal } from "@barqjs/lucide/icons/grip-horizontal";
import { Maximize2 } from "@barqjs/lucide/icons/maximize-2";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { on } from "@barqjs/ui/conditions";

import { IconButton } from "../components/icon-button.tsx";
import { useArcMessages } from "../components/messages.ts";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  control,
  focus,
  gap,
  interaction,
  layout,
  rounded,
  space,
  surface,
  target,
  truncate,
  type,
  place,
} from "../style/index.ts";

export const callWindowStyles = variants({
  slots: {
    // Fixed in the corner at the reading end until it is moved, so a server
    // and a hydrating page place it with no script.
    root: arc(
      surface.elevated,
      rounded.lg,
      layout.column,
      layout.clip,
      place.floating,
      place.endCorner,
      {
        inlineSize: { default: "min(16rem, calc(100vw - 2rem))", [on.md]: "20rem" },
      },
    ),
    header: arc(layout.row, gap[1], type.label, {
      paddingInline: space.x1,
      paddingBlock: space.x0_5,
    }),
    handle: arc(
      control.bare,
      layout.centre,
      rounded.md,
      focus.visible,
      target.size,
      interaction.draggable,
    ),
    title: arc(layout.grow, layout.minZero, truncate),
    body: arc(layout.relative, { aspectRatio: "16 / 9" }),
  },
});

type Slots = ReturnType<typeof callWindowStyles>;

export interface CallWindowProps extends Customisable<Slots> {
  /** What it shows: a `CallStage` with `compact`. */
  children: Child;
  /** Above the call: the conversation's name. */
  title?: Child;
  /** Return to the full call. Leave it out for no button. */
  onExpand?: () => void;
  /** Beside the title: a mute button, Leave. */
  actions?: Child;
  /** Names the window. @default arc's "Call window" */
  "aria-label"?: string;
}

/** How far a key press moves the window, in px; Shift moves it further. */
const STEP = 16;
const LEAP = 64;
/** The room kept between the window and the viewport's edges, in px. */
const MARGIN = 8;

/**
 * A small window over the page for a call going on while the reader is
 * elsewhere in the app, which they drag where it is out of the way.
 *
 * ```tsx
 * <Show when={inCall() && !onCallPage()}>
 *   <CallWindow title="#design" onExpand={() => navigate("/call")}>
 *     <CallStage compact participants={participants()} />
 *   </CallWindow>
 * </Show>
 * ```
 *
 * It opens in the bottom corner at the end of the line, so on the left in
 * a right-to-left page. Its grip drags it by pointer or finger, and moves it
 * with the arrow keys, further with Shift; wherever it goes, and as the
 * window resizes, it is kept inside the viewport.
 */
export function CallWindow(props: CallWindowProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(callWindowStyles(), props.classes);
  const root = makeRef<HTMLElement>();
  // Unset until it is first moved: the stylesheet's corner holds until then.
  const [at, setAt] = createSignal<{ x: number; y: number } | null>(null, { ownedWrite: true });

  const clamp = (x: number, y: number): { x: number; y: number } => {
    const element = root();
    const view = element?.ownerDocument.defaultView;
    if (element === null || view === null || view === undefined) return { x, y };
    const most = {
      x: Math.max(MARGIN, view.innerWidth - element.offsetWidth - MARGIN),
      y: Math.max(MARGIN, view.innerHeight - element.offsetHeight - MARGIN),
    };
    return {
      x: Math.min(most.x, Math.max(MARGIN, x)),
      y: Math.min(most.y, Math.max(MARGIN, y)),
    };
  };

  const current = (): { x: number; y: number } => {
    const held = at();
    if (held !== null) return held;
    const box = root()?.getBoundingClientRect();
    return { x: box?.left ?? 0, y: box?.top ?? 0 };
  };

  const { moveProps } = move({
    onMove: (event: MoveMoveEvent) => {
      const step = event.pointerType === "keyboard" ? (event.shiftKey ? LEAP : STEP) : 1;
      const from = current();
      setAt(clamp(from.x + event.deltaX * step, from.y + event.deltaY * step));
    },
  });

  onSettled(() => {
    const view = root()?.ownerDocument.defaultView;
    if (view === null || view === undefined) return undefined;
    const keep = (): void => {
      const held = at();
      if (held !== null) setAt(clamp(held.x, held.y));
    };
    view.addEventListener("resize", keep);
    return () => view.removeEventListener("resize", keep);
  });

  const placed = (): Record<string, string> | undefined => {
    const held = at();
    if (held === null) return undefined;
    // Physical, as the pointer moves: the logical corner no longer applies.
    return {
      left: `${String(held.x)}px`,
      top: `${String(held.y)}px`,
      right: "auto",
      bottom: "auto",
    };
  };

  return (
    <section
      ref={root.set}
      class={arc(cls().root, props.class, props.className)}
      data-slot="call-window"
      data-moved={at() === null ? undefined : ""}
      aria-label={props["aria-label"] ?? messages().callWindow}
      style={placed()}
    >
      <div class={cls().header} data-slot="call-window-header">
        <button
          type="button"
          class={cls().handle}
          data-slot="call-window-handle"
          aria-label={messages().moveCallWindow}
          {...moveProps}
        >
          <GripHorizontal aria-hidden="true" />
        </button>
        <span class={cls().title} data-slot="call-window-title">
          {props.title}
        </span>
        {props.actions}
        <Show when={props.onExpand !== undefined}>
          <IconButton
            label={messages().returnToCall}
            size="sm"
            tooltip={false}
            onPress={() => props.onExpand?.()}
          >
            <Maximize2 aria-hidden="true" />
          </IconButton>
        </Show>
      </div>
      <div class={cls().body} data-slot="call-window-body">
        {props.children}
      </div>
    </section>
  );
}
