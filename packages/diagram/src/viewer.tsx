import { NoHydration, createRenderEffect, createUniqueId, onCleanup, untrack } from "@barqjs/core";
import { useColorScheme } from "@barqjs/primitives/color-scheme";
import { type JSX, isServer } from "@barqjs/web";
import { THEME } from "@excalidraw/common";
import { getCommonBounds, getNonDeletedElements, getTextFromElements } from "@excalidraw/element";
import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
  Theme,
} from "@excalidraw/element/types";

import { getDefaultAppState } from "./app-state.ts";
import { restore } from "./data/restore.ts";
import type { ImportedDataState } from "./data/types.ts";
import {
  PointerNavigation,
  type ViewportState,
  fitToContent,
  keyboardNavigation,
  wheelNavigation,
  zoomAt,
} from "./navigation.ts";
import { SceneCanvas } from "./scene-canvas.ts";
import type { AppState, BinaryFiles } from "./types.ts";
import type { ViewportFit } from "./viewport.ts";

/** A scene to show: a parsed `.excalidraw` file, or what `loadFromBlob` or `restore` returns. */
export type DiagramScene = Pick<ImportedDataState, "elements" | "appState" | "files">;

/** What a page can do with a viewer once it is mounted; Excalidraw's API names. */
export interface DiagramViewerApi {
  getSceneElements(): readonly NonDeletedExcalidrawElement[];
  getAppState(): Readonly<AppState>;
  getFiles(): BinaryFiles;
  /** Fits the content in the viewport, as when the viewer opened. */
  scrollToContent(fit?: ViewportFit): void;
  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
  /** Measures the viewer again, after something moved it without resizing it. */
  refresh(): void;
}

export interface DiagramViewerProps {
  scene: DiagramScene | null | undefined;
  /** Light or dark. Follows the `colorScheme()` above, arc's included, when omitted; light without one. */
  theme?: Theme;
  /** The accessible name. The scene's own name, else "Diagram". */
  label?: string;
  /** The accessible description. The diagram's text, in reading order, by default. */
  description?: string;
  /**
   * The scene as SVG markup, `exportToSvgString`'s result, shown until the
   * canvas has drawn. On the server it is the whole of what renders, so the
   * page shows the diagram before any script runs.
   */
  snapshot?: string;
  /** How the content first fits the viewport. @default "contain" */
  fit?: ViewportFit;
  /** Space kept around the content when it is fitted, in CSS pixels. @default 16 */
  padding?: number;
  /** The viewer's height. Omitted, it takes the content's aspect ratio at its width. */
  height?: number | string;
  class?: string;
  /** Called once the viewer is mounted, with its API. */
  api?: (api: DiagramViewerApi) => void;
}

const SR_ONLY =
  "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0";

function schemeTheme(): () => Theme | undefined {
  try {
    const scheme = useColorScheme();
    return () => scheme.resolved();
  } catch {
    return () => undefined;
  }
}

function sceneElements(scene: DiagramScene | null | undefined): readonly ExcalidrawElement[] {
  return getNonDeletedElements(scene?.elements ?? []);
}

/** The content's aspect ratio with its padding, for a viewer with no height of its own. */
function aspectRatio(elements: readonly ExcalidrawElement[], padding: number): string {
  if (elements.length === 0) return "2 / 1";
  const [x1, y1, x2, y2] = getCommonBounds(elements);
  const width = Math.max(1, x2 - x1 + padding * 2);
  const height = Math.max(1, y2 - y1 + padding * 2);
  return `${Math.round(width)} / ${Math.round(height)}`;
}

/**
 * A scene, read-only: drawn on a canvas, panned by dragging, the wheel or the
 * arrow keys, zoomed by the wheel with ctrl or cmd, a pinch or `+` and `-`,
 * and fitted again with shift+1 or `0` with ctrl. It refits as it resizes
 * until it is navigated, then keeps the view.
 *
 * On the server it renders `snapshot` when given, else an empty box of the
 * content's proportions, and hydrates into the canvas.
 */
export function DiagramViewer(props: DiagramViewerProps): JSX.Element {
  const fromScheme = schemeTheme();
  const theme = (): Theme => props.theme ?? fromScheme() ?? THEME.LIGHT;
  const padding = (): number => props.padding ?? 16;
  const descriptionId = createUniqueId();

  const label = (): string => {
    const named = props.scene?.appState?.name;
    return props.label ?? (typeof named === "string" && named !== "" ? named : "Diagram");
  };
  const description = (): string =>
    props.description ?? getTextFromElements(sceneElements(props.scene), "\n");

  const size = (): string => {
    const height = props.height;
    if (height !== undefined) {
      return `height:${typeof height === "number" ? `${height}px` : height}`;
    }
    return `aspect-ratio:${aspectRatio(sceneElements(props.scene), padding())}`;
  };

  let view: View | null = null;

  const attach = (host: HTMLDivElement): (() => void) => {
    const created = new View(host, {
      theme: untrack(theme),
      fit: untrack(() => props.fit) ?? "contain",
      padding: untrack(padding),
    });
    view = created;
    created.load(untrack(() => props.scene));
    const api = untrack(() => props.api);
    api?.(created.api);
    return () => {
      created.destroy();
      if (view === created) view = null;
    };
  };

  if (!isServer) {
    createRenderEffect(theme, (next) => {
      view?.setTheme(next);
    });
    createRenderEffect(
      () => props.scene,
      (scene, previous) => {
        if (previous !== undefined) view?.load(scene);
      },
    );
    onCleanup(() => {
      view = null;
    });
  }

  return (
    <div
      ref={attach}
      class={props.class}
      role="region"
      aria-roledescription="diagram"
      aria-label={label()}
      aria-describedby={descriptionId}
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight + - Control+0 Shift+1 PageUp PageDown"
      tabIndex={0}
      data-theme={theme()}
      style={`position:relative;overflow:hidden;touch-action:none;outline-offset:2px;width:100%;${size()}`}
    >
      <NoHydration>
        <div
          data-diagram-snapshot=""
          aria-hidden="true"
          style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"
          innerHTML={props.snapshot ?? ""}
        />
      </NoHydration>
      <div id={descriptionId} style={SR_ONLY}>
        {description()}
      </div>
    </div>
  );
}

interface ViewOptions {
  theme: Theme;
  fit: ViewportFit;
  padding: number;
}

/** The mounted viewer: a canvas over the host, its viewport, and the input that moves it. */
class View {
  private readonly canvas: HTMLCanvasElement;
  private readonly sceneCanvas: SceneCanvas;
  private readonly pointer = new PointerNavigation();
  private readonly resize: ResizeObserver | null;
  private readonly listeners: (() => void)[] = [];
  private state: AppState;
  private files: BinaryFiles = {};
  /** Navigated by the reader: a resize keeps the view rather than refitting. */
  private navigated = false;
  private frame: number | null = null;
  private loads = 0;

  public readonly api: DiagramViewerApi;
  private readonly window: Window & typeof globalThis;

  public constructor(
    private readonly host: HTMLDivElement,
    private readonly options: ViewOptions,
  ) {
    // The ref runs before the host is in the page: an element cloned from a
    // template still belongs to the template's inert document, which has no
    // window, no font set and no ResizeObserver.
    this.window = host.ownerDocument.defaultView ?? window;
    this.canvas = this.window.document.createElement("canvas");
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.style.position = "absolute";
    this.canvas.style.inset = "0";
    this.canvas.style.display = "block";
    host.prepend(this.canvas);
    this.sceneCanvas = new SceneCanvas(this.canvas);
    this.state = {
      ...getDefaultAppState(),
      viewModeEnabled: true,
      theme: options.theme,
      width: host.clientWidth,
      height: host.clientHeight,
      offsetLeft: 0,
      offsetTop: 0,
    };
    this.measure();

    this.resize =
      "ResizeObserver" in this.window
        ? new this.window.ResizeObserver(() => {
            this.measure();
            if (!this.navigated) this.fit();
            this.draw();
          })
        : null;
    this.resize?.observe(host);

    this.listen("wheel", (event) => this.onWheel(event as WheelEvent), { passive: false });
    this.listen("pointerdown", (event) => this.onPointerDown(event as PointerEvent));
    this.listen("pointermove", (event) => this.onPointerMove(event as PointerEvent));
    this.listen("pointerup", (event) => this.pointer.up(event as PointerEvent));
    this.listen("pointercancel", (event) => this.pointer.up(event as PointerEvent));
    this.listen("keydown", (event) => this.onKeyDown(event as KeyboardEvent));

    this.api = {
      getSceneElements: () => this.sceneCanvas.elements,
      getAppState: () => this.state,
      getFiles: () => this.files,
      scrollToContent: (fit) => {
        this.fit(fit);
        this.navigated = false;
        this.draw();
      },
      zoomIn: () => this.zoomBy(1),
      zoomOut: () => this.zoomBy(-1),
      resetZoom: () => this.navigate(zoomAt(this.state, 1, this.centerX(), this.centerY())),
      refresh: () => {
        this.measure();
        this.draw();
      },
    };
  }

  public load(scene: DiagramScene | null | undefined): void {
    const restored = restore(scene ?? null, null, null, { repairBindings: true });
    const { width, height, offsetLeft, offsetTop, theme } = this.state;
    this.state = {
      ...restored.appState,
      viewModeEnabled: true,
      width,
      height,
      offsetLeft,
      offsetTop,
      theme,
    };
    this.files = restored.files;
    this.navigated = false;
    const load = ++this.loads;
    const fonts = this.sceneCanvas.setElements(restored.elements);
    this.fit();
    this.draw();
    void Promise.all([fonts, this.sceneCanvas.setFiles(restored.files)])
      .catch((error: unknown) => {
        console.error("DiagramViewer: the scene's fonts or images did not load", error);
      })
      .then(() => {
        if (load !== this.loads) return;
        this.draw();
        // The snapshot covers the canvas until the canvas has the scene's
        // fonts and images, so the swap is not seen.
        this.host.querySelector("[data-diagram-snapshot]")?.remove();
      });
  }

  public setTheme(theme: Theme): void {
    if (theme === this.state.theme) return;
    this.state = { ...this.state, theme };
    this.draw();
  }

  public destroy(): void {
    if (this.frame !== null) this.window.cancelAnimationFrame(this.frame);
    this.resize?.disconnect();
    for (const remove of this.listeners) remove();
    this.sceneCanvas.destroy();
    this.canvas.remove();
  }

  private listen(
    type: string,
    handler: (event: Event) => void,
    options?: AddEventListenerOptions,
  ): void {
    this.host.addEventListener(type, handler, options);
    this.listeners.push(() => this.host.removeEventListener(type, handler, options));
  }

  private measure(): void {
    const rect = this.host.getBoundingClientRect();
    this.state = {
      ...this.state,
      width: Math.max(1, Math.round(rect.width || this.host.clientWidth)),
      height: Math.max(1, Math.round(rect.height || this.host.clientHeight)),
      offsetLeft: rect.left,
      offsetTop: rect.top,
    };
  }

  private fit(fit: ViewportFit = this.options.fit): void {
    const inset = this.options.padding * 2;
    const padded = {
      ...this.state,
      width: Math.max(1, this.state.width - inset),
      height: Math.max(1, this.state.height - inset),
    };
    const fitted = fitToContent(padded, this.sceneCanvas.elements, fit);
    this.state = {
      ...this.state,
      zoom: fitted.zoom,
      scrollX: fitted.scrollX + this.options.padding / fitted.zoom.value,
      scrollY: fitted.scrollY + this.options.padding / fitted.zoom.value,
    };
  }

  private centerX(): number {
    return this.state.offsetLeft + this.state.width / 2;
  }

  private centerY(): number {
    return this.state.offsetTop + this.state.height / 2;
  }

  private zoomBy(direction: 1 | -1): void {
    this.navigate(
      zoomAt(this.state, this.state.zoom.value + direction * 0.1, this.centerX(), this.centerY()),
    );
  }

  private navigate(next: ViewportState | null): boolean {
    if (next === null) return false;
    this.navigated = true;
    this.state = { ...this.state, ...next };
    this.schedule();
    return true;
  }

  private onWheel(event: WheelEvent): void {
    this.measure();
    if (this.navigate(wheelNavigation(event, this.state))) event.preventDefault();
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    this.measure();
    this.pointer.down(event, this.state);
    this.host.setPointerCapture?.(event.pointerId);
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.pointer.active) return;
    this.navigate(this.pointer.move(event, this.state));
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.target !== this.host) return;
    this.measure();
    const next = keyboardNavigation(event, this.state, this.sceneCanvas.elements);
    if (next === null) return;
    event.preventDefault();
    if (event.code === "Digit1" && event.shiftKey) {
      this.fit("scale-down");
      this.navigated = false;
      this.draw();
      return;
    }
    this.navigate(next);
  }

  private schedule(): void {
    if (this.frame !== null) return;
    this.frame = this.window.requestAnimationFrame(() => {
      this.frame = null;
      this.draw();
    });
  }

  private draw(): void {
    const scale = this.window.devicePixelRatio || 1;
    this.sceneCanvas.render(this.state, scale);
  }
}
