import { For, Show, createEffect, createSignal } from "@barqjs/core";
import { Copy } from "@barqjs/lucide/icons/copy";
import { WandSparkles } from "@barqjs/lucide/icons/wand-sparkles";
import { sceneCoordsToViewportCoords } from "@excalidraw/common";

import type {
  ExcalidrawIframeElement,
  ExcalidrawMagicFrameElement,
  NonDeleted,
} from "@excalidraw/element/types";

import { copyTextToSystemClipboard } from "../clipboard.ts";
import { useDiagramUI } from "./context.tsx";
import { diagramLayer as d } from "./layer.ts";
import { iconButton, island } from "./styles.ts";

import type { DiagramEditor } from "../editor/editor.ts";
import type { MagicGeneration } from "../editor/magic-frame.ts";
import type { LocalizedMessage } from "../i18n.ts";

const host = d({
  position: "absolute",
  top: "0",
  left: "0",
  transformOrigin: "0 0",
  overflow: "hidden",
  pointerEvents: "none",
  backgroundColor: "var(--background)",
  boxShadow: "0 0 0 1px var(--border)",
  "& iframe": { display: "block", width: "100%", height: "100%", border: "0" },
});

const notice = d({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  height: "100%",
  padding: "16px",
  textAlign: "center",
  fontSize: "var(--text-sm)",
});

const failure = d({ color: "var(--destructive)" });

const canvasButtons = d({ position: "absolute", top: "0", left: "0" });

interface Placed {
  left: number;
  top: number;
  width: number;
  height: number;
  angle: number;
  zoom: number;
}

interface Output {
  id: string;
  place: Placed;
  generation: MagicGeneration;
}

interface Button {
  kind: "generate" | "copy";
  element: NonDeleted<ExcalidrawMagicFrameElement> | NonDeleted<ExcalidrawIframeElement>;
  left: number;
  top: number;
}

const placeOf = (
  element: { x: number; y: number; width: number; height: number; angle: number },
  editor: DiagramEditor,
): Placed => {
  const { state } = editor;
  const { x, y } = sceneCoordsToViewportCoords({ sceneX: element.x, sceneY: element.y }, state);
  return {
    left: x - state.offsetLeft,
    top: y - state.offsetTop,
    width: element.width,
    height: element.height,
    angle: element.angle,
    zoom: state.zoom.value,
  };
};

/**
 * What the layer shows, read from the editor: the generated iframe elements
 * and the button over a selected magic frame or generated iframe. The scene
 * is scanned for iframes only when it gains or loses elements or a
 * generation changes; a drag reads the few it found.
 */
const createReader = () => {
  let scannedCount = -1;
  let scannedVersion = -1;
  let iframeIds: string[] = [];
  return (
    editor: DiagramEditor,
    offerGenerate: boolean,
  ): { outputs: Output[]; button: Button | null } => {
    const all = editor.scene.getElementsIncludingDeleted();
    if (all.length !== scannedCount || editor.magicFrame.generationVersion !== scannedVersion) {
      scannedCount = all.length;
      scannedVersion = editor.magicFrame.generationVersion;
      iframeIds = all.filter((element) => element.type === "iframe").map((element) => element.id);
    }
    const outputs: Output[] = [];
    for (const id of iframeIds) {
      const element = editor.scene.getNonDeletedElement(id);
      if (element?.type !== "iframe") continue;
      const generation = editor.magicFrame.getGeneration(element);
      if (generation) outputs.push({ id, place: placeOf(element, editor), generation });
    }
    const selected = Object.keys(editor.state.selectedElementIds);
    const [only] = selected;
    let button: Button | null = null;
    if (selected.length === 1 && only) {
      const element = editor.scene.getNonDeletedElement(only);
      const generation =
        element?.type === "iframe" ? editor.magicFrame.getGeneration(element) : null;
      const kind =
        element?.type === "magicframe" && offerGenerate
          ? "generate"
          : generation?.status === "done"
            ? "copy"
            : null;
      if (element && kind) {
        const place = placeOf(element, editor);
        button = {
          kind,
          element: element as Button["element"],
          left: place.left + place.width * place.zoom,
          top: place.top,
        };
      }
    }
    return { outputs, button };
  };
};

/** The streamed page so far, or the finished one; nothing to show for an error. */
const pageOf = (generation: MagicGeneration): string | null =>
  generation.status === "done" ? generation.html : (generation.partial ?? null);

/**
 * The magic frame's output over the canvas: each generated iframe element
 * shows its HTML in a sandboxed iframe (`allow-scripts` without
 * `allow-same-origin`, so the page reaches nothing of this one), placed and
 * scaled with the viewport like the frame names; a pending one shows what
 * has streamed, a failed one its error. A selected magic frame offers
 * "Convert to code", a generated iframe "Copy source".
 */
export function MagicFrameLayer() {
  const ui = useDiagramUI();
  const t = ui.t;
  const [outputs, setOutputs] = createSignal<readonly Output[]>([], {
    equals: (a, b) => a.length === 0 && b.length === 0,
  });
  const [button, setButton] = createSignal<Button | null>(null);
  const read = createReader();

  createEffect(
    () => ui.store.editor,
    (editor) => {
      if (!editor) return () => {};
      let scheduled = false;
      // written outside whatever commit announced the change
      const update = (): void => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          if (editor.isDestroyed) return;
          const options = ui.host();
          const next = read(editor, options.aiEnabled && options.diagramToCode !== undefined);
          setOutputs(next.outputs);
          setButton(next.button);
        });
      };
      update();
      return editor.onChange(update);
    },
  );

  const run = (current: Button): void => {
    const editor = ui.store.editor;
    if (!editor) return;
    if (current.kind === "generate") {
      void editor.magicFrame.generate(
        current.element as NonDeleted<ExcalidrawMagicFrameElement>,
        "button",
      );
      return;
    }
    const generation = editor.magicFrame.getGeneration(
      current.element as NonDeleted<ExcalidrawIframeElement>,
    );
    if (generation?.status !== "done") return;
    void copyTextToSystemClipboard(generation.html).then(() =>
      editor.batch(() =>
        editor.setState({
          toast: {
            message: { key: "toast.copyToClipboard" } satisfies LocalizedMessage,
            duration: 1500,
          },
        }),
      ),
    );
  };

  return (
    <>
      <For each={outputs()} keyed={(output: Output) => output.id}>
        {(output: () => Output) => (
          <div
            class={host}
            style={{
              width: `${output().place.width}px`,
              height: `${output().place.height}px`,
              transform: `translate(${output().place.left}px, ${output().place.top}px) rotate(${output().place.angle}rad) scale(${output().place.zoom})`,
            }}
            data-testid="magic-frame-output"
            data-status={output().generation.status}
          >
            <Show
              when={pageOf(output().generation)}
              fallback={
                <div class={notice}>
                  <Show
                    when={output().generation.status === "error"}
                    fallback={<span>{t("chat.generating")}</span>}
                  >
                    <span class={failure} role="alert">
                      {output().generation.status === "error"
                        ? ((output().generation as { message?: string }).message ?? "")
                        : ""}
                    </span>
                  </Show>
                </div>
              }
            >
              {(page: () => string) => (
                <iframe title={t("magicFrame.generated")} sandbox="allow-scripts" srcdoc={page()} />
              )}
            </Show>
          </div>
        )}
      </For>
      <Show when={button()}>
        {(current: () => Button) => (
          <div
            class={`${island} ${canvasButtons}`}
            style={{ transform: `translate(${current().left + 8}px, ${current().top}px)` }}
          >
            <button
              type="button"
              class={iconButton}
              aria-label={
                current().kind === "generate" ? t("labels.convertToCode") : t("labels.copySource")
              }
              title={
                current().kind === "generate" ? t("labels.convertToCode") : t("labels.copySource")
              }
              onClick={() => run(current())}
              data-testid={
                current().kind === "generate" ? "magic-frame-generate" : "magic-frame-copy"
              }
            >
              <Show when={current().kind === "generate"} fallback={<Copy aria-hidden="true" />}>
                <WandSparkles aria-hidden="true" />
              </Show>
            </button>
          </div>
        )}
      </Show>
    </>
  );
}
