import { For, Show, createMemo } from "@barqjs/core";
import { X } from "@barqjs/lucide/icons/x";
import { KEYS } from "@excalidraw/common";
import {
  CaptureUpdateAction,
  getBaseFontSize,
  getBaseFontSizeUpdate,
  getBoundTextElement,
  getCommonBounds,
  getElementAbsoluteCoords,
  isArrowElement,
  isFrameLikeElement,
  isImageElement,
  isTextElement,
  newElementWith,
  redrawTextBoundingBox,
  resizeSingleElement,
  updateBindings,
} from "@excalidraw/element";
import { degreesToRadians, pointFrom, pointRotateRads, radiansToDegrees } from "@excalidraw/math";

import { actionToggleStats } from "../editor/actions/toggles.ts";
import { useDiagramUI } from "./context.tsx";
import { diagramLayer as d } from "./layer.ts";
import { iconButton, panel, textInput } from "./styles.ts";

import type { ExcalidrawTextElement, NonDeletedExcalidrawElement } from "@excalidraw/element/types";
import type { Degrees } from "@excalidraw/math";
import type { DiagramEditor } from "../editor/editor.ts";

const header = d({ display: "flex", alignItems: "center", justifyContent: "space-between" });
const title = d({ margin: "0", fontSize: "var(--text-sm, 0.875rem)", fontWeight: "600" });
const subtitle = d({
  margin: "0",
  fontSize: "var(--text-xs, 0.75rem)",
  color: "var(--muted-foreground, GrayText)",
});
const grid = d({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "6px 8px",
  alignItems: "center",
  "& dt": { color: "var(--muted-foreground, GrayText)" },
  "& dd": { margin: "0", textAlign: "end", fontVariantNumeric: "tabular-nums" },
});
const fields = d({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" });
const field = d({
  display: "flex",
  alignItems: "center",
  gap: "6px",
  "& span": { minWidth: "14px", color: "var(--muted-foreground, GrayText)" },
});

const MIN_SIZE = 1;
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

const apply = (editor: DiagramEditor, property: Property, value: number): void => {
  const elements = editor.scene
    .getSelectedElements(editor.state)
    .filter((element) => !(isTextElement(element) && element.containerId));
  if (elements.length === 0 || !Number.isFinite(value)) return;
  const elementsMap = editor.scene.getNonDeletedElementsMap();
  editor.batch(() => {
    editor.store.scheduleAction(CaptureUpdateAction.IMMEDIATELY);
    if (elements.length === 1) {
      const [element] = elements as [NonDeletedExcalidrawElement];
      if (property === "x" || property === "y") {
        const [left, top] = topLeftOf(element);
        moveTo(editor, element, property === "x" ? value : left, property === "y" ? value : top);
      } else if (property === "width" || property === "height") {
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
          new Map(elementsMap),
          editor.scene,
          property === "width" ? "e" : "s",
          {
            shouldMaintainAspectRatio: keepAspectRatio,
            renderEnvironment: editor.renderEnvironment,
          },
        );
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
    // several: the common box moves and the texts take the size
    if (property === "x" || property === "y") {
      const [minX, minY] = getCommonBounds(elements);
      const dx = property === "x" ? value - minX : 0;
      const dy = property === "y" ? value - minY : 0;
      for (const element of elements) moveBy(editor, element, dx, dy);
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

/** A number the stats panel edits: Enter or leaving the field applies it, the arrows step it. */
function NumberField(props: {
  label: string;
  short: string;
  value: number | null;
  step?: number;
  onCommit: (value: number) => void;
  testId: string;
}) {
  const commit = (input: HTMLInputElement): void => {
    const value = Number(input.value);
    if (input.value.trim() !== "" && Number.isFinite(value) && value !== props.value) {
      props.onCommit(value);
    }
  };
  return (
    <label class={field}>
      <span aria-hidden="true">{props.short}</span>
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

/**
 * Excalidraw's stats panel, "Canvas & Shape properties": the scene's shape
 * count and size, and the selection's position, size, angle and font size,
 * each typed to change it. It follows a drag as it happens.
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
    const editor = store.editor;
    if (!editor || !shown()) return null;
    const selected = editor.scene
      .getSelectedElements(editor.state)
      .filter((element) => !(isTextElement(element) && element.containerId));
    if (selected.length === 0) return null;
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
      return {
        single: true,
        type: element.type,
        x: round(x),
        y: round(y),
        width: round(isArrowElement(element) ? x2 - x1 : element.width),
        height: round(isArrowElement(element) ? y2 - y1 : element.height),
        angle: round(radiansToDegrees(element.angle)),
        fontSize: texts.length ? round([...fontSizes][0]!) : null,
        count: 1,
      };
    }
    const [minX, minY, maxX, maxY] = getCommonBounds(selected);
    const angles = new Set(selected.map((element) => element.angle));
    return {
      single: false,
      type: null,
      x: round(minX),
      y: round(minY),
      width: round(maxX - minX),
      height: round(maxY - minY),
      angle: angles.size === 1 ? round(radiansToDegrees([...angles][0]!)) : null,
      fontSize: texts.length && fontSizes.size === 1 ? round([...fontSizes][0]!) : null,
      count: selected.length,
    };
  });

  const commit = (property: Property) => (value: number) => {
    const editor = store.editor;
    if (editor) apply(editor, property, value);
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
        <h3 class={subtitle}>{t("stats.generalStats")}</h3>
        <dl class={grid}>
          <dt>{t("stats.shapes")}</dt>
          <dd data-testid="stats-shapes">{scene()?.shapes ?? 0}</dd>
          <dt>{t("stats.width")}</dt>
          <dd>{scene()?.width ?? 0}</dd>
          <dt>{t("stats.height")}</dt>
          <dd>{scene()?.height ?? 0}</dd>
        </dl>
        <Show when={selection()}>
          <h3 class={subtitle}>
            {t("stats.elementProperties")}
            <Show
              when={!selection()!.single}
            >{` · ${t("stats.selected")} ${selection()!.count}`}</Show>
          </h3>
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
                <Show when={row[0] === "x" || row[0] === "y" || selection()!.single}>
                  <NumberField
                    label={row[2]}
                    short={row[1]}
                    value={selection()![row[0]]}
                    onCommit={commit(row[0])}
                    testId={`stats-${row[0]}`}
                  />
                </Show>
              )}
            </For>
            <Show when={selection()!.type !== "frame" && selection()!.type !== "arrow"}>
              <NumberField
                label={t("stats.angle")}
                short="°"
                value={selection()!.angle}
                onCommit={commit("angle")}
                testId="stats-angle"
              />
            </Show>
            <Show when={selection()!.fontSize !== null || selection()!.type === "text"}>
              <NumberField
                label={t("labels.fontSize")}
                short="F"
                value={selection()!.fontSize}
                onCommit={commit("fontSize")}
                testId="stats-fontSize"
              />
            </Show>
          </div>
        </Show>
        {ui
          .host()
          .renderCustomStats?.(store.editor?.scene.getNonDeletedElements() ?? [], store.snapshot)}
      </section>
    </Show>
  );
}
