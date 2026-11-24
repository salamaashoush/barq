import { afterEach, describe, expect, test } from "bun:test";
import { ariaViolations, cleanup, render, screen, user, waitFor } from "@barqjs/testing";

import { hydrates } from "../test-arc.ts";
import { TextTracksEditor } from "./text-tracks.tsx";
import { settle } from "./test-editor.ts";
import {
  formatCueTime,
  mediaClock,
  parseCueTime,
  parseDescriptions,
  parseVtt,
  textDirection,
  vttOf,
} from "./vtt.ts";

const entry = JSON.stringify(new URL("./index.ts", import.meta.url).pathname);

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("WebVTT", () => {
  test("captions written in time order, right-to-left lines marked, and read back without the marks", () => {
    const vtt = vttOf([
      { start: 4, end: 6, text: "مرحبا 2" },
      { start: 0.5, end: 2.25, text: "Hello" },
      { start: 7, end: 7, text: "too short" },
      { start: 8, end: 9, text: "   " },
    ]);
    expect(vtt).toBe(
      "WEBVTT\n\n00:00:00.500 --> 00:00:02.250\nHello\n\n00:00:04.000 --> 00:00:06.000\n‏مرحبا 2\n",
    );
    expect(parseVtt(vtt)).toEqual([
      { start: 0.5, end: 2.25, text: "Hello" },
      { start: 4, end: 6, text: "مرحبا 2" },
    ]);
  });

  test("times as a person types and reads them, in either script's digits", () => {
    expect(formatCueTime(62.5)).toBe("1:02.5");
    expect(parseCueTime("1:02.5")).toBe(62.5);
    expect(parseCueTime("62,5")).toBe(62.5);
    expect(parseCueTime("١:٠٢")).toBe(62);
    expect(parseCueTime("soon")).toBeNull();
    expect(mediaClock(3725)).toBe("1:02:05");
    expect(textDirection("123 مرحبا")).toBe("rtl");
    expect(textDirection("123")).toBeNull();
  });

  test("an audio description's lines in time order, the first words for a time kept", () => {
    expect(parseDescriptions("1:30 A map\nnot a line\n0:05 The river\n1:30 Again")).toEqual([
      { at: 5, text: "The river" },
      { at: 90, text: "A map" },
    ]);
  });
});

interface SavedTrack {
  text: string;
  language: string;
}

describe("TextTracksEditor", () => {
  test("a caption line starts where the player is; saving writes WebVTT and refuses an end before its start", async () => {
    const saved: SavedTrack[] = [];
    let done = 0;
    render(() => (
      <TextTracksEditor
        title="River walk"
        src="/media/river.mp4"
        captions={{ language: "en" }}
        onSaveCaptions={async (file, language) => {
          saved.push({ text: await file.text(), language });
        }}
        onDone={() => (done += 1)}
      />
    ));
    await settle();
    const video = document.querySelector("video")!;
    Object.defineProperty(video, "currentTime", { configurable: true, writable: true, value: 12 });
    await user.click(screen.getByRole("button", { name: "Add a line" }));
    await settle();
    const start = screen.getByRole<HTMLInputElement>("textbox", { name: "Start of line 1" });
    expect(start.value).toBe("0:12.0");
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "End of line 1" }).value).toBe(
      "0:15.0",
    );
    await user.type(screen.getByRole("textbox", { name: "Words of line 1" }), "مرحبا");
    await user.clear(screen.getByRole("textbox", { name: "End of line 1" }));
    await user.type(screen.getByRole("textbox", { name: "End of line 1" }), "0:10");
    await user.click(screen.getByRole("button", { name: "Save captions" }));
    await settle();
    expect(screen.getByRole("alert").textContent).toBe(
      "Each line needs a start and an end, the end after the start",
    );
    expect(saved).toEqual([]);
    await user.clear(screen.getByRole("textbox", { name: "End of line 1" }));
    await user.type(screen.getByRole("textbox", { name: "End of line 1" }), "0:14");
    await user.click(screen.getByRole("button", { name: "Save captions" }));
    await waitFor(() => expect(done).toBe(1));
    expect(saved[0]?.language).toBe("en");
    expect(saved[0]?.text).toContain("00:00:12.000 --> 00:00:14.000\n‏مرحبا");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a draft from speech is offered, and once used says it must be checked", async () => {
    render(() => (
      <TextTracksEditor
        title="River walk"
        src="/media/river.mp4"
        captions={{ language: "en" }}
        onSaveCaptions={async () => undefined}
        drafts={{
          languages: ["en"],
          status: async () => ({
            available: true,
            draft: { state: "ready", vtt: "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi there\n" },
          }),
          request: async () => undefined,
        }}
      />
    ));
    await user.click(await screen.findByRole("button", { name: "Use the draft" }));
    await settle();
    expect(
      screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Words of line 1" }).value,
    ).toBe("Hi there");
    expect(screen.getByRole("note").textContent).toContain("check each line");
  });

  test("an audio description line goes in at the player's time; a line with no time is counted", async () => {
    const changes: string[] = [];
    render(() => (
      <TextTracksEditor
        title="River walk"
        src="/media/river.mp4"
        descriptions={"0:30 The bridge"}
        onDescriptionsChange={(text) => changes.push(text)}
        onSaveCaptions={async () => undefined}
        defaultTab="descriptions"
      />
    ));
    await settle();
    const video = document.querySelector("video")!;
    Object.defineProperty(video, "currentTime", { configurable: true, writable: true, value: 5 });
    await user.click(screen.getByRole("button", { name: /^Add at/ }));
    await settle();
    expect(changes.at(-1)).toBe("0:05 \n0:30 The bridge");
    const field = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Audio description" });
    await user.type(field, "no time here");
    await settle();
    expect(document.body.textContent).toContain("1 line has no time and is left out");
  });

  test("a recording with no picture has no audio description", async () => {
    render(() => (
      <TextTracksEditor
        title="Talk"
        src="/media/talk.mp3"
        kind="audio"
        onSaveCaptions={async () => undefined}
      />
    ));
    await settle();
    expect(screen.queryByRole("tab", { name: "Audio description" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Transcript" })).not.toBeNull();
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { TextTracksEditor } from ${entry};
      export function Page() {
        return <TextTracksEditor title="River walk" src="/media/river.mp4" onSaveCaptions={async () => undefined} />;
      }
    `);
    expect(result.container.querySelector('[data-slot="text-tracks"]')).not.toBeNull();
    result.unmount();
  });
});
