import { Show, createMemo } from "@barqjs/core";
import {
  isArrowElement,
  isImageElement,
  isLineElement,
  isLinearElement,
  isTextBindableContainer,
  isTextElement,
} from "@excalidraw/element";

import { useDiagramUI } from "./context.tsx";
import { getShortcutKey } from "./shortcuts.ts";
import { diagramLayer as d } from "./layer.ts";

import type { Translate } from "../i18n.ts";
import type { DiagramEditor } from "../editor/editor.ts";

const hint = d({
  position: "absolute",
  top: "calc(100% + 6px)",
  insetInline: "0",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "2px",
  textAlign: "center",
  fontSize: "var(--text-xs)",
  color: "var(--muted-foreground)",
  pointerEvents: "none",
  "& span": {
    paddingInline: "6px",
    borderRadius: "4px",
    backgroundColor: "color-mix(in oklab, var(--background) 80%, transparent)",
  },
});

/** Excalidraw's `getHints`: what the tool or the selection does next, with its keys. */
const getHints = (editor: DiagramEditor, t: Translate): readonly string[] => {
  const state = editor.state;
  const key = (...keys: string[]) => keys.map((each) => getShortcutKey(each, t)).join(" + ");
  const tool = state.activeTool.type;
  const selected = editor.scene.getSelectedElements(state);
  const [first] = selected;

  if (tool === "eraser") return [t("hints.eraserRevert", { shortcut: key("Alt") })];
  if (state.selectedLinearElement?.isDragging && first?.type === "arrow") {
    return [t("hints.arrowBindModifiers", { shortcut_1: key("Ctrl"), shortcut_2: key("Alt") })];
  }
  if (tool === "arrow" || tool === "line") {
    if (state.multiElement !== null) {
      return [
        t("hints.linearElementMulti", { shortcut_1: key("Escape"), shortcut_2: key("Enter") }),
      ];
    }
    return [
      tool === "arrow" ? t("hints.arrowTool", { shortcut: key("A") }) : t("hints.linearElement"),
    ];
  }
  if (tool === "freedraw") return [t("hints.freeDraw")];
  if (tool === "text") return [t("hints.text")];
  if (tool === "embeddable") return [t("hints.embeddable")];
  if (tool === "stickynote") return [t("hints.stickynote")];
  if (tool === "autoshape") return [t("hints.autoshape")];

  if (state.isResizing && state.lastPointerDownWith === "mouse" && selected.length === 1 && first) {
    if (isLinearElement(first) && first.points.length === 2) {
      return [t("hints.lockAngle", { shortcut: key("Shift") })];
    }
    return [
      t(isImageElement(first) ? "hints.resizeImage" : "hints.resize", {
        shortcut_1: key("Shift"),
        shortcut_2: key("Alt"),
      }),
    ];
  }
  if (state.isRotating && state.lastPointerDownWith === "mouse") {
    return [t("hints.rotate", { shortcut: key("Shift") })];
  }

  const toggleTextAutoResize = t("hints.toggleTextAutoResize", { shortcut: key("Alt", "W") });
  if (state.editingTextElement) {
    const finish = t("hints.text_editing", {
      shortcut_1: key("Escape"),
      shortcut_2: key("CtrlOrCmd", "Enter"),
    });
    return state.editingTextElement.containerId ? [finish] : [finish, toggleTextAutoResize];
  }
  if (selected.length === 1 && first && isTextElement(first)) {
    const edit = t("hints.text_selected", { shortcut: key("Enter") });
    return first.autoResize ? [edit] : [edit, toggleTextAutoResize];
  }
  if (state.croppingElementId) {
    return [t("hints.leaveCropEditor", { shortcut_1: key("Enter"), shortcut_2: key("Escape") })];
  }
  if (selected.length === 1 && first && isImageElement(first)) {
    return [t("hints.enterCropEditor", { shortcut: key("Enter") })];
  }
  if (tool === "selection") {
    if (
      state.selectionElement &&
      selected.length === 0 &&
      !state.selectedLinearElement?.isEditing
    ) {
      return [t("hints.deepBoxSelect", { shortcut: key("CtrlOrCmd") })];
    }
    if (state.gridModeEnabled && state.selectedElementsAreBeingDragged) {
      return [t("hints.disableSnapping", { shortcut: key("CtrlOrCmd") })];
    }
    if (selected.length === 0) {
      return [t("hints.canvasPanning", { shortcut_1: t("keys.mmb"), shortcut_2: key("Space") })];
    }
    if (selected.length === 1 && first) {
      if (isLinearElement(first)) {
        const linear = state.selectedLinearElement;
        if (
          isArrowElement(first) &&
          linear?.elementId === first.id &&
          (linear.hoverPointIndex === 0 || linear.hoverPointIndex === first.points.length - 1)
        ) {
          return [t("hints.toggleArrowhead")];
        }
        if (linear?.isEditing) {
          return [
            linear.selectedPointsIndices
              ? t("hints.lineEditor_pointSelected", {
                  shortcut_1: key("Delete"),
                  shortcut_2: key("CtrlOrCmd", "D"),
                })
              : t("hints.lineEditor_nothingSelected", {
                  shortcut_1: key("Shift"),
                  shortcut_2: key("Alt"),
                }),
          ];
        }
        return [
          isLineElement(first)
            ? t("hints.lineEditor_line_info", { shortcut: key("Enter") })
            : t("hints.lineEditor_info", {
                shortcut_1: key("CtrlOrCmd"),
                shortcut_2: key("CtrlOrCmd", "Enter"),
              }),
        ];
      }
      if (
        !state.newElement &&
        !state.selectedElementsAreBeingDragged &&
        isTextBindableContainer(first)
      ) {
        return [
          t("hints.bindTextToElement", { shortcut: key("Enter") }),
          t("hints.createFlowchart", { shortcut: key("CtrlOrCmd", "↑↓") }),
        ];
      }
    }
  }
  return [];
};

/** The hint under the toolbar, Excalidraw's `HintViewer`, which the hints toggle turns off. */
export function HintViewer() {
  const ui = useDiagramUI();
  const store = ui.store;
  const hints = createMemo((): string => {
    if (!store.state("showHints")) return "";
    store.state("activeTool");
    store.state("multiElement");
    store.state("isResizing");
    store.state("isRotating");
    store.state("editingTextElement");
    store.state("croppingElementId");
    store.state("selectedLinearElement");
    store.state("selectedElementsAreBeingDragged");
    store.state("selectionElement");
    store.selection();
    const editor = store.editor;
    return editor ? getHints(editor, ui.t).join("\n") : "";
  });
  return (
    <Show when={hints()}>
      <div class={hint} aria-live="polite" data-testid="hint-viewer">
        {hints()
          .split("\n")
          .map((line) => (
            <span>{line}</span>
          ))}
      </div>
    </Show>
  );
}
