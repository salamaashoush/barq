import { describe, expect, test } from "bun:test";

import { ownerDocument } from "./dom.ts";

/**
 * A node's document, when the node is not in one yet.
 *
 * barq builds every element by cloning a `<template>`, and a clone belongs to
 * the INERT template document until it is inserted. That document has no
 * browsing context: its `activeElement` is null, its `defaultView` is null, and
 * a listener added to it never fires. Asking it anything was asking the wrong
 * document, and what that cost was an overlay recording `null` as the element
 * to give focus back to — so closing a dialog left focus on `<body>`, in a real
 * browser only.
 */
describe("ownerDocument", () => {
  test("a document with no browsing context is not the page's", () => {
    const inert = document.implementation.createHTMLDocument("inert");
    const node = inert.createElement("span");

    expect(inert.defaultView).toBeNull();
    expect(node.ownerDocument).toBe(inert);
    expect(ownerDocument(node)).toBe(document);
  });

  test("a node in the page keeps its own", () => {
    const node = document.createElement("span");
    document.body.appendChild(node);
    expect(ownerDocument(node)).toBe(document);
    node.remove();
  });

  test("a document is itself, and a window is its document", () => {
    expect(ownerDocument(document)).toBe(document);
    expect(ownerDocument(window)).toBe(document);
  });

  test("nothing at all is the page's document", () => {
    expect(ownerDocument(null)).toBe(document);
    expect(ownerDocument(undefined)).toBe(document);
  });
});
