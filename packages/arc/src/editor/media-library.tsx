import { For, Show, createSignal, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { announce } from "@barqjs/aria/live";
import { useLexicalEditor } from "@barqjs/lexical";
import { FolderOpen } from "@barqjs/lucide/icons/folder-open";
import { ImageUp } from "@barqjs/lucide/icons/image-up";
import { Search } from "@barqjs/lucide/icons/search";
import { Button } from "@barqjs/ui/button";
import { Field, FieldLabel } from "@barqjs/ui/field";
import { Input } from "@barqjs/ui/input";
import {
  $createParagraphNode,
  $getEditor,
  $getNodeByKey,
  $isParagraphNode,
  type LexicalCommand,
  type LexicalEditor,
  type LexicalNode,
  createCommand,
} from "lexical";

import { useArcMessages } from "../components/messages.ts";
import { ResponsiveOverlay } from "../components/responsive-overlay.tsx";
import { arcLayer as arc } from "../layer.ts";
import {
  control,
  fg,
  focus,
  gap,
  layout,
  place,
  plainList,
  rounded,
  type,
} from "../style/index.ts";
import { $isBlockNode } from "./blocks.tsx";
import { $insertBlock } from "./commands.ts";
import { type EditorExtension, defineEditorExtension, editorMessages } from "./extension.ts";
import { FileBlock } from "./file-block.tsx";
import { useDialogCommand } from "./hooks.ts";
import {
  type EditorMedia,
  type MediaChoice,
  editorMedia,
  type OpenPicture,
  useEditorMedia,
} from "./media.tsx";
import { type ImageData, ImageBlock } from "./picture.tsx";
import { RecordingBlock } from "./recording.tsx";

function servicesOf(editor: LexicalEditor): EditorMedia {
  return editorMedia(editor);
}

/** A block for an item of the library, of the kind its type says. */
export function $blockForChoice(choice: MediaChoice): LexicalNode {
  const address = {
    ...(choice.src === undefined ? {} : { src: choice.src }),
    ...(choice.fileId === undefined ? {} : { fileId: choice.fileId }),
  };
  if (choice.mime.startsWith("image/")) {
    return ImageBlock.$create({
      ...address,
      alt: choice.alt ?? "",
      caption: choice.caption ?? "",
      size: "full",
      ...(choice.credit === undefined ? {} : { credit: choice.credit }),
    });
  }
  if (/^(audio|video)\//.test(choice.mime)) {
    return RecordingBlock.$create({
      ...address,
      mime: choice.mime,
      caption: choice.caption ?? "",
      size: "full",
    });
  }
  return FileBlock.$create({
    ...address,
    name: choice.name,
    mime: choice.mime,
    bytes: choice.bytes ?? 0,
  });
}

/** Opens the app's library and puts what is chosen where the caret is. */
export function chooseFromLibrary(editor: LexicalEditor): void {
  void servicesOf(editor)
    .library?.choose("file", true)
    .then((chosen) => {
      if (chosen === null || chosen.length === 0) return;
      editor.update(() => {
        for (const choice of chosen) $insertBlock($blockForChoice(choice));
      });
    });
}

/** Opens the picture search. */
export const OPEN_PICTURE_SEARCH_COMMAND: LexicalCommand<void> =
  createCommand("OPEN_PICTURE_SEARCH");

export const pictureSearchStyles = variants({
  slots: {
    form: arc(layout.row, gap[2], { alignItems: "end" }),
    results: arc(plainList, {
      display: "grid",
      gap: "0.5rem",
      gridTemplateColumns: "repeat(auto-fill, minmax(7rem, 1fr))",
    }),
    result: arc(control.bare, focus.visible, rounded.md, layout.column, gap[1], layout.clip),
    thumb: arc(rounded.md, place.block, layout.fill, { aspectRatio: "1", objectFit: "cover" }),
    label: arc(type.caption, fg.muted, { textAlign: "start" }),
    status: arc(type.caption, fg.muted),
  },
});

interface PictureSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Open pictures found by words and put where the caret is, their credit with them. */
export function PictureSearchDialog(props: PictureSearchDialogProps) {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  const media = useEditorMedia();
  const id = createUniqueId();
  const [query, setQuery] = createSignal("", { ownedWrite: true });
  const [found, setFound] = createSignal<readonly OpenPicture[] | null>(null, { ownedWrite: true });
  const [busy, setBusy] = createSignal(false, { ownedWrite: true });
  const s = pictureSearchStyles();
  function search(): void {
    const asked = query().trim();
    const service = media().pictures;
    if (asked === "" || service === undefined) return;
    setBusy(true);
    service.search(asked).then(
      (pictures) => {
        setFound(pictures);
        setBusy(false);
        announce(messages().picturesFound(pictures.length), "polite");
      },
      () => {
        setFound([]);
        setBusy(false);
      },
    );
  }
  async function take(picture: OpenPicture): Promise<void> {
    const service = media().pictures;
    const address = (await service?.take?.(picture)) ?? { src: picture.full };
    props.onOpenChange(false);
    editor.update(() => {
      $insertBlock(
        ImageBlock.$create({
          ...address,
          alt: picture.alt ?? picture.label,
          caption: "",
          size: "full",
          ...(picture.credit === undefined ? {} : { credit: picture.credit }),
        }),
      );
    });
  }
  return (
    <ResponsiveOverlay
      heading={messages().pictureSearch}
      open={props.open}
      onOpenChange={props.onOpenChange}
    >
      <form
        class={s.form}
        onSubmit={(event: SubmitEvent) => {
          event.preventDefault();
          search();
        }}
      >
        <Field class={layout.grow}>
          <FieldLabel for={id}>{messages().pictureSearchWords}</FieldLabel>
          <Input
            id={id}
            type="search"
            dir="auto"
            autoFocus
            value={query()}
            onInput={(event: Event) => setQuery((event.currentTarget as HTMLInputElement).value)}
          />
        </Field>
        <Button type="submit" isDisabled={busy()}>
          <Search aria-hidden="true" />
          {messages().search}
        </Button>
      </form>
      <Show when={found()}>
        {(pictures: () => readonly OpenPicture[]) => (
          <Show
            when={pictures().length > 0}
            fallback={<p class={s.status}>{messages().noPicturesFound}</p>}
          >
            <ul class={s.results} aria-label={messages().pictureSearch}>
              <For each={pictures()}>
                {(picture: OpenPicture) => (
                  <li>
                    <button type="button" class={s.result} onClick={() => void take(picture)}>
                      <img class={s.thumb} src={picture.thumb} alt={picture.alt ?? picture.label} />
                      <span class={s.label} dir="auto">
                        {picture.label}
                      </span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        )}
      </Show>
    </ResponsiveOverlay>
  );
}

/** A file on Wikimedia Commons or a Wikipedia: the wiki to ask about it, and its title. */
export interface CommonsFile {
  api: string;
  title: string;
}

const WIKIPEDIA = /^([a-z][a-z-]{1,15})(?:\.m)?\.wikipedia\.org$/u;
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

function fileTitle(name: string): string | null {
  try {
    return `File:${decodeURIComponent(name).replaceAll("_", " ")}`;
  } catch {
    return null;
  }
}

/**
 * The file a link points to: a Commons or Wikipedia file page, a picture
 * opened from an article (`#/media/File:…`), or the picture itself on
 * upload.wikimedia.org. `null` for anything else.
 */
export function commonsFile(input: string): CommonsFile | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\./u, "");
  if (host === "upload.wikimedia.org") {
    const path = url.pathname.split("/").filter((part) => part !== "");
    if (path[0] !== "wikipedia") return null;
    const name = path[2] === "thumb" ? path[5] : path[4];
    const title = name === undefined ? null : fileTitle(name);
    const wiki = path[1];
    if (title === null || wiki === undefined) return null;
    return {
      api: wiki === "commons" ? COMMONS_API : `https://${wiki}.wikipedia.org/w/api.php`,
      title,
    };
  }
  const wikipedia = WIKIPEDIA.exec(host)?.[1];
  if (
    host !== "commons.wikimedia.org" &&
    host !== "commons.m.wikimedia.org" &&
    wikipedia === undefined
  ) {
    return null;
  }
  const media = /^#\/media\/File:(.+)$/u.exec(url.hash)?.[1];
  const page = /^\/wiki\/File:(.+)$/u.exec(url.pathname)?.[1];
  const named = media ?? page;
  const title = named === undefined ? null : fileTitle(named);
  if (title === null) return null;
  return {
    api: wikipedia === undefined ? COMMONS_API : `https://${wikipedia}.wikipedia.org/w/api.php`,
    title,
  };
}

/** The address that asks a wiki for a file's picture at a size a document shows, and its credit. */
export function commonsInfoUrl(file: CommonsFile, language: string): string {
  const query = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    origin: "*",
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiurlwidth: "1600",
    iiextmetadatalanguage: language,
    iiextmetadatafilter: "ImageDescription|ObjectName|Artist|LicenseShortName|LicenseUrl",
    titles: file.title,
  });
  return `${file.api}?${query.toString()}`;
}

/** Wiki metadata, which is HTML, as plain words. */
function plain(html: string): string {
  const page = new DOMParser().parseFromString(html.replaceAll(/<br\s*\/?>/giu, " "), "text/html");
  return (page.body.textContent ?? "").replaceAll(/\s+/gu, " ").trim();
}

interface WikiValue {
  value?: unknown;
}

interface WikiMetadata {
  ImageDescription?: WikiValue;
  ObjectName?: WikiValue;
  Artist?: WikiValue;
  LicenseShortName?: WikiValue;
  LicenseUrl?: WikiValue;
}

interface WikiImageInfo {
  url?: string;
  thumburl?: string;
  descriptionurl?: string;
  extmetadata?: WikiMetadata;
}

interface WikiPage {
  missing?: boolean;
  imageinfo?: WikiImageInfo[];
}

interface WikiQuery {
  pages?: WikiPage[];
}

interface WikiAnswer {
  query?: WikiQuery;
}

function words(entry: WikiValue | undefined): string {
  return typeof entry?.value === "string" ? plain(entry.value) : "";
}

/** A picture and its credit from a wiki's answer about a file, or `null` where it has none. */
export function commonsPicture(answer: unknown): ImageData | null {
  const info = (answer as WikiAnswer | null)?.query?.pages?.[0]?.imageinfo?.[0];
  const src = info?.thumburl ?? info?.url;
  if (info === undefined || src === undefined) return null;
  const meta = info.extmetadata ?? {};
  const licence = words(meta.LicenseShortName);
  const licenceUrl = words(meta.LicenseUrl);
  const author = words(meta.Artist);
  return {
    src,
    alt: (words(meta.ImageDescription) || words(meta.ObjectName)).slice(0, 300),
    caption: "",
    size: "full",
    ...(author === "" && licence === ""
      ? {}
      : {
          credit: {
            author,
            licence,
            ...(licenceUrl.startsWith("https:") ? { licenceUrl } : {}),
            ...(info.descriptionurl?.startsWith("https:") === true
              ? { source: info.descriptionurl }
              : {}),
          },
        }),
  };
}

/** The picture a Commons or Wikipedia link names, fetched with its credit and put in place of `line`. */
async function bringCommons(editor: LexicalEditor, file: CommonsFile, line: string): Promise<void> {
  const messages = editorMessages(editor);
  try {
    const response = await fetch(commonsInfoUrl(file, document.documentElement.lang || "en"));
    const picture = commonsPicture(await response.json());
    if (picture === null) throw new Error("missing");
    editor.update(() => {
      const node = $getNodeByKey(line);
      const block = ImageBlock.$create(picture);
      if (node === null) $insertBlock(block);
      else node.replace(block);
      if (block.getNextSibling() === null) block.insertAfter($createParagraphNode());
    });
  } catch {
    announce(messages.commonsFailed, "assertive");
  }
}

function MediaServices() {
  const media = useEditorMedia();
  const [open, setOpen] = useDialogCommand(OPEN_PICTURE_SEARCH_COMMAND);
  return (
    <Show when={media().pictures !== undefined}>
      <PictureSearchDialog open={open()} onOpenChange={setOpen} />
    </Show>
  );
}

/**
 * The app's media library and picture search in the editor: Insert offers
 * the library (`EditorMedia.library.choose`) and a search of open pictures
 * (`EditorMedia.pictures`); a picture's block menu keeps it in the library
 * (`library.keep`); and a Wikimedia Commons or Wikipedia file link pasted on
 * an empty line becomes the picture, its author and licence its credit.
 */
export const mediaLibraryExtension: EditorExtension = defineEditorExtension({
  name: "arc/media-library",
  commands: [
    {
      id: "media-library",
      label: (messages) => messages.mediaLibrary,
      group: (messages) => messages.mediaBlocks,
      icon: () => <FolderOpen />,
      keywords: ["library", "media", "choose"],
      available: (editor) => servicesOf(editor).library !== undefined,
      run: chooseFromLibrary,
    },
    {
      id: "picture-search",
      label: (messages) => messages.pictureSearch,
      group: (messages) => messages.mediaBlocks,
      icon: () => <ImageUp />,
      keywords: ["search", "picture", "photo", "open"],
      available: (editor) => servicesOf(editor).pictures !== undefined,
      run: (editor) => editor.dispatchCommand(OPEN_PICTURE_SEARCH_COMMAND, undefined),
    },
  ],
  blockActions: [
    {
      id: "keep-in-library",
      $label: (block) =>
        $isBlockNode(block) &&
        block.getType() === "image" &&
        servicesOf($getEditor()).library?.keep !== undefined
          ? (messages) => messages.keepInLibrary
          : null,
      run: (editor, key) => {
        const keep = servicesOf(editor).library?.keep;
        if (keep === undefined) return;
        const data = editor.read(() => {
          const node = $getNodeByKey(key);
          return $isBlockNode(node) ? (node.getData() as ImageData) : null;
        });
        if (data === null) return;
        const messages = editorMessages(editor);
        keep(data).then(
          () => announce(messages.keptInLibrary, "polite"),
          () => announce(messages.keepInLibraryFailed, "assertive"),
        );
      },
    },
  ],
  paste: [
    {
      priority: 16,
      $paste: (data, selection, editor) => {
        const text = data.getData("text/plain").trim();
        const top = selection.anchor.getNode().getTopLevelElement();
        if (!$isParagraphNode(top) || top.getTextContentSize() !== 0 || /\s/.test(text))
          return false;
        const file = commonsFile(text);
        if (file === null) return false;
        void bringCommons(editor, file, top.getKey());
        return true;
      },
    },
  ],
  plugins: [MediaServices],
});
