import { describe, expect, test } from "bun:test";
import { type Child, createSignal, flush } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import {
  CallBanner,
  CallControls,
  type CallParticipant,
  CallStage,
  IncomingCall,
  ParticipantTile,
} from "./call.tsx";

/** What the app hands arc: a stream it got from WebRTC. arc never opens one. */
const stream = (): MediaStream => new MediaStream();

const ALEX: CallParticipant = { id: "a", person: { name: "Alex Doe" }, stream: stream() };
const SAM: CallParticipant = { id: "s", person: { name: "Sam Lee" }, muted: true, videoOff: true };
const ME: CallParticipant = {
  id: "me",
  person: { name: "Salama Ashoush" },
  local: true,
  stream: stream(),
};

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

describe("ParticipantTile", () => {
  test("plays the stream it is given, the reader's own mirrored and silent", async () => {
    render(() => (
      <>
        <ParticipantTile participant={ALEX} />
        <ParticipantTile participant={ME} />
      </>
    ));
    await settle();
    const [remote, own] = [...document.querySelectorAll("video")];
    expect(remote?.srcObject).toBe(ALEX.stream ?? null);
    expect(remote?.muted).toBe(false);
    expect(own?.muted).toBe(true);
    expect(own?.hasAttribute("data-mirrored")).toBe(true);
    expect(screen.getByRole("figure", { name: "Alex Doe" })).toBeDefined();
  });

  test("with the camera off it shows the avatar, and says muted, presenting and speaking", async () => {
    const [speaking, setSpeaking] = createSignal(false);
    render(() => (
      <>
        <ParticipantTile participant={{ ...SAM, speaking: speaking(), connection: "poor" }} />
        <ParticipantTile participant={{ ...ALEX, screen: stream() }} />
      </>
    ));
    const sam = screen.getByRole("figure", {
      name: "Sam Lee, Microphone off, Camera off, Poor connection",
    });
    expect(sam.querySelector("video")).toBeNull();
    expect(sam.querySelector('[data-slot="participant-tile-avatar"]')).not.toBeNull();
    expect(sam.querySelector('[data-slot="participant-tile-muted"]')).not.toBeNull();
    setSpeaking(true);
    flush();
    expect(sam.hasAttribute("data-speaking")).toBe(true);
    expect(screen.getByRole("figure", { name: "Alex Doe, Alex Doe is presenting" })).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the app's own element draws the media through renders.video", () => {
    render(() => (
      <ParticipantTile
        participant={ALEX}
        renders={{ video: (part, given) => <canvas {...part.props} data-stream={given.id} /> }}
      />
    ));
    const canvas = document.querySelector("canvas");
    expect(canvas?.getAttribute("data-stream")).toBe(ALEX.stream?.id ?? "");
    expect(canvas?.getAttribute("data-slot")).toBe("participant-tile-video");
  });
});

describe("CallStage", () => {
  test("a grid with as many columns as the square root, everyone on it", async () => {
    render(() => (
      <CallStage
        title="#design"
        participants={[ALEX, SAM, ME, { ...ALEX, id: "x" }, { ...SAM, id: "y" }]}
      />
    ));
    const grid = slot("call-stage-grid");
    expect(grid.style.getPropertyValue("--arc-call-columns")).toBe("3");
    expect(within(grid).getAllByRole("figure")).toHaveLength(5);
    expect(slot("call-stage-header").textContent).toContain("5 participants");
    expect(screen.getByRole("region", { name: "Call" })).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("someone presenting takes the stage, the rest in a strip under it", () => {
    render(() => <CallStage participants={[ALEX, { ...SAM, screen: stream() }, ME]} />);
    expect(slot("call-stage").getAttribute("data-layout")).toBe("speaker");
    const staged = within(slot("call-stage-spotlight")).getByRole("figure");
    expect(staged.getAttribute("aria-label")).toContain("Sam Lee is presenting");
    expect(within(slot("call-stage-filmstrip")).getAllByRole("figure")).toHaveLength(2);
  });

  test("the active speaker takes the stage, and compact keeps only them and the reader", () => {
    const [compact, setCompact] = createSignal(false);
    render(() => (
      <CallStage
        layout="speaker"
        compact={compact()}
        activeSpeakerId="s"
        participants={[ALEX, SAM, ME]}
      />
    ));
    expect(
      within(slot("call-stage-spotlight")).getByRole("figure").getAttribute("aria-label"),
    ).toMatch(/^Sam Lee/u);
    setCompact(true);
    flush();
    expect(document.querySelectorAll('[data-slot="participant-tile"]')).toHaveLength(2);
    expect(slot("call-stage").hasAttribute("data-compact")).toBe(true);
  });
});

describe("CallControls", () => {
  test("toggles the microphone, the camera and the screen, chooses devices, and leaves", async () => {
    const calls: string[] = [];
    const [muted, setMuted] = createSignal(false);
    render(() => (
      <CallControls
        muted={muted()}
        onToggleMute={() => {
          calls.push("mute");
          setMuted(!muted());
        }}
        onToggleVideo={() => calls.push("video")}
        onToggleScreen={() => calls.push("screen")}
        onLeave={() => calls.push("leave")}
        devices={{
          audioinput: [
            { deviceId: "m1", label: "Built-in microphone" },
            { deviceId: "m2", label: "Headset" },
          ],
          videoinput: [{ deviceId: "c1", label: "FaceTime camera" }],
        }}
        selected={{ audioinput: "m1" }}
        onDeviceChange={(kind, id) => calls.push(`${kind}:${id}`)}
      />
    ));
    const bar = screen.getByRole("toolbar", { name: "Call controls" });
    await user.click(within(bar).getByRole("button", { name: "Mute" }));
    await settle();
    expect(within(bar).getByRole("button", { name: "Unmute" })).toBeDefined();
    user.tap(within(bar).getByRole("button", { name: "Turn off camera" }));
    await user.click(within(bar).getByRole("button", { name: "Share screen" }));
    await user.click(within(bar).getByRole("button", { name: "Devices" }));
    await settle();
    expect(
      screen
        .getByRole("menuitemradio", { name: "Built-in microphone" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    await user.click(screen.getByRole("menuitemradio", { name: "Headset" }));
    await settle();
    await user.click(within(bar).getByRole("button", { name: "Leave call" }));
    expect(calls).toEqual(["mute", "video", "screen", "audioinput:m2", "leave"]);
  });

  test("the arrows move along it as one Tab stop", async () => {
    render(() => (
      <CallControls onToggleMute={() => {}} onToggleVideo={() => {}} onLeave={() => {}} />
    ));
    const buttons = screen.getAllByRole("button");
    (buttons[0] as HTMLElement).focus();
    user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(buttons[1] as HTMLElement);
  });
});

describe("IncomingCall and CallBanner", () => {
  test("an incoming call says who is calling, aloud as well, with Accept and Decline", async () => {
    const calls: string[] = [];
    render(() => (
      <IncomingCall
        caller={{ name: "Alex Doe" }}
        video
        onAccept={() => calls.push("accept")}
        onDecline={() => calls.push("decline")}
      />
    ));
    await settle();
    const card = screen.getByRole("region", { name: "Alex Doe is calling" });
    expect(card.textContent).toContain("Incoming video call");
    expect(document.querySelector("[data-barq-live-announcer]")?.textContent).toContain(
      "Alex Doe is calling",
    );
    await user.click(within(card).getByRole("button", { name: "Decline" }));
    await user.click(within(card).getByRole("button", { name: "Accept" }));
    expect(calls).toEqual(["decline", "accept"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a call in a conversation shows its time, who is in it, and Join or Return", async () => {
    let joined = 0;
    const [inCall, setInCall] = createSignal(false);
    const now = new Date("2026-05-10T12:00:00Z");
    render(() => (
      <CallBanner
        participants={[{ name: "Alex Doe" }, { name: "Sam Lee" }]}
        startedAt={new Date(now.getTime() - 65_000)}
        now={now}
        joined={inCall()}
        onJoin={() => joined++}
      />
    ));
    const banner = screen.getByRole("region", { name: "Call in progress" });
    expect(slot("call-banner-duration").textContent).toBe("0:01:05");
    await user.click(within(banner).getByRole("button", { name: "Join" }));
    setInCall(true);
    flush();
    expect(within(banner).getByRole("button", { name: "Return to call" })).toBeDefined();
    expect(joined).toBe(1);
  });
});

describe("the call UI", () => {
  test("right to left in the locale's words, with a class per part", () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <CallStage
          title="x"
          participants={[ALEX, SAM]}
          class="mine"
          classes={{ stage: "s", grid: "g", tile: "t", caption: "c" }}
          controls={<CallControls onLeave={() => {}} classes={{ controls: "k" }} />}
        />
      </Arabic>
    ));
    // Laid out by logical sides, so the stage mirrors with its page.
    expect(slot("call-stage").closest('[dir="rtl"]')).not.toBeNull();
    expect(slot("call-stage-header").textContent).toContain("2 participants");
    expect(slot("call-stage").classList.contains("s")).toBe(true);
    expect(slot("call-stage").classList.contains("mine")).toBe(true);
    expect(slot("call-stage-grid").classList.contains("g")).toBe(true);
    expect(slot("participant-tile").classList.contains("t")).toBe(true);
    expect(slot("participant-tile-caption").classList.contains("c")).toBe(true);
    expect(slot("toolbar").classList.contains("k")).toBe(true);
  });

  test("a server's markup is hydrated in place", async () => {
    const result = await hydrates(`
      import { CallBanner, CallStage } from ${JSON.stringify(new URL("./index.ts", import.meta.url).pathname)};
      export function Page() {
        return (
          <main>
            <CallBanner
              participants={[{ name: "Alex" }]}
              startedAt={new Date("2026-05-10T11:59:00Z")}
              now={new Date("2026-05-10T12:00:00Z")}
              onJoin={() => {}}
            />
            <CallStage participants={[{ id: "a", person: { name: "Alex" }, videoOff: true }]} />
          </main>
        );
      }
    `);
    expect(result.container.querySelector('[data-slot="participant-tile"]')).not.toBeNull();
    result.unmount();
  });
});
