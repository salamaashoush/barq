import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type Child } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor } from "@barqjs/testing";

import { touch } from "@barqjs/ui/shared-touch";

import { hydrates, settle, wears } from "../test-arc.ts";
import { ClipRecorder, type RecordedClip, type RecorderStatus } from "./clip-recorder.tsx";

interface FakeTrack {
  kind: "audio" | "video";
  stopped: boolean;
  stop(): void;
}

let tracks: FakeTrack[] = [];
let refuse: string | null = null;
let recorders: FakeRecorder[] = [];
const asked: MediaStreamConstraints[] = [];

class FakeRecorder {
  static isTypeSupported = (): boolean => true;
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(readonly stream: unknown) {
    recorders.push(this);
  }
  start(): void {
    this.state = "recording";
  }
  stop(): void {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["sound"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

function track(kind: "audio" | "video"): FakeTrack {
  const made: FakeTrack = {
    kind,
    stopped: false,
    stop() {
      made.stopped = true;
    },
  };
  return made;
}

const saved = {
  devices: navigator.mediaDevices,
  recorder: (globalThis as { MediaRecorder?: unknown }).MediaRecorder,
  audio: (globalThis as { AudioContext?: unknown }).AudioContext,
};

beforeEach(() => {
  tracks = [];
  refuse = null;
  recorders = [];
  asked.length = 0;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async (constraints: MediaStreamConstraints) => {
        asked.push(constraints);
        if (refuse !== null) throw Object.assign(new Error(refuse), { name: refuse });
        tracks = [track("audio"), ...(constraints.video === undefined ? [] : [track("video")])];
        return Object.assign(new MediaStream(), {
          getTracks: () => tracks,
          getAudioTracks: () => tracks.filter((one) => one.kind === "audio"),
        });
      },
      enumerateDevices: async () => [
        { kind: "audioinput", deviceId: "a", label: "Built-in" },
        { kind: "audioinput", deviceId: "b", label: "Headset" },
      ],
    },
  });
  (globalThis as { MediaRecorder?: unknown }).MediaRecorder = FakeRecorder;
  (globalThis as { AudioContext?: unknown }).AudioContext = class {
    createAnalyser() {
      return {
        fftSize: 0,
        getByteTimeDomainData(into: Uint8Array) {
          into.forEach((_, index) => {
            into[index] = index % 2 === 0 ? 200 : 56;
          });
        },
      };
    }
    createMediaStreamSource() {
      return { connect() {} };
    }
    close() {
      return Promise.resolve();
    }
  };
});

afterEach(() => {
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: saved.devices });
  (globalThis as { MediaRecorder?: unknown }).MediaRecorder = saved.recorder;
  (globalThis as { AudioContext?: unknown }).AudioContext = saved.audio;
});

function slot(name: string): HTMLElement | null {
  return document.querySelector(`[data-slot="${name}"]`);
}

describe("ClipRecorder", () => {
  test("asks for the microphone only when pressed, then records, stops and plays back", async () => {
    const clips: RecordedClip[] = [];
    const statuses: RecorderStatus[] = [];
    render(() => (
      <ClipRecorder
        onRecorded={(clip) => clips.push(clip)}
        onStatusChange={(s) => statuses.push(s)}
      />
    ));
    const region = screen.getByRole("region", { name: "Record audio" });
    expect(region.getAttribute("data-status")).toBe("idle");
    expect(asked).toHaveLength(0);
    expect(await ariaViolations(document.body)).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Turn on the microphone" }));
    await waitFor(() => expect(region.getAttribute("data-status")).toBe("ready"));
    expect(asked).toEqual([{ audio: true }]);
    expect(screen.getByRole("combobox", { name: "Choose a microphone" })).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Record" }));
    await settle();
    expect(region.getAttribute("data-status")).toBe("recording");
    expect(slot("clip-recorder-status")?.textContent).toBe("Recording");
    expect(slot("clip-recorder-timer")?.textContent).toBe("00:00 / 05:00");

    await user.click(screen.getByRole("button", { name: "Stop" }));
    await settle();
    expect(region.getAttribute("data-status")).toBe("recorded");
    expect(clips).toHaveLength(1);
    expect(clips[0]?.mimeType).toBe("audio/webm");
    expect(tracks.every((one) => one.stopped)).toBe(true);
    expect(screen.getByRole("region", { name: "Recording" })).toBeDefined();
    expect(slot("clip-recorder-status")?.textContent).toMatch(/^Recorded/);
    expect(statuses).toEqual(["requesting", "ready", "recording", "recorded"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a refusal says how to allow it and tries again; a missing device says so", async () => {
    refuse = "NotAllowedError";
    render(() => <ClipRecorder kind="video" />);
    await user.click(screen.getByRole("button", { name: "Turn on the camera" }));
    await waitFor(() => expect(screen.getByText("The camera is blocked")).toBeDefined());
    expect(screen.getByText(/Allow the camera for this site/)).toBeDefined();
    refuse = "NotFoundError";
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("No camera was found")).toBeDefined());
  });

  test("video shows the camera live, counts down, and stops itself at its limit", async () => {
    render(() => <ClipRecorder kind="video" countdown={1} maxDuration={0.3} />);
    await user.click(screen.getByRole("button", { name: "Turn on the camera" }));
    await waitFor(() => expect(slot("clip-recorder-preview")).not.toBeNull());
    expect(asked[0]).toEqual({ audio: true, video: true });
    const video = slot("clip-recorder-preview") as HTMLVideoElement;
    expect(video.muted).toBe(true);
    await user.click(screen.getByRole("button", { name: "Record" }));
    await settle();
    expect(slot("clip-recorder")?.getAttribute("data-status")).toBe("countdown");
    expect(slot("clip-recorder-countdown")?.textContent).toBe("1");
    await waitFor(
      () => expect(slot("clip-recorder")?.getAttribute("data-status")).toBe("recording"),
      {
        timeout: 2000,
      },
    );
    await waitFor(
      () => expect(slot("clip-recorder")?.getAttribute("data-status")).toBe("recorded"),
      {
        timeout: 2000,
      },
    );
  });

  test("Use hands the clip over and stays pending until it is taken; Record again starts over", async () => {
    let finish: () => void = () => {};
    const used: RecordedClip[] = [];
    render(() => (
      <ClipRecorder
        onAttach={(clip) => {
          used.push(clip);
          return new Promise<void>((resolve) => {
            finish = resolve;
          });
        }}
      />
    ));
    await user.click(screen.getByRole("button", { name: "Turn on the microphone" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Record" })).toBeDefined());
    user.tap(screen.getByRole("button", { name: "Record" }));
    await settle();
    user.tap(screen.getByRole("button", { name: "Stop" }));
    await settle();
    await user.click(screen.getByRole("button", { name: "Record again" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Record" })).toBeDefined());
    user.tap(screen.getByRole("button", { name: "Record" }));
    await settle();
    user.tap(screen.getByRole("button", { name: "Stop" }));
    await settle();
    await user.click(screen.getByRole("button", { name: "Use recording" }));
    await settle();
    expect(used).toHaveLength(1);
    expect(slot("clip-recorder")?.getAttribute("data-status")).toBe("attaching");
    finish();
    await waitFor(() => expect(slot("clip-recorder")?.getAttribute("data-status")).toBe("idle"));
  });

  test("the level meter follows the microphone", async () => {
    render(() => <ClipRecorder />);
    await user.click(screen.getByRole("button", { name: "Turn on the microphone" }));
    await waitFor(() => expect(slot("clip-recorder-meter")).not.toBeNull());
    const level = slot("clip-recorder-meter")?.firstElementChild as HTMLElement;
    await waitFor(() =>
      expect(Number(level.style.getPropertyValue("--arc-level"))).toBeGreaterThan(0),
    );
  });

  test("runs right to left, its timer in the locale's digits", async () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <ClipRecorder />
      </Arabic>
    ));
    await user.click(screen.getByRole("button", { name: "Turn on the microphone" }));
    await waitFor(() => expect(slot("clip-recorder-timer")?.textContent).toBe("٠٠:٠٠ / ٠٥:٠٠"));
  });

  test("its buttons stay a finger's size, and it takes a class per part", async () => {
    render(() => (
      <ClipRecorder class="mine" classes={{ root: "r", hint: "h", actions: "a", timer: "t" }} />
    ));
    expect(slot("clip-recorder")?.classList.contains("r")).toBe(true);
    expect(slot("clip-recorder")?.classList.contains("mine")).toBe(true);
    expect(document.querySelector(".h")).not.toBeNull();
    expect(document.querySelector(".a")).not.toBeNull();
    const start = screen.getByRole("button", { name: "Turn on the microphone" });
    expect(wears(start, touch.target)).toBe(true);
    user.tap(start);
    await waitFor(() => expect(slot("clip-recorder-timer")?.classList.contains("t")).toBe(true));
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { ClipRecorder } from "<arc>";
      export function Page() {
        return <ClipRecorder kind="video" />;
      }
    `);
    expect(
      result.container.querySelector('[data-slot="clip-recorder"]')?.getAttribute("data-status"),
    ).toBe("idle");
    result.unmount();
  });
});
