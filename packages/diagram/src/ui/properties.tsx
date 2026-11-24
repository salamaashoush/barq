import { For, Show, createMemo } from "@barqjs/core";
import { Radio, RadioGroup } from "@barqjs/aria/radio";
import { ALargeSmall } from "@barqjs/lucide/icons/a-large-small";
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
import { Ellipsis } from "@barqjs/lucide/icons/ellipsis";
import { Group } from "@barqjs/lucide/icons/group";
import { Link } from "@barqjs/lucide/icons/link";
import { PenLine } from "@barqjs/lucide/icons/pen-line";
import { SendToBack } from "@barqjs/lucide/icons/send-to-back";
import { SlidersHorizontal } from "@barqjs/lucide/icons/sliders-horizontal";
import { TextAlignCenter } from "@barqjs/lucide/icons/text-align-center";
import { TextAlignEnd } from "@barqjs/lucide/icons/text-align-end";
import { TextAlignStart } from "@barqjs/lucide/icons/text-align-start";
import { Trash2 } from "@barqjs/lucide/icons/trash-2";
import { Ungroup } from "@barqjs/lucide/icons/ungroup";
import { Button } from "@barqjs/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@barqjs/ui/popover";
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
import {
  actionChangeBucketFillBackgroundColor,
  getBucketFillBackgroundColor,
} from "../editor/bucket-fill.ts";
import { ColorPicker, closesOnPressOutside } from "./color-picker.tsx";
import { isShortcutName } from "./shortcuts.ts";
import { type DiagramUI, useDiagramUI } from "./context.tsx";
import { FontPicker } from "./font-picker.tsx";
import * as Icons from "./icons.tsx";
import { ArrowheadPicker } from "./arrowhead-picker.tsx";
import { gap, layout, space, type } from "@barqjs/arc/style";

import { diagramLayer as d } from "./layer.ts";
import {
  buttonRow,
  fieldset,
  iconButton,
  island,
  legend,
  panel,
  radioChoice,
  radioGroupRow,
  scrolls,
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
import type { AppState } from "../types.ts";
import type { DiagramEditor } from "../editor/editor.ts";

const groupLabel = d(type.meta, layout.fill, { display: "block", marginBottom: space.x1 });

/** The compact column, Excalidraw's `.compact-shape-actions` in its island. */
const compactColumn = d(island, layout.column, gap[2], scrolls, {
  padding: space.x2,
  maxHeight: "calc(100vh - 200px)",
});

const compactItem = d(layout.centre, layout.relative, { minHeight: "40px" });

const compactPopover = d(panel, { maxWidth: "13rem", boxShadow: "none", padding: space.x1 });

const sliderRow = d(layout.row, gap[2], { "& > :first-child": { flex: "1" } });

interface Choice {
  value: string;
  label: string;
  icon: () => Child;
  testId?: string;
}

interface ChoiceGroupProps {
  label: string;
  /** No visible name, as Excalidraw shows none for the vertical alignment. */
  hideLabel?: boolean;
  value: string | null;
  choices: readonly Choice[];
  onChange: (value: string) => void;
  testId?: string;
}

/**
 * One property as icon radios: a named radio group, the arrows moving the
 * choice. Nothing is checked when the selection mixes values.
 */
function ChoiceGroup(props: ChoiceGroupProps) {
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

interface ActionButtonProps {
  action: Action;
  icon: () => Child;
  label?: string;
  testId?: string;
}

function ActionButton(props: ActionButtonProps) {
  const ui = useDiagramUI();
  function label() {
    return props.label ?? ui.label(props.action);
  }
  function shortcut() {
    return isShortcutName(props.action.name) ? ui.shortcut(props.action.name) : "";
  }
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

function nonDeleted(editor: DiagramEditor): readonly NonDeletedExcalidrawElement[] {
  return editor.scene.getNonDeletedElements();
}

/**
 * Which properties the panel shows, for the active tool and the selection.
 * Excalidraw's `getShapeActionPredicates`.
 */
function getShapeActionPredicates(editor: DiagramEditor) {
  const appState = editor.state;
  const elementsMap = editor.scene.getNonDeletedElementsMap();
  const targetElements = getTargetElements(nonDeleted(editor), appState);
  const tool = appState.activeTool.type;
  function forToolOrSelection(predicate: (type: ExcalidrawElement["type"]) => boolean) {
    return (
      predicate(tool as ExcalidrawElement["type"]) ||
      targetElements.some((element) => predicate(element.type))
    );
  }
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
    linkSingleOnly: single,
    cropEditor:
      !appState.croppingElementId && single && first !== undefined && isImageElement(first),
    lineEditor:
      !appState.selectedLinearElement?.isEditing &&
      single &&
      first !== undefined &&
      isLinearElement(first) &&
      !isElbowArrow(first),
  };
}

type Predicates = ReturnType<typeof getShapeActionPredicates>;

/** The editor, read so that what follows it follows the selection, the tool and the editing. */
function trackedEditor(store: DiagramUI["store"]): DiagramEditor | null {
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
}

/** Whether the properties panel has anything to show: a selection, or a tool about to draw. */
export function createPropertiesVisible(ui: DiagramUI): () => boolean {
  return createMemo((): boolean => {
    const editor = trackedEditor(ui.store);
    return editor !== null && showSelectedShapeActions(editor.state, nonDeleted(editor));
  });
}

/** What the panel shows and the values it shows, for every layout of it. */
function createPropertiesModel(ui: DiagramUI) {
  const store = ui.store;

  // read so that the panel follows them; the editor is read for the values
  function tracked(): DiagramEditor | null {
    return trackedEditor(store);
  }

  const visible = createPropertiesVisible(ui);
  const predicates = createMemo((): Predicates | null => {
    const editor = tracked();
    return editor === null || !visible() ? null : getShapeActionPredicates(editor);
  });

  /** A property's value for the panel, Excalidraw's `getFormValue`, following the state. */
  function formValue<T extends string | number | boolean | null>(
    current: () => T,
    getValue: (element: ExcalidrawElement) => T,
    predicate: true | ((element: ExcalidrawElement) => boolean) = true,
  ): () => T | null {
    return createMemo(() => {
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
  }

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
  function arrowhead(position: "start" | "end") {
    return createMemo((): Arrowhead | null => {
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
  }
  const startArrowhead = arrowhead("start");
  const endArrowhead = arrowhead("end");
  const opacity = formValue(
    () => store.state("currentItemOpacity"),
    (element) => element.opacity,
  );

  function isSticky() {
    return strokeTarget()?.kind === "sticky";
  }
  function bucketFill() {
    return store.state("activeTool").type === "bucketfill";
  }

  return {
    predicates,
    strokeTarget,
    backgroundTarget,
    strokeColor,
    backgroundColor,
    fillStyle,
    allZigZag,
    strokeWidth,
    strokeStyle,
    roughness,
    pressure,
    edges,
    allPolygons,
    arrowType,
    fontSize,
    textAlign,
    verticalAlign,
    startArrowhead,
    endArrowhead,
    opacity,
    isSticky,
    bucketFill,
  };
}

type PropertiesModel = ReturnType<typeof createPropertiesModel>;

interface FieldProps {
  m: PropertiesModel;
  compact?: boolean;
}

function StrokeColorField(props: FieldProps) {
  const ui = useDiagramUI();
  const t = ui.t;
  const m = props.m;
  function label() {
    return m.isSticky() ? t("labels.textColor") : t("labels.stroke");
  }
  return (
    <div class={fieldset}>
      <Show when={props.compact !== true}>
        <span class={legend} aria-hidden="true">
          {label()}
        </span>
      </Show>
      <ColorPicker
        type="elementStroke"
        label={label()}
        color={m.strokeColor()}
        topPicks={m.strokeTarget()!.topPicks}
        customizableTopPicks={m.strokeTarget()!.customizableTopPicks}
        palette={m.strokeTarget()!.palette}
        excludedColors={m.strokeTarget()!.excludedColors}
        elements={ui.store.editor?.scene.getElementsIncludingDeleted()}
        onChange={(color) => ui.run(actionChangeStrokeColor, { color })}
        compact={props.compact}
        data-testid="stroke-color"
      />
    </div>
  );
}

function BackgroundColorField(props: FieldProps) {
  const ui = useDiagramUI();
  const t = ui.t;
  const m = props.m;
  return (
    <div class={fieldset}>
      <Show when={props.compact !== true}>
        <span class={legend} aria-hidden="true">
          {t("labels.background")}
        </span>
      </Show>
      <ColorPicker
        type="elementBackground"
        label={t("labels.background")}
        color={m.backgroundColor()}
        topPicks={m.backgroundTarget()!.topPicks}
        customizableTopPicks={m.backgroundTarget()!.customizableTopPicks}
        palette={m.backgroundTarget()!.palette}
        excludedColors={m.backgroundTarget()!.excludedColors}
        elements={ui.store.editor?.scene.getElementsIncludingDeleted()}
        onChange={(color) => ui.run(actionChangeBackgroundColor, { color })}
        compact={props.compact}
        data-testid="background-color"
      />
    </div>
  );
}

interface BucketFillColorFieldProps {
  compact?: boolean;
}

function BucketFillColorField(props: BucketFillColorFieldProps) {
  const ui = useDiagramUI();
  const t = ui.t;
  return (
    <div class={fieldset}>
      <Show when={props.compact !== true}>
        <span class={legend} aria-hidden="true">
          {t("labels.background")}
        </span>
      </Show>
      <ColorPicker
        type="elementBackground"
        label={t("labels.background")}
        color={getBucketFillBackgroundColor(ui.store.state("currentItemBackgroundColor"))}
        topPicks={BUCKET_FILL_BACKGROUND_PICKS}
        customizableTopPicks="bucketFill"
        palette={DEFAULT_ELEMENT_BACKGROUND_COLOR_PALETTE}
        excludedColors={[COLOR_PALETTE.transparent]}
        onChange={(color) =>
          ui.run(actionChangeBucketFillBackgroundColor, {
            currentItemBackgroundColor: color,
          })
        }
        compact={props.compact}
        data-testid="bucket-fill-color"
      />
    </div>
  );
}

function FillField(props: FieldProps) {
  const ui = useDiagramUI();
  const t = ui.t;
  const m = props.m;
  return (
    <div
      // Alt with a press on hachure turns it to zigzag, and a press undoes it,
      // as in Excalidraw; the radio itself reports no press on its own value
      ref={(wrapper: HTMLDivElement) =>
        // captured: the radio's own press handling keeps the click from bubbling
        wrapper.addEventListener(
          "click",
          (event: MouseEvent) => {
            const target = event.target as Element | null;
            if (!target?.closest("[data-testid=fill-hachure]")) return;
            if (m.allZigZag()) {
              ui.run(actionChangeFillStyle, "hachure");
            } else if (event.altKey && m.fillStyle() === "hachure") {
              ui.run(actionChangeFillStyle, "zigzag");
            }
          },
          true,
        )
      }
    >
      <ChoiceGroup
        label={t("labels.fill")}
        value={m.allZigZag() ? "hachure" : m.fillStyle()}
        testId="fill-style"
        choices={[
          {
            value: "hachure",
            label: m.allZigZag() ? t("labels.zigzag") : t("labels.hachure"),
            icon: () => (m.allZigZag() ? <Icons.FillZigZag /> : <Icons.FillHachure />),
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
        onChange={(value) => ui.run(actionChangeFillStyle, value as ExcalidrawElement["fillStyle"])}
      />
    </div>
  );
}

function StrokeWidthField(props: FieldProps) {
  const ui = useDiagramUI();
  const t = ui.t;
  return (
    <ChoiceGroup
      label={t("labels.strokeWidth")}
      value={props.m.strokeWidth()}
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
  );
}

function StrokeStyleField(props: FieldProps) {
  const ui = useDiagramUI();
  const t = ui.t;
  return (
    <ChoiceGroup
      label={t("labels.strokeStyle")}
      value={props.m.strokeStyle()}
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
  );
}

function PressureField(props: FieldProps) {
  const ui = useDiagramUI();
  const t = ui.t;
  return (
    <ChoiceGroup
      label={t("labels.pressure")}
      value={props.m.pressure()}
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
      onChange={(value) => ui.run(actionChangeFreedrawMode, value as "constant" | "variable")}
    />
  );
}

/** The pressure as one button that switches between the two, Excalidraw's compact one. */
function PressureCycle(props: FieldProps) {
  const ui = useDiagramUI();
  function variable() {
    return (props.m.pressure() ?? ui.store.state("currentItemStrokeVariability")) === "variable";
  }
  return (
    <button
      type="button"
      class={iconButton}
      aria-label={ui.t("labels.pressure")}
      title={ui.t("labels.pressure")}
      onClick={() => ui.run(actionChangeFreedrawMode, variable() ? "constant" : "variable")}
      data-testid="compact-pressure"
    >
      <Show when={variable()} fallback={<Icons.PressureConstant />}>
        <Icons.PressureVariable />
      </Show>
    </button>
  );
}

function SloppinessField(props: FieldProps) {
  const ui = useDiagramUI();
  const t = ui.t;
  return (
    <ChoiceGroup
      label={t("labels.sloppiness")}
      value={props.m.roughness() === null ? null : String(props.m.roughness())}
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
  );
}

function EdgesField(props: FieldProps) {
  const ui = useDiagramUI();
  const t = ui.t;
  return (
    <div class={fieldset}>
      <ChoiceGroup
        label={t("labels.edges")}
        value={props.m.edges()}
        testId="edges"
        choices={[
          { value: "sharp", label: t("labels.sharp"), icon: () => <Icons.EdgeSharp /> },
          { value: "round", label: t("labels.round"), icon: () => <Icons.EdgeRound /> },
        ]}
        onChange={(value) => ui.run(actionChangeRoundness, value as "sharp" | "round")}
      />
      <Show when={props.m.allPolygons()}>
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
  );
}

function ArrowTypeField(props: FieldProps) {
  const ui = useDiagramUI();
  const t = ui.t;
  return (
    <ChoiceGroup
      label={t("labels.arrowtypes")}
      value={props.m.arrowType()}
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
  );
}

function FontFamilyField() {
  const ui = useDiagramUI();
  return (
    <div class={fieldset}>
      <span class={legend} aria-hidden="true">
        {ui.t("labels.fontFamily")}
      </span>
      <FontPicker />
    </div>
  );
}

function FontSizeField(props: FieldProps) {
  const ui = useDiagramUI();
  const t = ui.t;
  return (
    <ChoiceGroup
      label={t("labels.fontSize")}
      value={props.m.fontSize() === null ? null : String(props.m.fontSize())}
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
  );
}

function TextAlignField(props: FieldProps) {
  const ui = useDiagramUI();
  const t = ui.t;
  return (
    <ChoiceGroup
      label={t("labels.textAlign")}
      value={props.m.textAlign()}
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
      onChange={(value) => ui.run(actionChangeTextAlign, value as "left" | "center" | "right")}
    />
  );
}

function VerticalAlignField(props: FieldProps) {
  const ui = useDiagramUI();
  const t = ui.t;
  return (
    <ChoiceGroup
      label={`${t("labels.alignTop")} / ${t("labels.centerVertically")} / ${t("labels.alignBottom")}`}
      hideLabel
      value={props.m.verticalAlign()}
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
      onChange={(value) => ui.run(actionChangeVerticalAlign, value as "top" | "middle" | "bottom")}
    />
  );
}

function ArrowheadsField(props: FieldProps) {
  const ui = useDiagramUI();
  const t = ui.t;
  return (
    <div class={fieldset} role="group" aria-label={t("labels.arrowheads")}>
      <span class={legend} aria-hidden="true">
        {t("labels.arrowheads")}
      </span>
      <div class={buttonRow}>
        <ArrowheadPicker
          position="start"
          value={props.m.startArrowhead()}
          onChange={(arrowhead) =>
            ui.run(actionChangeArrowhead, { position: "start", type: arrowhead })
          }
        />
        <ArrowheadPicker
          position="end"
          value={props.m.endArrowhead()}
          onChange={(arrowhead) =>
            ui.run(actionChangeArrowhead, { position: "end", type: arrowhead })
          }
        />
      </div>
    </div>
  );
}

function OpacityField(props: FieldProps) {
  const ui = useDiagramUI();
  return (
    <div class={fieldset}>
      <div class={sliderRow}>
        <Slider
          label={ui.t("labels.opacity")}
          minValue={0}
          maxValue={100}
          step={10}
          value={props.m.opacity() ?? ui.store.state("currentItemOpacity")}
          onChange={(value: number | number[]) =>
            ui.run(actionChangeOpacity, Array.isArray(value) ? (value[0] ?? 100) : value)
          }
          data-testid="opacity"
        />
      </div>
    </div>
  );
}

function LayersField() {
  const ui = useDiagramUI();
  return (
    <div class={fieldset} role="group" aria-label={ui.t("labels.layers")}>
      <span class={legend} aria-hidden="true">
        {ui.t("labels.layers")}
      </span>
      <div class={buttonRow}>
        <ActionButton action={actionSendToBack} icon={<SendToBack aria-hidden="true" />} />
        <ActionButton action={actionSendBackward} icon={<ArrowDown aria-hidden="true" />} />
        <ActionButton action={actionBringForward} icon={<ArrowUp aria-hidden="true" />} />
        <ActionButton action={actionBringToFront} icon={<BringToFront aria-hidden="true" />} />
      </div>
    </div>
  );
}

interface AlignFieldProps {
  distribute: boolean;
}

function AlignField(props: AlignFieldProps) {
  const ui = useDiagramUI();
  return (
    <div class={fieldset} role="group" aria-label={ui.t("labels.align")}>
      <span class={legend} aria-hidden="true">
        {ui.t("labels.align")}
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
          <ActionButton action={actionAlignLeft} icon={<AlignStartVertical aria-hidden="true" />} />
          <ActionButton
            action={actionAlignHorizontallyCentered}
            icon={<AlignCenterVertical aria-hidden="true" />}
          />
          <ActionButton action={actionAlignRight} icon={<AlignEndVertical aria-hidden="true" />} />
        </Show>
        <Show when={props.distribute}>
          <ActionButton
            action={actionDistributeHorizontally}
            icon={<AlignHorizontalDistributeCenter aria-hidden="true" />}
          />
        </Show>
      </div>
      <div class={buttonRow}>
        <ActionButton action={actionAlignTop} icon={<AlignStartHorizontal aria-hidden="true" />} />
        <ActionButton
          action={actionAlignVerticallyCentered}
          icon={<AlignCenterHorizontal aria-hidden="true" />}
        />
        <ActionButton action={actionAlignBottom} icon={<AlignEndHorizontal aria-hidden="true" />} />
        <Show when={props.distribute}>
          <ActionButton
            action={actionDistributeVertically}
            icon={<AlignVerticalDistributeCenter aria-hidden="true" />}
          />
        </Show>
      </div>
    </div>
  );
}

function DuplicateButton() {
  return <ActionButton action={actionDuplicateSelection} icon={<Copy aria-hidden="true" />} />;
}

function DeleteButton() {
  return (
    <ActionButton action={actionDeleteSelected as Action} icon={<Trash2 aria-hidden="true" />} />
  );
}

function LineEditorButton() {
  return <ActionButton action={actionToggleLinearEditor} icon={<PenLine aria-hidden="true" />} />;
}

export interface PropertiesPanelProps {
  class?: string;
}

/**
 * Excalidraw's properties panel for the selection, or for the tool about to
 * draw: each property the selected elements or the tool take, set on all of
 * them at once, showing their common value or none when they differ.
 */
export function PropertiesPanel(props: PropertiesPanelProps = {}) {
  const ui = useDiagramUI();
  const t = ui.t;
  const m = createPropertiesModel(ui);
  function bucketFill() {
    return m.bucketFill();
  }

  return (
    <Show when={m.predicates()}>
      {(shown: () => Predicates) => (
        <section
          class={props.class ? `${panel} ${props.class}` : panel}
          aria-label={t("headings.selectedShapeActions")}
          data-viewport-ui={ui.store.editorInterface().formFactor === "phone" ? undefined : "side"}
          data-viewport-ui-name={
            ui.store.editorInterface().formFactor === "phone" ? undefined : "stylesPanel"
          }
          data-testid="properties-panel"
        >
          <Show when={!bucketFill()} fallback={<BucketFillColorField />}>
            <Show when={shown().strokeColor}>
              <StrokeColorField m={m} />
            </Show>
            <Show when={shown().backgroundColor}>
              <BackgroundColorField m={m} />
            </Show>
          </Show>
          <Show when={shown().fill}>
            <FillField m={m} />
          </Show>
          <Show when={shown().strokeWidth && !bucketFill()}>
            <StrokeWidthField m={m} />
          </Show>
          <Show when={shown().strokeStyle && !bucketFill()}>
            <StrokeStyleField m={m} />
          </Show>
          <Show when={shown().freedrawMode && !bucketFill()}>
            <PressureField m={m} />
          </Show>
          <Show when={shown().sloppiness && !bucketFill()}>
            <SloppinessField m={m} />
          </Show>
          <Show when={shown().roundness && !bucketFill()}>
            <EdgesField m={m} />
          </Show>
          <Show when={shown().arrowType && !bucketFill()}>
            <ArrowTypeField m={m} />
          </Show>
          <Show when={shown().text && !bucketFill()}>
            <FontFamilyField />
            <FontSizeField m={m} />
            <Show when={shown().textAlign}>
              <TextAlignField m={m} />
            </Show>
          </Show>
          <Show when={shown().verticalAlign && !bucketFill()}>
            <VerticalAlignField m={m} />
          </Show>
          <Show when={shown().arrowheads && !bucketFill()}>
            <ArrowheadsField m={m} />
          </Show>
          <Show when={shown().opacity}>
            <OpacityField m={m} />
          </Show>
          <Show when={shown().layers && !bucketFill()}>
            <LayersField />
          </Show>
          <Show when={shown().align && !bucketFill()}>
            <AlignField distribute={shown().distribute} />
          </Show>
          <Show when={shown().extraActions}>
            <div class={fieldset} role="group" aria-label={t("labels.actions")}>
              <span class={legend} aria-hidden="true">
                {t("labels.actions")}
              </span>
              <div class={buttonRow}>
                <DuplicateButton />
                <DeleteButton />
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
                  <LineEditorButton />
                </Show>
              </div>
            </div>
          </Show>
        </section>
      )}
    </Show>
  );
}

type CompactPopup = Extract<
  AppState["openPopup"],
  | "compactStrokeStyles"
  | "compactArrowProperties"
  | "compactTextProperties"
  | "compactOtherProperties"
>;

interface CompactPopoverProps {
  popup: CompactPopup;
  label: string;
  icon: Child;
  maxWidth?: string;
  children: Child;
}

/**
 * One button of the compact column and the popover it opens, open while the
 * editor's `openPopup` names it, so one closes as another opens.
 */
function CompactPopover(props: CompactPopoverProps) {
  const ui = useDiagramUI();
  function open() {
    return ui.store.state("openPopup") === props.popup;
  }
  function setOpen(next: boolean): void {
    const editor = ui.store.editor;
    if (!editor || next === (editor.state.openPopup === props.popup)) return;
    editor.batch(() => editor.setState({ openPopup: next ? props.popup : null }));
  }
  return (
    <Popover isOpen={open()} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button
          variant="ghost"
          size="icon"
          class={iconButton}
          aria-label={props.label}
          title={props.label}
          data-active={open() ? "" : undefined}
          data-properties-trigger=""
          data-testid={`compact-${props.popup.slice("compact".length).replace(/^./, (c) => c.toLowerCase())}`}
        >
          {props.icon}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        shouldCloseOnInteractOutside={closesOnPressOutside}
      >
        <section
          class={compactPopover}
          aria-label={props.label}
          data-testid={`${props.popup}-popover`}
        >
          {props.children}
        </section>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Excalidraw's `CompactShapeActions`, the properties on a tablet: a column of
 * buttons at the top start, the colours and the font each opening its own
 * picker, the rest grouped into popovers by what they change.
 */
export function CompactPropertiesPanel() {
  const ui = useDiagramUI();
  const t = ui.t;
  const m = createPropertiesModel(ui);
  function tool() {
    return ui.store.state("activeTool").type;
  }
  function combinedShown(shown: Predicates) {
    return (
      shown.hasSelection || !["selection", "eraser", "hand", "laser", "lasso"].includes(tool())
    );
  }
  function arrowIcon() {
    const shape = m.arrowType();
    return shape === ARROW_TYPE.elbow ? (
      <Icons.ArrowElbow />
    ) : shape === ARROW_TYPE.round ? (
      <Icons.ArrowRound />
    ) : (
      <Icons.ArrowSharp />
    );
  }

  return (
    <Show when={m.predicates()}>
      {(shown: () => Predicates) => (
        <div
          class={compactColumn}
          role="group"
          aria-label={t("headings.selectedShapeActions")}
          data-viewport-ui={ui.store.editorInterface().formFactor === "phone" ? undefined : "side"}
          data-viewport-ui-name={
            ui.store.editorInterface().formFactor === "phone" ? undefined : "stylesPanel"
          }
          data-testid="compact-properties"
        >
          <Show when={shown().strokeColor}>
            <div class={compactItem}>
              <StrokeColorField m={m} compact />
            </div>
          </Show>
          <Show when={shown().backgroundColor}>
            <div class={compactItem}>
              <Show when={m.bucketFill()} fallback={<BackgroundColorField m={m} compact />}>
                <BucketFillColorField compact />
              </Show>
            </div>
          </Show>
          <Show when={shown().freedrawMode}>
            <div class={compactItem}>
              <PressureCycle m={m} />
            </div>
          </Show>
          <Show when={combinedShown(shown())}>
            <div class={compactItem}>
              <CompactPopover
                popup="compactStrokeStyles"
                label={t("labels.stroke")}
                icon={<SlidersHorizontal aria-hidden="true" />}
              >
                <Show when={shown().fill}>
                  <FillField m={m} />
                </Show>
                <Show when={shown().strokeWidth}>
                  <StrokeWidthField m={m} />
                </Show>
                <Show when={shown().freedrawMode}>
                  <PressureField m={m} />
                </Show>
                <Show when={shown().strokeStyle}>
                  <StrokeStyleField m={m} />
                </Show>
                <Show when={shown().sloppiness}>
                  <SloppinessField m={m} />
                </Show>
                <Show when={shown().roundness}>
                  <EdgesField m={m} />
                </Show>
                <Show when={shown().opacity}>
                  <OpacityField m={m} />
                </Show>
              </CompactPopover>
            </div>
          </Show>
          <Show when={shown().arrowType}>
            <div class={compactItem}>
              <CompactPopover
                popup="compactArrowProperties"
                label={t("labels.arrowtypes")}
                icon={arrowIcon()}
              >
                <ArrowheadsField m={m} />
                <ArrowTypeField m={m} />
              </CompactPopover>
            </div>
          </Show>
          <Show when={shown().lineEditor}>
            <div class={compactItem}>
              <LineEditorButton />
            </div>
          </Show>
          <Show when={shown().text}>
            <div class={compactItem}>
              <FontPicker compact />
            </div>
            <div class={compactItem}>
              <CompactPopover
                popup="compactTextProperties"
                label={t("labels.textAlign")}
                icon={<ALargeSmall aria-hidden="true" />}
              >
                <FontSizeField m={m} />
                <Show when={shown().textAlign}>
                  <TextAlignField m={m} />
                </Show>
                <Show when={shown().verticalAlign}>
                  <VerticalAlignField m={m} />
                </Show>
              </CompactPopover>
            </div>
          </Show>
          <Show when={shown().extraActions}>
            <div class={compactItem}>
              <DuplicateButton />
            </div>
            <div class={compactItem}>
              <DeleteButton />
            </div>
            <div class={compactItem}>
              <CompactPopover
                popup="compactOtherProperties"
                label={t("labels.actions")}
                icon={<Ellipsis aria-hidden="true" />}
              >
                <Show when={shown().layers}>
                  <LayersField />
                </Show>
                <Show when={shown().align}>
                  <AlignField distribute={shown().distribute} />
                </Show>
                <div class={fieldset} role="group" aria-label={t("labels.actions")}>
                  <span class={legend} aria-hidden="true">
                    {t("labels.actions")}
                  </span>
                  <div class={buttonRow}>
                    <ActionButton action={actionGroup} icon={<Group aria-hidden="true" />} />
                    <ActionButton action={actionUngroup} icon={<Ungroup aria-hidden="true" />} />
                    <Show when={shown().linkSingleOnly}>
                      <ActionButton action={actionLink} icon={<Link aria-hidden="true" />} />
                    </Show>
                    <Show when={shown().cropEditor}>
                      <ActionButton
                        action={actionToggleCropEditor}
                        icon={<Crop aria-hidden="true" />}
                      />
                    </Show>
                  </div>
                </div>
              </CompactPopover>
            </div>
          </Show>
        </div>
      )}
    </Show>
  );
}
