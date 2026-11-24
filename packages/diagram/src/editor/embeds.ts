import {
  COLOR_PALETTE,
  CURSOR_TYPE,
  DEFAULT_REDUCED_GLOBAL_ALPHA,
  DRAGGING_THRESHOLD,
  Emitter,
  KEYS,
  POINTER_BUTTON,
  YOUTUBE_STATES,
  getGridPoint,
  sceneCoordsToViewportCoords,
  toValidURL,
  viewportCoordsToSceneCoords,
} from "@excalidraw/common";
import {
  ShapeCache,
  createSrcDoc,
  embeddableURLValidator,
  getCornerRadius,
  getEmbedLink,
  getTargetFrame,
  isElementInViewport,
  isEmbeddableElement,
  isFrameClippable,
  isIframeElement,
  isIframeLikeElement,
  newEmbeddableElement,
  shouldApplyFrameClip,
} from "@excalidraw/element";
import { clamp, pointDistance, pointFrom, pointRotateRads } from "@excalidraw/math";

import type {
  ExcalidrawElement,
  ExcalidrawEmbeddableElement,
  ExcalidrawIframeLikeElement,
  NonDeleted,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";
import type { GlobalPoint, Radians } from "@excalidraw/math";

import type { LocalizedMessage } from "../i18n.ts";
import type { EmbedsValidationStatus } from "../types.ts";
import type { DiagramEditor } from "./editor.ts";
import type { MagicGeneration } from "./magic-frame.ts";

/**
 * Excalidraw's `validateEmbeddable`: which links an embeddable shows. `true`
 * allows every link and `false` none; hostnames and patterns allow those
 * (and nothing else); a function decides, falling back to Excalidraw's
 * allow-list when it returns `undefined`. Without it, Excalidraw's
 * allow-list: YouTube, Vimeo, Google Drive, Figma, GitHub gists, X and
 * Twitter, Reddit, Excalidraw links and a few more.
 */
export type ValidateEmbeddable =
  | boolean
  | string[]
  | RegExp
  | RegExp[]
  | ((link: string) => boolean | undefined);

/**
 * The `sandbox` of an embeddable's iframe: one value for every link, or one
 * per link. By default Excalidraw's, which gives the sites it trusts their
 * own origin (`allow-same-origin`) and every link scripts, forms, popups,
 * presentation and downloads.
 */
export type EmbeddableSandbox = string | ((link: string) => string);

/** An iframe over the canvas, which the host renders and gives to `attachEmbed`. */
export interface Embed {
  id: ExcalidrawIframeLikeElement["id"];
  element: NonDeleted<ExcalidrawIframeLikeElement>;
  /** The address the iframe loads, or `null` when it shows `srcdoc`. */
  src: string | null;
  /** The document it shows instead: a post, a gist, a generated page. */
  srcdoc: string | null;
  sandbox: string;
  /**
   * Excalidraw's `activeEmbeddable` for this element: `"hover"` shows that a
   * click interacts with it, `"active"` passes the pointer to it.
   */
  state: "hover" | "active" | null;
  /** The magic frame's generation an iframe element shows, or `null` for an embeddable. */
  generation: MagicGeneration | null;
}

/** The elements the editor places over an embed: its box, what scales a video, the iframe. */
export interface EmbedParts {
  /** Placed, sized, rotated and clipped over the element; takes the pointer only while active. */
  container: HTMLElement;
  /** Inside the container, holding the iframe: scaled up with the zoom for a video. */
  content?: HTMLElement | null;
  /** The iframe, which a click plays or pauses (YouTube, Vimeo, Google Drive) and fullscreen shows. */
  iframe?: HTMLIFrameElement | null;
}

const EMBEDDABLE_SANDBOX =
  "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-downloads";

/** A generated page runs its scripts with no access to the page or its own origin. */
const GENERATED_SANDBOX = "allow-scripts";

const MAX_EMBEDDABLE_VIEWPORT_SCALE = 4;

/** A click that activates an embed lasts at most this long, as in Excalidraw. */
const CLICK_TIMEOUT = 300;

/** The wait before a centre click activates, as Excalidraw's. */
const ACTIVATION_DELAY = 100;

const YOUTUBE_VIDEO_STATES = new Map<
  ExcalidrawElement["id"],
  (typeof YOUTUBE_STATES)[keyof typeof YOUTUBE_STATES]
>();

const GOOGLE_DRIVE_AUTOPLAYED = new WeakSet<HTMLIFrameElement>();

/** The link an embeddable had before an invalid one replaced it, Excalidraw's `embeddableLinkCache`. */
const embeddableLinkCache = new Map<ExcalidrawElement["id"], string>();

/**
 * Whether pasted or dropped text is a link to embed, as Excalidraw tells:
 * allowed by `validateEmbeddable`, and a web address or a video.
 */
export const isEmbeddableLink = (
  link: string,
  validateEmbeddable: ValidateEmbeddable | undefined,
): boolean =>
  embeddableURLValidator(link, validateEmbeddable) &&
  (/^(http|https):\/\/[^\s/$.?#].[^\s]*$/.test(link) || getEmbedLink(link)?.type === "video");

/** Excalidraw's sandbox for an embeddable's link. */
export const getDefaultEmbeddableSandbox = (link: string): string =>
  `${getEmbedLink(toValidURL(link))?.sandbox?.allowSameOrigin ? "allow-same-origin " : ""}${EMBEDDABLE_SANDBOX}`;

const escapeHTML = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Why a generated iframe shows no page, Excalidraw's words; `null` while it has one coming. */
export const getGenerationError = (generation: MagicGeneration | null): string | null => {
  if (generation?.status === "done" || generation?.status === "pending") return null;
  if (generation?.status !== "error") return "No generation data";
  return generation.code === "ERR_GENERATION_INTERRUPTED"
    ? "Generation was interrupted..."
    : generation.message || "Generation failed";
};

/** What a generated iframe shows: the page, what has streamed of it, or its error. */
const generatedSrcdoc = (generation: MagicGeneration | null): string | null => {
  if (generation?.status === "done") return generation.html;
  if (generation?.status === "pending") return generation.partial ?? null;
  const message = getGenerationError(generation) ?? "";
  return createSrcDoc(`
    <style>
      html, body { height: 100%; }
      body { display: flex; flex-direction: column; align-items: center; justify-content: center; color: ${COLOR_PALETTE.red[3]}; }
      h1, h3 { margin-top: 0; margin-bottom: 0.5rem; }
    </style>
    <h1>Error!</h1>
    <h3>${escapeHTML(message)}</h3>
  `);
};

/**
 * Excalidraw's embeds: `embeddable` elements showing a web page whose link
 * validates, and the magic frame's `iframe` elements showing what it
 * generated. The editor validates the links, lists the embeds to show for
 * the host to render, places what the host attaches over the canvas as the
 * viewport and the elements move, and runs their interaction: a hover over
 * an embed's centre, the click there that activates it (pointer events then
 * pass to the iframe) and the click or Escape that ends it.
 */
export class EditorEmbeds {
  private readonly validationStatus: EmbedsValidationStatus = new Map();
  /** Embeds shown once: they stay mounted (hidden) while out of view, so a video keeps playing. */
  private readonly initialized = new Set<ExcalidrawIframeLikeElement["id"]>();
  private readonly attached = new Map<ExcalidrawIframeLikeElement["id"], EmbedParts>();
  private readonly iframes = new Map<ExcalidrawIframeLikeElement["id"], HTMLIFrameElement>();
  private readonly emitter = new Emitter<[embeds: readonly Embed[]]>();
  private readonly timers = new Set<number>();
  private embeds: readonly Embed[] = [];
  private embedsKey = "";
  private scanned: readonly NonDeletedExcalidrawElement[] | null = null;
  private candidateIds: readonly ExcalidrawIframeLikeElement["id"][] = [];
  private validatedWith: unknown = undefined;

  public constructor(private readonly app: DiagramEditor) {}

  /** Excalidraw's `embedsValidationStatus`, which the canvas reads to draw a placeholder. */
  public get embedsValidationStatus(): EmbedsValidationStatus {
    return this.validationStatus;
  }

  public onChange(listener: (embeds: readonly Embed[]) => void): () => void {
    listener(this.embeds);
    return this.emitter.on(listener);
  }

  public attach(id: ExcalidrawIframeLikeElement["id"], parts: EmbedParts): () => void {
    this.attached.set(id, parts);
    if (parts.iframe) this.iframes.set(id, parts.iframe);
    this.app.scheduleRender();
    return () => {
      if (this.attached.get(id) === parts) this.attached.delete(id);
      if (parts.iframe && this.iframes.get(id) === parts.iframe) this.iframes.delete(id);
    };
  }

  public getIframe(element: ExcalidrawIframeLikeElement): HTMLIFrameElement | undefined {
    return this.iframes.get(element.id);
  }

  /** Listens to the players in the embeds, and for fullscreen ending; returns the teardown. */
  public start(): () => void {
    const { ownerWindow, ownerDocument } = this.app;
    const onMessage = (event: MessageEvent) => this.onWindowMessage(event);
    const onFullscreenChange = () => this.app.batch(() => this.onFullscreenChange());
    ownerWindow.addEventListener("message", onMessage);
    ownerDocument.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      ownerWindow.removeEventListener("message", onMessage);
      ownerDocument.removeEventListener("fullscreenchange", onFullscreenChange);
      for (const timer of this.timers) ownerWindow.clearTimeout(timer);
      this.timers.clear();
      this.emitter.clear();
    };
  }

  // ---------------------------------------------------------------------------
  // validation

  public isValid(element: ExcalidrawIframeLikeElement): boolean {
    return isIframeElement(element) || this.validationStatus.get(element.id) === true;
  }

  /** Excalidraw's `updateEmbedValidationStatus`: the canvas draws its placeholder again. */
  public updateValidationStatus(element: ExcalidrawEmbeddableElement, status: boolean): void {
    this.validationStatus.set(element.id, status);
    ShapeCache.delete(element);
  }

  /**
   * Excalidraw's `updateEmbeddables`, after each change: an embeddable is
   * validated once, when first seen; a change of the host's `validateEmbeddable`
   * validates them all again.
   */
  public update(): void {
    const validateEmbeddable = this.app.host.validateEmbeddable;
    if (validateEmbeddable !== this.validatedWith) {
      this.validatedWith = validateEmbeddable;
      if (this.validationStatus.size > 0) {
        for (const id of this.validationStatus.keys()) {
          const element = this.app.scene.getElement(id);
          if (element) ShapeCache.delete(element);
        }
        this.validationStatus.clear();
      }
    }
    const ids = new Set(this.candidates());
    let updated = false;
    for (const id of ids) {
      const element = this.app.scene.getNonDeletedElement(id);
      if (isEmbeddableElement(element) && !this.validationStatus.has(id)) {
        updated = true;
        this.updateValidationStatus(
          element,
          embeddableURLValidator(element.link, validateEmbeddable),
        );
      }
    }
    if (updated) {
      this.app.scene.triggerUpdate();
    }
    for (const id of this.iframes.keys()) {
      if (!ids.has(id)) this.iframes.delete(id);
    }
    this.refresh();
  }

  /** The iframe-like elements in the scene, found again only when it gains or loses elements. */
  private candidates(): readonly ExcalidrawIframeLikeElement["id"][] {
    const elements = this.app.scene.getNonDeletedElements();
    if (elements !== this.scanned) {
      this.scanned = elements;
      this.candidateIds = elements.filter(isIframeLikeElement).map((element) => element.id);
    }
    return this.candidateIds;
  }

  // ---------------------------------------------------------------------------
  // the list the host renders

  private isVisible(element: NonDeleted<ExcalidrawIframeLikeElement>): boolean {
    const { state } = this.app;
    return isElementInViewport(
      element,
      state.width,
      state.height,
      state,
      this.app.scene.getNonDeletedElementsMap(),
    );
  }

  private sandboxOf(element: NonDeleted<ExcalidrawIframeLikeElement>): string {
    if (isIframeElement(element)) return GENERATED_SANDBOX;
    const link = element.link ?? "";
    const sandbox = this.app.host.embeddableSandbox;
    return typeof sandbox === "function"
      ? sandbox(link)
      : (sandbox ?? getDefaultEmbeddableSandbox(link));
  }

  /** Lists the embeds to show again, telling the host when the list changed. */
  private refresh(): void {
    const { state } = this.app;
    const active = state.activeEmbeddable;
    const next: Embed[] = [];
    const keys: string[] = [];
    for (const id of this.candidates()) {
      const element = this.app.scene.getNonDeletedElement(id);
      if (!element || !isIframeLikeElement(element) || !this.isValid(element)) continue;
      if (!this.initialized.has(id)) {
        if (!this.isVisible(element)) continue;
        this.initialized.add(id);
      }
      let src: string | null = null;
      let srcdoc: string | null = null;
      let generation: MagicGeneration | null = null;
      if (isIframeElement(element)) {
        generation = this.app.magicFrame.getGeneration(element);
        srcdoc = generatedSrcdoc(generation);
      } else {
        const embedLink = getEmbedLink(toValidURL(element.link || ""));
        if (embedLink?.type === "document") {
          srcdoc = embedLink.srcdoc(state.theme);
        } else {
          src = embedLink?.link ?? "";
        }
      }
      const embedState = active?.element.id === id ? active.state : null;
      const sandbox = this.sandboxOf(element);
      next.push({ id, element, src, srcdoc, sandbox, state: embedState, generation });
      keys.push(
        [
          id,
          src,
          srcdoc,
          sandbox,
          embedState,
          generation?.status,
          generation?.status === "pending" ? generation.partial : "",
        ].join("\u0000"),
      );
    }
    const key = keys.join("\u0001");
    if (key !== this.embedsKey) {
      this.embedsKey = key;
      this.embeds = next;
      this.emitter.trigger(next);
    }
  }

  /**
   * Places each attached embed over its element, as Excalidraw's
   * `renderEmbeddables` does: at the zoom, rotated, clipped by its frame,
   * hidden while out of view; an embed coming into view the first time joins
   * the list.
   */
  public place(): void {
    let joined = false;
    for (const id of this.candidates()) {
      if (this.initialized.has(id)) continue;
      const element = this.app.scene.getNonDeletedElement(id);
      if (element && isIframeLikeElement(element) && this.isValid(element)) {
        if (this.isVisible(element)) joined = true;
      }
    }
    if (joined) this.refresh();
    if (this.attached.size === 0) return;

    const { state } = this.app;
    const zoom = state.zoom.value;
    const elementsMap = this.app.scene.getNonDeletedElementsMap();
    const active = state.activeEmbeddable;
    for (const [id, parts] of this.attached) {
      const element = elementsMap.get(id);
      const { container, content } = parts;
      const style = container.style;
      if (!element || !isIframeLikeElement(element) || !this.isVisible(element)) {
        style.display = "none";
        continue;
      }
      const { x, y } = sceneCoordsToViewportCoords({ sceneX: element.x, sceneY: element.y }, state);
      const { width, height } = element;
      const radius = getCornerRadius(Math.min(width, height), element);
      style.display = "block";
      style.position = "absolute";
      style.left = "0";
      style.top = "0";
      style.boxSizing = "border-box";
      style.overflow = "hidden";
      style.width = `${width}px`;
      style.height = `${height}px`;
      style.padding = `${element.strokeWidth}px`;
      style.borderRadius = `${radius}px`;
      style.setProperty("--embeddable-radius", `${radius}px`);
      style.transformOrigin = "0 0";
      style.transform =
        `translate(${x - state.offsetLeft}px, ${y - state.offsetTop}px) scale(${zoom}) ` +
        `translate(${width / 2}px, ${height / 2}px) rotate(${element.angle}rad) ` +
        `translate(${-width / 2}px, ${-height / 2}px)`;
      style.opacity = String(
        (element.opacity / 100) *
          (state.openDialog?.name === "elementLinkSelector" ? DEFAULT_REDUCED_GLOBAL_ALPHA : 1),
      );
      style.pointerEvents =
        active?.element.id === id && active.state === "active" ? "auto" : "none";
      style.clipPath = this.frameClipPath(element);

      if (content) {
        // a video is drawn at the zoom (to four times), so a small one zoomed
        // in stays legible
        const scale = clamp(
          !isIframeElement(element) &&
            getEmbedLink(toValidURL(element.link || ""))?.type === "video"
            ? zoom
            : 1,
          0.75,
          MAX_EMBEDDABLE_VIEWPORT_SCALE,
        );
        content.style.width = `${scale * 100}%`;
        content.style.height = `${scale * 100}%`;
        content.style.transformOrigin = "0 0";
        content.style.transform = `scale(${1 / scale})`;
      }
    }
  }

  /** The frame an embed is in, as the canvas clips its children, in the embed's own box. */
  private frameClipPath(element: NonDeleted<ExcalidrawIframeLikeElement>): string {
    const { state } = this.app;
    const elementsMap = this.app.scene.getNonDeletedElementsMap();
    if (
      !element.frameId ||
      !state.frameRendering.enabled ||
      !state.frameRendering.clip ||
      !isFrameClippable(element, elementsMap)
    ) {
      return "";
    }
    const frame = getTargetFrame(element, elementsMap, state);
    if (!frame || !shouldApplyFrameClip(element, frame, state, elementsMap)) {
      return "";
    }
    const center = pointFrom<GlobalPoint>(
      element.x + element.width / 2,
      element.y + element.height / 2,
    );
    const frameCenter = pointFrom<GlobalPoint>(
      frame.x + frame.width / 2,
      frame.y + frame.height / 2,
    );
    const corners = [
      [frame.x, frame.y],
      [frame.x + frame.width, frame.y],
      [frame.x + frame.width, frame.y + frame.height],
      [frame.x, frame.y + frame.height],
    ] as const;
    const points = corners.map(([px, py]) => {
      const onScene = pointRotateRads(pointFrom<GlobalPoint>(px, py), frameCenter, frame.angle);
      const local = pointRotateRads(onScene, center, -(element.angle as number) as Radians);
      return `${local[0] - element.x}px ${local[1] - element.y}px`;
    });
    return `polygon(${points.join(", ")})`;
  }

  // ---------------------------------------------------------------------------
  // interaction

  /** A generated iframe is not interactive while it is still being generated. */
  public isInteractive(element: ExcalidrawElement): boolean {
    if (isIframeElement(element)) {
      return this.app.magicFrame.getGeneration(element)?.status !== "pending";
    }
    return true;
  }

  /** The middle third of an embed, where a hover and a click are the embed's, without modifiers. */
  private isCenter(
    element: ExcalidrawIframeLikeElement,
    event: PointerEvent | MouseEvent,
    sceneX: number,
    sceneY: number,
  ): boolean {
    const active = this.app.state.activeEmbeddable;
    return (
      !event.altKey &&
      !event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      (active?.element.id !== element.id || active.state === "hover") &&
      sceneX >= element.x + element.width / 3 &&
      sceneX <= element.x + (2 * element.width) / 3 &&
      sceneY >= element.y + element.height / 3 &&
      sceneY <= element.y + (2 * element.height) / 3
    );
  }

  /** Excalidraw's `handleIframeLikeElementHover`: whether the pointer is over an embed's centre. */
  public handleHover({
    hitElement,
    scenePointer,
    moveEvent,
  }: {
    hitElement: NonDeletedExcalidrawElement | null;
    scenePointer: { x: number; y: number };
    moveEvent: PointerEvent;
  }): boolean {
    const { app } = this;
    if (
      hitElement &&
      isIframeLikeElement(hitElement) &&
      this.isInteractive(hitElement) &&
      (app.state.viewModeEnabled ||
        app.state.activeTool.type === "laser" ||
        this.isCenter(hitElement, moveEvent, scenePointer.x, scenePointer.y))
    ) {
      app.cursor.set(CURSOR_TYPE.POINTER);
      if (
        app.state.activeEmbeddable?.element.id !== hitElement.id ||
        app.state.activeEmbeddable.state !== "hover"
      ) {
        app.setState({ activeEmbeddable: { element: hitElement, state: "hover" } });
      }
      return true;
    }
    if (app.state.activeEmbeddable?.state === "hover") {
      app.setState({ activeEmbeddable: null });
    }
    return false;
  }

  /**
   * Excalidraw's `handleIframeLikeCenterClick`, on a pointer up: a short
   * click on an embed's centre (anywhere on it in view mode or with the
   * laser) activates it after a moment, and plays or pauses its video.
   * Returns whether the click was the embed's.
   */
  public handleCenterClick(): boolean {
    const { app } = this;
    const down = app.lastPointerDownEvent;
    const up = app.lastPointerUpEvent;
    const tool = app.state.activeTool.type;
    if (
      !down ||
      !up ||
      down.button !== POINTER_BUTTON.MAIN ||
      app.isSpaceHeld() ||
      (tool !== "laser" && tool !== "selection" && tool !== "lasso")
    ) {
      return false;
    }
    const start = viewportCoordsToSceneCoords(
      { clientX: down.clientX, clientY: down.clientY },
      app.state,
    );
    const end = viewportCoordsToSceneCoords(
      { clientX: up.clientX, clientY: up.clientY },
      app.state,
    );
    if (pointDistance(pointFrom(start.x, start.y), pointFrom(end.x, end.y)) > DRAGGING_THRESHOLD) {
      return false;
    }
    const hitElement = app.getElementAtPosition(start.x, start.y);
    if (
      !hitElement ||
      up.timeStamp - down.timeStamp > CLICK_TIMEOUT ||
      app.pointerCount >= 2 ||
      !isIframeLikeElement(hitElement) ||
      !this.isInteractive(hitElement) ||
      !(
        app.state.viewModeEnabled ||
        tool === "laser" ||
        this.isCenter(hitElement, up, end.x, end.y)
      )
    ) {
      return false;
    }
    const active = app.state.activeEmbeddable;
    if (active?.element.id === hitElement.id && active.state === "active") {
      return true;
    }

    // after a moment: the click does not reach the iframe (a phone's would
    // start and stop a video at once), and a double-click does not open a
    // YouTube video in fullscreen
    const timer = app.ownerWindow.setTimeout(() => {
      this.timers.delete(timer);
      if (app.isDestroyed) return;
      app.batch(() =>
        app.setState({
          activeEmbeddable: { element: hitElement, state: "active" },
          selectedElementIds: { [hitElement.id]: true },
          newElement: null,
          selectionElement: null,
        }),
      );
    }, ACTIVATION_DELAY);
    this.timers.add(timer);

    if (isIframeElement(hitElement)) {
      return true;
    }
    const iframe = this.iframes.get(hitElement.id);
    const contentWindow = iframe?.contentWindow;
    if (!iframe || !contentWindow) {
      return true;
    }
    if (iframe.src.includes("youtube")) {
      const videoState = YOUTUBE_VIDEO_STATES.get(hitElement.id);
      if (!videoState) {
        YOUTUBE_VIDEO_STATES.set(hitElement.id, YOUTUBE_STATES.UNSTARTED);
        contentWindow.postMessage(JSON.stringify({ event: "listening", id: hitElement.id }), "*");
      }
      const playing =
        videoState === YOUTUBE_STATES.PLAYING || videoState === YOUTUBE_STATES.BUFFERING;
      contentWindow.postMessage(
        JSON.stringify({
          event: "command",
          func: playing ? "pauseVideo" : "playVideo",
          args: "",
        }),
        "*",
      );
    }
    if (iframe.src.includes("player.vimeo.com")) {
      // played or paused once its answer comes, in the message listener
      contentWindow.postMessage(JSON.stringify({ method: "paused" }), "*");
    }
    // Drive's player has no messages, but its preview page plays with
    // `autoplay=1`: loaded again with it on the first activation, without a
    // history entry and leaving `src` as it was, so a remount does not play
    if (
      iframe.src.startsWith("https://drive.google.com/file/d/") &&
      !GOOGLE_DRIVE_AUTOPLAYED.has(iframe)
    ) {
      GOOGLE_DRIVE_AUTOPLAYED.add(iframe);
      const url = new URL(iframe.src);
      url.searchParams.set("autoplay", "1");
      contentWindow.location.replace(url.toString());
    }
    return true;
  }

  /** The players' answers: Vimeo's paused state, YouTube's player state. */
  private onWindowMessage(event: MessageEvent): void {
    if (event.origin !== "https://player.vimeo.com" && event.origin !== "https://www.youtube.com") {
      return;
    }
    let data: Record<string, unknown> | null = null;
    try {
      data = JSON.parse(String(event.data)) as Record<string, unknown>;
    } catch {
      return;
    }
    if (!data) {
      return;
    }
    if (event.origin === "https://player.vimeo.com") {
      if (data.method === "paused") {
        const source = [...this.iframes.values()].find(
          (iframe) => iframe.contentWindow === event.source,
        )?.contentWindow;
        source?.postMessage(
          JSON.stringify({ method: data.value ? "play" : "pause", value: true }),
          "*",
        );
      }
      return;
    }
    const info = data.info as { playerState?: unknown } | undefined;
    if (
      data.event === "infoDelivery" &&
      info &&
      typeof data.id === "string" &&
      typeof info.playerState === "number"
    ) {
      const playerState = info.playerState as (typeof YOUTUBE_STATES)[keyof typeof YOUTUBE_STATES];
      if (Object.values(YOUTUBE_STATES).includes(playerState)) {
        YOUTUBE_VIDEO_STATES.set(data.id, playerState);
      }
    }
  }

  /** An embed shown in fullscreen (generated pages) ends its activity when fullscreen does. */
  private onFullscreenChange(): void {
    if (
      !this.app.ownerDocument.fullscreenElement &&
      this.app.state.activeEmbeddable?.state === "active"
    ) {
      this.app.setState({ activeEmbeddable: null });
    }
  }

  /** Shows a generated page's iframe in fullscreen, active; Excalidraw's "Enter fullscreen". */
  public enterFullscreen(element: NonDeleted<ExcalidrawIframeLikeElement>): void {
    const { app } = this;
    const iframe = this.iframes.get(element.id);
    if (!iframe) return;
    const failed = (error: unknown) => {
      console.warn(error);
      app.batch(() =>
        app.setState({
          errorMessage: { key: "magicFrame.fullscreenFailed" } satisfies LocalizedMessage,
        }),
      );
    };
    try {
      void Promise.resolve(iframe.requestFullscreen()).catch(failed);
    } catch (error) {
      failed(error);
      return;
    }
    app.batch(() =>
      app.setState({
        activeEmbeddable: { element, state: "active" },
        selectedElementIds: { [element.id]: true },
        newElement: null,
        selectionElement: null,
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // creation and links

  /**
   * Excalidraw's `insertEmbeddableElement`: an embeddable for the link at a
   * scene point, on the grid, at the size its kind of embed has; `undefined`
   * when the link is none.
   */
  public insertEmbeddableElement({
    sceneX,
    sceneY,
    link,
  }: {
    sceneX: number;
    sceneY: number;
    link: string;
  }): NonDeleted<ExcalidrawEmbeddableElement> | undefined {
    const { app } = this;
    const [gridX, gridY] = getGridPoint(
      sceneX,
      sceneY,
      app.lastPointerDownEvent?.[KEYS.CTRL_OR_CMD] ? null : app.getEffectiveGridSize(),
    );
    const embedLink = getEmbedLink(link);
    if (!embedLink) {
      return undefined;
    }
    if (embedLink.error instanceof URIError) {
      app.setState({
        toast: {
          message: { key: "toast.unrecognizedLinkFormat" } satisfies LocalizedMessage,
          closable: true,
        },
      });
    }
    const element = newEmbeddableElement({
      type: "embeddable",
      x: gridX,
      y: gridY,
      strokeColor: "transparent",
      backgroundColor: "transparent",
      fillStyle: app.state.currentItemFillStyle,
      strokeWidth: app.getCurrentItemStrokeWidth("embeddable"),
      strokeStyle: app.state.currentItemStrokeStyle,
      roughness: app.state.currentItemRoughness,
      roundness: app.getCurrentItemRoundness("embeddable"),
      opacity: app.state.currentItemOpacity,
      locked: false,
      width: embedLink.intrinsicSize.w,
      height: embedLink.intrinsicSize.h,
      link,
    });
    app.insertNewElement(element);
    return element;
  }

  /**
   * An embeddable's link as the link editor submits it, Excalidraw's
   * `Hyperlink` `handleSubmit`: an invalid link is kept with a toast and the
   * element stays a placeholder; a valid one shows, a video resized to its
   * proportions when the link changed.
   */
  public submitLink(element: NonDeleted<ExcalidrawEmbeddableElement>, link: string | null): void {
    const { app } = this;
    if (app.state.activeEmbeddable?.element.id === element.id) {
      app.setState({ activeEmbeddable: null });
    }
    if (!link) {
      app.scene.mutateElement(element, { link: null });
      this.updateValidationStatus(element, false);
      return;
    }
    if (!embeddableURLValidator(link, app.host.validateEmbeddable)) {
      app.setState({
        toast: {
          message: { key: "toast.unableToEmbed" } satisfies LocalizedMessage,
          closable: true,
        },
      });
      if (element.link) embeddableLinkCache.set(element.id, element.link);
      app.scene.mutateElement(element, { link });
      this.updateValidationStatus(element, false);
      return;
    }
    const { width, height } = element;
    const embedLink = getEmbedLink(link);
    if (embedLink?.error instanceof URIError) {
      app.setState({
        toast: {
          message: { key: "toast.unrecognizedLinkFormat" } satisfies LocalizedMessage,
          closable: true,
        },
      });
    }
    const ratio = embedLink ? embedLink.intrinsicSize.w / embedLink.intrinsicSize.h : 1;
    const hasLinkChanged = embeddableLinkCache.get(element.id) !== element.link;
    const isVideo = embedLink?.type === "video";
    app.scene.mutateElement(element, {
      ...(hasLinkChanged
        ? {
            width: isVideo ? (width > height ? width : height * ratio) : width,
            height: isVideo ? (width > height ? width / ratio : height) : height,
          }
        : {}),
      link,
    });
    this.updateValidationStatus(element, true);
    embeddableLinkCache.delete(element.id);
  }
}
