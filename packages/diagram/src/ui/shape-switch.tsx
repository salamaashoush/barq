import { For, Show, createMemo } from "@barqjs/core";
import { Circle } from "@barqjs/lucide/icons/circle";
import { Diamond } from "@barqjs/lucide/icons/diamond";
import { Minus } from "@barqjs/lucide/icons/minus";
import { Square } from "@barqjs/lucide/icons/square";
import { sceneCoordsToViewportCoords } from "@excalidraw/common";
import {
  getCommonBoundingBox,
  getElementAbsoluteCoords,
  getLinearElementSubType,
} from "@excalidraw/element";
import { pointFrom, pointRotateRads } from "@excalidraw/math";

import {
  convertElementTypes,
  filterGenericConvetibleElements,
  filterLinearConvertibleElements,
  getConversionTypeFromElements,
} from "../editor/convert.ts";
import { useDiagramUI } from "./context.tsx";
import { ArrowElbow, ArrowRound, ArrowSharp } from "./icons.tsx";
import { diagramLayer as d } from "./layer.ts";
import { floating, iconButton, island } from "./styles.ts";

import type { Child } from "@barqjs/core";
import type { ConvertibleTypes } from "@excalidraw/element/types";
import type { TranslationKey } from "../i18n.ts";

const panel = d(island, floating);

const GAP = 12;

interface ShapeOption {
  type: ConvertibleTypes;
  label: TranslationKey;
  icon: () => Child;
}

const GENERIC: readonly ShapeOption[] = [
  { type: "rectangle", label: "toolBar.rectangle", icon: () => <Square aria-hidden="true" /> },
  { type: "diamond", label: "toolBar.diamond", icon: () => <Diamond aria-hidden="true" /> },
  { type: "ellipse", label: "toolBar.ellipse", icon: () => <Circle aria-hidden="true" /> },
];

const LINEAR: readonly ShapeOption[] = [
  { type: "line", label: "toolBar.line", icon: () => <Minus aria-hidden="true" /> },
  { type: "sharpArrow", label: "labels.arrowtype_sharp", icon: () => <ArrowSharp /> },
  { type: "curvedArrow", label: "labels.arrowtype_round", icon: () => <ArrowRound /> },
  { type: "elbowArrow", label: "labels.arrowtype_elbowed", icon: () => <ArrowElbow /> },
];

/**
 * The shape switch's panel under the selection, Excalidraw's
 * `ConvertElementTypePopup`: Alt+Shift+. and Alt+Shift+, step through the
 * types it shows, and a press on one switches to it. Escape or Enter closes
 * it, and so does a selection it cannot switch.
 */
export function ShapeSwitchPanel() {
  const ui = useDiagramUI();
  const t = ui.t;
  const store = ui.store;
  const open = () => store.state("openPopup") === "convertElementType";

  const state = createMemo(() => {
    if (!open()) return null;
    const editor = store.editor;
    const elements = store.selection().elements;
    store.state("scrollX");
    store.state("scrollY");
    store.state("zoom");
    if (!editor) return null;
    const conversionType = getConversionTypeFromElements(elements);
    if (!conversionType) return null;
    const generic = conversionType === "generic" ? filterGenericConvetibleElements(elements) : [];
    const linear = conversionType === "linear" ? filterLinearConvertibleElements(elements) : [];
    const targets = [...generic, ...linear];
    const [first] = targets;
    if (!first) return null;
    let bottomLeft;
    if (targets.length === 1) {
      const [x1, , , y2, cx, cy] = getElementAbsoluteCoords(
        first,
        editor.scene.getNonDeletedElementsMap(),
      );
      bottomLeft = pointRotateRads(pointFrom(x1, y2), pointFrom(cx, cy), first.angle);
    } else {
      const { minX, maxY } = getCommonBoundingBox(targets);
      bottomLeft = pointFrom(minX, maxY);
    }
    const { x, y } = sceneCoordsToViewportCoords(
      { sceneX: bottomLeft[0], sceneY: bottomLeft[1] },
      editor.state,
    );
    const current =
      conversionType === "generic"
        ? generic.every((element) => element.type === first.type)
          ? first.type
          : null
        : linear.every(
              (element) => getLinearElementSubType(element) === getLinearElementSubType(linear[0]!),
            )
          ? getLinearElementSubType(linear[0]!)
          : null;
    return {
      conversionType,
      current,
      options: conversionType === "generic" ? GENERIC : LINEAR,
      left: `${x - editor.state.offsetLeft - GAP}px`,
      top: `${y - editor.state.offsetTop + (GAP + 8) * editor.state.zoom.value}px`,
    };
  });

  return (
    <Show when={state()}>
      <div
        class={panel}
        style={{ left: state()!.left, top: state()!.top }}
        role="group"
        aria-label={t("toolBar.convertElementType")}
        data-testid="shape-switch"
      >
        <For each={state()!.options}>
          {(option: ShapeOption) => (
            <button
              type="button"
              class={iconButton}
              aria-label={t(option.label)}
              aria-pressed={state()?.current === option.type}
              title={t(option.label)}
              onClick={() => {
                const editor = store.editor;
                const current = state();
                if (!editor || !current || current.current === option.type) return;
                editor.batch(() => {
                  if (
                    convertElementTypes(editor, {
                      conversionType: current.conversionType,
                      nextType: option.type,
                    })
                  ) {
                    editor.store.scheduleCapture();
                  }
                });
              }}
              data-testid={`shape-switch-${option.type}`}
            >
              {option.icon()}
            </button>
          )}
        </For>
      </div>
    </Show>
  );
}
