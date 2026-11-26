import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";

import { layout } from "../style/index.ts";
import { hydrates, settle, wears } from "../test-arc.ts";
import { type MediaCue, MediaPlayer, mediaPlayerStyles } from "./media-player.tsx";

const CUES: MediaCue[] = [
  { start: 0, end: 4, text: "Welcome to the course." },
  { start: 4, end: 9, text: "First, open a project." },
  { start: 9, end: 20, text: "Then invite your team." },
];

function media(): HTMLMediaElement {
  return document.querySelector('[data-slot="media-player-media"]') as HTMLMediaElement;
}

/** Give the element a length, as loading its metadata would. */
async function load(seconds = 200): Promise<HTMLMediaElement> {
  const node = media();
  Object.defineProperty(node, "duration", { configurable: true, value: seconds });
  node.dispatchEvent(new Event("loadedmetadata"));
  await settle();
  return node;
}

async function at(seconds: number): Promise<void> {
  const node = media();
  node.currentTime = seconds;
  node.dispatchEvent(new Event("timeupdate"));
  await settle();
}

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

function player(extra: Partial<Parameters<typeof MediaPlayer>[0]> = {}) {
  return (
    <MediaPlayer
      title="Getting started"
      src={[
        { src: "/clip.webm", type: "video/webm" },
        { src: "/clip.mp4", type: "video/mp4" },
      ]}
      poster="/clip.jpg"
      tracks={[
        { src: "/clip.en.vtt", srclang: "en", label: "English" },
        { src: "/clip.ar.vtt", srclang: "ar", label: "العربية" },
      ]}
      chapters={[
        { start: 0, title: "Welcome" },
        { start: 60, title: "Projects" },
      ]}
      transcript={CUES}
      {...extra}
    />
  );
}

interface HeldMode {
  mode: string;
}

describe("MediaPlayer", () => {
  test("the seek bar at the start says no time in words, and the controls wrap in a narrow player", async () => {
    render(() => player());
    await load(200);
    const seek = screen.getByRole("slider", { name: "Seek" });
    expect(seek.getAttribute("aria-valuetext")).toBe("0 seconds of 3 minutes, 20 seconds");
    const end = document.querySelector('[data-slot="media-player-controls"]')?.lastElementChild;
    expect(wears(end, layout.wrap)).toBe(true);
  });

  test("a named region holding the video and a group of controls, the seek bar said in words", async () => {
    render(() => player());
    const region = screen.getByRole("region", { name: "Getting started" });
    const video = region.querySelector("video") as HTMLVideoElement;
    expect([...video.querySelectorAll("source")].map((one) => one.getAttribute("type"))).toEqual([
      "video/webm",
      "video/mp4",
    ]);
    expect(video.querySelectorAll("track")).toHaveLength(2);
    expect(video.controls).toBe(false);
    await load(200);
    await at(65);
    const controls = screen.getByRole("group", { name: "Media controls" });
    expect(controls.getAttribute("dir")).toBe("ltr");
    const seek = within(controls).getByRole("slider", { name: "Seek" });
    expect(seek.getAttribute("aria-valuetext")).toBe(
      "1 minute, 5 seconds of 3 minutes, 20 seconds",
    );
    expect(slot("media-player-time").textContent).toBe("01:05");
    expect(slot("media-player-duration").textContent).toBe("03:20");
    expect(slot("media-player-chapter").textContent).toBe("Projects");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the play button and K play and pause; a click on the picture does too", async () => {
    render(() => player());
    await load();
    const play = screen.getByRole("button", { name: "Play" });
    await user.click(play);
    await settle();
    expect(media().paused).toBe(false);
    media().dispatchEvent(new Event("play"));
    await settle();
    expect(screen.getByRole("button", { name: "Pause" })).toBe(play);
    play.focus();
    await user.keyboard("k");
    await settle();
    expect(media().paused).toBe(true);
    media().dispatchEvent(new Event("pause"));
    await settle();
    await user.click(media());
    await settle();
    expect(media().paused).toBe(false);
  });

  test("the keys seek, jump, change the volume and mute, from anywhere inside it", async () => {
    render(() => player());
    await load(200);
    screen.getByRole("button", { name: "Play" }).focus();
    await user.keyboard("l");
    expect(media().currentTime).toBe(10);
    await user.keyboard("{ArrowRight}");
    expect(media().currentTime).toBe(15);
    await user.keyboard("j");
    expect(media().currentTime).toBe(5);
    await user.keyboard("5");
    expect(media().currentTime).toBe(100);
    await user.keyboard("{End}");
    expect(media().currentTime).toBe(200);
    await user.keyboard("{Home}");
    expect(media().currentTime).toBe(0);
    await user.keyboard("{ArrowDown}");
    expect(media().volume).toBeCloseTo(0.95);
    await user.keyboard("m");
    await settle();
    expect(media().muted).toBe(true);
    expect(screen.getByRole("button", { name: "Unmute" })).toBeDefined();
  });

  test("the seek bar moves the media, and its own arrows are its own", async () => {
    render(() => player());
    await load(200);
    const seek = screen.getByRole<HTMLInputElement>("slider", { name: "Seek" });
    seek.value = "42";
    seek.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    expect(media().currentTime).toBe(42);
    seek.focus();
    await user.keyboard("{Home}");
    await settle();
    expect(media().currentTime).not.toBe(200);
  });

  test("speed, captions and chapters are menus that follow the page", async () => {
    render(() => player());
    await load(200);
    await user.click(screen.getByRole("button", { name: "Playback speed" }));
    await settle();
    await user.click(screen.getByRole("menuitemradio", { name: "1.5×" }));
    await settle();
    expect(media().playbackRate).toBe(1.5);

    // happy-dom hands out a new TextTrack on every read of `track`, so a mode
    // set on one is lost; a browser keeps one per element.
    const held = new WeakMap<HTMLTrackElement, HeldMode>();
    const original = Object.getOwnPropertyDescriptor(HTMLTrackElement.prototype, "track");
    Object.defineProperty(HTMLTrackElement.prototype, "track", {
      configurable: true,
      get(this: HTMLTrackElement) {
        const own = held.get(this) ?? { mode: "disabled" };
        held.set(this, own);
        return own;
      },
    });
    await user.click(screen.getByRole("button", { name: "Captions" }));
    await settle();
    await user.click(screen.getByRole("menuitemradio", { name: "العربية" }));
    await settle();
    const tracks = [...media().querySelectorAll("track")];
    const modes = tracks.map((track) => `${track.srclang}:${track.track.mode}`);
    expect(modes).toEqual(["en:disabled", "ar:showing"]);
    screen.getByRole("button", { name: "Play" }).focus();
    await user.keyboard("c");
    await settle();
    expect(tracks.every((track) => track.track.mode === "disabled")).toBe(true);
    if (original !== undefined) {
      Object.defineProperty(HTMLTrackElement.prototype, "track", original);
    }

    await user.click(screen.getByRole("button", { name: "Chapters" }));
    await settle();
    await user.click(screen.getByRole("menuitemradio", { name: /Projects/ }));
    await settle();
    expect(media().currentTime).toBe(60);
  });

  test("the transcript follows the media and a line seeks to itself", async () => {
    render(() => player());
    await load(20);
    await user.click(screen.getByRole("button", { name: "Transcript" }));
    await settle();
    const list = screen.getByRole("list", { name: "Transcript" });
    await at(5);
    const current = within(list).getByRole("button", { current: true });
    expect(current.textContent).toContain("First, open a project.");
    await user.click(within(list).getByRole("button", { name: /Then invite/ }));
    await settle();
    expect(media().currentTime).toBe(9);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("two taps on a side jump ten seconds and leave it playing as it was", async () => {
    render(() => player());
    await load(200);
    await at(50);
    const video = media();
    video.getBoundingClientRect = () => ({ left: 0, width: 300, top: 0, height: 100 }) as DOMRect;
    function tap(x: number): void {
      video.dispatchEvent(
        new PointerEvent("pointerup", { pointerType: "touch", clientX: x, bubbles: true }),
      );
    }
    tap(280);
    tap(280);
    await settle();
    expect(video.currentTime).toBe(60);
    expect(video.paused).toBe(true);
  });

  test("under a coarse pointer the volume slider gives way to the mute button", () => {
    render(() => player());
    const volume = mediaPlayerStyles().volume;
    const sheet = collectCss();
    expect(
      volume
        .split(" ")
        .some((one) => sheet.includes(`@media (pointer: coarse){.${one}{display:none}`)),
    ).toBe(true);
  });

  test("on a right-to-left page the controls and the seek bar stay left to right", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => <Arabic>{player()}</Arabic>);
    expect(slot("media-player-controls").getAttribute("dir")).toBe("ltr");
    expect(slot("media-player-seek").getAttribute("data-orientation")).toBe("horizontal");
    expect(slot("media-player-time").textContent).toBe("٠٠:٠٠");
  });

  test("plays audio in the same controls, with no picture controls", () => {
    render(() => <MediaPlayer kind="audio" title="Episode 4" src="/episode.mp3" />);
    expect(document.querySelector("audio")).not.toBeNull();
    expect(document.querySelector("video")).toBeNull();
    expect(screen.queryByRole("button", { name: "Full screen" })).toBeNull();
    expect(slot("media-player").getAttribute("data-kind")).toBe("audio");
  });

  test("takes a class per part", () => {
    render(() =>
      player({
        class: "mine",
        classes: { root: "r", stage: "s", media: "m", controls: "c", seek: "k", time: "t" },
      }),
    );
    const pairs = [
      ["media-player", "r"],
      ["media-player-stage", "s"],
      ["media-player-media", "m"],
      ["media-player-controls", "c"],
      ["media-player-seek", "k"],
      ["media-player-time", "t"],
    ] as const;
    for (const [name, cls] of pairs) expect(slot(name).classList.contains(cls)).toBe(true);
    expect(slot("media-player").classList.contains("mine")).toBe(true);
  });

  test("an audio description, turned on, pauses at each line played through, shows it, then plays on", async () => {
    // One TextTrack per element, as a browser keeps; happy-dom makes one a read.
    const held = new WeakMap<HTMLTrackElement, EventTarget & HeldMode>();
    const original = Object.getOwnPropertyDescriptor(HTMLTrackElement.prototype, "track");
    Object.defineProperty(HTMLTrackElement.prototype, "track", {
      configurable: true,
      get(this: HTMLTrackElement) {
        const own = held.get(this) ?? Object.assign(new EventTarget(), { mode: "disabled" });
        held.set(this, own);
        return own;
      },
    });
    render(() => (
      <MediaPlayer
        title="Clip"
        src="/clip.mp4"
        descriptions={[{ at: 5, text: "A map of the river appears." }]}
        tracks={[{ src: "/clip.ad.vtt", kind: "descriptions", srclang: "en", label: "English" }]}
      />
    ));
    const video = await load();
    const button = screen.getByRole("button", { name: "Audio description" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    // A descriptions track is never a caption to choose.
    expect(screen.queryByRole("button", { name: "Captions" })).toBeNull();
    await user.click(button);
    await settle();
    expect(button.getAttribute("aria-pressed")).toBe("true");
    const track = video.querySelector("track")!;
    expect(track.track.mode).toBe("hidden");
    let resumed = 0;
    Object.defineProperty(video, "paused", { configurable: true, value: false });
    video.pause = () => Object.defineProperty(video, "paused", { configurable: true, value: true });
    video.play = () => {
      resumed++;
      return Promise.resolve();
    };
    await at(4);
    await at(5.2);
    expect(video.paused).toBe(true);
    const line = document.querySelector('[data-slot="media-player-description"]');
    expect(line?.textContent).toBe("A map of the river appears.");
    await new Promise((resolve) => setTimeout(resolve, 4500));
    await settle();
    expect(resumed).toBe(1);
    expect(document.querySelector('[data-slot="media-player-description"]')).toBeNull();
    // A seek past a line does not read it.
    Object.defineProperty(video, "paused", { configurable: true, value: false });
    await at(60);
    expect(document.querySelector('[data-slot="media-player-description"]')).toBeNull();
    if (original !== undefined) {
      Object.defineProperty(HTMLTrackElement.prototype, "track", original);
    }
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { MediaPlayer } from "<arc>";
      export function Page() {
        return (
          <MediaPlayer
            title="Clip"
            src="/clip.mp4"
            tracks={[{ src: "/clip.vtt", srclang: "en", label: "English", default: true }]}
            chapters={[{ start: 0, title: "Start" }]}
          />
        );
      }
    `);
    expect(result.container.querySelector("video track")?.getAttribute("srclang")).toBe("en");
    result.unmount();
  });
});
