import { describe, expect, test } from "bun:test";
import { createSignal, flush, Show } from "@barqjs/core";
import { render, screen, tick } from "@barqjs/testing";
import { SharedElement, SharedElementTransition } from "./shared-element-transition.tsx";

/** Long enough for a frame, or a timer of `ms`, to have run. */
function after(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms + 40));
}

const MOVES = { "transition-property": "translate, opacity", "transition-duration": "0ms" };

function placeAt(element: Element, left: number, top: number): void {
  element.getBoundingClientRect = () =>
    ({
      left,
      top,
      width: 10,
      height: 2,
      right: left + 10,
      bottom: top + 2,
      x: left,
      y: top,
    }) as DOMRect;
}

describe("SharedElement", () => {
  test("must be inside a SharedElementTransition", () => {
    expect(() => render(() => <SharedElement name="bar" />)).toThrow(/SharedElementTransition/);
  });

  test("hidden renders nothing", () => {
    render(() => (
      <SharedElementTransition>
        <SharedElement name="bar" isVisible={false} data-testid="bar" />
      </SharedElementTransition>
    ));
    expect(screen.queryByTestId("bar")).toBeNull();
  });

  test("with nothing to continue from it enters for one frame", async () => {
    render(() => (
      <SharedElementTransition>
        <SharedElement name="bar" data-testid="bar" class="acme" />
      </SharedElementTransition>
    ));
    const bar = screen.getByTestId("bar");
    expect(bar.getAttribute("class")).toBe("acme");

    await tick();
    flush();
    expect(bar.hasAttribute("data-entering")).toBe(true);

    await after();
    flush();
    expect(bar.hasAttribute("data-entering")).toBe(false);
  });

  test("leaving with nothing to take over exits, then is removed", async () => {
    const [shown, setShown] = createSignal(true);
    render(() => (
      <SharedElementTransition>
        <SharedElement
          name="bar"
          isVisible={shown()}
          data-testid="bar"
          style={{ "transition-property": "opacity", "transition-duration": "30ms" }}
        />
      </SharedElementTransition>
    ));
    await after();
    flush();
    const bar = screen.getByTestId("bar");

    setShown(false);
    flush();
    expect(screen.getByTestId("bar")).toBe(bar);

    await tick();
    flush();
    expect(bar.hasAttribute("data-exiting")).toBe(true);

    await after(30);
    flush();
    expect(screen.queryByTestId("bar")).toBeNull();
  });

  test("an element that transitions nothing is removed at once", async () => {
    const [shown, setShown] = createSignal(true);
    render(() => (
      <SharedElementTransition>
        <SharedElement name="bar" isVisible={shown()} data-testid="bar" />
      </SharedElementTransition>
    ));
    await after();
    flush();

    setShown(false);
    flush();
    await tick();
    flush();

    expect(screen.queryByTestId("bar")).toBeNull();
  });

  test("moving between parents starts the new one where the old one was", async () => {
    const [at, setAt] = createSignal<"left" | "right">("left");
    render(() => (
      <SharedElementTransition>
        <div>
          <SharedElement name="bar" isVisible={at() === "left"} data-testid="left" style={MOVES} />
        </div>
        <div>
          <SharedElement
            name="bar"
            isVisible={at() === "right"}
            data-testid="right"
            style={MOVES}
          />
        </div>
      </SharedElementTransition>
    ));
    await after();
    flush();
    placeAt(screen.getByTestId("left"), 100, 20);

    setAt("right");
    flush();
    const right = screen.getByTestId("right");
    expect(right.style.translate).toBe("100px 20px");
    expect(right.hasAttribute("data-entering")).toBe(false);

    await tick();
    flush();
    // It took the old one's place for this frame, rather than entering.
    expect(right.hasAttribute("data-entering")).toBe(false);
    expect(screen.queryByTestId("left")).toBeNull();

    await after();
    flush();
    expect(right.style.translate).toBe("");
  });

  test("the snapshot is consumed, so the next move away exits rather than reusing it", async () => {
    const [at, setAt] = createSignal<"left" | "right" | "none">("left");
    render(() => (
      <SharedElementTransition>
        <SharedElement name="bar" isVisible={at() === "left"} data-testid="left" style={MOVES} />
        <SharedElement name="bar" isVisible={at() === "right"} data-testid="right" style={MOVES} />
      </SharedElementTransition>
    ));
    await after();
    flush();

    setAt("right");
    flush();
    await after();
    flush();
    expect(screen.getByTestId("right")).not.toBeNull();

    setAt("none");
    flush();
    await tick();
    flush();
    await after();
    flush();
    expect(screen.queryByTestId("right")).toBeNull();
    expect(screen.queryByTestId("left")).toBeNull();
  });

  test("an element unmounted by its parent hands its place to the next", async () => {
    const [at, setAt] = createSignal<"left" | "right">("left");
    render(() => (
      <SharedElementTransition>
        <Show when={at() === "left"}>
          <SharedElement name="bar" data-testid="left" style={MOVES} />
        </Show>
        <Show when={at() === "right"}>
          <SharedElement name="bar" data-testid="right" style={MOVES} />
        </Show>
      </SharedElementTransition>
    ));
    await after();
    flush();

    setAt("right");
    flush();
    await tick();
    flush();

    expect(screen.getByTestId("right").hasAttribute("data-entering")).toBe(false);
  });

  test("names are separate: a different name enters on its own", async () => {
    const [at, setAt] = createSignal<"a" | "b">("a");
    render(() => (
      <SharedElementTransition>
        <SharedElement name="a" isVisible={at() === "a"} data-testid="a" style={MOVES} />
        <SharedElement name="b" isVisible={at() === "b"} data-testid="b" style={MOVES} />
      </SharedElementTransition>
    ));
    await after();
    flush();

    setAt("b");
    flush();
    await tick();
    flush();

    expect(screen.getByTestId("b").hasAttribute("data-entering")).toBe(true);
  });
});
