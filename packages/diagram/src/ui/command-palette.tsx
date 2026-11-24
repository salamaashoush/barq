import type { JSX } from "@barqjs/web";
import { For, Show, createMemo, createSignal } from "@barqjs/core";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@barqjs/ui/command";
import { DEFAULT_SIDEBAR, capitalizeString } from "@excalidraw/common";

import { actionChangeViewBackgroundColor, actionClearCanvas } from "../editor/actions/canvas.ts";
import { actionToggleSearchMenu } from "../editor/actions/search.ts";
import { actionToggleTheme, actionToggleShapeSwitch } from "../editor/actions/toggles.ts";
import { useDiagramUI } from "./context.tsx";
import { hostSlot, isHostChild } from "./host-children.ts";
import { isShortcutName } from "./shortcuts.ts";

import type { Child } from "@barqjs/core";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { ActionManager } from "../editor/actions/manager.ts";
import type { DiagramEditor } from "../editor/editor.ts";
import type { AppState } from "../types.ts";

import type { ActionName, Action } from "../editor/types.ts";
import type { TranslationKey } from "../i18n.ts";
import type { ToolType } from "../types.ts";

/** Excalidraw's categories, in its order, named from barq's strings: Excalidraw's locale has none. */
const CATEGORIES = ["app", "export", "editor", "tools", "elements", "links", "library"] as const;
type Category = (typeof CATEGORIES)[number];

export interface PerformContext {
  actionManager: ActionManager;
  event: Event | null;
}

/**
 * A command a host adds to the palette, Excalidraw's `CommandPaletteItem`.
 * `category` is one of the palette's (`"app"`, `"export"`, `"editor"`,
 * `"tools"`, `"elements"`, `"links"`, `"library"`) or a heading of its own.
 */
export interface CommandPaletteItem {
  label: string;
  /** Matched as well as the label, not shown. */
  keywords?: string[];
  category: string;
  /** Its place within the category, lower first. */
  order?: number;
  /** Whether it is offered now. @default true */
  predicate?:
    | boolean
    | ((
        elements: readonly ExcalidrawElement[],
        appState: AppState,
        editor: DiagramEditor,
      ) => boolean);
  shortcut?: string | null;
  /** `false` keeps it out of view mode. @default true */
  viewMode?: boolean;
  icon?: Child;
  perform: (data: PerformContext) => void;
}

interface Command {
  key: string;
  label: string;
  category: string;
  order?: number;
  shortcut: string;
  keywords: readonly string[];
  perform: () => void;
}

export interface CommandPaletteProps {
  customCommandPaletteItems?: CommandPaletteItem[];
}

/**
 * Excalidraw's `CommandPalette`, given to `<DiagramEditor>` as a child: its
 * `customCommandPaletteItems` join the palette's commands.
 */
export function CommandPalette(props: CommandPaletteProps): JSX.Element {
  if (isHostChild()) {
    return hostSlot("commandPalette", {
      get customCommandPaletteItems() {
        return props.customCommandPaletteItems;
      },
    });
  }
  return <CommandPaletteDialog customCommandPaletteItems={props.customCommandPaletteItems} />;
}

const ELEMENT_ACTIONS: readonly ActionName[] = [
  "addToLibrary",
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
/**
 * The command run last, by its key, shown first while nothing is typed: for
 * the page's life, as Excalidraw keeps it.
 */
let lastUsedKey: string | null = null;

interface CommandItemProps {
  command: Command;
  recent?: boolean;
}

interface CategoryCommands {
  category: string;
  commands: Command[];
}

export function CommandPaletteDialog(props: CommandPaletteProps) {
  const ui = useDiagramUI();
  const t = ui.t;
  const store = ui.store;
  function open() {
    return store.state("openDialog")?.name === "commandPalette";
  }
  const [search, setSearch] = createSignal("");
  const [lastUsed, setLastUsed] = createSignal(lastUsedKey);

  function close(): void {
    setSearch("");
    const editor = store.editor;
    if (editor?.state.openDialog?.name === "commandPalette") {
      editor.batch(() => editor.setState({ openDialog: null }));
    }
  }

  const commands = createMemo((): Command[] => {
    if (!open()) return [];
    const editor = store.editor;
    if (!editor) return [];
    const viewMode = editor.state.viewModeEnabled;
    function fromAction(action: Action | undefined, category: Category): Command | null {
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
    }
    const named: (names: readonly ActionName[], category: Category) => Command[] = (
      names,
      category,
    ) => {
      return names
        .map((name) => fromAction(editor.actionManager.actions.get(name), category))
        .filter((command): command is Command => command !== null);
    };

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
      const openTTD: (tab: "text-to-diagram" | "mermaid") => () => void = (tab) => {
        return () => editor.batch(() => editor.setState({ openDialog: { name: "ttd", tab } }));
      };
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

    const openPopup: (
      popup: "canvasBackground" | "elementStroke" | "elementBackground",
    ) => () => void = (popup) => {
      return () => editor.batch(() => editor.setState({ openPopup: popup }));
    };
    const panelShown = editor.scene.getSelectedElements(editor.state).length > 0;
    const toggleLibrary: Command | null = viewMode
      ? null
      : {
          key: "app:library",
          label: capitalizeString(t("toolBar.library")),
          category: "app",
          shortcut: "",
          keywords: ["library", "sidebar"],
          perform: () =>
            editor.batch(() =>
              editor.setState({
                openSidebar: editor.state.openSidebar
                  ? null
                  : { name: DEFAULT_SIDEBAR.name, tab: DEFAULT_SIDEBAR.defaultTab },
              }),
            ),
        };
    const libraryItems: Command[] = viewMode
      ? []
      : editor.library.state.libraryItems
          .filter((item) => item.name?.trim())
          .map((item) => ({
            key: `library:${item.id}`,
            label: item.name ?? "",
            category: "library",
            shortcut: "",
            keywords: [],
            perform: () => editor.batch(() => editor.insertLibraryItems([item])),
          }));
    const extra: (Command | null)[] = [
      fromAction(actionToggleTheme as Action, "app"),
      toggleLibrary,
      fromAction(actionToggleSearchMenu, "app"),
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
    const custom: Command[] = (props.customCommandPaletteItems ?? [])
      .filter(
        (item) =>
          !(viewMode && item.viewMode === false) &&
          (typeof item.predicate === "function"
            ? item.predicate(editor.scene.getElementsIncludingDeleted(), editor.state, editor)
            : item.predicate !== false),
      )
      .map((item, index) => ({
        key: `custom:${index}:${item.label}`,
        label: item.label,
        category: item.category,
        order: item.order,
        shortcut: item.shortcut ?? "",
        keywords: item.keywords ?? [],
        perform: () =>
          editor.batch(() => item.perform({ actionManager: editor.actionManager, event: null })),
      }));
    return [
      ...custom,
      ...extra.filter((command): command is Command => command !== null),
      ...named(EXPORT_ACTIONS, "export"),
      ...named(EDITOR_ACTIONS, "editor"),
      ...tools,
      ...named(ELEMENT_ACTIONS, "elements"),
      ...named(LINK_ACTIONS, "links"),
      ...libraryItems,
    ];
  });

  const recent = createMemo((): Command | null => {
    const key = lastUsed();
    if (key === null || search() !== "") return null;
    return commands().find((command) => command.key === key) ?? null;
  });

  function runCommand(command: Command): void {
    lastUsedKey = command.key;
    setLastUsed(command.key);
    close();
    ui.focusCanvas();
    command.perform();
  }

  function Item(itemProps: CommandItemProps) {
    return (
      <CommandItem
        value={itemProps.recent ? `${itemProps.command.label} ` : itemProps.command.label}
        keywords={[...itemProps.command.keywords]}
        onSelect={() => runCommand(itemProps.command)}
        data-testid={itemProps.recent ? `recent:${itemProps.command.key}` : itemProps.command.key}
      >
        <span>{itemProps.command.label}</span>
        <Show when={itemProps.command.shortcut}>
          <CommandShortcut>{itemProps.command.shortcut}</CommandShortcut>
        </Show>
      </CommandItem>
    );
  }

  const grouped = createMemo(() => {
    const own = commands()
      .map((command) => command.category)
      .filter((category) => !(CATEGORIES as readonly string[]).includes(category));
    return [...CATEGORIES, ...new Set(own)]
      .map((category) => ({
        category,
        commands: commands()
          .filter((command) => command.category === category && command.key !== recent()?.key)
          .toSorted((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      }))
      .filter((group) => group.commands.length > 0);
  });

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
      <CommandInput
        placeholder={t("commandPalette.search.placeholder")}
        value={search()}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>{t("commandPalette.search.noMatch")}</CommandEmpty>
        <Show when={recent()} keyed>
          {(command: Command) => (
            <CommandGroup heading={t("commandPalette.recents")}>
              <Item command={command} recent />
            </CommandGroup>
          )}
        </Show>
        <For each={grouped()}>
          {(group: CategoryCommands) => (
            <CommandGroup
              heading={
                (CATEGORIES as readonly string[]).includes(group.category)
                  ? t(`commandPalette.categories.${group.category as Category}`)
                  : group.category
              }
            >
              <For each={group.commands}>{(command: Command) => <Item command={command} />}</For>
            </CommandGroup>
          )}
        </For>
      </CommandList>
    </CommandDialog>
  );
}
