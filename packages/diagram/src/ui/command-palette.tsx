import { For, Show, createMemo } from "@barqjs/core";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@barqjs/ui/command";
import { capitalizeString } from "@excalidraw/common";

import { actionChangeViewBackgroundColor, actionClearCanvas } from "../editor/actions/canvas.ts";
import { actionToggleTheme, actionToggleShapeSwitch } from "../editor/actions/toggles.ts";
import { useDiagramUI } from "./context.tsx";
import { isShortcutName } from "./shortcuts.ts";

import type { ActionName, Action } from "../editor/types.ts";
import type { TranslationKey } from "../i18n.ts";
import type { ToolType } from "../types.ts";

/** Excalidraw's categories, in its order, named from barq's strings: Excalidraw's locale has none. */
const CATEGORIES = ["app", "export", "editor", "tools", "elements", "links"] as const;
type Category = (typeof CATEGORIES)[number];

interface Command {
  key: string;
  label: string;
  category: Category;
  shortcut: string;
  keywords: readonly string[];
  perform: () => void;
}

const ELEMENT_ACTIONS: readonly ActionName[] = [
  "group",
  "ungroup",
  "cut",
  "copy",
  "deleteSelectedElements",
  "wrapSelectionInFrame",
  "toggleWrap",
  "copyStyles",
  "pasteStyles",
  "bringToFront",
  "bringForward",
  "sendBackward",
  "sendToBack",
  "alignTop",
  "alignBottom",
  "alignLeft",
  "alignRight",
  "alignVerticallyCentered",
  "alignHorizontallyCentered",
  "duplicateSelection",
  "flipHorizontal",
  "flipVertical",
  "zoomToFitSelection",
  "zoomToFitSelectionInViewport",
  "increaseFontSize",
  "decreaseFontSize",
  "toggleLinearEditor",
  "cropEditor",
  "togglePolygon",
];

const LINK_ACTIONS: readonly ActionName[] = ["hyperlink", "copyElementLink", "linkToElement"];

const EDITOR_ACTIONS: readonly ActionName[] = [
  "undo",
  "redo",
  "zoomIn",
  "zoomOut",
  "resetZoom",
  "zoomToFit",
  "zenMode",
  "viewMode",
  "gridMode",
  "minimap",
  "objectsSnapMode",
  "showHints",
  "toggleShortcuts",
  "selectAll",
  "toggleElementLock",
  "unlockAllElements",
  "stats",
];

const EXPORT_ACTIONS: readonly ActionName[] = [
  "imageExport",
  "jsonExport",
  "saveToActiveFile",
  "saveFileToDisk",
  "loadScene",
  "copyAsPng",
  "copyAsSvg",
];

const PALETTE_TOOLS: readonly ToolType[] = [
  "selection",
  "lasso",
  "rectangle",
  "diamond",
  "ellipse",
  "arrow",
  "line",
  "freedraw",
  "text",
  "stickynote",
  "image",
  "eraser",
  "frame",
  "laser",
  "hand",
];

/**
 * Excalidraw's command palette: every action that applies now, the tools and
 * the canvas's settings, found by typing. Ctrl+/ or Ctrl+Shift+P opens it,
 * Enter runs the highlighted command and Escape closes it.
 */
export function CommandPalette() {
  const ui = useDiagramUI();
  const t = ui.t;
  const store = ui.store;
  const open = () => store.state("openDialog")?.name === "commandPalette";

  const close = (): void => {
    const editor = store.editor;
    if (editor?.state.openDialog?.name === "commandPalette") {
      editor.batch(() => editor.setState({ openDialog: null }));
    }
  };

  const commands = createMemo((): Command[] => {
    if (!open()) return [];
    const editor = store.editor;
    if (!editor) return [];
    const viewMode = editor.state.viewModeEnabled;
    const fromAction = (action: Action | undefined, category: Category): Command | null => {
      if (!action) return null;
      if (viewMode && action.viewMode !== true) return null;
      if (!ui.isEnabled(action)) return null;
      const label = ui.label(action);
      if (!label) return null;
      return {
        key: `action:${action.name}`,
        label,
        category,
        shortcut: isShortcutName(action.name) ? ui.shortcut(action.name) : "",
        keywords: action.keywords ?? [],
        perform: () => ui.run(action),
      };
    };
    const named = (names: readonly ActionName[], category: Category): Command[] =>
      names
        .map((name) => fromAction(editor.actionManager.actions.get(name), category))
        .filter((command): command is Command => command !== null);

    const tools: Command[] = viewMode
      ? []
      : PALETTE_TOOLS.filter((tool) => tool !== "image" || ui.host().UIOptions.tools.image).map(
          (tool) => ({
            key: `tool:${tool}`,
            label: capitalizeString(t(`toolBar.${tool}` as TranslationKey)),
            category: "tools" as const,
            shortcut: "",
            keywords: ["toolbar"],
            perform: () => {
              editor.batch(() => editor.setActiveTool({ type: tool }));
            },
          }),
        );
    if (!viewMode) {
      tools.push({
        key: "tool:lock",
        label: t("toolBar.lock"),
        category: "tools",
        shortcut: ui.shortcut("toolLock"),
        keywords: [],
        perform: () => editor.batch(() => editor.toggleLock()),
      });
      const openTTD = (tab: "text-to-diagram" | "mermaid") => () =>
        editor.batch(() => editor.setState({ openDialog: { name: "ttd", tab } }));
      if (ui.host().aiEnabled && ui.host().textToDiagram) {
        tools.push({
          key: "tool:textToDiagram",
          label: `${t("labels.textToDiagram")}...`,
          category: "tools",
          shortcut: "",
          keywords: ["ai", "generate", "chat"],
          perform: openTTD("text-to-diagram"),
        });
      }
      tools.push({
        key: "tool:mermaid",
        label: `${t("toolBar.mermaidToExcalidraw")}...`,
        category: "tools",
        shortcut: "",
        keywords: ["mermaid", "diagram"],
        perform: openTTD("mermaid"),
      });
    }

    const openPopup = (popup: "canvasBackground" | "elementStroke" | "elementBackground") => () =>
      editor.batch(() => editor.setState({ openPopup: popup }));
    const panelShown = editor.scene.getSelectedElements(editor.state).length > 0;
    const extra: (Command | null)[] = [
      fromAction(actionToggleTheme as Action, "app"),
      fromAction(actionClearCanvas, "editor"),
      ui.isEnabled(actionChangeViewBackgroundColor)
        ? {
            key: "action:changeViewBackgroundColor",
            label: t("labels.canvasBackground"),
            category: "editor",
            shortcut: "",
            keywords: ["color", "background"],
            perform: openPopup("canvasBackground"),
          }
        : null,
      fromAction(actionToggleShapeSwitch, "elements"),
      panelShown && !viewMode
        ? {
            key: "action:changeStrokeColor",
            label: t("labels.changeStroke"),
            category: "elements",
            shortcut: "",
            keywords: ["color", "outline"],
            perform: openPopup("elementStroke"),
          }
        : null,
      panelShown && !viewMode
        ? {
            key: "action:changeBackgroundColor",
            label: t("labels.changeBackground"),
            category: "elements",
            shortcut: "",
            keywords: ["color", "fill"],
            perform: openPopup("elementBackground"),
          }
        : null,
    ];
    return [
      ...extra.filter((command): command is Command => command !== null),
      ...named(EXPORT_ACTIONS, "export"),
      ...named(EDITOR_ACTIONS, "editor"),
      ...tools,
      ...named(ELEMENT_ACTIONS, "elements"),
      ...named(LINK_ACTIONS, "links"),
    ];
  });

  const grouped = createMemo(() =>
    CATEGORIES.map((category) => ({
      category,
      commands: commands().filter((command) => command.category === category),
    })).filter((group) => group.commands.length > 0),
  );

  return (
    <CommandDialog
      isOpen={open()}
      onOpenChange={(isOpen: boolean) => {
        if (!isOpen) {
          close();
          ui.focusCanvas();
        }
      }}
      title={t("commandPalette.title")}
      description={t("commandPalette.search.placeholder")}
      loop
    >
      <CommandInput placeholder={t("commandPalette.search.placeholder")} />
      <CommandList>
        <CommandEmpty>{t("commandPalette.search.noMatch")}</CommandEmpty>
        <For each={grouped()}>
          {(group: { category: Category; commands: Command[] }) => (
            <CommandGroup heading={t(`commandPalette.categories.${group.category}`)}>
              <For each={group.commands}>
                {(command: Command) => (
                  <CommandItem
                    value={command.label}
                    keywords={[...command.keywords]}
                    onSelect={() => {
                      close();
                      ui.focusCanvas();
                      command.perform();
                    }}
                    data-testid={command.key}
                  >
                    <span>{command.label}</span>
                    <Show when={command.shortcut}>
                      <CommandShortcut>{command.shortcut}</CommandShortcut>
                    </Show>
                  </CommandItem>
                )}
              </For>
            </CommandGroup>
          )}
        </For>
      </CommandList>
    </CommandDialog>
  );
}
