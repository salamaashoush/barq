import { type Accessor, type Child, Show, createSignal } from "@barqjs/core";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@barqjs/ui/context-menu";

import { type } from "@barqjs/arc/style";

import { diagramLayer as d } from "./layer.ts";
import { menuItem, menuSurface } from "./styles.ts";

/** Pointer travel before a press becomes a drag. */
const DRAG_THRESHOLD = 10;
/** A fast, sloppy click travels far: a drag also waits this long after the press. */
const DRAG_TIME_THRESHOLD_MS = 100;

const ghostStyle =
  "position:fixed;z-index:2147483647;pointer-events:none;margin:0;opacity:0.9;" +
  "transform:translate(-50%, -50%) scale(1.1);box-shadow:0 4px 12px rgb(0 0 0 / 0.25)";

export interface TopPicksDragState<T> {
  value: T;
  /** The strip's slot dragged from, or `null` for a value from outside it. */
  from: number | null;
  /** The slot under the pointer: the one replaced, or where a pick moves to. */
  overIndex: number | null;
  /** A slot already holding the value, which a drop elsewhere would duplicate. */
  duplicateIndex: number | null;
}

export interface TopPicksDnD<T> {
  /** The drag under way, for the strip to show where it lands. */
  dragging: Accessor<TopPicksDragState<T> | null>;
  /** The strip, whose slots carry `data-top-pick-index`. */
  setStrip: (element: HTMLElement | null) => void;
  /** Starts a possible drag from a value: a palette colour, a font, or (`from`) a pick itself. */
  onPointerDown: (value: T, from?: number | null) => (event: PointerEvent) => void;
}

export interface CreateTopPicksDnDOptions<T> {
  enabled: () => boolean;
  picks: () => readonly T[];
  onChange: (picks: T[]) => void;
  equals?: (a: T, b: T) => boolean;
}

/**
 * Pinning values to a picker's quick picks by dragging, Excalidraw's
 * `useTopPicksDnD`: a value dropped on a slot of the strip replaces it, a
 * pick dropped on another slot moves there, a value already pinned elsewhere
 * is not pinned twice, and Escape gives up. A ghost of what is dragged follows
 * the pointer; the press that started the drag is no click.
 */
export function createTopPicksDnD<T>(options: CreateTopPicksDnDOptions<T>): TopPicksDnD<T> {
  const [dragging, setDragging] = createSignal<TopPicksDragState<T> | null>(null);
  let strip: HTMLElement | null = null;
  const equals = options.equals ?? ((a: T, b: T) => a === b);

  function slotAt(x: number, y: number): number | null {
    if (!strip) return null;
    for (const slot of strip.querySelectorAll<HTMLElement>("[data-top-pick-index]")) {
      const rect = slot.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return Number(slot.dataset.topPickIndex);
      }
    }
    return null;
  }

  function drop(state: TopPicksDragState<T>): void {
    const { overIndex, from, value, duplicateIndex } = state;
    if (overIndex === null) return;
    const picks = [...options.picks()];
    if (from !== null) {
      if (from === overIndex) return;
      const [moved] = picks.splice(from, 1);
      if (moved === undefined) return;
      picks.splice(overIndex, 0, moved);
    } else {
      if (duplicateIndex !== null) return;
      picks[overIndex] = value;
    }
    options.onChange(picks);
  }

  function onPointerDown(value: T, from: number | null = null) {
    return (event: PointerEvent): void => {
      if (!options.enabled() || event.button !== 0 || !event.isPrimary) return;
      const source = event.currentTarget as HTMLElement;
      const document = source.ownerDocument;
      const view = document.defaultView ?? window;
      const start = { x: event.clientX, y: event.clientY, time: event.timeStamp || Date.now() };
      let ghost: HTMLElement | null = null;
      let state: TopPicksDragState<T> | null = null;

      function place(x: number, y: number): void {
        if (!ghost) return;
        ghost.style.left = `${x}px`;
        ghost.style.top = `${y}px`;
      }
      function update(x: number, y: number): void {
        if (!state) return;
        const overIndex = slotAt(x, y);
        const pinnedAt = options.picks().findIndex((pick) => equals(pick, value));
        state = {
          ...state,
          overIndex,
          duplicateIndex:
            from === null && pinnedAt !== -1 && overIndex !== null && pinnedAt !== overIndex
              ? pinnedAt
              : null,
        };
        setDragging(state);
        place(x, y);
      }
      function activate(x: number, y: number): void {
        ghost = source.cloneNode(true) as HTMLElement;
        ghost.removeAttribute("id");
        ghost.setAttribute("aria-hidden", "true");
        ghost.removeAttribute("data-testid");
        ghost.style.cssText += `;${ghostStyle}`;
        document.body.append(ghost);
        state = { value, from, overIndex: null, duplicateIndex: null };
        update(x, y);
      }
      function finish(): void {
        view.removeEventListener("pointermove", onMove, true);
        view.removeEventListener("pointerup", onUp, true);
        view.removeEventListener("pointercancel", onCancel, true);
        view.removeEventListener("keydown", onKey, true);
        ghost?.remove();
        ghost = null;
        state = null;
        setDragging(null);
      }
      function onMove(moveEvent: PointerEvent): void {
        if (moveEvent.pointerId !== event.pointerId) return;
        if (state) {
          moveEvent.preventDefault();
          update(moveEvent.clientX, moveEvent.clientY);
          return;
        }
        const distance = Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y);
        const held = (moveEvent.timeStamp || Date.now()) - start.time;
        if (distance >= DRAG_THRESHOLD && held >= DRAG_TIME_THRESHOLD_MS) {
          activate(moveEvent.clientX, moveEvent.clientY);
        }
      }
      function onUp(upEvent: PointerEvent): void {
        if (upEvent.pointerId !== event.pointerId) return;
        const finished = state;
        if (finished) {
          // the press was a drag: a click that follows at once picks nothing
          function suppress(click: MouseEvent): void {
            click.preventDefault();
            click.stopPropagation();
          }
          view.addEventListener("click", suppress, { capture: true, once: true });
          setTimeout(() => view.removeEventListener("click", suppress, true), 0);
          drop({ ...finished, overIndex: slotAt(upEvent.clientX, upEvent.clientY) });
        }
        finish();
      }
      function onCancel(): void {
        return finish();
      }
      function onKey(keyEvent: KeyboardEvent): void {
        if (keyEvent.key === "Escape" && state) {
          keyEvent.preventDefault();
          keyEvent.stopPropagation();
          finish();
        }
      }
      view.addEventListener("pointermove", onMove, true);
      view.addEventListener("pointerup", onUp, true);
      view.addEventListener("pointercancel", onCancel, true);
      view.addEventListener("keydown", onKey, true);
    };
  }

  return {
    dragging,
    setStrip: (element) => {
      strip = element;
    },
    onPointerDown,
  };
}

const tip = d(type.meta, {
  "& button": {
    padding: "0",
    border: "none",
    background: "none",
    color: "var(--primary)",
    font: "inherit",
    textDecoration: "underline",
    cursor: "pointer",
  },
});

export interface TopPicksTipProps {
  tip: string;
  resetLabel: string;
  onReset?: () => void;
}

/** The hint under a picker whose quick picks can be pinned, with a reset while they are. */
export function TopPicksTip(props: TopPicksTipProps) {
  return (
    <div class={tip} data-testid="top-picks-tip">
      {props.tip}
      <Show when={props.onReset}>
        {" · "}
        <button
          type="button"
          title={props.resetLabel}
          onPointerDown={(event: PointerEvent) => event.preventDefault()}
          onClick={() => props.onReset?.()}
          data-testid="top-picks-reset"
        >
          {props.resetLabel}
        </button>
      </Show>
    </div>
  );
}

export interface TopPicksMenuProps {
  children: Child;
  customizable: boolean;
  customized: boolean;
  resetLabel: string;
  onReset: () => void;
}

/** The quick picks with a context menu resetting them to the defaults, when they can be customised. */
export function TopPicksMenu(props: TopPicksMenuProps) {
  return (
    <Show when={props.customizable} fallback={props.children}>
      <ContextMenu>
        <ContextMenuTrigger>{props.children}</ContextMenuTrigger>
        <ContextMenuContent class={menuSurface} aria-label={props.resetLabel}>
          <ContextMenuItem
            class={menuItem}
            isDisabled={!props.customized}
            onAction={() => props.onReset()}
            data-testid="top-picks-reset-menu"
          >
            {props.resetLabel}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </Show>
  );
}
