import { For, Show, createEffect, createMemo, createSignal, untrack } from "@barqjs/core";
import { Check } from "@barqjs/lucide/icons/check";
import { Copy } from "@barqjs/lucide/icons/copy";
import { Download } from "@barqjs/lucide/icons/download";
import { FileDown } from "@barqjs/lucide/icons/file-down";
import { Link } from "@barqjs/lucide/icons/link";
import { Button } from "@barqjs/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@barqjs/ui/dialog";
import { Input } from "@barqjs/ui/input";
import { Switch } from "@barqjs/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@barqjs/ui/toggle-group";
import { DEFAULT_EXPORT_PADDING, EXPORT_SCALES, cloneJSON } from "@excalidraw/common";
import { isSomeElementSelected } from "@excalidraw/element";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { probablySupportsClipboardBlob } from "../clipboard.ts";
import { canvasToBlob } from "../data/blob.ts";
import { prepareElementsForExport } from "../data/files.ts";
import { isNativeFileSystemSupported } from "../data/filesystem.ts";
import { actionChangeProjectName } from "../editor/actions/canvas.ts";
import {
  actionChangeExportBackground,
  actionChangeExportEmbedScene,
  actionChangeExportScale,
  actionExportWithDarkMode,
  actionSaveFileToDisk,
  exportImage,
} from "../editor/actions/export.ts";
import { exportScene, getExportConfigFromAppState } from "../scene/export.ts";
import { useDiagramUI } from "./context.tsx";
import { layout, surface } from "@barqjs/arc/style";

import { diagramLayer as d } from "./layer.ts";
import { textInput } from "./styles.ts";

import type { ExportCanvasType } from "../data/files.ts";
import type { AppState } from "../types.ts";

const imageContent = d({
  maxWidth: "min(960px, calc(100vw - 2rem))",
  width: "100%",
  maxHeight: "calc(100vh - 2rem)",
  overflowY: "auto",
});

const imageLayout = d({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(240px, 300px)",
  gap: "24px",
  "@media (max-width: 640px)": { gridTemplateColumns: "minmax(0, 1fr)" },
});

const preview = d({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "240px",
  height: "min(50vh, 400px)",
  padding: "12px",
  borderRadius: "var(--radius)",
  // transparent shows as a chequerboard, as an image editor shows it
  backgroundImage:
    "linear-gradient(45deg, rgb(0 0 0 / 0.05) 25%, transparent 25%), linear-gradient(-45deg, rgb(0 0 0 / 0.05) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgb(0 0 0 / 0.05) 75%), linear-gradient(-45deg, transparent 75%, rgb(0 0 0 / 0.05) 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
  "& canvas": { maxWidth: "100%", maxHeight: "100%", boxShadow: "0 1px 4px rgb(0 0 0 / 0.15)" },
});

const settings = d({ display: "flex", flexDirection: "column", gap: "12px" });

const setting = d({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
});

const buttons = d({ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" });

const cards = d({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "16px",
});

const card = d(surface.bordered, layout.column, {
  alignItems: "center",
  textAlign: "center",
  gap: "8px",
  padding: "16px",
  "& h3": { margin: "0", fontSize: "var(--text-base)" },
  "& p": { margin: "0", color: "var(--muted-foreground)" },
  "& > svg": { width: "32px", height: "32px" },
});

/** A setting's name beside its switch, the label naming the switch. */
function SwitchSetting(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
  "data-testid"?: string;
}) {
  return (
    <label class={setting} title={props.description ?? props.label}>
      <span>{props.label}</span>
      <Switch
        checked={props.checked}
        onCheckedChange={props.onChange}
        aria-label={props.label}
        aria-description={props.description}
        data-testid={props["data-testid"]}
      />
    </label>
  );
}

/** The file name, editable where the browser picks no file to save to. */
function ProjectName() {
  const ui = useDiagramUI();
  return (
    <Show when={!isNativeFileSystemSupported()}>
      <label class={setting}>
        <span>{ui.t("labels.fileTitle")}</span>
        <Input
          class={textInput}
          value={ui.store.state("name") ?? ""}
          placeholder={ui.t("labels.untitled")}
          onChange={(event: Event) =>
            ui.run(actionChangeProjectName, (event.currentTarget as HTMLInputElement).value)
          }
          data-testid="export-file-name"
        />
      </label>
    </Show>
  );
}

interface ExportSnapshot {
  elements: readonly NonDeletedExcalidrawElement[];
  appState: AppState;
}

/**
 * Excalidraw's image export dialog: a preview of what is exported (the
 * selection, or everything), the background, dark mode, the embedded scene
 * and the scale, saved as PNG or SVG or copied as a PNG. It exports the scene
 * as it was when the dialog opened. Ctrl+Shift+E or the main menu opens it.
 */
export function ImageExportDialog() {
  const ui = useDiagramUI();
  const t = ui.t;
  const store = ui.store;
  const open = () => store.state("openDialog")?.name === "imageExport";

  // the scene as it was when the dialog opened: nothing behind it moves the export
  const snapshot = createMemo((): ExportSnapshot | null => {
    if (!open()) return null;
    const editor = store.editor;
    if (!editor) return null;
    return untrack(() => ({
      elements: cloneJSON(editor.scene.getNonDeletedElements()),
      appState: cloneJSON(editor.state),
    }));
  });

  const hasSelection = () => {
    const taken = snapshot();
    return taken !== null && isSomeElementSelected(taken.elements, taken.appState);
  };
  const [onlySelected, setOnlySelected] = createSignal<boolean | null>(null);
  const exportSelectionOnly = () => onlySelected() ?? hasSelection();
  const background = () => store.state("exportBackground");
  const dark = () => store.state("exportWithDarkMode");
  const embed = () => store.state("exportEmbedScene");
  const scale = () => store.state("exportScale");
  const [copied, setCopied] = createSignal(false);
  const [previewError, setPreviewError] = createSignal(false);

  const exported = createMemo(() => {
    const taken = snapshot();
    if (!taken) return null;
    return prepareElementsForExport(taken.elements, taken.appState, exportSelectionOnly());
  });

  const [previewBox, setPreviewBox] = createSignal<HTMLDivElement | null>(null);
  let request = 0;
  createEffect(
    () => ({
      taken: snapshot(),
      exported: exported(),
      background: background(),
      dark: dark(),
      files: store.editor?.getFiles() ?? {},
      box: previewBox(),
    }),
    (next) => {
      const { taken, box, files } = next;
      const target = next.exported;
      if (!taken || !target || !box) return;
      const id = ++request;
      const { width, height } = box.getBoundingClientRect();
      const maxWidthOrHeight = Math.max(width, height);
      if (!maxWidthOrHeight) return;
      void exportScene({
        type: "canvas",
        data: { elements: target.exportedElements, appState: taken.appState, files },
        config: {
          ...getExportConfigFromAppState({
            ...taken.appState,
            exportBackground: next.background,
            exportWithDarkMode: next.dark,
            exportScale: 1,
          }),
          padding: DEFAULT_EXPORT_PADDING,
          maxWidthOrHeight,
          exportingFrame: target.exportingFrame,
        },
      })
        .then(async (canvas) => {
          // a canvas that cannot become a blob will not export either
          await canvasToBlob(canvas);
          if (id !== request) return;
          canvas.setAttribute("aria-hidden", "true");
          box.replaceChildren(canvas);
          setPreviewError(false);
        })
        .catch((error: unknown) => {
          if (id !== request) return;
          console.error(error);
          box.replaceChildren();
          setPreviewError(true);
        });
    },
  );

  const close = (): void => {
    setOnlySelected(null);
    setCopied(false);
    const editor = store.editor;
    if (editor?.state.openDialog?.name === "imageExport") {
      editor.batch(() => editor.setState({ openDialog: null }));
    }
  };

  const run = async (type: ExportCanvasType): Promise<void> => {
    const editor = store.editor;
    const target = exported();
    if (!editor || !target) return;
    const done = await exportImage(editor, type, target.exportedElements, target.exportingFrame);
    if (done && type === "clipboard") {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog isOpen={open()} onOpenChange={(isOpen: boolean) => !isOpen && close()}>
      <DialogContent
        class={imageContent}
        closeLabel={t("buttons.close")}
        data-testid="image-export-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t("imageExportDialog.header")}</DialogTitle>
        </DialogHeader>
        <div class={imageLayout}>
          <div>
            <div
              class={preview}
              ref={(element: HTMLDivElement) => queueMicrotask(() => setPreviewBox(element))}
              data-testid="image-export-preview"
            />
            <Show when={previewError()}>
              <div role="alert">
                <strong>{t("canvasError.cannotShowPreview")}</strong>
                <p>{t("canvasError.canvasTooBig")}</p>
                <em>({t("canvasError.canvasTooBigTip")})</em>
              </div>
            </Show>
          </div>
          <div class={settings}>
            <ProjectName />
            <Show when={hasSelection()}>
              <SwitchSetting
                label={t("imageExportDialog.label.onlySelected")}
                checked={exportSelectionOnly()}
                onChange={setOnlySelected}
                data-testid="export-only-selected"
              />
            </Show>
            <SwitchSetting
              label={t("imageExportDialog.label.withBackground")}
              checked={background()}
              onChange={(checked) => ui.run(actionChangeExportBackground, checked)}
              data-testid="export-background"
            />
            <SwitchSetting
              label={t("imageExportDialog.label.darkMode")}
              checked={dark()}
              onChange={(checked) => ui.run(actionExportWithDarkMode, checked)}
              data-testid="export-dark-mode"
            />
            <SwitchSetting
              label={t("imageExportDialog.label.embedScene")}
              description={t("imageExportDialog.tooltip.embedScene")}
              checked={embed()}
              onChange={(checked) => ui.run(actionChangeExportEmbedScene, checked)}
              data-testid="export-embed-scene"
            />
            <div class={setting}>
              <span id="diagram-export-scale">{t("imageExportDialog.label.scale")}</span>
              <ToggleGroup
                type="single"
                variant="outline"
                value={String(scale())}
                onValueChange={(value: string | readonly string[]) => {
                  const next = Number(value);
                  if (next) ui.run(actionChangeExportScale, next);
                }}
                aria-labelledby="diagram-export-scale"
                data-testid="export-scale"
              >
                <For each={EXPORT_SCALES}>
                  {(value: number) => (
                    <ToggleGroupItem value={String(value)} aria-label={`${value}×`}>
                      {`${value}×`}
                    </ToggleGroupItem>
                  )}
                </For>
              </ToggleGroup>
            </div>
            <div class={buttons}>
              <Button
                onPress={() => void run("png")}
                aria-label={t("imageExportDialog.title.exportToPng")}
                title={t("imageExportDialog.title.exportToPng")}
                data-testid="export-png"
              >
                <Download aria-hidden="true" />
                {t("imageExportDialog.button.exportToPng")}
              </Button>
              <Button
                onPress={() => void run("svg")}
                aria-label={t("imageExportDialog.title.exportToSvg")}
                title={t("imageExportDialog.title.exportToSvg")}
                data-testid="export-svg"
              >
                <Download aria-hidden="true" />
                {t("imageExportDialog.button.exportToSvg")}
              </Button>
              <Show when={probablySupportsClipboardBlob}>
                <Button
                  variant="secondary"
                  onPress={() => void run("clipboard")}
                  aria-label={t("imageExportDialog.title.copyPngToClipboard")}
                  title={t("imageExportDialog.title.copyPngToClipboard")}
                  data-testid="export-clipboard"
                >
                  {copied() ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {copied()
                    ? t("toast.copyToClipboard")
                    : t("imageExportDialog.button.copyPngToClipboard")}
                </Button>
              </Show>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Excalidraw's export dialog: saving the scene to a file, and what the host
 * adds through `UIOptions.canvasActions.export` (`onExportToBackend`,
 * `renderCustomUI`).
 */
export function JSONExportDialog() {
  const ui = useDiagramUI();
  const t = ui.t;
  const store = ui.store;
  const open = () => store.state("openDialog")?.name === "jsonExport";
  const options = () => {
    const opts = ui.host().UIOptions.canvasActions.export;
    return opts === false ? null : opts;
  };

  const close = (): void => {
    const editor = store.editor;
    if (editor?.state.openDialog?.name === "jsonExport") {
      editor.batch(() => editor.setState({ openDialog: null }));
    }
  };

  const exportToBackend = async (): Promise<void> => {
    const editor = store.editor;
    const opts = options();
    if (!editor || !opts?.onExportToBackend) return;
    try {
      opts.onExportToBackend(editor.scene.getNonDeletedElements(), editor.state, editor.getFiles());
      close();
    } catch (error) {
      editor.batch(() =>
        editor.setState({ errorMessage: error instanceof Error ? error.message : String(error) }),
      );
    }
  };

  const custom = () => {
    const opts = options();
    const editor = store.editor;
    if (!opts?.renderCustomUI || !editor) return null;
    store.selection();
    return opts.renderCustomUI(
      editor.scene.getNonDeletedElements(),
      editor.state,
      editor.getFiles(),
    ) as ReturnType<typeof JSONExportDialog>;
  };

  return (
    <Dialog isOpen={open()} onOpenChange={(isOpen: boolean) => !isOpen && close()}>
      <DialogContent closeLabel={t("buttons.close")} data-testid="json-export-dialog">
        <DialogHeader>
          <DialogTitle>{t("buttons.export")}</DialogTitle>
        </DialogHeader>
        <div class={cards}>
          <Show when={options()?.saveFileToDisk === true}>
            <section class={card} aria-label={t("exportDialog.disk_title")}>
              <FileDown aria-hidden="true" />
              <h3>{t("exportDialog.disk_title")}</h3>
              <p>{t("exportDialog.disk_details")}</p>
              <ProjectName />
              <Button onPress={() => ui.run(actionSaveFileToDisk)} data-testid="save-to-disk">
                {t("exportDialog.disk_button")}
              </Button>
            </section>
          </Show>
          <Show when={options()?.onExportToBackend !== undefined}>
            <section class={card} aria-label={t("exportDialog.link_title")}>
              <Link aria-hidden="true" />
              <h3>{t("exportDialog.link_title")}</h3>
              <p>{t("exportDialog.link_details")}</p>
              <Button onPress={() => void exportToBackend()} data-testid="export-to-backend">
                {t("exportDialog.link_button")}
              </Button>
            </section>
          </Show>
          {custom()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
