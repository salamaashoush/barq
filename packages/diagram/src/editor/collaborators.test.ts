/**
 * Collaboration in the editor, Excalidraw's: collaborators set through
 * `updateScene` draw their cursors, selections and laser trails; the
 * editor reports its own pointer and viewport; following is asked of the
 * host, which owns `userToFollow`; and the idle detector a sync layer
 * broadcasts from.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { UserIdleState } from "@excalidraw/common";
import { getVisibleSceneBounds } from "@excalidraw/element";

import { getClientColor, getCollaboratorsRenderConfig } from "../clients.ts";
import { createIdleDetector } from "../idle.ts";
import { contextOf } from "../test-canvas.ts";
import { zoomToFitBounds } from "../viewport.ts";
import { actionGoToCollaborator } from "./actions/navigate.ts";
import { actionZoomIn } from "./actions/canvas.ts";
import { API, Keyboard, h, mouse, renderEditor, unmountEditors, wheel } from "./test-editor.ts";

import type {
  Collaborator,
  OnUserFollowedPayload,
  PointerUpdatePayload,
  SocketId,
} from "../types.ts";

afterEach(unmountEditors);

const socket = (id: string) => id as SocketId;

const collaborators = (entries: Record<string, Collaborator>) =>
  new Map(Object.entries(entries).map(([id, collaborator]) => [socket(id), collaborator]));

const rect = (id: string, x: number, y: number) =>
  API.createElement({ id, x, y, width: 50, height: 50 });

/** What the interactive canvas draws next frame, from a clean slate. */
const drawInteractive = () => {
  const context = contextOf(h().interactiveCanvas);
  context.calls.splice(0);
  h().render();
  return context;
};

const followIntents = (): OnUserFollowedPayload[] => {
  const intents: OnUserFollowedPayload[] = [];
  h().api.onUserFollow((payload) => intents.push(payload));
  return intents;
};

const alice = { socketId: socket("alice"), username: "Alice" };

describe("updateScene with collaborators", () => {
  test("replaces the collaborators with the map given", () => {
    renderEditor();
    const first = collaborators({ alice: { username: "Alice" } });
    API.updateScene({ collaborators: first });
    expect(h().api.getAppState().collaborators).toBe(first);
    const second = collaborators({ bob: { username: "Bob" } });
    API.updateScene({ collaborators: second });
    expect([...h().api.getAppState().collaborators.keys()]).toEqual([socket("bob")]);
  });

  test("a cursor's place in the viewport follows the scroll and the zoom", () => {
    renderEditor();
    API.setAppState({ scrollX: 100, scrollY: 50, zoom: { value: 2 as never } });
    API.updateScene({
      collaborators: collaborators({
        alice: { username: "Alice", pointer: { x: 10, y: 20, tool: "pointer" }, button: "down" },
      }),
    });
    const config = getCollaboratorsRenderConfig(h().state);
    expect(config.remotePointerViewportCoords.get(socket("alice"))).toEqual({ x: 220, y: 140 });
    expect(config.remotePointerUsernames.get(socket("alice"))).toBe("Alice");
    expect(config.remotePointerButton.get(socket("alice"))).toBe("down");
  });

  test("a cursor is drawn in the collaborator's colour, with their name", () => {
    renderEditor();
    API.updateScene({
      collaborators: collaborators({
        alice: { username: "Alice", pointer: { x: 300, y: 200, tool: "pointer" } },
      }),
    });
    const context = drawInteractive();
    const color = getClientColor(socket("alice"), { username: "Alice" });
    expect(context.named("fillText").map((call) => call.args[0])).toContain("Alice");
    expect(
      context.named("moveTo").some((call) => call.args[0] === 300 && call.args[1] === 200),
    ).toBe(true);
    expect(context.named("fill").some((call) => call.fillStyle === color)).toBe(true);
  });

  test("a cursor out of the viewport is held at its edge, dimmed and nameless", () => {
    renderEditor();
    API.updateScene({
      collaborators: collaborators({
        alice: { username: "Alice", pointer: { x: 5000, y: -400, tool: "pointer" } },
      }),
    });
    const context = drawInteractive();
    // the arrow's corner at the right edge less its width, at the top
    expect(context.named("moveTo").some((call) => call.args[0] === 1024 - 11 - 1)).toBe(true);
    expect(context.named("moveTo").some((call) => call.args[1] === -1)).toBe(true);
    expect(context.named("fillText").map((call) => call.args[0])).not.toContain("Alice");
  });

  test("an idle or away collaborator's cursor is drawn as inactive", () => {
    renderEditor();
    API.updateScene({
      collaborators: collaborators({
        alice: {
          username: "Alice",
          userState: UserIdleState.IDLE,
          pointer: { x: 300, y: 200, tool: "pointer" },
        },
        bob: {
          username: "Bob",
          userState: UserIdleState.AWAY,
          pointer: { x: 500, y: 400, tool: "pointer" },
        },
        carol: {
          username: "Carol",
          userState: UserIdleState.ACTIVE,
          pointer: { x: 700, y: 600, tool: "pointer" },
        },
      }),
    });
    const config = getCollaboratorsRenderConfig(h().state);
    expect(config.remotePointerUserStates.get(socket("alice"))).toBe(UserIdleState.IDLE);
    expect(config.remotePointerUserStates.get(socket("bob"))).toBe(UserIdleState.AWAY);
    const moves = drawInteractive()
      .named("moveTo")
      .map((call) => `${String(call.args[0])},${String(call.args[1])}`);
    // the inactive arrow is drawn a pixel out from the pointer
    expect(moves).toContain("299,199");
    expect(moves).toContain("499,399");
    expect(moves).not.toContain("699,599");
  });

  test("a collaborator whose cursor is not to be rendered shows none, and their selection still", () => {
    renderEditor();
    API.loadElements([rect("a", 100, 100)]);
    API.updateScene({
      collaborators: collaborators({
        alice: {
          username: "Alice",
          selectedElementIds: { a: true },
          pointer: { x: 300, y: 200, tool: "pointer", renderCursor: false },
        },
      }),
    });
    const config = getCollaboratorsRenderConfig(h().state);
    expect(config.remotePointerViewportCoords.size).toBe(0);
    expect(config.remoteSelectedElementIds.get("a")).toEqual([socket("alice")]);
    expect(
      drawInteractive()
        .named("fillText")
        .map((call) => call.args[0]),
    ).not.toContain("Alice");
  });

  test("an element a collaborator selected is outlined in their colour", () => {
    renderEditor();
    API.loadElements([rect("a", 100, 100), rect("b", 300, 100)]);
    API.updateScene({
      collaborators: collaborators({
        alice: { username: "Alice", selectedElementIds: { a: true } },
        bob: { username: "Bob", selectedElementIds: { a: true, b: true } },
      }),
    });
    const config = getCollaboratorsRenderConfig(h().state);
    expect(config.remoteSelectedElementIds.get("a")).toEqual([socket("alice"), socket("bob")]);
    expect(config.remoteSelectedElementIds.get("b")).toEqual([socket("bob")]);
    const strokes = new Set(drawInteractive().calls.map((call) => call.strokeStyle));
    expect(strokes).toContain(getClientColor(socket("alice"), { username: "Alice" }));
    expect(strokes).toContain(getClientColor(socket("bob"), { username: "Bob" }));
  });
});

describe("a collaborator's laser", () => {
  const laser = (button: "down" | "up", x: number, y: number, laserColor?: string) =>
    API.updateScene({
      collaborators: collaborators({
        alice: { username: "Alice", button, pointer: { x, y, tool: "laser", laserColor } },
      }),
    });

  const trails = () => [...h().container.querySelectorAll("svg path")];

  // whether the collaborator's trail is being drawn, rather than fading
  const drawing = (id: string): boolean | undefined =>
    (
      h().laserTrails as unknown as {
        collabTrails: Map<SocketId, { hasCurrentTrail: boolean }>;
      }
    ).collabTrails.get(socket(id))?.hasCurrentTrail;

  test("draws a trail as their pointer goes down and moves, and ends it as it goes up", async () => {
    renderEditor();
    laser("down", 100, 100, "#ff0000");
    laser("down", 200, 150, "#ff0000");
    laser("down", 260, 220, "#ff0000");
    // theirs alone: the user's own is drawn only while they use it
    expect(trails().length).toBe(1);
    expect(drawing("alice")).toBe(true);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const theirs = trails().find((path) => path.getAttribute("fill") === "#ff0000");
    expect(theirs?.getAttribute("d")).toBeTruthy();
    laser("up", 280, 240, "#ff0000");
    // released, the trail fades out on its own
    expect(drawing("alice")).toBe(false);
    expect(trails().length).toBe(1);
    // and a press again starts another
    laser("down", 400, 400, "#ff0000");
    expect(drawing("alice")).toBe(true);
  });

  test("is in the collaborator's colour without a laser colour", async () => {
    renderEditor();
    laser("down", 100, 100);
    laser("down", 200, 200);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const color = getClientColor(socket("alice"), { username: "Alice" });
    expect(trails().some((path) => path.getAttribute("fill") === color)).toBe(true);
  });

  test("goes when the collaborator leaves", () => {
    renderEditor();
    laser("down", 100, 100);
    expect(trails().length).toBe(1);
    API.updateScene({ collaborators: new Map() });
    expect(trails().length).toBe(0);
  });

  test("is not drawn for the current user, whose own trail the editor draws", () => {
    renderEditor();
    API.updateScene({
      collaborators: collaborators({
        me: {
          username: "Me",
          isCurrentUser: true,
          button: "down",
          pointer: { x: 100, y: 100, tool: "laser" },
        },
      }),
    });
    expect(trails().length).toBe(0);
  });
});

describe("onPointerUpdate", () => {
  const record = () => {
    const payloads: (PointerUpdatePayload & { pointersDown: number })[] = [];
    // the pointers down as each update went out: the map is the editor's own
    h().api.onPointerUpdate((payload) =>
      payloads.push({ ...payload, pointersDown: payload.pointersMap.size }),
    );
    return payloads;
  };

  test("reports the pointer in scene coordinates as it moves, presses and releases", () => {
    renderEditor();
    API.setAppState({ scrollX: -100, scrollY: -50 });
    const payloads = record();
    mouse.moveTo(300, 200);
    mouse.down();
    mouse.moveTo(320, 220);
    mouse.up();
    expect(
      payloads.map(({ pointer, button }) => [pointer.x, pointer.y, pointer.tool, button]),
    ).toEqual([
      [400, 250, "pointer", "up"],
      [400, 250, "pointer", "down"],
      [420, 270, "pointer", "down"],
      [420, 270, "pointer", "up"],
    ]);
    expect(payloads.map((payload) => payload.pointersDown)).toEqual([0, 1, 1, 0]);
  });

  test("reports the laser tool as the laser", () => {
    renderEditor();
    Keyboard.keyPress("k");
    const payloads = record();
    mouse.moveTo(300, 200);
    mouse.down();
    mouse.up();
    expect(payloads.map((payload) => payload.pointer.tool)).toEqual(["laser", "laser", "laser"]);
  });

  test("goes to the host's onPointerUpdate as well", () => {
    const payloads: PointerUpdatePayload[] = [];
    renderEditor({ host: { onPointerUpdate: (payload) => payloads.push(payload) } });
    mouse.moveTo(30, 40);
    expect(payloads.map(({ pointer }) => [pointer.x, pointer.y])).toEqual([[30, 40]]);
  });

  test("stops with the unsubscribe", () => {
    renderEditor();
    const payloads: PointerUpdatePayload[] = [];
    const off = h().api.onPointerUpdate((payload) => payloads.push(payload));
    mouse.moveTo(30, 40);
    off();
    mouse.moveTo(60, 80);
    expect(payloads.length).toBe(1);
  });
});

describe("onScrollChange", () => {
  test("reports the viewport as it pans and zooms, to the API and the host", () => {
    const fromHost: number[][] = [];
    renderEditor({
      host: { onScrollChange: (x, y, zoom) => fromHost.push([x, y, zoom.value]) },
    });
    const fromApi: number[][] = [];
    h().api.onScrollChange((x, y, zoom) => fromApi.push([x, y, zoom.value]));
    wheel({ deltaX: 40, deltaY: 20 });
    expect(fromApi).toEqual([[-40, -20, 1]]);
    h().api.updateScene({ appState: { zoom: { value: 2 as never } } });
    expect(fromApi.at(-1)).toEqual([-40, -20, 2]);
    expect(fromHost).toEqual(fromApi);
  });

  test("is not called when nothing of the viewport changed", () => {
    renderEditor();
    const calls: unknown[] = [];
    h().api.onScrollChange((...args) => calls.push(args));
    API.setAppState({ viewBackgroundColor: "#ffc9c9" });
    expect(calls).toEqual([]);
  });
});

describe("following a collaborator", () => {
  const collaborator: Collaborator = { socketId: socket("alice"), username: "Alice" };

  test("goToCollaborator asks to follow them, with the API and the host told", () => {
    const fromHost: OnUserFollowedPayload[] = [];
    renderEditor({ host: { onUserFollow: (payload) => fromHost.push(payload) } });
    const intents = followIntents();
    h().batch(() => h().actionManager.executeAction(actionGoToCollaborator, collaborator));
    expect(intents).toEqual([{ userToFollow: alice, action: "FOLLOW" }]);
    expect(fromHost).toEqual(intents);
    // the host owns who is followed: the editor never sets it
    expect(h().host.userToFollow).toBe(null);
  });

  test("goToCollaborator on the one followed asks to stop", () => {
    renderEditor({ host: { userToFollow: alice } });
    const intents = followIntents();
    h().batch(() => h().actionManager.executeAction(actionGoToCollaborator, collaborator));
    expect(intents).toEqual([{ userToFollow: alice, action: "UNFOLLOW" }]);
  });

  test("goToCollaborator on the current user only stops following", () => {
    renderEditor();
    const intents = followIntents();
    const me: Collaborator = { socketId: socket("me"), username: "Me", isCurrentUser: true };
    h().batch(() => h().actionManager.executeAction(actionGoToCollaborator, me));
    expect(intents).toEqual([]);
    h().setHost({ userToFollow: alice });
    h().batch(() => h().actionManager.executeAction(actionGoToCollaborator, me));
    expect(intents).toEqual([{ userToFollow: alice, action: "UNFOLLOW" }]);
  });

  test("goToCollaborator closes the phone's menu", () => {
    renderEditor();
    API.setAppState({ openMenu: "canvas" });
    h().batch(() => h().actionManager.executeAction(actionGoToCollaborator, collaborator));
    expect(h().state.openMenu).toBe(null);
  });

  test("taking the viewport over stops following: the wheel, zooming, a press", () => {
    renderEditor({ host: { userToFollow: alice } });
    const intents = followIntents();
    wheel({ deltaX: 10, deltaY: 10 });
    expect(intents.length).toBe(1);
    h().batch(() => h().actionManager.executeAction(actionZoomIn));
    expect(intents.length).toBe(2);
    mouse.downAt(500, 500);
    mouse.upAt(500, 500);
    expect(intents.length).toBe(3);
    expect(intents.every((intent) => intent.action === "UNFOLLOW")).toBe(true);
  });

  test("the laser keeps following", () => {
    renderEditor({ host: { userToFollow: alice } });
    const intents = followIntents();
    Keyboard.keyPress("k");
    mouse.downAt(500, 500);
    mouse.moveTo(520, 520);
    mouse.upAt(520, 520);
    expect(intents).toEqual([]);
  });

  test("nothing is asked when no one is followed", () => {
    renderEditor();
    const intents = followIntents();
    wheel({ deltaX: 10, deltaY: 10 });
    mouse.downAt(500, 500);
    mouse.upAt(500, 500);
    expect(intents).toEqual([]);
  });

  test("the followed user leaving stops following", () => {
    renderEditor({ host: { userToFollow: alice } });
    const intents = followIntents();
    API.updateScene({ collaborators: collaborators({ alice: { username: "Alice" } }) });
    expect(intents).toEqual([]);
    API.updateScene({ collaborators: collaborators({ bob: { username: "Bob" } }) });
    expect(intents).toEqual([{ userToFollow: alice, action: "UNFOLLOW" }]);
  });

  test("the follower's viewport moves to the followed user's bounds, and keeps following", () => {
    const leader = renderEditor();
    leader.batch(() =>
      leader.setState({ scrollX: -2000, scrollY: -1000, zoom: { value: 0.5 as never } }),
    );
    const bounds = getVisibleSceneBounds(leader.api.getAppState());
    expect(bounds).toEqual([2000, 1000, 2000 + 1024 / 0.5, 1000 + 768 / 0.5]);

    const follower = renderEditor({ host: { userToFollow: alice } });
    const intents: OnUserFollowedPayload[] = [];
    follower.api.onUserFollow((payload) => intents.push(payload));
    follower.api.updateScene({
      appState: zoomToFitBounds({ appState: follower.api.getAppState(), bounds, fit: "contain" })
        .appState,
    });
    const [x1, y1, x2, y2] = getVisibleSceneBounds(follower.api.getAppState());
    expect(x1).toBeCloseTo(bounds[0]);
    expect(y1).toBeCloseTo(bounds[1]);
    expect(x2).toBeCloseTo(bounds[2]);
    expect(y2).toBeCloseTo(bounds[3]);
    expect(intents).toEqual([]);
  });
});

describe("createIdleDetector", () => {
  const fakeWindow = () => {
    const document = new EventTarget() as EventTarget & { hidden: boolean };
    document.hidden = false;
    const timeouts = new Map<number, { run: () => void; delay: number }>();
    const intervals = new Map<number, { run: () => void; delay: number }>();
    let next = 1;
    const ownerWindow = {
      document,
      setTimeout: (run: () => void, delay: number) => {
        timeouts.set(next, { run, delay });
        return next++;
      },
      clearTimeout: (id: number) => timeouts.delete(id),
      setInterval: (run: () => void, delay: number) => {
        intervals.set(next, { run, delay });
        return next++;
      },
      clearInterval: (id: number) => intervals.delete(id),
    };
    return {
      ownerWindow: ownerWindow as unknown as Window & typeof globalThis,
      document,
      timeouts,
      intervals,
    };
  };

  test("active while the pointer moves, idle after a minute without, away while hidden", () => {
    const { ownerWindow, document, timeouts, intervals } = fakeWindow();
    const states: UserIdleState[] = [];
    const stop = createIdleDetector({ ownerWindow, onChange: (state) => states.push(state) });

    document.dispatchEvent(new Event("pointermove"));
    expect([...timeouts.values()].map((each) => each.delay)).toEqual([60_000]);
    expect([...intervals.values()].map((each) => each.delay)).toEqual([3_000]);
    [...intervals.values()][0]?.run();
    expect(states).toEqual([UserIdleState.ACTIVE]);

    // a move again restarts the minute, and keeps one interval
    document.dispatchEvent(new Event("pointermove"));
    expect(timeouts.size).toBe(1);
    expect(intervals.size).toBe(1);

    [...timeouts.values()][0]?.run();
    expect(states.at(-1)).toBe(UserIdleState.IDLE);
    expect(intervals.size).toBe(0);

    document.hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(states.at(-1)).toBe(UserIdleState.AWAY);
    expect(timeouts.size + intervals.size).toBe(0);

    document.hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(states.at(-1)).toBe(UserIdleState.ACTIVE);
    expect(timeouts.size).toBe(1);
    expect(intervals.size).toBe(1);

    stop();
    expect(timeouts.size + intervals.size).toBe(0);
    document.dispatchEvent(new Event("pointermove"));
    expect(timeouts.size).toBe(0);
  });
});
