import { For, Show, createSignal } from "@barqjs/core";
import { X } from "@barqjs/lucide/icons/x";
import { Button } from "@barqjs/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@barqjs/ui/dialog";
import { Input } from "@barqjs/ui/input";
import { Textarea } from "@barqjs/ui/textarea";
import {
  COLOR_WHITE,
  EDITOR_LS_KEYS,
  EXPORT_DATA_TYPES,
  MIME_TYPES,
  VERSIONS,
  chunk,
  getExportSource,
} from "@excalidraw/common";

import { CanvasError } from "../errors.ts";
import { exportToCanvas, exportToSvg } from "../export.ts";
import { useDiagramUI } from "./context.tsx";
import { edge, fg, gap, layout, rounded, space, type } from "@barqjs/arc/style";

import { diagramLayer as d } from "./layer.ts";
import { fitted, grid, iconButton, scrolls } from "./styles.ts";

import type { ExportedLibraryData } from "../data/types.ts";
import type { DiagramEditor } from "../editor/editor.ts";
import type { TranslationKey } from "../i18n.ts";
import type { LibraryItem, LibraryItems } from "../types.ts";

interface PublishLibraryData {
  authorName: string;
  githubHandle: string;
  name: string;
  description: string;
  twitterHandle: string;
  website: string;
}

const EMPTY: PublishLibraryData = {
  authorName: "",
  githubHandle: "",
  name: "",
  description: "",
  twitterHandle: "",
  website: "",
};

/** The pages the publish dialog's notes point at: Excalidraw's public library and its rules. */
const NOTE_LINKS = {
  noteDescription: "https://libraries.excalidraw.com",
  noteGuidelines: "https://github.com/excalidraw/excalidraw-libraries#guidelines",
  noteLicense: "https://github.com/excalidraw/excalidraw-libraries/blob/main/LICENSE",
} as const;

const content = d(layout.fill, { maxWidth: "min(720px, calc(100vw - 2rem))" });

const scroll = d(layout.column, gap[3], scrolls, { maxHeight: "min(70vh, 640px)" });

const note = d(layout.flush, type.sm);

const itemsGrid = d(grid, gap[3], { gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" });

const card = d(layout.relative, layout.column, gap[1.5], rounded.md, edge.all, {
  padding: space.x2,
  "& [data-remove]": { position: "absolute", top: "2px", insetInlineEnd: "2px" },
});

const cardPreview = d(layout.centre, fitted, { height: "96px" });

const field = d(layout.column, gap[1], type.sm);

const error = d(fg.danger, type.xs);

/** A note with its `<link>…</link>` part as a link. */
function Note(props: { text: string; href?: string }) {
  const parts = () => /^(.*)<link>(.*)<\/link>(.*)$/s.exec(props.text);
  return (
    <p class={note}>
      <Show when={props.href && parts()} fallback={props.text.replace(/<\/?link>/g, "")}>
        {(match: () => RegExpExecArray | "" | null | undefined) => (
          <>
            {(match() || [])[1]}
            <a href={props.href} target="_blank" rel="noopener noreferrer">
              {(match() || [])[2]}
            </a>
            {(match() || [])[3]}
          </>
        )}
      </Show>
    </p>
  );
}

const readStoredData = (): PublishLibraryData => {
  try {
    const stored = localStorage.getItem(EDITOR_LS_KEYS.PUBLISH_LIBRARY);
    return stored ? { ...EMPTY, ...(JSON.parse(stored) as Partial<PublishLibraryData>) } : EMPTY;
  } catch {
    return EMPTY;
  }
};

const storeData = (data: PublishLibraryData | null): void => {
  try {
    if (data) localStorage.setItem(EDITOR_LS_KEYS.PUBLISH_LIBRARY, JSON.stringify(data));
    else localStorage.removeItem(EDITOR_LS_KEYS.PUBLISH_LIBRARY);
  } catch {}
};

/** The items side by side on white, Excalidraw's preview of a library it publishes. */
const PREVIEW_MAX_SIDE = 5000;
const PREVIEW_JPEG_QUALITY = 0.8;

const generatePreviewImage = async (
  libraryItems: LibraryItems,
  document: Document,
): Promise<Blob> => {
  const MAX_ITEMS_PER_ROW = 6;
  const BOX_SIZE = 128;
  const BOX_PADDING = Math.round(BOX_SIZE / 16);
  const BORDER_WIDTH = Math.max(Math.round(BOX_SIZE / 64), 2);
  const rows = chunk(libraryItems, MAX_ITEMS_PER_ROW);
  const canvas = document.createElement("canvas");
  const columns = rows[0]?.length ?? 1;
  canvas.width = columns * BOX_SIZE + (columns + 1) * (BOX_PADDING * 2) - BOX_PADDING * 2;
  canvas.height = rows.length * BOX_SIZE + (rows.length + 1) * (BOX_PADDING * 2) - BOX_PADDING * 2;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D context for the library preview");
  context.fillStyle = COLOR_WHITE;
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (const [index, item] of libraryItems.entries()) {
    const itemCanvas = await exportToCanvas({
      elements: item.elements,
      files: null,
      maxWidthOrHeight: BOX_SIZE,
    });
    const rowOffset = Math.floor(index / MAX_ITEMS_PER_ROW) * (BOX_SIZE + BOX_PADDING * 2);
    const colOffset = (index % MAX_ITEMS_PER_ROW) * (BOX_SIZE + BOX_PADDING * 2);
    context.drawImage(
      itemCanvas,
      colOffset + (BOX_SIZE - itemCanvas.width) / 2 + BOX_PADDING,
      rowOffset + (BOX_SIZE - itemCanvas.height) / 2 + BOX_PADDING,
    );
    context.lineWidth = BORDER_WIDTH;
    context.strokeStyle = "#ced4da";
    context.strokeRect(
      colOffset + BOX_PADDING / 2,
      rowOffset + BOX_PADDING / 2,
      BOX_SIZE + BOX_PADDING,
      BOX_SIZE + BOX_PADDING,
    );
  }
  const scale = Math.min(1, PREVIEW_MAX_SIDE / Math.max(canvas.width, canvas.height));
  let output = canvas;
  if (scale < 1) {
    output = document.createElement("canvas");
    output.width = Math.round(canvas.width * scale);
    output.height = Math.round(canvas.height * scale);
    output.getContext("2d")?.drawImage(canvas, 0, 0, output.width, output.height);
  }
  return new Promise((resolve, reject) => {
    output.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new CanvasError("Error: Canvas too big", "CANVAS_POSSIBLY_TOO_BIG")),
      MIME_TYPES.jpg,
      PREVIEW_JPEG_QUALITY,
    );
  });
};

/**
 * Excalidraw's publish dialog: names for the selected items and the
 * library's details, sent as Excalidraw's form to the app's
 * `libraryPublishEndpoint`, which answers with the library's `url`.
 */
export function PublishLibraryDialog(props: {
  editor: DiagramEditor;
  items: LibraryItems;
  onClose: () => void;
  onRemove: (id: string) => void;
  onPublished: (ids: readonly string[]) => void;
}) {
  const ui = useDiagramUI();
  const t = ui.t;
  const [data, setData] = createSignal<PublishLibraryData>(readStoredData());
  const [names, setNames] = createSignal<Record<string, string>>(
    Object.fromEntries(props.items.map((item) => [item.id, item.name ?? ""])),
  );
  const [errors, setErrors] = createSignal<Record<string, boolean>>({});
  const [submitting, setSubmitting] = createSignal(false);
  const [success, setSuccess] = createSignal<{ url: string; authorName: string } | null>(null);
  const [failure, setFailure] = createSignal<string | null>(null);

  const named = (): LibraryItem[] =>
    props.items.map((item) => ({ ...item, name: names()[item.id] ?? item.name }));

  const saveNames = (): void => {
    const byId = new Map(named().map((item) => [item.id, item.name]));
    void props.editor.library.setLibrary((current) =>
      current.map((item) => (byId.has(item.id) ? { ...item, name: byId.get(item.id) } : item)),
    );
  };

  const close = (): void => {
    saveNames();
    storeData(data());
    props.onClose();
  };

  const update = (key: keyof PublishLibraryData) => (event: Event) =>
    setData({ ...data(), [key]: (event.currentTarget as HTMLInputElement).value });

  const submit = async (event: Event): Promise<void> => {
    event.preventDefault();
    const endpoint = ui.host().libraryPublishEndpoint;
    if (!endpoint) return;
    const items = named();
    const missing = Object.fromEntries(items.map((item) => [item.id, !item.name?.trim()]));
    setErrors(missing);
    if (Object.values(missing).some(Boolean)) return;
    setSubmitting(true);
    setFailure(null);
    try {
      const previewImage = await generatePreviewImage(items, props.editor.ownerDocument);
      const libContent: ExportedLibraryData = {
        type: EXPORT_DATA_TYPES.excalidrawLibrary,
        version: VERSIONS.excalidrawLibrary,
        source: getExportSource(),
        libraryItems: items,
      };
      const formData = new FormData();
      const details = data();
      formData.append(
        "excalidrawLib",
        new Blob([JSON.stringify(libContent, null, 2)], { type: "application/json" }),
      );
      formData.append("previewImage", previewImage);
      formData.append("previewImageType", previewImage.type);
      formData.append("title", details.name);
      formData.append("authorName", details.authorName);
      formData.append("githubHandle", details.githubHandle);
      formData.append("name", details.name);
      formData.append("description", details.description);
      formData.append("twitterHandle", details.twitterHandle);
      formData.append("website", details.website);
      const response = await props.editor.ownerWindow.fetch(endpoint, {
        method: "post",
        body: formData,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message || response.statusText || "something went wrong");
      }
      const { url } = (await response.json()) as { url: string };
      storeData(null);
      saveNames();
      setSuccess({ url, authorName: details.authorName });
      props.onPublished(items.map((item) => item.id));
    } catch (caught) {
      console.error(caught);
      setFailure(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSubmitting(false);
    }
  };

  const fieldOf = (
    label: TranslationKey,
    key: keyof PublishLibraryData,
    placeholder: TranslationKey,
    required = false,
  ) => (
    <label class={field}>
      <span>
        {t(label)}
        <Show when={required}>
          <span aria-hidden="true"> *</span>
        </Show>
      </span>
      <Input
        name={key}
        value={data()[key]}
        required={required}
        placeholder={t(placeholder)}
        onInput={update(key)}
      />
    </label>
  );

  return (
    <>
      <Dialog
        isOpen={success() === null}
        onOpenChange={(isOpen: boolean) => {
          if (!isOpen) close();
        }}
      >
        <DialogContent
          class={content}
          closeLabel={t("buttons.close")}
          data-testid="publish-library"
        >
          <DialogHeader>
            <DialogTitle>{t("publishDialog.title")}</DialogTitle>
            <DialogDescription>{t("publishDialog.noteItems")}</DialogDescription>
          </DialogHeader>
          <Show
            when={props.items.length > 0}
            fallback={<p class={note}>{t("publishDialog.atleastOneLibItem")}</p>}
          >
            <form onSubmit={(event: Event) => void submit(event)}>
              <div class={scroll}>
                <Note text={t("publishDialog.noteDescription")} href={NOTE_LINKS.noteDescription} />
                <Note text={t("publishDialog.noteGuidelines")} href={NOTE_LINKS.noteGuidelines} />
                <Show when={props.items.some((item) => item.status === "published")}>
                  <p class={note}>{t("publishDialog.republishWarning")}</p>
                </Show>
                <div class={itemsGrid}>
                  <For each={props.items} keyed={(item) => item.id}>
                    {(item) => (
                      <div class={card}>
                        <Show when={item().status === "published"}>
                          <span class={note}>{t("labels.statusPublished")}</span>
                        </Show>
                        <div
                          class={cardPreview}
                          ref={(host: HTMLDivElement) => {
                            void exportToSvg({
                              elements: item().elements,
                              files: null,
                              skipInliningFonts: true,
                            }).then((svg) => {
                              svg.setAttribute("aria-hidden", "true");
                              host.replaceChildren(svg);
                            });
                          }}
                        />
                        <button
                          type="button"
                          class={iconButton}
                          data-remove=""
                          aria-label={t("buttons.remove")}
                          title={t("buttons.remove")}
                          onClick={() => props.onRemove(item().id)}
                        >
                          <X aria-hidden="true" />
                        </button>
                        <label class={field}>
                          <span>
                            {t("publishDialog.itemName")}
                            <span aria-hidden="true"> *</span>
                          </span>
                          <Input
                            value={names()[item().id] ?? ""}
                            aria-invalid={errors()[item().id] === true}
                            onInput={(event: Event) =>
                              setNames({
                                ...names(),
                                [item().id]: (event.currentTarget as HTMLInputElement).value,
                              })
                            }
                            data-testid="publish-item-name"
                          />
                          <Show when={errors()[item().id]}>
                            <span class={error}>{t("publishDialog.errors.required")}</span>
                          </Show>
                        </label>
                      </div>
                    )}
                  </For>
                </div>
                {fieldOf(
                  "publishDialog.libraryName",
                  "name",
                  "publishDialog.placeholder.libraryName",
                  true,
                )}
                <label class={field}>
                  <span>
                    {t("publishDialog.libraryDesc")}
                    <span aria-hidden="true"> *</span>
                  </span>
                  <Textarea
                    name="description"
                    rows={4}
                    required
                    value={data().description}
                    placeholder={t("publishDialog.placeholder.libraryDesc")}
                    onInput={update("description")}
                  />
                </label>
                {fieldOf(
                  "publishDialog.authorName",
                  "authorName",
                  "publishDialog.placeholder.authorName",
                  true,
                )}
                {fieldOf(
                  "publishDialog.githubUsername",
                  "githubHandle",
                  "publishDialog.placeholder.githubHandle",
                )}
                {fieldOf(
                  "publishDialog.twitterUsername",
                  "twitterHandle",
                  "publishDialog.placeholder.twitterHandle",
                )}
                {fieldOf("publishDialog.website", "website", "publishDialog.placeholder.website")}
                <Note text={t("publishDialog.noteLicense")} href={NOTE_LINKS.noteLicense} />
                <Show when={failure()}>
                  <p class={error} role="alert">
                    {failure()}
                  </p>
                </Show>
              </div>
              <DialogFooter>
                <Button variant="secondary" type="button" onPress={close}>
                  {t("buttons.saveLibNames")}
                </Button>
                <Button type="submit" isDisabled={submitting()} data-testid="publish-submit">
                  {t("buttons.submit")}
                </Button>
              </DialogFooter>
            </form>
          </Show>
        </DialogContent>
      </Dialog>
      <Dialog
        isOpen={success() !== null}
        onOpenChange={(isOpen: boolean) => {
          if (!isOpen) props.onClose();
        }}
      >
        <DialogContent closeLabel={t("buttons.close")} data-testid="publish-library-success">
          <DialogHeader>
            <DialogTitle>{t("publishSuccessDialog.title")}</DialogTitle>
          </DialogHeader>
          <Note
            text={t("publishSuccessDialog.content", { authorName: success()?.authorName ?? "" })}
            href={success()?.url}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
