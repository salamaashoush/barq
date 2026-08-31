import { describe, expect, test } from "bun:test";

import { navigationMenuState } from "./navigation.ts";

const ORDER = ["products", "solutions", "pricing"];

/** Long enough for a timer scheduled at `ms` to have run. */
function after(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms + 20));
}

describe("navigationMenuState", () => {
  test("nothing is open to begin with", () => {
    const state = navigationMenuState();
    expect(state.value()).toBeNull();
  });

  test("the first panel waits, so brushing past the bar opens nothing", async () => {
    const state = navigationMenuState({ delay: 40 });
    state.openSoon("products");
    expect(state.value()).toBeNull();
    await after(40);
    expect(state.value()).toBe("products");
  });

  test("leaving before the delay is up opens nothing at all", async () => {
    const state = navigationMenuState({ delay: 40 });
    state.openSoon("products");
    state.close();
    await after(40);
    expect(state.value()).toBeNull();
  });

  test("once one is open the next is immediate", () => {
    // A delay between triggers reads as lag; the same delay before the first
    // one reads as not having meant it.
    const state = navigationMenuState({ delay: 1000 });
    state.open("products");
    state.openSoon("pricing");
    expect(state.value()).toBe("pricing");
  });

  test("closing waits, because the pointer has to cross the gap to the panel", async () => {
    const state = navigationMenuState({ closeDelay: 40 });
    state.open("products");
    state.closeSoon();
    expect(state.value()).toBe("products");
    await after(40);
    expect(state.value()).toBeNull();
  });

  test("entering the panel keeps it, which is what the gap is for", async () => {
    const state = navigationMenuState({ closeDelay: 40 });
    state.open("products");
    state.closeSoon();
    state.keep();
    await after(40);
    expect(state.value()).toBe("products");
  });

  test("the previous key is kept, because the animation depends on it", () => {
    const state = navigationMenuState();
    state.open("products");
    expect(state.previous()).toBeNull();
    state.open("pricing");
    expect(state.previous()).toBe("products");
  });

  test("a panel arriving knows which side it came from", () => {
    const state = navigationMenuState();
    state.open("products");
    state.open("pricing");
    // `pricing` is to the RIGHT of `products`, so it enters from the end.
    expect(state.motion("pricing", ORDER)).toBe("from-end");
    // And the one being replaced leaves towards the start.
    expect(state.motion("products", ORDER)).toBe("to-start");
  });

  test("and the other direction is the other way round", () => {
    const state = navigationMenuState();
    state.open("pricing");
    state.open("products");
    expect(state.motion("products", ORDER)).toBe("from-start");
    expect(state.motion("pricing", ORDER)).toBe("to-end");
  });

  test("the first panel of all has no direction, and says so", () => {
    // Nothing to measure against, so the caller writes no `data-motion` rather
    // than one it invented.
    const state = navigationMenuState();
    state.open("products");
    expect(state.motion("products", ORDER)).toBeNull();
  });

  test("an item the order does not know is not given a direction", () => {
    const state = navigationMenuState();
    state.open("products");
    state.open("pricing");
    expect(state.motion("nothing-like-this", ORDER)).toBeNull();
  });

  test("closing to nothing leaves no direction on the panel that goes", () => {
    const state = navigationMenuState();
    state.open("products");
    state.open("pricing");
    state.close();
    // Nothing took its place, so there is no side for it to leave towards.
    expect(state.motion("pricing", ORDER)).toBeNull();
  });

  test("a controlled value is the one reported, and the callback still fires", () => {
    const seen: (string | null)[] = [];
    let outer: string | null = "products";
    const state = navigationMenuState({
      value: () => outer,
      onValueChange: (next) => seen.push(next === null ? null : String(next)),
    });
    expect(state.value()).toBe("products");
    state.open("pricing");
    // The state did not move itself; the owner was told to.
    expect(seen).toEqual(["pricing"]);
    expect(state.value()).toBe("products");
    outer = "pricing";
    expect(state.value()).toBe("pricing");
  });

  test("opening what is already open changes nothing and tells nobody", () => {
    const seen: unknown[] = [];
    const state = navigationMenuState({ onValueChange: (next) => seen.push(next) });
    state.open("products");
    state.open("products");
    expect(seen).toEqual(["products"]);
    expect(state.previous()).toBeNull();
  });
});
