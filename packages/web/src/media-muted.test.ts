/**
 * A media element reads its `muted` attribute once, when the parser creates
 * it. Written later, the attribute moves `defaultMuted` and nothing else, so a
 * dynamic `muted` has to be the property.
 */

import { expect, test } from "bun:test";
import { spread } from "./dom.ts";
import { createSignal, flush, rootScope, runWithOwner } from "@barqjs/core";

function recorded(tag: "audio" | "video"): { element: HTMLMediaElement; writes: boolean[] } {
  const element = document.createElement(tag);
  const writes: boolean[] = [];
  let held = false;
  Object.defineProperty(element, "muted", {
    configurable: true,
    get: () => held,
    set: (value: boolean) => {
      held = value;
      writes.push(value);
    },
  });
  return { element, writes };
}

for (const tag of ["audio", "video"] as const) {
  test(`<${tag} muted> written after creation sets the property`, () => {
    const { element, writes } = recorded(tag);
    const [props, setProps] = createSignal<Record<string, unknown>>({ muted: true });
    runWithOwner(rootScope(), () => spread(element, props));
    flush();
    expect(writes).toEqual([true]);
    setProps({ muted: false });
    flush();
    expect(writes).toEqual([true, false]);
  });
}

test("`muted` on an element that is not media stays an attribute", () => {
  const element = document.createElement("div");
  runWithOwner(rootScope(), () => spread(element, { muted: true }));
  flush();
  expect(element.hasAttribute("muted")).toBe(true);
});
