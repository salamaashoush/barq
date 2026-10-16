import { afterAll, beforeAll, expect, test } from "bun:test";

import { census, compileText, reuse, wire } from "./hydration.ts";

/**
 * Hydrating the DOCUMENT, not a container.
 *
 * The L5 oracle mounts every fixture into a `<div>` (`hydration.ts`'s `host`),
 * which cannot reach this: `<html>`, `<head>` and `<body>` are exactly the tags
 * a `<template>` cannot hold, so the compiler emits them as `element()` calls
 * and they take a different path through the claim walk than everything the
 * oracle measures. The five changes that made this work are recorded in the
 * commit that landed them; what was missing is a channel that FAILS if any of
 * them regresses.
 *
 * It was measured in a scratch probe and never pinned. A probe is a vibe; this
 * is the proof — and without it the next pass over `fallback.rs`'s `cold_call`
 * or the `TAGGED` flag would have nothing to fail against, because a document
 * that rebuilds instead of claiming SERIALISES IDENTICALLY to one that claimed.
 * Node identity is the only channel that can tell them apart, which is H1's
 * whole argument, applied one level up from where the oracle applies it.
 */

const SOURCE = `export default function Shell() {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>SERVED</title>
      </head>
      <body>
        <div id="app">hi</div>
      </body>
    </html>
  );
}`;

/**
 * The document this file replaces, so the suite's other files are not left
 * standing in the rubble.
 *
 * `document.open()` empties the whole thing, and bun shares one happy-dom
 * registration across the files in a run — so a test that writes a document and
 * walks away takes every sibling with it.
 */
let original = "";

beforeAll(() => {
  original = document.documentElement.outerHTML;
});

afterAll(() => {
  document.open();
  document.write(`<!doctype html>${original}`);
  document.close();
});

test("a tree rooted at <html> claims the served document", async () => {
  const compiled = await compileText(SOURCE, "document-shell");
  const core = await import("@barqjs/core");
  const markup = wire(compiled.ssr);

  // The served bytes, parsed by the parser rather than assigned as `innerHTML`:
  // `<html>` and `<head>` cannot be set that way, and the doctype is part of
  // what the claim walk has to step over.
  document.open();
  document.write(`<!doctype html>${markup}`);
  document.close();

  const before = census(document.documentElement);
  const title = document.querySelector("title");
  const app = document.getElementById("app");

  const dispose = core.hydrate(compiled.dom.default as never, document as never);
  const report = core.hydrate.report;

  // The claim, not the markup: a rebuilt document and a claimed one serialise
  // the same, so identity is the only evidence.
  expect(report.mismatches).toEqual([]);
  expect(report.recovered).toBe(false);
  expect(report.claimed).toBeGreaterThan(0);
  expect(title).not.toBeNull();
  expect(document.querySelector("title")).toBe(title);
  expect(document.getElementById("app")).toBe(app);
  expect(reuse(before, document.documentElement).percent).toBe(100);

  // The failure this whole path was built against: appending a second
  // `<html>` throws "Only one element on document allowed" in a real browser,
  // and happy-dom simply ends up with two.
  expect(document.querySelectorAll("html")).toHaveLength(1);
  expect(document.querySelectorAll("head")).toHaveLength(1);
  expect(document.querySelectorAll("body")).toHaveLength(1);
  expect(document.querySelectorAll("title")).toHaveLength(1);
  expect(document.title).toBe("SERVED");

  dispose();
});
