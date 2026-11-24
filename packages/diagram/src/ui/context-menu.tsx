import { For, Show, createMemo, onCleanup } from "@barqjs/core";
import { Menu, MenuItem } from "@barqjs/aria/menu";
import { Check } from "@barqjs/lucide/icons/check";

import { CONTEXT_MENU_SEPARATOR, isContextMenuItem } from "../editor/context-menu.ts";
import { useDiagramUI } from "./context.tsx";
import { isShortcutName } from "./shortcuts.ts";
import { diagramLayer as d } from "./layer.ts";
import { floating, menuCheck, menuItem, menuShortcut, menuSurface } from "./styles.ts";

import type { Action } from "../editor/types.ts";

const placedMenu = d(floating, menuSurface);

/** How far from the container's edges the menu stays. */
const VIEWPORT_MARGIN = 8;

type Entry = { kind: "separator"; key: string } | { kind: "action"; key: string; action: Action };

interface MenuPosition {
  top: number;
  left: number;
}

/**
 * Excalidraw's context menu, for the canvas, an element or a selection: the
 * entries whose actions apply now, a tick on the toggles that are on, the
 * shortcut beside each. It opens where the right click was (or at the
 * selection, from the keyboard) with the first entry focused; Escape, a
 * choice or a click elsewhere closes it and gives the keyboard back to the
 * canvas.
 */
export function ContextMenu() {
  const ui = useDiagramUI();
  const store = ui.store;
  function menu() {
    return store.state("contextMenu");
  }

  const entries = createMemo((): Entry[] => {
    const state = menu();
    if (!state) return [];
    const items = state.items.filter(isContextMenuItem);
    const kept: Entry[] = [];
    items.forEach((item, index) => {
      if (item === CONTEXT_MENU_SEPARATOR) {
        // no separator first, or after another
        if (kept.length > 0 && kept.at(-1)?.kind !== "separator") {
          kept.push({ kind: "separator", key: `separator-${index}` });
        }
      } else if (ui.isEnabled(item)) {
        kept.push({ kind: "action", key: item.name, action: item });
      }
    });
    if (kept.at(-1)?.kind === "separator") kept.pop();
    return kept;
  });

  function close(refocus = true): void {
    const editor = store.editor;
    if (!editor) return;
    editor.batch(() => editor.setState({ contextMenu: null }));
    if (refocus) editor.focusContainer();
  }

  function run(action: Action): void {
    close();
    ui.run(action);
  }

  return (
    <Show when={menu()}>
      {(state: () => MenuPosition) => {
        let surface: HTMLDivElement | undefined;
        function position() {
          const { top, left } = state();
          const width = store.state("width");
          const height = store.state("height");
          return {
            // kept inside the editor, flipped against an edge it would cross
            top: `${Math.max(VIEWPORT_MARGIN, Math.min(top, height - VIEWPORT_MARGIN))}px`,
            left: `${Math.max(VIEWPORT_MARGIN, Math.min(left, width - VIEWPORT_MARGIN))}px`,
          };
        }
        function onPointerDown(event: PointerEvent): void {
          if (surface && !surface.contains(event.target as Node)) close(false);
        }
        const document = store.editor?.ownerDocument;
        document?.addEventListener("pointerdown", onPointerDown, true);
        onCleanup(() => document?.removeEventListener("pointerdown", onPointerDown, true));
        return (
          <div
            ref={(element: HTMLDivElement) => {
              surface = element;
              queueMicrotask(() => fitInside(element, store.state("width"), store.state("height")));
            }}
            class={placedMenu}
            style={position()}
            data-diagram-ui=""
            data-testid="context-menu"
            onContextMenu={(event: MouseEvent) => event.preventDefault()}
          >
            <Menu
              aria-label={ui.t("headings.canvasActions")}
              autoFocus="first"
              onClose={() => close()}
            >
              <For each={entries()}>
                {(entry: Entry) =>
                  entry.kind === "separator" ? (
                    <li role="separator" />
                  ) : (
                    <MenuItem
                      id={entry.key}
                      class={menuItem}
                      textValue={ui.label(entry.action)}
                      onAction={() => run(entry.action)}
                      data-variant={
                        entry.action.name === "deleteSelectedElements" ? "destructive" : undefined
                      }
                      data-testid={entry.action.name}
                      type={entry.action.checked ? "checkbox" : "item"}
                      isSelected={entry.action.checked?.(store.snapshot) ?? false}
                    >
                      <span class={menuCheck} aria-hidden="true">
                        <Show when={entry.action.checked?.(store.snapshot)}>
                          <Check />
                        </Show>
                      </span>
                      <span>{ui.label(entry.action)}</span>
                      <kbd class={menuShortcut}>
                        {isShortcutName(entry.action.name) ? ui.shortcut(entry.action.name) : ""}
                      </kbd>
                    </MenuItem>
                  )
                }
              </For>
            </Menu>
          </div>
        );
      }}
    </Show>
  );
}

/** Moves the menu back inside the editor when it would cross an edge, as Excalidraw's popover fits. */
function fitInside(element: HTMLElement, width: number, height: number): void {
  const rect = element.getBoundingClientRect();
  const parent = element.offsetParent?.getBoundingClientRect();
  if (!parent || rect.width === 0) return;
  const left = rect.left - parent.left;
  const top = rect.top - parent.top;
  if (left + rect.width > width - VIEWPORT_MARGIN) {
    element.style.left = `${Math.max(VIEWPORT_MARGIN, left - rect.width)}px`;
  }
  if (top + rect.height > height - VIEWPORT_MARGIN) {
    element.style.top = `${Math.max(VIEWPORT_MARGIN, height - rect.height - VIEWPORT_MARGIN)}px`;
  }
}
