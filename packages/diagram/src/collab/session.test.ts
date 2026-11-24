/**
 * The session's pacing, over a transport that records what it is given:
 * increments by element version, the full scene at once and then every
 * twenty seconds, the stored scene saved twenty seconds after a change,
 * and cursors thirty times a second at most, a pinch left out.
 */

import { afterEach, describe, expect, jest, test } from "bun:test";
import { newElementWith } from "@excalidraw/element";

import { unmountEditors } from "../editor/test-editor.ts";
import { WS_SUBTYPES } from "./data.ts";
import { edit, joinRoom, newRoom, rect, type Peer } from "./test-collab.ts";

import type { SocketId } from "../types.ts";
import type { SocketUpdateData } from "./data.ts";
import type { CollabTransport, StoredScene } from "./transport.ts";

function recording() {
  const sent: SocketUpdateData[] = [];
  const saved: StoredScene[] = [];
  const saveWaiters: Array<() => void> = [];
  const transport: CollabTransport = {
    connect(_room, handlers) {
      handlers.onConnect("me" as SocketId);
      handlers.onRoomUserChange(["me" as SocketId]);
      handlers.onFirstInRoom();
    },
    close: () => undefined,
    broadcast: async (data) => {
      sent.push(data);
    },
    follow: () => undefined,
    saveFiles: async (files) => ({ savedFiles: files.map(({ id }) => id), erroredFiles: [] }),
    loadFiles: async () => ({ loadedFiles: [], erroredFiles: [] }),
    loadScene: async () => null,
    saveScene: async (scene) => {
      saved.push(scene);
      for (const resolve of saveWaiters.splice(0)) resolve();
      return { saved: true, revision: saved.length };
    },
  };
  /** The next save, as a promise: encryption settles on the event loop, not the faked timers. */
  function nextSave() {
    return new Promise<void>((resolve) => saveWaiters.push(resolve));
  }
  return { transport, sent, saved, nextSave };
}

function scenes(sent: readonly SocketUpdateData[]) {
  return sent.flatMap((data) =>
    data.type === WS_SUBTYPES.UPDATE || data.type === WS_SUBTYPES.INIT
      ? [data.payload.elements.map((element) => element.id).join()]
      : [],
  );
}

/** A thousand turns of the event loop, which fake timers leave alone. */
async function settle() {
  for (let turn = 0; turn < 1000; turn++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

let alice: Peer | null = null;

afterEach(async () => {
  jest.useRealTimers();
  await alice?.session.stop();
  alice = null;
  unmountEditors();
});

describe("pacing", () => {
  test("sends each change's elements, the whole scene at once, then every twenty seconds", async () => {
    const { transport, sent } = recording();
    jest.useFakeTimers();
    alice = await joinRoom(await newRoom(), transport, { username: "Alice", existingRoom: false }, [
      rect("r1", 0),
      rect("r2", 100),
    ]);
    // a new room starts with the whole scene
    expect(scenes(sent)[0]).toBe("r1,r2");
    jest.advanceTimersByTime(20_000);
    sent.length = 0;

    edit(alice, "r1", (each) => newElementWith(each, { x: 5 }));
    expect(scenes(sent)).toEqual(["r1", "r1,r2"]);
    sent.length = 0;

    edit(alice, "r2", (each) => newElementWith(each, { x: 105 }));
    expect(scenes(sent)).toEqual(["r2"]);
    jest.advanceTimersByTime(20_000);
    expect(scenes(sent)).toEqual(["r2", "r1,r2"]);

    // nothing changed, nothing sent
    sent.length = 0;
    alice.editor.api.updateScene({ appState: { viewBackgroundColor: "#ffc9c9" } });
    jest.advanceTimersByTime(20_000);
    expect(scenes(sent)).toEqual([]);
  });

  test("stores the scene twenty seconds after a change, not at once", async () => {
    const { transport, saved, nextSave } = recording();
    jest.useFakeTimers();
    alice = await joinRoom(await newRoom(), transport, { username: "Alice", existingRoom: false }, [
      rect("r1", 0),
    ]);
    expect(saved.length).toBe(1);
    jest.advanceTimersByTime(20_000);
    await settle();
    const stored = saved.length;

    edit(alice, "r1", (each) => newElementWith(each, { x: 5 }));
    jest.advanceTimersByTime(19_000);
    await settle();
    expect(saved.length).toBe(stored);

    const saving = nextSave();
    jest.advanceTimersByTime(1_000);
    await saving;
    expect(saved.length).toBe(stored + 1);
  });

  test("sends the cursor thirty times a second at most, the latest last, and not a pinch", async () => {
    const { transport, sent } = recording();
    jest.useFakeTimers();
    alice = await joinRoom(await newRoom(), transport, { username: "Alice", existingRoom: false });
    function cursors() {
      return sent.flatMap((data) =>
        data.type === WS_SUBTYPES.MOUSE_LOCATION ? [data.payload.pointer.x] : [],
      );
    }
    function move(x: number, pointerId = 1, type = "pointermove") {
      return alice!.editor.interactiveCanvas.dispatchEvent(
        new PointerEvent(type, {
          clientX: x,
          clientY: 100,
          pointerId,
          pointerType: "touch",
          bubbles: true,
          cancelable: true,
        }),
      );
    }

    move(100);
    move(110);
    move(120);
    expect(cursors()).toEqual([100]);
    jest.advanceTimersByTime(33);
    expect(cursors()).toEqual([100, 120]);

    jest.advanceTimersByTime(100);
    sent.length = 0;
    move(200, 1, "pointerdown");
    move(300, 2, "pointerdown");
    jest.advanceTimersByTime(100);
    const before = cursors().length;
    move(320, 2);
    jest.advanceTimersByTime(100);
    expect(cursors().length).toBe(before);
  });
});
