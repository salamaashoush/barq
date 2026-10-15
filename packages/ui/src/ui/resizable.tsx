import type { ReadingDirection } from "@barqjs/aria/i18n";
import {
  splitterHandle,
  splitterPanel,
  splitterState,
  type PanelSize,
  type SplitterPanelHandle,
  type SplitterSize,
  type SplitterState,
  type SplitterStorage,
} from "@barqjs/aria/splitter";
import { mergeProps } from "@barqjs/aria/utils";
import {
  createContext,
  createUniqueId,
  getContext,
  onCleanup,
  provide,
  type Child,
  type Incoming,
} from "@barqjs/core";
import { layer } from "@barqjs/css";
import { GripVertical } from "@barqjs/lucide/icons/grip-vertical";
import { mergeRefs, ref as makeRef, type RefTarget } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import { omit, uiProps } from "../lib/slot.ts";

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
  cursor: "col-resize",
  // A touch that starts on the divider is a drag of the divider: without
  // these the page scrolls under it, or selects the text on either side.
  touchAction: "none",
  "-webkit-user-select": "none",
  userSelect: "none",
  // `ring-offset-background`: the gap the focus ring leaves is the page, not
  // the handle's own hairline, or the ring reads as a second divider.
  "--ui-ring-offset-color": "var(--background)",
  "::after": {
    content: "var(--ui-content)",
    position: "absolute",
    insetBlock: "0px",
    // Centred by its own offset rather than by `left: 50%` and a translate,
    // which only centres from the left edge.
    insetInlineStart: "calc(50% - var(--spacing) / 2)",
    width: "var(--spacing)",
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
    cursor: "row-resize",
  },
  '[aria-disabled="true"]': {
    cursor: "default",
  },
  '[aria-orientation="horizontal"]::after': {
    content: "var(--ui-content)",
    insetInlineStart: "0px",
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
export type ResizableSize = SplitterSize;
export type ResizablePanelSize = PanelSize;
export type ResizablePanelHandle = SplitterPanelHandle;
export type ResizableStorage = SplitterStorage;
export type ResizableLayout = Record<string, number>;

/** What a caller holding the group can do to it. */
export interface ResizableGroupHandle {
  getId(): string;
  getLayout(): ResizableLayout;
  setLayout(layout: Readonly<ResizableLayout> | readonly number[]): void;
}

const GroupContext = createContext<SplitterState | null>(null);

function useGroup(): SplitterState {
  const value = getContext(GroupContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a <ResizablePanelGroup>.");
  }
  return value;
}

/** Hand a value to a `ref`-shaped prop, and take it back when the owner goes. */
function lend<T>(target: RefTarget<T | null>, value: T): void {
  if (target === null || target === undefined) return;
  const give = mergeRefs<T | null>(target);
  give(value);
  onCleanup(() => give(null));
}

export interface ResizablePanelGroupProps extends UiProps {
  id?: string;
  /** @default "horizontal" */
  direction?: ResizeDirection;
  /** The same as `direction`, under the name upstream uses; it wins when both are given. */
  orientation?: ResizeDirection;
  /** No handle moves. */
  disabled?: boolean;
  /** How far an arrow key moves a handle, as a percentage. @default 1 */
  keyboardResizeBy?: number;
  /** Remember the layout under this name and start from it the next time. */
  autoSaveId?: string;
  /** Where `autoSaveId` keeps it. @default localStorage */
  storage?: ResizableStorage;
  /** Sizes by panel id, used when every panel present is named in it. */
  defaultLayout?: Readonly<ResizableLayout>;
  groupRef?: RefTarget<ResizableGroupHandle | null>;
  /** Every change, as a list in panel order. */
  onLayout?: (sizes: number[]) => void;
  /** Every change, by panel id. */
  onLayoutChange?: (layout: ResizableLayout) => void;
  /** Once per interaction: after a key press or a call, and when a drag ends. */
  onLayoutChanged?: (layout: ResizableLayout) => void;
}

/**
 * ```tsx
 * <ResizablePanelGroup orientation="horizontal">
 *   <ResizablePanel defaultSize={30}>…</ResizablePanel>
 *   <ResizableHandle withHandle />
 *   <ResizablePanel>…</ResizablePanel>
 * </ResizablePanelGroup>
 * ```
 *
 * shadcn's is `react-resizable-panels`, which is React, so the engine is
 * `@barqjs/aria/splitter` and this is its shape and its look.
 *
 * Sizes are PERCENTAGES rather than pixels, which is what makes the layout
 * survive the container being resized: pixels would need re-measuring on every
 * resize and would drift as they were rounded. A bare number is a percentage
 * here; a limit in another unit is written as a string, `"240px"`.
 */
export function ResizablePanelGroup(props: Incoming<ResizablePanelGroupProps>) {
  const containerRef = makeRef<HTMLDivElement>();
  const generated = createUniqueId();
  const id = (): string => props.id?.() ?? generated;
  const direction = (): ReadingDirection | undefined => {
    const dir = props.dir?.();
    return dir === "auto" ? undefined : dir;
  };

  const state = splitterState({
    ref: containerRef,
    orientation: () => props.orientation?.() ?? props.direction?.() ?? "horizontal",
    direction,
    isDisabled: () => props.disabled?.(),
    keyboardResizeBy: () => props.keyboardResizeBy?.() ?? 1,
    autoSaveId: () => props.autoSaveId?.(),
    storage: () => props.storage?.(),
    defaultLayout: () => props.defaultLayout?.(),
    onLayoutChange(layout, sizes) {
      props.onLayout?.()?.(sizes);
      props.onLayoutChange?.()?.(layout);
    },
    onLayoutChanged: (layout) => props.onLayoutChanged?.()?.(layout),
  });

  lend<ResizableGroupHandle>(props.groupRef?.(), {
    getId: id,
    getLayout: () => state.getLayout(),
    setLayout: (layout) => state.setLayout(layout),
  });

  return (
    <div
      {...uiProps("resizable-panel-group", group_, omit(props, ["id", "dir"]))}
      ref={mergeRefs(containerRef.set, props.ref?.())}
      id={id()}
      dir={direction()}
      // `aria-orientation` and not a `data-*`, because shadcn's own rules select
      // on it: `aria-[orientation=vertical]:flex-col` is what turns the row into
      // a column, so this attribute is the layout rather than a label for it.
      aria-orientation={() => state.orientation()}
      data-orientation={() => state.orientation()}
      data-group=""
      data-panel-group=""
      data-panel-group-direction={() => state.orientation()}
      data-panel-group-id={id()}
      data-disabled={() => (state.isDisabled() ? "" : undefined)}
    >
      <GroupProvider value={state}>{props.children}</GroupProvider>
    </div>
  );
}

/** The context, and nothing else; see the note in `input-otp.tsx`. */
function GroupProvider(props: Incoming<{ value: SplitterState; children?: Child }>) {
  return provide(
    GroupContext,
    () => props.value(),
    () => props.children,
  );
}

export interface ResizablePanelProps extends UiProps {
  /** A percentage, or a length as a string. Panels that name none share what is left. */
  defaultSize?: ResizableSize;
  /** @default 10 */
  minSize?: ResizableSize;
  /** @default 100 */
  maxSize?: ResizableSize;
  /** Whether it snaps shut when it is made smaller than `minSize`. */
  collapsible?: boolean;
  /** @default 0 */
  collapsedSize?: ResizableSize;
  panelRef?: RefTarget<ResizablePanelHandle | null>;
  onResize?: (
    size: ResizablePanelSize,
    id: string,
    previous: ResizablePanelSize | undefined,
  ) => void;
  onCollapse?: () => void;
  onExpand?: () => void;
}

export function ResizablePanel(props: Incoming<ResizablePanelProps>) {
  const group = useGroup();
  const domRef = makeRef<HTMLDivElement>();
  const given = props.id?.();
  const {
    panelProps,
    size,
    handle: api,
  } = splitterPanel(
    {
      id: given ?? createUniqueId(),
      isGeneratedId: given === undefined,
      ref: domRef,
      defaultSize: () => props.defaultSize?.(),
      minSize: () => props.minSize?.() ?? 10,
      maxSize: () => props.maxSize?.(),
      collapsible: () => props.collapsible?.(),
      collapsedSize: () => props.collapsedSize?.(),
      onResize: (now, id, previous) => props.onResize?.()?.(now, id, previous),
      onCollapse: () => props.onCollapse?.()?.(),
      onExpand: () => props.onExpand?.()?.(),
    },
    group,
  );

  lend(props.panelRef?.(), api);

  return (
    <div
      {...mergeProps(panelProps, uiProps("resizable-panel", "", omit(props, ["id"])))}
      ref={mergeRefs(domRef.set, props.ref?.())}
      style={() => ({
        ...props.style?.(),
        // `flex-basis` with no grow and no shrink, so the percentage IS the
        // size. `width` would be ignored the moment the container is a flex row.
        flex: `0 0 ${String(size())}%`,
        overflow: "hidden",
      })}
    >
      {props.children}
    </div>
  );
}

export interface ResizableHandleProps extends UiProps {
  /** Draw the grip, which is what makes a one-pixel line findable. */
  withHandle?: boolean;
  disabled?: boolean;
  onDragging?: (isDragging: boolean) => void;
}

/**
 * The divider between two panels, and the thing that resizes them.
 *
 * A `separator` with `aria-valuenow`, because a keyboard has to be able to move
 * it: arrows nudge it, Home and End send it to the panel's limits and Enter
 * collapses a collapsible panel and brings it back. A drag that only works with
 * a pointer is a control half the people using it cannot reach.
 */
export function ResizableHandle(props: Incoming<ResizableHandleProps>) {
  const group = useGroup();
  const domRef = makeRef<HTMLDivElement>();
  const given = props.id?.();
  const id = given ?? createUniqueId();
  const { separatorProps, isDragging, isHovered } = splitterHandle(
    {
      id,
      ref: domRef,
      isDisabled: () => props.disabled?.(),
      onDragging: (now) => props.onDragging?.()?.(now),
    },
    group,
  );

  return (
    <div
      {...mergeProps(separatorProps, uiProps("resizable-handle", handle, omit(props, ["id"])))}
      ref={mergeRefs(domRef.set, props.ref?.())}
      id={given}
      data-resize-handle=""
      data-panel-resize-handle-id={id}
      data-panel-group-direction={() => group.orientation()}
      data-resize-handle-state={() => (isDragging() ? "drag" : isHovered() ? "hover" : "inactive")}
    >
      {props.withHandle?.() === true ? (
        <div class={grip} data-slot="resizable-handle-grip">
          <GripVertical class={gripIcon} />
        </div>
      ) : null}
    </div>
  );
}
