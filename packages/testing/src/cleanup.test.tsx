/**
 * Auto-cleanup, which is what makes one test's DOM invisible to the next.
 *
 * It used to be a COMMENT telling you to wire `afterEach(cleanup)` yourself, so
 * a suite that forgot inherited the previous test's `document.body` and failed
 * in a way that reads as a bug in the component under test.
 */

import { describe, expect, test } from "bun:test";

import { cleanup, render } from "./index.ts";

describe("importing `@barqjs/testing` registers the cleanup hook", () => {
  test("this test leaves a container behind on purpose", () => {
    render(() => <div data-testid="leaked">left over</div>);
    expect(document.querySelectorAll("[data-testid=leaked]").length).toBe(1);
  });

  /**
   * The assertion is about the PREVIOUS test. If the hook is not registered,
   * the node above is still here and this reads 1, so the pair is the gate
   * rather than either test alone.
   */
  test("and the next test does not see it", () => {
    expect(document.querySelectorAll("[data-testid=leaked]").length).toBe(0);
  });
});

/**
 * A browser moves focus to the body when the focused element leaves the
 * document. A headless DOM may leave `document.activeElement` on the removed
 * node, and the next test's first focus event then names it as where focus
 * came from: a node with no position, compared against ones that have one.
 */
describe("cleanup leaves focus where a browser would", () => {
  test("focus inside a render does not outlive it", () => {
    const { getByRole } = render(() => <button type="button">Save</button>);
    getByRole("button").focus();
    expect(document.activeElement).toBe(getByRole("button"));

    cleanup();

    expect(document.activeElement).toBe(document.body);
  });

  test("the next focus event has nowhere it came from", () => {
    const first = render(() => <input aria-label="Name" />);
    first.getByRole("textbox").focus();
    cleanup();

    const from: (EventTarget | null)[] = [];
    const second = render(() => (
      <input aria-label="Email" onFocus={(event: FocusEvent) => from.push(event.relatedTarget)} />
    ));
    second.getByRole("textbox").focus();
    expect(from).toEqual([null]);
  });

  test("focus on something a render did not own is left alone", () => {
    const outside = document.body.appendChild(document.createElement("button"));
    outside.focus();
    render(() => <p>Body</p>);

    cleanup();

    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});

describe("`./pure.ts` is the same surface with the hook left off", () => {
  test("it exports what the wrapper exports", async () => {
    const wrapper = await import("./index.ts");
    const pure = await import("./pure.ts");
    // Every name, so a new export cannot land on one and not the other.
    expect(Object.keys(pure).toSorted()).toEqual(Object.keys(wrapper).toSorted());
  });
});
