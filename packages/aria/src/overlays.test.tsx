import { afterEach, describe, expect, test } from "bun:test";
import { flush, createSignal } from "@barqjs/core";
import { render } from "@barqjs/testing";
import { ref } from "@barqjs/primitives/refs";

import {
  alignOf,
  overlayPosition,
  modalOverlay,
  placementFor,
  preventScroll,
  type Placement,
  type PositionResult,
} from "./overlays.ts";
import type { Size } from "./collections.ts";

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

interface Styled {
  style?: unknown;
}

function styleOf(props: Styled | undefined): Record<string, string | number | undefined> {
  if (props === undefined) throw new Error("overlayPosition returned nothing");
  return (props.style as () => Record<string, string | number | undefined>)();
}

/** Where the overlay was put, along the axis the test is about. */
function leftOf(result: PositionResult | undefined): number {
  return Number.parseFloat(String(styleOf(result?.overlayProps).left ?? ""));
}

type Observer = { target: Element; fire: () => void };

const observers: Observer[] = [];
const realResizeObserver = globalThis.ResizeObserver;

interface Targeted {
  target: Element;
}

function stubResizeObserver(): void {
  globalThis.ResizeObserver = class {
    constructor(private readonly callback: (entries: Targeted[]) => void) {}
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
    const arrowLeft = Number.parseFloat(String(styleOf(position?.arrowProps).left ?? ""));
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
    const [open] = createSignal(true);

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
    const [point, setPoint] = createSignal({ top: 80, left: 120, width: 0, height: 0 });
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
    expect(Number.parseFloat(String(styleOf(position?.overlayProps).top ?? ""))).toBeCloseTo(80, 1);

    setPoint({ top: 200, left: 300, width: 0, height: 0 });
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

  test("gives an overlay no coordinates until that element is measured", () => {
    // A stand-in `top: 0; left: 0` is a position, and a popup with a
    // transition on it (every shadcn style has `duration-100`) slid in from
    // the page's corner. Measuring is what makes the browser resolve the
    // popup's style, so whatever it holds then is where a transition starts.
    // A reopened popup is a new element and must not start from where the
    // last one stood either.
    let position: PositionResult | undefined;
    const overlayRef = ref<HTMLElement>();
    const seen: (string | number | undefined)[][] = [];

    function overlay(): HTMLElement {
      const element = document.createElement("div");
      box(element, { top: 0, left: 0, width: 200, height: 40 });
      const measured = element.getBoundingClientRect;
      element.getBoundingClientRect = () => {
        const style = styleOf(position?.overlayProps);
        seen.push([style.top, style.left]);
        return measured();
      };
      return element;
    }

    function Fixture() {
      const targetRef = ref<HTMLElement>();
      position = overlayPosition({ targetRef, overlayRef, placement: "bottom", isOpen: true });
      return (
        <button
          type="button"
          ref={(node: HTMLElement) => {
            box(node, { top: 100, left: 400, width: 80, height: 30 });
            targetRef.set(node);
          }}
        >
          Open
        </button>
      );
    }

    render(() => <Fixture />);
    flush();
    expect(styleOf(position?.overlayProps).top).toBeUndefined();
    expect(styleOf(position?.overlayProps).left).toBeUndefined();

    overlayRef.set(overlay());
    flush();
    expect(seen[0]).toEqual([undefined, undefined]);
    expect(styleOf(position?.overlayProps).top).toBe("130px");

    seen.length = 0;
    overlayRef.set(overlay());
    flush();
    expect(seen[0]).toEqual([undefined, undefined]);
    expect(styleOf(position?.overlayProps).top).toBe("130px");
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
  test("publishes the space it has to grow into, and where it grows from", () => {
    // shadcn's `/create` picker is `w-[calc(var(--available-width)-1.5rem)]`
    // with `origin-(--transform-origin)`, and neither can be answered by CSS:
    // the popup is portalled to the body, so a percentage resolves against the
    // page, and the origin depends on which side the overlay was placed on
    // after a flip.
    let position: PositionResult | undefined;

    function Fixture() {
      const targetRef = ref<HTMLElement>();
      const overlayRef = ref<HTMLElement>();
      position = overlayPosition({
        targetRef,
        overlayRef,
        placement: "right top",
        isOpen: true,
        offset: 0,
        containerPadding: 12,
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

    const style = styleOf(position?.overlayProps);
    // Placed to the right of a trigger ending at 480, in a 1024-wide window
    // with 12px of padding: 1024 - 12 - 480.
    expect(style["--barq-available-width"]).toBe(`${window.innerWidth - 12 - 480}px`);
    // The overlay grows out of its own LEFT edge, at the trigger's vertical
    // centre — 115 on the page, and the overlay's top is its trigger's top.
    expect(style["--barq-transform-origin"]).toBe("0px 15px");
  });

  test("puts the stacking level on the element that is positioned", () => {
    // `z-index` does nothing on a static element, and a popup IS static: the
    // POSITIONER is what carries `position: absolute`. So the `z-50` every
    // overlay in `@barqjs/ui` writes on its own popup never applied, and an
    // overlay portalled to the body lost to any `position: relative` page
    // chrome that came after it in document order. Measured in a browser: a
    // picker's menu painted underneath the preview panel beside it.
    let position: PositionResult | undefined;

    function Fixture() {
      const targetRef = ref<HTMLElement>();
      const overlayRef = ref<HTMLElement>();
      position = overlayPosition({ targetRef, overlayRef, placement: "bottom", isOpen: true });
      return (
        <>
          <button type="button" ref={targetRef.set}>
            Open
          </button>
          <div ref={overlayRef.set} />
        </>
      );
    }

    render(() => <Fixture />);
    flush();

    const style = styleOf(position?.overlayProps);
    expect(style.position).toBe("absolute");
    expect(style.zIndex).toBe(50);
  });

  test("leaves the available box unset until there is a measurement", () => {
    // An undefined `var()` invalidates the declaration reading it, so a rule
    // sized off `--available-width` falls back to `auto`. A stand-in number
    // would size the overlay wrongly and look deliberate.
    let position: PositionResult | undefined;

    function Fixture() {
      position = overlayPosition({
        targetRef: () => null,
        overlayRef: () => null,
        placement: "bottom",
        isOpen: false,
      });
      return <div />;
    }

    render(() => <Fixture />);
    flush();

    const style = styleOf(position?.overlayProps);
    expect(style["--barq-available-width"]).toBeUndefined();
    expect(style["--barq-available-height"]).toBeUndefined();
  });
});

interface LockedProps {
  isLocked: boolean;
}

describe("preventing scroll on iOS", () => {
  function onIOS(run: () => void): void {
    const platform = Object.getOwnPropertyDescriptor(navigator, "platform");
    const agent = Object.getOwnPropertyDescriptor(navigator, "userAgent");
    Object.defineProperty(navigator, "platform", { value: "iPhone", configurable: true });
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
      configurable: true,
    });
    try {
      run();
    } finally {
      for (const [name, descriptor] of [
        ["platform", platform],
        ["userAgent", agent],
      ] as const) {
        if (descriptor === undefined) Reflect.deleteProperty(navigator, name);
        else Object.defineProperty(navigator, name, descriptor);
      }
    }
  }

  function Locked(props: LockedProps) {
    preventScroll({ isDisabled: () => !props.isLocked });
    return null;
  }

  test("the injected stylesheet carries the page's CSP nonce", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("property", "csp-nonce");
    meta.setAttribute("content", "salama-nonce");
    document.head.append(meta);
    try {
      onIOS(() => {
        const { unmount } = render(() => <Locked isLocked />);
        flush();
        const style = [...document.head.querySelectorAll("style")].find((each) =>
          each.textContent?.includes("overscroll-behavior"),
        );
        expect(style?.nonce).toBe("salama-nonce");
        unmount();
      });
    } finally {
      meta.remove();
    }
  });

  test("programmatic focus does not scroll the page while it is locked", () => {
    const original = HTMLElement.prototype.focus;
    const asked: (FocusOptions | undefined)[] = [];
    HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions) {
      asked.push(options);
    };
    try {
      onIOS(() => {
        const [locked, setLocked] = createSignal(true);
        render(() => <Locked isLocked={locked()} />);
        flush();

        const input = document.createElement("input");
        document.body.append(input);
        try {
          input.focus();
          expect(asked.at(-1)?.preventScroll).toBe(true);

          setLocked(false);
          flush();
          input.focus();
          expect(asked.at(-1)).toBeUndefined();
        } finally {
          input.remove();
        }
      });
    } finally {
      HTMLElement.prototype.focus = original;
    }
  });
});

interface PlaceOptions {
  placement: Placement;
  shouldFlip?: boolean;
  container?: HTMLElement;
  arrow?: number;
  crossOffset?: number;
  arrowBoundaryOffset?: number;
}

interface Placed {
  position: PositionResult;
  style: Record<string, string | number | undefined>;
}

describe("flipping and capping", () => {
  const placed: Element[] = [];
  afterEach(() => {
    for (const element of placed.splice(0)) element.remove();
  });

  /** happy-dom's window is 1024 by 768. */
  function placeAt(target: Rect, overlay: Size, options: PlaceOptions): Placed {
    const trigger = document.createElement("button");
    const panel = document.createElement("div");
    box(trigger, target);
    box(panel, { top: 0, left: 0, ...overlay });
    Object.defineProperty(panel, "offsetWidth", { value: overlay.width, configurable: true });
    Object.defineProperty(panel, "offsetHeight", { value: overlay.height, configurable: true });
    document.body.append(trigger);
    (options.container ?? document.body).append(panel);
    placed.push(trigger, panel);
    const arrow = document.createElement("span");
    if (options.arrow !== undefined) {
      const size = options.arrow;
      Object.defineProperty(arrow, "offsetWidth", { value: size, configurable: true });
      Object.defineProperty(arrow, "offsetHeight", { value: size, configurable: true });
      panel.append(arrow);
    }

    let position: PositionResult | undefined;
    function Fixture() {
      position = overlayPosition({
        targetRef: () => trigger,
        overlayRef: () => panel,
        placement: options.placement,
        shouldFlip: options.shouldFlip,
        crossOffset: options.crossOffset,
        arrowBoundaryOffset: options.arrowBoundaryOffset,
        arrowRef: options.arrow === undefined ? undefined : () => arrow,
        isOpen: true,
      });
      return null;
    }
    render(() => <Fixture />);
    flush();
    position?.update();
    if (position === undefined) throw new Error("overlayPosition returned nothing");
    return { position, style: styleOf(position.overlayProps) };
  }

  function px(value: string | number | undefined): number {
    return Number.parseFloat(String(value));
  }

  test("goes to the side with more room when it fits on neither", () => {
    // 216px below the trigger, 488px above, and 600px of list.
    const { position, style } = placeAt(
      { top: 500, left: 100, width: 100, height: 40 },
      { width: 200, height: 600 },
      { placement: "bottom start" },
    );
    expect(position.placement()).toBe("top");
    expect(px(style.maxHeight)).toBe(488);
    expect(px(style.top)).toBe(12);
  });

  test("an overhang along the trigger does not stop a flip", () => {
    // The overlay is wider than the room to the right of the trigger, which
    // is the cross-axis shift's problem and not a reason to stay below.
    const { position, style } = placeAt(
      { top: 600, left: 950, width: 60, height: 40 },
      { width: 300, height: 200 },
      { placement: "bottom start" },
    );
    expect(position.placement()).toBe("top");
    expect(px(style.top)).toBe(400);
    expect(px(style.left)).toBe(1024 - 12 - 300);
  });

  test("an overlay above its trigger that is capped stays against it", () => {
    // 288px of room above and 400px of overlay: capped to 288, its bottom on
    // the trigger's top, rather than hanging 112px off the top of the screen.
    const { position, style } = placeAt(
      { top: 300, left: 100, width: 100, height: 30 },
      { width: 200, height: 400 },
      { placement: "top start", shouldFlip: false },
    );
    expect(position.placement()).toBe("top");
    expect(px(style.maxHeight)).toBe(288);
    expect(px(style.top)).toBe(12);
    expect(style["--barq-transform-origin"]).toBe("50px 288px");
  });

  test("is placed relative to a containing block the page made", () => {
    const shell = document.createElement("div");
    shell.style.transform = "translateX(0)";
    box(shell, { top: 100, left: 50, width: 800, height: 600 });
    document.body.append(shell);
    placed.push(shell);

    const { style } = placeAt(
      { top: 200, left: 300, width: 80, height: 30 },
      { width: 100, height: 50 },
      { placement: "bottom start", container: shell },
    );
    expect(px(style.top)).toBe(130);
    expect(px(style.left)).toBe(250);
  });

  test("an arrow stays clear of the overlay's ends by arrowBoundaryOffset", () => {
    // The trigger's centre is 10, which is 2px left of where the overlay was
    // shifted to; the arrow keeps 8px clear of the overlay's corner instead.
    const { position } = placeAt(
      { top: 100, left: 0, width: 20, height: 30 },
      { width: 300, height: 100 },
      { placement: "bottom start", arrow: 10, arrowBoundaryOffset: 8 },
    );
    expect(px(styleOf(position.arrowProps).left)).toBe(8);
  });

  test("a cross offset cannot carry an overlay with an arrow off its trigger", () => {
    const { style } = placeAt(
      { top: 100, left: 400, width: 80, height: 30 },
      { width: 200, height: 100 },
      { placement: "bottom start", arrow: 10, crossOffset: 500 },
    );
    // Its left edge stops where the arrow can still sit over the trigger.
    expect(px(style.left)).toBe(470);
  });

  test("stays inside the visual viewport, not the layout one", () => {
    // The on-screen keyboard covers everything below 400.
    const visual = { offsetTop: 0, offsetLeft: 0, width: 1024, height: 400 };
    Object.defineProperty(window, "visualViewport", { value: visual, configurable: true });
    try {
      const { position, style } = placeAt(
        { top: 300, left: 100, width: 100, height: 30 },
        { width: 200, height: 200 },
        { placement: "bottom start" },
      );
      expect(position.placement()).toBe("top");
      expect(px(style.maxHeight)).toBe(288);
    } finally {
      Reflect.deleteProperty(window, "visualViewport");
    }
  });
});

describe("a side and an alignment", () => {
  test("name the same position a placement does", () => {
    expect(placementFor("bottom")).toBe("bottom");
    expect(placementFor("bottom", "start")).toBe("bottom start");
    expect(placementFor("top", "end")).toBe("top end");
    expect(placementFor("right", "start")).toBe("right top");
    expect(placementFor("left", "end")).toBe("left bottom");
    expect(placementFor("inline-start", "start")).toBe("start top");
    expect(placementFor("inline-end")).toBe("end");
  });

  test("and a placement reads back as its alignment", () => {
    expect(alignOf("bottom")).toBe("center");
    expect(alignOf("bottom start")).toBe("start");
    expect(alignOf("right top")).toBe("start");
    expect(alignOf("left bottom")).toBe("end");
    expect(alignOf("top end")).toBe("end");
  });

  function placed(placement: Placement, direction: "ltr" | "rtl"): PositionResult | undefined {
    let position: PositionResult | undefined;

    function Fixture() {
      const targetRef = ref<HTMLElement>();
      const overlayRef = ref<HTMLElement>();
      position = overlayPosition({ targetRef, overlayRef, placement, direction, isOpen: true });
      return (
        <>
          <button
            type="button"
            ref={(node: HTMLElement) => {
              box(node, { top: 100, left: 400, width: 200, height: 30 });
              targetRef.set(node);
            }}
          >
            Open
          </button>
          <div
            ref={(node: HTMLElement) => {
              box(node, { top: 0, left: 0, width: 100, height: 40 });
              overlayRef.set(node);
            }}
          />
        </>
      );
    }

    render(() => <Fixture />);
    flush();
    position?.update();
    return position;
  }

  test("start is the trigger's left edge, and its right edge in a right-to-left page", () => {
    expect(leftOf(placed("bottom start", "ltr"))).toBe(400);
    expect(leftOf(placed("bottom start", "rtl"))).toBe(500);
    expect(leftOf(placed("bottom end", "rtl"))).toBe(400);
  });
});

describe("a modal that is still entering", () => {
  test("hides the page only once it has arrived, and is kept visible until then", () => {
    const [entering, setEntering] = createSignal(true);
    function Sheet() {
      const element = ref<HTMLDivElement>();
      modalOverlay(
        { isEntering: entering },
        {
          isOpen: () => true,
          setOpen: () => {},
          open: () => {},
          close: () => {},
          toggle: () => {},
        },
        element,
      );
      return (
        <>
          <p>behind</p>
          <div ref={element.set}>sheet</div>
        </>
      );
    }
    const { container } = render(() => <Sheet />);
    flush();
    const behind = container.querySelector("p") as HTMLElement;
    const sheet = container.querySelector("div") as HTMLElement;
    expect(behind.closest("[inert]")).toBeNull();

    setEntering(false);
    flush();
    expect(behind.closest("[inert]")).not.toBeNull();
    expect(sheet.closest("[inert]")).toBeNull();
  });
});
