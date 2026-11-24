import {
  type Child,
  For,
  Show,
  createEffect,
  createSignal,
  createUniqueId,
  onSettled,
} from "@barqjs/core";
import { variants } from "@barqjs/css";
import { announce } from "@barqjs/aria/live";
import { Mic } from "@barqjs/lucide/icons/mic";
import { MicOff } from "@barqjs/lucide/icons/mic-off";
import { MonitorUp } from "@barqjs/lucide/icons/monitor-up";
import { Phone } from "@barqjs/lucide/icons/phone";
import { PhoneOff } from "@barqjs/lucide/icons/phone-off";
import { Settings } from "@barqjs/lucide/icons/settings";
import { Video } from "@barqjs/lucide/icons/video";
import { VideoOff } from "@barqjs/lucide/icons/video-off";
import { WifiLow } from "@barqjs/lucide/icons/wifi-low";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { Button } from "@barqjs/ui/button";
import { on } from "@barqjs/ui/conditions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { type RenderPart, partRender } from "@barqjs/ui/slot";
import { tokens } from "@barqjs/ui/theme/tokens";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, gap, glyph, layout, place, rounded, space, surface, type } from "../style/index.ts";
import { AvatarStack, type Person } from "../components/avatar-stack.tsx";
import { Duration, type Moment } from "../components/format.tsx";
import { IconButton } from "../components/icon-button.tsx";
import { useArcMessages } from "../components/messages.ts";
import { PersonAvatar } from "../components/person-avatar.tsx";
import { Status } from "../components/status.tsx";
import { Toolbar } from "../components/toolbar.tsx";
import { time } from "./model.ts";

/** Someone in a call, and the media the app hands arc to draw. */
export interface CallParticipant {
  id: string;
  person: Person;
  /** Their camera. WebRTC stays in the app; arc only draws what it is given. */
  stream?: MediaStream | null;
  /** Their shared screen, drawn in place of the camera while it is there. */
  screen?: MediaStream | null;
  muted?: boolean;
  videoOff?: boolean;
  speaking?: boolean;
  /** The reader: their camera is mirrored and their own audio never played. */
  local?: boolean;
  connection?: "good" | "poor";
}

export const callStyles = variants({
  slots: {
    stage: arc(layout.relative, layout.column, layout.container, gap[2], place.fill, bg.sunken, {
      minBlockSize: "0px",
    }),
    header: arc(layout.row, layout.between, gap[2], type.label),
    grid: arc(layout.grow, layout.minZeroBlock, gap[2], {
      display: "grid",
      gridAutoRows: "minmax(0, 1fr)",
      gridTemplateColumns: {
        default: "repeat(min(2, var(--arc-call-columns)), minmax(0, 1fr))",
        [on.cqLg]: "repeat(var(--arc-call-columns), minmax(0, 1fr))",
      },
    }),
    spotlight: arc(layout.grow, layout.minZeroBlock, layout.column),
    filmstrip: arc(layout.row, gap[2], layout.noShrink, {
      overflowX: "auto",
      blockSize: { default: space.x16, [on.cqMd]: "7rem" },
      "& > *": { aspectRatio: "16 / 9", blockSize: "100%", flexShrink: "0" },
    }),
    self: arc(rounded.md, {
      position: "absolute",
      insetBlockEnd: space.x3,
      insetInlineEnd: space.x3,
      inlineSize: { default: "28%", [on.cqMd]: "20%" },
      aspectRatio: "16 / 9",
    }),
    tile: arc(layout.relative, layout.centre, rounded.lg, layout.clip, bg.muted, {
      minBlockSize: "0px",
      minInlineSize: "0px",
      outline: "2px solid transparent",
      outlineOffset: "-2px",
      "&[data-speaking]": { outlineColor: tokens.primary },
    }),
    video: arc(place.fill, { objectFit: "cover", "&[data-mirrored]": { scale: "-1 1" } }),
    screen: arc(place.fill, { objectFit: "contain", backgroundColor: "black" }),
    avatar: arc({ inlineSize: "30%", blockSize: "auto", aspectRatio: "1", maxInlineSize: "6rem" }),
    caption: arc(layout.row, gap[1], type.caption, rounded.sm, glyph.sm, {
      position: "absolute",
      insetBlockEnd: space.x1_5,
      insetInlineStart: space.x1_5,
      maxInlineSize: `calc(100% - ${space.x3})`,
      paddingInline: space.x1_5,
      paddingBlock: space.x0_5,
      backgroundColor: "color-mix(in oklab, black 55%, transparent)",
      color: "white",
    }),
    name: arc(layout.clip, layout.nowrap, layout.minZero),
    controls: arc(layout.row, layout.centre),
    leave: arc({}),
    incoming: arc(surface.elevated, rounded.lg, layout.row, layout.wrap, gap[3], {
      padding: space.x3,
      maxInlineSize: "24rem",
    }),
    incomingText: arc(layout.column, layout.grow, layout.minZero),
    incomingTitle: arc(type.label),
    incomingDescription: arc(type.meta),
    incomingActions: arc(layout.row, gap[2], layout.pushEnd),
    banner: arc(surface.bordered, rounded.md, layout.row, layout.wrap, gap[3], {
      padding: space.x2,
    }),
    bannerDuration: arc(type.meta, type.numeric),
    bannerAction: arc(layout.pushEnd),
  },
});

type Slots = ReturnType<typeof callStyles>;

export interface ParticipantTileProps extends Customisable<Slots> {
  participant: CallParticipant;
  /** Draw the camera even when there is a shared screen. */
  camera?: boolean;
  /** Another element for the media, handed the attributes and the stream. */
  renders?: { video?: RenderPart<MediaStream> };
}

/**
 * One person in a call: their camera or shared screen, or their avatar while
 * the camera is off, their name, a muted microphone and a poor connection
 * marked, and a ring while they speak.
 *
 * ```tsx
 * <ParticipantTile participant={{ id: "a", person: alex, stream: remote, speaking: true }} />
 * ```
 *
 * A `figure` captioned with the name and the states in words. `renders.video`
 * hands the stream to an element of the app's own.
 */
export function ParticipantTile(props: ParticipantTileProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(callStyles(), props.classes);
  const participant = (): CallParticipant => props.participant;
  const sharing = (): boolean => props.camera !== true && (participant().screen ?? null) !== null;
  const stream = (): MediaStream | null | undefined =>
    sharing()
      ? participant().screen
      : participant().videoOff === true
        ? null
        : participant().stream;
  const states = (): string => {
    const out: string[] = [];
    if (participant().muted === true) out.push(messages().microphoneOff);
    if (participant().videoOff === true) out.push(messages().cameraOff);
    if (sharing()) out.push(messages().presenting(participant().person.name));
    if (participant().connection === "poor") out.push(messages().poorConnection);
    return out.length === 0 ? "" : `, ${out.join(", ")}`;
  };
  const media = (): Child => {
    const given = stream();
    if (given === null || given === undefined) return null;
    const attributes = {
      class: sharing() ? cls().screen : cls().video,
      "data-slot": "participant-tile-video",
    };
    if (props.renders?.video !== undefined) {
      return props.renders.video(partRender({ ...attributes }), given);
    }
    return (
      <StreamVideo
        class={attributes.class}
        stream={given}
        muted={participant().local === true}
        mirrored={participant().local === true && !sharing()}
      />
    );
  };
  return (
    <figure
      class={arc(cls().tile, props.class, props.className)}
      data-slot="participant-tile"
      data-speaking={participant().speaking === true ? "" : undefined}
      data-muted={participant().muted === true ? "" : undefined}
      data-sharing={sharing() ? "" : undefined}
      aria-label={`${participant().person.name}${states()}`}
    >
      <Show
        when={(stream() ?? null) !== null}
        fallback={
          <PersonAvatar
            person={participant().person}
            class={cls().avatar}
            slot="participant-tile-avatar"
          />
        }
      >
        {media()}
      </Show>
      <figcaption class={cls().caption} data-slot="participant-tile-caption" aria-hidden="true">
        <Show when={participant().muted === true}>
          <MicOff data-slot="participant-tile-muted" />
        </Show>
        <Show when={participant().connection === "poor"}>
          <WifiLow data-slot="participant-tile-connection" />
        </Show>
        <span class={cls().name}>{participant().person.name}</span>
      </figcaption>
    </figure>
  );
}

/** A `<video>` playing a `MediaStream`, which has no attribute and is set as `srcObject`. */
function StreamVideo(props: {
  class: string;
  stream: MediaStream;
  muted: boolean;
  mirrored: boolean;
}) {
  const element = makeRef<HTMLVideoElement>();
  createEffect(
    () => [element(), props.stream] as const,
    ([video, stream]) => {
      if (video === null) return;
      video.srcObject = stream;
    },
  );
  return (
    <video
      ref={element.set}
      class={props.class}
      data-slot="participant-tile-video"
      data-mirrored={props.mirrored ? "" : undefined}
      autoplay
      playsinline
      muted={props.muted}
    />
  );
}

export interface CallStageProps extends Customisable<Slots> {
  participants: readonly CallParticipant[];
  /**
   * `grid` gives everyone the same room; `speaker` gives the one speaking or
   * presenting the stage and the rest a strip. @default "speaker" while
   * someone presents, `grid` otherwise
   */
  layout?: "grid" | "speaker";
  /** Who has the stage in `speaker`. @default whoever presents, then whoever speaks */
  activeSpeakerId?: string;
  /** Above the tiles: the conversation's name. */
  title?: Child;
  /** Below the tiles: `CallControls`. */
  controls?: Child;
  /**
   * For a picture-in-picture window: the one on stage alone with the
   * reader's own camera in a corner.
   */
  compact?: boolean;
  renders?: ParticipantTileProps["renders"];
  "aria-label"?: string;
}

/**
 * A call: everyone in a grid that grows its columns with the room it has,
 * or the one speaking or presenting on stage above a strip of the rest.
 *
 * ```tsx
 * <CallStage
 *   title="#design"
 *   participants={participants()}
 *   activeSpeakerId={speaking()}
 *   controls={<CallControls muted={muted()} onToggleMute={toggleMute} onLeave={leave} />}
 * />
 * ```
 *
 * Its layout follows its own width rather than the window's, through a
 * query container, so a stage in a side panel or a picture-in-picture
 * window lays out for the room it has; `compact` is the smallest of those.
 */
export function CallStage(props: CallStageProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(callStyles(), props.classes);
  const presenter = (): CallParticipant | undefined =>
    props.participants.find((one) => (one.screen ?? null) !== null);
  const arrangement = (): "grid" | "speaker" =>
    props.compact === true
      ? "speaker"
      : (props.layout ?? (presenter() === undefined ? "grid" : "speaker"));
  const staged = (): CallParticipant | undefined =>
    presenter() ??
    props.participants.find((one) => one.id === props.activeSpeakerId) ??
    props.participants.find((one) => one.speaking === true && one.local !== true) ??
    props.participants.find((one) => one.local !== true) ??
    props.participants[0];
  const others = (): CallParticipant[] =>
    props.participants.filter((one) => one.id !== staged()?.id);
  const self = (): CallParticipant | undefined =>
    props.participants.find((one) => one.local === true && one.id !== staged()?.id);
  const columns = (): number => Math.max(1, Math.ceil(Math.sqrt(props.participants.length)));
  const tile = (participant: CallParticipant, className?: string) => (
    <ParticipantTile
      participant={participant}
      classes={props.classes}
      class={className}
      renders={props.renders}
    />
  );
  return (
    <section
      class={arc(cls().stage, props.class, props.className)}
      data-slot="call-stage"
      data-layout={arrangement()}
      data-compact={props.compact === true ? "" : undefined}
      aria-label={props["aria-label"] ?? messages().call}
    >
      <Show when={props.title !== undefined && props.compact !== true}>
        <header class={cls().header} data-slot="call-stage-header">
          <span>{props.title}</span>
          <span>{messages().participants(props.participants.length)}</span>
        </header>
      </Show>
      <Show
        when={arrangement() === "speaker"}
        fallback={
          <div
            class={cls().grid}
            data-slot="call-stage-grid"
            style={{ "--arc-call-columns": String(columns()) }}
          >
            <For each={() => props.participants}>{(one: CallParticipant) => tile(one)}</For>
          </div>
        }
      >
        <div class={cls().spotlight} data-slot="call-stage-spotlight">
          <Show when={staged()}>{(one: () => CallParticipant) => tile(one(), place.fill)}</Show>
        </div>
        <Show
          when={props.compact !== true}
          fallback={
            <Show when={self()}>{(one: () => CallParticipant) => tile(one(), cls().self)}</Show>
          }
        >
          <Show when={others().length > 0}>
            <div class={cls().filmstrip} data-slot="call-stage-filmstrip">
              <For each={others}>{(one: CallParticipant) => tile(one)}</For>
            </div>
          </Show>
        </Show>
      </Show>
      <Show when={props.controls !== undefined}>
        <div class={cls().controls} data-slot="call-stage-controls">
          {props.controls}
        </div>
      </Show>
    </section>
  );
}

/** A device a browser lists, as `enumerateDevices` answers. */
export interface CallDevice {
  deviceId: string;
  label: string;
}

export interface CallDevices {
  audioinput?: readonly CallDevice[];
  videoinput?: readonly CallDevice[];
  audiooutput?: readonly CallDevice[];
}

export interface CallControlsProps extends Customisable<Slots> {
  muted?: boolean;
  videoOff?: boolean;
  sharing?: boolean;
  onToggleMute?: () => void;
  onToggleVideo?: () => void;
  /** Left out, there is no screen share button: a phone's browser cannot share. */
  onToggleScreen?: () => void;
  onLeave: () => void;
  devices?: CallDevices;
  /** The device in use for each kind. */
  selected?: { audioinput?: string; videoinput?: string; audiooutput?: string };
  onDeviceChange?: (kind: keyof CallDevices, deviceId: string) => void;
}

/**
 * The call's controls: the microphone, the camera, the screen, the devices
 * and Leave, as a toolbar Tab enters once.
 *
 * ```tsx
 * <CallControls
 *   muted={muted()}
 *   onToggleMute={() => setMuted(!muted())}
 *   devices={devices()}
 *   selected={{ audioinput: mic() }}
 *   onDeviceChange={(kind, id) => switchDevice(kind, id)}
 *   onLeave={hangUp}
 * />
 * ```
 */
export function CallControls(props: CallControlsProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(callStyles(), props.classes);
  const kinds = (): (keyof CallDevices)[] =>
    (["audioinput", "videoinput", "audiooutput"] as const).filter(
      (kind) => (props.devices?.[kind]?.length ?? 0) > 0,
    );
  const kindLabel = (kind: keyof CallDevices): string =>
    kind === "audioinput"
      ? messages().microphone
      : kind === "videoinput"
        ? messages().camera
        : messages().speaker;
  return (
    <Toolbar
      class={arc(cls().controls, props.class, props.className)}
      aria-label={messages().callControls}
      variant="floating"
    >
      <Show when={props.onToggleMute !== undefined}>
        <IconButton
          label={props.muted === true ? messages().unmute : messages().mute}
          variant={props.muted === true ? "secondary" : "ghost"}
          tooltip={false}
          onPress={() => props.onToggleMute?.()}
        >
          {props.muted === true ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
        </IconButton>
      </Show>
      <Show when={props.onToggleVideo !== undefined}>
        <IconButton
          label={props.videoOff === true ? messages().turnOnCamera : messages().turnOffCamera}
          variant={props.videoOff === true ? "secondary" : "ghost"}
          tooltip={false}
          onPress={() => props.onToggleVideo?.()}
        >
          {props.videoOff === true ? <VideoOff aria-hidden="true" /> : <Video aria-hidden="true" />}
        </IconButton>
      </Show>
      <Show when={props.onToggleScreen !== undefined}>
        <IconButton
          label={props.sharing === true ? messages().stopSharing : messages().shareScreen}
          variant={props.sharing === true ? "secondary" : "ghost"}
          tooltip={false}
          onPress={() => props.onToggleScreen?.()}
        >
          <MonitorUp aria-hidden="true" />
        </IconButton>
      </Show>
      <Show when={kinds().length > 0}>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <IconButton label={messages().devices} variant="ghost" tooltip={false}>
              <Settings aria-hidden="true" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent aria-label={messages().devices}>
            <For each={kinds}>
              {(kind: keyof CallDevices, at: () => number) => (
                <>
                  <Show when={at() > 0}>
                    <DropdownMenuSeparator />
                  </Show>
                  <DropdownMenuLabel>{kindLabel(kind)}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    aria-label={kindLabel(kind)}
                    value={props.selected?.[kind] ?? ""}
                    onValueChange={(value: string) => props.onDeviceChange?.(kind, value)}
                  >
                    <For each={props.devices?.[kind] ?? []}>
                      {(device: CallDevice) => (
                        <DropdownMenuRadioItem value={device.deviceId} textValue={device.label}>
                          {device.label}
                        </DropdownMenuRadioItem>
                      )}
                    </For>
                  </DropdownMenuRadioGroup>
                </>
              )}
            </For>
          </DropdownMenuContent>
        </DropdownMenu>
      </Show>
      <IconButton
        class={cls().leave}
        label={messages().leaveCall}
        variant="destructive"
        tooltip={false}
        onPress={() => props.onLeave()}
      >
        <PhoneOff aria-hidden="true" />
      </IconButton>
    </Toolbar>
  );
}

export interface IncomingCallProps extends Customisable<Slots> {
  caller: Person;
  /** A video call rather than a voice one. */
  video?: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * A call coming in: who, whether it is video, Accept and Decline. The app
 * places it, in a toast or a corner; it says so aloud when it appears.
 *
 * ```tsx
 * <Show when={ringing()}>
 *   <IncomingCall caller={ringing().from} video onAccept={answer} onDecline={reject} />
 * </Show>
 * ```
 */
export function IncomingCall(props: IncomingCallProps) {
  const messages = useArcMessages();
  const titleId = createUniqueId();
  const cls = (): Slots => parts(callStyles(), props.classes);
  const kind = (): string =>
    props.video === true ? messages().incomingVideoCall : messages().incomingVoiceCall;
  onSettled(() => {
    const withdraw = announce(`${messages().incomingCall(props.caller.name)}. ${kind()}`);
    return withdraw;
  });
  return (
    <section
      class={arc(cls().incoming, props.class, props.className)}
      data-slot="incoming-call"
      aria-labelledby={titleId}
    >
      <PersonAvatar person={props.caller} size="lg" />
      <div class={cls().incomingText}>
        <p id={titleId} class={cls().incomingTitle} data-slot="incoming-call-title">
          {messages().incomingCall(props.caller.name)}
        </p>
        <p class={cls().incomingDescription} data-slot="incoming-call-description">
          {kind()}
        </p>
      </div>
      <div class={cls().incomingActions}>
        <Button variant="destructive" size="sm" onPress={() => props.onDecline()}>
          <PhoneOff aria-hidden="true" />
          {messages().decline}
        </Button>
        <Button size="sm" onPress={() => props.onAccept()}>
          {props.video === true ? <Video aria-hidden="true" /> : <Phone aria-hidden="true" />}
          {messages().accept}
        </Button>
      </div>
    </section>
  );
}

export interface CallBannerProps extends Customisable<Slots> {
  participants: readonly Person[];
  /** When the call started, for its running time. */
  startedAt?: Moment;
  /** The reader is in it: the button returns rather than joins. */
  joined?: boolean;
  /** The moment the running time is measured from on the server and while hydrating. */
  now?: Moment;
  onJoin: () => void;
}

/**
 * A call going on in a conversation, at the top of it: a pulsing status,
 * how long, who is in it, and Join or Return to call.
 */
export function CallBanner(props: CallBannerProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(callStyles(), props.classes);
  const [now, setNow] = createSignal(props.now === undefined ? Date.now() : time(props.now), {
    ownedWrite: true,
  });
  onSettled(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  });
  return (
    <div
      class={arc(cls().banner, props.class, props.className)}
      data-slot="call-banner"
      role="region"
      aria-label={messages().callInProgress}
    >
      <Status tone="success" pulse>
        {messages().callInProgress}
      </Status>
      <Show when={props.startedAt !== undefined}>
        <span class={cls().bannerDuration} data-slot="call-banner-duration">
          <Duration value={Math.max(0, now() - time(props.startedAt ?? 0))} length="digital" />
        </span>
      </Show>
      <AvatarStack people={props.participants} max={4} size="sm" />
      <Button class={cls().bannerAction} size="sm" onPress={() => props.onJoin()}>
        {props.joined === true ? messages().returnToCall : messages().joinCall}
      </Button>
    </div>
  );
}
