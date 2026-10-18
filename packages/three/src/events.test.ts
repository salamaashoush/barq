import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as THREE from "three";

import type { DomEvent, ThreeEvent } from "./events.ts";
import type { Instance } from "./instance.ts";
import { createElement, insertNode, setProp } from "./renderer.ts";
import type { RootState } from "./store.ts";
import { manualFrames, mount, unmountAll, type Frames } from "./test-utils.ts";

let frames: Frames;
beforeEach(() => {
  frames = manualFrames();
});
afterEach(() => {
  unmountAll();
  frames.restore();
});

function el(tag: string, props: Record<string, unknown> = {}, ...children: Instance[]): Instance {
  const node = createElement(tag);
  for (const child of children) insertNode(node, child);
  for (const name in props) setProp(node, name, props[name]);
  return node;
}

/** A unit box at `x`, `z`, with handlers. */
function box(name: string, x: number, z: number, handlers: Record<string, unknown> = {}): Instance {
  return el("mesh", { name, position: [x, 0, z], ...handlers }, el("boxGeometry"));
}

/**
 * The raycaster, mocked: a pointer at `offsetX` casts straight down -z from
 * x = offsetX, so a test places a hit by number rather than by projection.
 */
function castAlongZ(event: DomEvent, state: RootState): void {
  state.pointer.set(event.offsetX, event.offsetY);
  state.raycaster.set(
    new THREE.Vector3(event.offsetX, event.offsetY, 10),
    new THREE.Vector3(0, 0, -1),
  );
}

interface Pointer {
  offsetX: number;
  offsetY: number;
  pointerId: number;
  clientX: number;
  target: { setPointerCapture(id: number): void; releasePointerCapture(id: number): void };
}

function pointer(x: number, y = 0): Pointer {
  return {
    offsetX: x,
    offsetY: y,
    pointerId: 1,
    clientX: 100 + x,
    target: { setPointerCapture: () => {}, releasePointerCapture: () => {} },
  };
}

function setup(build: () => Instance, onPointerMissed?: (event: MouseEvent) => void) {
  const mounted = mount(() => build(), { onPointerMissed });
  mounted.state.setEvents({ compute: castAlongZ });
  mounted.scene.updateMatrixWorld(true);
  const handlers = mounted.state.events.handlers!;
  const fire = (name: keyof typeof handlers, event: Pointer): void =>
    handlers[name](event as unknown as Event);
  const click = (x: number): void => {
    fire("onPointerDown", pointer(x));
    fire("onPointerUp", pointer(x));
    fire("onClick", pointer(x));
  };
  return { ...mounted, fire, click };
}

describe("raycasting", () => {
  test("only objects with a handler are cast against, as handlers come and go", () => {
    let plain!: Instance;
    const { state } = setup(() => {
      plain = box("plain", 0, 0);
      return el(
        "group",
        {},
        box("a", 0, 0, { onClick: () => {} }),
        plain,
        box("b", 3, 0, { onPointerMove: () => {} }),
      );
    });
    expect(state.internal.interaction.map((object) => object.name).toSorted()).toEqual(["a", "b"]);
    expect(state.internal.hoverable.map((object) => object.name)).toEqual(["b"]);
    setProp(plain, "onClick", () => {});
    expect(state.internal.interaction).toHaveLength(3);
    setProp(plain, "onClick", undefined);
    expect(state.internal.interaction).toHaveLength(2);
  });

  test("a click reaches the nearest object, with the event R3F hands a handler", () => {
    const seen: ThreeEvent<MouseEvent>[] = [];
    const { click, state } = setup(() =>
      el(
        "group",
        {},
        box("far", 0, -3, { onClick: (event: ThreeEvent<MouseEvent>) => seen.push(event) }),
        box("near", 0, 0, { onClick: (event: ThreeEvent<MouseEvent>) => seen.push(event) }),
      ),
    );
    click(0);
    expect(seen.map((event) => event.eventObject.name)).toEqual(["near", "far"]);
    const event = seen[0];
    expect(event.object.name).toBe("near");
    expect(event.distance).toBeCloseTo(9.5);
    expect(event.point.toArray().map((n) => Math.round(n * 10) / 10)).toEqual([0, 0, 0.5]);
    expect(event.intersections.map((hit) => hit.eventObject.name)).toEqual(["near", "far"]);
    expect(event.ray).toBe(state.raycaster.ray);
    expect(event.camera).toBe(state.camera);
    expect(event.pointer).toBe(state.pointer);
    expect(event.delta).toBe(0);
    expect(event.nativeEvent.clientX).toBe(100);
    expect(event.clientX).toBe(100);
    expect(event.unprojectedPoint).toBeInstanceOf(THREE.Vector3);
    expect(typeof event.stopPropagation).toBe("function");
  });

  test("an event bubbles to every ancestor with a handler, and stops where it is stopped", () => {
    const calls: string[] = [];
    const record =
      (name: string, stop = false) =>
      (event: ThreeEvent<MouseEvent>) => {
        calls.push(`${name}:${event.object.name}`);
        if (stop) event.stopPropagation();
      };
    let stopper!: Instance;
    const { click } = setup(() => {
      stopper = box("front", 0, 0, { onClick: record("front") });
      return el(
        "group",
        { name: "outer", onClick: record("outer") },
        el("group", { name: "inner" }, stopper),
        box("back", 0, -3, { onClick: record("back") }),
      );
    });
    click(0);
    expect(calls).toEqual(["front:front", "outer:front", "back:back", "outer:back"]);
    calls.length = 0;
    setProp(stopper, "onClick", record("front", true));
    click(0);
    expect(calls).toEqual(["front:front"]);
  });

  test("a click needs its press on the same object, and a miss is reported", () => {
    const calls: string[] = [];
    const missed: string[] = [];
    const { fire, click } = setup(
      () =>
        el(
          "group",
          {},
          box("a", 0, 0, {
            onClick: () => calls.push("a"),
            onPointerMissed: () => missed.push("a"),
          }),
          box("b", 3, 0, {
            onClick: () => calls.push("b"),
            onPointerMissed: () => missed.push("b"),
          }),
        ),
      () => missed.push("canvas"),
    );
    fire("onPointerDown", pointer(0));
    fire("onClick", pointer(3));
    expect(calls).toEqual([]);
    click(3);
    expect(calls).toEqual(["b"]);
    expect(missed).toEqual(["a"]);
    missed.length = 0;
    click(10);
    expect(missed.toSorted()).toEqual(["a", "b", "canvas"]);
  });

  test("moving the pointer hovers and unhovers in R3F's order", () => {
    const calls: string[] = [];
    const record = (name: string) => () => calls.push(name);
    const { fire } = setup(() =>
      box("a", 0, 0, {
        onPointerOver: record("over"),
        onPointerEnter: record("enter"),
        onPointerMove: record("move"),
        onPointerOut: record("out"),
        onPointerLeave: record("leave"),
      }),
    );
    fire("onPointerMove", pointer(0));
    fire("onPointerMove", pointer(0.1));
    fire("onPointerMove", pointer(5));
    expect(calls).toEqual(["over", "enter", "move", "move", "out", "leave"]);
    calls.length = 0;
    fire("onPointerMove", pointer(0));
    fire("onPointerLeave", pointer(0));
    expect(calls).toEqual(["over", "enter", "move", "out", "leave"]);
  });

  test("a captured pointer keeps reaching the object that captured it", () => {
    const moves: string[] = [];
    const captured: number[] = [];
    const { fire } = setup(() =>
      el(
        "group",
        {},
        box("a", 0, 0, {
          onPointerDown: (event: ThreeEvent<PointerEvent>) => {
            event.target.setPointerCapture(event.pointerId);
            captured.push(event.pointerId);
          },
          onPointerMove: (event: ThreeEvent<PointerEvent>) => moves.push(event.eventObject.name),
          onPointerUp: (event: ThreeEvent<PointerEvent>) => {
            event.target.releasePointerCapture(event.pointerId);
          },
        }),
      ),
    );
    fire("onPointerDown", pointer(0));
    expect(captured).toEqual([1]);
    fire("onPointerMove", pointer(8));
    expect(moves).toEqual(["a"]);
    fire("onPointerUp", pointer(8));
    fire("onPointerMove", pointer(8));
    expect(moves).toEqual(["a"]);
  });

  test("an unmounted object leaves the index and its hover", () => {
    let removed = 0;
    const { state, fire, unmount } = setup(() =>
      box("a", 0, 0, { onPointerOver: () => {}, onPointerOut: () => removed++ }),
    );
    fire("onPointerMove", pointer(0));
    expect(state.internal.hovered.size).toBe(1);
    unmount();
    expect(state.internal.interaction).toHaveLength(0);
    expect(state.internal.hovered.size).toBe(0);
  });
});
