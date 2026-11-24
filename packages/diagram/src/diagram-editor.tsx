import {
  type Child,
  For,
  Show,
  children,
  createMemo,
  createRenderEffect,
  createSignal,
  createUniqueId,
  getContext,
  onCleanup,
  provide,
  untrack,
} from "@barqjs/core";
import { useColorScheme } from "@barqjs/primitives/color-scheme";
import { type JSX, isServer } from "@barqjs/web";
import { DEFAULT_IMAGE_OPTIONS, THEME } from "@excalidraw/common";

import type { Theme } from "@excalidraw/element/types";

import { getDefaultAppState } from "./app-state.ts";
import { restoreAppState } from "./data/restore.ts";
import { DiagramEditor as Editor } from "./editor/editor.ts";
import { resolveUIOptions, type UIOptions } from "./editor/ui-options.ts";
import type { OnExport } from "./editor/actions/export.ts";
import {
  type LocaleData,
  getLoadedLanguage,
  isRTLLanguage,
  loadLanguage,
  translate,
} from "./i18n.ts";
import { DiagramUIContext, createDiagramUI, type RenderSlot } from "./ui/context.tsx";
import { HostChildrenContext, collectHostChildren } from "./ui/host-children.ts";
import { ExcalidrawAPIContext } from "./ui/hooks.ts";
import { EditorUI } from "./ui/editor-ui.tsx";
import { EmbedLayer, type RenderEmbeddable } from "./ui/embeds.tsx";
import { EditorStore } from "./ui/store.ts";

import type { OnDuplicateData, DurableIncrement, EphemeralIncrement } from "@excalidraw/element";
import type { RenderEnvironment } from "@excalidraw/element/renderEnvironment";
import type { ExcalidrawElement, NonDeletedExcalidrawElement } from "@excalidraw/element/types";
import type { ClipboardData } from "./clipboard.ts";
import type { DiagramScene } from "./data/types.ts";
import type { Embed, EmbeddableSandbox, ValidateEmbeddable } from "./editor/embeds.ts";
import type {
  DiagramChangeListener,
  DiagramEditorApi,
  DiagramEditorOptions,
  FrameName,
  TextEditRequest,
} from "./editor/editor.ts";
import type { PointerDownState } from "./editor/types.ts";
import type { ViewportStatusFrame } from "./ui/viewport-status-frame.tsx";
import type {
  AppState,
  ForcedActiveTool,
  ImageOptions,
  InteractionConfig,
  LibraryItems,
  OnUserFollowedPayload,
  PointerUpdatePayload,
  UIConfig,
  UserToFollow,
  Zoom,
} from "./types.ts";

type MaybePromise<T> = T | Promise<T>;

export interface MountPayload {
  excalidrawAPI: DiagramEditorApi;
  container: HTMLElement;
}

export interface LinkOpenDetail {
  nativeEvent: MouseEvent | PointerEvent;
}

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
  /** Excalidraw's `onExcalidrawAPI`: the API once the editor is mounted, and `null` once it is gone. */
  onExcalidrawAPI?: (api: DiagramEditorApi | null) => void;
  /** Excalidraw's `onMount`: the API and the editor's container, once mounted. */
  onMount?: (payload: MountPayload) => void;
  /** Excalidraw's `onUnmount`. */
  onUnmount?: () => void;
  /** Excalidraw's `onInitialize`: the initial scene is loaded. */
  onInitialize?: (api: DiagramEditorApi) => void;
  /** Called on every change, with the elements, the app state and the files. */
  onChange?: DiagramChangeListener;
  /** Excalidraw's `onIncrement`: the store's increments, durable and ephemeral; read once, at mount. */
  onIncrement?: (event: DurableIncrement | EphemeralIncrement) => void;
  /** Excalidraw's `initialState`: the viewport the initial scene opens at, as `setViewport` takes it. */
  initialState?: DiagramEditorOptions["initialState"];
  /** The document the editor lives in, when it is not the page's (an iframe's). Read once. */
  ownerDocument?: Document;
  /**
   * Where the renderer and the exports make canvases and images and measure
   * text, read once; every render cache is keyed by it, so it is one object
   * for the editor's life. @default the owner window's
   */
  renderEnvironment?: RenderEnvironment;
  /**
   * Excalidraw's `interaction`: `false` takes no input but the API's (the
   * editor is in view mode); a config keeps links, embeds, navigation, the
   * browser's zoom or tools enabled. @default true
   */
  interaction?: boolean | InteractionConfig;
  /**
   * Excalidraw's `activeTool`: the tool the host forces; the user and
   * `setActiveTool` cannot switch from it, it stays after use, and what it
   * draws is not selected.
   */
  activeTool?: ForcedActiveTool;
  /** Snapping to objects. */
  objectsSnapModeEnabled?: boolean;
  /** Excalidraw's `imageOptions`: inserted images' longest side and size. @default 1440 and 4 MiB */
  imageOptions?: ImageOptions;
  /** Excalidraw's `detectScroll`: the page's scroll moves the editor's offsets. @default true */
  detectScroll?: boolean;
  /** Excalidraw's `handleKeyboardGlobally`: keys pressed anywhere in the page reach the editor. */
  handleKeyboardGlobally?: boolean;
  /** Focuses the editor once it is mounted. */
  autoFocus?: boolean;
  /** Excalidraw's `generateIdForFile`: an inserted image's file id. @default the file's digest */
  generateIdForFile?: (file: File) => string | Promise<string>;
  /** Excalidraw's `onPaste`: returning `false` keeps the paste from the editor. */
  onPaste?: (data: ClipboardData, event: ClipboardEvent | null) => Promise<boolean> | boolean;
  /**
   * Excalidraw's `onDuplicate`: sees each duplication (a drag, Ctrl+D, a
   * paste, the library) and returns the elements to use instead, or `false`
   * to cancel it.
   */
  onDuplicate?: (
    nextElements: readonly ExcalidrawElement[],
    prevElements: readonly ExcalidrawElement[],
    data: OnDuplicateData,
  ) => ExcalidrawElement[] | void | false;
  /** Excalidraw's `onLinkOpen`: an element's link is opening; `preventDefault()` keeps it from the editor. */
  onLinkOpen?: (element: NonDeletedExcalidrawElement, event: CustomEvent<LinkOpenDetail>) => void;
  /** Excalidraw's `onPointerDown` on the canvas. */
  onPointerDown?: (activeTool: AppState["activeTool"], pointerDownState: PointerDownState) => void;
  /** Excalidraw's `onPointerUp` after a press on the canvas. */
  onPointerUp?: (activeTool: AppState["activeTool"], pointerDownState: PointerDownState) => void;
  /** Excalidraw's `showDeprecatedFonts`: the font picker offers the fonts Excalidraw retired. */
  showDeprecatedFonts?: boolean;
  /** Excalidraw's `renderScrollbars`: scrollbars along the canvas's edges. */
  renderScrollbars?: boolean;
  /**
   * Excalidraw's children: `MainMenu`, `WelcomeScreen`, `Footer`,
   * `DefaultSidebar` (and its `Trigger` and `TabTriggers`), `TTDDialog`,
   * `TTDDialogTrigger`, `DiagramToCodePlugin` and `CommandPalette` go into
   * the UI's places; anything else, a `Sidebar` included, renders in the UI's
   * layer.
   */
  children?: Child;
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
  /** Excalidraw's `aiEnabled`: the text-to-diagram and wireframe entries. @default true */
  aiEnabled?: boolean;
  /** Excalidraw's `generateLinkForSelection`, for the link "copy link to element" copies. */
  generateLinkForSelection?: (id: string, type: "element" | "group") => string;
  /**
   * Excalidraw's `ui`: `false` renders the canvas without the default UI
   * (the host's children and render props stay); `{ enabled }` keeps some
   * default controls, `{ disabled }` removes some. @default true
   */
  ui?: boolean | UIConfig;
  /** Excalidraw's `onLibraryChange`: called with the library's items after each change. */
  onLibraryChange?: (libraryItems: LibraryItems) => void;
  /** Excalidraw's `libraryReturnUrl`: where the library site sends an installed library back to. @default the page's address */
  libraryReturnUrl?: string;
  /**
   * Where the library's publish dialog posts a library, as Excalidraw's form
   * (`excalidrawLib`, `previewImage`, `name`, `authorName`, ...), answering
   * with `{ url }`. Without it the library offers no publishing.
   */
  libraryPublishEndpoint?: string;
  /** Excalidraw's `name`: what a saved file is called when the scene has no name. */
  name?: string;
  /**
   * Excalidraw's `onExport`: a save to a file waits for it, with a progress
   * toast, so the host can finish what it is doing first (images loading).
   */
  onExport?: OnExport;
  /**
   * Excalidraw's `validateEmbeddable`: the links an embeddable shows, as
   * hostnames, patterns, `true` for all or a function deciding; others stay
   * a placeholder. @default Excalidraw's allow-list
   */
  validateEmbeddable?: ValidateEmbeddable;
  /** Excalidraw's `renderEmbeddable`: what an embeddable shows instead of its iframe, when it returns something. */
  renderEmbeddable?: RenderEmbeddable;
  /**
   * The `sandbox` of an embeddable's iframe, for every link or per link.
   * @default Excalidraw's: `allow-scripts allow-forms allow-popups
   * allow-popups-to-escape-sandbox allow-presentation allow-downloads`, with
   * `allow-same-origin` for the sites it trusts
   */
  embeddableSandbox?: EmbeddableSandbox;
  /** Excalidraw's `isCollaborating`: in a session, the laser pointer gets a button beside the toolbar. */
  isCollaborating?: boolean;
  /** Excalidraw's `onPointerUpdate`: the pointer as it moves, presses and releases, in scene coordinates. */
  onPointerUpdate?: (payload: PointerUpdatePayload) => void;
  /** Excalidraw's `onScrollChange`: the viewport moved or zoomed. */
  onScrollChange?: (scrollX: number, scrollY: number, zoom: Zoom) => void;
  /**
   * Excalidraw's `onUserFollow`: a request to follow a collaborator (from the
   * user list), or to stop (following again, or taking the viewport over).
   */
  onUserFollow?: (payload: OnUserFollowedPayload) => void;
  /**
   * Excalidraw's `userToFollow`, which the host owns: the editor marks this
   * collaborator in the user list and asks to change it through `onUserFollow`.
   */
  userToFollow?: UserToFollow | null;
  /** Excalidraw's `viewportStatusFrame`: a coloured frame around the canvas and a badge saying why. */
  viewportStatusFrame?: ViewportStatusFrame | null;
  /**
   * Excalidraw's `currentUserControls`: below the collaborators, in the user
   * list's menu on a desktop and in the main menu on a phone.
   */
  currentUserControls?: Child | ((isMobile: boolean) => Child);
}

/** The state the UI shows before the editor exists, on the server and while the page hydrates. */
function initialUIState(
  props: Pick<
    DiagramEditorProps,
    "initialData" | "viewModeEnabled" | "zenModeEnabled" | "gridModeEnabled"
  >,
  theme: Theme,
): AppState {
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
}

function applyImageOptions(editor: Editor, options: ImageOptions | undefined): void {
  editor.images.options = {
    maxWidthOrHeight: options?.maxWidthOrHeight ?? DEFAULT_IMAGE_OPTIONS.maxWidthOrHeight,
    maxFileSizeBytes: options?.maxFileSizeBytes ?? DEFAULT_IMAGE_OPTIONS.maxFileSizeBytes,
  };
}

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

const KEYBOARD_HELP = [
  "editorA11y.keyboardHelp.tools",
  "editorA11y.keyboardHelp.draw",
  "editorA11y.keyboardHelp.navigate",
  "editorA11y.keyboardHelp.edit",
  "editorA11y.keyboardHelp.align",
  "editorA11y.keyboardHelp.text",
  "editorA11y.keyboardHelp.view",
  "editorA11y.keyboardHelp.help",
] as const;

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
  function theme(): Theme {
    return props.theme ?? fromScheme() ?? THEME.LIGHT;
  }
  const helpId = createUniqueId();
  const [announcement, setAnnouncement] = createSignal("");
  // the text being edited: a textarea over it while it is
  const [textEdit, setTextEdit] = createSignal<TextEditRequest | null>(null);
  // the frames' names: the list changes as frames come, go or are renamed;
  // the editor places each element as the viewport moves
  const [frameNames, setFrameNames] = createSignal<readonly FrameName[]>([]);
  // the embeds shown: the list changes as they come, go, change or are
  // activated; the editor places each as the viewport moves
  const [embeds, setEmbeds] = createSignal<readonly Embed[]>([]);

  function size(): string {
    const height = props.height ?? 480;
    return `height:${typeof height === "number" ? `${height}px` : height}`;
  }

  let editor: Editor | null = null;

  const store = new EditorStore(untrack(() => initialUIState(props, theme())));
  function langCode(): string {
    return props.langCode ?? "en";
  }
  // the strings of the language shown: the previous one stays until the next has loaded
  const [langData, setLangData] = createSignal<LocaleData | undefined>(
    getLoadedLanguage(untrack(langCode)),
  );
  const [shownLang, setShownLang] = createSignal(
    getLoadedLanguage(untrack(langCode)) ? untrack(langCode) : "en",
  );
  function uiOptions() {
    return resolveUIOptions(props.UIOptions, {
      theme: props.theme,
      onThemeChange: props.onThemeChange,
    });
  }
  const apiProvider = getContext(ExcalidrawAPIContext);
  // the children are read where they can find the editor's UI, and those
  // that go into the UI's places hand their props over
  // read once the UI they render with exists, which reads them back through these
  function slots() {
    return hostGiven().slots;
  }
  const ui = createDiagramUI({
    hostChildren: () => hostGiven().rest,
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
      textToDiagram: slots().ttdDialog,
      diagramToCode: slots().diagramToCode,
      theme: props.theme,
      libraryReturnUrl: props.libraryReturnUrl,
      libraryPublishEndpoint: props.libraryPublishEndpoint,
      isCollaborating: props.isCollaborating === true,
      userToFollow: props.userToFollow ?? null,
      viewportStatusFrame: props.viewportStatusFrame ?? null,
      // read where it renders: a node made here would be made again on each read
      currentUserControls: (isMobile: boolean): Child => {
        const given = props.currentUserControls;
        return typeof given === "function"
          ? (given as (isMobile: boolean) => Child)(isMobile)
          : given;
      },
      ui: props.ui,
      slots: slots(),
      showDeprecatedFonts: props.showDeprecatedFonts === true,
    }),
  });
  let hostChildren: ReturnType<typeof children> | undefined;
  provide(
    HostChildrenContext,
    () => true,
    () =>
      provide(
        DiagramUIContext,
        () => ui,
        () => {
          hostChildren = children(() => props.children);
          return null;
        },
      ),
  );
  const hostGiven = createMemo(() => collectHostChildren(hostChildren?.toArray() ?? []));

  function editorHost() {
    return {
      UIOptions: uiOptions(),
      viewModeControlled: props.viewModeEnabled !== undefined,
      zenModeControlled: props.zenModeEnabled !== undefined,
      onThemeChange: props.onThemeChange,
      aiEnabled: props.aiEnabled !== false,
      diagramToCode: slots().diagramToCode,
      generateLinkForSelection: props.generateLinkForSelection,
      onExport: props.onExport,
      name: props.name,
      untitledName: ui.t("labels.untitled"),
      validateEmbeddable: props.validateEmbeddable,
      embeddableSandbox: props.embeddableSandbox,
      isCollaborating: props.isCollaborating === true,
      userToFollow: props.userToFollow ?? null,
      onPointerUpdate: props.onPointerUpdate,
      onScrollChange: props.onScrollChange,
      onUserFollow: props.onUserFollow,
      langCode: langCode(),
      viewModeEnabled: props.viewModeEnabled,
      interaction: props.interaction,
      activeTool: props.activeTool,
      onPaste: props.onPaste,
      onDuplicate: props.onDuplicate,
      onLinkOpen: props.onLinkOpen,
      onPointerDown: props.onPointerDown,
      onPointerUp: props.onPointerUp,
      generateIdForFile: props.generateIdForFile,
      handleKeyboardGlobally: props.handleKeyboardGlobally === true,
      detectScroll: props.detectScroll !== false,
      renderScrollbars: props.renderScrollbars === true,
      ui: props.ui,
    };
  }

  function attach(host: HTMLDivElement): () => void {
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
      initialState: untrack(() => props.initialState),
      theme: untrack(theme),
      viewModeEnabled: untrack(() => props.viewModeEnabled),
      gridModeEnabled: untrack(() => props.gridModeEnabled),
      objectsSnapModeEnabled: untrack(() => props.objectsSnapModeEnabled),
      ownerDocument: untrack(() => props.ownerDocument),
      renderEnvironment: untrack(() => props.renderEnvironment),
      host: untrack(editorHost),
    });
    editor = created;
    applyImageOptions(
      created,
      untrack(() => props.imageOptions),
    );
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
    const offAnnounce = created.onAnnounce((english, localized) => {
      const message = ui.t(localized.key, localized.replacement, localized.fallback ?? english);
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
    const offLibraryChange = created.library.onChange((items) => {
      untrack(() => props.onLibraryChange)?.(items);
    });
    created.library.translate = (path, replacement) => ui.t(path, replacement);
    // written outside whatever is running, as the announcements are; the
    // keystrokes themselves never reach the graph
    const offTextEdit = created.onTextEditRequest((request) =>
      queueMicrotask(() => setTextEdit(request)),
    );
    const offTextEditEnd = created.onTextEditEnd(() => queueMicrotask(() => setTextEdit(null)));
    const offEmbeds = created.onEmbedsChange((next) => queueMicrotask(() => setEmbeds(next)));
    const offFrameNames = created.onFrameNamesChange((frames) =>
      queueMicrotask(() => setFrameNames(frames)),
    );
    const onIncrement = untrack(() => props.onIncrement);
    const offIncrement = onIncrement ? created.api.onIncrement(onIncrement) : () => {};
    const offInitialize = created.api.onEvent("editor:initialize", (api) =>
      untrack(() => props.onInitialize)?.(api),
    );
    if (untrack(() => props.autoFocus)) {
      // once the region is in the page, which it may not be yet as the ref runs
      queueMicrotask(() => {
        if (!created.isDestroyed) created.focusContainer();
      });
    }
    untrack(() => props.api)?.(created.api);
    untrack(() => props.onMount)?.({ excalidrawAPI: created.api, container: host });
    untrack(() => props.onExcalidrawAPI)?.(created.api);
    // written outside whatever is running, as the announcements are
    queueMicrotask(() => {
      if (!created.isDestroyed) apiProvider?.setApi(created.api);
    });
    return () => {
      offIncrement();
      offInitialize();
      detachStore();
      offAnnounce();
      offChange();
      offLibraryChange();
      offTextEdit();
      offTextEditEnd();
      offFrameNames();
      offEmbeds();
      created.destroy();
      if (editor === created) editor = null;
      untrack(() => props.onUnmount)?.();
      untrack(() => props.onExcalidrawAPI)?.(null);
      queueMicrotask(() => {
        if (apiProvider?.api() === created.api) apiProvider.setApi(null);
      });
    };
  }

  if (!isServer) {
    createRenderEffect(theme, (next) => {
      editor?.batch(() => editor?.setState({ theme: next }));
    });
    createRenderEffect(
      () => props.viewModeEnabled,
      (next, previous) => {
        if (previous === undefined && next === undefined) return;
        // a non-interactive editor stays in view mode
        editor?.batch(() =>
          editor?.setState({ viewModeEnabled: (next ?? false) || !editor.isInteractionEnabled() }),
        );
      },
    );
    createRenderEffect(
      () => props.objectsSnapModeEnabled,
      (next, previous) => {
        if (previous === undefined && next === undefined) return;
        editor?.batch(() => editor?.setState({ objectsSnapModeEnabled: next ?? false }));
      },
    );
    createRenderEffect(
      () => ({ ...props.imageOptions }),
      (next) => {
        if (editor) applyImageOptions(editor, next);
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
      aria-roledescription={ui.t("editorA11y.roleDescription")}
      aria-label={props.label ?? ui.t("editorA11y.label")}
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
      <EmbedLayer
        editor={editor}
        embeds={embeds()}
        t={ui.t}
        renderEmbeddable={props.renderEmbeddable}
      />
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
                  aria-label={ui.t("editorA11y.frameName")}
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
              aria-label={ui.t("editorA11y.text")}
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
        {KEYBOARD_HELP.map((key) => ui.t(key)).join(" ")}
      </div>
      <div role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>
        {announcement()}
      </div>
      <EditorUI ui={ui} />
    </div>
  );
}
