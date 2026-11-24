import {
  type Child,
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "@barqjs/core";
import { Copy } from "@barqjs/lucide/icons/copy";
import { Maximize } from "@barqjs/lucide/icons/maximize";
import { WandSparkles } from "@barqjs/lucide/icons/wand-sparkles";
import { Spinner } from "@barqjs/ui/spinner";
import { sceneCoordsToViewportCoords } from "@excalidraw/common";

import type {
  ExcalidrawEmbeddableElement,
  ExcalidrawIframeElement,
  ExcalidrawMagicFrameElement,
  NonDeleted,
} from "@excalidraw/element/types";

import { copyTextToSystemClipboard } from "../clipboard.ts";
import { type Embed, getGenerationError } from "../editor/embeds.ts";
import { useDiagramUI } from "./context.tsx";
import { diagramLayer as d } from "./layer.ts";
import { iconButton, island } from "./styles.ts";

import type { DiagramEditor } from "../editor/editor.ts";
import type { LocalizedMessage, Translate } from "../i18n.ts";
import type { AppState } from "../types.ts";

/**
 * Excalidraw's `renderEmbeddable`: what an embeddable shows in place of its
 * iframe, or nothing for the iframe.
 */
export type RenderEmbeddable = (
  element: NonDeleted<ExcalidrawEmbeddableElement>,
  appState: AppState,
) => Child | null | undefined;

const content = d({
  position: "relative",
  width: "100%",
  height: "100%",
  borderRadius: "var(--embeddable-radius)",
  "& > *": { borderRadius: "var(--embeddable-radius)" },
  "& iframe": { display: "block", width: "100%", height: "100%", border: "0" },
});

const hint = d({
  position: "absolute",
  zIndex: "1",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  padding: "1rem 1.6rem",
  borderRadius: "12px",
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  color: "#fff",
  fontWeight: "700",
  letterSpacing: "0.6px",
  whiteSpace: "nowrap",
  pointerEvents: "none",
});

const generating = d({
  position: "absolute",
  zIndex: "1",
  bottom: "1rem",
  right: "1rem",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.375rem 0.75rem",
  borderRadius: "12px",
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  color: "#fff",
  fontSize: "0.875rem",
  pointerEvents: "none",
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
  color: "var(--destructive)",
});

const IFRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";

/**
 * The embeds over the canvas, Excalidraw's `renderEmbeddables`: an iframe
 * for each embed the editor lists, placed by the editor as the viewport and
 * the element move. A hovered embed says a click interacts with it; an
 * active one takes the pointer. A generated page that is still streaming
 * says so, and a failed one shows its error.
 */
export function EmbedLayer(props: {
  editor: DiagramEditor | null;
  embeds: readonly Embed[];
  t: Translate;
  renderEmbeddable?: RenderEmbeddable;
}) {
  return (
    <For each={props.embeds} keyed={(embed: Embed) => embed.id}>
      {(embed: () => Embed) => {
        const id = embed().id;
        let container: HTMLDivElement | undefined;
        let box: HTMLDivElement | undefined;
        let frame: HTMLIFrameElement | null = null;
        let detach: (() => void) | undefined;
        let scheduled = false;
        let disposed = false;
        // attached once its elements are all there, and again as the iframe comes and goes
        const attach = (): void => {
          if (scheduled) return;
          scheduled = true;
          queueMicrotask(() => {
            scheduled = false;
            detach?.();
            detach = undefined;
            const editor = props.editor;
            if (!disposed && container && editor && !editor.isDestroyed) {
              detach = editor.attachEmbed(id, { container, content: box, iframe: frame });
            }
          });
        };
        onCleanup(() => {
          disposed = true;
          detach?.();
        });

        const custom = createMemo((): Child | null => {
          const { element } = embed();
          const editor = props.editor;
          if (element.type !== "embeddable" || !props.renderEmbeddable || !editor) return null;
          return props.renderEmbeddable(element, editor.state) ?? null;
        });
        const status = () =>
          embed().element.type === "iframe" ? (embed().generation?.status ?? "error") : undefined;
        const error = () =>
          embed().element.type === "iframe" ? getGenerationError(embed().generation) : null;

        return (
          <div
            ref={(element: HTMLDivElement) => {
              container = element;
              attach();
            }}
            data-diagram-ui=""
            data-testid={embed().element.type === "iframe" ? "magic-frame-output" : "embeddable"}
            data-embed-id={id}
            data-state={embed().state ?? undefined}
            data-status={status()}
          >
            <Show when={embed().state === "hover"}>
              <div class={hint}>{props.t("buttons.embeddableInteractionButton")}</div>
            </Show>
            <div
              class={content}
              ref={(element: HTMLDivElement) => {
                box = element;
                attach();
              }}
            >
              <Show
                when={error() === null}
                fallback={
                  <div class={notice} role="alert">
                    {error()}
                  </div>
                }
              >
                <Show when={custom() === null} fallback={custom()}>
                  <Show when={embed().src !== null || embed().srcdoc !== null}>
                    <iframe
                      ref={(element: HTMLIFrameElement) => {
                        frame = element;
                        attach();
                        onCleanup(() => {
                          if (frame === element) {
                            frame = null;
                            attach();
                          }
                        });
                      }}
                      title={
                        embed().element.type === "iframe"
                          ? props.t("magicFrame.generated")
                          : props.t("toolBar.embeddable")
                      }
                      src={embed().srcdoc === null ? (embed().src ?? undefined) : undefined}
                      srcdoc={embed().srcdoc ?? undefined}
                      sandbox={embed().sandbox}
                      scrolling="no"
                      referrerPolicy="no-referrer-when-downgrade"
                      allow={IFRAME_ALLOW}
                      allowfullscreen
                    />
                  </Show>
                </Show>
              </Show>
            </div>
            <Show when={embed().generation?.status === "pending"}>
              <div class={generating}>
                <Spinner aria-hidden="true" />
                {props.t("chat.generating")}
              </div>
            </Show>
          </div>
        );
      }}
    </For>
  );
}

const canvasButtons = d({ position: "absolute", top: "0", left: "0", gap: "4px" });

interface Buttons {
  kind: "generate" | "generated";
  element: NonDeleted<ExcalidrawMagicFrameElement> | NonDeleted<ExcalidrawIframeElement>;
  left: number;
  top: number;
}

/** The buttons beside a selected magic frame or generated page, read from the editor. */
const readButtons = (editor: DiagramEditor, offerGenerate: boolean): Buttons | null => {
  const { state } = editor;
  const selected = Object.keys(state.selectedElementIds);
  const [only] = selected;
  if (selected.length !== 1 || !only) return null;
  const element = editor.scene.getNonDeletedElement(only);
  const kind =
    element?.type === "magicframe" && offerGenerate
      ? "generate"
      : element?.type === "iframe" && element.customData?.generationData?.status === "done"
        ? "generated"
        : null;
  if (!element || !kind) return null;
  const { x, y } = sceneCoordsToViewportCoords(
    { sceneX: element.x + element.width, sceneY: element.y },
    state,
  );
  return {
    kind,
    element: element as Buttons["element"],
    left: x - state.offsetLeft,
    top: y - state.offsetTop,
  };
};

/**
 * Excalidraw's canvas buttons of the magic frame: "Convert to code" beside a
 * selected magic frame, "Copy source" and fullscreen beside a generated page.
 */
export function MagicFrameButtons() {
  const ui = useDiagramUI();
  const t = ui.t;
  const [buttons, setButtons] = createSignal<Buttons | null>(null);

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
          setButtons(readButtons(editor, options.aiEnabled && options.diagramToCode !== undefined));
        });
      };
      update();
      return editor.onChange(update);
    },
  );

  const generate = (current: Buttons): void => {
    void ui.store.editor?.magicFrame.generate(
      current.element as NonDeleted<ExcalidrawMagicFrameElement>,
      "button",
    );
  };

  const copySource = (current: Buttons): void => {
    const editor = ui.store.editor;
    const generation = editor?.magicFrame.getGeneration(
      current.element as NonDeleted<ExcalidrawIframeElement>,
    );
    if (!editor || generation?.status !== "done") return;
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
    <Show when={buttons()}>
      {(current: () => Buttons) => (
        <div
          class={`${island} ${canvasButtons}`}
          style={{ transform: `translate(${current().left + 8}px, ${current().top}px)` }}
        >
          <Show
            when={current().kind === "generate"}
            fallback={
              <>
                <button
                  type="button"
                  class={iconButton}
                  aria-label={t("labels.copySource")}
                  title={t("labels.copySource")}
                  onClick={() => copySource(current())}
                  data-testid="magic-frame-copy"
                >
                  <Copy aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class={iconButton}
                  aria-label={t("buttons.fullScreen")}
                  title={t("buttons.fullScreen")}
                  onClick={() =>
                    ui.store.editor?.embeds.enterFullscreen(
                      current().element as NonDeleted<ExcalidrawIframeElement>,
                    )
                  }
                  data-testid="magic-frame-fullscreen"
                >
                  <Maximize aria-hidden="true" />
                </button>
              </>
            }
          >
            <button
              type="button"
              class={iconButton}
              aria-label={t("labels.convertToCode")}
              title={t("labels.convertToCode")}
              onClick={() => generate(current())}
              data-testid="magic-frame-generate"
            >
              <WandSparkles aria-hidden="true" />
            </button>
          </Show>
        </div>
      )}
    </Show>
  );
}
