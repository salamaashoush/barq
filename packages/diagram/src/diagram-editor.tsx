import { createRenderEffect, createSignal, createUniqueId, onCleanup, untrack } from "@barqjs/core";
import { useColorScheme } from "@barqjs/primitives/color-scheme";
import { type JSX, isServer } from "@barqjs/web";
import { THEME } from "@excalidraw/common";

import type { Theme } from "@excalidraw/element/types";

import { DiagramEditor as Editor } from "./editor/editor.ts";

import type { DiagramScene } from "./data/types.ts";
import type { DiagramChangeListener, DiagramEditorApi } from "./editor/editor.ts";

export interface DiagramEditorProps {
  /** The scene the editor opens with; read once, as Excalidraw's `initialData`. */
  initialData?: DiagramScene | null;
  /** Light or dark. Follows the `colorScheme()` above, arc's included, when omitted; light without one. */
  theme?: Theme;
  /** The accessible name. @default "Diagram editor" */
  label?: string;
  /** Read only: the scene can be panned and zoomed, not edited. */
  viewModeEnabled?: boolean;
  /** Shows the grid, which elements snap to. */
  gridModeEnabled?: boolean;
  /** The editor's height. @default 480 */
  height?: number | string;
  class?: string;
  /** Called once the editor is mounted, with its API: Excalidraw's `excalidrawAPI`. */
  api?: (api: DiagramEditorApi) => void;
  /** Called on every change, with the elements, the app state and the files. */
  onChange?: DiagramChangeListener;
}

const SR_ONLY =
  "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0";

const CANVAS_STYLE = "position:absolute;inset:0;display:block";

const KEYBOARD_HELP =
  "Tools: V select, R rectangle, D diamond, O ellipse, A arrow, L line, P draw, H hand; " +
  "Enter draws the tool's shape, Q keeps the tool. " +
  "Tab and Shift+Tab move through the elements, Ctrl+A selects all, Escape deselects. " +
  "Arrow keys move the selection, with Shift further. Delete removes, Ctrl+D duplicates, " +
  "Ctrl+G groups and Ctrl+Shift+G ungroups, Ctrl+Shift+L locks, Ctrl+[ and Ctrl+] restack. " +
  "Ctrl+Shift with an arrow key aligns, Alt+Shift+H and Alt+Shift+V centre, Alt+H and Alt+V distribute. " +
  "Ctrl+Z undoes, Ctrl+Shift+Z redoes. Ctrl+= and Ctrl+- zoom, Shift+1 fits, Ctrl+' shows the grid, " +
  "Page Up and Page Down scroll.";

function schemeTheme(): () => Theme | undefined {
  try {
    const scheme = useColorScheme();
    return () => scheme.resolved();
  } catch {
    return () => undefined;
  }
}

/**
 * Excalidraw's editor in barq: a focusable application region holding the
 * scene, the element being drawn and the selection layers, driven by
 * `DiagramEditor` from `@barqjs/diagram/editor`. A live region announces tool
 * and selection changes; every action has a keyboard shortcut, described to
 * assistive technology.
 *
 * On the server it renders the empty region, which hydrates into the editor.
 */
export function DiagramEditor(props: DiagramEditorProps): JSX.Element {
  const fromScheme = schemeTheme();
  const theme = (): Theme => props.theme ?? fromScheme() ?? THEME.LIGHT;
  const helpId = createUniqueId();
  const [announcement, setAnnouncement] = createSignal("");

  const size = (): string => {
    const height = props.height ?? 480;
    return `height:${typeof height === "number" ? `${height}px` : height}`;
  };

  let editor: Editor | null = null;

  const attach = (host: HTMLDivElement): (() => void) => {
    const [canvas, newElementCanvas, interactiveCanvas] = host.querySelectorAll("canvas");
    if (!canvas || !newElementCanvas || !interactiveCanvas) {
      throw new Error("DiagramEditor: the editor's canvases are missing");
    }
    const created = new Editor({
      container: host,
      canvas,
      newElementCanvas,
      interactiveCanvas,
      initialData: untrack(() => props.initialData),
      theme: untrack(theme),
      viewModeEnabled: untrack(() => props.viewModeEnabled),
      gridModeEnabled: untrack(() => props.gridModeEnabled),
    });
    editor = created;
    let repeat = false;
    const offAnnounce = created.onAnnounce((message) => {
      // written outside whatever is running: an announcement may come from
      // an API call made in an effect
      queueMicrotask(() => {
        // the same words again are still news
        repeat = !repeat;
        setAnnouncement(repeat ? message : `${message} `);
      });
    });
    const offChange = created.onChange((elements, appState, files) => {
      untrack(() => props.onChange)?.(elements, appState, files);
    });
    untrack(() => props.api)?.(created.api);
    return () => {
      offAnnounce();
      offChange();
      created.destroy();
      if (editor === created) editor = null;
    };
  };

  if (!isServer) {
    createRenderEffect(theme, (next) => {
      editor?.batch(() => editor?.setState({ theme: next }));
    });
    createRenderEffect(
      () => props.viewModeEnabled,
      (next, previous) => {
        if (previous === undefined && next === undefined) return;
        editor?.batch(() => editor?.setState({ viewModeEnabled: next ?? false }));
      },
    );
    createRenderEffect(
      () => props.gridModeEnabled,
      (next, previous) => {
        if (previous === undefined && next === undefined) return;
        editor?.batch(() => editor?.setState({ gridModeEnabled: next ?? false }));
      },
    );
    onCleanup(() => {
      editor = null;
    });
  }

  return (
    <div
      ref={attach}
      class={props.class}
      role="application"
      aria-roledescription="diagram editor"
      aria-label={props.label ?? "Diagram editor"}
      aria-describedby={helpId}
      aria-keyshortcuts="V R D O A L P H Q Enter Tab Escape Delete Control+A Control+D Control+G Control+Shift+G Control+Z Control+Shift+Z"
      tabIndex={0}
      data-theme={theme()}
      style={`position:relative;overflow:hidden;touch-action:none;outline-offset:2px;user-select:none;width:100%;${size()}`}
    >
      <canvas aria-hidden="true" style={CANVAS_STYLE} />
      <canvas aria-hidden="true" style={`${CANVAS_STYLE};pointer-events:none`} />
      <canvas aria-hidden="true" style={CANVAS_STYLE} />
      <div id={helpId} style={SR_ONLY}>
        {KEYBOARD_HELP}
      </div>
      <div role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>
        {announcement()}
      </div>
    </div>
  );
}
