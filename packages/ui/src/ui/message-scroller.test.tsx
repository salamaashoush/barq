import { afterEach, describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { cleanup, render, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerViewport,
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
