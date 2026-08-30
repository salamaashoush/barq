/**
 * Auto-cleanup, which is what makes one test's DOM invisible to the next.
 *
 * It used to be a COMMENT telling you to wire `afterEach(cleanup)` yourself, so
 * a suite that forgot inherited the previous test's `document.body` and failed
 * in a way that reads as a bug in the component under test.
 */

import { describe, expect, test } from "bun:test";

import { render } from "./index.ts";

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

describe("`./pure.ts` is the same surface with the hook left off", () => {
  test("it exports what the wrapper exports", async () => {
    const wrapper = await import("./index.ts");
    const pure = await import("./pure.ts");
    // Every name, so a new export cannot land on one and not the other.
    expect(Object.keys(pure).toSorted()).toEqual(Object.keys(wrapper).toSorted());
  });
});
