import { For, Show, createMemo } from "@barqjs/core";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { X } from "@barqjs/lucide/icons/x";
import { KEYS, STATS_PANELS } from "@excalidraw/common";
import {
  CaptureUpdateAction,
  elementsAreInSameGroup,
  getBaseFontSize,
  getBaseFontSizeUpdate,
  getBoundTextElement,
  getCommonBounds,
  getElementAbsoluteCoords,
  getElementsInGroup,
  getSelectedGroupIds,
  getUncroppedWidthAndHeight,
  isArrowElement,
  isFrameLikeElement,
  isImageElement,
  isInGroup,
  isTextElement,
  newElementWith,
  redrawTextBoundingBox,
  rescalePointsInElement,
  resizeSingleElement,
  updateBindings,
} from "@excalidraw/element";
import { degreesToRadians, pointFrom, pointRotateRads, radiansToDegrees } from "@excalidraw/math";

import { actionToggleStats } from "../editor/actions/toggles.ts";
import { getNormalizedGridStep } from "../scene/normalize.ts";
import { useDiagramUI } from "./context.tsx";
import { diagramLayer as d } from "./layer.ts";
import { iconButton, panel, textInput } from "./styles.ts";

import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";
import type { TranslationKey } from "../i18n.ts";
import type { AppState } from "../types.ts";
import type { Degrees } from "@excalidraw/math";
import type { DiagramEditor } from "../editor/editor.ts";

const header = d({ display: "flex", alignItems: "center", justifyContent: "space-between" });
const title = d({ margin: "0", fontSize: "var(--text-sm)", fontWeight: "600" });
const subtitle = d({
  margin: "0",
  fontSize: "var(--text-xs)",
  color: "var(--muted-foreground)",
});
const grid = d({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "6px 8px",
  alignItems: "center",
  "& dt": { color: "var(--muted-foreground)" },
  "& dd": { margin: "0", textAlign: "end", fontVariantNumeric: "tabular-nums" },
});
const fields = d({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" });
const field = d({
  display: "flex",
  alignItems: "center",
  gap: "6px",
  "& span": { minWidth: "14px", color: "var(--muted-foreground)" },
});

const sectionToggle = d({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  padding: "0",
  border: "none",
  background: "none",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
  "& svg": { width: "14px", height: "14px", transition: "transform 120ms" },
  "&[aria-expanded=false] svg": { transform: "rotate(-90deg)" },
});
const heading = d({
  gridColumn: "1 / -1",
  margin: "0",
  fontSize: "var(--text-xs)",
  fontWeight: "600",
});
const scrub = d({ cursor: "ew-resize", touchAction: "none", userSelect: "none" });

const MIN_SIZE = 1;
/** Pixels of pointer travel per step when a label is dragged to scrub its value. */
const SCRUB_SENSITIVITY = 2;
const GRID_STEP_SIZE = 5;
const round = (value: number): number => Math.round(value * 100) / 100;

type Property = "x" | "y" | "width" | "height" | "angle" | "fontSize";

/** The top left corner an element shows at, its rotation applied. */
const topLeftOf = (element: NonDeletedExcalidrawElement): [number, number] => {
  const center = pointFrom(element.x + element.width / 2, element.y + element.height / 2);
  const [x, y] = pointRotateRads(pointFrom(element.x, element.y), center, element.angle);
  return [x, y];
};

/** Moves an element so its rotated top left corner is at the point, with its label and bindings. */
const moveTo = (
  editor: DiagramEditor,
  element: NonDeletedExcalidrawElement,
  x: number,
  y: number,
) => {
  const [left, top] = topLeftOf(element);
  const dx = x - left;
  const dy = y - top;
  moveBy(editor, element, dx, dy);
};

const moveBy = (
  editor: DiagramEditor,
  element: NonDeletedExcalidrawElement,
  dx: number,
  dy: number,
) => {
  const { scene } = editor;
  scene.mutateElement(element, { x: element.x + dx, y: element.y + dy });
  const label = getBoundTextElement(element, scene.getNonDeletedElementsMap());
  if (label) scene.mutateElement(label, { x: label.x + dx, y: label.y + dy });
  updateBindings(element, scene, editor.state, { renderEnvironment: editor.renderEnvironment });
};

/** The selection's units: each selected group as one, each element outside a group on its own. */
const getAtomicUnits = (
  elements: readonly NonDeletedExcalidrawElement[],
  appState: AppState,
): NonDeletedExcalidrawElement[][] => {
  const units = getSelectedGroupIds(appState).map((groupId) =>
    getElementsInGroup(elements, groupId).filter(
      (element): element is NonDeletedExcalidrawElement =>
        !element.isDeleted && !(isTextElement(element) && element.containerId),
    ),
  );
  for (const element of elements) {
    if (!isInGroup(element)) units.push([element]);
  }
  return units.filter((unit) => unit.length > 0);
};

/** A unit's top left: a group's box, or an element's rotated corner. */
const unitTopLeft = (unit: readonly NonDeletedExcalidrawElement[]): [number, number] => {
  if (unit.length === 1) return topLeftOf(unit[0]!);
  const [x, y] = getCommonBounds(unit);
  return [x, y];
};

const unitSize = (unit: readonly NonDeletedExcalidrawElement[]): [number, number] => {
  const [x1, y1, x2, y2] = getCommonBounds(unit);
  const [only] = unit;
  return unit.length === 1 && only && !isArrowElement(only)
    ? [only.width, only.height]
    : [x2 - x1, y2 - y1];
};

/** Scales a group from its top left so its box takes the width or height, keeping its proportions. */
const resizeGroup = (
  editor: DiagramEditor,
  unit: readonly NonDeletedExcalidrawElement[],
  property: "width" | "height",
  value: number,
): void => {
  const [x1, y1, x2, y2] = getCommonBounds(unit);
  const current = property === "width" ? x2 - x1 : y2 - y1;
  if (current <= 0) return;
  const scale = Math.max(value, MIN_SIZE) / current;
  const elementsMap = editor.scene.getNonDeletedElementsMap();
  for (const element of unit) {
    const width = element.width * scale;
    const height = element.height * scale;
    editor.scene.mutateElement(element, {
      x: x1 + (element.x - x1) * scale,
      y: y1 + (element.y - y1) * scale,
      width,
      height,
      ...rescalePointsInElement(element, width, height, false),
      ...(isTextElement(element) ? { fontSize: element.fontSize * scale } : {}),
    });
    const label = getBoundTextElement(element, elementsMap);
    if (label && !unit.includes(label)) {
      editor.scene.mutateElement(label, { fontSize: label.fontSize * scale });
      redrawTextBoundingBox(label, element, editor.scene, editor.renderEnvironment);
    }
  }
};

const resizeElement = (
  editor: DiagramEditor,
  element: NonDeletedExcalidrawElement,
  property: "width" | "height",
  value: number,
): void => {
  const keepAspectRatio = isImageElement(element);
  const ratio = element.width / Math.max(element.height, MIN_SIZE);
  const width = Math.max(
    property === "width" ? value : keepAspectRatio ? value * ratio : element.width,
    MIN_SIZE,
  );
  const height = Math.max(
    property === "height" ? value : keepAspectRatio ? value / ratio : element.height,
    MIN_SIZE,
  );
  resizeSingleElement(
    width,
    height,
    element,
    element,
    new Map(editor.scene.getNonDeletedElementsMap()),
    editor.scene,
    property === "width" ? "e" : "s",
    { shouldMaintainAspectRatio: keepAspectRatio, renderEnvironment: editor.renderEnvironment },
  );
};

const apply = (
  editor: DiagramEditor,
  property: Property,
  value: number,
  capture: "immediately" | "eventually" = "immediately",
): void => {
  const elements = editor.scene
    .getSelectedElements(editor.state)
    .filter((element) => !(isTextElement(element) && element.containerId));
  if (elements.length === 0 || !Number.isFinite(value)) return;
  const elementsMap = editor.scene.getNonDeletedElementsMap();
  editor.batch(() => {
    editor.store.scheduleAction(
      capture === "immediately" ? CaptureUpdateAction.IMMEDIATELY : CaptureUpdateAction.EVENTUALLY,
    );
    // a scrub's last step may change nothing: the commit still takes in the steps before it
    if (capture === "immediately") editor.scene.triggerUpdate();
    if (elements.length === 1) {
      const [element] = elements as [NonDeletedExcalidrawElement];
      if (property === "x" || property === "y") {
        const [left, top] = topLeftOf(element);
        moveTo(editor, element, property === "x" ? value : left, property === "y" ? value : top);
      } else if (property === "width" || property === "height") {
        resizeElement(editor, element, property, value);
      } else if (property === "angle") {
        if (isFrameLikeElement(element) || isArrowElement(element)) return;
        const angle = degreesToRadians((((value % 360) + 360) % 360) as Degrees);
        editor.scene.mutateElement(element, { angle });
        const label = getBoundTextElement(element, elementsMap);
        if (label && !isArrowElement(element)) editor.scene.mutateElement(label, { angle });
        updateBindings(element, editor.scene, editor.state, {
          renderEnvironment: editor.renderEnvironment,
        });
      } else if (property === "fontSize") {
        const text = isTextElement(element) ? element : getBoundTextElement(element, elementsMap);
        if (!text) return;
        setFontSize(editor, text, value);
      }
      return;
    }
    // several: each unit (a group, or an element outside one) takes the value
    const units = getAtomicUnits(elements, editor.state);
    if (property === "x" || property === "y") {
      for (const unit of units) {
        const [left, top] = unitTopLeft(unit);
        const dx = property === "x" ? value - left : 0;
        const dy = property === "y" ? value - top : 0;
        for (const element of unit) moveBy(editor, element, dx, dy);
      }
    } else if (property === "width" || property === "height") {
      for (const unit of units) {
        if (unit.length === 1) resizeElement(editor, unit[0]!, property, value);
        else resizeGroup(editor, unit, property, value);
      }
    } else if (property === "fontSize") {
      for (const element of elements) {
        const text = isTextElement(element) ? element : getBoundTextElement(element, elementsMap);
        if (text) setFontSize(editor, text, value);
      }
    } else if (property === "angle") {
      const angle = degreesToRadians((((value % 360) + 360) % 360) as Degrees);
      for (const element of elements) {
        if (!isFrameLikeElement(element) && !isArrowElement(element)) {
          editor.scene.mutateElement(element, { angle });
        }
      }
    }
  });
};

const setFontSize = (editor: DiagramEditor, text: ExcalidrawTextElement, size: number): void => {
  const elementsMap = editor.scene.getNonDeletedElementsMap();
  const next = newElementWith(
    text,
    getBaseFontSizeUpdate(text, Math.max(1, Math.round(size)), elementsMap),
  );
  editor.scene.mutateElement(text, next);
  redrawTextBoundingBox(
    text,
    editor.scene.getContainerElement(text),
    editor.scene,
    editor.renderEnvironment,
  );
};

/**
 * A number the stats panel edits: Enter or leaving the field applies it, the
 * arrows step it, and dragging its label scrubs it (by the step with Shift),
 * one undo step per drag. An empty field shows values that differ.
 */
function NumberField(props: {
  label: string;
  short: string;
  value: number | null;
  step?: number;
  onCommit: (value: number) => void;
  onScrub?: (value: number, done: boolean) => void;
  testId: string;
}) {
  const commit = (input: HTMLInputElement): void => {
    const value = Number(input.value);
    if (input.value.trim() !== "" && Number.isFinite(value) && value !== props.value) {
      props.onCommit(value);
    }
  };
  const startScrub = (event: PointerEvent): void => {
    const onScrub = props.onScrub;
    const start = props.value;
    if (!onScrub || start === null || event.button !== 0) return;
    event.preventDefault();
    const label = event.currentTarget as HTMLElement;
    label.setPointerCapture?.(event.pointerId);
    const originX = event.clientX;
    let last = start;
    const valueAt = (moveEvent: PointerEvent): number => {
      const steps = Math.round((moveEvent.clientX - originX) / SCRUB_SENSITIVITY);
      const step = props.step ?? 1;
      const raw = start + steps;
      return moveEvent.shiftKey ? Math.round(raw / (step * 5)) * step * 5 : raw;
    };
    const onMove = (moveEvent: PointerEvent): void => {
      const next = valueAt(moveEvent);
      if (next === last) return;
      last = next;
      onScrub(next, false);
    };
    const onUp = (upEvent: PointerEvent): void => {
      label.removeEventListener("pointermove", onMove);
      label.removeEventListener("pointerup", onUp);
      label.removeEventListener("pointercancel", onUp);
      if (last !== start) onScrub(valueAt(upEvent), true);
    };
    label.addEventListener("pointermove", onMove);
    label.addEventListener("pointerup", onUp);
    label.addEventListener("pointercancel", onUp);
  };
  return (
    <label class={field}>
      <span
        aria-hidden="true"
        class={props.onScrub ? scrub : undefined}
        onPointerDown={startScrub}
        data-testid={`${props.testId}-scrub`}
      >
        {props.short}
      </span>
      <input
        class={textInput}
        type="number"
        inputMode="decimal"
        aria-label={props.label}
        value={props.value === null ? "" : String(props.value)}
        placeholder={props.value === null ? "—" : undefined}
        step={props.step ?? 1}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key === KEYS.ENTER) {
            commit(event.currentTarget as HTMLInputElement);
          }
        }}
        onChange={(event: Event) => commit(event.currentTarget as HTMLInputElement)}
        data-testid={props.testId}
      />
    </label>
  );
}

/** A section's title, which folds it away, Excalidraw's `Collapsible`. */
function SectionToggle(props: {
  label: string;
  open: boolean;
  onToggle: () => void;
  testId: string;
}) {
  return (
    <h3 class={subtitle}>
      <button
        type="button"
        class={sectionToggle}
        aria-expanded={props.open}
        onClick={() => props.onToggle()}
        data-testid={props.testId}
      >
        <span>{props.label}</span>
        <ChevronDown aria-hidden="true" />
      </button>
    </h3>
  );
}

const same = (values: readonly number[]): number | null =>
  values.length > 0 && values.every((value) => value === values[0]) ? round(values[0]!) : null;

/**
 * Excalidraw's stats panel, "Canvas & Shape properties": the scene's shape
 * count and size and the grid's step, and the selection's type, position,
 * size, angle and font size (a group's, or each unit's for several), each
 * typed or scrubbed to change it, with an image's uncropped size while it is
 * cropped. Each section folds. It follows a drag as it happens.
 */
export function StatsPanel() {
  const ui = useDiagramUI();
  const t = ui.t;
  const store = ui.store;
  const shown = () =>
    store.state("stats").open &&
    !store.state("zenModeEnabled") &&
    !store.state("viewModeEnabled") &&
    store.state("openDialog")?.name !== "elementLinkSelector";
  const panels = () => store.state("stats").panels;
  const togglePanel = (flag: number) => () => {
    const editor = store.editor;
    editor?.batch(() =>
      editor.setState({
        stats: { ...editor.state.stats, panels: editor.state.stats.panels ^ flag },
      }),
    );
  };

  const scene = createMemo(() => {
    store.geometry();
    store.selection();
    const editor = store.editor;
    if (!editor || !shown()) return null;
    const elements = editor.scene.getNonDeletedElements();
    const [minX, minY, maxX, maxY] = getCommonBounds(elements);
    return {
      shapes: elements.length,
      width: elements.length ? round(maxX - minX) : 0,
      height: elements.length ? round(maxY - minY) : 0,
    };
  });

  const selection = createMemo(() => {
    store.geometry();
    store.selection();
    store.state("croppingElementId");
    const editor = store.editor;
    if (!editor || !shown()) return null;
    const selected = editor.scene
      .getSelectedElements(editor.state)
      .filter((element) => !(isTextElement(element) && element.containerId));
    if (selected.length === 0) return null;
    // a frame selected with its own children is no selection to edit
    if (
      selected.some(
        (element) =>
          isFrameLikeElement(element) && selected.some((other) => other.frameId === element.id),
      )
    ) {
      return null;
    }
    const elementsMap = editor.scene.getNonDeletedElementsMap();
    const texts: ExcalidrawTextElement[] = [];
    for (const element of selected) {
      const text = isTextElement(element) ? element : getBoundTextElement(element, elementsMap);
      if (text) texts.push(text);
    }
    const fontSizes = new Set(texts.map((text) => getBaseFontSize(text, elementsMap)));
    if (selected.length === 1) {
      const element = selected[0]!;
      const [x, y] = topLeftOf(element);
      const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);
      const cropping = editor.state.croppingElementId === element.id && isImageElement(element);
      const uncropped = cropping ? getUncroppedWidthAndHeight(element) : null;
      return {
        single: true,
        type: element.type,
        heading: (cropping ? "labels.imageCropping" : `element.${element.type}`) as TranslationKey,
        uncropped: uncropped
          ? { width: round(uncropped.width), height: round(uncropped.height) }
          : null,
        group: false,
        x: round(x),
        y: round(y),
        width: round(isArrowElement(element) ? x2 - x1 : element.width),
        height: round(isArrowElement(element) ? y2 - y1 : element.height),
        angle: round(radiansToDegrees(element.angle)),
        fontSize: texts.length ? round([...fontSizes][0]!) : null,
        count: 1,
      };
    }
    const units = getAtomicUnits(selected, editor.state);
    const corners = units.map(unitTopLeft);
    const sizes = units.map(unitSize);
    const angles = new Set(selected.map((element) => element.angle));
    return {
      single: false,
      type: null as ExcalidrawElement["type"] | null,
      heading: null as TranslationKey | null,
      uncropped: null as { width: number; height: number } | null,
      group: elementsAreInSameGroup(selected),
      x: same(corners.map(([x]) => x)),
      y: same(corners.map(([, y]) => y)),
      width: same(sizes.map(([width]) => width)),
      height: same(sizes.map(([, height]) => height)),
      angle: angles.size === 1 ? round(radiansToDegrees([...angles][0]!)) : null,
      fontSize: texts.length && fontSizes.size === 1 ? round([...fontSizes][0]!) : null,
      count: selected.length,
    };
  });

  const commit = (property: Property) => (value: number) => {
    const editor = store.editor;
    if (editor) apply(editor, property, value);
  };
  const scrubbed = (property: Property) => (value: number, done: boolean) => {
    const editor = store.editor;
    if (editor) apply(editor, property, value, done ? "immediately" : "eventually");
  };
  const setGridStep = (value: number) => {
    const editor = store.editor;
    if (!editor || !value) return;
    editor.batch(() => editor.setState({ gridStep: getNormalizedGridStep(value) }));
  };

  return (
    <Show when={shown()}>
      <section class={panel} aria-label={t("stats.fullTitle")} data-testid="stats-panel">
        <div class={header}>
          <h2 class={title}>{t("stats.title")}</h2>
          <button
            type="button"
            class={iconButton}
            aria-label={t("buttons.close")}
            title={t("buttons.close")}
            onClick={() => ui.run(actionToggleStats)}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <SectionToggle
          label={t("stats.generalStats")}
          open={(panels() & STATS_PANELS.generalStats) !== 0}
          onToggle={togglePanel(STATS_PANELS.generalStats)}
          testId="stats-general-toggle"
        />
        <Show when={(panels() & STATS_PANELS.generalStats) !== 0}>
          <dl class={grid}>
            <h4 class={heading}>{t("stats.scene")}</h4>
            <dt>{t("stats.shapes")}</dt>
            <dd data-testid="stats-shapes">{scene()?.shapes ?? 0}</dd>
            <dt>{t("stats.width")}</dt>
            <dd>{scene()?.width ?? 0}</dd>
            <dt>{t("stats.height")}</dt>
            <dd>{scene()?.height ?? 0}</dd>
          </dl>
          <Show when={store.state("gridModeEnabled")}>
            <dl class={grid}>
              <h4 class={heading}>{t("stats.canvas")}</h4>
            </dl>
            <NumberField
              label={t("stats.gridStep")}
              short="#"
              value={store.state("gridStep")}
              step={GRID_STEP_SIZE}
              onCommit={setGridStep}
              onScrub={(value) => setGridStep(value)}
              testId="stats-gridStep"
            />
          </Show>
          {ui
            .host()
            .renderCustomStats?.(store.editor?.scene.getNonDeletedElements() ?? [], store.snapshot)}
        </Show>
        <Show when={selection()}>
          <SectionToggle
            label={`${t("stats.elementProperties")}${
              selection()!.single ? "" : ` · ${t("stats.selected")} ${selection()!.count}`
            }`}
            open={(panels() & STATS_PANELS.elementProperties) !== 0}
            onToggle={togglePanel(STATS_PANELS.elementProperties)}
            testId="stats-element-toggle"
          />
          <Show when={(panels() & STATS_PANELS.elementProperties) !== 0}>
            <Show when={selection()!.uncropped}>
              <dl class={grid} data-testid="stats-uncropped">
                <h4 class={heading}>{t("labels.unCroppedDimension")}</h4>
                <dt>{t("stats.width")}</dt>
                <dd>{selection()!.uncropped!.width}</dd>
                <dt>{t("stats.height")}</dt>
                <dd>{selection()!.uncropped!.height}</dd>
              </dl>
            </Show>
            <Show when={selection()!.heading}>
              <h4 class={heading} data-testid="stats-element-type">
                {t(selection()!.heading!)}
              </h4>
            </Show>
            <Show when={selection()!.group}>
              <h4 class={heading} data-testid="stats-group">
                {t("element.group")}
              </h4>
            </Show>
            <Show when={!selection()!.single}>
              <dl class={grid}>
                <dt>{t("stats.shapes")}</dt>
                <dd>{selection()!.count}</dd>
              </dl>
            </Show>
            <div class={fields}>
              <For
                each={
                  [
                    ["x", "X", "x"],
                    ["y", "Y", "y"],
                    ["width", "W", t("stats.width")],
                    ["height", "H", t("stats.height")],
                  ] as const
                }
              >
                {(row: readonly [Property, string, string]) => (
                  <NumberField
                    label={row[2]}
                    short={row[1]}
                    value={selection()![row[0]]}
                    onCommit={commit(row[0])}
                    onScrub={scrubbed(row[0])}
                    testId={`stats-${row[0]}`}
                  />
                )}
              </For>
              <Show when={selection()!.type !== "frame" && selection()!.type !== "arrow"}>
                <NumberField
                  label={t("stats.angle")}
                  short="°"
                  value={selection()!.angle}
                  step={15}
                  onCommit={commit("angle")}
                  onScrub={scrubbed("angle")}
                  testId="stats-angle"
                />
              </Show>
              <Show when={selection()!.fontSize !== null || selection()!.type === "text"}>
                <NumberField
                  label={t("labels.fontSize")}
                  short="F"
                  value={selection()!.fontSize}
                  step={4}
                  onCommit={commit("fontSize")}
                  onScrub={scrubbed("fontSize")}
                  testId="stats-fontSize"
                />
              </Show>
            </div>
          </Show>
        </Show>
      </section>
    </Show>
  );
}
