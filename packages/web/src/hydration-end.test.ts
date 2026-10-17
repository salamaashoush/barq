/**
 * `isHydrating` and `onHydrationEnd`, under Solid's names.
 *
 * `hydrate` is synchronous to its end, so "the end" is after it returns: a
 * callback registered while the claim is live must not run inside it, and one
 * registered when nothing is hydrating still runs, a microtask later.
 */

import { describe, expect, test } from "bun:test";

import { hydrate, isHydrating, onHydrationEnd } from "./index.ts";

const microtask = (): Promise<void> => Promise.resolve();

describe("hydration state", () => {
  test("isHydrating is true only while the claim is live", () => {
    expect(isHydrating()).toBe(false);
    let during = false;
    const dispose = hydrate(() => {
      during = isHydrating();
      return document.createTextNode("claimed");
    }, document.createElement("div"));
    expect(during).toBe(true);
    expect(isHydrating()).toBe(false);
    dispose();
  });

  test("a callback registered while hydrating runs once, after hydrate returns", async () => {
    const order: string[] = [];
    const dispose = hydrate(() => {
      onHydrationEnd(() => order.push("end"));
      return document.createTextNode("claimed");
    }, document.createElement("div"));
    order.push("returned");
    expect(order).toEqual(["returned"]);
    await microtask();
    expect(order).toEqual(["returned", "end"]);
    await microtask();
    expect(order).toEqual(["returned", "end"]);
    dispose();
  });

  test("with nothing hydrating the callback still runs, a microtask later", async () => {
    let ran = false;
    onHydrationEnd(() => {
      ran = true;
    });
    expect(ran).toBe(false);
    await microtask();
    expect(ran).toBe(true);
  });
});
