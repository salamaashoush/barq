import {
  context,
  getContext,
  getOwner,
  provide,
  signal,
  type Child,
  type Incoming,
} from "@barqjs/core";
import { layer } from "@barqjs/css";
import { GripVertical } from "@barqjs/lucide/icons/grip-vertical";
import { ref as makeRef } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import { uiProps } from "../lib/slot.ts";

import type { UiProps } from "../lib/props.ts";

const ui = layer("barq.ui");

const group_ = ui({
  display: "flex",
  height: "100%",
  width: "100%",
  '[aria-orientation="vertical"]': {
    flexDirection: "column",
  },
});

const handle = ui({
  position: "relative",
  display: "flex",
  width: "1px",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "var(--border)",
  "::after": {
    content: "var(--ui-content)",
    position: "absolute",
    insetBlock: "0px",
    left: "calc(1 / 2 * 100%)",
    width: "var(--spacing)",
    "--ui-translate-x": "calc(calc(1 / 2 * 100%) * -1)",
    translate: "var(--ui-translate-x) var(--ui-translate-y)",
  },
  ":focus-visible": {
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(1px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    "--ui-ring-color": "var(--ring)",
    "--ui-ring-offset-width": "1px",
    "--ui-ring-offset-shadow":
      "var(--ui-ring-inset,) 0 0 0 var(--ui-ring-offset-width) var(--ui-ring-offset-color)",
    "--ui-outline-style": "none",
    outlineStyle: "none",
    "@media (forced-colors: active)": {
      outline: "2px solid transparent",
      outlineOffset: "2px",
    },
  },
  '[aria-orientation="horizontal"]': {
    height: "1px",
    width: "100%",
  },
  '[aria-orientation="horizontal"]::after': {
    content: "var(--ui-content)",
    left: "0px",
    height: "var(--spacing)",
    width: "100%",
    "--ui-translate-x": "0px",
    translate: "var(--ui-translate-x) var(--ui-translate-y)",
    "--ui-translate-y": "calc(calc(1 / 2 * 100%) * -1)",
  },
  "[aria-orientation=horizontal] > div": {
    rotate: "90deg",
  },
});

const grip = ui({
  zIndex: "10",
  display: "flex",
  height: "calc(var(--spacing) * 4)",
  width: "calc(var(--spacing) * 3)",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "var(--radius-xs)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  backgroundColor: "var(--border)",
});

const gripIcon = ui({
  width: "calc(var(--spacing) * 2.5)",
  height: "calc(var(--spacing) * 2.5)",
});

export type ResizeDirection = "horizontal" | "vertical";

interface PanelGroupValue {
  readonly direction: () => ResizeDirection;
  /** Every panel's size as a PERCENTAGE, in order. */
  readonly sizes: () => number[];
  /** Registers a panel and returns its index, which is what a handle divides. */
  readonly register: (defaultSize: number | undefined, min: number, max: number) => number;
  readonly limits: () => { min: number; max: number }[];
  readonly setSizes: (next: number[]) => void;
  readonly containerRef: ReturnType<typeof makeRef<HTMLDivElement>>;
}

const GroupContext = context<PanelGroupValue | null>(null);
const IndexContext = context<number | null>(null);

function useGroup(): PanelGroupValue {
  const value = getContext(GroupContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a <ResizablePanelGroup>.");
  }
  return value;
}

export interface ResizablePanelGroupProps extends UiProps {
  /** @default "horizontal" */
  direction?: ResizeDirection;
  onLayout?: (sizes: number[]) => void;
}

/**
 * ```tsx
 * <ResizablePanelGroup direction="horizontal">
 *   <ResizablePanel defaultSize={30}>…</ResizablePanel>
 *   <ResizableHandle withHandle />
 *   <ResizablePanel>…</ResizablePanel>
 * </ResizablePanelGroup>
 * ```
 *
 * shadcn's is `react-resizable-panels`, which is React, so this is written.
 * That is a smaller claim than it sounds: a panel group is a row of
 * `flex-basis` percentages and a pointer drag that moves one number into its
 * neighbour, and the whole engine below is the clamping that keeps the sum at
 * a hundred.
 *
 * Sizes are PERCENTAGES rather than pixels, which is what makes the layout
 * survive the container being resized: pixels would need re-measuring on every
 * resize and would drift as they were rounded.
 */
export function ResizablePanelGroup(props: Incoming<ResizablePanelGroupProps>) {
  const containerRef = makeRef<HTMLDivElement>();
  const sizes = signal<number[]>([]);
  const limits = signal<{ min: number; max: number }[]>([]);
  const declared: (number | undefined)[] = [];

  const value: PanelGroupValue = {
    direction: () => props.direction?.() ?? "horizontal",
    sizes,
    limits,
    containerRef,
    register(defaultSize, min, max) {
      const index = declared.length;
      declared.push(defaultSize);
      limits.set([...limits(), { min, max }]);
      // Whatever is left over, split between the panels that named no size.
      const named = declared.filter((each): each is number => each !== undefined);
      const spare = Math.max(0, 100 - named.reduce((sum, each) => sum + each, 0));
      const unnamed = declared.filter((each) => each === undefined).length;
      sizes.set(declared.map((each) => each ?? (unnamed === 0 ? 0 : spare / unnamed)));
      return index;
    },
    setSizes(next) {
      sizes.set(next);
      props.onLayout?.()?.(next);
    },
  };

  return (
    <div
      {...uiProps("resizable-panel-group", group_, props)}
      ref={containerRef.set}
      // `aria-orientation` and not a `data-*`, because shadcn's own rules select
      // on it: `aria-[orientation=vertical]:flex-col` is what turns the row into
      // a column, so this attribute is the layout rather than a label for it.
      aria-orientation={() => value.direction()}
    >
      <GroupProvider value={value}>{props.children}</GroupProvider>
    </div>
  );
}

/** The context, and nothing else; see the note in `input-otp.tsx`. */
function GroupProvider(props: Incoming<{ value: PanelGroupValue; children?: Child }>) {
  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;
  return provide(
    owner,
    GroupContext,
    () => props.value(),
    () => props.children,
  ) as never;
}

export interface ResizablePanelProps extends UiProps {
  /** A percentage. Panels that name none share what is left. */
  defaultSize?: number;
  /** @default 10 */
  minSize?: number;
  /** @default 90 */
  maxSize?: number;
}

export function ResizablePanel(props: Incoming<ResizablePanelProps>) {
  const group = useGroup();
  const index = group.register(
    props.defaultSize?.(),
    props.minSize?.() ?? 10,
    props.maxSize?.() ?? 90,
  );

  return (
    <div
      {...uiProps("resizable-panel", "", props)}
      style={() => {
        const size = group.sizes()[index] ?? 0;
        // `flex-basis` with no grow and no shrink, so the percentage IS the
        // size. `width` would be ignored the moment the container is a flex row.
        return Object.fromEntries([
          ["flex", `0 0 ${String(size)}%`],
          ["overflow", "hidden"],
        ]);
      }}
    >
      <IndexProvider value={index}>{props.children}</IndexProvider>
    </div>
  );
}

function IndexProvider(props: Incoming<{ value: number; children?: Child }>) {
  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;
  return provide(
    owner,
    IndexContext,
    () => props.value(),
    () => props.children,
  ) as never;
}

export interface ResizableHandleProps extends UiProps {
  /** Draw the grip, which is what makes a one-pixel line findable. */
  withHandle?: boolean;
}

/**
 * The divider between two panels, and the thing that resizes them.
 *
 * A `separator` with `aria-valuenow`, because a keyboard has to be able to move
 * it: arrows nudge by one percent and Home and End send it to the panel's
 * limits. A drag that only works with a pointer is a control half the people
 * using it cannot reach.
 */
export function ResizableHandle(props: Incoming<ResizableHandleProps>) {
  const group = useGroup();
  const dividing = signal<number | null>(null);

  /** Which pair this handle sits between, worked out from the DOM at drag time. */
  const pairOf = (element: HTMLElement): number => {
    const siblings = [...(element.parentElement?.children ?? [])];
    const before = siblings.slice(0, siblings.indexOf(element));
    return (
      before.filter((each) => (each as HTMLElement).dataset["slot"] === "resizable-panel").length -
      1
    );
  };

  const move = (at: number, delta: number): void => {
    const sizes = [...group.sizes()];
    const limits = group.limits();
    const first = sizes[at];
    const second = sizes[at + 1];
    if (first === undefined || second === undefined) return;

    const one = limits[at] ?? { min: 10, max: 90 };
    const two = limits[at + 1] ?? { min: 10, max: 90 };
    // Clamped against BOTH panels: the pair's total is fixed, so a move the
    // first would allow can still be one the second will not.
    const low = Math.max(one.min, first + second - two.max);
    const high = Math.min(one.max, first + second - two.min);
    const next = Math.min(high, Math.max(low, first + delta));

    sizes[at] = next;
    sizes[at + 1] = first + second - next;
    group.setSizes(sizes);
  };

  const percentOf = (pixels: number): number => {
    const container = group.containerRef();
    if (container === null || container === undefined) return 0;
    const whole =
      group.direction() === "horizontal" ? container.clientWidth : container.clientHeight;
    return whole === 0 ? 0 : (pixels / whole) * 100;
  };

  return (
    <div
      {...uiProps("resizable-handle", handle, props)}
      role="separator"
      tabIndex={0}
      aria-orientation={() => (group.direction() === "horizontal" ? "vertical" : "horizontal")}
      aria-valuenow={() => {
        const at = dividing();
        return at === null ? undefined : Math.round(group.sizes()[at] ?? 0);
      }}
      onPointerDown={(event: PointerEvent) => {
        const element = event.currentTarget as HTMLElement;
        const at = pairOf(element);
        dividing.set(at);
        element.setPointerCapture(event.pointerId);
        let last = group.direction() === "horizontal" ? event.clientX : event.clientY;

        const onMove = (next: PointerEvent): void => {
          const now = group.direction() === "horizontal" ? next.clientX : next.clientY;
          move(at, percentOf(now - last));
          last = now;
        };
        const onUp = (): void => {
          element.removeEventListener("pointermove", onMove);
          element.removeEventListener("pointerup", onUp);
        };
        element.addEventListener("pointermove", onMove);
        element.addEventListener("pointerup", onUp);
      }}
      onKeyDown={(event: KeyboardEvent) => {
        const element = event.currentTarget as HTMLElement;
        const at = pairOf(element);
        const horizontal = group.direction() === "horizontal";
        const step = horizontal
          ? { ArrowLeft: -1, ArrowRight: 1 }[event.key]
          : { ArrowUp: -1, ArrowDown: 1 }[event.key];
        if (step !== undefined) {
          event.preventDefault();
          dividing.set(at);
          move(at, step);
          return;
        }
        if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          dividing.set(at);
          move(at, event.key === "Home" ? -100 : 100);
        }
      }}
    >
      {props.withHandle?.() === true ? (
        <div class={grip} data-slot="resizable-handle-grip">
          <GripVertical class={gripIcon} />
        </div>
      ) : null}
    </div>
  );
}
