import { afterEach, describe, expect, test } from "bun:test";
import { flush, signal } from "@barqjs/core";
import { render } from "@barqjs/testing";
import { ref } from "@barqjs/primitives/refs";

import { overlayPosition, type PositionResult } from "./overlays.ts";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** happy-dom lays nothing out, so every box in this file is stated. */
function box(element: HTMLElement, rect: Rect): void {
  const value: DOMRect = {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  };
  element.getBoundingClientRect = () => value;
}

function styleOf(props: { style?: unknown } | undefined): Record<string, string | undefined> {
  if (props === undefined) throw new Error("overlayPosition returned nothing");
  return (props.style as () => Record<string, string | undefined>)();
}

/** Where the overlay was put, along the axis the test is about. */
function leftOf(result: PositionResult | undefined): number {
  return Number.parseFloat(styleOf(result?.overlayProps).left ?? "");
}

type Observer = { target: Element; fire: () => void };

const observers: Observer[] = [];
const realResizeObserver = globalThis.ResizeObserver;

function stubResizeObserver(): void {
  globalThis.ResizeObserver = class {
    constructor(private readonly callback: (entries: { target: Element }[]) => void) {}
    observe(target: Element): void {
      observers.push({ target, fire: () => this.callback([{ target }]) });
    }
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

afterEach(() => {
  observers.length = 0;
  globalThis.ResizeObserver = realResizeObserver;
});

describe("overlayPosition", () => {
  test("centres the arrow on the TARGET, not on the overlay", () => {
    // The offset is only computed when an `arrowRef` is given. Without one
    // `arrowProps` was empty, and a tooltip's arrow fell to its static
    // position — the end of the tooltip's own text, which is the far corner.
    let position: PositionResult | undefined;

    function Fixture() {
      const targetRef = ref<HTMLElement>();
      const overlayRef = ref<HTMLElement>();
      const arrowRef = ref<HTMLElement>();
      position = overlayPosition({
        targetRef,
        overlayRef,
        arrowRef,
        placement: "bottom",
        isOpen: true,
      });
      return (
        <>
          <button
            type="button"
            ref={(node: HTMLElement) => {
              box(node, { top: 100, left: 400, width: 80, height: 30 });
              targetRef.set(node);
            }}
          >
            Open
          </button>
          <div
            ref={(node: HTMLElement) => {
              box(node, { top: 0, left: 0, width: 300, height: 40 });
              overlayRef.set(node);
            }}
          >
            <span
              ref={(node: HTMLElement) => {
                box(node, { top: 0, left: 0, width: 10, height: 10 });
                arrowRef.set(node);
              }}
            />
          </div>
        </>
      );
    }

    render(() => <Fixture />);
    flush();
    position?.update();

    // The trigger's centre is 440. The overlay is 300 wide and shifted to stay
    // inside the viewport, so its left is not 290 — the arrow has to follow the
    // trigger rather than sit in the middle of the overlay.
    const arrowLeft = Number.parseFloat(styleOf(position?.arrowProps).left ?? "");
    expect(leftOf(position) + arrowLeft + 5).toBeCloseTo(440, 1);
  });

  test("places the overlay by its layout box, not by the one it is painted at", () => {
    // Every overlay in `@barqjs/ui` enters with `zoom-in-95`. Measured through
    // `getBoundingClientRect` mid-animation a 300px popover reads 285, gets
    // centred on that, and finishes its animation 7px off its trigger — where
    // it stays, because a transform changes no layout box and nothing fires.
    let position: PositionResult | undefined;

    function Fixture() {
      const targetRef = ref<HTMLElement>();
      const overlayRef = ref<HTMLElement>();
      position = overlayPosition({ targetRef, overlayRef, placement: "bottom", isOpen: true });
      return (
        <>
          <button
            type="button"
            ref={(node: HTMLElement) => {
              box(node, { top: 100, left: 400, width: 80, height: 30 });
              targetRef.set(node);
            }}
          >
            Open
          </button>
          <div
            ref={(node: HTMLElement) => {
              // 300 wide, painted at 95% of that.
              box(node, { top: 0, left: 0, width: 285, height: 38 });
              Object.defineProperty(node, "offsetWidth", { value: 300, configurable: true });
              Object.defineProperty(node, "offsetHeight", { value: 40, configurable: true });
              overlayRef.set(node);
            }}
          />
        </>
      );
    }

    render(() => <Fixture />);
    flush();
    position?.update();

    expect(leftOf(position)).toBeCloseTo(290, 1);
  });

  test("publishes the trigger's measurements for an overlay that wants to match", () => {
    // A portalled listbox cannot say `width: 100%`: 100% resolves against the
    // portal container, which is the body, so a popover asked to be as wide as
    // its trigger came out as wide as the page.
    let position: PositionResult | undefined;

    function Fixture() {
      const targetRef = ref<HTMLElement>();
      const overlayRef = ref<HTMLElement>();
      position = overlayPosition({ targetRef, overlayRef, placement: "bottom", isOpen: true });
      return (
        <>
          <button
            type="button"
            ref={(node: HTMLElement) => {
              box(node, { top: 100, left: 400, width: 240, height: 36 });
              targetRef.set(node);
            }}
          >
            Open
          </button>
          <div
            ref={(node: HTMLElement) => {
              box(node, { top: 0, left: 0, width: 300, height: 40 });
              overlayRef.set(node);
            }}
          />
        </>
      );
    }

    render(() => <Fixture />);
    flush();
    position?.update();

    const style = styleOf(position?.overlayProps);
    expect(style["--barq-trigger-width"]).toBe("240px");
    expect(style["--barq-trigger-height"]).toBe("36px");
  });

  test("re-places itself when the overlay's own box changes", () => {
    // The first measurement is taken the moment the ref resolves, before the
    // browser has laid the overlay out. A popover measured 275px wide, was
    // centred on that, and rendered at 288 — 7px off its trigger, and it stayed
    // there until something else forced a resize.
    stubResizeObserver();

    let overlay: HTMLElement | undefined;
    let position: PositionResult | undefined;
    const open = signal(true);

    function Fixture() {
      const targetRef = ref<HTMLElement>();
      const overlayRef = ref<HTMLElement>();
      position = overlayPosition({
        targetRef,
        overlayRef,
        placement: "bottom",
        isOpen: open,
      });
      return (
        <>
          <button
            type="button"
            ref={(node: HTMLElement) => {
              box(node, { top: 100, left: 400, width: 80, height: 30 });
              targetRef.set(node);
            }}
          >
            Open
          </button>
          <div
            ref={(node: HTMLElement) => {
              box(node, { top: 0, left: 0, width: 200, height: 40 });
              overlay = node;
              overlayRef.set(node);
            }}
          />
        </>
      );
    }

    render(() => <Fixture />);
    flush();

    expect(leftOf(position)).toBeCloseTo(340, 1);

    // The real width arrives once the browser has laid it out.
    box(overlay as HTMLElement, { top: 0, left: 0, width: 300, height: 40 });
    for (const observer of observers) observer.fire();
    flush();

    expect(leftOf(position)).toBeCloseTo(290, 1);
  });

  test("places against a rect handed to it rather than the target's own box", () => {
    // A context menu is anchored to the point the pointer was at, which has no
    // element and no box. The target stays whatever the point was inside, so
    // scrolling that away still closes the overlay.
    const point = signal({ top: 80, left: 120, width: 0, height: 0 });
    let position: PositionResult | undefined;

    function Fixture() {
      const targetRef = ref<HTMLElement>();
      const overlayRef = ref<HTMLElement>();
      position = overlayPosition({
        targetRef,
        targetRect: point,
        overlayRef,
        placement: "right top",
        offset: 2,
        isOpen: true,
      });
      return (
        <>
          <section
            ref={(node: HTMLElement) => {
              box(node, { top: 0, left: 0, width: 600, height: 400 });
              targetRef.set(node);
            }}
          />
          <div
            ref={(node: HTMLElement) => {
              box(node, { top: 0, left: 0, width: 200, height: 100 });
              overlayRef.set(node);
            }}
          />
        </>
      );
    }

    render(() => <Fixture />);
    flush();
    position?.update();

    expect(leftOf(position)).toBeCloseTo(122, 1);
    expect(Number.parseFloat(styleOf(position?.overlayProps).top ?? "")).toBeCloseTo(80, 1);

    point.set({ top: 200, left: 300, width: 0, height: 0 });
    flush();

    expect(leftOf(position)).toBeCloseTo(302, 1);
  });

  test("needs no target at all when it is given a rect", () => {
    let position: PositionResult | undefined;

    function Fixture() {
      const overlayRef = ref<HTMLElement>();
      position = overlayPosition({
        targetRef: () => null,
        targetRect: { top: 50, left: 60, width: 0, height: 0 },
        overlayRef,
        placement: "right top",
        isOpen: true,
      });
      return (
        <div
          ref={(node: HTMLElement) => {
            box(node, { top: 0, left: 0, width: 200, height: 100 });
            overlayRef.set(node);
          }}
        />
      );
    }

    render(() => <Fixture />);
    flush();
    position?.update();

    expect(leftOf(position)).toBeCloseTo(60, 1);
  });

  test("observes both the trigger and the overlay", () => {
    stubResizeObserver();

    function Fixture() {
      const targetRef = ref<HTMLElement>();
      const overlayRef = ref<HTMLElement>();
      overlayPosition({ targetRef, overlayRef, placement: "bottom", isOpen: true });
      return (
        <>
          <button type="button" ref={targetRef.set}>
            Open
          </button>
          <div ref={overlayRef.set} />
        </>
      );
    }

    const { container } = render(() => <Fixture />);
    flush();

    const observed = new Set(observers.map((entry) => entry.target));
    expect(observed.has(container.querySelector("button") as Element)).toBe(true);
    expect(observed.has(container.querySelector("div") as Element)).toBe(true);
  });
});
