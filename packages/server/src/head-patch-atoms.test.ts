import { afterEach, expect, test } from "bun:test";

import { applyHeadPatch } from "./swap.ts";

afterEach(() => {
  document.head.innerHTML = "";
});

/**
 * A streamed boundary's head arrives after the first paint, and a stylesheet in
 * it goes in front of the build's atoms, which win a property against a rule of
 * the same specificity by being linked after it.
 */
test("a stylesheet a head patch adds goes in front of the atoms' link", () => {
  document.head.innerHTML =
    '<link rel="stylesheet" href="/a.css"><link rel="stylesheet" href="/atoms.css" data-barq-atoms>';
  applyHeadPatch([
    { k: "link:stylesheet:/b.css", t: "link", a: { rel: "stylesheet", href: "/b.css" } },
    { k: "meta:description", t: "meta", a: { name: "description", content: "salama" } },
  ]);
  const order = [...document.head.children].map(
    (element) => element.getAttribute("href") ?? element.localName,
  );
  expect(order).toEqual(["/a.css", "/b.css", "/atoms.css", "meta"]);
});
