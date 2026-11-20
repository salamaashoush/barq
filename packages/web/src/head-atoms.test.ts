import { createRoot, flush } from "@barqjs/core";
import { afterEach, expect, test } from "bun:test";

import { useHead } from "./head.ts";

afterEach(() => {
  document.head.innerHTML = "";
});

/**
 * A build's atoms are linked last, because an atom and a `css` block class are
 * both 0-1-0 and the later stylesheet wins. A stylesheet `useHead` adds after
 * the first paint goes in front of them; anything else goes at the end.
 */
test("a stylesheet useHead adds goes in front of the atoms' link", () => {
  document.head.innerHTML =
    '<link rel="stylesheet" href="/a.css"><link rel="stylesheet" href="/atoms.css" data-barq-atoms>';
  createRoot(() => {
    useHead([
      { tag: "link", props: { rel: "stylesheet", href: "/b.css" } },
      { tag: "style", children: ".x{color:red}" },
      { tag: "meta", props: { name: "description", content: "salama" } },
    ]);
  });
  flush();
  const order = [...document.head.children].map(
    (element) => element.getAttribute("href") ?? element.localName,
  );
  expect(order).toEqual(["/a.css", "/b.css", "style", "/atoms.css", "meta"]);
});
