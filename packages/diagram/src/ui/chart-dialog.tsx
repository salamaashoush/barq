import { For, Show, createEffect, createMemo, createSignal } from "@barqjs/core";
import { PaintBucket } from "@barqjs/lucide/icons/paint-bucket";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@barqjs/ui/dialog";
import { newTextElement } from "@excalidraw/element";

import type { ChartType, NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { isSpreadsheetValidForChartType, renderSpreadsheet } from "../charts/index.ts";
import { exportScene } from "../scene/export.ts";
import { useDiagramUI } from "./context.tsx";
import { diagramLayer as d } from "./layer.ts";
import { iconButton } from "./styles.ts";

import type { Spreadsheet } from "../charts/index.ts";
import type { TranslationKey } from "../i18n.ts";

const content = d({ maxWidth: "min(760px, calc(100vw - 2rem))", width: "100%" });

const titleRow = d({ display: "flex", alignItems: "center", gap: "8px" });

const choices = d({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
  gap: "12px",
});

const choice = d({
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: "8px",
  padding: "8px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
  "&:hover": { backgroundColor: "var(--accent)" },
  "&:focus-visible": { outline: "2px solid var(--ring)", outlineOffset: "2px" },
});

const preview = d({
  height: "160px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  "& svg": { maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto" },
});

const CHART_LABELS: Record<ChartType, TranslationKey> = {
  bar: "labels.chartType_bar",
  line: "labels.chartType_line",
  radar: "labels.chartType_radar",
};

const CHART_TYPES: readonly ChartType[] = ["bar", "line", "radar"];

/** Draws `elements` as an SVG into `box`, the latest call winning. */
const usePreview = (
  elements: () => readonly NonDeletedExcalidrawElement[] | null,
  theme: () => "light" | "dark",
) => {
  const [box, setBox] = createSignal<HTMLDivElement | null>(null);
  let request = 0;
  createEffect(
    () => ({ target: box(), shown: elements(), theme: theme() }),
    ({ target, shown, theme: shownTheme }) => {
      if (!target) return;
      const id = ++request;
      if (!shown) {
        target.replaceChildren();
        return;
      }
      void exportScene({
        type: "svg",
        data: { elements: shown, files: null },
        config: { skipInliningFonts: true, theme: shownTheme, canvasBackgroundColor: false },
      }).then(
        (svg) => {
          if (id !== request) return;
          svg.querySelector(".style-fonts")?.remove();
          svg.setAttribute("aria-hidden", "true");
          target.replaceChildren(svg);
        },
        (error: unknown) => console.error("DiagramEditor: a chart preview did not draw", error),
      );
    },
  );
  return setBox;
};

/**
 * Excalidraw's paste chart dialog: cells pasted from a spreadsheet, offered
 * as a bar, line or radar chart (those the data fits), or as the plain text
 * they were. The bucket reshuffles the colours.
 */
export function ChartDialog() {
  const ui = useDiagramUI();
  const t = ui.t;
  const store = ui.store;
  const dialog = () => {
    const open = store.state("openDialog");
    return open?.name === "charts" ? open : null;
  };
  const spreadsheet = () => (dialog()?.data as Spreadsheet | undefined) ?? null;
  const theme = () => store.state("theme");
  const [colorSeed, setColorSeed] = createSignal(Math.random());

  const close = (): void => {
    const editor = store.editor;
    if (editor?.state.openDialog?.name === "charts") {
      editor.batch(() => editor.setState({ openDialog: null }));
    }
  };

  const insert = (elements: readonly NonDeletedExcalidrawElement[]): void => {
    const editor = store.editor;
    if (!editor) return;
    editor.batch(() => {
      editor.addElementsFromPasteOrLibrary({ elements, files: null, position: "center" });
      editor.setState({ openDialog: null });
    });
    editor.focusContainer();
  };

  return (
    <Dialog
      isOpen={dialog() !== null}
      onOpenChange={(isOpen: boolean) => {
        if (!isOpen) close();
      }}
    >
      <DialogContent
        class={content}
        closeLabel={t("buttons.close")}
        data-testid="paste-chart-dialog"
      >
        <DialogHeader>
          <div class={titleRow}>
            <DialogTitle>{t("labels.pasteCharts")}</DialogTitle>
            <button
              type="button"
              class={iconButton}
              aria-label={t("charts.shuffleColors")}
              title={t("charts.shuffleColors")}
              onClick={() => setColorSeed(Math.random())}
              data-testid="chart-shuffle-colors"
            >
              <PaintBucket aria-hidden="true" />
            </button>
          </div>
        </DialogHeader>
        <div class={choices}>
          <For
            each={CHART_TYPES.filter((type) => isSpreadsheetValidForChartType(spreadsheet(), type))}
          >
            {(type: ChartType) => {
              const elements = createMemo(() => {
                const data = spreadsheet();
                const editor = store.editor;
                return data
                  ? renderSpreadsheet(type, data, 0, 0, colorSeed(), editor?.renderEnvironment)
                  : null;
              });
              const setBox = usePreview(elements, theme);
              return (
                <button
                  type="button"
                  class={choice}
                  aria-label={t(CHART_LABELS[type])}
                  onClick={() => {
                    const shown = elements();
                    if (shown) insert(shown);
                  }}
                  data-testid={`chart-${type}`}
                >
                  <div
                    class={preview}
                    ref={(element: HTMLDivElement) => queueMicrotask(() => setBox(element))}
                  />
                  <span>{t(CHART_LABELS[type])}</span>
                </button>
              );
            }}
          </For>
          <Show when={dialog()?.rawText}>
            {(rawText: () => string) => {
              const text = createMemo(() =>
                newTextElement({
                  text: rawText(),
                  x: 0,
                  y: 0,
                  renderEnvironment: store.editor?.renderEnvironment,
                }),
              );
              const setBox = usePreview(() => [text()], theme);
              return (
                <button
                  type="button"
                  class={choice}
                  aria-label={t("labels.chartType_plaintext")}
                  onClick={() => insert([text()])}
                  data-testid="chart-plaintext"
                >
                  <div
                    class={preview}
                    ref={(element: HTMLDivElement) => queueMicrotask(() => setBox(element))}
                  />
                  <span>{t("labels.chartType_plaintext")}</span>
                </button>
              );
            }}
          </Show>
        </div>
      </DialogContent>
    </Dialog>
  );
}
