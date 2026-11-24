/**
 * Excalidraw's test helpers (`tests/helpers/api.ts` and `ui.ts`), for the
 * editor without React: `Keyboard` and `Pointer` dispatch real DOM events at
 * the editor's container and interactive canvas, `UI` drives the editor the
 * way a person does, and `API` reads and sets its scene directly.
 *
 * The container is 1024 by 768 at the page's origin, so at the default zoom
 * and scroll a client point is the same scene point.
 */

import { KEYS, arrayToMap } from "@excalidraw/common";
import {
  getCommonBounds,
  getElementPointsCoords,
  getSelectedElements,
  getTransformHandles,
  getTransformHandlesFromCoords,
  isFrameLikeElement,
  isFreeDrawElement,
  isLinearElement,
  isTextElement,
  elementCenterPoint,
  newArrowElement,
  newElement,
  newFreeDrawElement,
  newLinearElement,
  OMIT_SIDES_FOR_FRAME,
  OMIT_SIDES_FOR_MULTIPLE_ELEMENTS,
} from "@excalidraw/element";
import { pointFrom, pointRotateRads } from "@excalidraw/math";

import type { TransformHandleDirection, TransformHandleType } from "@excalidraw/element";
import type {
  ExcalidrawArrowElement,
  ExcalidrawElement,
  ExcalidrawFreeDrawElement,
  ExcalidrawGenericElement,
  ExcalidrawLinearElement,
  NonDeleted,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";
import type { GlobalPoint, LocalPoint, Radians } from "@excalidraw/math";

import { DiagramEditor, type DiagramEditorOptions } from "./editor.ts";
import { selectGroupsForSelectedElements } from "./selection.ts";

import type { AppState, ToolType } from "../types.ts";
import type { Action } from "./types.ts";

export const WIDTH = 1024;
export const HEIGHT = 768;

let current: DiagramEditor | null = null;
const mounted: { editor: DiagramEditor; container: HTMLElement }[] = [];

/** The editor under test, mounted by `renderEditor`. */
export const h = (): DiagramEditor => {
  if (current === null) throw new Error("renderEditor() first");
  return current;
};

/** Mounts an editor in a 1024 by 768 container at the origin of the page. */
export const renderEditor = ({
  textEditor = true,
  ...options
}: Partial<Omit<DiagramEditorOptions, "container">> & {
  /** Answers text edit requests with a textarea, as `<DiagramEditor>` does. */
  textEditor?: boolean;
} = {}): DiagramEditor => {
  const container = document.createElement("div");
  container.tabIndex = 0;
  container.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: WIDTH,
      bottom: HEIGHT,
      width: WIDTH,
      height: HEIGHT,
    }) as DOMRect;
  const canvas = document.createElement("canvas");
  const newElementCanvas = document.createElement("canvas");
  const interactiveCanvas = document.createElement("canvas");
  const svgLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  container.append(canvas, newElementCanvas, interactiveCanvas, svgLayer);
  document.body.append(container);
  const editor = new DiagramEditor({
    container,
    canvas,
    newElementCanvas,
    interactiveCanvas,
    svgLayer,
    ...options,
  });
  if (textEditor) {
    mountTextEditor(editor, container);
  }
  mountFrameNames(editor, container);
  mounted.push({ editor, container });
  current = editor;
  Keyboard.reset();
  Pointer.resetAll();
  return editor;
};

/**
 * A host's text editor: a textarea in a box over the canvases for each
 * request, removed when the edit ends.
 */
const mountTextEditor = (editor: DiagramEditor, host: HTMLElement): void => {
  const box = document.createElement("div");
  box.style.cssText = "position:absolute;inset:0;overflow:hidden;pointer-events:none";
  host.append(box);
  editor.onTextEditRequest((request) => {
    const textarea = document.createElement("textarea");
    textarea.style.pointerEvents = "auto";
    box.append(textarea);
    request.attach(textarea);
  });
  editor.onTextEditEnd(() => box.replaceChildren());
};

/** A host's frame names: an element per frame, placed by the editor. */
const mountFrameNames = (editor: DiagramEditor, host: HTMLElement): void => {
  const shown = new Map<string, { element: HTMLElement; detach: () => void }>();
  editor.onFrameNamesChange((frames) => {
    const ids = new Set(frames.map((frame) => frame.id));
    for (const [id, { element, detach }] of shown) {
      if (!ids.has(id)) {
        detach();
        element.remove();
        shown.delete(id);
      }
    }
    for (const frame of frames) {
      let entry = shown.get(frame.id);
      if (!entry) {
        const element = document.createElement("div");
        element.dataset.frameName = frame.id;
        host.append(element);
        entry = { element, detach: editor.attachFrameName(frame.id, element) };
        shown.set(frame.id, entry);
      }
      entry.element.textContent = frame.editing ? "" : frame.title;
      entry.element.dataset.editing = String(frame.editing);
    }
  });
};

/** The element showing a frame's name. */
export const getFrameName = (frameId: string): HTMLElement | null =>
  h().container.querySelector<HTMLElement>(`[data-frame-name="${frameId}"]`);

/** The open text editor's textarea, or `null`. */
export const getTextEditor = (): HTMLTextAreaElement | null =>
  h().container.querySelector<HTMLTextAreaElement>("textarea[data-type=wysiwyg]");

/** The open text editor, once it has focus (a task after it opens). */
export const textEditor = async (): Promise<HTMLTextAreaElement> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  const textarea = getTextEditor();
  if (!textarea) throw new Error("no text editor is open");
  return textarea;
};

/** Destroys the editors `renderEditor` mounted. */
export const unmountEditors = (): void => {
  for (const { editor, container } of mounted.splice(0)) {
    editor.destroy();
    container.remove();
  }
  current = null;
};

const interactiveCanvas = () => h().interactiveCanvas;

const container = () => h().container;

let altKey = false;
let shiftKey = false;
let ctrlKey = false;

export interface KeyboardModifiers {
  alt?: boolean;
  shift?: boolean;
  /** Ctrl, or Cmd on macOS: Excalidraw's `CTRL_OR_CMD`. */
  ctrl?: boolean;
}

const modifierFlags = () => ({
  altKey,
  shiftKey,
  ctrlKey: KEYS.CTRL_OR_CMD === "ctrlKey" ? ctrlKey : false,
  metaKey: KEYS.CTRL_OR_CMD === "metaKey" ? ctrlKey : false,
});

const CODE_OF_KEY: Record<string, string> = {
  "[": "BracketLeft",
  "]": "BracketRight",
  "=": "Equal",
  "-": "Minus",
  "'": "Quote",
  " ": "Space",
  ".": "Period",
  ",": "Comma",
};

const codeOf = (key: string): string => {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return CODE_OF_KEY[key] ?? key;
};

export const Keyboard = {
  reset(): void {
    altKey = shiftKey = ctrlKey = false;
  },

  withModifierKeys(modifiers: KeyboardModifiers, cb: () => void): void {
    const prev = [altKey, shiftKey, ctrlKey] as const;
    altKey = !!modifiers.alt;
    shiftKey = !!modifiers.shift;
    ctrlKey = !!modifiers.ctrl;
    try {
      cb();
    } finally {
      [altKey, shiftKey, ctrlKey] = prev;
    }
  },

  keyDown(key: string, target: EventTarget = container()): KeyboardEvent {
    const event = new KeyboardEvent("keydown", {
      key,
      code: codeOf(key),
      bubbles: true,
      cancelable: true,
      ...modifierFlags(),
    });
    target.dispatchEvent(event);
    return event;
  },

  keyUp(key: string, target: EventTarget = container()): KeyboardEvent {
    const event = new KeyboardEvent("keyup", {
      key,
      code: codeOf(key),
      bubbles: true,
      cancelable: true,
      ...modifierFlags(),
    });
    target.dispatchEvent(event);
    return event;
  },

  keyPress(key: string, target?: EventTarget): KeyboardEvent {
    const down = Keyboard.keyDown(key, target);
    Keyboard.keyUp(key, target);
    return down;
  },

  codeDown(code: string): void {
    container().dispatchEvent(
      new KeyboardEvent("keydown", {
        code,
        key: "",
        bubbles: true,
        cancelable: true,
        ...modifierFlags(),
      }),
    );
  },

  codeUp(code: string): void {
    container().dispatchEvent(
      new KeyboardEvent("keyup", {
        code,
        key: "",
        bubbles: true,
        cancelable: true,
        ...modifierFlags(),
      }),
    );
  },

  codePress(code: string): void {
    Keyboard.codeDown(code);
    Keyboard.codeUp(code);
  },

  undo(): void {
    Keyboard.withModifierKeys({ ctrl: true }, () => Keyboard.keyPress("z"));
  },

  redo(): void {
    Keyboard.withModifierKeys({ ctrl: true, shift: true }, () => Keyboard.keyPress("z"));
  },
};

/** A wheel event on the editor; happy-dom's `WheelEvent` drops the keys and the pointer from its init. */
export const wheel = (init: WheelEventInit): WheelEvent => {
  const event = new WheelEvent("wheel", { ...init, bubbles: true, cancelable: true });
  for (const key of ["ctrlKey", "metaKey", "shiftKey", "clientX", "clientY", "buttons"] as const) {
    Object.defineProperty(event, key, {
      value: init[key] ?? (typeof event[key] === "boolean" ? false : 0),
    });
  }
  container().dispatchEvent(event);
  return event;
};

/** Where a click selects an element: its top edge's middle, or its points' centre. */
const getElementPointForSelection = (element: ExcalidrawElement): [number, number] => {
  const { x, y, width, angle } = element;
  const target = pointFrom<GlobalPoint>(
    x + (isLinearElement(element) || isFreeDrawElement(element) ? 0 : width / 2),
    y,
  );
  let center: GlobalPoint;
  if (isLinearElement(element)) {
    const bounds = getElementPointsCoords(element, element.points);
    center = pointFrom((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2);
  } else {
    center = elementCenterPoint(element, h().scene.getElementsMapIncludingDeleted());
  }
  if (isTextElement(element)) {
    return [center[0], center[1]];
  }
  const point = pointRotateRads(target, center, angle);
  return [point[0], point[1]];
};

export class Pointer {
  public clientX = 0;
  public clientY = 0;
  private buttons = 0;

  private static readonly activePointers: Pointer[] = [];

  public static resetAll(): void {
    for (const pointer of Pointer.activePointers) pointer.reset();
  }

  public constructor(
    private readonly pointerType: "mouse" | "touch" | "pen",
    private readonly pointerId = 1,
  ) {
    Pointer.activePointers.push(this);
  }

  public reset(): void {
    this.clientX = 0;
    this.clientY = 0;
    this.buttons = 0;
  }

  public getPosition(): [number, number] {
    return [this.clientX, this.clientY];
  }

  private event(type: string, button: number): PointerEvent {
    return new PointerEvent(type, {
      clientX: this.clientX,
      clientY: this.clientY,
      pointerType: this.pointerType,
      pointerId: this.pointerId,
      button,
      buttons: this.buttons,
      pressure: this.buttons ? 0.5 : 0,
      bubbles: true,
      cancelable: true,
      ...modifierFlags(),
    });
  }

  private fire(type: string, button = -1): void {
    interactiveCanvas().dispatchEvent(this.event(type, button));
  }

  public move(dx: number, dy: number): void {
    if (dx !== 0 || dy !== 0) {
      this.clientX += dx;
      this.clientY += dy;
      this.fire("pointermove");
    }
  }

  public down(dx = 0, dy = 0, button = 0): void {
    this.move(dx, dy);
    this.buttons = button === 1 ? 4 : button === 2 ? 2 : 1;
    this.fire("pointerdown", button);
  }

  public up(dx = 0, dy = 0, button = 0): void {
    this.move(dx, dy);
    this.buttons = 0;
    this.fire("pointerup", button);
  }

  public click(dx = 0, dy = 0): void {
    this.down(dx, dy);
    this.up();
  }

  public doubleClick(dx = 0, dy = 0): void {
    this.move(dx, dy);
    interactiveCanvas().dispatchEvent(
      new MouseEvent("dblclick", {
        clientX: this.clientX,
        clientY: this.clientY,
        bubbles: true,
        ...modifierFlags(),
      }),
    );
  }

  public moveTo(x: number = this.clientX, y: number = this.clientY): void {
    this.clientX = x;
    this.clientY = y;
    this.fire("pointermove");
  }

  public downAt(x = this.clientX, y = this.clientY, button = 0): void {
    this.clientX = x;
    this.clientY = y;
    this.buttons = button === 1 ? 4 : button === 2 ? 2 : 1;
    this.fire("pointerdown", button);
  }

  public upAt(x = this.clientX, y = this.clientY, button = 0): void {
    this.clientX = x;
    this.clientY = y;
    this.buttons = 0;
    this.fire("pointerup", button);
  }

  public clickAt(x: number, y: number): void {
    this.downAt(x, y);
    this.upAt();
  }

  /**
   * A right click: the secondary button down and up, with the browser's
   * `contextmenu` event sent with the press (macOS, Linux) or after the
   * release (Windows).
   */
  public contextMenuAt(x: number, y: number, order: "press" | "release" = "press"): void {
    const menu = () =>
      interactiveCanvas().dispatchEvent(
        new MouseEvent("contextmenu", {
          clientX: x,
          clientY: y,
          button: 2,
          bubbles: true,
          cancelable: true,
          ...modifierFlags(),
        }),
      );
    this.downAt(x, y, 2);
    if (order === "press") menu();
    this.upAt(x, y, 2);
    if (order === "release") menu();
  }

  public doubleClickAt(x: number, y: number): void {
    this.moveTo(x, y);
    this.doubleClick();
  }

  /** Selects the elements, shift-clicking each after the first. */
  public select(elements: ExcalidrawElement | ExcalidrawElement[]): void {
    API.clearSelection();
    Keyboard.withModifierKeys({ shift: true }, () => {
      for (const element of Array.isArray(elements) ? elements : [elements]) {
        this.reset();
        this.click(...getElementPointForSelection(element));
      }
    });
    this.reset();
  }

  public clickOn(element: ExcalidrawElement): void {
    this.reset();
    this.click(...getElementPointForSelection(element));
    this.reset();
  }

  public doubleClickOn(element: ExcalidrawElement): void {
    this.reset();
    this.doubleClick(...getElementPointForSelection(element));
    this.reset();
  }
}

export const mouse = new Pointer("mouse");

const transform = (
  element: ExcalidrawElement | ExcalidrawElement[],
  handle: TransformHandleType,
  mouseMove: [deltaX: number, deltaY: number],
  keyboardModifiers: KeyboardModifiers = {},
): void => {
  const elements = Array.isArray(element) ? element : [element];
  API.setSelectedElements(elements as NonDeletedExcalidrawElement[]);
  const { zoom } = h().state;
  let handleCoords;
  const [only] = elements;
  if (elements.length === 1 && only) {
    handleCoords = getTransformHandles(
      only,
      zoom,
      arrayToMap(h().scene.getElementsIncludingDeleted()),
      "mouse",
      {},
    )[handle];
  } else {
    const [x1, y1, x2, y2] = getCommonBounds(elements);
    handleCoords = getTransformHandlesFromCoords(
      [x1, y1, x2, y2, (x1 + x2) / 2, (y1 + y2) / 2],
      0 as Radians,
      zoom,
      "mouse",
      elements.some(isFrameLikeElement) ? OMIT_SIDES_FOR_FRAME : OMIT_SIDES_FOR_MULTIPLE_ELEMENTS,
    )[handle];
  }
  if (!handleCoords) {
    throw new Error(`There is no "${handle}" handle for this selection`);
  }
  const clientX = handleCoords[0] + handleCoords[2] / 2;
  const clientY = handleCoords[1] + handleCoords[3] / 2;
  Keyboard.withModifierKeys(keyboardModifiers, () => {
    mouse.reset();
    mouse.down(clientX, clientY);
    mouse.move(mouseMove[0], mouseMove[1]);
    mouse.up();
  });
};

/** A live view of an element: its props are read from the scene each time. */
export type Proxied<T extends ExcalidrawElement> = T & { get(): T };

const proxy = <T extends ExcalidrawElement>(element: T): Proxied<T> =>
  new Proxy({} as Proxied<T>, {
    get(_target, prop) {
      const latest = h().scene.getElementsMapIncludingDeleted().get(element.id) as T | undefined;
      if (prop === "get") {
        return () => latest;
      }
      return latest === undefined ? undefined : (latest as Record<PropertyKey, unknown>)[prop];
    },
  });

type DrawingTool = "rectangle" | "diamond" | "ellipse" | "arrow" | "line" | "freedraw";

export const UI = {
  /** Types into the text editor: its value becomes `value`, as one input. */
  updateTextEditor(textarea: HTMLTextAreaElement, value: string): void {
    textarea.value = value;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  },

  /** Escape in the text editor, which submits it. */
  exitTextEditor(textarea: HTMLTextAreaElement): void {
    Keyboard.keyPress(KEYS.ESCAPE, textarea);
  },

  /** Activates a tool as its toolbar button would. */
  clickTool(tool: ToolType): void {
    h().api.setActiveTool({ type: tool });
  },

  /**
   * Draws an element with its tool, and returns a live view of it. A line or
   * arrow with more than two points is drawn click by click.
   */
  createElement<T extends DrawingTool>(
    type: T,
    {
      position = 0,
      x = position,
      y = position,
      size = 10,
      width = size,
      height = width,
      angle = 0,
      points: initialPoints,
    }: {
      position?: number;
      x?: number;
      y?: number;
      size?: number;
      width?: number;
      height?: number;
      angle?: number;
      points?: LocalPoint[];
    } = {},
  ): Proxied<
    T extends "arrow"
      ? ExcalidrawArrowElement
      : T extends "line"
        ? ExcalidrawLinearElement
        : T extends "freedraw"
          ? ExcalidrawFreeDrawElement
          : ExcalidrawGenericElement
  > {
    const points = initialPoints ?? [
      pointFrom<LocalPoint>(0, 0),
      pointFrom<LocalPoint>(width, height),
    ];
    UI.clickTool(type);
    if ((type === "line" || type === "arrow") && points.length > 2) {
      for (const point of points) {
        mouse.reset();
        mouse.click(x + point[0], y + point[1]);
      }
      Keyboard.keyPress(KEYS.ESCAPE);
    } else if (type === "freedraw" && points.length > 2) {
      const [first, ...rest] = points;
      mouse.reset();
      mouse.down(x + (first?.[0] ?? 0), y + (first?.[1] ?? 0));
      for (const point of rest) mouse.moveTo(x + point[0], y + point[1]);
      mouse.upAt();
      Keyboard.keyPress(KEYS.ESCAPE);
    } else {
      mouse.reset();
      mouse.down(x, y);
      mouse.reset();
      mouse.up(x + width, y + height);
    }
    const elements = h().scene.getElementsIncludingDeleted();
    const created = elements[elements.length - 1];
    if (!created) throw new Error(`no ${type} was drawn`);
    if (angle !== 0) {
      h().batch(() => h().scene.mutateElement(created, { angle: angle as Radians }));
    }
    return proxy(created) as never;
  },

  resize(
    element: ExcalidrawElement | ExcalidrawElement[],
    handle: TransformHandleDirection,
    mouseMove: [deltaX: number, deltaY: number],
    keyboardModifiers: KeyboardModifiers = {},
  ): void {
    transform(element, handle, mouseMove, keyboardModifiers);
  },

  rotate(
    element: ExcalidrawElement | ExcalidrawElement[],
    mouseMove: [deltaX: number, deltaY: number],
    keyboardModifiers: KeyboardModifiers = {},
  ): void {
    transform(element, "rotation", mouseMove, keyboardModifiers);
  },

  group(elements: ExcalidrawElement[]): void {
    mouse.select(elements);
    Keyboard.withModifierKeys({ ctrl: true }, () => Keyboard.keyPress(KEYS.G));
  },
};

type CreateElementOptions = {
  type?: "rectangle" | "diamond" | "ellipse" | "arrow" | "line" | "freedraw";
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  angle?: number;
  isDeleted?: boolean;
  groupIds?: string[];
  locked?: boolean;
  frameId?: string | null;
  points?: LocalPoint[];
  strokeWidth?: number;
  backgroundColor?: string;
  startBinding?: ExcalidrawArrowElement["startBinding"];
  endBinding?: ExcalidrawArrowElement["endBinding"];
  boundElements?: ExcalidrawElement["boundElements"];
};

export const API = {
  /** Replaces the elements as Excalidraw's tests do: undoable with the next change. */
  setElements(elements: readonly ExcalidrawElement[]): void {
    h().api.updateScene({ elements });
  },

  /** Replaces the elements as loading a scene does: not undoable. */
  loadElements(elements: readonly ExcalidrawElement[]): void {
    h().api.updateScene({ elements, captureUpdate: "NEVER" });
  },

  setAppState(state: Partial<AppState>): void {
    h().batch(() => h().setState(state));
  },

  updateScene(...args: Parameters<DiagramEditor["api"]["updateScene"]>): void {
    h().api.updateScene(...args);
  },

  setSelectedElements(
    elements: NonDeletedExcalidrawElement[],
    editingGroupId?: string | null,
  ): void {
    h().batch(() =>
      h().setState(
        selectGroupsForSelectedElements(
          {
            editingGroupId: editingGroupId ?? null,
            selectedElementIds: Object.fromEntries(
              elements.map((element) => [element.id, true]),
            ) as Record<string, true>,
          },
          elements,
          h().state,
          h(),
        ),
      ),
    );
  },

  getSelectedElements(includeBoundTextElement = false): ExcalidrawElement[] {
    return getSelectedElements(h().scene.getElementsIncludingDeleted(), h().state, {
      includeBoundTextElement,
    });
  },

  getSelectedElement(): ExcalidrawElement {
    const selected = API.getSelectedElements();
    const [only] = selected;
    if (selected.length !== 1 || !only) {
      throw new Error(`expected 1 selected element; got ${selected.length}`);
    }
    return only;
  },

  getUndoStack() {
    return h().history.undoStack;
  },

  getRedoStack() {
    return h().history.redoStack;
  },

  getSnapshot(): ExcalidrawElement[] {
    return Array.from(h().store.snapshot.elements.values());
  },

  clearSelection(): void {
    h().batch(() => h().selection.clear());
  },

  getElement<T extends ExcalidrawElement>(element: T): T {
    return (h().scene.getElementsMapIncludingDeleted().get(element.id) as T | undefined) ?? element;
  },

  executeAction<T>(action: Action<T>, value: T | null = null): void {
    h().batch(() => h().actionManager.executeAction(action, value));
  },

  /** An element built as Excalidraw's `API.createElement` builds it, with the editor's current style. */
  createElement({
    type = "rectangle",
    id,
    x = 0,
    y = x,
    width = 100,
    height = width,
    isDeleted = false,
    groupIds = [],
    ...rest
  }: CreateElementOptions = {}): NonDeleted<ExcalidrawElement> {
    const appState = current?.state;
    const base = {
      seed: 1,
      x,
      y,
      width,
      height,
      frameId: rest.frameId ?? null,
      angle: (rest.angle ?? 0) as Radians,
      strokeColor: appState?.currentItemStrokeColor ?? "#1e1e1e",
      backgroundColor:
        rest.backgroundColor ?? appState?.currentItemBackgroundColor ?? "transparent",
      fillStyle: appState?.currentItemFillStyle ?? "solid",
      strokeWidth: rest.strokeWidth ?? 2,
      strokeStyle: appState?.currentItemStrokeStyle ?? "solid",
      roundness: null,
      roughness: appState?.currentItemRoughness ?? 1,
      opacity: appState?.currentItemOpacity ?? 100,
      boundElements: rest.boundElements ?? null,
      locked: rest.locked ?? false,
    };
    const points = rest.points ?? [
      pointFrom<LocalPoint>(0, 0),
      pointFrom<LocalPoint>(width, height),
    ];
    let element: ExcalidrawElement;
    switch (type) {
      case "arrow":
        element = {
          ...newArrowElement({ ...base, type, points, elbowed: false }),
          startBinding: rest.startBinding ?? null,
          endBinding: rest.endBinding ?? null,
          startArrowhead: null,
          endArrowhead: "arrow",
        };
        break;
      case "line":
        element = newLinearElement({ ...base, type, points });
        break;
      case "freedraw":
        element = newFreeDrawElement({ ...base, type, points, simulatePressure: true });
        break;
      default:
        element = newElement({ ...base, type });
    }
    return {
      ...element,
      ...(id === undefined ? {} : { id }),
      isDeleted,
      groupIds,
    } as NonDeleted<ExcalidrawElement>;
  },
};
