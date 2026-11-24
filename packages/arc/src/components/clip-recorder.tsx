import { For, Show, createEffect, createSignal, onCleanup } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useLocale } from "@barqjs/aria/i18n";
import { Circle } from "@barqjs/lucide/icons/circle";
import { Mic } from "@barqjs/lucide/icons/mic";
import { RotateCcw } from "@barqjs/lucide/icons/rotate-ccw";
import { Square } from "@barqjs/lucide/icons/square";
import { Video } from "@barqjs/lucide/icons/video";
import { raf } from "@barqjs/primitives/raf";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { Button } from "@barqjs/ui/button";
import { NativeSelect, NativeSelectOption } from "@barqjs/ui/native-select";
import { srOnly } from "@barqjs/ui/sr-only";
import { on } from "@barqjs/ui/conditions";
import { isServer } from "@barqjs/web";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, fg, gap, layout, place, rounded, space, surface, tone, type } from "../style/index.ts";
import { InlineAlert } from "./alert.tsx";
import { durationText } from "./format.tsx";
import { MediaPlayer } from "./media-player.tsx";
import { Status } from "./status.tsx";
import { useArcMessages } from "./messages.ts";

/** What a recording made. */
export interface RecordedClip {
  blob: Blob;
  /** An object URL for the blob, revoked when the recorder lets the clip go. */
  url: string;
  mimeType: string;
  /** Seconds. */
  duration: number;
}

export type RecorderStatus =
  | "idle"
  | "requesting"
  | "denied"
  | "missing"
  | "unsupported"
  | "ready"
  | "countdown"
  | "recording"
  | "recorded"
  | "attaching";

export const clipRecorderStyles = variants({
  slots: {
    root: arc(surface.card, layout.column, gap[3], layout.container, { padding: space.x4 }),
    preview: arc(rounded.md, place.block, bg.muted, { aspectRatio: "16 / 9", objectFit: "cover" }),
    stage: arc(layout.relative),
    countdown: arc(place.cover, layout.centre, type.stat, fg.default, {
      fontSize: "var(--text-5xl)",
    }),
    bar: arc(layout.row, layout.wrap, gap[2]),
    timer: arc(type.label, type.numeric, layout.nowrap),
    meter: arc(layout.grow, rounded.full, bg.muted, { height: space.x2, overflow: "hidden" }),
    level: arc(tone.success, bg.toneSolid, place.fill, {
      transformOrigin: { default: "left", [on.rtl]: "right" },
      transform: "scaleX(var(--arc-level, 0))",
    }),
    devices: arc({ maxWidth: "16rem" }),
    actions: arc(layout.row, layout.wrap, layout.end, gap[2], layout.pushEnd),
    hint: arc(type.meta, layout.flush),
    error: arc(type.caption, fg.danger, layout.flush),
  },
});

type Slots = ReturnType<typeof clipRecorderStyles>;

export interface ClipRecorderProps extends Customisable<Slots> {
  /** @default "audio" */
  kind?: "audio" | "video";
  /** Recording stops by itself after this many seconds. @default 300 */
  maxDuration?: number;
  /** Seconds counted down, out loud and on screen, before recording starts. @default 0 */
  countdown?: number;
  /** The container format asked of the browser, when it has it. */
  mimeType?: string;
  /** Called with every clip made, before it is attached. */
  onRecorded?: (clip: RecordedClip) => void;
  /**
   * Adds a Use button to a recorded clip. A promise holds the recorder
   * pending until it settles; the clip is let go once it resolves.
   */
  onAttach?: (clip: RecordedClip) => void | Promise<unknown>;
  /** @default arc's "Use recording" */
  attachLabel?: string;
  onStatusChange?: (status: RecorderStatus) => void;
}

type Recorder = InstanceType<typeof MediaRecorder>;

/**
 * An audio or video clip recorded in the page: permission asked when the
 * reader starts, a device to choose, a live picture or a level meter, a
 * timer against `maxDuration`, the clip played back with `MediaPlayer`, and
 * Record again or Use.
 *
 * ```tsx
 * <ClipRecorder kind="audio" maxDuration={120} onAttach={(clip) => upload(clip.blob)} />
 * ```
 *
 * Nothing is asked of the browser until the reader presses the button that
 * turns the microphone or the camera on; a refusal says how to allow it and
 * offers to try again. The tracks stop as soon as a recording ends and when
 * the recorder unmounts.
 */
export function ClipRecorder(props: ClipRecorderProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  const cls = (): Slots => parts(clipRecorderStyles(), props.classes);
  const kind = (): "audio" | "video" => props.kind ?? "audio";
  const max = (): number => props.maxDuration ?? 300;

  const [status, setStatusRaw] = createSignal<RecorderStatus>("idle", { ownedWrite: true });
  const [elapsed, setElapsed] = createSignal(0);
  const [left, setLeft] = createSignal(0);
  const [clip, setClip] = createSignal<RecordedClip | null>(null);
  const [devices, setDevices] = createSignal<readonly MediaDeviceInfo[]>([]);
  const [device, setDevice] = createSignal("");
  const [said, setSaid] = createSignal("");
  const [failed, setFailed] = createSignal(false);
  const level = makeRef<HTMLSpanElement>();
  const preview = makeRef<HTMLVideoElement>();

  let stream: MediaStream | null = null;
  let recorder: Recorder | null = null;
  let chunks: Blob[] = [];
  let startedAt = 0;
  let ticker: ReturnType<typeof setInterval> | undefined;
  let counter: ReturnType<typeof setInterval> | undefined;
  let audio: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let samples: Uint8Array<ArrayBuffer> | null = null;

  const setStatus = (next: RecorderStatus): void => {
    setStatusRaw(next);
    props.onStatusChange?.(next);
  };

  const meter = raf(() => {
    const node = level();
    if (analyser === null || samples === null || node === null) return;
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
    const rms = Math.sqrt(sum / samples.length);
    node.style.setProperty("--arc-level", String(Math.min(1, rms * 3)));
  });

  const supported = (): boolean =>
    !isServer &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof globalThis.MediaRecorder === "function";

  const release = (): void => {
    meter.stop();
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
    void audio?.close().catch(() => {});
    audio = null;
    analyser = null;
    const node = preview();
    if (node !== null) node.srcObject = null;
  };

  const letGo = (): void => {
    const held = clip();
    if (held !== null) URL.revokeObjectURL(held.url);
    setClip(null);
  };

  const clearTimers = (): void => {
    if (ticker !== undefined) clearInterval(ticker);
    if (counter !== undefined) clearInterval(counter);
    ticker = undefined;
    counter = undefined;
  };

  onCleanup(() => {
    clearTimers();
    if (recorder !== null && recorder.state !== "inactive") recorder.stop();
    release();
    letGo();
  });

  const listen = (): void => {
    const Context = globalThis.AudioContext as typeof AudioContext | undefined;
    if (stream === null || Context === undefined) return;
    if (stream.getAudioTracks().length === 0) return;
    audio = new Context();
    analyser = audio.createAnalyser();
    analyser.fftSize = 512;
    samples = new Uint8Array(analyser.fftSize);
    audio.createMediaStreamSource(stream).connect(analyser);
    meter.start();
  };

  const open = async (): Promise<void> => {
    if (!supported()) {
      setStatus("unsupported");
      return;
    }
    release();
    setStatus("requesting");
    const chosen = device();
    const wanted: MediaTrackConstraints | boolean =
      chosen === "" ? true : { deviceId: { exact: chosen } };
    try {
      stream = await navigator.mediaDevices.getUserMedia(
        kind() === "video" ? { audio: true, video: wanted } : { audio: wanted },
      );
    } catch (error) {
      const name = (error as { name?: string }).name;
      setStatus(name === "NotFoundError" || name === "OverconstrainedError" ? "missing" : "denied");
      return;
    }
    const all = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    setDevices(
      all.filter((one) => one.kind === (kind() === "video" ? "videoinput" : "audioinput")),
    );
    const node = preview();
    if (node !== null) {
      node.srcObject = stream;
      void node.play?.().catch(() => {});
    }
    listen();
    setStatus("ready");
  };

  const begin = (): void => {
    if (stream === null) return;
    chunks = [];
    const options =
      props.mimeType !== undefined && MediaRecorder.isTypeSupported(props.mimeType)
        ? { mimeType: props.mimeType }
        : undefined;
    const made = new MediaRecorder(stream, options);
    recorder = made;
    made.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    made.onstop = () => {
      clearTimers();
      const seconds = (performance.now() - startedAt) / 1000;
      const mimeType = made.mimeType === "" ? (chunks[0]?.type ?? "") : made.mimeType;
      const blob = new Blob(chunks, { type: mimeType });
      const recorded: RecordedClip = {
        blob,
        url: URL.createObjectURL(blob),
        mimeType,
        duration: seconds,
      };
      release();
      setClip(recorded);
      setStatus("recorded");
      setSaid(
        messages().recordedFor(durationText(seconds * 1000, locale().locale, { length: "long" })),
      );
      props.onRecorded?.(recorded);
    };
    startedAt = performance.now();
    setElapsed(0);
    made.start(1000);
    setStatus("recording");
    setSaid(messages().recordingStarted);
    ticker = setInterval(() => {
      const seconds = (performance.now() - startedAt) / 1000;
      setElapsed(seconds);
      if (seconds >= max()) stop();
    }, 250);
  };

  const record = (): void => {
    const from = props.countdown ?? 0;
    if (from <= 0) {
      begin();
      return;
    }
    setLeft(from);
    setSaid(String(from));
    setStatus("countdown");
    counter = setInterval(() => {
      const next = left() - 1;
      if (next <= 0) {
        clearTimers();
        begin();
        return;
      }
      setLeft(next);
      setSaid(String(next));
    }, 1000);
  };

  const stop = (): void => {
    if (status() === "countdown") {
      clearTimers();
      setStatus("ready");
      return;
    }
    if (recorder !== null && recorder.state !== "inactive") recorder.stop();
  };

  const again = (): void => {
    letGo();
    setFailed(false);
    void open();
  };

  const attach = (): void => {
    const held = clip();
    if (held === null || props.onAttach === undefined) return;
    setFailed(false);
    const outcome = props.onAttach(held);
    if (!(outcome instanceof Promise)) {
      letGo();
      setStatus("idle");
      return;
    }
    setStatus("attaching");
    outcome.then(
      () => {
        letGo();
        setStatus("idle");
      },
      () => {
        setFailed(true);
        setStatus("recorded");
      },
    );
  };

  if (!isServer) {
    createEffect(
      () => [preview(), status()] as const,
      ([node]) => {
        if (node !== null && stream !== null && node.srcObject !== stream) node.srcObject = stream;
      },
    );
  }

  const clock = (seconds: number): string =>
    durationText(seconds * 1000, locale().locale, { length: "digital", hours: "auto" });
  const live = (): boolean => ["ready", "countdown", "recording"].includes(status());
  const word = (): string => (kind() === "video" ? messages().camera : messages().microphone);

  return (
    <section
      class={arc(cls().root, props.class, props.className)}
      data-slot="clip-recorder"
      data-status={status()}
      data-kind={kind()}
      aria-label={kind() === "video" ? messages().recordVideo : messages().recordAudio}
    >
      <span class={srOnly} role="status" data-slot="clip-recorder-status">
        {said()}
      </span>
      <Show when={status() === "idle" || status() === "requesting"}>
        <p class={cls().hint}>{messages().recorderIntro(word())}</p>
        <div class={cls().actions}>
          <Button
            data-slot="clip-recorder-start"
            isPending={status() === "requesting"}
            onPress={() => void open()}
          >
            {kind() === "video" ? <Video aria-hidden="true" /> : <Mic aria-hidden="true" />}
            {messages().turnOn(word())}
          </Button>
        </div>
      </Show>
      <Show when={status() === "denied" || status() === "missing" || status() === "unsupported"}>
        <InlineAlert
          tone="danger"
          title={
            status() === "denied"
              ? messages().permissionDenied(word())
              : status() === "missing"
                ? messages().deviceMissing(word())
                : messages().recordingUnsupported
          }
          actions={
            status() === "unsupported" ? undefined : (
              <Button variant="outline" size="sm" onPress={() => void open()}>
                {messages().retry}
              </Button>
            )
          }
        >
          {status() === "denied" ? messages().permissionHelp(word()) : null}
        </InlineAlert>
      </Show>
      <Show when={kind() === "video" && live()}>
        <div class={cls().stage} data-slot="clip-recorder-stage">
          <video
            ref={preview.set}
            class={cls().preview}
            data-slot="clip-recorder-preview"
            muted
            playsinline
            autoplay
            aria-label={messages().cameraPreview}
          />
          <Show when={status() === "countdown"}>
            <span class={cls().countdown} data-slot="clip-recorder-countdown" aria-hidden="true">
              {left()}
            </span>
          </Show>
        </div>
      </Show>
      <Show when={live()}>
        <div class={cls().bar} data-slot="clip-recorder-bar">
          <Show when={status() === "recording"}>
            <Status tone="danger" pulse>
              {messages().recordingStarted}
            </Status>
          </Show>
          <span class={cls().timer} data-slot="clip-recorder-timer">
            {`${clock(elapsed())} / ${clock(max())}`}
          </span>
          <span class={cls().meter} data-slot="clip-recorder-meter" aria-hidden="true">
            <span ref={level.set} class={cls().level} />
          </span>
          <Show when={devices().length > 1 && status() === "ready"}>
            <NativeSelect
              class={cls().devices}
              aria-label={messages().chooseDevice(word())}
              value={device()}
              onChange={(event: Event) => {
                setDevice((event.currentTarget as HTMLSelectElement).value);
                void open();
              }}
            >
              <For each={devices()}>
                {(one: MediaDeviceInfo, index: () => number) => (
                  <NativeSelectOption value={one.deviceId}>
                    {one.label === "" ? `${word()} ${String(index() + 1)}` : one.label}
                  </NativeSelectOption>
                )}
              </For>
            </NativeSelect>
          </Show>
          <div class={cls().actions}>
            <Show
              when={status() === "ready"}
              fallback={
                <Button variant="destructive" data-slot="clip-recorder-stop" onPress={stop}>
                  <Square aria-hidden="true" />
                  {status() === "countdown" ? messages().cancel : messages().stopRecording}
                </Button>
              }
            >
              <Button data-slot="clip-recorder-record" onPress={record}>
                <Circle aria-hidden="true" />
                {messages().startRecording}
              </Button>
            </Show>
          </div>
        </div>
      </Show>
      <Show when={clip() !== null && (status() === "recorded" || status() === "attaching")}>
        <MediaPlayer kind={kind()} title={messages().recordingPreview} src={clip()?.url ?? ""} />
        <Show when={failed()}>
          <p class={cls().error} role="alert" data-slot="clip-recorder-error">
            {messages().attachFailed}
          </p>
        </Show>
        <div class={cls().actions}>
          <Button
            variant="outline"
            data-slot="clip-recorder-again"
            isDisabled={status() === "attaching"}
            onPress={again}
          >
            <RotateCcw aria-hidden="true" />
            {messages().recordAgain}
          </Button>
          <Show when={props.onAttach !== undefined}>
            <Button
              data-slot="clip-recorder-attach"
              isPending={status() === "attaching"}
              onPress={attach}
            >
              {props.attachLabel ?? messages().useRecording}
            </Button>
          </Show>
        </div>
      </Show>
    </section>
  );
}
