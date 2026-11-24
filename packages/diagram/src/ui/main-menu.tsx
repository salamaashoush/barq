import {
  type Child,
  For,
  Show,
  createContext,
  createSignal,
  getContext,
  provide,
} from "@barqjs/core";
import { CircleHelp } from "@barqjs/lucide/icons/circle-help";
import { Download } from "@barqjs/lucide/icons/download";
import { FolderOpen } from "@barqjs/lucide/icons/folder-open";
import { ImageDown } from "@barqjs/lucide/icons/image-down";
import { Menu as MenuIcon } from "@barqjs/lucide/icons/menu";
import { Moon } from "@barqjs/lucide/icons/moon";
import { Save } from "@barqjs/lucide/icons/save";
import { Search } from "@barqjs/lucide/icons/search";
import { Sun } from "@barqjs/lucide/icons/sun";
import { Trash2 } from "@barqjs/lucide/icons/trash-2";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@barqjs/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { Button } from "@barqjs/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@barqjs/ui/popover";
import { DEFAULT_CANVAS_BACKGROUND_PICKS, THEME } from "@excalidraw/common";

import { actionChangeViewBackgroundColor, actionClearCanvas } from "../editor/actions/canvas.ts";
import {
  actionLoadScene,
  actionSaveFileToDisk,
  actionSaveToActiveFile,
  actionToggleImageExport,
  actionToggleJSONExport,
} from "../editor/actions/export.ts";
import { actionShortcuts, actionToggleTheme } from "../editor/actions/toggles.ts";
import { ColorPicker } from "./color-picker.tsx";
import { useDiagramUI } from "./context.tsx";
import { diagramLayer as d } from "./layer.ts";
import { iconButton, island, menuItem, menuShortcut, menuSurface } from "./styles.ts";

import type { ShortcutName } from "./shortcuts.ts";

const swatchDot = d({
  width: "16px",
  height: "16px",
  flexShrink: "0",
  borderRadius: "4px",
  border: "1px solid var(--border, rgb(0 0 0 / 0.15))",
});

const pickerBox = d({ padding: "12px", display: "flex", flexDirection: "column", gap: "8px" });

const backupChoices = d({ display: "flex", flexWrap: "wrap", gap: "8px" });

/** Excalidraw's `<bold>` and `<br></br>` markup in a translated string, as elements. */
function RichText(props: { text: string }) {
  const parts = () => props.text.split(/(<bold>.*?<\/bold>|<br><\/br>)/g).filter(Boolean);
  return (
    <For each={parts()}>
      {(part: string) =>
        part === "<br></br>" ? (
          <br />
        ) : part.startsWith("<bold>") ? (
          <strong>{part.slice(6, -7)}</strong>
        ) : (
          part
        )
      }
    </For>
  );
}

/** One entry of the main menu, which an app adds as Excalidraw's `MainMenu.Item`. */
function Item(props: {
  onSelect: () => void;
  icon?: Child;
  shortcut?: string;
  children?: Child;
  disabled?: boolean;
  destructive?: boolean;
  "data-testid"?: string;
}) {
  return (
    <DropdownMenuItem
      class={menuItem}
      onAction={() => props.onSelect()}
      isDisabled={props.disabled === true}
      variant={props.destructive === true ? "destructive" : "default"}
      data-testid={props["data-testid"]}
    >
      {props.icon}
      <span>{props.children}</span>
      <Show when={props.shortcut}>
        <kbd class={menuShortcut}>{props.shortcut}</kbd>
      </Show>
    </DropdownMenuItem>
  );
}

/** A link in the main menu, Excalidraw's `MainMenu.ItemLink`. */
function ItemLink(props: { href: string; icon?: Child; children?: Child; "data-testid"?: string }) {
  return (
    <DropdownMenuItem
      class={menuItem}
      href={props.href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={props["data-testid"]}
    >
      {props.icon}
      <span>{props.children}</span>
    </DropdownMenuItem>
  );
}

function Group(props: { title?: string; children?: Child }) {
  return (
    <DropdownMenuGroup aria-label={props.title}>
      <Show when={props.title}>
        <DropdownMenuGroupLabel>{props.title}</DropdownMenuGroupLabel>
      </Show>
      {props.children}
    </DropdownMenuGroup>
  );
}

function shortcutOf(name: ShortcutName): string {
  return useDiagramUI().shortcut(name);
}

function LoadScene() {
  const ui = useDiagramUI();
  const menu = useMainMenu();
  return (
    <Show when={ui.isEnabled(actionLoadScene)}>
      <Item
        onSelect={() => {
          // a scene on the canvas is replaced: the reader may keep it first
          if (ui.store.editor?.scene.getNonDeletedElements().length) {
            menu.confirmLoad();
          } else {
            ui.run(actionLoadScene);
          }
        }}
        icon={<FolderOpen aria-hidden="true" />}
        shortcut={shortcutOf("loadScene")}
        data-testid="load-button"
      >
        {ui.t("buttons.load")}
      </Item>
    </Show>
  );
}

function SaveToActiveFile() {
  const ui = useDiagramUI();
  return (
    <Show when={ui.isEnabled(actionSaveToActiveFile) && ui.store.state("fileHandle") !== null}>
      <Item
        onSelect={() => ui.run(actionSaveToActiveFile)}
        icon={<Save aria-hidden="true" />}
        shortcut={shortcutOf("saveScene")}
        data-testid="save-button"
      >
        {ui.t("buttons.save")}
      </Item>
    </Show>
  );
}

function Export() {
  const ui = useDiagramUI();
  return (
    <Show when={ui.isEnabled(actionToggleJSONExport)}>
      <Item
        onSelect={() => ui.run(actionToggleJSONExport)}
        icon={<Download aria-hidden="true" />}
        data-testid="json-export-button"
      >
        {ui.t("buttons.export")}
      </Item>
    </Show>
  );
}

function SaveAsImage() {
  const ui = useDiagramUI();
  return (
    <Show when={ui.host().UIOptions.canvasActions.saveAsImage}>
      <Item
        onSelect={() => ui.run(actionToggleImageExport)}
        disabled={!ui.isEnabled(actionToggleImageExport)}
        icon={<ImageDown aria-hidden="true" />}
        shortcut={shortcutOf("imageExport")}
        data-testid="image-export-button"
      >
        {ui.t("buttons.exportImage")}
      </Item>
    </Show>
  );
}

function SearchMenu() {
  const ui = useDiagramUI();
  return (
    <Item
      onSelect={() => {}}
      disabled
      icon={<Search aria-hidden="true" />}
      shortcut={shortcutOf("searchMenu")}
      data-testid="search-menu-button"
    >
      {ui.t("search.title")}
    </Item>
  );
}

function Help() {
  const ui = useDiagramUI();
  return (
    <Item
      onSelect={() => ui.run(actionShortcuts)}
      icon={<CircleHelp aria-hidden="true" />}
      shortcut="?"
      data-testid="help-menu-item"
    >
      {ui.t("helpDialog.title")}
    </Item>
  );
}

/** Clears the canvas once the reader confirms, as Excalidraw asks first. */
function ClearCanvas() {
  const ui = useDiagramUI();
  const menu = useMainMenu();
  return (
    <Show when={ui.isEnabled(actionClearCanvas)}>
      <Item
        onSelect={() => menu.confirmClear()}
        icon={<Trash2 aria-hidden="true" />}
        data-testid="clear-canvas-button"
      >
        {ui.t("labels.clearCanvas")}
      </Item>
    </Show>
  );
}

function ToggleTheme() {
  const ui = useDiagramUI();
  const dark = () => ui.store.state("theme") === THEME.DARK;
  return (
    <Show when={ui.isEnabled(actionToggleTheme)}>
      <Item
        onSelect={() => ui.run(actionToggleTheme)}
        icon={dark() ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
        shortcut={shortcutOf("toggleTheme")}
        data-testid="toggle-dark-mode"
      >
        {dark() ? ui.t("buttons.lightMode") : ui.t("buttons.darkMode")}
      </Item>
    </Show>
  );
}

/**
 * The canvas background: Excalidraw's five quick picks as a submenu of
 * radio items, and its picker, which takes a hex code, from the last entry.
 */
function ChangeCanvasBackground() {
  const ui = useDiagramUI();
  const menu = useMainMenu();
  const color = () => ui.store.state("viewBackgroundColor");
  return (
    <Show when={ui.isEnabled(actionChangeViewBackgroundColor)}>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger class={menuItem} data-testid="canvas-background-menu">
          <span class={swatchDot} style={{ background: color() }} aria-hidden="true" />
          <span>{ui.t("labels.canvasBackground")}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent class={menuSurface} aria-label={ui.t("labels.canvasBackground")}>
          <DropdownMenuRadioGroup
            value={color()}
            onValueChange={(value: string) =>
              ui.run(actionChangeViewBackgroundColor, { viewBackgroundColor: value })
            }
            aria-label={ui.t("labels.canvasBackground")}
          >
            <For each={DEFAULT_CANVAS_BACKGROUND_PICKS}>
              {(pick: string) => (
                <DropdownMenuRadioItem
                  value={pick}
                  class={menuItem}
                  data-testid={`canvas-background-${pick}`}
                >
                  <span class={swatchDot} style={{ background: pick }} aria-hidden="true" />
                  <span>{pick}</span>
                </DropdownMenuRadioItem>
              )}
            </For>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem class={menuItem} onAction={() => menu.openBackgroundPicker()}>
            <span>{ui.t("colorPicker.hexCode")}</span>
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </Show>
  );
}

/**
 * The main menu's parts, Excalidraw's `MainMenu`: an app passes its own
 * `mainMenu`, built from these, to add entries or leave defaults out.
 *
 * ```tsx
 * <DiagramEditor
 *   mainMenu={() => (
 *     <>
 *       <MainMenu.DefaultItems.Help />
 *       <MainMenu.Item onSelect={share}>Share</MainMenu.Item>
 *       <MainMenu.Separator />
 *       <MainMenu.DefaultItems.ToggleTheme />
 *     </>
 *   )}
 * />
 * ```
 */
export const MainMenu = {
  Item,
  ItemLink,
  Group,
  Separator: DropdownMenuSeparator,
  DefaultItems: {
    LoadScene,
    SaveToActiveFile,
    Export,
    SaveAsImage,
    SearchMenu,
    Help,
    ClearCanvas,
    ToggleTheme,
    ChangeCanvasBackground,
  },
};

/** Excalidraw's default menu, in its order. */
function DefaultMainMenuItems() {
  return (
    <>
      <LoadScene />
      <SaveToActiveFile />
      <Export />
      <SaveAsImage />
      <SearchMenu />
      <Help />
      <ClearCanvas />
      <DropdownMenuSeparator />
      <ToggleTheme />
      <ChangeCanvasBackground />
    </>
  );
}

interface MainMenuState {
  confirmClear: () => void;
  confirmLoad: () => void;
  openBackgroundPicker: () => void;
}

const MainMenuContext = createContext<MainMenuState | null>(null);

function useMainMenu(): MainMenuState {
  const menu = getContext(MainMenuContext);
  if (menu === null || menu === undefined) {
    throw new Error("MainMenu's parts are rendered inside the editor's main menu.");
  }
  return menu;
}

/** The main menu's button, top start, and the menu it opens. */
export function MainMenuButton(props: { items?: Child }) {
  const ui = useDiagramUI();
  const t = ui.t;
  const [confirming, setConfirming] = createSignal(false);
  const [confirmingLoad, setConfirmingLoad] = createSignal(false);
  const [ownPicking, setOwnPicking] = createSignal(false);
  // the command palette opens the picker through the editor's `openPopup`
  const picking = (): boolean => ownPicking() || ui.store.state("openPopup") === "canvasBackground";
  const setPicking = (next: boolean): void => {
    setOwnPicking(next);
    const editor = ui.store.editor;
    if (!next && editor?.state.openPopup === "canvasBackground") {
      editor.batch(() => editor.setState({ openPopup: null }));
    }
  };
  const menu: MainMenuState = {
    confirmClear: () => setConfirming(true),
    confirmLoad: () => setConfirmingLoad(true),
    openBackgroundPicker: () => setPicking(true),
  };

  return provide(
    MainMenuContext,
    () => menu,
    () => (
      <>
        <Popover isOpen={picking()} onOpenChange={setPicking}>
          <PopoverAnchor class={island}>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button
                  variant="ghost"
                  size="icon"
                  class={iconButton}
                  aria-label={t("buttons.menu")}
                  title={t("buttons.menu")}
                  data-testid="main-menu-trigger"
                >
                  <MenuIcon aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                class={menuSurface}
                aria-label={t("buttons.menu")}
                side="bottom"
                align="start"
                data-testid="main-menu"
              >
                {props.items ?? <DefaultMainMenuItems />}
              </DropdownMenuContent>
            </DropdownMenu>
          </PopoverAnchor>
          <PopoverContent side="bottom" align="start">
            <div class={pickerBox} role="dialog" aria-label={t("labels.canvasBackground")}>
              <span>{t("labels.canvasBackground")}</span>
              <ColorPicker
                type="canvasBackground"
                label={t("labels.canvasBackground")}
                color={ui.store.state("viewBackgroundColor")}
                topPicks={DEFAULT_CANVAS_BACKGROUND_PICKS}
                palette={null}
                onChange={(color) =>
                  ui.run(actionChangeViewBackgroundColor, { viewBackgroundColor: color })
                }
                data-testid="canvas-background-picker"
              />
            </div>
          </PopoverContent>
        </Popover>
        <AlertDialog isOpen={confirmingLoad()} onOpenChange={setConfirmingLoad}>
          <AlertDialogContent data-testid="overwrite-confirm">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("overwriteConfirm.modal.loadFromFile.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                <RichText text={t("overwriteConfirm.modal.loadFromFile.description")} />
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div class={backupChoices}>
              <Show when={ui.isEnabled(actionToggleImageExport)}>
                <Button
                  variant="outline"
                  onPress={() => {
                    setConfirmingLoad(false);
                    ui.run(actionToggleImageExport);
                  }}
                  data-testid="overwrite-export-image"
                >
                  {t("overwriteConfirm.action.exportToImage.button")}
                </Button>
              </Show>
              <Button
                variant="outline"
                onPress={() => ui.run(actionSaveFileToDisk)}
                data-testid="overwrite-save-to-disk"
              >
                {t("overwriteConfirm.action.saveToDisk.button")}
              </Button>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onPress={() => setConfirmingLoad(false)}>
                {t("buttons.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onPress={() => {
                  setConfirmingLoad(false);
                  ui.run(actionLoadScene);
                }}
                data-testid="confirm-load"
              >
                {t("overwriteConfirm.modal.loadFromFile.button")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog isOpen={confirming()} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("clearCanvasDialog.title")}</AlertDialogTitle>
              <AlertDialogDescription>{t("alerts.clearReset")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onPress={() => setConfirming(false)}>
                {t("buttons.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onPress={() => {
                  setConfirming(false);
                  ui.run(actionClearCanvas);
                }}
                data-testid="confirm-clear-canvas"
              >
                {t("buttons.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    ),
  );
}
