import { For, Show, createMemo } from "@barqjs/core";
import { Radio, RadioGroup } from "@barqjs/aria/radio";
import { AlignCenterHorizontal } from "@barqjs/lucide/icons/align-center-horizontal";
import { AlignCenterVertical } from "@barqjs/lucide/icons/align-center-vertical";
import { AlignEndHorizontal } from "@barqjs/lucide/icons/align-end-horizontal";
import { AlignEndVertical } from "@barqjs/lucide/icons/align-end-vertical";
import { AlignHorizontalDistributeCenter } from "@barqjs/lucide/icons/align-horizontal-distribute-center";
import { AlignStartHorizontal } from "@barqjs/lucide/icons/align-start-horizontal";
import { AlignStartVertical } from "@barqjs/lucide/icons/align-start-vertical";
import { AlignVerticalDistributeCenter } from "@barqjs/lucide/icons/align-vertical-distribute-center";
import { AlignVerticalJustifyCenter } from "@barqjs/lucide/icons/align-vertical-justify-center";
import { AlignVerticalJustifyEnd } from "@barqjs/lucide/icons/align-vertical-justify-end";
import { AlignVerticalJustifyStart } from "@barqjs/lucide/icons/align-vertical-justify-start";
import { ArrowDown } from "@barqjs/lucide/icons/arrow-down";
import { ArrowUp } from "@barqjs/lucide/icons/arrow-up";
import { BringToFront } from "@barqjs/lucide/icons/bring-to-front";
import { Copy } from "@barqjs/lucide/icons/copy";
import { Crop } from "@barqjs/lucide/icons/crop";
import { Group } from "@barqjs/lucide/icons/group";
import { Link } from "@barqjs/lucide/icons/link";
import { PenLine } from "@barqjs/lucide/icons/pen-line";
import { SendToBack } from "@barqjs/lucide/icons/send-to-back";
import { TextAlignCenter } from "@barqjs/lucide/icons/text-align-center";
import { TextAlignEnd } from "@barqjs/lucide/icons/text-align-end";
import { TextAlignStart } from "@barqjs/lucide/icons/text-align-start";
import { Trash2 } from "@barqjs/lucide/icons/trash-2";
import { Ungroup } from "@barqjs/lucide/icons/ungroup";
import { Slider } from "@barqjs/ui/slider";
import { Toggle } from "@barqjs/ui/toggle";
import {
  ARROW_TYPE,
  BUCKET_FILL_BACKGROUND_PICKS,
  COLOR_PALETTE,
  DEFAULT_ELEMENT_BACKGROUND_COLOR_PALETTE,
  DEFAULT_FONT_SIZE,
  FONT_SIZES,
  ROUNDNESS,
  STROKE_WIDTH_KEYS,
  VERTICAL_ALIGN,
  getStrokeWidthByKey,
  isTransparent,
} from "@excalidraw/common";
import {
  canChangeRoundness,
  canHaveArrowheads,
  getArrowheadForPicker,
  getBaseFontSize,
  getBoundTextElement,
  getColorTargetElement,
  getSelectedElements,
  hasBackground,
  hasBoundTextElement,
  hasFillStyle,
  hasFreedrawMode,
  hasRoughness,
  hasStrokeColor,
  hasStrokeStyle,
  hasStrokeWidth,
  isArrowElement,
  isElbowArrow,
  isImageElement,
  isLineElement,
  isLinearElement,
  isTextElement,
  shouldAllowVerticalAlign,
  showSelectedShapeActions,
  suppportsHorizontalAlign,
  toolIsArrow,
} from "@excalidraw/element";

import {
  actionAlignBottom,
  actionAlignHorizontallyCentered,
  actionAlignLeft,
  actionAlignRight,
  actionAlignTop,
  actionAlignVerticallyCentered,
  actionDistributeHorizontally,
  actionDistributeVertically,
} from "../editor/actions/align.ts";
import { resolveColorTarget } from "../editor/actions/color-targets.ts";
import { actionToggleCropEditor } from "../editor/actions/clipboard.ts";
import { actionDeleteSelected } from "../editor/actions/delete.ts";
import { actionDuplicateSelection } from "../editor/actions/duplicate.ts";
import { actionGroup, actionUngroup } from "../editor/actions/group.ts";
import { actionTogglePolygon, actionToggleLinearEditor } from "../editor/actions/linear-editor.ts";
import { actionLink } from "../editor/actions/link.ts";
import {
  actionChangeArrowType,
  actionChangeArrowhead,
  actionChangeBackgroundColor,
  actionChangeFillStyle,
  actionChangeFreedrawMode,
  actionChangeOpacity,
  actionChangeRoundness,
  actionChangeSloppiness,
  actionChangeStrokeColor,
  actionChangeStrokeStyle,
  actionChangeStrokeWidth,
  getFormValue,
  getTargetElements,
  type ArrowType,
} from "../editor/actions/properties.ts";
import {
  actionChangeFontSize,
  actionChangeTextAlign,
  actionChangeVerticalAlign,
} from "../editor/actions/text.ts";
import {
  actionBringForward,
  actionBringToFront,
  actionSendBackward,
  actionSendToBack,
} from "../editor/actions/zindex.ts";
import { ColorPicker } from "./color-picker.tsx";
import { isShortcutName } from "./shortcuts.ts";
import { useDiagramUI } from "./context.tsx";
import { FontPicker } from "./font-picker.tsx";
import * as Icons from "./icons.tsx";
import { ArrowheadPicker } from "./arrowhead-picker.tsx";
import { diagramLayer as d } from "./layer.ts";
import {
  buttonRow,
  fieldset,
  iconButton,
  legend,
  panel,
  radioChoice,
  radioGroupRow,
} from "./styles.ts";

import type { Child } from "@barqjs/core";
import type { StrokeWidthKey } from "@excalidraw/common";
import type {
  Arrowhead,
  ExcalidrawElement,
  ExcalidrawFreeDrawElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";
import type { Action } from "../editor/types.ts";
import type { DiagramEditor } from "../editor/editor.ts";

const groupLabel = d({
  display: "block",
  width: "100%",
  marginBottom: "4px",
  fontSize: "var(--text-xs, 0.75rem)",
  color: "var(--muted-foreground, GrayText)",
});

const sliderRow = d({
  display: "flex",
  alignItems: "center",
  gap: "8px",
  "& > :first-child": { flex: "1" },
});

interface Choice {
  value: string;
  label: string;
  icon: () => Child;
  testId?: string;
}

/**
 * One property as icon radios: a named radio group, the arrows moving the
 * choice. Nothing is checked when the selection mixes values.
 */
function ChoiceGroup(props: {
  label: string;
  /** No visible name, as Excalidraw shows none for the vertical alignment. */
  hideLabel?: boolean;
  value: string | null;
  choices: readonly Choice[];
  onChange: (value: string) => void;
  onPressChoice?: (value: string, event: { altKey: boolean }) => boolean;
  testId?: string;
}) {
  return (
    <RadioGroup
      aria-label={props.label}
      label={props.hideLabel === true ? undefined : <span class={groupLabel}>{props.label}</span>}
      value={props.value}
      orientation="horizontal"
      onChange={(value: string) => props.onChange(value)}
      class={`${fieldset} ${radioGroupRow}`}
      data-testid={props.testId}
    >
      <For each={props.choices}>
        {(choice: Choice) => (
          <Radio
            value={choice.value}
            aria-label={choice.label}
            elementType="span"
            class={radioChoice}
            data-testid={choice.testId}
          >
            <span title={choice.label}>{choice.icon()}</span>
          </Radio>
        )}
      </For>
    </RadioGroup>
  );
}

function ActionButton(props: {
  action: Action;
  icon: () => Child;
  label?: string;
  testId?: string;
}) {
  const ui = useDiagramUI();
  const label = () => props.label ?? ui.label(props.action);
  const shortcut = () => (isShortcutName(props.action.name) ? ui.shortcut(props.action.name) : "");
  return (
    <button
      type="button"
      class={iconButton}
      aria-label={label()}
      title={shortcut() ? `${label()} — ${shortcut()}` : label()}
      disabled={!ui.isEnabled(props.action)}
      onClick={() => ui.run(props.action)}
      data-testid={props.testId ?? props.action.name}
    >
      {props.icon}
    </button>
  );
}

const nonDeleted = (editor: DiagramEditor): readonly NonDeletedExcalidrawElement[] =>
  editor.scene.getNonDeletedElements();

/**
 * Which properties the panel shows, for the active tool and the selection.
 * Excalidraw's `getShapeActionPredicates`.
 */
const getShapeActionPredicates = (editor: DiagramEditor) => {
  const appState = editor.state;
  const elementsMap = editor.scene.getNonDeletedElementsMap();
  const targetElements = getTargetElements(nonDeleted(editor), appState);
  const tool = appState.activeTool.type;
  const forToolOrSelection = (predicate: (type: ExcalidrawElement["type"]) => boolean) =>
    predicate(tool as ExcalidrawElement["type"]) ||
    targetElements.some((element) => predicate(element.type));
  const single = targetElements.length === 1;
  const [first, second] = targetElements;
  const boundContainer =
    targetElements.length === 2 &&
    ((first !== undefined && hasBoundTextElement(first)) ||
      (second !== undefined && hasBoundTextElement(second)));
  const editingOrDrawing = Boolean(appState.editingTextElement || appState.newElement);
  const hasSelection = targetElements.length > 0;
  let commonType: string | null = first?.type ?? null;
  for (const element of targetElements) {
    if (element.type !== commonType) {
      commonType = null;
      break;
    }
  }
  const selected = editor.scene.getSelectedElements(appState);
  return {
    hasSelection,
    extraActions: hasSelection && !editingOrDrawing,
    strokeColor:
      (hasStrokeColor(tool) &&
        commonType !== "image" &&
        commonType !== "frame" &&
        commonType !== "magicframe") ||
      targetElements.some((element) => hasStrokeColor(element.type)),
    backgroundColor:
      hasBackground(tool) ||
      targetElements.some((element) =>
        hasBackground(getColorTargetElement(element, "backgroundColor", elementsMap).type),
      ),
    fill:
      tool === "bucketfill" ||
      (hasFillStyle(tool) && !isTransparent(appState.currentItemBackgroundColor)) ||
      targetElements.some(
        (element) => hasFillStyle(element.type) && !isTransparent(element.backgroundColor),
      ),
    strokeWidth: forToolOrSelection(hasStrokeWidth),
    freedrawMode: forToolOrSelection(hasFreedrawMode),
    strokeStyle: forToolOrSelection(hasStrokeStyle),
    sloppiness: forToolOrSelection(hasRoughness),
    roundness: forToolOrSelection(canChangeRoundness),
    arrowType: forToolOrSelection(toolIsArrow),
    arrowheads: forToolOrSelection(canHaveArrowheads),
    text: tool === "text" || targetElements.some(isTextElement),
    textAlign: tool === "text" || suppportsHorizontalAlign(targetElements, elementsMap),
    verticalAlign: shouldAllowVerticalAlign(targetElements, elementsMap),
    opacity: tool !== "autoshape" || hasSelection,
    layers:
      (tool !== "freedraw" &&
        tool !== "autoshape" &&
        !targetElements.some((element) => element.type === "freedraw")) ||
      selected.some((element) => element.type === "freedraw"),
    align: !boundContainer && editor.actionManager.isActionEnabled(actionAlignLeft),
    distribute: targetElements.length > 2,
    link: single || boundContainer,
    cropEditor:
      !appState.croppingElementId && single && first !== undefined && isImageElement(first),
    lineEditor:
      !appState.selectedLinearElement?.isEditing &&
      single &&
      first !== undefined &&
      isLinearElement(first) &&
      !isElbowArrow(first),
  };
};

type Predicates = ReturnType<typeof getShapeActionPredicates>;

/**
 * Excalidraw's properties panel for the selection, or for the tool about to
 * draw: each property the selected elements or the tool take, set on all of
 * them at once, showing their common value or none when they differ.
 */
export function PropertiesPanel() {
  const ui = useDiagramUI();
  const t = ui.t;
  const store = ui.store;

  // read so that the panel follows them; the editor is read for the values
  const tracked = (): DiagramEditor | null => {
    store.selection();
    store.state("activeTool");
    store.state("editingTextElement");
    store.state("newElement");
    store.state("viewModeEnabled");
    store.state("openDialog");
    store.state("currentItemBackgroundColor");
    store.state("selectedLinearElement");
    store.state("croppingElementId");
    return store.editor;
  };

  const visible = createMemo((): boolean => {
    const editor = tracked();
    return editor !== null && showSelectedShapeActions(editor.state, nonDeleted(editor));
  });
  const predicates = createMemo((): Predicates | null => {
    const editor = tracked();
    return editor === null || !visible() ? null : getShapeActionPredicates(editor);
  });

  /** A property's value for the panel, Excalidraw's `getFormValue`, following the state. */
  const formValue = <T extends string | number | boolean | null>(
    current: () => T,
    getValue: (element: ExcalidrawElement) => T,
    predicate: true | ((element: ExcalidrawElement) => boolean) = true,
  ): (() => T | null) =>
    createMemo(() => {
      const editor = tracked();
      const fallback = current();
      if (editor === null) return fallback;
      return getFormValue<T | null>(
        editor.scene.getElementsIncludingDeleted(),
        editor,
        getValue,
        predicate,
        (hasSelection) => (hasSelection ? null : fallback),
      );
    });

  const strokeTarget = createMemo(() => {
    const editor = tracked();
    store.state("currentItemStrokeColor");
    store.state("currentItemStickynoteStrokeColor");
    return editor
      ? resolveColorTarget(editor.state, editor.scene.getElementsIncludingDeleted(), "strokeColor")
      : null;
  });
  const backgroundTarget = createMemo(() => {
    const editor = tracked();
    store.state("currentItemStickynoteBackgroundColor");
    return editor
      ? resolveColorTarget(
          editor.state,
          editor.scene.getElementsIncludingDeleted(),
          "backgroundColor",
        )
      : null;
  });
  const strokeColor = createMemo((): string | null => {
    const target = strokeTarget();
    const editor = tracked();
    if (!target || !editor) return null;
    return getFormValue<string | null>(
      editor.scene.getElementsIncludingDeleted(),
      editor,
      (element) => element.strokeColor,
      true,
      (hasSelection) => (hasSelection ? null : target.currentValue),
    );
  });
  const backgroundColor = createMemo((): string | null => {
    const target = backgroundTarget();
    const editor = tracked();
    if (!target || !editor) return null;
    const elementsMap = editor.scene.getNonDeletedElementsMap();
    return getFormValue<string | null>(
      editor.scene.getElementsIncludingDeleted(),
      editor,
      (element) => getColorTargetElement(element, "backgroundColor", elementsMap).backgroundColor,
      true,
      (hasSelection) => (hasSelection ? null : target.currentValue),
    );
  });

  const fillStyle = formValue(
    () => store.state("currentItemFillStyle"),
    (element) => element.fillStyle,
    (element) => hasFillStyle(element.type),
  );
  const allZigZag = createMemo((): boolean => {
    const editor = tracked();
    if (!editor) return false;
    const fills = getSelectedElements(nonDeleted(editor), editor.state).filter((element) =>
      hasFillStyle(element.type),
    );
    return fills.length > 0 && fills.every((element) => element.fillStyle === "zigzag");
  });
  const strokeWidth = formValue<StrokeWidthKey>(
    () => store.state("currentItemStrokeWidthKey"),
    (element) =>
      STROKE_WIDTH_KEYS.find(
        (key) => getStrokeWidthByKey(element.type, key) === element.strokeWidth,
      ) ?? (null as unknown as StrokeWidthKey),
    (element) => Object.hasOwn(element, "strokeWidth"),
  );
  const strokeStyle = formValue(
    () => store.state("currentItemStrokeStyle"),
    (element) => element.strokeStyle,
  );
  const roughness = formValue(
    () => store.state("currentItemRoughness"),
    (element) => element.roughness,
  );
  const pressure = formValue(
    () => store.state("currentItemStrokeVariability"),
    (element) =>
      (element as ExcalidrawFreeDrawElement).strokeOptions?.variability ??
      (null as unknown as "constant"),
    (element) => element.type === "freedraw",
  );
  const edges = createMemo((): string | null => {
    const editor = tracked();
    const fallback = store.state("currentItemRoundness");
    if (!editor) return fallback;
    const legacy = getTargetElements(nonDeleted(editor), editor.state).some(
      (element) => element.roundness?.type === ROUNDNESS.LEGACY,
    );
    return getFormValue<string | null>(
      editor.scene.getElementsIncludingDeleted(),
      editor,
      (element) => (legacy ? null : element.roundness ? "round" : "sharp"),
      (element) => !isArrowElement(element) && Object.hasOwn(element, "roundness"),
      (hasSelection) => (hasSelection ? null : fallback),
    );
  });
  const allPolygons = createMemo((): boolean => {
    const editor = tracked();
    if (!editor) return false;
    const selected = editor.scene.getSelectedElements(editor.state);
    return (
      selected.length > 0 &&
      selected.every(
        (element) => isLineElement(element) && element.polygon && element.points.length >= 3,
      )
    );
  });
  const arrowType = formValue<ArrowType>(
    () => store.state("currentItemArrowType"),
    (element) =>
      isArrowElement(element)
        ? element.elbowed
          ? ARROW_TYPE.elbow
          : element.roundness
            ? ARROW_TYPE.round
            : ARROW_TYPE.sharp
        : (null as unknown as ArrowType),
    (element) => isArrowElement(element),
  );
  const fontSize = createMemo((): number | null => {
    const editor = tracked();
    const fallback = store.state("currentItemFontSize") || DEFAULT_FONT_SIZE;
    if (!editor) return fallback;
    const elementsMap = editor.scene.getNonDeletedElementsMap();
    return getFormValue<number | null>(
      editor.scene.getElementsIncludingDeleted(),
      editor,
      (element) => {
        if (isTextElement(element)) return getBaseFontSize(element, elementsMap);
        const bound = getBoundTextElement(element, elementsMap);
        return bound ? getBaseFontSize(bound, elementsMap) : null;
      },
      (element) => isTextElement(element) || getBoundTextElement(element, elementsMap) !== null,
      (hasSelection) => (hasSelection ? null : fallback),
    );
  });
  const textAlign = createMemo((): string | null => {
    const editor = tracked();
    const fallback = store.state("currentItemTextAlign");
    if (!editor) return fallback;
    const elementsMap = editor.scene.getNonDeletedElementsMap();
    return getFormValue<string | null>(
      editor.scene.getElementsIncludingDeleted(),
      editor,
      (element) => {
        if (isTextElement(element)) return element.textAlign;
        const bound = getBoundTextElement(element, elementsMap);
        return bound ? bound.textAlign : null;
      },
      (element) => isTextElement(element) || getBoundTextElement(element, elementsMap) !== null,
      (hasSelection) => (hasSelection ? null : fallback),
    );
  });
  const verticalAlign = createMemo((): string | null => {
    const editor = tracked();
    if (!editor) return null;
    const elementsMap = editor.scene.getNonDeletedElementsMap();
    return getFormValue<string | null>(
      editor.scene.getElementsIncludingDeleted(),
      editor,
      (element) => {
        if (isTextElement(element) && element.containerId) return element.verticalAlign;
        const bound = getBoundTextElement(element, elementsMap);
        return bound ? bound.verticalAlign : null;
      },
      (element) => isTextElement(element) || getBoundTextElement(element, elementsMap) !== null,
      (hasSelection) => (hasSelection ? null : VERTICAL_ALIGN.MIDDLE),
    );
  });
  const arrowhead = (position: "start" | "end") =>
    createMemo((): Arrowhead | null => {
      const editor = tracked();
      const fallback =
        position === "start"
          ? store.state("currentItemStartArrowhead")
          : store.state("currentItemEndArrowhead");
      if (!editor) return fallback;
      return getFormValue<Arrowhead | null>(
        editor.scene.getElementsIncludingDeleted(),
        editor,
        (element) =>
          isLinearElement(element) && canHaveArrowheads(element.type)
            ? getArrowheadForPicker(
                position === "start" ? element.startArrowhead : element.endArrowhead,
              )
            : fallback,
        true,
        (hasSelection) => (hasSelection ? null : fallback),
      );
    });
  const startArrowhead = arrowhead("start");
  const endArrowhead = arrowhead("end");
  const opacity = formValue(
    () => store.state("currentItemOpacity"),
    (element) => element.opacity,
  );

  const isSticky = () => strokeTarget()?.kind === "sticky";
  const bucketFill = () => store.state("activeTool").type === "bucketfill";

  return (
    <Show when={predicates()}>
      {(shown: () => Predicates) => (
        <section
          class={panel}
          aria-label={t("headings.selectedShapeActions")}
          data-testid="properties-panel"
        >
          <Show
            when={!bucketFill()}
            fallback={
              <>
                <ColorPicker
                  type="elementBackground"
                  label={t("labels.background")}
                  color={store.state("currentItemBackgroundColor")}
                  topPicks={BUCKET_FILL_BACKGROUND_PICKS}
                  palette={DEFAULT_ELEMENT_BACKGROUND_COLOR_PALETTE}
                  excludedColors={[COLOR_PALETTE.transparent]}
                  onChange={(color) =>
                    ui.run(actionChangeBackgroundColor, { currentItemBackgroundColor: color })
                  }
                />
              </>
            }
          >
            <Show when={shown().strokeColor}>
              <div class={fieldset}>
                <span class={legend} aria-hidden="true">
                  {isSticky() ? t("labels.textColor") : t("labels.stroke")}
                </span>
                <ColorPicker
                  type="elementStroke"
                  label={isSticky() ? t("labels.textColor") : t("labels.stroke")}
                  color={strokeColor()}
                  topPicks={strokeTarget()!.topPicks}
                  palette={strokeTarget()!.palette}
                  excludedColors={strokeTarget()!.excludedColors}
                  elements={store.editor?.scene.getElementsIncludingDeleted()}
                  onChange={(color) => ui.run(actionChangeStrokeColor, { color })}
                  data-testid="stroke-color"
                />
              </div>
            </Show>
            <Show when={shown().backgroundColor}>
              <div class={fieldset}>
                <span class={legend} aria-hidden="true">
                  {t("labels.background")}
                </span>
                <ColorPicker
                  type="elementBackground"
                  label={t("labels.background")}
                  color={backgroundColor()}
                  topPicks={backgroundTarget()!.topPicks}
                  palette={backgroundTarget()!.palette}
                  excludedColors={backgroundTarget()!.excludedColors}
                  elements={store.editor?.scene.getElementsIncludingDeleted()}
                  onChange={(color) => ui.run(actionChangeBackgroundColor, { color })}
                  data-testid="background-color"
                />
              </div>
            </Show>
          </Show>
          <Show when={shown().fill}>
            <ChoiceGroup
              label={t("labels.fill")}
              value={allZigZag() ? "hachure" : fillStyle()}
              testId="fill-style"
              choices={[
                {
                  value: "hachure",
                  label: allZigZag() ? t("labels.zigzag") : t("labels.hachure"),
                  icon: () => (allZigZag() ? <Icons.FillZigZag /> : <Icons.FillHachure />),
                  testId: "fill-hachure",
                },
                {
                  value: "cross-hatch",
                  label: t("labels.crossHatch"),
                  icon: () => <Icons.FillCrossHatch />,
                  testId: "fill-cross-hatch",
                },
                {
                  value: "solid",
                  label: t("labels.solid"),
                  icon: () => <Icons.FillSolid />,
                  testId: "fill-solid",
                },
              ]}
              onChange={(value) =>
                ui.run(actionChangeFillStyle, value as ExcalidrawElement["fillStyle"])
              }
            />
          </Show>
          <Show when={shown().strokeWidth && !bucketFill()}>
            <ChoiceGroup
              label={t("labels.strokeWidth")}
              value={strokeWidth()}
              testId="stroke-width"
              choices={[
                {
                  value: "thin",
                  label: t("labels.thin"),
                  icon: () => <Icons.StrokeWidthThin />,
                  testId: "strokeWidth-thin",
                },
                {
                  value: "medium",
                  label: t("labels.medium"),
                  icon: () => <Icons.StrokeWidthBold />,
                  testId: "strokeWidth-medium",
                },
                {
                  value: "bold",
                  label: t("labels.bold"),
                  icon: () => <Icons.StrokeWidthExtraBold />,
                  testId: "strokeWidth-bold",
                },
              ]}
              onChange={(value) => ui.run(actionChangeStrokeWidth, value as StrokeWidthKey)}
            />
          </Show>
          <Show when={shown().strokeStyle && !bucketFill()}>
            <ChoiceGroup
              label={t("labels.strokeStyle")}
              value={strokeStyle()}
              testId="stroke-style"
              choices={[
                {
                  value: "solid",
                  label: t("labels.strokeStyle_solid"),
                  icon: () => <Icons.StrokeStyleSolid />,
                },
                {
                  value: "dashed",
                  label: t("labels.strokeStyle_dashed"),
                  icon: () => <Icons.StrokeStyleDashed />,
                },
                {
                  value: "dotted",
                  label: t("labels.strokeStyle_dotted"),
                  icon: () => <Icons.StrokeStyleDotted />,
                },
              ]}
              onChange={(value) =>
                ui.run(actionChangeStrokeStyle, value as ExcalidrawElement["strokeStyle"])
              }
            />
          </Show>
          <Show when={shown().freedrawMode && !bucketFill()}>
            <ChoiceGroup
              label={t("labels.pressure")}
              value={pressure()}
              choices={[
                {
                  value: "constant",
                  label: t("labels.pressure_constant"),
                  icon: () => <Icons.PressureConstant />,
                },
                {
                  value: "variable",
                  label: t("labels.pressure_variable"),
                  icon: () => <Icons.PressureVariable />,
                },
              ]}
              onChange={(value) =>
                ui.run(actionChangeFreedrawMode, value as "constant" | "variable")
              }
            />
          </Show>
          <Show when={shown().sloppiness && !bucketFill()}>
            <ChoiceGroup
              label={t("labels.sloppiness")}
              value={roughness() === null ? null : String(roughness())}
              testId="sloppiness"
              choices={[
                {
                  value: "0",
                  label: t("labels.architect"),
                  icon: () => <Icons.SloppinessArchitect />,
                },
                { value: "1", label: t("labels.artist"), icon: () => <Icons.SloppinessArtist /> },
                {
                  value: "2",
                  label: t("labels.cartoonist"),
                  icon: () => <Icons.SloppinessCartoonist />,
                },
              ]}
              onChange={(value) => ui.run(actionChangeSloppiness, Number(value))}
            />
          </Show>
          <Show when={shown().roundness && !bucketFill()}>
            <div class={fieldset}>
              <ChoiceGroup
                label={t("labels.edges")}
                value={edges()}
                testId="edges"
                choices={[
                  { value: "sharp", label: t("labels.sharp"), icon: () => <Icons.EdgeSharp /> },
                  { value: "round", label: t("labels.round"), icon: () => <Icons.EdgeRound /> },
                ]}
                onChange={(value) => ui.run(actionChangeRoundness, value as "sharp" | "round")}
              />
              <Show when={allPolygons()}>
                <Toggle
                  class={iconButton}
                  isSelected
                  onChange={() => ui.run(actionTogglePolygon)}
                  aria-label={t("labels.polygon.breakPolygon")}
                  title={t("labels.polygon.breakPolygon")}
                  data-testid="toggle-polygon"
                >
                  <Icons.Polygon />
                </Toggle>
              </Show>
            </div>
          </Show>
          <Show when={shown().arrowType && !bucketFill()}>
            <ChoiceGroup
              label={t("labels.arrowtypes")}
              value={arrowType()}
              testId="arrow-type"
              choices={[
                {
                  value: "sharp",
                  label: t("labels.arrowtype_sharp"),
                  icon: () => <Icons.ArrowSharp />,
                  testId: "sharp-arrow",
                },
                {
                  value: "round",
                  label: t("labels.arrowtype_round"),
                  icon: () => <Icons.ArrowRound />,
                  testId: "round-arrow",
                },
                {
                  value: "elbow",
                  label: t("labels.arrowtype_elbowed"),
                  icon: () => <Icons.ArrowElbow />,
                  testId: "elbow-arrow",
                },
              ]}
              onChange={(value) => ui.run(actionChangeArrowType, value as ArrowType)}
            />
          </Show>
          <Show when={shown().text && !bucketFill()}>
            <div class={fieldset}>
              <span class={legend} aria-hidden="true">
                {t("labels.fontFamily")}
              </span>
              <FontPicker />
            </div>
            <ChoiceGroup
              label={t("labels.fontSize")}
              value={fontSize() === null ? null : String(fontSize())}
              testId="font-size"
              choices={[
                {
                  value: String(FONT_SIZES.sm),
                  label: t("labels.small"),
                  icon: () => <Icons.FontSizeSmall />,
                  testId: "fontSize-small",
                },
                {
                  value: String(FONT_SIZES.md),
                  label: t("labels.medium"),
                  icon: () => <Icons.FontSizeMedium />,
                  testId: "fontSize-medium",
                },
                {
                  value: String(FONT_SIZES.lg),
                  label: t("labels.large"),
                  icon: () => <Icons.FontSizeLarge />,
                  testId: "fontSize-large",
                },
                {
                  value: String(FONT_SIZES.xl),
                  label: t("labels.veryLarge"),
                  icon: () => <Icons.FontSizeExtraLarge />,
                  testId: "fontSize-veryLarge",
                },
              ]}
              onChange={(value) => ui.run(actionChangeFontSize, Number(value))}
            />
            <Show when={shown().textAlign}>
              <ChoiceGroup
                label={t("labels.textAlign")}
                value={textAlign()}
                testId="text-align"
                choices={[
                  {
                    value: "left",
                    label: t("labels.left"),
                    icon: () => <TextAlignStart aria-hidden="true" />,
                  },
                  {
                    value: "center",
                    label: t("labels.center"),
                    icon: () => <TextAlignCenter aria-hidden="true" />,
                  },
                  {
                    value: "right",
                    label: t("labels.right"),
                    icon: () => <TextAlignEnd aria-hidden="true" />,
                  },
                ]}
                onChange={(value) =>
                  ui.run(actionChangeTextAlign, value as "left" | "center" | "right")
                }
              />
            </Show>
          </Show>
          <Show when={shown().verticalAlign && !bucketFill()}>
            <ChoiceGroup
              label={`${t("labels.alignTop")} / ${t("labels.centerVertically")} / ${t("labels.alignBottom")}`}
              hideLabel
              value={verticalAlign()}
              testId="vertical-align"
              choices={[
                {
                  value: VERTICAL_ALIGN.TOP,
                  label: t("labels.alignTop"),
                  icon: () => <AlignVerticalJustifyStart aria-hidden="true" />,
                  testId: "align-top",
                },
                {
                  value: VERTICAL_ALIGN.MIDDLE,
                  label: t("labels.centerVertically"),
                  icon: () => <AlignVerticalJustifyCenter aria-hidden="true" />,
                  testId: "align-middle",
                },
                {
                  value: VERTICAL_ALIGN.BOTTOM,
                  label: t("labels.alignBottom"),
                  icon: () => <AlignVerticalJustifyEnd aria-hidden="true" />,
                  testId: "align-bottom",
                },
              ]}
              onChange={(value) =>
                ui.run(actionChangeVerticalAlign, value as "top" | "middle" | "bottom")
              }
            />
          </Show>
          <Show when={shown().arrowheads && !bucketFill()}>
            <div class={fieldset} role="group" aria-label={t("labels.arrowheads")}>
              <span class={legend} aria-hidden="true">
                {t("labels.arrowheads")}
              </span>
              <div class={buttonRow}>
                <ArrowheadPicker
                  position="start"
                  value={startArrowhead()}
                  onChange={(type) => ui.run(actionChangeArrowhead, { position: "start", type })}
                />
                <ArrowheadPicker
                  position="end"
                  value={endArrowhead()}
                  onChange={(type) => ui.run(actionChangeArrowhead, { position: "end", type })}
                />
              </div>
            </div>
          </Show>
          <Show when={shown().opacity}>
            <div class={fieldset}>
              <div class={sliderRow}>
                <Slider
                  label={t("labels.opacity")}
                  minValue={0}
                  maxValue={100}
                  step={10}
                  value={opacity() ?? store.state("currentItemOpacity")}
                  onChange={(value: number | number[]) =>
                    ui.run(actionChangeOpacity, Array.isArray(value) ? (value[0] ?? 100) : value)
                  }
                  data-testid="opacity"
                />
              </div>
            </div>
          </Show>
          <Show when={shown().layers && !bucketFill()}>
            <div class={fieldset} role="group" aria-label={t("labels.layers")}>
              <span class={legend} aria-hidden="true">
                {t("labels.layers")}
              </span>
              <div class={buttonRow}>
                <ActionButton action={actionSendToBack} icon={<SendToBack aria-hidden="true" />} />
                <ActionButton action={actionSendBackward} icon={<ArrowDown aria-hidden="true" />} />
                <ActionButton action={actionBringForward} icon={<ArrowUp aria-hidden="true" />} />
                <ActionButton
                  action={actionBringToFront}
                  icon={<BringToFront aria-hidden="true" />}
                />
              </div>
            </div>
          </Show>
          <Show when={shown().align && !bucketFill()}>
            <div class={fieldset} role="group" aria-label={t("labels.align")}>
              <span class={legend} aria-hidden="true">
                {t("labels.align")}
              </span>
              <div class={buttonRow}>
                <Show
                  when={!ui.rtl()}
                  fallback={
                    <>
                      <ActionButton
                        action={actionAlignRight}
                        icon={<AlignEndVertical aria-hidden="true" />}
                      />
                      <ActionButton
                        action={actionAlignHorizontallyCentered}
                        icon={<AlignCenterVertical aria-hidden="true" />}
                      />
                      <ActionButton
                        action={actionAlignLeft}
                        icon={<AlignStartVertical aria-hidden="true" />}
                      />
                    </>
                  }
                >
                  <ActionButton
                    action={actionAlignLeft}
                    icon={<AlignStartVertical aria-hidden="true" />}
                  />
                  <ActionButton
                    action={actionAlignHorizontallyCentered}
                    icon={<AlignCenterVertical aria-hidden="true" />}
                  />
                  <ActionButton
                    action={actionAlignRight}
                    icon={<AlignEndVertical aria-hidden="true" />}
                  />
                </Show>
                <Show when={shown().distribute}>
                  <ActionButton
                    action={actionDistributeHorizontally}
                    icon={<AlignHorizontalDistributeCenter aria-hidden="true" />}
                  />
                </Show>
              </div>
              <div class={buttonRow}>
                <ActionButton
                  action={actionAlignTop}
                  icon={<AlignStartHorizontal aria-hidden="true" />}
                />
                <ActionButton
                  action={actionAlignVerticallyCentered}
                  icon={<AlignCenterHorizontal aria-hidden="true" />}
                />
                <ActionButton
                  action={actionAlignBottom}
                  icon={<AlignEndHorizontal aria-hidden="true" />}
                />
                <Show when={shown().distribute}>
                  <ActionButton
                    action={actionDistributeVertically}
                    icon={<AlignVerticalDistributeCenter aria-hidden="true" />}
                  />
                </Show>
              </div>
            </div>
          </Show>
          <Show when={shown().extraActions}>
            <div class={fieldset} role="group" aria-label={t("labels.actions")}>
              <span class={legend} aria-hidden="true">
                {t("labels.actions")}
              </span>
              <div class={buttonRow}>
                <ActionButton
                  action={actionDuplicateSelection}
                  icon={<Copy aria-hidden="true" />}
                />
                <ActionButton
                  action={actionDeleteSelected as Action}
                  icon={<Trash2 aria-hidden="true" />}
                />
                <ActionButton action={actionGroup} icon={<Group aria-hidden="true" />} />
                <ActionButton action={actionUngroup} icon={<Ungroup aria-hidden="true" />} />
                <Show when={shown().link}>
                  <ActionButton action={actionLink} icon={<Link aria-hidden="true" />} />
                </Show>
                <Show when={shown().cropEditor}>
                  <ActionButton
                    action={actionToggleCropEditor}
                    icon={<Crop aria-hidden="true" />}
                  />
                </Show>
                <Show when={shown().lineEditor}>
                  <ActionButton
                    action={actionToggleLinearEditor}
                    icon={<PenLine aria-hidden="true" />}
                  />
                </Show>
              </div>
            </div>
          </Show>
        </section>
      )}
    </Show>
  );
}

