import {
  getFontString,
  mapFind,
  reduceToCommonValue,
  ROUNDNESS,
  updateActiveTool,
  assertNever,
  isProdEnv,
} from "@excalidraw/common";
import {
  bumpVersion,
  getBoundTextElement,
  getBoundTextMaxHeight,
  getBoundTextMaxWidth,
  getLinearElementSubType,
  hasBoundTextElement,
  isArrowBoundToElement,
  isArrowElement,
  isBindableElement,
  isElbowArrow,
  isLinearElement,
  isUsingAdaptiveRadius,
  LinearElementEditor,
  measureText,
  mutateElement,
  newArrowElement,
  newElement,
  newLinearElement,
  reanchorBindingsToOutline,
  redrawTextBoundingBox,
  ShapeCache,
  updateBindings,
  updateElbowArrowPoints,
  wrapText,
} from "@excalidraw/element";
import { pointFrom } from "@excalidraw/math";

import type { Scene } from "@excalidraw/element";
import type { RenderEnvironment } from "@excalidraw/element/renderEnvironment";
import type {
  ConvertibleGenericTypes,
  ConvertibleLinearTypes,
  ConvertibleTypes,
  ExcalidrawDiamondElement,
  ExcalidrawElement,
  ExcalidrawEllipseElement,
  ExcalidrawLinearElement,
  ExcalidrawRectangleElement,
  ExcalidrawSelectionElement,
  ExcalidrawTextContainer,
  ExcalidrawTextElementWithContainer,
  FixedSegment,
  NonDeleted,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";
import type { LocalPoint } from "@excalidraw/math";

import type { DiagramEditor } from "./editor.ts";

// indicates order of switching
const GENERIC_TYPES = ["rectangle", "diamond", "ellipse"] as const;
// indicates order of switching
const LINEAR_TYPES = ["line", "sharpArrow", "curvedArrow", "elbowArrow"] as const;

const CONVERTIBLE_GENERIC_TYPES: ReadonlySet<ConvertibleGenericTypes> = new Set(GENERIC_TYPES);

const CONVERTIBLE_LINEAR_TYPES: ReadonlySet<ConvertibleLinearTypes> = new Set(LINEAR_TYPES);

const isConvertibleGenericType = (elementType: string): elementType is ConvertibleGenericTypes =>
  CONVERTIBLE_GENERIC_TYPES.has(elementType as ConvertibleGenericTypes);

const isConvertibleLinearType = (elementType: string): elementType is ConvertibleLinearTypes =>
  elementType === "arrow" || CONVERTIBLE_LINEAR_TYPES.has(elementType as ConvertibleLinearTypes);

type CacheKey = string & { _brand: "CacheKey" };

const FONT_SIZE_CONVERSION_CACHE = new Map<
  ExcalidrawElement["id"],
  {
    fontSize: number;
  }
>();

const LINEAR_ELEMENT_CONVERSION_CACHE = new Map<CacheKey, ExcalidrawLinearElement>();

export const adjustBoundTextSize = (
  container: ExcalidrawTextContainer,
  boundText: ExcalidrawTextElementWithContainer,
  scene: Scene,
  renderEnvironment?: RenderEnvironment,
) => {
  const maxWidth = getBoundTextMaxWidth(container, boundText);
  const maxHeight = getBoundTextMaxHeight(container, boundText);

  const wrappedText = wrapText(
    boundText.text,
    getFontString(boundText),
    maxWidth,
    renderEnvironment,
  );

  let metrics = measureText(
    wrappedText,
    getFontString(boundText),
    boundText.lineHeight,
    renderEnvironment,
  );

  let nextFontSize = boundText.fontSize;
  while ((metrics.width > maxWidth || metrics.height > maxHeight) && nextFontSize > 0) {
    nextFontSize -= 1;
    const _updatedTextElement = {
      ...boundText,
      fontSize: nextFontSize,
    };
    metrics = measureText(
      boundText.text,
      getFontString(_updatedTextElement),
      boundText.lineHeight,
      renderEnvironment,
    );
  }

  mutateElement(boundText, scene.getNonDeletedElementsMap(), {
    fontSize: nextFontSize,
    width: metrics.width,
    height: metrics.height,
  });

  redrawTextBoundingBox(boundText, container, scene, renderEnvironment);
};

type ConversionType = "generic" | "linear" | null;

export const convertElementTypes = (
  app: DiagramEditor,
  {
    conversionType,
    nextType,
    direction = "right",
  }: {
    conversionType: ConversionType;
    nextType?: ConvertibleTypes;
    direction?: "left" | "right";
  },
): boolean => {
  if (!conversionType) {
    return false;
  }

  const selectedElements = app.scene.getSelectedElements(app.state);

  const selectedElementIds = selectedElements.reduce(
    (acc, element) => ({ ...acc, [element.id]: true }),
    {},
  );

  const advancement = direction === "right" ? 1 : -1;

  if (conversionType === "generic") {
    const convertibleGenericElements = filterGenericConvetibleElements(selectedElements);

    const sameType = convertibleGenericElements.every(
      (element) => element.type === convertibleGenericElements[0]!.type,
    );

    const index = sameType ? GENERIC_TYPES.indexOf(convertibleGenericElements[0]!.type) : -1;

    nextType =
      nextType ??
      GENERIC_TYPES[(index + GENERIC_TYPES.length + advancement) % GENERIC_TYPES.length];

    if (nextType && isConvertibleGenericType(nextType)) {
      const convertedElements: Record<string, NonDeletedExcalidrawElement> = {};

      for (const element of convertibleGenericElements) {
        const convertedElement = convertElementType(element, nextType, app);
        convertedElements[convertedElement.id] = convertedElement;
      }

      const nextElements: ExcalidrawElement[] = [];

      for (const element of app.scene.getElementsIncludingDeleted()) {
        nextElements.push(convertedElements[element.id] ?? element);
      }

      app.scene.replaceAllElements(nextElements);

      for (const element of Object.values(convertedElements)) {
        if (isBindableElement(element)) {
          reanchorBindingsToOutline(element, app.scene, app.state.zoom);
          updateBindings(element, app.scene, app.state, {
            renderEnvironment: app.renderEnvironment,
          });
        }

        const boundText = getBoundTextElement(element, app.scene.getNonDeletedElementsMap());
        if (boundText) {
          if (FONT_SIZE_CONVERSION_CACHE.get(element.id)) {
            mutateElement(boundText, app.scene.getNonDeletedElementsMap(), {
              fontSize: FONT_SIZE_CONVERSION_CACHE.get(element.id)?.fontSize ?? boundText.fontSize,
            });
          }

          adjustBoundTextSize(
            element as ExcalidrawTextContainer,
            boundText,
            app.scene,
            app.renderEnvironment,
          );
        }
      }

      app.setState((prevState) => {
        return {
          selectedElementIds,
          activeTool: updateActiveTool(prevState, {
            type: "selection",
          }),
        };
      });
    }
  }

  if (conversionType === "linear") {
    const convertibleLinearElements = filterLinearConvertibleElements(selectedElements);

    if (!nextType) {
      const commonSubType = reduceToCommonValue(convertibleLinearElements, getLinearElementSubType);

      const index = commonSubType ? LINEAR_TYPES.indexOf(commonSubType) : -1;
      nextType = LINEAR_TYPES[(index + LINEAR_TYPES.length + advancement) % LINEAR_TYPES.length]!;
    }

    if (isConvertibleLinearType(nextType)) {
      const convertedElements: ExcalidrawElement[] = [];

      const nextElementsMap: Map<ExcalidrawElement["id"], ExcalidrawElement> =
        app.scene.getElementsMapIncludingDeleted();

      for (const element of convertibleLinearElements) {
        const cachedElement = LINEAR_ELEMENT_CONVERSION_CACHE.get(toCacheKey(element.id, nextType));

        // if switching to the original subType or a subType we've already
        // converted to, reuse the cached element to get the original properties
        // (needed for simple->elbow->simple conversions or between line
        // and arrows)
        if (cachedElement && getLinearElementSubType(cachedElement) === nextType) {
          nextElementsMap.set(cachedElement.id, cachedElement);
          convertedElements.push(cachedElement);
        } else {
          const converted = convertElementType(element, nextType, app);
          nextElementsMap.set(converted.id, converted);
          convertedElements.push(converted);
        }
      }

      app.scene.replaceAllElements(nextElementsMap);

      // post normalization
      for (const element of convertedElements) {
        if (isLinearElement(element)) {
          if (isElbowArrow(element)) {
            const nextPoints = convertLineToElbow(element);
            if (nextPoints.length < 2) {
              // skip if not enough points to form valid segments
              continue;
            }
            const fixedSegments: FixedSegment[] = [];
            for (let i = 1; i < nextPoints.length - 2; i++) {
              fixedSegments.push({
                start: nextPoints[i]!,
                end: nextPoints[i + 1]!,
                index: i + 1,
              });
            }
            const updates = updateElbowArrowPoints(element, app.scene.getNonDeletedElementsMap(), {
              points: nextPoints,
              fixedSegments,
            });
            mutateElement(element, app.scene.getNonDeletedElementsMap(), {
              ...updates,
              endArrowhead: "arrow",
            });
          } else {
            // if we're converting to non-elbow linear element, check if
            // we've already cached one of these linear elements so we can
            // reuse the points (case: curved->elbow->line and similar)

            const similarCachedLinearElement = mapFind(
              ["line", "sharpArrow", "curvedArrow"] as const,
              (type) => LINEAR_ELEMENT_CONVERSION_CACHE.get(toCacheKey(element.id, type)),
            );

            if (similarCachedLinearElement) {
              const points = similarCachedLinearElement.points;
              app.scene.mutateElement(element, {
                points,
              });
            }
          }
        }
      }
    }

    const convertedSelectedLinearElements = filterLinearConvertibleElements(
      app.scene.getSelectedElements(app.state),
    );

    app.setState((prevState) => ({
      selectedElementIds,
      selectedLinearElement:
        convertedSelectedLinearElements.length === 1
          ? new LinearElementEditor(
              convertedSelectedLinearElements[0]!,
              app.scene.getNonDeletedElementsMap(),
            )
          : null,
      activeTool: updateActiveTool(prevState, {
        type: "selection",
      }),
    }));
  }

  return true;
};

export const getConversionTypeFromElements = (
  elements: readonly ExcalidrawElement[],
): ConversionType => {
  if (elements.length === 0) {
    return null;
  }

  let canBeLinear = false;
  for (const element of elements) {
    if (isConvertibleGenericType(element.type)) {
      // generic type conversion have preference
      return "generic";
    }
    if (isEligibleLinearElement(element)) {
      canBeLinear = true;
    }
  }

  if (canBeLinear) {
    return "linear";
  }

  return null;
};

const isEligibleLinearElement = (element: ExcalidrawElement) => {
  return (
    isLinearElement(element) &&
    (!isArrowElement(element) || (!isArrowBoundToElement(element) && !hasBoundTextElement(element)))
  );
};

const toCacheKey = (elementId: ExcalidrawElement["id"], convertitleType: ConvertibleTypes) => {
  return `${elementId}:${convertitleType}` as CacheKey;
};

const filterGenericConvetibleElements = <T extends ExcalidrawElement>(elements: readonly T[]) =>
  elements.filter((element) => isConvertibleGenericType(element.type)) as Array<
    T extends NonDeletedExcalidrawElement
      ? NonDeleted<ExcalidrawRectangleElement | ExcalidrawDiamondElement | ExcalidrawEllipseElement>
      : ExcalidrawRectangleElement | ExcalidrawDiamondElement | ExcalidrawEllipseElement
  >;

const filterLinearConvertibleElements = <T extends ExcalidrawElement>(elements: readonly T[]) =>
  elements.filter((element) =>
    isEligibleLinearElement(element),
  ) as (T extends NonDeletedExcalidrawElement
    ? NonDeleted<ExcalidrawLinearElement>
    : ExcalidrawLinearElement)[];

const THRESHOLD = 20;
const isVert = (a: LocalPoint, b: LocalPoint) => a[0] === b[0];
const isHorz = (a: LocalPoint, b: LocalPoint) => a[1] === b[1];
const dist = (a: LocalPoint, b: LocalPoint) =>
  isVert(a, b) ? Math.abs(a[1] - b[1]) : Math.abs(a[0] - b[0]);

const convertLineToElbow = (line: ExcalidrawLinearElement): LocalPoint[] => {
  // 1. build an *orthogonal* route, snapping offsets < SNAP
  const ortho: LocalPoint[] = [line.points[0]!];
  const src = sanitizePoints(line.points);

  for (let i = 1; i < src.length; ++i) {
    const start = ortho[ortho.length - 1]!;
    const end = [...src[i]!] as LocalPoint; // clone

    // snap tiny offsets onto the current axis
    if (Math.abs(end[0] - start[0]) < THRESHOLD) {
      end[0] = start[0];
    } else if (Math.abs(end[1] - start[1]) < THRESHOLD) {
      end[1] = start[1];
    }

    // straight or needs a 90 ° bend?
    if (isVert(start, end) || isHorz(start, end)) {
      ortho.push(end);
    } else {
      ortho.push(pointFrom<LocalPoint>(start[0], end[1]));
      ortho.push(end);
    }
  }

  // 2. drop obviously colinear middle points
  const trimmed: LocalPoint[] = [ortho[0]!];
  for (let i = 1; i < ortho.length - 1; ++i) {
    if (
      !(
        (isVert(ortho[i - 1]!, ortho[i]!) && isVert(ortho[i]!, ortho[i + 1]!)) ||
        (isHorz(ortho[i - 1]!, ortho[i]!) && isHorz(ortho[i]!, ortho[i + 1]!))
      )
    ) {
      trimmed.push(ortho[i]!);
    }
  }
  trimmed.push(ortho[ortho.length - 1]!);

  // 3. collapse micro “jogs” (V-H-V / H-V-H whose short leg < SNAP)
  const clean: LocalPoint[] = [trimmed[0]!];
  for (let i = 1; i < trimmed.length - 1; ++i) {
    const a = clean[clean.length - 1]!;
    const b = trimmed[i]!;
    const c = trimmed[i + 1]!;

    const v1 = isVert(a, b);
    const v2 = isVert(b, c);
    if (v1 !== v2) {
      const d1 = dist(a, b);
      const d2 = dist(b, c);

      if (d1 < THRESHOLD || d2 < THRESHOLD) {
        // pick the shorter leg to remove
        if (d2 < d1) {
          // … absorb leg 2 – pull *c* onto axis of *a-b*
          if (v1) {
            c[0] = a[0];
          } else {
            c[1] = a[1];
          }
        } else {
          // … absorb leg 1 – slide the whole first leg onto *b-c* axis
          if (v2) {
            for (let k = clean.length - 1; k >= 0 && clean[k]![0] === a[0]; --k) {
              clean[k]![0] = b[0];
            }
          } else {
            for (let k = clean.length - 1; k >= 0 && clean[k]![1] === a[1]; --k) {
              clean[k]![1] = b[1];
            }
          }
        }
        // *b* is gone, don’t add it
        continue;
      }
    }
    clean.push(b);
  }
  clean.push(trimmed[trimmed.length - 1]!);
  return clean;
};

const sanitizePoints = (points: readonly LocalPoint[]): LocalPoint[] => {
  if (points.length === 0) {
    return [];
  }

  const sanitized: LocalPoint[] = [points[0]!];

  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = sanitized[sanitized.length - 1]!;
    const [x2, y2] = points[i]!;

    if (x1 !== x2 || y1 !== y2) {
      sanitized.push(points[i]!);
    }
  }

  return sanitized;
};

/**
 * Converts an element to a new type, adding or removing properties as needed
 * so that the element object is always valid.
 *
 * Valid conversions at this point:
 * - switching between generic elements
 *   e.g. rectangle -> diamond
 * - switching between linear elements
 *   e.g. elbow arrow -> line
 */
const convertElementType = (
  element: Exclude<NonDeletedExcalidrawElement, ExcalidrawSelectionElement>,
  targetType: ConvertibleTypes,
  app: DiagramEditor,
): NonDeletedExcalidrawElement => {
  if (!isValidConversion(element.type, targetType)) {
    if (!isProdEnv()) {
      throw Error(`Invalid conversion from ${element.type} to ${targetType}.`);
    }
    return element;
  }

  if (element.type === targetType) {
    return element;
  }

  ShapeCache.delete(element);

  if (isConvertibleGenericType(targetType)) {
    const nextElement = bumpVersion(
      newElement({
        ...element,
        type: targetType,
        roundness: element.roundness
          ? {
              type: isUsingAdaptiveRadius(targetType)
                ? ROUNDNESS.ADAPTIVE_RADIUS
                : ROUNDNESS.PROPORTIONAL_RADIUS,
            }
          : element.roundness,
      }),
    ) as typeof element;

    return nextElement;
  }

  if (isConvertibleLinearType(targetType)) {
    switch (targetType) {
      case "line": {
        return bumpVersion(
          newLinearElement({
            ...element,
            type: "line",
          }),
        );
      }
      case "sharpArrow": {
        return bumpVersion(
          newArrowElement({
            ...element,
            type: "arrow",
            elbowed: false,
            roundness: null,
            startArrowhead: app.state.currentItemStartArrowhead,
            endArrowhead: app.state.currentItemEndArrowhead,
          }),
        );
      }
      case "curvedArrow": {
        return bumpVersion(
          newArrowElement({
            ...element,
            type: "arrow",
            elbowed: false,
            roundness: {
              type: ROUNDNESS.PROPORTIONAL_RADIUS,
            },
            startArrowhead: app.state.currentItemStartArrowhead,
            endArrowhead: app.state.currentItemEndArrowhead,
          }),
        );
      }
      case "elbowArrow": {
        return bumpVersion(
          newArrowElement({
            ...element,
            type: "arrow",
            elbowed: true,
            fixedSegments: null,
            roundness: null,
          }),
        );
      }
    }
  }

  assertNever(targetType, `unhandled conversion type: ${String(targetType)}`);

  return element;
};

const isValidConversion = (
  startType: string,
  targetType: ConvertibleTypes,
): startType is ConvertibleTypes => {
  if (isConvertibleGenericType(startType) && isConvertibleGenericType(targetType)) {
    return true;
  }

  if (isConvertibleLinearType(startType) && isConvertibleLinearType(targetType)) {
    return true;
  }

  // NOTE: add more conversions when needed

  return false;
};
