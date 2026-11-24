import { type Child, For, Show } from "@barqjs/core";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@barqjs/ui/dialog";
import { isDarwin, isFirefox, isWindows } from "@excalidraw/common";

import { actionShortcuts, actionToggleTheme } from "../editor/actions/toggles.ts";
import { useDiagramUI } from "./context.tsx";
import { diagramLayer as d } from "./layer.ts";
import { getShortcutKey } from "./shortcuts.ts";

import type { TranslationKey } from "../i18n.ts";

const content = d({
  maxWidth: "min(1000px, calc(100vw - 2rem))",
  width: "100%",
  maxHeight: "calc(100vh - 2rem)",
  overflowY: "auto",
});

const sections = d({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "16px",
  alignItems: "start",
});

const island = d({
  display: "flex",
  flexDirection: "column",
  gap: "2px",
  padding: "12px",
  borderRadius: "var(--radius, 0.5rem)",
  border: "1px solid var(--border, rgb(0 0 0 / 0.12))",
  "& h3": {
    margin: "0 0 6px",
    fontSize: "var(--text-sm, 0.875rem)",
    fontWeight: "600",
  },
});

const row = d({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  paddingBlock: "4px",
  fontSize: "var(--text-sm, 0.875rem)",
  "& + &": { borderTop: "1px solid var(--border, rgb(0 0 0 / 0.08))" },
});

const keys = d({
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: "4px",
  flexShrink: "0",
  color: "var(--muted-foreground, GrayText)",
  fontSize: "var(--text-xs, 0.75rem)",
});

const key = d({
  display: "inline-flex",
  alignItems: "center",
  minWidth: "20px",
  justifyContent: "center",
  paddingInline: "6px",
  paddingBlock: "2px",
  borderRadius: "4px",
  fontFamily: "inherit",
  fontSize: "var(--text-xs, 0.75rem)",
  color: "var(--foreground, CanvasText)",
  backgroundColor: "var(--muted, rgb(0 0 0 / 0.06))",
  boxShadow: "inset 0 -1px 0 var(--border, rgb(0 0 0 / 0.15))",
});

const upperCaseSingleChars = (text: string): string =>
  text.replace(/\b[a-z]\b/, (char) => char.toUpperCase());

/** One shortcut's keys, `+` between them, as Excalidraw splits `"Ctrl++"`. */
const splitKeys = (shortcut: string): string[] =>
  shortcut.endsWith("++") ? [...shortcut.slice(0, -2).split("+"), "+"] : shortcut.split("+");

function Shortcut(props: { label: string; shortcuts: readonly string[]; isOr?: boolean }) {
  const ui = useDiagramUI();
  return (
    <div class={row} role="listitem">
      <span>{props.label}</span>
      <span class={keys}>
        <For each={props.shortcuts.map((shortcut, index) => ({ shortcut, index }))}>
          {(entry: { shortcut: string; index: number }) => (
            <>
              <Show when={entry.index > 0 && props.isOr !== false}>
                <span>{ui.t("helpDialog.or")}</span>
              </Show>
              <For each={splitKeys(entry.shortcut)}>
                {(part: string) => <kbd class={key}>{upperCaseSingleChars(part)}</kbd>}
              </For>
            </>
          )}
        </For>
      </span>
    </div>
  );
}

function Island(props: { title: string; children?: Child; "data-testid"?: string }) {
  return (
    <section class={island} aria-label={props.title} data-testid={props["data-testid"]}>
      <h3>{props.title}</h3>
      <div role="list">{props.children}</div>
    </section>
  );
}

/**
 * Excalidraw's help dialog: every shortcut, by tools, view and editor, in the
 * language's names for the keys and the platform's modifiers. The help
 * button, the main menu's entry and `?` open it (`openDialog: help`).
 * Excalidraw's links to its own documentation and accounts are not carried.
 */
export function HelpDialog() {
  const ui = useDiagramUI();
  const t = ui.t;
  const store = ui.store;
  const open = () => store.state("openDialog")?.name === "help";
  // the platform's modifiers once the page runs, as the toolbar's hints are
  const darwin = () => store.ready() && isDarwin;
  const k = (shortcut: string): string => getShortcutKey(shortcut, t, darwin());
  const label = (path: TranslationKey): string => t(path);

  return (
    <Dialog
      isOpen={open()}
      onOpenChange={(isOpen: boolean) => {
        if (!isOpen && open()) ui.run(actionShortcuts);
      }}
    >
      <DialogContent class={content} closeLabel={t("buttons.close")} data-testid="help-dialog">
        <DialogHeader>
          <DialogTitle>{t("helpDialog.title")}</DialogTitle>
        </DialogHeader>
        <h2 style="margin:0;font-size:var(--text-base, 1rem)">{t("helpDialog.shortcuts")}</h2>
        <div class={sections}>
          <Island title={t("helpDialog.tools")} data-testid="help-tools">
            <Shortcut label={label("toolBar.hand")} shortcuts={["H"]} />
            <Shortcut label={label("toolBar.selection")} shortcuts={["V", "1"]} />
            <Shortcut label={label("toolBar.rectangle")} shortcuts={["R", "2"]} />
            <Shortcut label={label("toolBar.diamond")} shortcuts={["D", "3"]} />
            <Shortcut label={label("toolBar.ellipse")} shortcuts={["O", "4"]} />
            <Shortcut label={label("toolBar.arrow")} shortcuts={["A", "5"]} />
            <Shortcut label={label("toolBar.line")} shortcuts={["L", "6"]} />
            <Shortcut label={label("toolBar.freedraw")} shortcuts={["P", "X", "7"]} />
            <Shortcut label={label("toolBar.text")} shortcuts={["T", "8"]} />
            <Shortcut label={label("toolBar.stickynote")} shortcuts={["N"]} />
            <Shortcut label={label("toolBar.image")} shortcuts={["9"]} />
            <Shortcut label={label("toolBar.eraser")} shortcuts={["E", "0"]} />
            <Shortcut label={label("toolBar.frame")} shortcuts={["F"]} />
            <Shortcut label={label("toolBar.laser")} shortcuts={["K"]} />
            <Shortcut
              label={label("helpDialog.editLineArrowPoints")}
              shortcuts={[k("CtrlOrCmd+Enter")]}
            />
            <Shortcut label={label("helpDialog.editText")} shortcuts={[k("Enter")]} />
            <Shortcut
              label={label("helpDialog.textNewLine")}
              shortcuts={[k("Enter"), k("Shift+Enter")]}
            />
            <Shortcut
              label={label("helpDialog.textFinish")}
              shortcuts={[k("Esc"), k("CtrlOrCmd+Enter")]}
            />
            <Shortcut
              label={label("helpDialog.curvedArrow")}
              shortcuts={["A", t("helpDialog.click"), t("helpDialog.click"), t("helpDialog.click")]}
              isOr={false}
            />
            <Shortcut
              label={label("helpDialog.curvedLine")}
              shortcuts={["L", t("helpDialog.click"), t("helpDialog.click"), t("helpDialog.click")]}
              isOr={false}
            />
            <Shortcut
              label={label("helpDialog.cropStart")}
              shortcuts={[t("helpDialog.doubleClick"), k("Enter")]}
            />
            <Shortcut
              label={label("helpDialog.cropFinish")}
              shortcuts={[k("Enter"), k("Escape")]}
            />
            <Shortcut label={label("toolBar.lock")} shortcuts={["Q"]} />
            <Shortcut label={label("helpDialog.preventBinding")} shortcuts={[k("CtrlOrCmd")]} />
            <Shortcut label={label("toolBar.link")} shortcuts={[k("CtrlOrCmd+K")]} />
            <Shortcut
              label={label("toolBar.convertElementType")}
              shortcuts={[k("Alt+Shift+."), k("Alt+Shift+,")]}
            />
          </Island>
          <Island title={t("helpDialog.view")} data-testid="help-view">
            <Shortcut label={label("buttons.zoomIn")} shortcuts={[k("CtrlOrCmd++")]} />
            <Shortcut label={label("buttons.zoomOut")} shortcuts={[k("CtrlOrCmd+-")]} />
            <Shortcut label={label("buttons.resetZoom")} shortcuts={[k("CtrlOrCmd+0")]} />
            <Shortcut label={label("helpDialog.zoomToFit")} shortcuts={["Shift+1"]} />
            <Shortcut label={label("helpDialog.zoomToSelection")} shortcuts={["Shift+2"]} />
            <Shortcut label={label("helpDialog.movePageUpDown")} shortcuts={["PgUp/PgDn"]} />
            <Shortcut
              label={label("helpDialog.movePageLeftRight")}
              shortcuts={["Shift+PgUp/PgDn"]}
            />
            <Shortcut label={label("buttons.zenMode")} shortcuts={[k("Alt+Z")]} />
            <Shortcut label={label("buttons.objectsSnapMode")} shortcuts={[k("Alt+S")]} />
            <Shortcut label={label("labels.toggleGrid")} shortcuts={[k("CtrlOrCmd+'")]} />
            <Shortcut label={label("labels.viewMode")} shortcuts={[k("Alt+R")]} />
            <Show when={ui.isEnabled(actionToggleTheme)}>
              <Shortcut label={label("labels.toggleTheme")} shortcuts={[k("Alt+Shift+D")]} />
            </Show>
            <Shortcut label={label("stats.fullTitle")} shortcuts={[k("Alt+/")]} />
            <Shortcut
              label={label("commandPalette.title")}
              shortcuts={
                isFirefox
                  ? [ui.shortcut("commandPalette")]
                  : [ui.shortcut("commandPalette"), ui.shortcut("commandPalette", 1)]
              }
            />
          </Island>
          <Island title={t("helpDialog.editor")} data-testid="help-editor">
            <Shortcut
              label={label("helpDialog.createFlowchart")}
              shortcuts={[k("CtrlOrCmd+Arrow Key")]}
            />
            <Shortcut
              label={label("helpDialog.navigateFlowchart")}
              shortcuts={[k("Alt+Arrow Key")]}
            />
            <Shortcut
              label={label("labels.moveCanvas")}
              shortcuts={[k(`Space+${t("helpDialog.drag")}`), k(`Wheel+${t("helpDialog.drag")}`)]}
            />
            <Shortcut label={label("buttons.clearReset")} shortcuts={[k("CtrlOrCmd+Delete")]} />
            <Shortcut label={label("labels.delete")} shortcuts={[k("Delete")]} />
            <Shortcut label={label("labels.cut")} shortcuts={[k("CtrlOrCmd+X")]} />
            <Shortcut label={label("labels.copy")} shortcuts={[k("CtrlOrCmd+C")]} />
            <Shortcut label={label("labels.paste")} shortcuts={[k("CtrlOrCmd+V")]} />
            <Shortcut
              label={label("labels.pasteAsPlaintext")}
              shortcuts={[k("CtrlOrCmd+Shift+V")]}
            />
            <Shortcut label={label("labels.selectAll")} shortcuts={[k("CtrlOrCmd+A")]} />
            <Shortcut
              label={label("labels.multiSelect")}
              shortcuts={[k(`Shift+${t("helpDialog.click")}`)]}
            />
            <Shortcut
              label={label("helpDialog.deepSelect")}
              shortcuts={[k(`CtrlOrCmd+${t("helpDialog.click")}`)]}
            />
            <Shortcut
              label={label("helpDialog.deepBoxSelect")}
              shortcuts={[k(`CtrlOrCmd+${t("helpDialog.drag")}`)]}
            />
            <Shortcut label={label("labels.copyAsPng")} shortcuts={[k("Shift+Alt+C")]} />
            <Shortcut label={label("labels.copyStyles")} shortcuts={[k("CtrlOrCmd+Alt+C")]} />
            <Shortcut label={label("labels.pasteStyles")} shortcuts={[k("CtrlOrCmd+Alt+V")]} />
            <Shortcut
              label={label("labels.sendToBack")}
              shortcuts={[k(darwin() ? "CtrlOrCmd+Alt+[" : "CtrlOrCmd+Shift+[")]}
            />
            <Shortcut
              label={label("labels.bringToFront")}
              shortcuts={[k(darwin() ? "CtrlOrCmd+Alt+]" : "CtrlOrCmd+Shift+]")]}
            />
            <Shortcut label={label("labels.sendBackward")} shortcuts={[k("CtrlOrCmd+[")]} />
            <Shortcut label={label("labels.bringForward")} shortcuts={[k("CtrlOrCmd+]")]} />
            <Shortcut label={label("labels.alignTop")} shortcuts={[k("CtrlOrCmd+Shift+Up")]} />
            <Shortcut label={label("labels.alignBottom")} shortcuts={[k("CtrlOrCmd+Shift+Down")]} />
            <Shortcut label={label("labels.alignLeft")} shortcuts={[k("CtrlOrCmd+Shift+Left")]} />
            <Shortcut label={label("labels.alignRight")} shortcuts={[k("CtrlOrCmd+Shift+Right")]} />
            <Shortcut
              label={label("labels.duplicateSelection")}
              shortcuts={[k("CtrlOrCmd+D"), k(`Alt+${t("helpDialog.drag")}`)]}
            />
            <Shortcut
              label={label("helpDialog.toggleElementLock")}
              shortcuts={[k("CtrlOrCmd+Shift+L")]}
            />
            <Shortcut label={label("buttons.undo")} shortcuts={[k("CtrlOrCmd+Z")]} />
            <Shortcut
              label={label("buttons.redo")}
              shortcuts={
                isWindows ? [k("CtrlOrCmd+Y"), k("CtrlOrCmd+Shift+Z")] : [k("CtrlOrCmd+Shift+Z")]
              }
            />
            <Shortcut label={label("labels.group")} shortcuts={[k("CtrlOrCmd+G")]} />
            <Shortcut label={label("labels.ungroup")} shortcuts={[k("CtrlOrCmd+Shift+G")]} />
            <Shortcut label={label("labels.toggleAutoResize")} shortcuts={[k("Alt+W")]} />
            <Shortcut label={label("labels.flipHorizontal")} shortcuts={[k("Shift+H")]} />
            <Shortcut label={label("labels.flipVertical")} shortcuts={[k("Shift+V")]} />
            <Shortcut
              label={label("labels.decreaseFontSize")}
              shortcuts={[k("CtrlOrCmd+Shift+<")]}
            />
            <Shortcut
              label={label("labels.increaseFontSize")}
              shortcuts={[k("CtrlOrCmd+Shift+>")]}
            />
          </Island>
        </div>
      </DialogContent>
    </Dialog>
  );
}
