import { afterEach, beforeEach, describe, expect, onTestFinished, spyOn, test } from "bun:test";
import { createSignal, type Child, type ParentProps } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { Button } from "./button.tsx";
import { Heading } from "./dialog.tsx";
import { provideLocale } from "./i18n.ts";
import {
  Sheet,
  SheetBackdrop,
  SheetContent,
  SheetOverlay,
  SheetTrigger,
  useSheet,
  type SheetBackdropProps,
  type SheetContentProps,
  type SheetOverlayProps,
  type SheetProps,
  type SheetRenderState,
  type SheetTriggerProps,
} from "./sheet.tsx";

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) await tick();
}

/** Timers, a frame, and whatever they flush. */
async function wait(ms = 20): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await settle();
}

class FakeIntersectionObserver implements IntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly root = null;
  readonly rootMargin: string;
  readonly scrollMargin = "0px";
  readonly thresholds: readonly number[];
  readonly observed: Element[] = [];
  disconnected = false;

  constructor(
    readonly callback: IntersectionObserverCallback,
    options: IntersectionObserverInit = {},
  ) {
    this.rootMargin = options.rootMargin ?? "0px";
    const threshold = options.threshold ?? 0;
    this.thresholds = Array.isArray(threshold) ? threshold : [threshold];
    FakeIntersectionObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.observed.push(element);
  }

  unobserve(): void {}

  disconnect(): void {
    this.disconnected = true;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  fire(intersectionRatio: number): void {
    this.callback([{ intersectionRatio } as IntersectionObserverEntry], this);
  }
}

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly observed: Element[] = [];
  disconnected = false;

  constructor(readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.observed.push(element);
  }

  unobserve(): void {}

  disconnect(): void {
    this.disconnected = true;
  }
}

const originalScrollTo = Element.prototype.scrollTo;
const originalIntersectionObserver = window.IntersectionObserver;
const originalResizeObserver = window.ResizeObserver;
const smoothScrolls: ScrollBehavior[] = [];

beforeEach(() => {
  FakeIntersectionObserver.instances = [];
  FakeResizeObserver.instances = [];
  smoothScrolls.length = 0;
  window.IntersectionObserver = FakeIntersectionObserver;
  // Lands every scroll at once, where a finished one would, and records how it
  // was asked for.
  Element.prototype.scrollTo = function scrollTo(
    this: Element,
    options?: ScrollToOptions | number,
  ) {
    if (typeof options !== "object") return;
    if (options.behavior !== undefined) smoothScrolls.push(options.behavior);
    if (options.top !== undefined) this.scrollTop = options.top;
    if (options.left !== undefined) this.scrollLeft = options.left;
  };
});

afterEach(async () => {
  await wait();
  Element.prototype.scrollTo = originalScrollTo;
  window.IntersectionObserver = originalIntersectionObserver;
  window.ResizeObserver = originalResizeObserver;
});

function lastObserver(): FakeIntersectionObserver {
  const observer = FakeIntersectionObserver.instances.at(-1);
  if (observer === undefined) throw new Error("No sheet is observing its content.");
  return observer;
}

async function intersect(ratio: number): Promise<void> {
  lastObserver().fire(ratio);
  await settle();
}

function scrollerOf(overlay: Element): HTMLElement {
  const scroller = overlay.querySelector<HTMLElement>("[data-sheet-scroll]");
  if (scroller === null) throw new Error("The overlay holds no sheet.");
  return scroller;
}

/** Finish the entrance: the smooth scroll that brings the sheet on screen ends. */
async function finishEntering(overlay: Element): Promise<void> {
  await wait();
  scrollerOf(overlay).dispatchEvent(new Event("scrollend"));
  await settle();
}

/**
 * The swipe that took it away comes to rest. happy-dom reports itself as
 * desktop Safari, where a sheet swiped away waits for its momentum to end.
 */
async function finishLeaving(overlay: Element): Promise<void> {
  scrollerOf(overlay).dispatchEvent(new Event("scrollend"));
  await wait(80);
}

async function openSheet(name = "Open sheet"): Promise<HTMLElement> {
  user.click(screen.getByRole("button", { name }));
  await settle();
  return screen.getByRole("dialog");
}

function hiddenFromAssistiveTechnology(element: Element): boolean {
  return element.closest("[inert], [aria-hidden=true]") !== null;
}

interface FixtureProps {
  trigger?: Omit<SheetTriggerProps, "children">;
  overlay?: Omit<SheetOverlayProps, "children">;
  sheet?: Omit<SheetProps, "children">;
  backdrop?: SheetBackdropProps;
  content?: Omit<SheetContentProps, "children">;
  children?: Child;
}

function Fixture(props: FixtureProps) {
  return (
    <SheetTrigger {...props.trigger}>
      <Button>Open sheet</Button>
      <SheetOverlay data-testid="overlay" {...props.overlay}>
        <SheetBackdrop data-testid="backdrop" {...props.backdrop} />
        <Sheet data-testid="sheet" {...props.sheet}>
          <SheetContent {...props.content}>
            {(sheet: SheetRenderState) => (
              <>
                <Heading slot="title">Order for salama</Heading>
                <Button onPress={() => sheet.close()}>Close</Button>
                {props.children}
              </>
            )}
          </SheetContent>
        </Sheet>
      </SheetOverlay>
    </SheetTrigger>
  );
}

function Standalone(props: Omit<SheetOverlayProps, "children">) {
  return (
    <SheetOverlay data-testid="overlay" {...props}>
      <SheetBackdrop data-testid="backdrop" />
      <Sheet data-testid="sheet">
        <SheetContent>
          {(sheet: SheetRenderState) => (
            <>
              <Heading slot="title">Acme receipt</Heading>
              <Button onPress={() => sheet.close()}>Close</Button>
            </>
          )}
        </SheetContent>
      </Sheet>
    </SheetOverlay>
  );
}

function Arabic(props: ParentProps) {
  provideLocale("ar-AE");
  return <>{props.children}</>;
}

const PARTS = ["overlay", "sheet", "backdrop"] as const;

interface Restorable {
  mockRestore(): void;
}

interface NestedProps {
  childContent?: Omit<SheetContentProps, "children">;
}

interface CssSupports {
  supports: (condition: string) => boolean;
}

describe("Sheet", () => {
  test("renders a modal dialog named by its title, inside the sheet, inside the overlay", async () => {
    render(() => <Fixture />);
    expect(screen.queryByRole("dialog")).toBeNull();

    const dialog = await openSheet();
    const heading = screen.getByRole("heading");
    expect(dialog.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(dialog.hasAttribute("data-sheet-content")).toBe(true);

    const overlay = screen.getByTestId("overlay");
    const sheet = screen.getByTestId("sheet");
    const backdrop = screen.getByTestId("backdrop");
    expect(sheet.contains(dialog)).toBe(true);
    expect(overlay.contains(sheet)).toBe(true);
    expect(overlay.contains(backdrop)).toBe(true);

    for (const part of [overlay, sheet, backdrop]) {
      expect(part.getAttribute("data-position")).toBe("bottom");
      expect(part.getAttribute("data-swipe-direction")).toBe("bottom");
      expect(part.getAttribute("data-stack-index")).toBe("0");
      expect(part.hasAttribute("data-has-descendants")).toBe(false);
      expect(part.hasAttribute("data-expanded")).toBe(false);
    }

    await finishEntering(overlay);
    const trigger = screen.getByText("Open sheet");
    expect(hiddenFromAssistiveTechnology(trigger)).toBe(true);
  });

  test.each([
    ["top", undefined, "top"],
    ["bottom", undefined, "bottom"],
    ["left", undefined, "left"],
    ["right", undefined, "right"],
    ["center", undefined, "vertical"],
    ["center", "horizontal", "horizontal"],
    ["bottom", "vertical", "vertical"],
  ] as const)(
    "position %s with swipeDirection %s swipes %s",
    async (position, swipeDirection, expected) => {
      render(() => <Fixture overlay={{ position, swipeDirection }} />);
      await openSheet();

      for (const part of PARTS) {
        const element = screen.getByTestId(part);
        expect(element.getAttribute("data-position")).toBe(position);
        expect(element.getAttribute("data-swipe-direction")).toBe(expected);
      }
    },
  );

  test.each([
    ["en-US", "start", undefined, "left", "left"],
    ["en-US", "end", undefined, "right", "right"],
    ["ar-AE", "start", undefined, "right", "right"],
    ["ar-AE", "end", undefined, "left", "left"],
    ["ar-AE", "left", undefined, "left", "left"],
    ["en-US", "center", "start", "center", "left"],
    ["ar-AE", "center", "end", "center", "left"],
  ] as const)(
    "in %s, position %s and swipeDirection %s resolve to %s and %s",
    async (locale, position, swipeDirection, expectedPosition, expectedDirection) => {
      render(() =>
        locale === "ar-AE" ? (
          <Arabic>
            <Fixture overlay={{ position, swipeDirection }} />
          </Arabic>
        ) : (
          <Fixture overlay={{ position, swipeDirection }} />
        ),
      );
      await openSheet();

      for (const part of PARTS) {
        const element = screen.getByTestId(part);
        expect(element.getAttribute("data-position")).toBe(expectedPosition);
        expect(element.getAttribute("data-swipe-direction")).toBe(expectedDirection);
      }

      // The scroll geometry is physical; the sheet's own text is not.
      const sheet = screen.getByTestId("sheet");
      expect(scrollerOf(screen.getByTestId("overlay")).style.direction).toBe("ltr");
      expect(sheet.style.direction).toBe(locale === "ar-AE" ? "rtl" : "ltr");
    },
  );

  test("hands the sheet's state to children callbacks and to useSheet", async () => {
    const seen: Record<string, unknown>[] = [];
    function snapshot(from: string, sheet: SheetRenderState): void {
      seen.push({
        from,
        position: sheet.position(),
        swipeDirection: sheet.swipeDirection(),
        stackIndex: sheet.stackIndex(),
        hasDescendants: sheet.hasDescendants(),
        isExpanded: sheet.isExpanded(),
      });
    }
    function Reader() {
      const sheet = useSheet();
      if (sheet !== null) snapshot("useSheet", sheet);
      return null;
    }

    render(() => (
      <SheetTrigger>
        <Button>Open sheet</Button>
        <SheetOverlay position="left" swipeDirection="horizontal">
          {(overlay: SheetRenderState) => {
            snapshot("overlay", overlay);
            return (
              <Sheet>
                {(sheet: SheetRenderState) => {
                  snapshot("sheet", sheet);
                  return (
                    <SheetContent>
                      <Heading slot="title">Acme settings</Heading>
                      <Reader />
                    </SheetContent>
                  );
                }}
              </Sheet>
            );
          }}
        </SheetOverlay>
      </SheetTrigger>
    ));
    await openSheet();

    const expected = {
      position: "left",
      swipeDirection: "horizontal",
      stackIndex: 0,
      hasDescendants: false,
      isExpanded: false,
    };
    expect(seen).toEqual([
      { from: "overlay", ...expected },
      { from: "sheet", ...expected },
      { from: "useSheet", ...expected },
    ]);
  });

  test("passes class, style and data attributes through to each part", async () => {
    render(() => (
      <Fixture
        overlay={{ class: "acme-overlay", style: { zIndex: 5 } }}
        sheet={{ class: "acme-sheet", style: { background: "red" } }}
        backdrop={{ class: "acme-backdrop", style: { opacity: 0.5 } }}
        content={{ class: "acme-content" }}
      />
    ));
    const dialog = await openSheet();

    const overlay = screen.getByTestId("overlay");
    const sheet = screen.getByTestId("sheet");
    const backdrop = screen.getByTestId("backdrop");
    expect(overlay.className).toBe("acme-overlay");
    expect(overlay.style.zIndex).toBe("5");
    expect(overlay.style.position).toBe("absolute");
    expect(sheet.className).toBe("acme-sheet");
    expect(sheet.style.background).toBe("red");
    expect(sheet.style.position).toBe("relative");
    expect(backdrop.className).toBe("acme-backdrop");
    expect(backdrop.style.opacity).toBe("0.5");
    expect(backdrop.style.position).toBe("absolute");
    expect(dialog.className).toBe("acme-content");
  });

  test("a control inside the sheet does not take the trigger's props", async () => {
    render(() => <Fixture />);
    await openSheet();
    await finishEntering(screen.getByTestId("overlay"));

    const trigger = screen.getByText("Open sheet");
    const close = screen.getByRole("button", { name: "Close" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(close.hasAttribute("aria-expanded")).toBe(false);
    expect(close.hasAttribute("aria-controls")).toBe(false);
  });

  test("Escape closes it and focus goes back to the trigger", async () => {
    const changes: boolean[] = [];
    render(() => <Fixture trigger={{ onOpenChange: (open: boolean) => changes.push(open) }} />);
    const dialog = await openSheet();
    expect(changes).toEqual([true]);
    await finishEntering(screen.getByTestId("overlay"));
    expect(document.activeElement).toBe(dialog);

    user.keyDown("Escape");
    await wait();

    expect(changes).toEqual([true, false]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByText("Open sheet"));
  });

  test("hides the page and moves focus only once the entrance has finished", async () => {
    render(() => <Fixture />);
    const trigger = screen.getByText("Open sheet");
    const dialog = await openSheet();
    const overlay = screen.getByTestId("overlay");

    expect(overlay.hasAttribute("data-entering")).toBe(true);
    expect(document.activeElement).toBe(trigger);
    expect(hiddenFromAssistiveTechnology(trigger)).toBe(false);

    await finishEntering(overlay);

    expect(overlay.hasAttribute("data-entering")).toBe(false);
    expect(document.activeElement).toBe(dialog);
    expect(hiddenFromAssistiveTechnology(trigger)).toBe(true);
  });

  describe("entrance", () => {
    let rect: Restorable | undefined;

    function contentAt(box: Partial<DOMRect>): void {
      const original = HTMLElement.prototype.getBoundingClientRect;
      rect = spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
        function boundingClientRect(this: HTMLElement) {
          if (!this.hasAttribute("data-sheet-content")) return original.call(this);
          return { top: 0, bottom: 0, left: 0, right: 0, ...box } as DOMRect;
        },
      );
    }

    afterEach(() => {
      rect?.mockRestore();
      rect = undefined;
    });

    test("skips the travel where the sheet is still past the end edge", async () => {
      contentAt({ top: window.innerHeight + 200, bottom: window.innerHeight + 500 });
      render(() => <Fixture />);
      await openSheet();
      const overlay = screen.getByTestId("overlay");
      const scroller = scrollerOf(overlay);

      expect(scroller.scrollTop).toBe(200);
      expect(scroller.style.scrollSnapType).toBe("none");

      await wait();
      expect(scroller.scrollTop).toBe(window.innerHeight);

      scroller.dispatchEvent(new Event("scrollend"));
      await settle();
      expect(scroller.style.scrollSnapType).toBe("y mandatory");
    });

    test("skips the travel where the sheet is still past the start edge", async () => {
      contentAt({ left: -500, right: -200 });
      render(() => <Fixture overlay={{ position: "left" }} />);
      await openSheet();
      const scroller = scrollerOf(screen.getByTestId("overlay"));

      expect(scroller.scrollLeft).toBe(window.innerWidth - 200);
      expect(scroller.style.scrollSnapType).toBe("none");

      await wait();
      expect(scroller.scrollLeft).toBe(0);

      scroller.dispatchEvent(new Event("scrollend"));
      await settle();
      expect(scroller.style.scrollSnapType).toBe("x mandatory");
    });

    test("skips nothing when the sheet is already partly on screen", async () => {
      contentAt({ top: window.innerHeight - 100, bottom: window.innerHeight + 200 });
      render(() => <Fixture />);
      await openSheet();
      const scroller = scrollerOf(screen.getByTestId("overlay"));

      expect(scroller.scrollTop).toBe(window.innerHeight);
      expect(scroller.style.scrollSnapType).toBe("y mandatory");
    });

    test("ignores the jump's scrollend and waits for the entrance's own", async () => {
      contentAt({ top: window.innerHeight + 200, bottom: window.innerHeight + 500 });
      render(() => <Fixture />);
      await openSheet();
      const overlay = screen.getByTestId("overlay");
      const scroller = scrollerOf(overlay);

      scroller.dispatchEvent(new Event("scrollend"));
      await settle();
      expect(scroller.style.scrollSnapType).toBe("none");
      expect(overlay.hasAttribute("data-entering")).toBe(true);

      await wait();
      scroller.dispatchEvent(new Event("scrollend"));
      await settle();
      expect(scroller.style.scrollSnapType).toBe("y mandatory");
      expect(overlay.hasAttribute("data-entering")).toBe(false);
    });

    test("scrolls smoothly", async () => {
      render(() => <Fixture />);
      await openSheet();
      expect(smoothScrolls).toEqual(["smooth"]);
    });

    test("scrolls instantly and skips nothing under reduced motion", async () => {
      contentAt({ top: window.innerHeight + 200, bottom: window.innerHeight + 500 });
      const matchMedia = spyOn(window, "matchMedia").mockImplementation(
        (query: string) =>
          ({
            matches: query === "(prefers-reduced-motion: reduce)",
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
          }) as unknown as MediaQueryList,
      );
      try {
        render(() => <Fixture />);
        await openSheet();
        expect(smoothScrolls).not.toContain("smooth");
        const scroller = scrollerOf(screen.getByTestId("overlay"));
        expect(scroller.style.scrollSnapType).toBe("y mandatory");
        expect(scroller.scrollTop).toBe(window.innerHeight);
      } finally {
        matchMedia.mockRestore();
      }
    });
  });

  test("the children callback's close closes it", async () => {
    render(() => <Fixture />);
    const dialog = await openSheet();
    user.click(dialog.querySelector("button") as HTMLElement);
    await wait();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("a screen reader can close it from a hidden Dismiss button", async () => {
    render(() => <Fixture />);
    await openSheet();
    const dismiss = screen.getByRole("button", { name: "Dismiss" });
    expect(screen.getByTestId("sheet").contains(dismiss)).toBe(true);
    expect(dismiss.tabIndex).toBe(-1);

    user.click(dismiss);
    await wait();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("a sheet that cannot be dismissed has no Dismiss button", async () => {
    render(() => <Fixture overlay={{ preventDismissal: true }} />);
    await openSheet();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  });

  test("a press outside closes it", async () => {
    render(() => <Fixture />);
    await openSheet();
    user.click(screen.getByTestId("backdrop"));
    await wait();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("preventDismissal ignores a press outside and Escape, but not close()", async () => {
    render(() => <Fixture overlay={{ preventDismissal: true }} />);
    await openSheet();
    await finishEntering(screen.getByTestId("overlay"));

    user.click(screen.getByTestId("backdrop"));
    await wait();
    expect(screen.getByRole("dialog")).not.toBeNull();

    user.keyDown("Escape");
    await wait();
    expect(screen.getByRole("dialog")).not.toBeNull();

    user.click(screen.getByRole("button", { name: "Close" }));
    await wait();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("a controlled sheet only asks to close", async () => {
    const [isOpen, setOpen] = createSignal(false);
    const changes: boolean[] = [];
    render(() => (
      <Fixture
        overlay={{ isOpen: isOpen(), onOpenChange: (open: boolean) => changes.push(open) }}
      />
    ));
    expect(screen.queryByRole("dialog")).toBeNull();

    setOpen(true);
    await settle();
    const dialog = screen.getByRole("dialog");

    user.click(dialog.querySelector("button") as HTMLElement);
    await wait();
    expect(changes).toEqual([false]);
    expect(screen.getByRole("dialog")).not.toBeNull();

    setOpen(false);
    await wait();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  describe("visibility", () => {
    test("observes the content at the thresholds of gone and wholly shown", async () => {
      render(() => <Fixture />);
      const dialog = await openSheet();
      expect(lastObserver().observed).toEqual([dialog]);
      expect(lastObserver().thresholds).toEqual([0, 1]);
    });

    test("is expanded only while wholly on screen", async () => {
      render(() => <Fixture />);
      await openSheet();

      await intersect(0.5);
      for (const part of PARTS) {
        expect(screen.getByTestId(part).hasAttribute("data-expanded")).toBe(false);
      }

      await intersect(1);
      for (const part of PARTS) {
        expect(screen.getByTestId(part).hasAttribute("data-expanded")).toBe(true);
      }

      await intersect(0.5);
      for (const part of PARTS) {
        expect(screen.getByTestId(part).hasAttribute("data-expanded")).toBe(false);
      }
    });

    test("closes once swiped out of view", async () => {
      const changes: boolean[] = [];
      render(() => <Fixture trigger={{ onOpenChange: (open: boolean) => changes.push(open) }} />);
      await openSheet();

      await intersect(1);
      await intersect(0);
      expect(changes).toEqual([true, false]);
      await finishLeaving(screen.getByTestId("overlay"));
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    test("a controlled sheet with no trigger asks to close once swiped away", async () => {
      const [isOpen, setOpen] = createSignal(true);
      const changes: boolean[] = [];
      render(() => (
        <Standalone isOpen={isOpen()} onOpenChange={(open: boolean) => changes.push(open)} />
      ));
      await settle();
      expect(screen.getByRole("dialog")).not.toBeNull();

      await intersect(1);
      await intersect(0);
      expect(changes).toEqual([false]);

      setOpen(false);
      await settle();
      await finishLeaving(screen.getByTestId("overlay"));
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    test("an uncontrolled sheet with no trigger closes once swiped away", async () => {
      const changes: boolean[] = [];
      render(() => (
        <Standalone defaultOpen={true} onOpenChange={(open: boolean) => changes.push(open)} />
      ));
      await settle();
      expect(screen.getByRole("dialog")).not.toBeNull();

      await intersect(1);
      await intersect(0);
      expect(changes).toEqual([false]);
      await finishLeaving(screen.getByTestId("overlay"));
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    test("a controlled sheet inside a trigger tells its own onOpenChange", async () => {
      const trigger: boolean[] = [];
      const overlay: boolean[] = [];
      render(() => (
        <Fixture
          trigger={{ onOpenChange: (open: boolean) => trigger.push(open) }}
          overlay={{ isOpen: true, onOpenChange: (open: boolean) => overlay.push(open) }}
        />
      ));
      await settle();

      await intersect(1);
      await intersect(0);
      expect(overlay).toEqual([false]);
      expect(trigger).toEqual([]);
    });

    test("does not close before it has been seen", async () => {
      const changes: boolean[] = [];
      render(() => <Fixture trigger={{ onOpenChange: (open: boolean) => changes.push(open) }} />);
      await openSheet();

      await intersect(0);
      expect(changes).toEqual([true]);
      expect(screen.getByRole("dialog")).not.toBeNull();
    });

    test("an exit while on screen scrolls toward the edge and ends once gone", async () => {
      render(() => <Fixture />);
      await openSheet();
      const overlay = screen.getByTestId("overlay");
      const scroller = scrollerOf(overlay);
      await finishEntering(overlay);
      await intersect(1);
      expect(scroller.scrollTop).toBe(window.innerHeight);

      user.keyDown("Escape");
      await wait();
      expect(scroller.scrollTop).toBe(0);
      expect(overlay.hasAttribute("data-exiting")).toBe(true);
      expect(screen.getByRole("dialog", { hidden: true })).not.toBeNull();

      await intersect(0);
      await wait();
      expect(screen.queryByRole("dialog", { hidden: true })).toBeNull();
    });

    test("reopening while it leaves brings it back", async () => {
      const [isOpen, setOpen] = createSignal(true);
      render(() => <Standalone isOpen={isOpen()} />);
      await settle();
      const overlay = screen.getByTestId("overlay");
      await finishEntering(overlay);
      await intersect(1);

      setOpen(false);
      await wait();
      expect(overlay.hasAttribute("data-exiting")).toBe(true);

      setOpen(true);
      await wait();
      expect(overlay.hasAttribute("data-exiting")).toBe(false);
      expect(overlay.hasAttribute("data-entering")).toBe(true);
      expect(scrollerOf(overlay).scrollTop).toBe(window.innerHeight);

      await intersect(0.5);
      await wait();
      expect(overlay.isConnected).toBe(true);
    });
  });

  describe("snap points", () => {
    test("renders a marker per snap point, the first being where it opens", async () => {
      render(() => <Fixture overlay={{ snapPoints: ["180px", 50, "50%"] }} />);
      await openSheet();

      const markers = screen
        .getByTestId("sheet")
        .querySelectorAll<HTMLElement>("[data-sheet-detent]");
      expect(markers).toHaveLength(3);
      const [first, second, third] = [...markers] as [HTMLElement, HTMLElement, HTMLElement];
      expect(first.hasAttribute("data-sheet-initial")).toBe(true);
      expect(second.hasAttribute("data-sheet-initial")).toBe(false);
      expect(third.hasAttribute("data-sheet-initial")).toBe(false);

      // In from the leading edge, and snapped a viewport from the top, so that
      // exactly that much of a bottom sheet shows.
      expect(first.style.scrollSnapAlign).toBe("start");
      expect(first.style.top).toBe("180px");
      expect(first.style.scrollMarginTop).toBe("100dvh");
      expect(second.style.top).toBe("50px");
      expect(third.style.top).toBe("50%");
    });

    test.each([
      ["top", "bottom", "scrollMarginBottom", "100dvh"],
      ["left", "right", "scrollMarginRight", "100dvw"],
      ["right", "left", "scrollMarginLeft", "100dvw"],
    ] as const)(
      "a %s sheet anchors its markers to its leading edge",
      async (position, edge, margin, viewport) => {
        render(() => <Fixture overlay={{ position, snapPoints: ["180px"] }} />);
        await openSheet();

        const marker = screen
          .getByTestId("sheet")
          .querySelector<HTMLElement>("[data-sheet-initial]") as HTMLElement;
        expect(marker.style[edge]).toBe("180px");
        expect(marker.style[margin]).toBe(viewport);
      },
    );

    test("renders no markers without snap points", async () => {
      render(() => <Fixture />);
      await openSheet();
      expect(screen.getByTestId("sheet").querySelector("[data-sheet-detent]")).toBeNull();
    });

    test("opens at the first snap point rather than fully", async () => {
      render(() => <Fixture overlay={{ snapPoints: ["180px"] }} />);
      await openSheet();
      const marker = screen
        .getByTestId("sheet")
        .querySelector<HTMLElement>("[data-sheet-initial]") as HTMLElement;
      // happy-dom lays nothing out, so the marker sits at 0 and the rest
      // position is the marker less its scroll margin, however that resolved.
      const margin = Number.parseFloat(getComputedStyle(marker).scrollMarginTop) || 0;
      expect(scrollerOf(screen.getByTestId("overlay")).scrollTop).toBe(0 - margin);
    });

    test("a sheet that cannot be dismissed measures itself and stops at its smallest point", async () => {
      window.ResizeObserver = FakeResizeObserver;
      render(() => <Fixture overlay={{ preventDismissal: true, snapPoints: ["180px", 50] }} />);
      await openSheet();
      const overlay = screen.getByTestId("overlay");
      const sheet = screen.getByTestId("sheet");
      await finishEntering(overlay);

      const observer = FakeResizeObserver.instances.at(-1);
      expect(observer?.observed).toContain(sheet);

      // Swiping past the smallest point is impossible, so the exit is no snap target.
      const scroller = scrollerOf(overlay);
      expect((scroller.firstElementChild as HTMLElement).style.scrollSnapAlign).toBe("none");

      user.click(screen.getByRole("button", { name: "Close" }));
      await wait();
      expect(observer?.disconnected).toBe(true);
    });

    test("snapping is off while a sheet that cannot be dismissed changes geometry", async () => {
      render(() => <Fixture overlay={{ preventDismissal: true, snapPoints: ["180px"] }} />);
      await openSheet();
      const overlay = screen.getByTestId("overlay");
      const scroller = scrollerOf(overlay);
      expect(scroller.style.scrollSnapType).toBe("none");

      await finishEntering(overlay);
      expect(scroller.style.scrollSnapType).toBe("y mandatory");
    });
  });

  describe("stacking", () => {
    function Nested(props: NestedProps) {
      return (
        <Fixture
          overlay={{ "data-testid": "parent-overlay" }}
          sheet={{
            "data-testid": "parent-sheet",
            swipeAnimation: "radius",
            stackAnimation: "scaleBack",
          }}
          backdrop={{ "data-testid": "parent-backdrop" }}
        >
          <SheetTrigger>
            <Button>Open child</Button>
            <SheetOverlay data-testid="child-overlay">
              <SheetBackdrop data-testid="child-backdrop" />
              <Sheet data-testid="child-sheet" stackAnimation="scaleBack">
                <SheetContent {...props.childContent}>
                  {(sheet: SheetRenderState) => (
                    <>
                      <Heading slot="title">Acme child</Heading>
                      <Button onPress={() => sheet.close()}>Close child</Button>
                    </>
                  )}
                </SheetContent>
              </Sheet>
            </SheetOverlay>
          </SheetTrigger>
        </Fixture>
      );
    }

    function timelineOf(dialog: Element): string {
      return (dialog as HTMLElement).style.viewTimelineName;
    }
    function timelineScope(): string {
      return document.documentElement.style.getPropertyValue("timeline-scope");
    }

    test("does not hide a nested sheet while it enters", async () => {
      render(() => <Nested />);
      await openSheet();
      await finishEntering(screen.getByTestId("parent-overlay"));

      user.click(screen.getByRole("button", { name: "Open child" }));
      await settle();
      const child = screen.getByTestId("child-sheet");
      const parent = screen.getByTestId("parent-sheet");
      expect(hiddenFromAssistiveTechnology(child)).toBe(false);
      expect(hiddenFromAssistiveTechnology(parent)).toBe(false);

      await finishEntering(screen.getByTestId("child-overlay"));
      expect(hiddenFromAssistiveTechnology(child)).toBe(false);
      expect(hiddenFromAssistiveTechnology(parent)).toBe(true);
      expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "Acme child" }));
    });

    test("a nested sheet has a timeline of its own from the start", async () => {
      const timelines: string[] = [];
      render(() => (
        <Nested
          childContent={{
            ref: (element: HTMLElement | null) => {
              if (element !== null) timelines.push(element.style.viewTimelineName);
            },
          }}
        />
      ));
      const parent = await openSheet();
      const parentTimeline = timelineOf(parent);

      user.click(screen.getByRole("button", { name: "Open child" }));
      await settle();
      const childTimeline = timelineOf(screen.getByRole("dialog", { name: "Acme child" }));
      expect(childTimeline).not.toBe(parentTimeline);
      expect(timelines.length).toBeGreaterThan(0);
      for (const timeline of timelines) {
        expect(timeline).toBe(childTimeline);
      }
    });

    test("keeps its timeline when a sheet below it goes", async () => {
      const [firstOpen, setFirstOpen] = createSignal(true);
      render(() => (
        <>
          <Standalone isOpen={firstOpen()} data-testid="first-overlay" />
          <Standalone defaultOpen={true} data-testid="second-overlay" />
        </>
      ));
      await settle();
      const second = screen.getByTestId("second-overlay");
      const dialog = second.querySelector("[data-sheet-content]") as HTMLElement;
      const timeline = timelineOf(dialog);
      expect(second.getAttribute("data-stack-index")).toBe("1");

      setFirstOpen(false);
      await wait();
      expect(second.getAttribute("data-stack-index")).toBe("0");
      expect(timelineOf(dialog)).toBe(timeline);
      expect(timelineScope()).toBe(timeline);
    });

    test("tracks the stack index, the descendants and the hoisted timelines", async () => {
      render(() => <Nested />);
      const parent = await openSheet();
      const parentTimeline = timelineOf(parent);
      expect(timelineScope()).toBe(parentTimeline);
      await finishEntering(screen.getByTestId("parent-overlay"));

      user.click(screen.getByRole("button", { name: "Open child" }));
      await settle();
      const child = screen.getByRole("dialog", { name: "Acme child" });

      for (const id of ["parent-overlay", "parent-sheet", "parent-backdrop"]) {
        const element = screen.getByTestId(id);
        expect(element.getAttribute("data-stack-index")).toBe("0");
        expect(element.hasAttribute("data-has-descendants")).toBe(true);
      }
      for (const id of ["child-overlay", "child-sheet", "child-backdrop"]) {
        const element = screen.getByTestId(id);
        expect(element.getAttribute("data-stack-index")).toBe("1");
        expect(element.hasAttribute("data-has-descendants")).toBe(false);
      }
      expect(timelineScope()).toBe(`${parentTimeline}, ${timelineOf(child)}`);

      await finishEntering(screen.getByTestId("child-overlay"));
      user.click(screen.getByRole("button", { name: "Close child" }));
      await wait();
      expect(screen.queryByRole("dialog", { name: "Acme child" })).toBeNull();
      for (const id of ["parent-overlay", "parent-sheet", "parent-backdrop"]) {
        expect(screen.getByTestId(id).hasAttribute("data-has-descendants")).toBe(false);
      }
      expect(timelineScope()).toBe(parentTimeline);

      user.keyDown("Escape");
      await wait();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(timelineScope()).toBe("");
    });

    test("a parent sheet animates along the timelines of the sheets in front of it", async () => {
      render(() => <Nested />);
      const parent = await openSheet();
      const parentTimeline = timelineOf(parent);
      const parentSheet = screen.getByTestId("parent-sheet");
      expect(parentSheet.style.animationName).toBe("radius");
      expect(parentSheet.style.animationTimeline).toBe(parentTimeline);

      user.click(screen.getByRole("button", { name: "Open child" }));
      await settle();
      const child = screen.getByRole("dialog", { name: "Acme child" });
      expect(parentSheet.style.animationName).toBe("radius, scaleBack");
      expect(parentSheet.style.animationTimeline).toBe(`${parentTimeline}, ${timelineOf(child)}`);
      expect(parentSheet.style.animationRange).toBe("entry 0% entry 100%, entry");
      expect(parentSheet.style.animationDirection).toBe("normal, normal");
      expect(parentSheet.style.getPropertyValue("animation-composition")).toBe(
        "replace, accumulate",
      );
      // The child has nothing in front of it.
      expect(screen.getByTestId("child-sheet").style.animationName).toBe("");

      await finishEntering(screen.getByTestId("child-overlay"));
      user.click(screen.getByRole("button", { name: "Close child" }));
      await wait();
      expect(parentSheet.style.animationName).toBe("radius");
      expect(parentSheet.style.animationTimeline).toBe(parentTimeline);
    });

    test("Escape closes only the sheet in front", async () => {
      render(() => <Nested />);
      await openSheet();
      await finishEntering(screen.getByTestId("parent-overlay"));
      user.click(screen.getByRole("button", { name: "Open child" }));
      await settle();
      await finishEntering(screen.getByTestId("child-overlay"));
      expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "Acme child" }));

      user.keyDown("Escape");
      await wait();
      expect(screen.queryByRole("dialog", { name: "Acme child" })).toBeNull();
      expect(screen.getByRole("dialog", { name: "Order for salama" })).not.toBeNull();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open child" }));
    });

    test("the open child's trigger keeps its own props inside the parent", async () => {
      render(() => <Nested />);
      await openSheet();
      await finishEntering(screen.getByTestId("parent-overlay"));

      const openChild = screen.getByRole("button", { name: "Open child" });
      expect(openChild.getAttribute("aria-expanded")).toBe("false");
      user.click(openChild);
      await settle();
      expect(openChild.getAttribute("aria-expanded")).toBe("true");
      expect(screen.getByRole("dialog", { name: "Order for salama" })).not.toBeNull();
    });
  });

  describe("overscroll padding", () => {
    test.each([
      ["bottom", "paddingBottom", "marginBottom", "100vh"],
      ["top", "paddingTop", "marginTop", "100vh"],
      ["left", "paddingLeft", "marginLeft", "100vw"],
      ["right", "paddingRight", "marginRight", "100vw"],
    ] as const)(
      "extends a %s sheet past the viewport edge",
      async (position, padding, margin, size) => {
        render(() => <Fixture overlay={{ position }} sheet={{ overscrollPadding: true }} />);
        await openSheet();
        const sheet = screen.getByTestId("sheet");
        expect(sheet.style[padding]).toBe(size);
        expect(sheet.style[margin]).toBe(`-${size}`);
      },
    );

    test("adds none when the sheet is not swiped toward its own edge", async () => {
      render(() => (
        <Fixture
          overlay={{ position: "bottom", swipeDirection: "vertical" }}
          sheet={{ overscrollPadding: true }}
        />
      ));
      await openSheet();
      const sheet = screen.getByTestId("sheet");
      expect(sheet.style.paddingBottom).toBe("");
      expect(sheet.style.marginBottom).toBe("");
    });
  });

  describe("swipe animations", () => {
    test.each([
      ["bottom", "entry 0% entry 100%", "normal", "1"],
      ["right", "entry 0% entry 100%", "normal", "1"],
      ["top", "exit calc(100% - 100%) exit calc(100% - 0%)", "reverse", "1"],
      ["left", "exit calc(100% - 100%) exit calc(100% - 0%)", "reverse", "1"],
      ["vertical", "cover 0% cover 100%", "alternate", "2"],
      ["horizontal", "cover 0% cover 100%", "alternate", "2"],
    ] as const)(
      "swiping %s binds the animation to the view timeline",
      async (swipeDirection, range, direction, iterations) => {
        render(() => (
          <Fixture
            overlay={{ swipeDirection }}
            sheet={{ swipeAnimation: "acmeSheet" }}
            backdrop={{ swipeAnimation: "acmeBackdrop" }}
          />
        ));
        const dialog = await openSheet();

        for (const [id, name] of [
          ["sheet", "acmeSheet"],
          ["backdrop", "acmeBackdrop"],
        ] as const) {
          const style = screen.getByTestId(id).style;
          expect(style.animationName).toBe(name);
          expect(style.animationTimeline).toBe(dialog.style.viewTimelineName);
          expect(style.animationRange).toBe(range);
          expect(style.animationDirection).toBe(direction);
          expect(style.animationIterationCount).toBe(iterations);
          expect(style.animationFillMode).toBe("both");
          expect(style.animationTimingFunction).toBe("linear");
        }
      },
    );

    test("plays only between the given snap points", async () => {
      render(() => (
        <Fixture
          overlay={{ snapPoints: ["180px"] }}
          sheet={{ swipeAnimation: "acmeSheet", swipeAnimationRange: { end: 0 } }}
          backdrop={{ swipeAnimation: "acmeBackdrop", swipeAnimationRange: { start: 0 } }}
        />
      ));
      await openSheet();
      expect(screen.getByTestId("sheet").style.animationRange).toBe("entry 0% entry 180px");
      expect(screen.getByTestId("backdrop").style.animationRange).toBe("entry 180px entry 100%");
    });

    test("adds no animation by default", async () => {
      render(() => <Fixture />);
      await openSheet();
      expect(screen.getByTestId("sheet").style.animationName).toBe("");
      expect(screen.getByTestId("backdrop").style.animationName).toBe("");
    });

    test("without view timelines it plays over a fixed time while entering and leaving", async () => {
      // happy-dom hands out a new `CSS` on every read, so the method is
      // replaced where they all find it.
      const supports = spyOn(Object.getPrototypeOf(CSS) as CssSupports, "supports").mockReturnValue(
        false,
      );
      onTestFinished(() => supports.mockRestore());
      render(() => <Fixture sheet={{ swipeAnimation: "acmeSheet" }} />);
      await openSheet();
      const overlay = screen.getByTestId("overlay");
      const sheet = screen.getByTestId("sheet");
      expect(sheet.style.animationName).toBe("acmeSheet");
      expect(sheet.style.animationDirection).toBe("normal");
      expect(sheet.style.animationDuration).toBe("300ms");

      await finishEntering(overlay);
      expect(sheet.style.animationName).toBe("");

      await intersect(1);
      user.keyDown("Escape");
      await settle();
      expect(sheet.style.animationName).toBe("acmeSheet");
      expect(sheet.style.animationDirection).toBe("reverse");
    });
  });

  describe("view timelines", () => {
    test("names a timeline on the content", async () => {
      render(() => <Fixture />);
      const dialog = await openSheet();
      expect(dialog.style.viewTimelineName).toMatch(/^--sheet-timeline-/);
      expect(dialog.style.viewTimelineAxis).toBe("y");
    });

    test.each([
      ["bottom", "y", "0 100dvh"],
      ["top", "y", "100dvh 0"],
      ["left", "x", "100dvw 0"],
      ["right", "x", "0 100dvw"],
      ["center", "y", "0 100dvh"],
    ] as const)("a %s sheet's timeline runs along %s", async (position, axis, inset) => {
      render(() => <Fixture overlay={{ position }} />);
      const dialog = await openSheet();
      expect(dialog.style.viewTimelineAxis).toBe(axis);
      expect(dialog.style.viewTimelineInset).toBe(inset);
    });
  });

  describe("CSS variables", () => {
    test("the overlay writes the viewport, the page and the scroll padding", async () => {
      render(() => <Fixture />);
      await openSheet();
      const style = screen.getByTestId("overlay").style;
      for (const name of [
        "--visual-viewport-width",
        "--visual-viewport-height",
        "--page-width",
        "--page-height",
      ]) {
        expect(style.getPropertyValue(name)).toMatch(/^\d+(\.\d+)?px$/);
      }
      expect(style.getPropertyValue("--sheet-scroll-padding-y")).toBe(
        "calc(100dvh - var(--visual-viewport-height))",
      );
      expect(style.getPropertyValue("--sheet-scroll-padding-x")).toBe(
        "calc(100vw - var(--visual-viewport-width))",
      );
    });
  });

  describe("non-modal", () => {
    test("leaves the page usable and still closes on Escape", async () => {
      const changes: boolean[] = [];
      render(() => (
        <>
          <button type="button">Acme page</button>
          <Fixture
            overlay={{ isNonModal: true }}
            trigger={{ onOpenChange: (open: boolean) => changes.push(open) }}
          />
        </>
      ));
      await openSheet();
      const overlay = screen.getByTestId("overlay");
      await finishEntering(overlay);

      const page = screen.getByText("Acme page");
      expect(hiddenFromAssistiveTechnology(page)).toBe(false);
      expect(overlay.style.pointerEvents).toBe("none");
      expect(screen.getByTestId("sheet").style.pointerEvents).toBe("auto");

      user.click(page);
      await wait();
      expect(changes).toEqual([true]);

      page.focus();
      user.keyDown("Escape");
      await wait();
      expect(changes).toEqual([true, false]);
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
