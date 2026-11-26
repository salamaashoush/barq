import { For, Show, createSignal, createUniqueId, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useLexicalEditor } from "@barqjs/lexical";
import { ExternalLink } from "@barqjs/lucide/icons/external-link";
import { Play } from "@barqjs/lucide/icons/play";
import { SquarePlay } from "@barqjs/lucide/icons/square-play";
import { Button } from "@barqjs/ui/button";
import { Field, FieldError, FieldLabel } from "@barqjs/ui/field";
import { Input } from "@barqjs/ui/input";
import {
  $isParagraphNode,
  $createParagraphNode,
  type ElementFormatType,
  type LexicalNode,
} from "lexical";

import type { MediaChapter } from "../components/media-player.tsx";
import { useArcMessages } from "../components/messages.ts";
import { ResponsiveOverlay } from "../components/responsive-overlay.tsx";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  edge,
  fg,
  focus,
  gap,
  layout,
  place,
  plainList,
  rounded,
  type,
} from "../style/index.ts";
import { blockOptions } from "./block-options.ts";
import {
  $isBlockNode,
  type Block,
  type BlockProps,
  type BlockRead,
  defineBlock,
  storedBlockData,
} from "./blocks.tsx";
import { $insertBlock, OPEN_EMBED_DIALOG_COMMAND } from "./commands.ts";
import { type EditorExtension, defineEditorExtension } from "./extension.ts";
import { useDialogCommand } from "./hooks.ts";
import type { MediaDialogProps } from "./media-insert.tsx";
import {
  type ImageSize,
  IMAGE_SIZES,
  alignmentOf,
  attributesOf,
  pictureStyles,
  sizeAndAlignment,
} from "./picture.tsx";
import { CaptionPopover } from "./file-block.tsx";
import { type Marker, MarkerList, chaptersOf, recordingStyles } from "./recording.tsx";
import { mediaClock } from "./vtt.ts";

/**
 * A player in a frame that is told, by messages posted to it, to play from a
 * moment, and that tells where it is: what chapters need of a provider.
 */
export interface FramedPlayer {
  /** The frame's address with the player's messages on. */
  src: (embedId: string) => string;
  seek: (frame: HTMLIFrameElement, seconds: number) => void;
  /** Starts hearing the player's time; the function returned stops. */
  listen: (frame: HTMLIFrameElement, onTime: (seconds: number) => void) => () => void;
}

/** A site an editor embeds from: what it recognises in an address, and what it frames. */
export interface EmbedProvider {
  /** Stored as the embed's `provider`: `"youtube"`. */
  id: string;
  name: string;
  /** The id of what `url` shows, or `null` when it is not this provider's. */
  parse: (url: URL) => string | null;
  /** What the frame loads. */
  src: (embedId: string) => string;
  /** Where a reader opens it on the provider's own site. */
  page?: (embedId: string) => string;
  /** The frame's shape, as CSS writes a ratio. @default "16 / 9" */
  aspect?: (embedId: string) => string;
  /** Where the provider's player plays from a moment, for chapters. */
  player?: FramedPlayer;
}

export interface EmbedData {
  /** The provider's `id`. */
  provider: string;
  embedId: string;
  caption: string;
  size: ImageSize;
  /** Moments marked while it played, its chapters once named. */
  markers?: Marker[];
  /** An audio description, kept with the embed: `1:30 A map of the river` a line. */
  descriptions?: string;
}

/** An embed read from an address: what is stored, with its frame's address and its provider's name. */
export interface ResolvedEmbed extends EmbedData {
  src: string;
  title: string;
}

function checked(embedId: string | undefined, pattern: RegExp): string | null {
  return embedId !== undefined && pattern.test(embedId) ? embedId : null;
}

function query(url: URL, name: string): string {
  return [...url.searchParams].find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? "";
}

function pathOf(url: URL): string[] {
  return url.pathname.split("/").filter((part) => part !== "");
}

function hostOf(url: URL): string {
  return url.hostname.replace(/^(?:www|m)\./, "");
}

function post(frame: HTMLIFrameElement, message: unknown, origin: string): void {
  frame.contentWindow?.postMessage(
    typeof message === "string" ? message : JSON.stringify(message),
    origin,
  );
}

function heard(
  frame: HTMLIFrameElement,
  origin: RegExp,
  read: (data: unknown) => number | null,
  onTime: (seconds: number) => void,
): () => void {
  function message(event: MessageEvent): void {
    if (event.source !== frame.contentWindow || !origin.test(event.origin)) return;
    let data: unknown = event.data;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data) as unknown;
      } catch {
        return;
      }
    }
    const seconds = read(data);
    if (seconds !== null && Number.isFinite(seconds)) onTime(seconds);
  }
  globalThis.addEventListener("message", message);
  return () => globalThis.removeEventListener("message", message);
}

interface YouTubeState {
  currentTime?: number;
}

interface YouTubeInfo {
  event?: string;
  info?: YouTubeState;
}

interface VimeoSeconds {
  seconds?: number;
}

interface VimeoTime {
  event?: string;
  data?: VimeoSeconds;
}

const YOUTUBE_ORIGIN = "https://www.youtube-nocookie.com";

const YOUTUBE_PLAYER: FramedPlayer = {
  src: (id) => `${YOUTUBE_ORIGIN}/embed/${id}?enablejsapi=1&rel=0`,
  seek: (frame, seconds) => {
    post(frame, { event: "command", func: "seekTo", args: [seconds, true] }, YOUTUBE_ORIGIN);
    post(frame, { event: "command", func: "playVideo", args: [] }, YOUTUBE_ORIGIN);
  },
  listen: (frame, onTime) => {
    // The player reports its time once it is asked to, and on every change after.
    post(frame, { event: "listening", id: "arc" }, YOUTUBE_ORIGIN);
    return heard(
      frame,
      /^https:\/\/www\.youtube(?:-nocookie)?\.com$/,
      (data) => {
        const info = data as YouTubeInfo;
        return info.event === "infoDelivery" ? (info.info?.currentTime ?? null) : null;
      },
      onTime,
    );
  },
};

const VIMEO_ORIGIN = "https://player.vimeo.com";

const VIMEO_PLAYER: FramedPlayer = {
  src: (id) => `${VIMEO_ORIGIN}/video/${id}`,
  seek: (frame, seconds) => {
    post(frame, { method: "setCurrentTime", value: seconds }, VIMEO_ORIGIN);
    post(frame, { method: "play" }, VIMEO_ORIGIN);
  },
  listen: (frame, onTime) => {
    post(frame, { method: "addEventListener", value: "timeupdate" }, VIMEO_ORIGIN);
    return heard(
      frame,
      /^https:\/\/player\.vimeo\.com$/,
      (data) => {
        const time = data as VimeoTime;
        return time.event === "timeupdate" ? (time.data?.seconds ?? null) : null;
      },
      onTime,
    );
  },
};

const GOOGLE_ID = /^[\w-]{10,128}$/;
const TENANT = "[a-z\\d][a-z\\d-]{0,62}\\.sharepoint\\.com";
const SITE = "(?:/(?:sites|teams|personal)/[\\w.%-]{1,128})?";
const GUID = "[\\da-f]{8}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{12}";
/**
 * Microsoft 365 frames a file from an organisation's own tenant, so its id
 * keeps the tenant's host and site with the file: `doc:`, `slides:` and
 * `video:` for SharePoint, `live:` for a personal OneDrive file and its key,
 * `sway:` for a Sway. The address is rebuilt from these, so nothing else a
 * pasted link carries reaches the frame.
 */
const MICROSOFT_ID = new RegExp(
  `^(?:(?:doc|slides|video):${TENANT}${SITE}:${GUID}|live:[\\dA-F]{6,20}![\\d]{1,12}:![\\w-]{6,64}|sway:[\\dA-Za-z]{8,32})$`,
  "i",
);

interface MicrosoftParts {
  kind: string;
  first: string;
  second: string;
}

function microsoftParts(id: string): MicrosoftParts {
  const [kind = "", first = "", second = ""] = id.split(":");
  return { kind, first, second };
}

function microsoftId(url: URL): string | null {
  const host = hostOf(url);
  const path = pathOf(url);
  if (host.endsWith(".sharepoint.com")) {
    const layouts = url.pathname.toLowerCase().indexOf("/_layouts/15/");
    if (layouts < 0) return null;
    const site = url.pathname.slice(0, layouts);
    const page = (path.at(-1) ?? "").toLowerCase();
    const stream = page === "embed.aspx" || page === "stream.aspx";
    const guid = (stream ? query(url, "UniqueId") || query(url, "id") : query(url, "sourcedoc"))
      .replaceAll(/[{}]/g, "")
      .toLowerCase();
    const kind = stream
      ? "video"
      : page === "doc.aspx" || page.startsWith("wopiframe")
        ? query(url, "wdAr") === ""
          ? "doc"
          : "slides"
        : null;
    return kind === null ? null : checked(`${kind}:${host}${site}:${guid}`, MICROSOFT_ID);
  }
  if (host === "onedrive.live.com" && path[0] === "embed") {
    return checked(`live:${query(url, "resid")}:${query(url, "authkey")}`, MICROSOFT_ID);
  }
  if (host === "sway.office.com" || host === "sway.cloud.microsoft") {
    return checked(`sway:${(path[0] === "s" ? path[1] : path[0]) ?? ""}`, MICROSOFT_ID);
  }
  return null;
}

/**
 * The sites arc embeds from by default: video (YouTube, Vimeo, Loom), Google's
 * and Microsoft's documents, slides, sheets and forms, Canva designs, and the
 * GeoGebra, Desmos and PhET simulations. YouTube and Vimeo play from a
 * chapter's moment.
 */
export const DEFAULT_EMBED_PROVIDERS: readonly EmbedProvider[] = [
  {
    id: "youtube",
    name: "YouTube",
    parse: (url) => {
      const host = hostOf(url);
      const path = pathOf(url);
      const id = /^[\w-]{11}$/;
      if (host === "youtu.be") return checked(path[0], id);
      if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
      if (path[0] === "watch") return checked(url.searchParams.get("v") ?? undefined, id);
      return ["embed", "shorts", "live"].includes(path[0] ?? "") ? checked(path[1], id) : null;
    },
    src: (id) => `${YOUTUBE_ORIGIN}/embed/${id}`,
    page: (id) => `https://www.youtube.com/watch?v=${id}`,
    player: YOUTUBE_PLAYER,
  },
  {
    id: "vimeo",
    name: "Vimeo",
    parse: (url) => {
      const host = hostOf(url);
      const path = pathOf(url);
      if (host === "vimeo.com") return checked(path.at(-1), /^\d{4,12}$/);
      if (host === "player.vimeo.com" && path[0] === "video") return checked(path[1], /^\d{4,12}$/);
      return null;
    },
    src: (id) => `${VIMEO_ORIGIN}/video/${id}`,
    page: (id) => `https://vimeo.com/${id}`,
    player: VIMEO_PLAYER,
  },
  {
    id: "loom",
    name: "Loom",
    parse: (url) => {
      const path = pathOf(url);
      return hostOf(url) === "loom.com" && (path[0] === "share" || path[0] === "embed")
        ? checked(path[1], /^[\da-f]{32}$/)
        : null;
    },
    src: (id) => `https://www.loom.com/embed/${id}`,
    page: (id) => `https://www.loom.com/share/${id}`,
  },
  {
    id: "google-drive",
    name: "Google Drive",
    parse: (url) => {
      const path = pathOf(url);
      return hostOf(url) === "drive.google.com" && path[0] === "file" && path[1] === "d"
        ? checked(path[2], GOOGLE_ID)
        : null;
    },
    src: (id) => `https://drive.google.com/file/d/${id}/preview`,
    page: (id) => `https://drive.google.com/file/d/${id}/view`,
  },
  ...(
    [
      ["google-docs", "Google Docs", "document", "preview", "4 / 3"],
      ["google-slides", "Google Slides", "presentation", "embed", "16 / 9"],
      ["google-sheets", "Google Sheets", "spreadsheets", "preview", "4 / 3"],
    ] as const
  ).map(([id, name, kind, view, aspect]): EmbedProvider => ({
    id,
    name,
    parse: (url) => {
      const path = pathOf(url);
      return hostOf(url) === "docs.google.com" && path[0] === kind && path[1] === "d"
        ? checked(path[2], GOOGLE_ID)
        : null;
    },
    src: (embedId) => `https://docs.google.com/${kind}/d/${embedId}/${view}`,
    page: (embedId) => `https://docs.google.com/${kind}/d/${embedId}/edit`,
    aspect: () => aspect,
  })),
  {
    id: "google-forms",
    name: "Google Forms",
    parse: (url) => {
      const path = pathOf(url);
      return hostOf(url) === "docs.google.com" &&
        path[0] === "forms" &&
        path[1] === "d" &&
        path[2] === "e"
        ? checked(path[3], /^[\w-]{10,160}$/)
        : null;
    },
    src: (id) => `https://docs.google.com/forms/d/e/${id}/viewform?embedded=true`,
    page: (id) => `https://docs.google.com/forms/d/e/${id}/viewform`,
    aspect: () => "3 / 4",
  },
  {
    id: "canva",
    name: "Canva",
    parse: (url) => {
      const path = pathOf(url);
      return hostOf(url) === "canva.com" && path[0] === "design" && path[1] && path[2]
        ? checked(`${path[1]}/${path[2]}`, /^[\w-]{8,24}\/[\w-]{8,48}$/)
        : null;
    },
    src: (id) => `https://www.canva.com/design/${id}/view?embed`,
    page: (id) => `https://www.canva.com/design/${id}/view`,
  },
  {
    id: "geogebra",
    name: "GeoGebra",
    parse: (url) => {
      const path = pathOf(url);
      if (hostOf(url) !== "geogebra.org") return null;
      const id = /^[\da-z]{5,16}$/i;
      if (["m", "classic", "calculator", "graphing", "geometry", "3d"].includes(path[0] ?? "")) {
        return checked(path[1], id);
      }
      return path[0] === "material" && path[1] === "iframe" && path[2] === "id"
        ? checked(path[3], id)
        : null;
    },
    src: (id) => `https://www.geogebra.org/material/iframe/id/${id}`,
    page: (id) => `https://www.geogebra.org/m/${id}`,
    aspect: () => "4 / 3",
  },
  {
    id: "desmos",
    name: "Desmos",
    parse: (url) => {
      const path = pathOf(url);
      return hostOf(url) === "desmos.com" && path[1] !== undefined
        ? checked(`${path[0] ?? ""}/${path[1]}`, /^(?:calculator|geometry|3d)\/[\da-z]{6,32}$/)
        : null;
    },
    src: (id) => `https://www.desmos.com/${id}?embed`,
    page: (id) => `https://www.desmos.com/${id}`,
    aspect: () => "4 / 3",
  },
  {
    id: "phet",
    name: "PhET",
    parse: (url) => {
      const path = pathOf(url);
      if (url.hostname !== "phet.colorado.edu") return null;
      const id = /^[a-z\d]+(?:-[a-z\d]+)*$/;
      if (path[1] === "simulations") return checked(path[2], id);
      return path[0] === "sims" && path[1] === "html" ? checked(path[2], id) : null;
    },
    src: (id) => `https://phet.colorado.edu/sims/html/${id}/latest/${id}_all.html`,
    page: (id) => `https://phet.colorado.edu/en/simulations/${id}`,
    aspect: () => "4 / 3",
  },
  {
    id: "microsoft-365",
    name: "Microsoft 365",
    parse: microsoftId,
    src: (id) => {
      const { kind, first, second } = microsoftParts(id);
      if (kind === "live") {
        return `https://onedrive.live.com/embed?resid=${encodeURIComponent(first)}&authkey=${encodeURIComponent(second)}&em=2`;
      }
      if (kind === "sway") return `https://sway.cloud.microsoft/s/${first}/embed`;
      if (kind === "video") return `https://${first}/_layouts/15/embed.aspx?UniqueId=${second}`;
      return `https://${first}/_layouts/15/Doc.aspx?sourcedoc=%7B${second}%7D&action=embedview${kind === "slides" ? "&wdAr=1.7777777777777777" : ""}`;
    },
    aspect: (id) => {
      const { kind } = microsoftParts(id);
      return kind === "doc" || kind === "live" ? "4 / 3" : "16 / 9";
    },
  },
  {
    id: "microsoft-forms",
    name: "Microsoft Forms",
    parse: (url) => {
      const host = hostOf(url);
      const path = pathOf(url);
      if (!["forms.office.com", "forms.microsoft.com", "forms.cloud.microsoft"].includes(host)) {
        return null;
      }
      const id = /^(?:r\/[\w-]{6,20}|[\w-]{20,300})$/;
      if (path[1]?.toLowerCase() === "responsepage.aspx") return checked(query(url, "id"), id);
      return path[0] === "r" || path[0] === "e" ? checked(`r/${path[1] ?? ""}`, id) : null;
    },
    src: (id) =>
      id.startsWith("r/")
        ? `https://forms.office.com/${id}?embed=true`
        : `https://forms.office.com/Pages/ResponsePage.aspx?id=${id}&embed=true`,
    aspect: () => "3 / 4",
  },
];

const IFRAME_SOURCE = /<iframe\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i;

/**
 * The embed an address makes, or the `<iframe>` code a site hands out under
 * Share then Embed, read through its source; `null` when no provider takes it.
 */
export function resolveEmbed(
  input: string,
  providers: readonly EmbedProvider[] = DEFAULT_EMBED_PROVIDERS,
): ResolvedEmbed | null {
  const code = IFRAME_SOURCE.exec(input);
  const address = code?.[1] === undefined ? input : code[1].replaceAll("&amp;", "&");
  let url: URL;
  try {
    url = new URL(address.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  for (const provider of providers) {
    const embedId = provider.parse(url);
    if (embedId !== null) {
      return {
        provider: provider.id,
        embedId,
        caption: "",
        size: "full",
        src: provider.src(embedId),
        title: provider.name,
      };
    }
  }
  return null;
}

export const embedStyles = variants({
  slots: {
    root: arc(layout.column, gap[2]),
    frame: arc(layout.relative, rounded.lg, edge.all, bg.muted, layout.clip, layout.fill),
    iframe: arc(place.cover, layout.fill, { height: "100%", border: "0" }),
    load: arc(place.cover, layout.column, layout.centre, gap[2], focus.visible, fg.default, {
      backgroundColor: "transparent",
      border: "0",
      cursor: "pointer",
      textAlign: "center",
    }),
    mark: arc(layout.centre, rounded.full, bg.primary, {
      width: "3.5rem",
      height: "3.5rem",
      color: "var(--primary-foreground)",
    }),
    privacy: arc(type.caption, fg.muted, { maxWidth: "28rem", paddingInline: "1rem" }),
    foot: arc(layout.row, layout.between, layout.wrap, gap[2]),
    caption: arc(type.caption, fg.muted),
    page: arc(type.caption, fg.muted, layout.inlineRow, gap[1]),
    chapters: arc(plainList, layout.row, layout.wrap, gap[1]),
    actions: arc(layout.row, layout.wrap, gap[1]),
  },
});

type EmbedSlots = ReturnType<typeof embedStyles>;

export interface EmbedOptions extends Customisable<EmbedSlots> {
  /** The sites embedded from. @default `DEFAULT_EMBED_PROVIDERS` */
  providers?: readonly EmbedProvider[];
}

const looks = blockOptions<EmbedOptions>();

function providerOf(data: EmbedData, options: EmbedOptions | undefined): EmbedProvider | undefined {
  return (options?.providers ?? DEFAULT_EMBED_PROVIDERS).find((one) => one.id === data.provider);
}

export interface EmbedFigureProps {
  data: EmbedData;
  format: ElementFormatType;
  options: EmbedOptions | undefined;
  editable: boolean;
  /** Whether the block is chosen in the editor, which a frame that takes the pointer would steal. */
  selected?: boolean;
  /** Told the player's time as it plays, where its player tells it. */
  onTime?: (seconds: number) => void;
  /** Under the frame while it is edited. */
  children?: unknown;
}

/**
 * An embed as a document shows it. A reader's frame waits behind a button
 * that names the site it loads from, so nothing of that site's reaches them
 * until they choose it; a writer's loads at once. Where the provider's
 * player can be told a moment, the named markers are chapters that play
 * from theirs.
 */
export function EmbedFigure(props: EmbedFigureProps) {
  const messages = useArcMessages();
  const [loaded, setLoaded] = createSignal(
    untrack(() => props.editable),
    { ownedWrite: true },
  );
  let frame: HTMLIFrameElement | undefined;
  let pending: number | null = null;
  let stop: (() => void) | undefined;
  function c(): EmbedSlots {
    return parts(embedStyles(), props.options?.classes);
  }
  function provider(): EmbedProvider | undefined {
    return providerOf(props.data, props.options);
  }
  function chapters() {
    return provider()?.player === undefined ? [] : chaptersOf(props.data.markers);
  }
  function src(): string {
    const found = provider();
    if (found === undefined) return "";
    const player = found.player;
    // The player's messages are turned on only where something will speak to it.
    return player !== undefined && (props.editable || chapters().length > 0)
      ? player.src(props.data.embedId)
      : found.src(props.data.embedId);
  }
  function name(): string {
    return provider()?.name ?? props.data.provider;
  }
  function attach(element: HTMLIFrameElement): void {
    frame = element;
    element.addEventListener("load", () => {
      const player = provider()?.player;
      if (player === undefined) return;
      stop?.();
      stop = player.listen(element, (seconds) => props.onTime?.(seconds));
      if (pending !== null) {
        player.seek(element, pending);
        pending = null;
      }
    });
  }
  function playFrom(seconds: number): void {
    const player = provider()?.player;
    if (player === undefined) return;
    if (frame === undefined || !loaded()) {
      pending = seconds;
      setLoaded(true);
      return;
    }
    player.seek(frame, seconds);
  }
  return (
    <figure
      class={arc(
        pictureStyles({ size: props.data.size, align: alignmentOf(props.format) }).figure,
        c().root,
        props.options?.class,
        props.options?.className,
      )}
      data-slot="editor-embed"
      data-provider={props.data.provider}
      data-size={props.data.size}
    >
      <div
        class={c().frame}
        style={{ "aspect-ratio": provider()?.aspect?.(props.data.embedId) ?? "16 / 9" }}
      >
        <Show
          when={loaded() && src() !== ""}
          fallback={
            <button
              type="button"
              class={c().load}
              data-slot="editor-embed-load"
              onClick={() => setLoaded(true)}
            >
              <span class={c().mark} aria-hidden="true">
                <Play />
              </span>
              <span class={type.label}>{messages().embedLoad(name())}</span>
              <span class={c().privacy}>{messages().embedPrivacy(name())}</span>
            </button>
          }
        >
          <iframe
            ref={attach}
            class={c().iframe}
            src={src()}
            title={props.data.caption === "" ? name() : props.data.caption}
            loading="lazy"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowfullscreen
            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation allow-forms"
            referrerpolicy="strict-origin-when-cross-origin"
            // A frame that takes the pointer while the block is being arranged
            // would swallow the press that chooses it.
            style={{
              "pointer-events": props.editable && props.selected !== true ? "none" : undefined,
            }}
          />
        </Show>
      </div>
      <Show when={chapters().length > 0}>
        <ol class={c().chapters} aria-label={messages().chapters} data-slot="editor-embed-chapters">
          <For each={chapters()}>
            {(chapter: MediaChapter) => (
              <li>
                <Button variant="outline" size="sm" onPress={() => playFrom(chapter.start)}>
                  <span dir="ltr" class={type.numeric}>
                    {mediaClock(chapter.start)}
                  </span>
                  <span dir="auto">{chapter.title}</span>
                </Button>
              </li>
            )}
          </For>
        </ol>
      </Show>
      <div class={c().foot}>
        <Show when={props.data.caption !== ""}>
          <figcaption class={c().caption} dir="auto" data-slot="editor-embed-caption">
            {props.data.caption}
          </figcaption>
        </Show>
        <Show when={provider()?.page?.(props.data.embedId)}>
          {(page: () => string) => (
            <a class={c().page} href={page()} target="_blank" rel="noopener noreferrer">
              {messages().openOn(name())}
              <ExternalLink aria-hidden="true" />
            </a>
          )}
        </Show>
      </div>
      {props.children as never}
    </figure>
  );
}

function EmbedView(props: BlockProps<EmbedData>) {
  const inEditor = untrack(() => props.nodeKey) !== "";
  const editor = inEditor ? useLexicalEditor() : null;
  let now = 0;
  function options(): EmbedOptions | undefined {
    return editor === null ? undefined : looks.read(editor);
  }
  function framed(): boolean {
    return providerOf(props.data, options())?.player !== undefined;
  }
  return (
    <EmbedFigure
      data={props.data}
      format={props.format}
      options={options()}
      editable={props.editable}
      selected={props.selected}
      onTime={(seconds: number) => {
        now = seconds;
      }}
    >
      <Show when={props.editable}>
        <div class={embedStyles().actions} data-slot="editor-embed-actions">
          <CaptionPopover
            caption={props.data.caption}
            onSave={(caption: string) => props.setData({ caption })}
          />
        </div>
        <Show when={framed()}>
          <MarkerList
            markers={props.data.markers ?? []}
            now={() => Math.floor(now)}
            classes={recordingStyles()}
            onChange={(markers: Marker[]) =>
              props.setData({ markers: markers.length === 0 ? undefined : markers })
            }
          />
        </Show>
      </Show>
    </EmbedFigure>
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

/** An embed as one line of HTML: its frame, with what it is stored as on it. */
export function embedHtml(
  data: EmbedData,
  align: "start" | "center" | "end" = "center",
  providers: readonly EmbedProvider[] = DEFAULT_EMBED_PROVIDERS,
): string {
  const provider = providers.find((one) => one.id === data.provider);
  const attributes = [
    `src="${escapeAttribute(provider?.src(data.embedId) ?? "")}"`,
    `data-embed="${escapeAttribute(data.provider)}"`,
    `data-embed-id="${escapeAttribute(data.embedId)}"`,
    `title="${escapeAttribute(data.caption === "" ? (provider?.name ?? data.provider) : data.caption)}"`,
  ];
  if (data.caption !== "") attributes.push(`data-caption="${escapeAttribute(data.caption)}"`);
  if (data.size !== "full") attributes.push(`data-size="${data.size}"`);
  if (align !== "center") attributes.push(`data-align="${align}"`);
  if (data.markers !== undefined) {
    attributes.push(`data-markers="${escapeAttribute(JSON.stringify(data.markers))}"`);
  }
  if (data.descriptions !== undefined) {
    attributes.push(`data-descriptions="${escapeAttribute(data.descriptions)}"`);
  }
  return `<iframe ${attributes.join(" ")}></iframe>`;
}

function embedFrom(attributes: Readonly<Record<string, string>>): BlockRead<EmbedData> | null {
  const stored = attributes["data-embed"];
  const id = attributes["data-embed-id"];
  const found =
    stored !== undefined && id !== undefined
      ? { provider: stored, embedId: id }
      : resolveEmbed(attributes.src ?? "");
  if (found === null) return null;
  let markers: Marker[] | undefined;
  try {
    const read = JSON.parse(attributes["data-markers"] ?? "null") as unknown;
    markers = Array.isArray(read) ? (read as Marker[]) : undefined;
  } catch {
    markers = undefined;
  }
  const align = attributes["data-align"];
  return {
    ...(align === "start" || align === "end" ? { format: align } : {}),
    provider: found.provider,
    embedId: found.embedId,
    caption: attributes["data-caption"] ?? "",
    size: IMAGE_SIZES.find((one) => one === attributes["data-size"]) ?? "full",
    ...(markers === undefined ? {} : { markers }),
    ...(attributes["data-descriptions"] === undefined
      ? {}
      : { descriptions: attributes["data-descriptions"] }),
  };
}

/** A page framed from a site that recognised its address. */
export const EmbedBlock: Block<EmbedData> = defineBlock<EmbedData>({
  type: "embed",
  label: (messages) => messages.embed,
  group: (messages) => messages.mediaBlocks,
  icon: () => <SquarePlay />,
  keywords: ["video", "youtube", "vimeo", "iframe", "slides", "form", "simulation"],
  defaultData: () => ({ provider: "", embedId: "", caption: "", size: "full" }),
  component: EmbedView,
  insertable: false,
  toMarkdown: (data, format) => (data.embedId === "" ? null : embedHtml(data, alignmentOf(format))),
  fromMarkdown: {
    regExp: /^<iframe(\s[^>]*)?><\/iframe>\s?$/,
    data: (match) => embedFrom(attributesOf(match[1] ?? "")),
  },
  fromHtml: {
    iframe: (element) => {
      const attributes: Record<string, string> = {};
      for (const one of element.attributes) attributes[one.name] = one.value;
      return embedFrom(attributes);
    },
  },
  toHtml: (data, format) => {
    const template = document.createElement("template");
    template.innerHTML = embedHtml(data, alignmentOf(format));
    return template.content.firstElementChild as HTMLElement;
  },
});

/** Whether a node is an embed. */
export function $isEmbedNode(node: LexicalNode | null | undefined): boolean {
  return $isBlockNode(node) && node.getType() === "embed";
}

/**
 * Pages framed from the sites `providers` allows, fourteen by default: an
 * address pasted on an empty line or a site's embed code embeds, and the
 * Insert menu asks for one. A reader's frame loads only once chosen; a
 * YouTube or Vimeo embed's named markers are chapters. Its look takes
 * `class` and `classes` in the editor and the renderer alike.
 */
export function embedExtension(options: EmbedOptions = {}): EditorExtension {
  const providers = options.providers ?? DEFAULT_EMBED_PROVIDERS;
  return defineEditorExtension({
    name: "arc/embed",
    dependencies: [EmbedBlock],
    register: (editor) => looks.provide(editor, options),
    commands: [
      {
        id: "embed",
        label: (messages) => messages.embed,
        group: (messages) => messages.mediaBlocks,
        icon: () => <SquarePlay />,
        keywords: EmbedBlock.keywords,
        run: (editor) => editor.dispatchCommand(OPEN_EMBED_DIALOG_COMMAND, undefined),
      },
    ],
    blockMenu: sizeAndAlignment($isEmbedNode),
    paste: [
      {
        priority: 15,
        $paste: (data, selection) => {
          const text = data.getData("text/plain").trim();
          const top = selection.anchor.getNode().getTopLevelElement();
          const emptyLine = $isParagraphNode(top) && top.getTextContentSize() === 0;
          const code = /^<iframe\b/i.test(text);
          if (!selection.isCollapsed() || (!code && (!emptyLine || /\s/.test(text)))) return false;
          const embed = resolveEmbed(text, providers);
          if (embed === null) return false;
          const block = EmbedBlock.$create({
            provider: embed.provider,
            embedId: embed.embedId,
            caption: "",
            size: "full",
          });
          if (emptyLine && top !== null) top.replace(block);
          else selection.insertNodes([block]);
          if (block.getNextSibling() === null) block.insertAfter($createParagraphNode());
          block.selectNext();
          return true;
        },
      },
    ],
    render: {
      embed: (node, scope) => (
        <EmbedFigure
          data={storedBlockData<EmbedData>(EmbedBlock, node)}
          format={(typeof node.format === "string" ? node.format : "") as ElementFormatType}
          options={options}
          editable={scope.editing}
        />
      ),
    },
    plugins: [
      () => {
        const [open, setOpen] = useDialogCommand(OPEN_EMBED_DIALOG_COMMAND);
        return <EmbedDialog open={open()} onOpenChange={setOpen} providers={providers} />;
      },
    ],
  });
}

export interface EmbedDialogProps {
  providers: readonly EmbedProvider[];
}

/** An address read into an embed from the providers the editor allows. */
export function EmbedDialog(props: MediaDialogProps & EmbedDialogProps) {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  const inputId = createUniqueId();
  const errorId = createUniqueId();
  const [address, setAddress] = createSignal("", { ownedWrite: true });
  const [refused, setRefused] = createSignal(false, { ownedWrite: true });
  function submit(): void {
    const embed = resolveEmbed(address(), props.providers);
    if (embed === null) {
      setRefused(true);
      return;
    }
    props.onOpenChange(false);
    setAddress("");
    editor.update(() => {
      $insertBlock(
        EmbedBlock.$create({
          provider: embed.provider,
          embedId: embed.embedId,
          caption: "",
          size: "full",
        }),
      );
    });
  }
  return (
    <ResponsiveOverlay
      heading={messages().embed}
      open={props.open}
      onOpenChange={props.onOpenChange}
      footer={
        <Button type="submit" form={`${inputId}-form`}>
          {messages().insert}
        </Button>
      }
    >
      <form
        id={`${inputId}-form`}
        onSubmit={(event: SubmitEvent) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field isInvalid={refused()}>
          <FieldLabel for={inputId}>{messages().embedAddress}</FieldLabel>
          <Input
            id={inputId}
            type="url"
            dir="ltr"
            inputMode="url"
            value={address()}
            placeholder={messages().linkPlaceholder}
            aria-invalid={refused()}
            aria-errormessage={refused() ? errorId : undefined}
            onInput={(event: Event) => {
              setAddress((event.currentTarget as HTMLInputElement).value);
              setRefused(false);
            }}
          />
          <Show when={refused()}>
            <FieldError id={errorId}>{messages().embedNotSupported}</FieldError>
          </Show>
        </Field>
      </form>
    </ResponsiveOverlay>
  );
}
