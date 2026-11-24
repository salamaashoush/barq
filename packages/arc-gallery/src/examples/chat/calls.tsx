import { Show, createEffect, createSignal } from "@barqjs/core";
import { Button, Inline, Stack, Text, toast } from "@barqjs/arc";
import {
  CallBanner,
  CallControls,
  type CallParticipant,
  CallStage,
  CallWindow,
  IncomingCall,
  ParticipantTile,
  useMediaDevices,
} from "@barqjs/arc/chat";
import { layout, surface } from "@barqjs/arc/style";
import { layer } from "@barqjs/css";

const demo = layer("demo");
const stage = demo(surface.card, layout.column, layout.clip, { height: "26rem" });
const tile = demo({ width: "16rem", aspectRatio: "16 / 9" });

/** A moving test card standing in for a camera, so the tiles play video without asking for one. */
function testCard(label: string, hue: number): { stream: MediaStream; stop: () => void } {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext("2d");
  let frame = 0;
  const timer = setInterval(() => {
    if (context === null) return;
    frame++;
    context.fillStyle = `hsl(${hue} 45% 35%)`;
    context.fillRect(0, 0, 640, 360);
    context.fillStyle = `hsl(${hue} 60% 60%)`;
    context.beginPath();
    context.arc(320 + Math.sin(frame / 20) * 120, 180, 60, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "white";
    context.font = "600 32px system-ui, sans-serif";
    context.fillText(label, 24, 336);
  }, 1000 / 15);
  const stream = canvas.captureStream(15);
  return {
    stream,
    stop: () => {
      clearInterval(timer);
      for (const track of stream.getTracks()) track.stop();
    },
  };
}

export default function Calls() {
  const media = useMediaDevices();
  const [muted, setMuted] = createSignal(false);
  const [videoOff, setVideoOff] = createSignal(true);
  const [sharing, setSharing] = createSignal(false);
  const [joined, setJoined] = createSignal(true);
  const [pinned, setPinned] = createSignal<string | undefined>(undefined);
  const [layoutMode, setLayoutMode] = createSignal<"grid" | "speaker">("grid");
  const [ringing, setRinging] = createSignal(false);
  const [floating, setFloating] = createSignal(false);
  const [streams, setStreams] = createSignal<Record<string, MediaStream>>({});

  createEffect(
    () => true,
    () => {
      const lina = testCard("Lina", 200);
      const maya = testCard("Maya's screen: Q4 roadmap", 30);
      setStreams({ lina: lina.stream, maya: maya.stream });
      return () => {
        lina.stop();
        maya.stop();
      };
    },
  );

  const participants = (): CallParticipant[] => [
    { id: "salama", person: { name: "Salama" }, local: true, muted: muted(), videoOff: videoOff() },
    { id: "lina", person: { name: "Lina" }, stream: streams()["lina"] ?? null, speaking: true },
    { id: "omar", person: { name: "Omar" }, videoOff: true, muted: true },
    { id: "maya", person: { name: "Maya" }, screen: streams()["maya"] ?? null, videoOff: true },
    { id: "jonas", person: { name: "Jonas" }, videoOff: true, connection: "poor" },
  ];

  return (
    <Stack gap={4}>
      <CallBanner
        participants={[{ name: "Lina" }, { name: "Omar" }, { name: "Maya" }, { name: "Jonas" }]}
        startedAt={new Date(Math.floor(Date.now() / 60_000) * 60_000 - 14 * 60_000).toISOString()}
        joined={joined()}
        onJoin={() => setJoined(true)}
      />
      <Inline gap={2} wrap>
        <Button
          variant="outline"
          size="sm"
          onPress={() => setLayoutMode(layoutMode() === "grid" ? "speaker" : "grid")}
        >
          {layoutMode() === "grid" ? "Speaker view" : "Grid view"}
        </Button>
        <Button variant="outline" size="sm" onPress={() => setRinging(true)}>
          Ring me
        </Button>
        <Button variant="outline" size="sm" onPress={() => setFloating(!floating())}>
          {floating() ? "Close the call window" : "Pop out the call"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onPress={() =>
            void (async () => {
              const allowed = await media.request({ audio: true, video: true });
              toast(allowed ? "Microphone and camera allowed" : "The browser said no");
            })()
          }
        >
          Use my devices
        </Button>
        <Text size="sm" color="muted">
          Microphone: {media.permissions().microphone}, camera: {media.permissions().camera}
        </Text>
      </Inline>
      <Show when={joined()} fallback={<Text color="muted">You are not in the call.</Text>}>
        <div class={stage}>
          <CallStage
            aria-label="Design review call"
            title="Design review"
            participants={participants()}
            layout={layoutMode()}
            activeSpeakerId="lina"
            pinnedId={pinned()}
            onPinnedChange={setPinned}
            controls={
              <CallControls
                muted={muted()}
                videoOff={videoOff()}
                sharing={sharing()}
                onToggleMute={() => setMuted(!muted())}
                onToggleVideo={() => setVideoOff(!videoOff())}
                onToggleScreen={() => setSharing(!sharing())}
                devices={media.devices()}
                selected={media.selected()}
                onDeviceChange={media.select}
                onLeave={() => {
                  setJoined(false);
                  toast("You left the call");
                }}
              />
            }
          />
        </div>
      </Show>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          One ParticipantTile on its own, without a menu
        </Text>
        <div class={tile}>
          <ParticipantTile
            participant={{ id: "nour", person: { name: "Nour" }, videoOff: true, muted: true }}
            menu={false}
          />
        </div>
      </Stack>
      <Show when={ringing()}>
        <IncomingCall
          caller={{ name: "Omar" }}
          video
          onAccept={() => {
            setRinging(false);
            toast.success("Joined Omar's call");
          }}
          onDecline={() => setRinging(false)}
        />
      </Show>
      <Show when={floating()}>
        <CallWindow title="#design" onExpand={() => setFloating(false)}>
          <CallStage compact participants={participants()} activeSpeakerId="lina" />
        </CallWindow>
      </Show>
    </Stack>
  );
}
