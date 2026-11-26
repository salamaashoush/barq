import { For, Show, createEffect, createSignal, createUniqueId, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { numberFormatter, useLocale } from "@barqjs/aria/i18n";
import { AudioLines } from "@barqjs/lucide/icons/audio-lines";
import { Captions } from "@barqjs/lucide/icons/captions";
import { Gauge as SpeedIcon } from "@barqjs/lucide/icons/gauge";
import { ListOrdered } from "@barqjs/lucide/icons/list-ordered";
import { Maximize } from "@barqjs/lucide/icons/maximize";
import { Minimize } from "@barqjs/lucide/icons/minimize";
import { Pause } from "@barqjs/lucide/icons/pause";
import { PictureInPicture2 } from "@barqjs/lucide/icons/picture-in-picture-2";
import { Play } from "@barqjs/lucide/icons/play";
import { ScrollText } from "@barqjs/lucide/icons/scroll-text";
import { Volume2 } from "@barqjs/lucide/icons/volume-2";
import { VolumeX } from "@barqjs/lucide/icons/volume-x";
import { fullscreen } from "@barqjs/primitives/fullscreen";
import { ref as makeRef } from "@barqjs/primitives/refs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { Slider } from "@barqjs/ui/slider";
import { srOnly } from "@barqjs/ui/sr-only";
import { on } from "@barqjs/ui/conditions";
import { isServer } from "@barqjs/web";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  control,
  edge,
  fg,
  focus,
  gap,
  interaction,
  layout,
  place,
  plainList,
  rounded,
  space,
  target,
  type,
} from "../style/index.ts";
import { durationText } from "./format.tsx";
import { IconButton } from "./icon-button.tsx";
import { useArcMessages } from "./messages.ts";

/** A stretch of the media with its words: a caption line, a transcript line. */
export interface MediaCue {
  /** Seconds from the start. */
  start: number;
  end?: number;
  text: string;
}

export interface MediaChapter {
  /** Seconds from the start. */
  start: number;
  title: string;
}

export interface MediaTrack {
  src: string;
  /** @default "captions" */
  kind?: "captions" | "subtitles" | "descriptions";
  /** The language, as BCP 47. */
  srclang: string;
  label: string;
  /** Shown from the start. */
  default?: boolean;
}

export interface MediaSource {
  src: string;
  type?: string;
}

/** A line of a video's audio description: from when, and what the picture shows. */
export interface MediaDescription {
  /** Seconds from the start. */
  at: number;
  text: string;
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
/** How long a described line shows where the browser has no voice to read it, in milliseconds. */
function readingTime(text: string): number {
  return 1500 + text.split(/\s+/).length * 400;
}
const SEEK = 5;
const JUMP = 10;
const LEAVE_ALONE = 4000;

export const mediaPlayerStyles = variants({
  slots: {
    root: arc(layout.column, layout.container, rounded.lg, layout.minZero, focus.within, {
      overflow: "hidden",
    }),
    stage: arc(layout.relative, { backgroundColor: "black" }),
    media: arc(place.block, { maxHeight: "80dvh" }),
    controls: arc(layout.row, layout.wrap, gap[1], bg.muted, {
      paddingInline: space.x2,
      paddingBlock: space.x1,
    }),
    button: arc({}),
    seek: arc(layout.grow, {
      minWidth: space.x16,
      flexBasis: { default: "0", [on.cqBelowSm]: "100%" },
      order: { default: "0", [on.cqBelowSm]: "-1" },
    }),
    time: arc(type.caption, type.numeric, fg.muted, layout.nowrap),
    volume: arc({
      width: space.x16,
      display: { default: "flex", [on.coarse]: "none" },
    }),
    chapter: arc(type.caption, fg.muted, layout.minZero, layout.clip, layout.nowrap, {
      maxWidth: "12rem",
    }),
    end: arc(layout.pushEnd, layout.row, layout.wrap, layout.end, gap[1]),
    said: arc(layout.row, gap[2], type.body, bg.muted, place.padded, { alignItems: "start" }),
    transcript: arc(plainList, layout.column, gap[0.5], focus.outline, {
      maxHeight: "16rem",
      overflowY: "auto",
      padding: space.x2,
    }),
    cue: arc(
      control.bare,
      layout.row,
      layout.fill,
      gap[2],
      type.body,
      rounded.sm,
      interaction.selected,
      interaction.hover,
      target.size,
      focus.visible,
      { alignItems: "baseline", textAlign: "start", padding: space.x1 },
    ),
    cueTime: arc(type.caption, type.numeric, fg.muted, layout.noShrink),
  },
  variants: {
    kind: {
      video: {},
      audio: { root: edge.all },
    },
  },
  defaults: { kind: "video" },
});

type Slots = ReturnType<typeof mediaPlayerStyles>;

export interface MediaPlayerProps extends Customisable<Slots> {
  /** One file, or the same media in several formats for the browser to choose from. */
  src: string | readonly MediaSource[];
  /** @default "video" */
  kind?: "video" | "audio";
  /** Names the player, and the media for a screen reader. */
  title: string;
  poster?: string;
  tracks?: readonly MediaTrack[];
  chapters?: readonly MediaChapter[];
  /** The words of the media, shown under it behind a Transcript button and kept in step. */
  transcript?: readonly MediaCue[];
  /**
   * A video's audio description, read out once the reader turns it on: as
   * playing reaches each line the video waits while it is read, then plays
   * on. A `descriptions` track in `tracks` is read the same way.
   */
  descriptions?: readonly MediaDescription[];
  /** The language the description is read in. @default the reader's */
  descriptionsLang?: string;
  /** @default 0.5, 0.75, 1, 1.25, 1.5, 2 */
  rates?: readonly number[];
  /** @default "metadata" */
  preload?: "none" | "metadata" | "auto";
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  /** Seconds to start from. */
  startTime?: number;
  onTimeUpdate?: (seconds: number) => void;
  onEnded?: () => void;
  id?: string;
}

/**
 * Audio or video on the browser's own element, with controls that every
 * reader can use.
 *
 * ```tsx
 * <MediaPlayer
 *   title="Onboarding walkthrough"
 *   src="/media/walkthrough.mp4"
 *   poster="/media/walkthrough.jpg"
 *   tracks={[{ src: "/media/walkthrough.en.vtt", srclang: "en", label: "English", default: true }]}
 *   chapters={[{ start: 0, title: "Welcome" }, { start: 95, title: "Your first project" }]}
 *   transcript={cues}
 * />
 * ```
 *
 * The seek bar is a slider whose value is said as "1 minute, 5 seconds of 3
 * minutes, 20 seconds"; the controls run left to right on a right-to-left page,
 * as a timeline does, while their menus follow the page. With focus inside
 * it, Space or K plays and pauses, J and L jump ten seconds, the arrows seek
 * five and change the volume, M mutes, C turns captions on and off, F goes
 * full screen, Home and End go to the ends and a digit to a tenth of the way.
 * A tap on the picture plays or pauses, and two taps on either side jump.
 */
export function MediaPlayer(props: MediaPlayerProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  const digits = numberFormatter({ maximumFractionDigits: 2 });
  const root = makeRef<HTMLDivElement>();
  const media = makeRef<HTMLMediaElement>();
  const screen = fullscreen(() => root());
  const transcriptId = createUniqueId();
  function kind(): "video" | "audio" {
    return props.kind ?? "video";
  }
  function cls(): Slots {
    return parts(mediaPlayerStyles({ kind: kind() }), props.classes);
  }

  const [paused, setPaused] = createSignal(props.autoPlay !== true, { ownedWrite: true });
  const [time, setTime] = createSignal(props.startTime ?? 0, { ownedWrite: true });
  const [duration, setDuration] = createSignal(0, { ownedWrite: true });
  const [volume, setVolume] = createSignal(1, { ownedWrite: true });
  const [muted, setMuted] = createSignal(props.muted === true, { ownedWrite: true });
  const [rate, setRate] = createSignal(1, { ownedWrite: true });
  const [caption, setCaption] = createSignal<string>(
    props.tracks?.find((track) => track.default === true)?.srclang ?? "",
    { ownedWrite: true },
  );
  const [pip, setPip] = createSignal(false, { ownedWrite: true });
  const [mounted, setMounted] = createSignal(false, { ownedWrite: true });
  const [showTranscript, setShowTranscript] = createSignal(false);
  const [describing, setDescribing] = createSignal(false, { ownedWrite: true });
  const [said, setSaid] = createSignal<string | null>(null, { ownedWrite: true });
  // When the reader last scrolled the transcript themselves, and when it last
  // scrolled to follow the media, which must not count as theirs.
  let scrolledAt = 0;
  let followedAt = 0;

  function clock(seconds: number): string {
    return durationText(Math.max(0, seconds) * 1000, locale().locale, {
      length: "digital",
      hours: "auto",
    });
  }
  function spoken(seconds: number): string {
    return durationText(Math.max(0, seconds) * 1000, locale().locale, { length: "long", units: 3 });
  }

  if (!isServer) {
    createEffect(
      () => media(),
      (element) => {
        if (element === null) return;
        setMounted(true);
        if (props.startTime !== undefined && element.currentTime === 0) {
          element.currentTime = props.startTime;
        }
        if (Number.isFinite(element.duration)) setDuration(element.duration);
      },
    );
    createEffect(
      () => [media(), caption()] as const,
      ([element, chosen]) => {
        if (element === null) return;
        for (const node of element.querySelectorAll("track")) {
          if (node.kind === "chapters" || node.kind === "metadata") continue;
          // A description is never drawn; its cues are read out while it is on.
          if (node.kind === "descriptions") continue;
          node.track.mode = node.srclang === chosen && chosen !== "" ? "showing" : "disabled";
        }
      },
    );
    createEffect(
      () => [media(), describing()] as const,
      ([element, reading]) => {
        if (element === null) return;
        for (const node of element.querySelectorAll("track")) {
          if (node.kind === "descriptions") node.track.mode = reading ? "hidden" : "disabled";
        }
      },
    );
    createEffect(
      () => media(),
      (element) => (element === null ? undefined : describe(element)),
    );
  }

  /**
   * Reads the description out as the media reaches each line: the media
   * waits while a line is read, as extended description does, so nothing it
   * says is talked over. Going to another part, or playing on while a line is
   * read, stops it.
   */
  function describe(element: HTMLMediaElement): () => void {
    const voice = typeof speechSynthesis === "undefined" ? null : speechSynthesis;
    let last = element.currentTime;
    let saying = false;
    let resume = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function done(): void {
      if (!saying) return;
      saying = false;
      clearTimeout(timer);
      setSaid(null);
      if (resume) {
        resume = false;
        void element.play().catch(() => setPaused(true));
      }
    }
    function stop(): void {
      if (!saying) return;
      resume = false;
      voice?.cancel();
      done();
    }
    function say(text: string): void {
      saying = true;
      resume = !element.paused;
      element.pause();
      setSaid(text);
      function shown(): void {
        timer = setTimeout(done, readingTime(text));
      }
      if (voice === null || typeof SpeechSynthesisUtterance === "undefined") {
        shown();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = props.descriptionsLang ?? locale().locale;
      utterance.addEventListener("end", done);
      // A browser with no voice for the language still shows the line for as long as it takes to read.
      utterance.addEventListener("error", shown);
      voice.cancel();
      voice.speak(utterance);
    }
    function tick(): void {
      const from = last;
      last = element.currentTime;
      if (!untrack(describing) || saying || element.paused) return;
      // Only lines played through are read, not ones a seek passes over.
      if (last < from || last - from > 2) return;
      const line = (props.descriptions ?? []).find((each) => each.at > from && each.at <= last);
      if (line !== undefined) say(line.text);
    }
    function cue(event: Event): void {
      const track = event.currentTarget as TextTrack;
      const active = track.activeCues?.[0] as VTTCue | undefined;
      if (untrack(describing) && !saying && active !== undefined && active.text !== "") {
        say(active.text);
      }
    }
    function played(): void {
      stop();
    }
    function sought(): void {
      last = element.currentTime;
      stop();
    }
    const tracks = [...element.querySelectorAll("track")]
      .filter((node) => node.kind === "descriptions")
      .map((node) => node.track);
    element.addEventListener("timeupdate", tick);
    element.addEventListener("seeking", sought);
    element.addEventListener("play", played);
    for (const track of tracks) track.addEventListener("cuechange", cue);
    return () => {
      element.removeEventListener("timeupdate", tick);
      element.removeEventListener("seeking", sought);
      element.removeEventListener("play", played);
      for (const track of tracks) track.removeEventListener("cuechange", cue);
      stop();
    };
  }

  function element(): HTMLMediaElement | null {
    return media();
  }

  function toggle(): void {
    const node = element();
    if (node === null) return;
    if (node.paused) void node.play().catch(() => setPaused(true));
    else node.pause();
  }

  function seekTo(seconds: number): void {
    const node = element();
    if (node === null) return;
    const end = Number.isFinite(node.duration) ? node.duration : duration();
    const next = Math.min(Math.max(0, seconds), end > 0 ? end : seconds);
    node.currentTime = next;
    setTime(next);
  }

  function setLevel(level: number): void {
    const node = element();
    const next = Math.min(1, Math.max(0, level));
    if (node !== null) {
      node.volume = next;
      node.muted = next === 0;
    }
    setVolume(next);
    setMuted(next === 0);
  }

  function toggleMute(): void {
    const node = element();
    const next = !muted();
    if (node !== null) node.muted = next;
    setMuted(next);
  }

  function chooseRate(next: number): void {
    const node = element();
    if (node !== null) node.playbackRate = next;
    setRate(next);
  }

  function captionTracks(): readonly MediaTrack[] {
    return (props.tracks ?? []).filter((track) => track.kind !== "descriptions");
  }
  function described(): boolean {
    return (
      kind() === "video" &&
      ((props.descriptions?.length ?? 0) > 0 ||
        (props.tracks ?? []).some((track) => track.kind === "descriptions"))
    );
  }
  function toggleCaptions(): void {
    const first = captionTracks()[0];
    if (first === undefined) return;
    setCaption(caption() === "" ? first.srclang : "");
  }

  function pipSupported(): boolean {
    return (
      mounted() &&
      kind() === "video" &&
      !isServer &&
      "pictureInPictureEnabled" in document &&
      document.pictureInPictureEnabled
    );
  }
  function togglePip(): void {
    const node = element() as HTMLVideoElement | null;
    if (node === null) return;
    if (document.pictureInPictureElement === node) void document.exitPictureInPicture();
    else void node.requestPictureInPicture();
  }

  function currentChapter(): MediaChapter | undefined {
    return (props.chapters ?? []).findLast((chapter) => chapter.start <= time());
  }
  function currentCue(): MediaCue | undefined {
    return (props.transcript ?? []).findLast(
      (cue) => cue.start <= time() && (cue.end === undefined || time() < cue.end),
    );
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const from = event.target as HTMLElement;
    const inField = from.closest('input:not([type="range"]), textarea, select, [role="menu"]');
    if (inField !== null) return;
    const onSlider = from.matches('input[type="range"]');
    const onButton = from.closest("button, [role=button], [role=option]") !== null;
    const node = element();
    if (node === null) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    let handled = true;
    switch (key) {
      case " ":
        if (onButton) handled = false;
        else toggle();
        break;
      case "k":
        toggle();
        break;
      case "j":
        seekTo(node.currentTime - JUMP);
        break;
      case "l":
        seekTo(node.currentTime + JUMP);
        break;
      case "ArrowLeft":
      case "ArrowRight":
        if (onSlider) handled = false;
        else seekTo(node.currentTime + (key === "ArrowLeft" ? -SEEK : SEEK));
        break;
      case "ArrowUp":
      case "ArrowDown":
        if (onSlider) handled = false;
        else setLevel((muted() ? 0 : volume()) + (key === "ArrowUp" ? 0.05 : -0.05));
        break;
      case "Home":
      case "End":
        if (onSlider) handled = false;
        else seekTo(key === "Home" ? 0 : duration());
        break;
      case "m":
        toggleMute();
        break;
      case "c":
        toggleCaptions();
        break;
      case "f":
        if (kind() === "video" && screen.supported) void screen.toggle();
        else handled = false;
        break;
      default:
        if (/^[0-9]$/u.test(key)) seekTo((duration() * Number(key)) / 10);
        else handled = false;
    }
    if (handled) event.preventDefault();
  }

  let lastTap = 0;
  let pausedBeforeTap = false;
  function onStagePointerUp(event: PointerEvent): void {
    if (event.pointerType !== "touch") return;
    const node = element();
    if (node === null) return;
    const now = event.timeStamp;
    if (lastTap !== 0 && now - lastTap < 300) {
      lastTap = 0;
      const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const third = box.width / 3;
      const x = event.clientX - box.left;
      if (x < third || x > box.width - third) {
        if (pausedBeforeTap !== node.paused) toggle();
        seekTo(node.currentTime + (x < third ? -JUMP : JUMP));
      }
      return;
    }
    lastTap = now;
    pausedBeforeTap = node.paused;
  }

  function sources(): readonly MediaSource[] {
    return typeof props.src === "string" ? [{ src: props.src }] : props.src;
  }

  function mediaProps() {
    return {
      class: cls().media,
      "data-slot": "media-player-media",
      ref: media.set,
      poster: kind() === "video" ? props.poster : undefined,
      preload: props.preload ?? "metadata",
      autoplay: props.autoPlay,
      muted: props.muted,
      loop: props.loop,
      playsinline: true,
      "aria-label": props.title,
      onPlay: () => setPaused(false),
      onPause: () => setPaused(true),
      onEnded: () => {
        setPaused(true);
        props.onEnded?.();
      },
      onTimeUpdate: (event: Event) => {
        const seconds = (event.currentTarget as HTMLMediaElement).currentTime;
        setTime(seconds);
        props.onTimeUpdate?.(seconds);
      },
      onLoadedMetadata: (event: Event) => {
        const seconds = (event.currentTarget as HTMLMediaElement).duration;
        if (Number.isFinite(seconds)) setDuration(seconds);
      },
      onDurationChange: (event: Event) => {
        const seconds = (event.currentTarget as HTMLMediaElement).duration;
        if (Number.isFinite(seconds)) setDuration(seconds);
      },
      onVolumeChange: (event: Event) => {
        const node = event.currentTarget as HTMLMediaElement;
        setVolume(node.volume);
        setMuted(node.muted);
      },
      onRateChange: (event: Event) =>
        setRate((event.currentTarget as HTMLMediaElement).playbackRate),
      onEnterPictureInPicture: () => setPip(true),
      onLeavePictureInPicture: () => setPip(false),
      onClick: () => toggle(),
      onPointerUp: onStagePointerUp,
    };
  }

  function content() {
    return (
      <>
        <For each={sources()}>
          {(source: MediaSource) => <source src={source.src} type={source.type} />}
        </For>
        <For each={props.tracks ?? []}>
          {(track: MediaTrack) => (
            <track
              src={track.src}
              kind={track.kind ?? "captions"}
              srclang={track.srclang}
              label={track.label}
              default={track.default}
            />
          )}
        </For>
      </>
    );
  }

  return (
    <div
      ref={root.set}
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="media-player"
      data-kind={kind()}
      data-paused={paused() ? "" : undefined}
      role="region"
      aria-label={props.title}
      onKeyDown={onKeyDown}
    >
      <Show when={kind() === "video"}>
        <div class={cls().stage} data-slot="media-player-stage">
          <video {...mediaProps()}>{content()}</video>
        </div>
      </Show>
      <Show when={kind() === "audio"}>
        <audio {...mediaProps()}>{content()}</audio>
      </Show>
      <div
        class={cls().controls}
        data-slot="media-player-controls"
        role="group"
        aria-label={messages().mediaControls}
        dir="ltr"
      >
        <IconButton
          class={cls().button}
          label={paused() ? messages().play : messages().pause}
          variant="ghost"
          size="sm"
          shortcut="K"
          onPress={toggle}
        >
          {paused() ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
        </IconButton>
        <span class={cls().time} data-slot="media-player-time" aria-hidden="true">
          {clock(time())}
        </span>
        <Slider
          class={cls().seek}
          data-slot="media-player-seek"
          aria-label={messages().seek}
          dir="ltr"
          minValue={0}
          maxValue={Math.max(duration(), 0.001)}
          step={0.1}
          value={[time()]}
          getValueLabel={(seconds: number) =>
            messages().timeOf(spoken(seconds), spoken(duration()))
          }
          onChange={(value: number[]) => seekTo(value[0] ?? 0)}
        />
        <span class={cls().time} data-slot="media-player-duration" aria-hidden="true">
          {clock(duration())}
        </span>
        <div class={cls().end}>
          <IconButton
            class={cls().button}
            label={muted() ? messages().unmute : messages().mute}
            variant="ghost"
            size="sm"
            shortcut="M"
            onPress={toggleMute}
          >
            {muted() || volume() === 0 ? (
              <VolumeX aria-hidden="true" />
            ) : (
              <Volume2 aria-hidden="true" />
            )}
          </IconButton>
          <Slider
            class={cls().volume}
            data-slot="media-player-volume"
            aria-label={messages().volume}
            dir="ltr"
            minValue={0}
            maxValue={1}
            step={0.05}
            value={[muted() ? 0 : volume()]}
            formatOptions={{ style: "percent" }}
            onChange={(value: number[]) => setLevel(value[0] ?? 0)}
          />
          <Show when={(props.chapters?.length ?? 0) > 0}>
            <span class={cls().chapter} data-slot="media-player-chapter">
              {currentChapter()?.title}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <IconButton
                  class={cls().button}
                  label={messages().chapters}
                  variant="ghost"
                  size="sm"
                  tooltip={false}
                >
                  <ListOrdered aria-hidden="true" />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent aria-label={messages().chapters}>
                <DropdownMenuRadioGroup
                  value={String(currentChapter()?.start ?? "")}
                  onValueChange={(value: string) => seekTo(Number(value))}
                >
                  <For each={props.chapters ?? []}>
                    {(chapter: MediaChapter) => (
                      <DropdownMenuRadioItem value={String(chapter.start)}>
                        <span dir="ltr" class={cls().cueTime}>
                          {clock(chapter.start)}
                        </span>
                        {chapter.title}
                      </DropdownMenuRadioItem>
                    )}
                  </For>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </Show>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <IconButton
                class={cls().button}
                label={messages().playbackSpeed}
                variant="ghost"
                size="sm"
                tooltip={false}
              >
                <SpeedIcon aria-hidden="true" />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent aria-label={messages().playbackSpeed}>
              <DropdownMenuRadioGroup
                value={String(rate())}
                onValueChange={(value: string) => chooseRate(Number(value))}
              >
                <For each={props.rates ?? RATES}>
                  {(each: number) => (
                    <DropdownMenuRadioItem value={String(each)}>
                      {each === 1 ? messages().normalSpeed : `${digits().format(each)}×`}
                    </DropdownMenuRadioItem>
                  )}
                </For>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Show when={captionTracks().length > 0}>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <IconButton
                  class={cls().button}
                  label={messages().captions}
                  variant="ghost"
                  size="sm"
                  tooltip={false}
                  isPressed={caption() !== ""}
                >
                  <Captions aria-hidden="true" />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent aria-label={messages().captions}>
                <DropdownMenuRadioGroup value={caption()} onValueChange={setCaption}>
                  <DropdownMenuRadioItem value="">{messages().captionsOff}</DropdownMenuRadioItem>
                  <For each={captionTracks()}>
                    {(track: MediaTrack) => (
                      <DropdownMenuRadioItem value={track.srclang}>
                        {track.label}
                      </DropdownMenuRadioItem>
                    )}
                  </For>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </Show>
          <Show when={described()}>
            <IconButton
              class={cls().button}
              label={messages().audioDescription}
              variant="ghost"
              size="sm"
              isPressed={describing()}
              onPress={() => setDescribing(!describing())}
            >
              <AudioLines aria-hidden="true" />
            </IconButton>
          </Show>
          <Show when={(props.transcript?.length ?? 0) > 0}>
            <IconButton
              class={cls().button}
              label={messages().transcript}
              variant="ghost"
              size="sm"
              isPressed={showTranscript()}
              aria-controls={showTranscript() ? transcriptId : undefined}
              onPress={() => setShowTranscript(!showTranscript())}
            >
              <ScrollText aria-hidden="true" />
            </IconButton>
          </Show>
          <Show when={pipSupported()}>
            <IconButton
              class={cls().button}
              label={pip() ? messages().exitPictureInPicture : messages().pictureInPicture}
              variant="ghost"
              size="sm"
              isPressed={pip()}
              onPress={togglePip}
            >
              <PictureInPicture2 aria-hidden="true" />
            </IconButton>
          </Show>
          <Show when={mounted() && kind() === "video" && screen.supported}>
            <IconButton
              class={cls().button}
              label={screen.active() ? messages().exitFullscreen : messages().fullscreen}
              variant="ghost"
              size="sm"
              shortcut="F"
              onPress={() => void screen.toggle()}
            >
              {screen.active() ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
            </IconButton>
          </Show>
        </div>
      </div>
      <Show when={describing() && said() !== null}>
        <p class={cls().said} data-slot="media-player-description" dir="auto">
          <AudioLines aria-hidden="true" />
          {said()}
        </p>
      </Show>
      <Show when={showTranscript()}>
        <ol
          id={transcriptId}
          class={cls().transcript}
          data-slot="media-player-transcript"
          aria-label={messages().transcript}
          onScroll={() => {
            if (Date.now() - followedAt > 250) scrolledAt = Date.now();
          }}
        >
          <For each={props.transcript ?? []}>
            {(cue: MediaCue) => (
              <TranscriptLine
                cue={cue}
                current={currentCue() === cue}
                time={clock(cue.start)}
                classes={cls()}
                onSeek={() => seekTo(cue.start)}
                onCurrent={(line: HTMLElement) => {
                  if (Date.now() - scrolledAt < LEAVE_ALONE) return;
                  followedAt = Date.now();
                  line.scrollIntoView?.({ block: "nearest" });
                }}
              />
            )}
          </For>
        </ol>
      </Show>
      <span class={srOnly} role="status" data-slot="media-player-status">
        {currentChapter() === undefined ? "" : messages().chapterNow(currentChapter()?.title ?? "")}
      </span>
    </div>
  );
}

interface TranscriptLineProps {
  cue: MediaCue;
  current: boolean;
  time: string;
  classes: Slots;
  onSeek: () => void;
  onCurrent: (line: HTMLElement) => void;
}

function TranscriptLine(props: TranscriptLineProps) {
  const line = makeRef<HTMLButtonElement>();
  if (!isServer) {
    createEffect(
      () => [line(), props.current] as const,
      ([element, current]) => {
        if (element !== null && current) props.onCurrent(element);
      },
    );
  }
  return (
    <li data-slot="media-player-cue">
      <button
        ref={line.set}
        type="button"
        class={props.classes.cue}
        aria-current={props.current ? "true" : undefined}
        data-selected={props.current ? "" : undefined}
        onClick={() => props.onSeek()}
      >
        <span class={props.classes.cueTime} dir="ltr">
          {props.time}
        </span>
        <span>{props.cue.text}</span>
      </button>
    </li>
  );
}
