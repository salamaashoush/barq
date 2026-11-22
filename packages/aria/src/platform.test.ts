import { afterEach, describe, expect, test } from "bun:test";
import { isIOS, isIPad, isMac } from "./platform.ts";

const pinned: [string, PropertyDescriptor | undefined][] = [];

function pin(name: "platform" | "userAgentData" | "maxTouchPoints", value: unknown): void {
  pinned.push([name, Object.getOwnPropertyDescriptor(navigator, name)]);
  Object.defineProperty(navigator, name, { value, configurable: true });
}

afterEach(() => {
  for (const [name, descriptor] of pinned.splice(0).toReversed()) {
    if (descriptor === undefined) Reflect.deleteProperty(navigator, name);
    else Object.defineProperty(navigator, name, descriptor);
  }
});

describe("platform", () => {
  test("an empty userAgentData.platform falls back to navigator.platform", () => {
    pin("userAgentData", { brands: [], platform: "" });
    pin("platform", "MacIntel");
    expect(isMac()).toBe(true);
  });

  test("iPadOS reports a Mac with touch points, and is an iPad", () => {
    pin("platform", "MacIntel");
    pin("maxTouchPoints", 5);
    expect(isIPad()).toBe(true);
    expect(isIOS()).toBe(true);
  });
});
