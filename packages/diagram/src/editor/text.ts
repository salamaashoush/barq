import {
  DEFAULT_VERTICAL_ALIGN,
  getFontString,
  getGridPoint,
  getLineHeight,
  KEYS,
  sceneCoordsToViewportCoords,
  TEXT_MAX_WRAP_WIDTH,
  TEXT_MAX_WRAP_WIDTH_ZOOMED_OUT,
  TEXT_TO_CENTER_SNAP_THRESHOLD,
  TEXT_VIEWPORT_PADDING,
  VERTICAL_ALIGN,
  viewportCoordsToSceneCoords,
} from "@excalidraw/common";
import {
  canResizeFromSides,
  DEFAULT_BOUND_TEXT_LABEL_POSITION,
  deepCopyElement,
  fixBindingsAfterDeletion,
  getActiveTextElement,
  getApproxMinLineHeight,
  getApproxMinLineWidth,
  getBoundTextElement,
  getContainerCenter,
  getContainerElement,
  getCursorForResizingElement,
  getElementAbsoluteCoords,
  getElementBounds,
  getLineHeightInPx,
  getResizeOffsetXY,
  getStickyNoteLayout,
  hitElementItself,
  isArrowElement,
  isFrameLikeElement,
  isNonDeletedElement,
  isOpaqueForBinding,
  isStickyNoteElement,
  isTextBindableContainer,
  isTextElement,
  isValidTextContainer,
  makeNextSelectedElementIds,
  newElementWith,
  newTextElement,
  refreshTextDimensions,
  transformElements,
  updateBoundElements,
} from "@excalidraw/element";
import { pointFrom, pointRotateRads } from "@excalidraw/math";

import type { Bounds } from "@excalidraw/common";
import type { ArrowEndpoint } from "@excalidraw/element";
import type {
  ExcalidrawElement,
  ExcalidrawTextContainer,
  ExcalidrawTextElement,
  NonDeleted,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";
import type { GlobalPoint, Radians } from "@excalidraw/math";

import {
  getTextBoxPadding,
  isPointHittingTextAutoResizeHandle,
} from "../text-auto-resize-handle.ts";
import { scrollBoundsIntoView } from "../viewport.ts";
import { actionTextAutoResize } from "./actions/text.ts";
import { SnapCache, snapResizingElements } from "./snapping.ts";
import { textWysiwyg } from "./wysiwyg.ts";

import type { AppState, Offsets } from "../types.ts";
import type { DiagramEditor } from "./editor.ts";
import type { SubmitHandler } from "./wysiwyg.ts";
import type { Coords } from "../types.ts";

/** The scene point in the (rotated) text's own axes. */
function unrotatePoint(point: Readonly<Coords>, text: ExcalidrawTextElement) {
  return pointRotateRads(
    pointFrom<GlobalPoint>(point.x, point.y),
    pointFrom<GlobalPoint>(text.x + text.width / 2, text.y + text.height / 2),
    (text.angle * -1) as Radians,
  );
}

/**
 * A text to edit, handed to the host: it makes a textarea, puts it in a box
 * over the canvas, and gives it to `attach`. The editor styles and places
 * it, and the host removes it once `onTextEditEnd` fires.
 */
export interface TextEditRequest {
  /** The text being edited; new text is in the scene already, empty. */
  readonly element: NonDeleted<ExcalidrawTextElement>;
  /** Where the request came from, in scene coordinates. */
  readonly sceneX: number;
  readonly sceneY: number;
  /** Edits the text in `textarea`, positioned within the box the host put it in. */
  attach(textarea: HTMLTextAreaElement): void;
}

interface SelectionRange {
  start: number;
  end: number;
}

interface TextWysiwygOptions {
  isExistingElement?: boolean;
  /** `null` to select the whole text rather than place the caret */
  initialCaretSceneCoords?: Coords | null;
  /** a range of the text to select; takes precedence over the caret */
  initialSelection?: SelectionRange | null;
}

export interface TextEditPosition {
  sceneX: number;
  sceneY: number;
}

interface TextSubmit {
  viaKeyboard: boolean;
  nextOriginalText: string;
}

export interface TextResizeHandleHit {
  element: NonDeleted<ExcalidrawTextElement>;
  transformHandleType: "e" | "w";
}

interface ContainerHit {
  container: NonDeleted<ExcalidrawTextContainer>;
  area: number;
}

export interface StartTextEditingOptions {
  sceneX: number;
  sceneY: number;
  /** whether to insert at the container's centre when near it */
  insertAtParentCenter?: boolean;
  container?: ExcalidrawTextContainer | null;
  autoEdit?: boolean;
  initialCaretSceneCoords?: Coords;
  initialSelection?: SelectionRange;
  /** creates the text as this arrow endpoint's label, where the binding puts it */
  arrowEndpoint?: ArrowEndpoint | null;
  /**
   * the text to edit: an element for that one, `null` to always create,
   * `undefined` to resolve it (a selected text, a selected or passed
   * arrow's label, else the text at the point)
   */
  textElement?: NonDeleted<ExcalidrawTextElement> | null;
}

export interface SnappedTextPosition {
  viewportX: number;
  viewportY: number;
  elementCenterX: number;
  elementCenterY: number;
}

/**
 * Text, but for the text tool's pointer interaction (`TextTool`): Excalidraw's
 * `AppText`.
 *
 * - the editing session: what text to edit or create, and where
 *   (`startTextEditing`), and the editor's lifecycle (`handleTextWysiwyg`);
 * - the part of the canvas typed text is kept within, and how wide it grows;
 * - the queries that find the text or container to edit at a position;
 * - the handle that turns a fixed-width text back into a growing one, and
 *   resizing the text being edited from its sides.
 */
export class EditorText {
  public textWysiwygSubmitHandler: SubmitHandler | null = null;

  public constructor(private readonly app: DiagramEditor) {}

  /** Ends an open edit with the editor: its window listeners would outlive it. */
  public destroy = (): void => {
    this.textWysiwygSubmitHandler?.();
    this.textWysiwygSubmitHandler = null;
  };

  private getTextCreationGridPoint = (x: number, y: number) => {
    const gridSize = this.app.getEffectiveGridSize();
    if (gridSize === null) {
      return null;
    }
    return {
      x: Math.floor(x / gridSize) * gridSize,
      y: Math.floor(y / gridSize) * gridSize,
    };
  };

  /**
   * The part of the canvas typed or pasted text is kept within, as offsets
   * from its edges in screen px: all of it, less some room at each side. The
   * editor has no panels over the canvas to keep clear of.
   */
  public getTextViewportOffsets = (_textBounds?: Bounds): Required<Offsets> => ({
    top: TEXT_VIEWPORT_PADDING,
    right: TEXT_VIEWPORT_PADDING,
    bottom: TEXT_VIEWPORT_PADDING,
    left: TEXT_VIEWPORT_PADDING,
  });

  /**
   * The widest typed or pasted text grows to, in scene units:
   * `TEXT_MAX_WRAP_WIDTH` (zoomed out, that much on screen, up to
   * `TEXT_MAX_WRAP_WIDTH_ZOOMED_OUT`), or less, so that it never outgrows
   * the part of the canvas it is kept within.
   */
  public getMaxTextWidth = (offsets: Required<Offsets>): number => {
    const zoom = this.app.state.zoom.value;
    const viewWidth = this.app.state.width - offsets.left - offsets.right;
    return Math.min(
      viewWidth > 0 ? viewWidth / zoom : Infinity,
      zoom < 1
        ? Math.min(TEXT_MAX_WRAP_WIDTH / zoom, TEXT_MAX_WRAP_WIDTH_ZOOMED_OUT)
        : TEXT_MAX_WRAP_WIDTH,
    );
  };

  /** Opens the text editor on `element`, through the host's `onTextEditRequest`. */
  public handleTextWysiwyg(
    element: NonDeleted<ExcalidrawTextElement>,
    {
      isExistingElement = false,
      initialCaretSceneCoords = null,
      initialSelection = null,
    }: TextWysiwygOptions,
    request: TextEditPosition = { sceneX: element.x, sceneY: element.y },
  ): void {
    const app = this.app;
    const elementsMap = app.scene.getElementsMapIncludingDeleted();

    const updateElement = (nextOriginalText: string, isDeleted: boolean) => {
      const latestTextElement = app.scene.getElement<ExcalidrawTextElement>(element.id);
      // deleted from under the edit: the submit does not bring it back
      if (!latestTextElement || !isTextElement(latestTextElement) || latestTextElement.isDeleted) {
        return;
      }
      const container = getContainerElement(latestTextElement, elementsMap);
      const stickyContainer = container && isStickyNoteElement(container) ? container : null;
      // a sticky note's fit owns both its label and its geometry
      const stickyLayout = stickyContainer
        ? getStickyNoteLayout(stickyContainer, latestTextElement, {
            originalText: nextOriginalText,
            renderEnvironment: app.renderEnvironment,
          })
        : null;
      // free text stops growing at the view's width and wraps from there
      const textViewportOffsets = this.getTextViewportOffsets(
        getElementBounds(latestTextElement, elementsMap),
      );
      const maxWidth = this.getMaxTextWidth(textViewportOffsets);

      app.scene.replaceAllElements(
        app.scene.getElementsIncludingDeleted().map((other) => {
          if (stickyLayout && other.id === stickyContainer?.id && isStickyNoteElement(other)) {
            return newElementWith(other, stickyLayout.container);
          }
          if (other.id === latestTextElement.id && isTextElement(other)) {
            return newElementWith(other, {
              originalText: nextOriginalText,
              isDeleted,
              ...(stickyLayout?.text ??
                refreshTextDimensions(
                  other,
                  getContainerElement(other, elementsMap),
                  elementsMap,
                  nextOriginalText,
                  maxWidth,
                  app.renderEnvironment,
                )),
            });
          }
          return other;
        }),
      );

      const updatedTextElement = app.scene.getNonDeletedElement(latestTextElement.id);
      if (
        latestTextElement.autoResize &&
        updatedTextElement &&
        isTextElement(updatedTextElement) &&
        !updatedTextElement.autoResize
      ) {
        // it just started wrapping: all of it into view, vertically only if
        // it fits; the caret follows the rest
        const scroll = scrollBoundsIntoView({
          bounds: getElementBounds(updatedTextElement, app.scene.getNonDeletedElementsMap()),
          appState: app.state,
          offsets: textViewportOffsets,
          tooLarge: "leave",
        });
        if (scroll) {
          app.translateViewport(scroll);
        }
      }

      if (stickyContainer) {
        // the note may have grown or shrunk: the arrows bound to it follow
        const latestContainer = app.scene.getNonDeletedElement(stickyContainer.id);
        if (latestContainer) {
          updateBoundElements(latestContainer, app.scene, {
            renderEnvironment: app.renderEnvironment,
          });
        }
      }
    };

    let ended = false;
    const onSubmit = ({ viaKeyboard, nextOriginalText }: TextSubmit) => {
      if (ended) return;
      ended = true;
      this.textWysiwygSubmitHandler = null;

      const isDeleted = !nextOriginalText.trim();
      updateElement(nextOriginalText, isDeleted);

      // a keyboard submit keeps focus on what was edited: a label's container
      // even when the label is emptied away
      const elementIdToSelect =
        viaKeyboard && !app.isToolLocked()
          ? element.containerId || (!isDeleted ? element.id : null)
          : null;
      if (elementIdToSelect) {
        app.setState((prevState) => ({
          selectedElementIds: makeNextSelectedElementIds(
            { ...prevState.selectedElementIds, [elementIdToSelect]: true },
            prevState,
          ),
        }));
      }
      if (isDeleted) {
        fixBindingsAfterDeletion(app.scene.getNonDeletedElements(), [element]);
      }
      if (!isDeleted || isExistingElement) {
        app.store.scheduleCapture();
      }
      app.setState({ newElement: null, editingTextElement: null });
      if (app.isToolLocked()) {
        app.cursor.applyForTool();
      }
      app.focusContainer();
      app.emitTextEditEnd();
    };

    const wysiwygCallbacks = {
      onChange: (nextOriginalText: string) => {
        updateElement(nextOriginalText, false);
        if (isNonDeletedElement(element)) {
          updateBoundElements(element, app.scene, { renderEnvironment: app.renderEnvironment });
        }
      },
      onSubmit,
    };

    // until the host attaches a textarea, a submit writes what the text holds
    this.textWysiwygSubmitHandler = () => {
      const latest = app.scene.getElement<ExcalidrawTextElement>(element.id);
      app.batch(() =>
        onSubmit({
          viaKeyboard: false,
          nextOriginalText: latest && isTextElement(latest) ? latest.originalText : "",
        }),
      );
    };

    let attached = false;
    const attach: (textarea: HTMLTextAreaElement) => void = (textarea) => {
      if (attached || ended || app.isDestroyed) {
        return;
      }
      attached = true;
      app.batch(() => {
        this.textWysiwygSubmitHandler = textWysiwyg({
          ...wysiwygCallbacks,
          getViewportCoords: (x, y) => {
            const { x: viewportX, y: viewportY } = sceneCoordsToViewportCoords(
              { sceneX: x, sceneY: y },
              app.state,
            );
            return [viewportX - app.state.offsetLeft, viewportY - app.state.offsetTop];
          },
          element,
          textarea,
          editor: app,
          initialCaretSceneCoords,
          initialSelection,
          // a selected text is hard to place the caret in on touch
          autoSelect: !app.editorInterface.isTouchScreen,
        });
      });
    };

    // the other elements are deselected while typing
    app.selection.clear();
    // the canvas would keep the hovered cursor until the pointer moves again
    app.cursor.reset();
    // the line editor stays, to come back to, without the hover affordances
    if (app.state.selectedLinearElement) {
      app.setState({
        selectedLinearElement: Object.assign(
          Object.create(Object.getPrototypeOf(app.state.selectedLinearElement) as object) as object,
          app.state.selectedLinearElement,
          {
            hoverPointIndex: -1,
            segmentMidPointHoveredCoords: null,
            hoveredFocusPointBinding: null,
          },
        ) as AppState["selectedLinearElement"],
      });
    }
    // places the element where the editor puts it
    updateElement(element.originalText, false);

    app.emitTextEditRequest({
      element,
      sceneX: request.sceneX,
      sceneY: request.sceneY,
      attach,
    });
  }

  private getSelectedTextElement(
    container?: ExcalidrawTextContainer | null,
  ): NonDeleted<ExcalidrawTextElement> | null {
    const selectedElements = this.app.scene.getSelectedElements(this.app.state);
    const [selectedElement] = selectedElements;
    if (selectedElements.length !== 1 || !selectedElement) {
      return null;
    }
    if (isTextElement(selectedElement)) {
      return selectedElement;
    }
    if (!container) {
      return null;
    }
    return getBoundTextElement(selectedElement, this.app.scene.getNonDeletedElementsMap());
  }

  /**
   * The selected container whose label is at the point: a click there edits
   * the label. `undefined` when the selected element takes no text there.
   */
  public getSelectedTextEditingContainerAtPosition(
    hitElement: NonDeletedExcalidrawElement | null,
    sceneCoords: Coords,
  ): ExcalidrawTextContainer | null | undefined {
    const selectedElements = this.app.scene.getSelectedElements(this.app.state);
    const [selectedElement] = selectedElements;
    if (
      selectedElements.length !== 1 ||
      !selectedElement ||
      !hitElement ||
      hitElement.id !== selectedElement.id
    ) {
      return null;
    }
    if (isTextElement(selectedElement)) {
      return null;
    }
    if (!isValidTextContainer(selectedElement)) {
      return undefined;
    }
    const textElement = this.getSelectedTextElement(selectedElement);
    const hitTextElement = this.getTextElementAtPosition(sceneCoords.x, sceneCoords.y);
    if (!textElement || hitTextElement?.id !== textElement.id) {
      return undefined;
    }
    return selectedElement;
  }

  public getTextElementAtPosition(x: number, y: number): NonDeleted<ExcalidrawTextElement> | null {
    const element = this.app.getElementAtPosition(x, y, { includeBoundTextElement: true });
    return element && isTextElement(element) && !element.isDeleted ? element : null;
  }

  public isHittingTextAutoResizeHandle = (
    selectedElements: NonDeleted<ExcalidrawElement>[],
    point: Readonly<Coords>,
  ): boolean => {
    const activeTextElement = getActiveTextElement(
      selectedElements,
      this.app.state,
      this.app.scene.getNonDeletedElementsMap(),
    );
    return (
      !!activeTextElement &&
      !activeTextElement.isDeleted &&
      !activeTextElement.autoResize &&
      isPointHittingTextAutoResizeHandle(
        point,
        activeTextElement,
        this.app.state.zoom.value,
        this.app.editorInterface.formFactor,
      )
    );
  };

  /** A press on the auto-resize handle: the text grows with its content again. */
  public handleTextAutoResizeHandlePointerDown = (
    selectedElements: NonDeleted<ExcalidrawElement>[],
    point: Readonly<Coords>,
    target?: ExcalidrawElement | null,
  ): boolean => {
    const activeTextElement =
      target && isTextElement(target)
        ? target
        : getActiveTextElement(
            selectedElements,
            this.app.state,
            this.app.scene.getNonDeletedElementsMap(),
          );
    if (!activeTextElement || !this.isHittingTextAutoResizeHandle(selectedElements, point)) {
      return false;
    }
    // the element is passed: the press may have deselected it already
    this.app.actionManager.executeAction(actionTextAutoResize, activeTextElement);
    this.app.cursor.reset();
    return true;
  };

  /**
   * The side handle of the free text being edited at a scene point: the strip
   * from the text's edge out to as far past the box drawn around a wrapped
   * text as the box is from the text. Dragging it sets where the text wraps.
   */
  public getEditedTextResizeHandleAt = (point: Readonly<Coords>): TextResizeHandleHit | null => {
    const element = this.getEditedTextResizableFromSides();
    if (!element) {
      return null;
    }
    const padding = getTextBoxPadding(this.app.state.zoom.value);
    const [x, y] = unrotatePoint(point, element);
    if (y < element.y - padding || y > element.y + element.height + padding) {
      return null;
    }
    const right = element.x + element.width;
    const transformHandleType =
      x >= right && x <= right + padding * 2
        ? "e"
        : x <= element.x && x >= element.x - padding * 2
          ? "w"
          : null;
    return transformHandleType ? { element, transformHandleType } : null;
  };

  /**
   * Gives the canvas, while the pointer is over the textarea, the cursor of
   * what the pointer would leave it onto: a side handle if a side is the
   * nearest edge. The browser shows the canvas' cursor as it is when the
   * pointer gets there, and what the canvas then sets a frame later.
   */
  public primeCursorAroundEditedText = (point: Readonly<Coords>): void => {
    const element = this.getEditedTextResizableFromSides();
    if (!element) {
      return;
    }
    const [x, y] = unrotatePoint(point, element);
    const toLeft = x - element.x;
    const toRight = element.x + element.width - x;
    const toSide = Math.min(toLeft, toRight);
    const toTopOrBottom = Math.min(y - element.y, element.y + element.height - y);
    if (toSide < toTopOrBottom) {
      this.app.cursor.set(
        getCursorForResizingElement({
          element,
          transformHandleType: toLeft < toRight ? "w" : "e",
        }),
      );
    } else {
      this.app.cursor.reset();
    }
  };

  /** The free text being edited, where texts resize from their sides. */
  private getEditedTextResizableFromSides(): NonDeleted<ExcalidrawTextElement> | null {
    const { editingTextElement } = this.app.state;
    const element =
      editingTextElement && this.app.scene.getNonDeletedElement(editingTextElement.id);
    return element &&
      isTextElement(element) &&
      !element.containerId &&
      canResizeFromSides(this.app.editorInterface)
      ? element
      : null;
  }

  /**
   * Resizes the text being edited for as long as the pointer, pressed on one
   * of its side handles, is dragged, without leaving the editor.
   *
   * @param onClick called on release if the pointer was not dragged
   * @returns `false` if the press is not on a side handle of the edited text
   */
  public resizeEditedTextOnPointerDown = (event: PointerEvent, onClick: () => void): boolean => {
    const app = this.app;
    const origin = viewportCoordsToSceneCoords(event, app.state);
    const handle = this.getEditedTextResizeHandleAt(origin);
    if (!handle) {
      return false;
    }
    const { element, transformHandleType } = handle;
    const { ownerWindow } = app;
    const originalElement = deepCopyElement(element);
    const originalElements = new Map([[element.id, originalElement]]);
    function getGridSize(pointerEvent: PointerEvent) {
      return pointerEvent[KEYS.CTRL_OR_CMD] ? null : app.getEffectiveGridSize();
    }
    const [originInGridX, originInGridY] = getGridPoint(origin.x, origin.y, getGridSize(event));
    const [offsetX, offsetY] = getResizeOffsetXY(
      transformHandleType,
      [element],
      app.scene.getNonDeletedElementsMap(),
      origin.x,
      origin.y,
    );
    let dragged = false;

    // the canvas stays the pointer's target, with its resize cursor
    const canvas = event.target as HTMLCanvasElement;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // a pointer that is gone already
    }

    function stop() {
      ownerWindow.removeEventListener("pointermove", onPointerMove, true);
      ownerWindow.removeEventListener("pointerup", onPointerUp, true);
      ownerWindow.removeEventListener("pointercancel", onPointerUp, true);
      SnapCache.setReferenceSnapPoints(null);
      if (app.state.snapLines.length) {
        app.setState({ snapLines: [] });
      }
    }

    function onPointerMove(moveEvent: PointerEvent) {
      return app.batch(() => {
        // the editor may have been closed from the keyboard
        if (app.state.editingTextElement?.id !== element.id) {
          stop();
          return;
        }
        // the canvas' own handling is for hovering and its selection
        moveEvent.stopPropagation();
        if (
          !dragged &&
          moveEvent.clientX === event.clientX &&
          moveEvent.clientY === event.clientY
        ) {
          return;
        }
        dragged = true;
        const pointer = viewportCoordsToSceneCoords(moveEvent, app.state);
        const gridSize = getGridSize(moveEvent);
        const [gridX, gridY] = getGridPoint(pointer.x, pointer.y, gridSize);
        let [x, y] = getGridPoint(pointer.x - offsetX, pointer.y - offsetY, gridSize);

        app.maybeCacheReferenceSnapPoints(moveEvent, [element]);
        const { snapOffset, snapLines } = snapResizingElements(
          [element],
          [originalElement],
          app,
          moveEvent,
          { x: gridX - originInGridX, y: gridY - originInGridY },
          transformHandleType,
        );
        x += snapOffset.x;
        y += snapOffset.y;
        if (snapLines.length || app.state.snapLines.length) {
          app.setState({ snapLines });
        }
        transformElements(
          originalElements,
          transformHandleType,
          [element],
          app.scene,
          false,
          moveEvent.altKey,
          false,
          x,
          y,
          origin.x,
          origin.y,
          app.renderEnvironment,
        );
      });
    }

    function onPointerUp() {
      return app.batch(() => {
        stop();
        if (!dragged && app.state.editingTextElement?.id === element.id) {
          onClick();
        }
      });
    }

    ownerWindow.addEventListener("pointermove", onPointerMove, true);
    ownerWindow.addEventListener("pointerup", onPointerUp, true);
    ownerWindow.addEventListener("pointercancel", onPointerUp, true);
    return true;
  };

  /**
   * The text container at a position: an arrow hit on its path, any other
   * container anywhere in its bounds (frames skipped, so a container in one
   * can be hit, and a frame's children only inside it). Only what hides the
   * rest ends the search (a filled element, an image, an arrow); of the
   * containers found, the innermost one centred on the position wins, as its
   * label would go there, else the topmost.
   */
  public getTextBindableContainerAtPosition(
    x: number,
    y: number,
  ): NonDeleted<ExcalidrawTextContainer> | null {
    const elements = this.app.scene.getNonDeletedElements();
    const elementsMap = this.app.scene.getNonDeletedElementsMap();
    const hits: ContainerHit[] = [];
    for (let index = elements.length - 1; index >= 0; --index) {
      const element = elements[index];
      if (!element || isFrameLikeElement(element) || this.app.isClippedByFrameAt(x, y, element)) {
        continue;
      }
      const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);
      const isArrow = isArrowElement(element);
      if (
        isArrow
          ? // an arrow has no inside to hit
            !hitElementItself({
              point: pointFrom(x, y),
              element,
              elementsMap,
              threshold: this.app.getElementHitThreshold(element),
              frameNameBound: null,
            })
          : !(x1 < x && x < x2 && y1 < y && y < y2)
      ) {
        continue;
      }
      if (isTextBindableContainer(element, false)) {
        hits.push({ container: element, area: isArrow ? 0 : (x2 - x1) * (y2 - y1) });
      }
      if (isArrow || isOpaqueForBinding(element)) {
        break;
      }
    }
    const innermostCentered = hits
      .filter(({ container }) =>
        this.getTextWysiwygSnappedToCenterPosition(x, y, this.app.state, container),
      )
      .reduce<(typeof hits)[number] | null>(
        (innermost, hit) => (!innermost || hit.area < innermost.area ? hit : innermost),
        null,
      );
    return (innermostCentered ?? hits[0])?.container ?? null;
  }

  /**
   * Whether a text's content is still being authored: the pointer up after
   * creating one would otherwise capture the empty text as an undo step of
   * its own; the submit captures the finished text instead.
   */
  public isEditingTextContent(): boolean {
    return !!this.app.state.editingTextElement || isTextElement(this.app.state.newElement);
  }

  public startTextEditing = ({
    sceneX,
    sceneY,
    insertAtParentCenter = true,
    container,
    autoEdit = true,
    initialCaretSceneCoords,
    initialSelection,
    arrowEndpoint,
    textElement,
  }: StartTextEditingOptions): void => {
    const app = this.app;
    if (!app.hasTextEditor()) {
      return;
    }
    const request = { sceneX, sceneY };
    let shouldBindToContainer = false;

    // resolved here so the stroke width the binding gap derives from is the
    // one the text is created with
    const arrowEndpointBinding =
      arrowEndpoint &&
      app.arrowText.getTextBinding(arrowEndpoint, app.getCurrentItemStrokeWidth("text"));
    if (arrowEndpointBinding) {
      // the text is the arrow's sibling, bound to, not a label in it
      container = null;
      insertAtParentCenter = false;
      sceneX = arrowEndpointBinding.anchor[0];
      sceneY = arrowEndpointBinding.anchor[1];
    }

    let parentCenterPosition =
      insertAtParentCenter &&
      this.getTextWysiwygSnappedToCenterPosition(sceneX, sceneY, app.state, container);
    if (container && parentCenterPosition) {
      if (!getBoundTextElement(container, app.scene.getNonDeletedElementsMap())) {
        shouldBindToContainer = true;
      }
    }
    const existingTextElement = arrowEndpointBinding
      ? null
      : textElement !== undefined
        ? textElement
        : this.getSelectedTextElement(container) ||
          (container && isArrowElement(container)
            ? getBoundTextElement(container, app.scene.getNonDeletedElementsMap())
            : null) ||
          this.getTextElementAtPosition(sceneX, sceneY);

    const fontFamily = existingTextElement?.fontFamily || app.state.currentItemFontFamily;
    const lineHeight = existingTextElement?.lineHeight || getLineHeight(fontFamily);
    const fontSize = app.state.currentItemFontSize;

    if (
      !existingTextElement &&
      shouldBindToContainer &&
      container &&
      !isArrowElement(container) &&
      !isStickyNoteElement(container)
    ) {
      // the container grows to fit at least one line
      const minWidth = getApproxMinLineWidth(
        getFontString({ fontSize, fontFamily }),
        lineHeight,
        app.renderEnvironment,
      );
      const minHeight = getApproxMinLineHeight(fontSize, lineHeight);
      const newHeight = Math.max(container.height, minHeight);
      const newWidth = Math.max(container.width, minWidth);
      app.scene.mutateElement(container, { height: newHeight, width: newWidth });
      sceneX = container.x + newWidth / 2;
      sceneY = container.y + newHeight / 2;
      if (parentCenterPosition) {
        parentCenterPosition = this.getTextWysiwygSnappedToCenterPosition(
          sceneX,
          sceneY,
          app.state,
          container,
        );
      }
    }

    const textCreationGridPoint = this.getTextCreationGridPoint(sceneX, sceneY);
    const newTextElementPosition = arrowEndpointBinding
      ? // the arrow dictates the anchor: neither the grid nor the caret moves it
        { x: sceneX, y: sceneY }
      : parentCenterPosition
        ? { x: parentCenterPosition.elementCenterX, y: parentCenterPosition.elementCenterY }
        : !existingTextElement
          ? {
              x: textCreationGridPoint?.x ?? sceneX,
              y:
                textCreationGridPoint === null
                  ? // free text starts from a point: the first line centres on it
                    sceneY - getLineHeightInPx(fontSize, lineHeight) / 2
                  : textCreationGridPoint.y,
            }
          : { x: sceneX, y: sceneY };

    const topLayerFrame = app.getTopLayerFrameAtSceneCoords(newTextElementPosition);
    // the container comes first: the frame only when the container is in it
    const frameId =
      topLayerFrame &&
      (!shouldBindToContainer || !container || container.frameId === topLayerFrame.id)
        ? topLayerFrame.id
        : null;

    const sticky = shouldBindToContainer && isStickyNoteElement(container);
    const element =
      existingTextElement ||
      newTextElement({
        x: newTextElementPosition.x,
        y: newTextElementPosition.y,
        // a note's stroke colour is its text's
        strokeColor: sticky && container ? container.strokeColor : app.state.currentItemStrokeColor,
        backgroundColor: app.state.currentItemBackgroundColor,
        fillStyle: app.state.currentItemFillStyle,
        strokeWidth: app.getCurrentItemStrokeWidth("text"),
        strokeStyle: app.state.currentItemStrokeStyle,
        roughness: app.state.currentItemRoughness,
        opacity: app.state.currentItemOpacity,
        text: "",
        fontSize,
        baseFontSize: sticky ? fontSize : null,
        fontFamily,
        textAlign:
          arrowEndpointBinding?.textAlign ??
          (parentCenterPosition ? "center" : app.state.currentItemTextAlign),
        verticalAlign:
          arrowEndpointBinding?.verticalAlign ??
          (parentCenterPosition ? VERTICAL_ALIGN.MIDDLE : DEFAULT_VERTICAL_ALIGN),
        containerId: shouldBindToContainer ? container?.id : undefined,
        labelPosition:
          shouldBindToContainer && container && isArrowElement(container)
            ? DEFAULT_BOUND_TEXT_LABEL_POSITION
            : null,
        groupIds: shouldBindToContainer ? (container?.groupIds ?? []) : [],
        lineHeight,
        angle:
          shouldBindToContainer && container && !isArrowElement(container)
            ? container.angle
            : (0 as Radians),
        frameId,
        renderEnvironment: app.renderEnvironment,
      });

    if (!existingTextElement && shouldBindToContainer && container) {
      app.scene.mutateElement(container, {
        boundElements: (container.boundElements ?? []).concat({ type: "text", id: element.id }),
      });
    }
    app.setState({ editingTextElement: element });

    if (!existingTextElement) {
      if (container && shouldBindToContainer) {
        // a label goes right above its container
        const containerIndex = app.scene.getElementIndex(container.id);
        app.scene.insertElementsAtIndex([element], containerIndex + 1);
      } else {
        app.insertNewElement(element);
      }
    }

    if (arrowEndpoint && arrowEndpointBinding) {
      app.arrowText.bindText(arrowEndpoint, element, arrowEndpointBinding.fixedPoint);
    }

    // a nearby container skips drag-sizing only when the text binds to it
    if (autoEdit || existingTextElement || shouldBindToContainer) {
      this.handleTextWysiwyg(
        element,
        {
          isExistingElement: !!existingTextElement,
          initialCaretSceneCoords: existingTextElement ? initialCaretSceneCoords : null,
          initialSelection: existingTextElement ? initialSelection : null,
        },
        request,
      );
    } else {
      app.setState({ newElement: element, multiElement: null });
    }
  };

  /** The container's centre, when the point is near enough to it to centre text there. */
  public getTextWysiwygSnappedToCenterPosition(
    x: number,
    y: number,
    appState: AppState,
    container?: ExcalidrawTextContainer | null,
  ): SnappedTextPosition | undefined {
    if (!container) {
      return undefined;
    }
    let elementCenterX = container.x + container.width / 2;
    let elementCenterY = container.y + container.height / 2;
    const elementCenter = getContainerCenter(container, this.app.scene.getNonDeletedElementsMap());
    if (elementCenter) {
      elementCenterX = elementCenter.x;
      elementCenterY = elementCenter.y;
    }
    const distanceToCenter = Math.hypot(x - elementCenterX, y - elementCenterY);
    if (distanceToCenter >= TEXT_TO_CENTER_SNAP_THRESHOLD) {
      return undefined;
    }
    const { x: viewportX, y: viewportY } = sceneCoordsToViewportCoords(
      { sceneX: elementCenterX, sceneY: elementCenterY },
      appState,
    );
    return { viewportX, viewportY, elementCenterX, elementCenterY };
  }
}
