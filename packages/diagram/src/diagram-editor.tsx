import {
  type Child,
  For,
  Show,
  createRenderEffect,
  createSignal,
  createUniqueId,
  onCleanup,
  untrack,
} from "@barqjs/core";
import { useColorScheme } from "@barqjs/primitives/color-scheme";
import { type JSX, isServer } from "@barqjs/web";
import { THEME } from "@excalidraw/common";

import type { Theme } from "@excalidraw/element/types";

import { getDefaultAppState } from "./app-state.ts";
import { restoreAppState } from "./data/restore.ts";
import { DiagramEditor as Editor } from "./editor/editor.ts";
import { resolveUIOptions, type UIOptions } from "./editor/ui-options.ts";
import {
  type LocaleData,
  getLoadedLanguage,
  isRTLLanguage,
  loadLanguage,
  translate,
} from "./i18n.ts";
import { createDiagramUI, type RenderSlot } from "./ui/context.tsx";
import { EditorUI } from "./ui/editor-ui.tsx";
import { EditorStore } from "./ui/store.ts";

import type { DiagramScene } from "./data/types.ts";
import type {
  DiagramChangeListener,
  DiagramEditorApi,
  FrameName,
  TextEditRequest,
} from "./editor/editor.ts";
import type { AppState } from "./types.ts";

type MaybePromise<T> = T | Promise<T>;

export interface DiagramEditorProps {
  /**
   * The scene the editor opens with, read once: a scene, a promise of one or
   * a function returning either, as Excalidraw's `initialData`.
   */
  initialData?:
    | MaybePromise<DiagramScene | null>
    | (() => MaybePromise<DiagramScene | null>)
    | null;
  /** Light or dark. Follows the `colorScheme()` above, arc's included, when omitted; light without one. */
  theme?: Theme;
  /** Called instead of changing the theme when the menu toggles it, for a theme the host owns. */
  onThemeChange?: (theme: Theme) => void;
  /** The accessible name. @default "Diagram editor" */
  label?: string;
  /** Read only: the scene can be panned and zoomed, not edited. The menus then offer no toggle. */
  viewModeEnabled?: boolean;
  /** Hides the panels, leaving the canvas and the toolbar. The menus then offer no toggle. */
  zenModeEnabled?: boolean;
  /** Shows the grid, which elements snap to. */
  gridModeEnabled?: boolean;
  /** The editor's height. @default 480 */
  height?: number | string;
  class?: string;
  /** Called once the editor is mounted, with its API. */
  api?: (api: DiagramEditorApi) => void;
  /** Excalidraw's name for `api`. */
  excalidrawAPI?: (api: DiagramEditorApi) => void;
  /** Called on every change, with the elements, the app state and the files. */
  onChange?: DiagramChangeListener;
  /**
   * The UI's language, one of Excalidraw's locale codes (`"ar-SA"`,
   * `"de-DE"`); loaded when first asked for. @default "en"
   */
  langCode?: string;
  /** Excalidraw's `UIOptions`: the canvas actions the menus offer and the image tool. */
  UIOptions?: UIOptions;
  /** Rendered at the top start, before the main menu. */
  renderTopLeftUI?: RenderSlot;
  /** Rendered at the top end. */
  renderTopRightUI?: RenderSlot;
  /** Rendered in the stats panel, below the general stats. */
  renderCustomStats?: (elements: readonly unknown[], appState: AppState) => Child;
  /** The main menu's entries in place of the defaults, built from `MainMenu`. */
  mainMenu?: Child;
  /** Excalidraw's `aiEnabled`: the text-to-diagram and wireframe entries. @default true */
  aiEnabled?: boolean;
  /** Excalidraw's `generateLinkForSelection`, for the link "copy link to element" copies. */
  generateLinkForSelection?: (id: string, type: "element" | "group") => string;
  /** `false` renders the canvas alone, without the toolbar, the panels or the menus. @default true */
  ui?: boolean;
}

/** The state the UI shows before the editor exists, on the server and while the page hydrates. */
const initialUIState = (
  props: Pick<
    DiagramEditorProps,
    "initialData" | "viewModeEnabled" | "zenModeEnabled" | "gridModeEnabled"
  >,
  theme: Theme,
): AppState => {
  const data = props.initialData;
  const scene = data && typeof data === "object" && !(data instanceof Promise) ? data : null;
  const restored = scene?.appState ? restoreAppState(scene.appState, null) : getDefaultAppState();
  return {
    ...(restored as AppState),
    theme,
    viewModeEnabled: props.viewModeEnabled ?? false,
    zenModeEnabled: props.zenModeEnabled ?? restored.zenModeEnabled ?? false,
    gridModeEnabled: props.gridModeEnabled ?? restored.gridModeEnabled ?? false,
  };
};

const SR_ONLY =
  "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0";

const CANVAS_STYLE = "position:absolute;inset:0;display:block";

const FRAME_NAME_STYLE =
  "position:absolute;z-index:2;width:max-content;white-space:nowrap;text-overflow:ellipsis;cursor:move";

const FRAME_NAME_EDIT_PADDING = 6;

const FRAME_NAME_INPUT_STYLE =
  `display:block;border:none;padding:${FRAME_NAME_EDIT_PADDING}px;border-radius:4px;` +
  `font:inherit;color:inherit;background:Canvas;box-shadow:inset 0 0 0 1px Highlight;` +
  `transform:translate(-${FRAME_NAME_EDIT_PADDING}px, ${FRAME_NAME_EDIT_PADDING}px)`;

const SVG_LAYER_STYLE =
  "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible";

const TEXT_EDITOR_STYLE = "position:absolute;inset:0;overflow:hidden;pointer-events:none";

const KEYBOARD_HELP =
  "Tools: V select, R rectangle, D diamond, O ellipse, A arrow, L line, P draw, T text, " +
  "E eraser, K laser pointer, H hand; " +
  "Enter draws the tool's shape, Q keeps the tool. " +
  "Tab and Shift+Tab move through the elements, Ctrl+A selects all, Escape deselects. " +
  "Arrow keys move the selection, with Shift further. Delete removes, Ctrl+D duplicates, " +
  "Ctrl+G groups and Ctrl+Shift+G ungroups, Ctrl+Shift+L locks, Ctrl+[ and Ctrl+] restack. " +
  "Ctrl+Shift with an arrow key aligns, Alt+Shift+H and Alt+Shift+V centre, Alt+H and Alt+V distribute. " +
  "Enter or a double-click writes in a shape or edits text; Escape or Ctrl+Enter ends it. " +
  "Ctrl+Shift+< and > size text, Alt+W makes it grow or wrap. " +
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
  // the text being edited: a textarea over it while it is
  const [textEdit, setTextEdit] = createSignal<TextEditRequest | null>(null);
  // the frames' names: the list changes as frames come, go or are renamed;
  // the editor places each element as the viewport moves
  const [frameNames, setFrameNames] = createSignal<readonly FrameName[]>([]);

  const size = (): string => {
    const height = props.height ?? 480;
    return `height:${typeof height === "number" ? `${height}px` : height}`;
  };

  let editor: Editor | null = null;

  const store = new EditorStore(untrack(() => initialUIState(props, theme())));
  const langCode = (): string => props.langCode ?? "en";
  // the strings of the language shown: the previous one stays until the next has loaded
  const [langData, setLangData] = createSignal<LocaleData | undefined>(
    getLoadedLanguage(untrack(langCode)),
  );
  const [shownLang, setShownLang] = createSignal(
    getLoadedLanguage(untrack(langCode)) ? untrack(langCode) : "en",
  );
  const uiOptions = () =>
    resolveUIOptions(props.UIOptions, { theme: props.theme, onThemeChange: props.onThemeChange });
  const ui = createDiagramUI({
    store,
    t: (path, replacement, fallback) => translate(langData(), path, replacement, fallback),
    langCode: shownLang,
    rtl: () => isRTLLanguage(shownLang()),
    host: () => ({
      UIOptions: uiOptions(),
      renderTopLeftUI: props.renderTopLeftUI,
      renderTopRightUI: props.renderTopRightUI,
      renderCustomStats: props.renderCustomStats,
      aiEnabled: props.aiEnabled !== false,
      theme: props.theme,
    }),
  });

  const editorHost = () => ({
    UIOptions: uiOptions(),
    viewModeControlled: props.viewModeEnabled !== undefined,
    zenModeControlled: props.zenModeEnabled !== undefined,
    onThemeChange: props.onThemeChange,
    aiEnabled: props.aiEnabled !== false,
    generateLinkForSelection: props.generateLinkForSelection,
  });

  const attach = (host: HTMLDivElement): (() => void) => {
    const [canvas, newElementCanvas, interactiveCanvas] = host.querySelectorAll("canvas");
    if (!canvas || !newElementCanvas || !interactiveCanvas) {
      throw new Error("DiagramEditor: the editor's canvases are missing");
    }
    const given = untrack(() => props.initialData);
    const data = typeof given === "function" ? given() : given;
    const created = new Editor({
      container: host,
      canvas,
      newElementCanvas,
      interactiveCanvas,
      svgLayer: host.querySelector("svg"),
      initialData: data instanceof Promise ? null : data,
      theme: untrack(theme),
      viewModeEnabled: untrack(() => props.viewModeEnabled),
      gridModeEnabled: untrack(() => props.gridModeEnabled),
      host: untrack(editorHost),
    });
    editor = created;
    if (untrack(() => props.zenModeEnabled) !== undefined) {
      created.batch(() =>
        created.setState({ zenModeEnabled: untrack(() => props.zenModeEnabled) }),
      );
    }
    if (data instanceof Promise) {
      created.batch(() => created.setState({ isLoading: true }));
      data.then(
        (scene) => {
          if (!created.isDestroyed) created.loadInitialData(scene);
        },
        (error: unknown) => {
          console.error("DiagramEditor: the initial data did not load", error);
          if (!created.isDestroyed) created.batch(() => created.setState({ isLoading: false }));
        },
      );
    }
    const detachStore = store.attach(created);
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
    // written outside whatever is running, as the announcements are; the
    // keystrokes themselves never reach the graph
    const offTextEdit = created.onTextEditRequest((request) =>
      queueMicrotask(() => setTextEdit(request)),
    );
    const offTextEditEnd = created.onTextEditEnd(() => queueMicrotask(() => setTextEdit(null)));
    const offFrameNames = created.onFrameNamesChange((frames) =>
      queueMicrotask(() => setFrameNames(frames)),
    );
    untrack(() => props.api)?.(created.api);
    untrack(() => props.excalidrawAPI)?.(created.api);
    return () => {
      detachStore();
      offAnnounce();
      offChange();
      offTextEdit();
      offTextEditEnd();
      offFrameNames();
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
    createRenderEffect(
      () => props.zenModeEnabled,
      (next, previous) => {
        if (previous === undefined && next === undefined) return;
        editor?.batch(() => editor?.setState({ zenModeEnabled: next ?? false }));
      },
    );
    createRenderEffect(editorHost, (next) => editor?.setHost(next));
    createRenderEffect(langCode, (code) => {
      // written outside the effect, as the store's are
      void loadLanguage(code).then((data) => {
        if (langCode() !== code) return;
        setLangData(() => data);
        setShownLang(code);
      });
    });
    onCleanup(() => {
      store.dispose();
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
      <svg aria-hidden="true" style={SVG_LAYER_STYLE} />
      <For each={frameNames()} keyed={(frame) => frame.id}>
        {(frame) => {
          let detach: (() => void) | undefined;
          onCleanup(() => detach?.());
          return (
            <div
              style={FRAME_NAME_STYLE}
              ref={(element: HTMLDivElement) => {
                detach = editor?.attachFrameName(frame().id, element);
              }}
            >
              <Show when={frame().editing} fallback={frame().title}>
                <input
                  aria-label="Frame name"
                  value={frame().title}
                  size={frame().title.length + 1}
                  dir="auto"
                  autocomplete="off"
                  style={FRAME_NAME_INPUT_STYLE}
                  ref={(input: HTMLInputElement) =>
                    queueMicrotask(() => {
                      input.focus();
                      input.select();
                    })
                  }
                  onInput={(event) => editor?.renameFrame(frame().id, event.currentTarget.value)}
                  onBlur={() => editor?.endFrameNameEdit()}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" || event.key === "Enter") {
                      editor?.endFrameNameEdit();
                    }
                  }}
                />
              </Show>
            </div>
          );
        }}
      </For>
      <div style={TEXT_EDITOR_STYLE}>
        <Show when={textEdit()} keyed>
          {(request) => (
            <textarea
              aria-label="Text"
              style="pointer-events:auto"
              ref={(textarea: HTMLTextAreaElement) =>
                // attached once in its box, which clips it with the canvases
                queueMicrotask(() => request.attach(textarea))
              }
            />
          )}
        </Show>
      </div>
      <div id={helpId} style={SR_ONLY}>
        {KEYBOARD_HELP}
      </div>
      <div role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>
        {announcement()}
      </div>
      <Show when={props.ui !== false}>
        <EditorUI ui={ui} mainMenu={props.mainMenu} />
      </Show>
    </div>
  );
}
