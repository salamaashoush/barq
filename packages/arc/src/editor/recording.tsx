import { For, Show, createSignal, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useLocale } from "@barqjs/aria/i18n";
import { useLexicalEditor } from "@barqjs/lexical";
import { Captions } from "@barqjs/lucide/icons/captions";
import { Flag } from "@barqjs/lucide/icons/flag";
import { Film } from "@barqjs/lucide/icons/film";
import { Mic } from "@barqjs/lucide/icons/mic";
import { Video } from "@barqjs/lucide/icons/video";
import { Timer } from "@barqjs/lucide/icons/timer";
import { X } from "@barqjs/lucide/icons/x";
import { Button } from "@barqjs/ui/button";
import { Input } from "@barqjs/ui/input";
import type { JSX } from "@barqjs/web";
import { DRAG_DROP_PASTE } from "@lexical/rich-text";
import {
  COMMAND_PRIORITY_LOW,
  type ElementFormatType,
  type LexicalCommand,
  type LexicalEditor,
  type LexicalNode,
  createCommand,
} from "lexical";

import { ClipRecorder, type RecordedClip } from "../components/clip-recorder.tsx";
import { IconButton } from "../components/icon-button.tsx";
import {
  type MediaChapter,
  type MediaPlayerProps,
  MediaPlayer,
  type MediaTrack,
} from "../components/media-player.tsx";
import { useArcMessages } from "../components/messages.ts";
import { ResponsiveOverlay } from "../components/responsive-overlay.tsx";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { edge, fg, gap, layout, place, plainList, rounded, type } from "../style/index.ts";
import { blockOptions } from "./block-options.ts";
import {
  $isBlockNode,
  type Block,
  type BlockProps,
  type BlockRead,
  defineBlock,
  storedBlockData,
} from "./blocks.tsx";
import { $insertBlock } from "./commands.ts";
import { type EditorExtension, defineEditorExtension } from "./extension.ts";
import { CaptionPopover, pickFiles } from "./file-block.tsx";
import { ownInput, useRegistration } from "./hooks.ts";
import {
  type MediaAddressed,
  editorUploads,
  mediaAddress,
  useEditorMedia,
  useEditorUploads,
} from "./media.tsx";
import {
  type ImageSize,
  IMAGE_SIZES,
  alignmentOf,
  attributesOf,
  pictureStyles,
  sizeAndAlignment,
} from "./picture.tsx";
import { type CaptionDrafts, TextTracksEditor, type TextTrack } from "./text-tracks.tsx";
import { mediaClock, parseDescriptions } from "./vtt.ts";

/**
 * A moment marked on a recording while it plays, named for what starts
 * there: the named ones are the recording's chapters, each running to the
 * next.
 */
export interface Marker {
  /** Whole seconds from the start. */
  at: number;
  title: string;
}

export const MAX_MARKERS = 50;
export const MAX_MARKER_TITLE = 100;
/** The latest second a marker may stand at, a day into a recording. */
const MAX_MARKER_SECOND = 86_399;

function byTime(markers: readonly Marker[]): Marker[] {
  return markers.toSorted((a, b) => a.at - b.at);
}

/** The markers with one more at a second, unnamed, unless one stands there already or there are all there may be. */
export function markedAt(markers: readonly Marker[], at: number): Marker[] {
  if (markers.length >= MAX_MARKERS || markers.some((each) => each.at === at)) return [...markers];
  return byTime([...markers, { at, title: "" }]);
}

/** A recording's chapters as its readers meet them: its named markers, in time order, a moment once. */
export function chaptersOf(markers: readonly Marker[] | undefined): MediaChapter[] {
  const seen = new Set<number>();
  return byTime(markers ?? []).flatMap((marker) => {
    const title = marker.title.trim();
    if (title === "" || seen.has(marker.at)) return [];
    seen.add(marker.at);
    return [{ start: marker.at, title }];
  });
}

const CLOCK = /^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/;

/** A moment written as a player's clock shows it (`1:30`, `1:02:05`), in any script's digits, as seconds. */
export function clockSeconds(text: string): number | null {
  const western = text.replaceAll(/\p{Nd}/gu, (digit) => {
    const code = digit.codePointAt(0) ?? 0;
    for (const zero of [0x0660, 0x06f0, 0x0966, 0x09e6]) {
      if (code >= zero && code <= zero + 9) return String(code - zero);
    }
    return digit;
  });
  const match = CLOCK.exec(western.trim());
  if (match === null) return null;
  const [, hours, minutes = "0", seconds = "0"] = match;
  if (Number(seconds) > 59 || (hours !== undefined && Number(minutes) > 59)) return null;
  const at = Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds);
  return at <= MAX_MARKER_SECOND ? at : null;
}

export interface RecordingData extends MediaAddressed {
  /** The file's media type: a `video/` one draws a video, any other a sound. */
  mime: string;
  caption: string;
  size: ImageSize;
  /** The captions' WebVTT file, kept by the app. */
  captionsFileId?: string;
  /** The captions' WebVTT file, by its address. */
  captionsSrc?: string;
  /** The captions' language, as BCP 47. */
  captionsLang?: string;
  /** Everything the recording says, written out. */
  transcript?: string;
  /** Moments marked while it played, its chapters once named. */
  markers?: Marker[];
  /** A video's audio description, a time and what is seen a line: `1:30 A map of the river`. */
  descriptions?: string;
  /** Its length in seconds, as its player measured it. */
  duration?: number;
  /** While the file is on its way: the upload queue's id for it. */
  uploadId?: string;
}

export const recordingStyles = variants({
  slots: {
    root: arc(layout.column, gap[2]),
    caption: arc(type.caption, fg.muted, { textAlign: "center" }),
    transcript: arc(edge.all, rounded.md, type.body, {
      paddingInline: "0.75rem",
      paddingBlock: "0.5rem",
    }),
    transcriptText: arc(type.written, layout.flush, { marginBlockStart: "0.5rem" }),
    actions: arc(layout.row, layout.wrap, gap[1]),
    markers: arc(layout.column, gap[1.5], edge.all, rounded.lg, place.padded),
    markersHead: arc(layout.row, layout.between, layout.wrap, gap[2], type.label),
    markerList: arc(plainList, layout.column, gap[1]),
    marker: arc(layout.row, gap[1.5]),
    clock: arc(type.numeric, { width: "5rem", flexShrink: "0", textAlign: "center" }),
    name: arc(layout.grow, layout.minZero),
    hint: arc(type.caption, fg.muted),
  },
});

type RecordingSlots = ReturnType<typeof recordingStyles>;

/** A recording's look: a class on each and a class per part, in the editor and the renderer. */
export type RecordingOptions = Customisable<RecordingSlots> & RecordingServices;

/** What an app lends recordings: a service that drafts captions from speech. */
export interface RecordingServices {
  /** Drafts of a recording's captions, by its address; none where the app has no such service. */
  drafts?: (recording: RecordingData) => CaptionDrafts | undefined;
}

const looks = blockOptions<RecordingOptions>();

function isVideo(data: RecordingData): boolean {
  return data.mime.toLowerCase().startsWith("video/");
}

interface MarkerListProps {
  markers: readonly Marker[];
  onChange: (markers: Marker[]) => void;
  /** The second the player stands at, where a new marker goes. */
  now: () => number;
  classes: RecordingSlots;
}

/**
 * A recording's markers as they are set while it plays: one is added where
 * the player stands, and each is named, moved to another moment by its
 * clock or to the moment the player shows, or removed, in the order the
 * recording reaches them.
 */
export function MarkerList(props: MarkerListProps) {
  const messages = useArcMessages();
  function change(index: number, next: Partial<Marker>): void {
    props.onChange(
      props.markers.map((one, other) => (other === index ? { ...one, ...next } : one)),
    );
  }
  // A moment holds one marker, so a move onto another's is not made.
  function move(index: number, second: number): void {
    if (props.markers.some((one) => one.at === second)) return;
    props.onChange(
      byTime(props.markers.map((one, other) => (other === index ? { ...one, at: second } : one))),
    );
  }
  return (
    <div class={props.classes.markers} data-slot="recording-markers">
      <div class={props.classes.markersHead}>
        <span>{messages().markers}</span>
        <Button
          variant="ghost"
          size="sm"
          isDisabled={props.markers.length >= MAX_MARKERS}
          onPress={() => props.onChange(markedAt(props.markers, props.now()))}
        >
          <Flag aria-hidden="true" />
          {messages().addMarker}
        </Button>
      </div>
      <Show
        when={props.markers.length > 0}
        fallback={<p class={props.classes.hint}>{messages().markersNone}</p>}
      >
        <ol class={props.classes.markerList}>
          <For each={props.markers} keyed={(marker: Marker) => marker.at}>
            {(marker: () => Marker, index: () => number) => (
              <li class={props.classes.marker} data-slot="recording-marker">
                <ClockField
                  at={marker().at}
                  label={messages().markerTime(mediaClock(marker().at))}
                  class={props.classes.clock}
                  onChange={(second: number) => move(index(), second)}
                />
                <Input
                  class={props.classes.name}
                  aria-label={messages().markerName(mediaClock(marker().at))}
                  placeholder={messages().markerNamePlaceholder}
                  dir="auto"
                  maxLength={MAX_MARKER_TITLE}
                  value={marker().title}
                  ref={ownInput((field) => change(index(), { title: field.value }))}
                />
                <IconButton
                  label={messages().markerToNow}
                  size="sm"
                  variant="ghost"
                  onPress={() => move(index(), props.now())}
                >
                  <Timer aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={messages().removeMarker(mediaClock(marker().at))}
                  size="sm"
                  variant="ghost"
                  onPress={() =>
                    props.onChange(props.markers.filter((_, other) => other !== index()))
                  }
                >
                  <X aria-hidden="true" />
                </IconButton>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </div>
  );
}

interface ClockFieldProps {
  at: number;
  label: string;
  class: string;
  onChange: (second: number) => void;
}

/** A marker's moment as a player's clock writes it, taken once it is left; what it cannot read goes back. */
function ClockField(props: ClockFieldProps) {
  const [text, setText] = createSignal(mediaClock(untrack(() => props.at)), { ownedWrite: true });
  return (
    <Input
      class={props.class}
      aria-label={props.label}
      dir="ltr"
      inputMode="numeric"
      value={text()}
      ref={ownInput((field) => setText(field.value))}
      onBlur={(event: FocusEvent) => {
        const second = clockSeconds((event.currentTarget as HTMLInputElement).value);
        setText(mediaClock(props.at));
        if (second !== null && second !== props.at) props.onChange(second);
      }}
    />
  );
}

export interface RecordingFigureProps {
  data: RecordingData;
  format: ElementFormatType;
  options: RecordingOptions | undefined;
  editable: boolean;
  /** Told the player's time as it plays: where a marker goes. */
  onTimeUpdate?: MediaPlayerProps["onTimeUpdate"];
  /** Under the player while it is edited. */
  children?: JSX.Element;
}

/**
 * A recording as a document shows it, on arc's `MediaPlayer`: its captions,
 * its chapters from the named markers, its audio description read aloud,
 * and its transcript under it.
 */
export function RecordingFigure(props: RecordingFigureProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  const media = useEditorMedia();
  function c(): RecordingSlots {
    return parts(recordingStyles(), props.options?.classes);
  }
  function figure(): string {
    return pictureStyles({ size: props.data.size, align: alignmentOf(props.format) }).figure;
  }
  function tracks(): MediaTrack[] {
    const src = mediaAddress(
      { src: props.data.captionsSrc, fileId: props.data.captionsFileId },
      media().fileUrl,
    );
    if (src === "") return [];
    const language = props.data.captionsLang ?? locale().locale;
    const name = new Intl.DisplayNames([locale().locale], { type: "language" }).of(language);
    return [{ src, srclang: language, label: name ?? language, kind: "captions" }];
  }
  function title(): string {
    if (props.data.caption !== "") return props.data.caption;
    return isVideo(props.data) ? messages().video : messages().audio;
  }
  return (
    <figure
      class={arc(figure(), c().root, props.options?.class, props.options?.className)}
      data-slot="editor-recording"
      data-kind={isVideo(props.data) ? "video" : "audio"}
      data-size={props.data.size}
      data-align={alignmentOf(props.format)}
    >
      <MediaPlayer
        kind={isVideo(props.data) ? "video" : "audio"}
        title={title()}
        src={mediaAddress(props.data, media().fileUrl)}
        tracks={tracks()}
        chapters={chaptersOf(props.data.markers)}
        descriptions={
          isVideo(props.data) ? parseDescriptions(props.data.descriptions ?? "") : undefined
        }
        onTimeUpdate={props.onTimeUpdate}
      />
      <Show when={props.data.caption !== ""}>
        <figcaption class={c().caption} dir="auto" data-slot="editor-recording-caption">
          {props.data.caption}
        </figcaption>
      </Show>
      <Show when={!props.editable && (props.data.transcript ?? "").trim() !== ""}>
        <details class={c().transcript} data-slot="editor-recording-transcript">
          <summary>{messages().transcript}</summary>
          <p class={c().transcriptText} dir="auto">
            {props.data.transcript}
          </p>
        </details>
      </Show>
      {props.children}
    </figure>
  );
}

interface TextTracksDialogProps {
  data: RecordingData;
  src: string;
  setData: BlockProps<RecordingData>["setData"];
  drafts: CaptionDrafts | undefined;
}

/** A recording's captions, audio description and transcript, written in a dialog beside it. */
function TextTracksDialog(props: TextTracksDialogProps) {
  const messages = useArcMessages();
  const editor = useLexicalEditor();
  const media = useEditorMedia();
  const [open, setOpen] = createSignal(false, { ownedWrite: true });
  const [tab, setTab] = createSignal<TextTrack>("captions", { ownedWrite: true });
  return (
    <ResponsiveOverlay
      heading={messages().textTracks}
      open={open()}
      onOpenChange={(next: boolean) => {
        if (next) setTab("captions");
        setOpen(next);
      }}
      trigger={
        <Button variant="ghost" size="sm">
          <Captions aria-hidden="true" />
          {messages().textTracks}
        </Button>
      }
    >
      <TextTracksEditor
        title={props.data.caption === "" ? messages().video : props.data.caption}
        src={props.src}
        kind={isVideo(props.data) ? "video" : "audio"}
        defaultTab={tab()}
        captions={{
          src:
            mediaAddress(
              { src: props.data.captionsSrc, fileId: props.data.captionsFileId },
              media().fileUrl,
            ) || undefined,
          language: props.data.captionsLang,
        }}
        onSaveCaptions={async (file: File, language: string) => {
          const uploads = editorUploads(editor);
          if (uploads === null) throw new Error(messages().captionsSaveFailed);
          const src = await uploads.send(file);
          props.setData({ captionsSrc: src, captionsFileId: undefined, captionsLang: language });
        }}
        descriptions={isVideo(props.data) ? (props.data.descriptions ?? "") : undefined}
        onDescriptionsChange={(text: string) =>
          props.setData({ descriptions: text === "" ? undefined : text })
        }
        transcript={props.data.transcript ?? ""}
        onTranscriptChange={(text: string) =>
          props.setData({ transcript: text === "" ? undefined : text })
        }
        drafts={props.drafts}
        onDone={() => setOpen(false)}
      />
    </ResponsiveOverlay>
  );
}

function RecordingView(props: BlockProps<RecordingData>) {
  const media = useEditorMedia();
  const inEditor = untrack(() => props.nodeKey) !== "";
  const editor = inEditor ? useLexicalEditor() : null;
  const uploads = inEditor ? useEditorUploads() : null;
  // Read when a marker is added, so a plain number rather than a signal.
  let now = 0;
  function options(): RecordingOptions | undefined {
    return editor === null ? undefined : looks.read(editor);
  }
  return (
    <RecordingFigure
      data={props.data}
      format={props.format}
      options={options()}
      editable={props.editable}
      onTimeUpdate={(seconds: number) => {
        now = seconds;
      }}
    >
      <Show when={props.editable && props.data.uploadId === undefined}>
        <div class={recordingStyles().actions} data-slot="editor-recording-actions">
          <Show when={uploads !== null}>
            <TextTracksDialog
              data={props.data}
              src={mediaAddress(props.data, media().fileUrl)}
              setData={props.setData}
              drafts={options()?.drafts?.(props.data)}
            />
          </Show>
          <CaptionPopover
            caption={props.data.caption}
            onSave={(caption: string) => props.setData({ caption })}
          />
        </div>
        <Show when={isVideo(props.data)}>
          <MarkerList
            markers={props.data.markers ?? []}
            now={() => Math.floor(now)}
            classes={parts(recordingStyles(), options()?.classes)}
            onChange={(markers: Marker[]) =>
              props.setData({ markers: markers.length === 0 ? undefined : markers })
            }
          />
        </Show>
      </Show>
    </RecordingFigure>
  );
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\n", "&#10;");
}

/** A recording as one line of HTML: a `<video>` or an `<audio>`, every field on it. */
export function recordingHtml(
  data: RecordingData,
  align: "start" | "center" | "end" = "center",
): string {
  const tag = isVideo(data) ? "video" : "audio";
  const attributes = ["data-media", `src="${escapeAttribute(data.src ?? "")}"`, "controls"];
  function add(name: string, value: string | number | undefined): void {
    if (value !== undefined && value !== "") {
      attributes.push(`${name}="${escapeAttribute(String(value))}"`);
    }
  }
  add("data-file-id", data.fileId);
  add("data-mime", data.mime);
  add("data-size", data.size === "full" ? undefined : data.size);
  add("data-align", align === "center" ? undefined : align);
  add("data-caption", data.caption);
  add("data-captions-src", data.captionsSrc);
  add("data-captions-file-id", data.captionsFileId);
  add("data-captions-lang", data.captionsLang);
  add("data-transcript", data.transcript);
  add("data-descriptions", data.descriptions);
  add("data-markers", data.markers === undefined ? undefined : JSON.stringify(data.markers));
  add("data-duration", data.duration);
  return `<${tag} ${attributes.join(" ")}></${tag}>`;
}

function markersOf(text: string | undefined): Marker[] | undefined {
  if (text === undefined || text === "") return undefined;
  try {
    const read = JSON.parse(text) as unknown;
    return Array.isArray(read) ? (read as Marker[]) : undefined;
  } catch {
    return undefined;
  }
}

function recordingFrom(
  tag: string,
  attributes: Readonly<Record<string, string>>,
): BlockRead<RecordingData> | null {
  const src = attributes.src ?? "";
  const fileId = attributes["data-file-id"];
  if (src === "" && fileId === undefined) return null;
  const align = attributes["data-align"];
  const markers = markersOf(attributes["data-markers"]);
  const duration = Number(attributes["data-duration"]);
  const optional: Partial<RecordingData> = {};
  for (const [field, attribute] of [
    ["captionsSrc", "data-captions-src"],
    ["captionsFileId", "data-captions-file-id"],
    ["captionsLang", "data-captions-lang"],
    ["transcript", "data-transcript"],
    ["descriptions", "data-descriptions"],
  ] as const) {
    const value = attributes[attribute];
    if (value !== undefined && value !== "") optional[field] = value;
  }
  return {
    ...(align === "start" || align === "end" ? { format: align } : {}),
    ...(src === "" ? {} : { src }),
    ...(fileId === undefined ? {} : { fileId }),
    mime: attributes["data-mime"] ?? attributes.type ?? `${tag}/*`,
    caption: attributes["data-caption"] ?? "",
    size: IMAGE_SIZES.find((one) => one === attributes["data-size"]) ?? "full",
    ...optional,
    ...(markers === undefined ? {} : { markers }),
    ...(duration > 0 ? { duration } : {}),
  };
}

function attributesOfElement(element: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const one of element.attributes) out[one.name] = one.value;
  // A recording that names its file in a `<source>` rather than on itself.
  const source = element.querySelector("source");
  if (out.src === undefined && source !== null) {
    out.src = source.getAttribute("src") ?? "";
    if (source.getAttribute("type") !== null) out.type = source.getAttribute("type") ?? "";
  }
  return out;
}

const RECORDING_LINE = /^<(video|audio) data-media(\s[^>]*)?><\/\1>\s?$/;

/** A video or a sound in the document, on arc's `MediaPlayer`. */
export const RecordingBlock: Block<RecordingData> = defineBlock<RecordingData>({
  type: "media",
  label: (messages) => messages.recording,
  group: (messages) => messages.mediaBlocks,
  icon: () => <Film />,
  keywords: ["video", "audio", "sound", "recording", "captions"],
  defaultData: () => ({ mime: "", caption: "", size: "full" }),
  component: RecordingView,
  insertable: false,
  toMarkdown: (data, format) =>
    data.uploadId === undefined ? recordingHtml(data, alignmentOf(format)) : null,
  fromMarkdown: {
    regExp: RECORDING_LINE,
    data: (match) => recordingFrom(match[1] ?? "video", attributesOf(match[2] ?? "")),
  },
  fromHtml: {
    video: (element) => recordingFrom("video", attributesOfElement(element)),
    audio: (element) => recordingFrom("audio", attributesOfElement(element)),
  },
  toHtml: (data, format) => {
    const template = document.createElement("template");
    template.innerHTML = recordingHtml(data, alignmentOf(format));
    return template.content.firstElementChild as HTMLElement;
  },
});

/** Whether a node is a recording. */
export function $isRecordingNode(node: LexicalNode | null | undefined): boolean {
  return $isBlockNode(node) && node.getType() === "media";
}

/** Recordings, each a block where the caret is, sent up the editor's queue. */
export function insertRecordings(editor: LexicalEditor, files: readonly File[]): void {
  const uploads = editorUploads(editor);
  const recordings = files.filter((file) => /^(audio|video)\//.test(file.type));
  if (uploads === null || recordings.length === 0) return;
  const items = uploads.queue.add(recordings);
  editor.update(() => {
    for (const item of items) {
      $insertBlock(
        RecordingBlock.$create({
          mime: item.file.type,
          caption: "",
          size: "full",
          uploadId: item.id,
        }),
      );
    }
  });
}

function RecordingDrop() {
  const editor = useLexicalEditor();
  useRegistration(() =>
    editor.registerCommand(
      DRAG_DROP_PASTE,
      (files) => {
        const recordings = files.filter((file) => /^(audio|video)\//.test(file.type));
        if (recordings.length === 0 || editorUploads(editor) === null) return false;
        insertRecordings(editor, recordings);
        return recordings.length === files.length;
      },
      COMMAND_PRIORITY_LOW,
    ),
  );
  return null;
}

/** What is recorded in the page: a sound, or a video from the camera. */
export type RecordingKind = "audio" | "video";

/** Opens the recorder for a kind of recording. */
export const OPEN_RECORDER_COMMAND: LexicalCommand<RecordingKind> = createCommand("OPEN_RECORDER");

/** A clip recorded in the page, sent up the editor's queue as a recording where the caret is. */
export function takeRecording(editor: LexicalEditor, clip: RecordedClip): void {
  const extension = clip.mimeType.includes("mp4")
    ? "mp4"
    : clip.mimeType.includes("ogg")
      ? "ogg"
      : "webm";
  const kind = clip.mimeType.startsWith("audio/") ? "audio" : "video";
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
  const file = new File([clip.blob], `${kind}-${stamp}.${extension}`, {
    type: clip.mimeType.split(";")[0] ?? clip.mimeType,
  });
  insertRecordings(editor, [file]);
}

function RecorderHost() {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  const [kind, setKind] = createSignal<RecordingKind | null>(null, { ownedWrite: true });
  useRegistration(() =>
    editor.registerCommand(
      OPEN_RECORDER_COMMAND,
      (asked) => {
        setKind(asked);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    ),
  );
  return (
    <ResponsiveOverlay
      heading={kind() === "video" ? messages().recordVideo : messages().recordAudio}
      open={kind() !== null}
      onOpenChange={(open: boolean) => {
        if (!open) setKind(null);
      }}
    >
      <Show when={kind()}>
        {(chosen: () => RecordingKind) => (
          <ClipRecorder
            kind={chosen()}
            onAttach={(clip: RecordedClip) => {
              takeRecording(editor, clip);
              setKind(null);
            }}
          />
        )}
      </Show>
    </ResponsiveOverlay>
  );
}

/**
 * Video and sound: offered, dropped and pasted where the editor uploads, and
 * played on arc's `MediaPlayer` with their captions, chapters from markers
 * set at the player's time, an audio description read aloud and a
 * transcript, each written beside the recording in `TextTracksEditor`. Its
 * look takes `class` and `classes`, and `drafts` lends a service that drafts
 * captions from speech.
 */
export function recordingExtension(options: RecordingOptions = {}): EditorExtension {
  return defineEditorExtension({
    name: "arc/recording",
    dependencies: [RecordingBlock],
    register: (editor) => looks.provide(editor, options),
    commands: [
      {
        id: "recording",
        label: (messages) => messages.recording,
        group: (messages) => messages.mediaBlocks,
        icon: () => <Film />,
        keywords: RecordingBlock.keywords,
        available: (editor) => editorUploads(editor) !== null,
        run: (editor) =>
          void pickFiles("audio/*,video/*", true).then((files) => insertRecordings(editor, files)),
      },
      {
        id: "record-audio",
        label: (messages) => messages.recordAudio,
        group: (messages) => messages.mediaBlocks,
        icon: () => <Mic />,
        keywords: ["record", "voice", "sound", "microphone"],
        available: (editor) => editorUploads(editor) !== null,
        run: (editor) => editor.dispatchCommand(OPEN_RECORDER_COMMAND, "audio"),
      },
      {
        id: "record-video",
        label: (messages) => messages.recordVideo,
        group: (messages) => messages.mediaBlocks,
        icon: () => <Video />,
        keywords: ["record", "camera", "webcam"],
        available: (editor) => editorUploads(editor) !== null,
        run: (editor) => editor.dispatchCommand(OPEN_RECORDER_COMMAND, "video"),
      },
    ],
    blockMenu: sizeAndAlignment($isRecordingNode),
    render: {
      media: (node, scope) => (
        <RecordingFigure
          data={storedBlockData<RecordingData>(RecordingBlock, node)}
          format={(typeof node.format === "string" ? node.format : "") as ElementFormatType}
          options={options}
          editable={scope.editing}
        />
      ),
    },
    plugins: [RecordingDrop, RecorderHost],
  });
}
