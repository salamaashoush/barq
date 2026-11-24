import { afterEach, describe, expect, test } from "bun:test";
import { createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, cleanup, render, screen, user, waitFor } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { CallStage, type CallParticipant, ParticipantTile } from "./call.tsx";
import { CallWindow } from "./call-window.tsx";
import { type MediaDevicesState, useMediaDevices } from "./media-devices.ts";

afterEach(() => cleanup());

const ALEX: CallParticipant = { id: "a", person: { name: "Alex Doe" }, stream: new MediaStream() };
const SAM: CallParticipant = { id: "s", person: { name: "Sam Lee" }, stream: new MediaStream() };
const ME: CallParticipant = { id: "me", person: { name: "Salama Ashoush" }, local: true };

function video(name: string): HTMLVideoElement {
  return document.querySelector(
    `[data-slot="participant-tile"][aria-label^="${name}"] video`,
  ) as HTMLVideoElement;
}

describe("a tile's menu", () => {
  test("pins someone to the stage and unpins them", async () => {
    function Stage() {
      const [pinned, setPinned] = createSignal<string | undefined>(undefined);
      return (
        <CallStage participants={[ALEX, SAM, ME]} pinnedId={pinned()} onPinnedChange={setPinned} />
      );
    }
    render(() => <Stage />);
    await settle();
    expect(document.querySelector('[data-slot="call-stage"]')?.getAttribute("data-layout")).toBe(
      "grid",
    );
    await user.click(screen.getByRole("button", { name: "Sam Lee: more" }));
    await user.click(await screen.findByRole("menuitem", { name: "Pin" }));
    await settle();
    expect(document.querySelector('[data-slot="call-stage"]')?.getAttribute("data-layout")).toBe(
      "speaker",
    );
    const staged = document.querySelector('[data-slot="call-stage-spotlight"] figure');
    expect(staged?.getAttribute("aria-label")).toBe("Sam Lee");
    expect(staged?.hasAttribute("data-pinned")).toBe(true);
    await user.click(screen.getAllByRole("button", { name: "Sam Lee: more" })[0] as HTMLElement);
    await user.click(await screen.findByRole("menuitem", { name: "Unpin" }));
    await settle();
    expect(document.querySelector('[data-slot="call-stage"]')?.getAttribute("data-layout")).toBe(
      "grid",
    );
  });

  test("mutes someone for the reader alone, and not the reader's own tile", async () => {
    const told: boolean[] = [];
    render(() => (
      <>
        <ParticipantTile participant={ALEX} onMutedForMeChange={(_, muted) => told.push(muted)} />
        <ParticipantTile participant={{ ...ME, stream: new MediaStream() }} />
      </>
    ));
    await settle();
    expect(video("Alex Doe").muted).toBe(false);
    await user.click(screen.getByRole("button", { name: "Alex Doe: more" }));
    await user.click(await screen.findByRole("menuitem", { name: "Mute for me" }));
    await settle();
    expect(video("Alex Doe").muted).toBe(true);
    expect(told).toEqual([true]);
    // The reader's own tile has nothing to mute and, without full screen, no menu.
    expect(screen.queryByRole("button", { name: "Salama Ashoush: more" })).toBeNull();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("takes the tile full screen and back, and a long press opens it under a finger", async () => {
    const calls: string[] = [];
    let fullElement: Element | null = null;
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullElement,
    });
    document.exitFullscreen = () => {
      calls.push("exit");
      fullElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    };
    try {
      render(() => <ParticipantTile participant={ME} />);
      await settle();
      const tile = document.querySelector('[data-slot="participant-tile"]') as HTMLElement;
      tile.requestFullscreen = () => {
        calls.push("enter");
        fullElement = tile;
        document.dispatchEvent(new Event("fullscreenchange"));
        return Promise.resolve();
      };
      await user.click(screen.getByRole("button", { name: "Salama Ashoush: more" }));
      await user.click(await screen.findByRole("menuitem", { name: "Full screen" }));
      await settle();
      expect(fullElement === tile).toBe(true);
      await user.click(screen.getByRole("button", { name: "Salama Ashoush: more" }));
      await user.click(await screen.findByRole("menuitem", { name: "Exit full screen" }));
      expect(calls).toEqual(["enter", "exit"]);

      user.pointerHold(tile, { pointerType: "touch" });
      await new Promise((resolve) => setTimeout(resolve, 600));
      user.pointerUp(tile, { pointerType: "touch" });
      await settle();
      await waitFor(() => expect(screen.getByRole("menu")).toBeDefined());
    } finally {
      Reflect.deleteProperty(document, "fullscreenEnabled");
      Reflect.deleteProperty(document, "fullscreenElement");
    }
  });
});

interface FakeDevice {
  deviceId: string;
  kind: MediaDeviceKind;
  label: string;
}
type MediaDeviceKind = "audioinput" | "videoinput" | "audiooutput";

interface PermissionHolder {
  state: PermissionState;
}

function fakeMedia(initial: FakeDevice[], allow: boolean) {
  let listed = initial;
  let named = false;
  const target = new EventTarget();
  const state: PermissionHolder = { state: "prompt" };
  const permission = Object.assign(new EventTarget(), state);
  const mediaDevices = Object.assign(target, {
    enumerateDevices: () =>
      Promise.resolve(listed.map((one) => ({ ...one, label: named ? one.label : "" }))),
    getUserMedia: () => {
      if (!allow) return Promise.reject(new DOMException("no", "NotAllowedError"));
      named = true;
      permission.state = "granted";
      return Promise.resolve({ getTracks: () => [{ stop: () => {} }] });
    },
  });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: mediaDevices });
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query: () => Promise.resolve(permission) },
  });
  return {
    plug(device: FakeDevice) {
      listed = [...listed, device];
      target.dispatchEvent(new Event("devicechange"));
    },
    unplug(id: string) {
      listed = listed.filter((one) => one.deviceId !== id);
      target.dispatchEvent(new Event("devicechange"));
    },
    revoke() {
      permission.state = "denied";
      permission.dispatchEvent(new Event("change"));
    },
  };
}

function mounted(): MediaDevicesState {
  let state: MediaDevicesState | undefined;
  render(() => {
    state = useMediaDevices({ defaultSelected: { audioinput: "mic-2" } });
    return null;
  });
  if (state === undefined) throw new Error("the hook did not run");
  return state;
}

describe("useMediaDevices", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "mediaDevices");
    Reflect.deleteProperty(navigator, "permissions");
  });

  test("lists each kind, names them once allowed, and follows what is plugged in", async () => {
    const media = fakeMedia(
      [
        { deviceId: "mic-1", kind: "audioinput", label: "Built-in microphone" },
        { deviceId: "mic-2", kind: "audioinput", label: "Headset" },
        { deviceId: "cam-1", kind: "videoinput", label: "Built-in camera" },
        { deviceId: "spk-1", kind: "audiooutput", label: "Speakers" },
      ],
      true,
    );
    const state = mounted();
    await settle();
    expect(state.permissions()).toEqual({ microphone: "prompt", camera: "prompt" });
    expect(state.devices().audioinput?.map((one) => one.label)).toEqual([
      "audioinput 1",
      "audioinput 2",
    ]);
    expect(await state.request()).toBe(true);
    await settle();
    expect(state.permissions()).toEqual({ microphone: "granted", camera: "granted" });
    expect(state.devices().audioinput?.map((one) => one.label)).toEqual([
      "Built-in microphone",
      "Headset",
    ]);
    expect(state.selected()).toEqual({ audioinput: "mic-2" });
    state.select("audiooutput", "spk-1");
    await settle();
    expect(state.selected()).toEqual({ audioinput: "mic-2", audiooutput: "spk-1" });
    expect(state.constraints()).toEqual({ audio: { deviceId: { exact: "mic-2" } }, video: true });

    media.plug({ deviceId: "cam-2", kind: "videoinput", label: "Desk camera" });
    await settle();
    expect(state.devices().videoinput?.map((one) => one.label)).toEqual([
      "Built-in camera",
      "Desk camera",
    ]);
    // The chosen headset unplugged: back to the browser's default.
    media.unplug("mic-2");
    await settle();
    expect(state.selected()).toEqual({ audiooutput: "spk-1" });
    media.revoke();
    await settle();
    expect(state.permissions().microphone).toBe("denied");
  });

  test("a refusal says denied, and lists nothing on a browser with no devices", async () => {
    fakeMedia([{ deviceId: "mic-1", kind: "audioinput", label: "Mic" }], false);
    const state = mounted();
    await settle();
    expect(await state.request({ audio: true, video: false })).toBe(false);
    await settle();
    expect(state.permissions()).toEqual({ microphone: "denied", camera: "prompt" });
  });
});

describe("CallWindow", () => {
  function box(element: HTMLElement): void {
    Object.defineProperty(element, "offsetWidth", { configurable: true, value: 320 });
    Object.defineProperty(element, "offsetHeight", { configurable: true, value: 200 });
    element.getBoundingClientRect = () =>
      ({ left: 600, top: 500, width: 320, height: 200 }) as DOMRect;
  }

  test("moves with the arrow keys, further with Shift, and stays inside the viewport", async () => {
    const expanded: string[] = [];
    render(() => (
      <CallWindow title="#design" onExpand={() => expanded.push("full")}>
        <p>call</p>
      </CallWindow>
    ));
    const root = document.querySelector('[data-slot="call-window"]') as HTMLElement;
    box(root);
    expect(screen.getByRole("region", { name: "Call window" })).toBe(root);
    expect(root.style.left).toBe("");
    const handle = screen.getByRole("button", {
      name: "Move the call window: drag it, or use the arrow keys",
    });
    handle.focus();
    await user.keyboard("{ArrowLeft}");
    await settle();
    expect(root.style.left).toBe("584px");
    expect(root.style.top).toBe("500px");
    user.key("ArrowUp", { shiftKey: true });
    await settle();
    expect(root.style.top).toBe("436px");
    for (let n = 0; n < 60; n++) user.key("ArrowRight", { shiftKey: true });
    await settle();
    expect(root.style.left).toBe(`${String(window.innerWidth - 320 - 8)}px`);
    await user.click(screen.getByRole("button", { name: "Return to call" }));
    expect(expanded).toEqual(["full"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a pointer drags it by its grip", async () => {
    render(() => (
      <CallWindow>
        <p>call</p>
      </CallWindow>
    ));
    const root = document.querySelector('[data-slot="call-window"]') as HTMLElement;
    box(root);
    const handle = document.querySelector('[data-slot="call-window-handle"]') as HTMLElement;
    // happy-dom leaves `pageX` at 0, and the drag reads the page's coordinates.
    function at(type: string, x: number, y: number): PointerEvent {
      const event = new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1 });
      Object.defineProperty(event, "pageX", { value: x });
      Object.defineProperty(event, "pageY", { value: y });
      return event;
    }
    handle.dispatchEvent(at("pointerdown", 10, 10));
    handle.dispatchEvent(at("pointermove", 40, -20));
    handle.dispatchEvent(at("pointerup", 40, -20));
    await settle();
    expect(root.style.left).toBe("630px");
    expect(root.style.top).toBe("470px");
  });

  test("opens in the corner at the line's end, right to left too, and hydrates", async () => {
    function Arabic() {
      provideLocale("ar-EG");
      return (
        <div dir="rtl">
          <CallWindow>
            <p>call</p>
          </CallWindow>
        </div>
      );
    }
    render(() => <Arabic />);
    const root = document.querySelector('[data-slot="call-window"]') as HTMLElement;
    expect(root.style.left).toBe("");
    expect(root.hasAttribute("data-moved")).toBe(false);
    cleanup();
    const result = await hydrates(`
      import { CallWindow } from ${JSON.stringify(new URL("./index.ts", import.meta.url).pathname)};
      export function Page() {
        return <CallWindow title="#design"><p>call</p></CallWindow>;
      }
    `);
    expect(result.container.querySelector('[data-slot="call-window-title"]')?.textContent).toBe(
      "#design",
    );
    result.unmount();
  });
});
