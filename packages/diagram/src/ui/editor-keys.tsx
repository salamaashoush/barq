import { Show, onCleanup } from "@barqjs/core";
import { KEYS, arrayToMap, isWritableElement } from "@excalidraw/common";
import {
  getBoundTextElement,
  getColorUpdate,
  getSelectedElements,
  hasBackground,
  isTextElement,
} from "@excalidraw/element";

import {
  actionChangeBackgroundColor,
  actionChangeStrokeColor,
} from "../editor/actions/properties.ts";
import { useDiagramUI } from "./context.tsx";
import { startEyeDropper } from "./eye-dropper.ts";

import type { DiagramEditor } from "../editor/editor.ts";
import type { DiagramUI } from "./context.tsx";

type ColorProperty = "strokeColor" | "backgroundColor";

/**
 * Shows a colour on the selection's stroke or background while the eye
 * dropper is held over the canvas, outside the history: the pick that
 * follows is the one undoable step.
 */
export function previewColorOnSelection(
  editor: DiagramEditor,
  property: ColorProperty,
  color: string,
): void {
  const elements = editor.scene.getNonDeletedElements();
  const targets = getSelectedElements(elements, editor.state, {
    includeBoundTextElement: property === "strokeColor",
  });
  if (targets.length === 0) return;
  const elementsMap = arrayToMap(elements);
  editor.batch(() => {
    for (const element of targets) {
      editor.scene.mutateElement(element, getColorUpdate(element, property, color, elementsMap));
    }
  });
}

/**
 * Picks a colour off the canvas for the selection's stroke or background (or
 * the defaults the tool draws with), Alt swapping the two: a held pointer
 * previews the colour on the selection, letting go applies it as one step.
 * Excalidraw's `openEyeDropper`.
 */
export function openEyeDropper(
  ui: DiagramUI,
  editor: DiagramEditor,
  type: "stroke" | "background",
) {
  function propertyFor(altKey: boolean): ColorProperty {
    return (type === "background" && altKey) || (type === "stroke" && !altKey)
      ? "strokeColor"
      : "backgroundColor";
  }
  startEyeDropper(editor, {
    onChange: (color, { altKey }) => previewColorOnSelection(editor, propertyFor(altKey), color),
    onSelect: (color, event) => {
      const action =
        propertyFor(event.altKey) === "strokeColor"
          ? actionChangeStrokeColor
          : actionChangeBackgroundColor;
      ui.run(action, { color });
    },
  });
}

/**
 * The keys Excalidraw gives its pickers, which open what the UI draws: S and
 * G the stroke and background colour pickers, Shift+F the font picker, and I,
 * Shift+G and Shift+S the eye dropper for the background or the stroke.
 */
export function EditorKeys() {
  const ui = useDiagramUI();
  return (
    <Show when={ui.store.editor}>
      {(current: () => DiagramEditor) => {
        const editor = current();
        function onKeyDown(event: KeyboardEvent): void {
          if (
            event.defaultPrevented ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            isWritableElement(event.target) ||
            editor.state.viewModeEnabled ||
            editor.state.newElement !== null
          ) {
            return;
          }
          const key = event.key.toLowerCase();
          const state = editor.state;
          const selected = editor.scene.getSelectedElements(state);
          const nothingToStyle = state.activeTool.type === "selection" && selected.length === 0;

          if (event.shiftKey && key === KEYS.S) {
            event.preventDefault();
            openEyeDropper(ui, editor, "stroke");
            return;
          }
          if (key === KEYS.I || (event.shiftKey && key === KEYS.G)) {
            event.preventDefault();
            openEyeDropper(ui, editor, "background");
            return;
          }
          if (event.shiftKey && key === KEYS.F) {
            const elementsMap = editor.scene.getNonDeletedElementsMap();
            if (
              !nothingToStyle &&
              (state.activeTool.type === "text" ||
                selected.some(
                  (element) =>
                    isTextElement(element) || getBoundTextElement(element, elementsMap) !== null,
                ))
            ) {
              event.preventDefault();
              editor.batch(() => editor.setState({ openPopup: "fontFamily" }));
            }
            return;
          }
          if (event.shiftKey || nothingToStyle) return;
          if (key === KEYS.S) {
            event.stopPropagation();
            editor.batch(() => editor.setState({ openPopup: "elementStroke" }));
          } else if (
            key === KEYS.G &&
            (hasBackground(state.activeTool.type) ||
              selected.some((element) => hasBackground(element.type)))
          ) {
            event.stopPropagation();
            editor.batch(() => editor.setState({ openPopup: "elementBackground" }));
          }
        }
        editor.container.addEventListener("keydown", onKeyDown);
        onCleanup(() => editor.container.removeEventListener("keydown", onKeyDown));
        return null;
      }}
    </Show>
  );
}
