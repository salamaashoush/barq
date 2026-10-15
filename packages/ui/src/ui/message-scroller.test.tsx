import { afterEach, describe, expect, test } from "bun:test";
import { For, createSignal, flush, type Accessor, type Incoming } from "@barqjs/core";
import { cleanup, render, screen, tick, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
  type MessageScrollerScrollable,
  type MessageScrollerVisibilityState,
} from "./message-scroller.tsx";

afterEach(cleanup);

const slot = (name: string): HTMLElement =>
  document.querySelector(`[data-slot="${name}"]`) as HTMLElement;

/** happy-dom measures nothing, so the geometry is declared. */
function sized(element: HTMLElement, height: number, content: number): void {
  let top = 0;
  Object.defineProperty(element, "clientHeight", { get: () => height, configurable: true });
  Object.defineProperty(element, "scrollHeight", { get: () => content, configurable: true });
  Object.defineProperty(element, "scrollTop", {
    get: () => top,
    set: (next: number) => {
      top = next;
    },
    configurable: true,
  });
  Object.defineProperty(element, "scrollTo", {
    value: (to: { top: number }) => {
      top = to.top;
      element.dispatchEvent(new Event("scroll"));
    },
    configurable: true,
  });
}

function Fixture() {
  return (
    <MessageScroller>
      <MessageScrollerViewport>
        <MessageScrollerContent>
          <MessageScrollerItem>One</MessageScrollerItem>
        </MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton />
    </MessageScroller>
  );
}

describe("MessageScroller", () => {
  test("the column fills a short transcript and grows past a long one", () => {
    // Without `min-height: 100%` the first message floats in the middle of an
    // empty box; without `height: max-content` there is nothing to scroll.
    render(() => <Fixture />);
    const rules = rulesFor(slot("message-scroller-content").className);
    expect(rules).toContain("min-height: 100%");
    expect(rules).toContain("height: max-content");
  });

  test("the button is out of the way rather than absent", () => {
    // One that unmounts cannot animate, and this one arrives and leaves on
    // every scroll.
    render(() => <Fixture />);
    const press = slot("message-scroller-button");
    expect(press).not.toBeNull();
    expect(press.getAttribute("data-active")).toBe("false");
    const rules = rulesFor(press.className);
    expect(rules).toContain("pointer-events: none");
    expect(rules).toContain("opacity: 0%");
  });

  test("it leaves the tab order while it is out of the way", () => {
    render(() => <Fixture />);
    expect(slot("message-scroller-button").getAttribute("tabindex")).toBe("-1");
  });

  test("a scroller with somewhere to go offers the button", () => {
    render(() => <Fixture />);
    const box = slot("message-scroller-viewport");
    sized(box, 100, 500);
    box.dispatchEvent(new Event("scroll"));
    flush();
    expect(slot("message-scroller-button").getAttribute("data-active")).toBe("true");
    expect(slot("message-scroller-button").getAttribute("tabindex")).toBe("0");
  });

  test("pressing it goes to the end, and the button steps aside", async () => {
    render(() => <Fixture />);
    const box = slot("message-scroller-viewport");
    sized(box, 100, 500);
    box.dispatchEvent(new Event("scroll"));
    flush();

    await user.click(slot("message-scroller-button"));
    flush();
    expect(box.scrollTop).toBe(500);
    // The press starts a SMOOTH scroll, which is held as autoscrolling until
    // it settles; the position is already there.
    // Well past the 400ms the smooth scroll is held for: 450 raced with it
    // under load and the flag was still set.
    await new Promise((resolve) => setTimeout(resolve, 700));
    flush();
    expect(slot("message-scroller-button").getAttribute("data-active")).toBe("false");
  });

  test("the viewport says when it is moving itself, so the bar can go", () => {
    // A scrollbar reporting a gesture nobody made is noise.
    render(() => <Fixture />);
    const rules = rulesFor(slot("message-scroller-viewport").className);
    expect(rules).toContain("[data-autoscrolling]");
    expect(rules).toContain("scrollbar-width: none");
  });

  test("a part outside the scroller says what is wrong", () => {
    expect(() => render(() => <MessageScrollerButton />)).toThrow("inside a <MessageScroller>");
  });
});

interface Line {
  readonly id: string;
  readonly height: number;
  readonly anchor?: boolean;
}

/**
 * Lays the rendered rows out as a column of declared heights.
 *
 * Every row's rect follows the viewport's position, and the viewport clamps
 * like a browser's, so what the scroller decides can be read off `scrollTop`.
 */
function laidOut(viewportHeight: number, heights: () => Record<string, number>): HTMLElement {
  const view = slot("message-scroller-viewport");
  const content = slot("message-scroller-content");
  const spacer = content.querySelector<HTMLElement>("[data-message-scroller-spacer]");
  let top = 0;
  const rows = (): HTMLElement[] =>
    [...content.children].filter((child): child is HTMLElement => child !== spacer);
  const tall = (row: HTMLElement): number => heights()[row.dataset.messageId ?? ""] ?? 0;
  const room = (): number =>
    spacer === null || spacer.hidden ? 0 : Number.parseFloat(spacer.style.height || "0");
  const total = (): number => rows().reduce((sum, row) => sum + tall(row), 0) + room();
  const most = (): number => Math.max(0, total() - viewportHeight);

  Object.defineProperty(view, "clientHeight", { get: () => viewportHeight, configurable: true });
  Object.defineProperty(view, "scrollHeight", {
    get: () => Math.max(total(), viewportHeight),
    configurable: true,
  });
  Object.defineProperty(view, "scrollTop", {
    get: () => Math.min(top, most()),
    set: (next: number) => {
      top = Math.min(Math.max(0, next), most());
    },
    configurable: true,
  });
  Object.defineProperty(view, "scrollTo", {
    value: (to: { top: number }) => {
      view.scrollTop = to.top;
      view.dispatchEvent(new Event("scroll"));
    },
    configurable: true,
  });
  // On the prototype, so a row has its rect from the moment it is inserted:
  // the scroller reads it in the same mutation callback that reports the row.
  const original = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function rect(this: HTMLElement): DOMRect {
    if (this === view) {
      return { top: 0, bottom: viewportHeight, height: viewportHeight } as DOMRect;
    }
    if (this.parentElement !== content || this === spacer) return original.call(this);
    let offset = 0;
    for (const each of rows()) {
      if (each === this) break;
      offset += tall(each);
    }
    const y = offset - view.scrollTop;
    return { top: y, bottom: y + tall(this), height: tall(this) } as DOMRect;
  };
  restoreRects = (): void => {
    HTMLElement.prototype.getBoundingClientRect = original;
  };
  return view;
}

let restoreRects: (() => void) | null = null;
afterEach(() => {
  restoreRects?.();
  restoreRects = null;
});

/** Long enough for the mutation observers, and for a frame after them. */
const settled = async (): Promise<void> => {
  await tick();
  await new Promise((resolve) => setTimeout(resolve, 5));
  await new Promise((resolve) => requestAnimationFrame(resolve));
  flush();
};

function Transcript(props: Incoming<{ lines: readonly Line[]; autoScroll?: boolean }>) {
  return (
    <MessageScrollerProvider autoScroll={props.autoScroll?.()}>
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent>
            <For each={() => props.lines()} keyed={(line: Line) => line.id}>
              {(line: () => Line) => (
                <MessageScrollerItem messageId={line().id} scrollAnchor={line().anchor === true}>
                  {() => line().id}
                </MessageScrollerItem>
              )}
            </For>
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

const sizes = (lines: readonly Line[]): Record<string, number> =>
  Object.fromEntries(lines.map((line) => [line.id, line.height]));

describe("MessageScroller parts", () => {
  test("the viewport is a labelled region a keyboard can reach and scroll", () => {
    render(() => <Fixture />);
    const region = screen.getByRole("region", { name: "Messages" });
    expect(region.getAttribute("data-slot")).toBe("message-scroller-viewport");
    expect(region.getAttribute("tabindex")).toBe("0");
  });

  test("the label and the role are the caller's to change", () => {
    render(() => (
      <MessageScroller>
        <MessageScrollerViewport aria-label="Support chat" role="group" tabIndex={-1}>
          <MessageScrollerContent />
        </MessageScrollerViewport>
      </MessageScroller>
    ));
    const region = screen.getByRole("group", { name: "Support chat" });
    expect(region.getAttribute("tabindex")).toBe("-1");
  });

  test("the content is a log, so a new message is announced and an old one is not re-read", () => {
    render(() => <Fixture />);
    const log = screen.getByRole("log");
    expect(log.getAttribute("data-slot")).toBe("message-scroller-content");
    expect(log.getAttribute("aria-relevant")).toBe("additions");
  });

  test("the log's live-region semantics are the caller's to change, busy included", () => {
    const [busy, setBusy] = createSignal(true);
    render(() => (
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent aria-busy={busy()} aria-relevant="additions text" role="list" />
        </MessageScrollerViewport>
      </MessageScroller>
    ));
    const content = slot("message-scroller-content");
    expect(content.getAttribute("role")).toBe("list");
    expect(content.getAttribute("aria-relevant")).toBe("additions text");
    expect(content.getAttribute("aria-busy")).toBe("true");
    setBusy(false);
    flush();
    expect(content.getAttribute("aria-busy")).toBe("false");
  });

  test("the room made for an anchored turn is a hidden last child nobody is told about", () => {
    render(() => <Fixture />);
    const spacer = slot("message-scroller-content").lastElementChild as HTMLElement;
    expect(spacer.hasAttribute("data-message-scroller-spacer")).toBe(true);
    expect(spacer.getAttribute("aria-hidden")).toBe("true");
    expect(spacer.hidden).toBe(true);
  });

  test("an item says which message it is and whether it starts a turn", () => {
    render(() => (
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent>
            <MessageScrollerItem messageId="m1" scrollAnchor>
              Hello
            </MessageScrollerItem>
            <MessageScrollerItem>Typing</MessageScrollerItem>
          </MessageScrollerContent>
        </MessageScrollerViewport>
      </MessageScroller>
    ));
    const [first, second] = [...document.querySelectorAll('[data-slot="message-scroller-item"]')];
    expect(first?.getAttribute("data-message-id")).toBe("m1");
    expect(first?.getAttribute("data-scroll-anchor")).toBe("true");
    expect(second?.hasAttribute("data-message-id")).toBe(false);
    expect(second?.getAttribute("data-scroll-anchor")).toBe("false");
  });

  test("the bar keeps its gutter and the viewport contains its own layout", () => {
    render(() => <Fixture />);
    const rules = rulesFor(slot("message-scroller-viewport").className);
    expect(rules).toContain("scrollbar-gutter: stable");
    expect(rules).toContain("contain: content");
    expect(rules).toMatch(/\[data-pending-scroll\]\{visibility: hidden\}/);
  });

  test("the button is centred from the start edge, and turned round right to left", () => {
    render(() => <Fixture />);
    const rules = rulesFor(slot("message-scroller-button").className);
    expect(rules).toContain("inset-inline-start: calc(1 / 2 * 100%)");
    expect(rules).not.toContain(".a-left_");
    expect(rules).toMatch(/dir\(rtl\)[^}]*\{--ui-translate-x: calc\(1 \/ 2 \* 100%\)\}/);
  });
});

describe("MessageScrollerProvider", () => {
  test("the first paint is held back until the opening position is applied", async () => {
    // No viewport yet, so nothing can have been scrolled: opening at the end
    // is still to come, and showing the top first would be a flash of it.
    render(() => (
      <MessageScrollerProvider>
        <MessageScroller />
      </MessageScrollerProvider>
    ));
    expect(slot("message-scroller").hasAttribute("data-pending-scroll")).toBe(true);
    cleanup();

    const [list] = createSignal<readonly Line[]>([{ id: "m1", height: 80 }]);
    render(() => <Transcript lines={list()} />);
    await settled();
    expect(slot("message-scroller").hasAttribute("data-pending-scroll")).toBe(false);
    expect(slot("message-scroller-viewport").hasAttribute("data-pending-scroll")).toBe(false);
  });

  test("opening at the start waits for nothing", () => {
    render(() => (
      <MessageScrollerProvider defaultScrollPosition="start">
        <MessageScroller />
      </MessageScrollerProvider>
    ));
    expect(slot("message-scroller").hasAttribute("data-pending-scroll")).toBe(false);
  });

  test("without autoScroll a later message is not followed", async () => {
    const [list, setList] = createSignal<readonly Line[]>([
      { id: "m1", height: 80 },
      { id: "m2", height: 80 },
      { id: "m3", height: 80 },
    ]);
    render(() => <Transcript lines={list()} />);
    const view = laidOut(100, () => sizes(list()));
    await settled();
    view.scrollTo({ top: 140 });
    flush();

    setList([...list(), { id: "m4", height: 80 }]);
    flush();
    await settled();
    expect(view.scrollTop).toBe(140);
    expect(slot("message-scroller-button").getAttribute("data-active")).toBe("true");
  });

  test("with autoScroll it is", async () => {
    const [list, setList] = createSignal<readonly Line[]>([
      { id: "m1", height: 80 },
      { id: "m2", height: 80 },
      { id: "m3", height: 80 },
    ]);
    render(() => <Transcript lines={list()} autoScroll />);
    const view = laidOut(100, () => sizes(list()));
    await settled();
    view.scrollTo({ top: 140 });
    flush();

    setList([...list(), { id: "m4", height: 80 }]);
    flush();
    await settled();
    expect(view.scrollTop).toBe(220);
  });

  test("a new turn marked as an anchor goes near the top, with the last one peeking", async () => {
    const [list, setList] = createSignal<readonly Line[]>([
      { id: "m1", height: 80 },
      { id: "m2", height: 80 },
      { id: "m3", height: 80 },
    ]);
    render(() => <Transcript lines={list()} />);
    const view = laidOut(200, () => sizes(list()));
    await settled();

    setList([...list(), { id: "m4", height: 40, anchor: true }]);
    flush();
    await settled();
    expect(view.scrollTop).toBe(176);
    const spacer = slot("message-scroller-content").querySelector<HTMLElement>(
      "[data-message-scroller-spacer]",
    );
    expect(spacer?.hidden).toBe(false);
  });

  test("a wheel on the viewport lets go of the held turn", async () => {
    const [list, setList] = createSignal<readonly Line[]>([
      { id: "m1", height: 100 },
      { id: "m2", height: 100 },
      { id: "m3", height: 100 },
    ]);
    render(() => <Transcript lines={list()} />);
    const view = laidOut(200, () => sizes(list()));
    await settled();
    setList([...list(), { id: "q", height: 40, anchor: true }, { id: "a", height: 10 }]);
    flush();
    await settled();
    expect(view.scrollTop).toBe(236);

    view.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    view.scrollTop = 100;
    view.dispatchEvent(new Event("scroll"));
    setList(list().map((line) => (line.id === "a" ? { ...line, height: 300 } : line)));
    flush();
    slot("message-scroller-content").children[4]?.append("more");
    await settled();
    expect(view.scrollTop).toBe(100);
  });

  test("the scrolling keys let go of it too, and the others do not", async () => {
    const [list, setList] = createSignal<readonly Line[]>([
      { id: "m1", height: 100 },
      { id: "m2", height: 100 },
      { id: "m3", height: 100 },
    ]);
    render(() => <Transcript lines={list()} />);
    const view = laidOut(200, () => sizes(list()));
    await settled();
    setList([...list(), { id: "q", height: 40, anchor: true }, { id: "a", height: 10 }]);
    flush();
    await settled();

    const grow = async (height: number): Promise<void> => {
      setList(list().map((line) => (line.id === "a" ? { ...line, height } : line)));
      flush();
      slot("message-scroller-content").children[4]?.append("more");
      await settled();
    };

    user.keyDown("a", { target: view });
    view.scrollTop = 100;
    view.dispatchEvent(new Event("scroll"));
    await grow(20);
    // Still held: a letter is not a scroll.
    expect(view.scrollTop).toBe(236);

    user.keyDown("PageUp", { target: view });
    view.scrollTop = 100;
    view.dispatchEvent(new Event("scroll"));
    await grow(30);
    expect(view.scrollTop).toBe(100);
  });
});

describe("the message scroller hooks", () => {
  test("useMessageScroller drives it from anywhere under the provider", async () => {
    let commands: ReturnType<typeof useMessageScroller> | undefined;
    function Jump() {
      commands = useMessageScroller();
      return <span />;
    }
    const lines: Line[] = [
      { id: "m1", height: 80 },
      { id: "m2", height: 80 },
      { id: "m3", height: 80 },
    ];
    const [list] = createSignal<readonly Line[]>(lines);
    render(() => (
      <MessageScrollerProvider>
        <Jump />
        <MessageScroller>
          <MessageScrollerViewport>
            <MessageScrollerContent>
              <For each={() => list()} keyed={(line: Line) => line.id}>
                {(line: () => Line) => (
                  <MessageScrollerItem messageId={line().id}>{() => line().id}</MessageScrollerItem>
                )}
              </For>
            </MessageScrollerContent>
          </MessageScrollerViewport>
        </MessageScroller>
      </MessageScrollerProvider>
    ));
    const view = laidOut(100, () => sizes(lines));
    await settled();

    expect(commands?.scrollToMessage("m2")).toBe(true);
    expect(view.scrollTop).toBe(80);
    expect(commands?.scrollToMessage("m2", { align: "end" })).toBe(true);
    expect(view.scrollTop).toBe(60);
    expect(commands?.scrollToEnd()).toBe(true);
    expect(view.scrollTop).toBe(140);
    expect(commands?.scrollToStart()).toBe(true);
    expect(view.scrollTop).toBe(0);
    expect(commands?.scrollToMessage("nobody")).toBe(false);
  });

  test("useMessageScrollerScrollable says which ways there is somewhere to go", async () => {
    let edges: Accessor<MessageScrollerScrollable> | undefined;
    function Probe() {
      edges = useMessageScrollerScrollable();
      return <span />;
    }
    const lines: Line[] = [
      { id: "m1", height: 80 },
      { id: "m2", height: 80 },
      { id: "m3", height: 80 },
    ];
    const [list] = createSignal<readonly Line[]>(lines);
    render(() => (
      <MessageScrollerProvider defaultScrollPosition="start">
        <Probe />
        <MessageScroller>
          <MessageScrollerViewport>
            <MessageScrollerContent>
              <For each={() => list()} keyed={(line: Line) => line.id}>
                {(line: () => Line) => (
                  <MessageScrollerItem messageId={line().id}>{() => line().id}</MessageScrollerItem>
                )}
              </For>
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton direction="start" />
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
    ));
    const view = laidOut(100, () => sizes(lines));
    view.dispatchEvent(new Event("scroll"));
    flush();
    expect(edges?.()).toEqual({ start: false, end: true });
    // The attribute is what a fade or a shadow at either edge selects on.
    expect(view.getAttribute("data-scrollable")).toBe("end");
    expect(slot("message-scroller").getAttribute("data-scrollable")).toBe("end");

    const [toStart, toEnd] = [
      ...document.querySelectorAll<HTMLElement>('[data-slot="message-scroller-button"]'),
    ];
    // At the top there is nothing above to go back to.
    expect(toStart?.getAttribute("data-active")).toBe("false");
    expect(toEnd?.getAttribute("data-active")).toBe("true");

    view.scrollTop = 60;
    view.dispatchEvent(new Event("scroll"));
    flush();
    expect(edges?.()).toEqual({ start: true, end: true });
    expect(view.getAttribute("data-scrollable")).toBe("start end");
    expect(toStart?.getAttribute("data-active")).toBe("true");

    await user.click(toStart as HTMLElement);
    flush();
    expect(view.scrollTop).toBe(0);
  });

  test("useMessageScrollerVisibility names what is on screen and the turn being read", async () => {
    const real = globalThis.IntersectionObserver;
    Reflect.deleteProperty(globalThis, "IntersectionObserver");
    try {
      let seen: Accessor<MessageScrollerVisibilityState> | undefined;
      function Probe() {
        seen = useMessageScrollerVisibility();
        return <span />;
      }
      const lines: Line[] = [
        { id: "m1", height: 80, anchor: true },
        { id: "m2", height: 80 },
        { id: "m3", height: 80, anchor: true },
        { id: "m4", height: 300 },
      ];
      const [list] = createSignal<readonly Line[]>(lines);
      render(() => (
        <MessageScrollerProvider defaultScrollPosition="start">
          <Probe />
          <MessageScroller>
            <MessageScrollerViewport>
              <MessageScrollerContent>
                <For each={() => list()} keyed={(line: Line) => line.id}>
                  {(line: () => Line) => (
                    <MessageScrollerItem
                      messageId={line().id}
                      scrollAnchor={line().anchor === true}
                    >
                      {() => line().id}
                    </MessageScrollerItem>
                  )}
                </For>
              </MessageScrollerContent>
            </MessageScrollerViewport>
          </MessageScroller>
        </MessageScrollerProvider>
      ));
      const view = laidOut(200, () => sizes(lines));
      view.dispatchEvent(new Event("scroll"));
      await settled();
      expect(seen?.()).toEqual({ currentAnchorId: "m1", visibleMessageIds: ["m1", "m2", "m3"] });

      view.scrollTop = 120;
      view.dispatchEvent(new Event("scroll"));
      await settled();
      expect(seen?.()).toEqual({ currentAnchorId: "m3", visibleMessageIds: ["m3", "m4"] });
    } finally {
      globalThis.IntersectionObserver = real;
    }
  });

  test("a hook outside a scroller says what is wrong", () => {
    function Loose() {
      useMessageScroller();
      return <span />;
    }
    expect(() => render(() => <Loose />)).toThrow("inside a <MessageScroller>");
  });

  test("a scroller without a provider still drives its own parts", async () => {
    let commands: ReturnType<typeof useMessageScroller> | undefined;
    function Jump() {
      commands = useMessageScroller();
      return <span />;
    }
    render(() => (
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent>
            <MessageScrollerItem messageId="m1">One</MessageScrollerItem>
            <MessageScrollerItem messageId="m2">Two</MessageScrollerItem>
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <Jump />
      </MessageScroller>
    ));
    const view = laidOut(100, () => ({ m1: 80, m2: 80 }));
    await settled();
    // Further than the rows alone allow: the spacer makes the room to bring
    // the last row all the way to the top.
    expect(commands?.scrollToMessage("m2")).toBe(true);
    expect(view.scrollTop).toBe(80);
  });
});
