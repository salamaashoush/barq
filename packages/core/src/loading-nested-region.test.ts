/**
 * M7's `flow.ts` report, closed by measurement rather than by a fix.
 *
 * The report: after a `Loading` boundary parks and reveals, a nested region at a
 * detached site that swaps LATER writes into an orphaned fragment — the arm is
 * built and never reaches the document. M10 fixed one half (leaving the park
 * takes every child of the fragment, not the node list the last build returned).
 * The other half stayed on the open list from M7 to M12 with no test anywhere.
 *
 * It does not reproduce in the shape the compiler emits, and the two tests below
 * are what says so and why. `<Loading><Show/>…</Loading>` compiles to
 * `branch(s, null, null, …)` — parent NULL — so `siteFor` gives the region a
 * MARKER and the region inserts relative to it. The marker is one of the
 * boundary's own nodes, so it travels with the content on both moves and a
 * later swap lands wherever the marker now is.
 *
 * The reproducer is a region handed a `DocumentFragment` AS ITS PARENT, and that
 * is a shape the compiler never emits: a fragment drains when it is inserted, so
 * its child list is empty from that moment and every later write goes somewhere
 * detached. It is kept here as the second test, failing-by-construction and
 * asserted as such, because "the bug does not reproduce" is worth nothing
 * without the shape that does.
 */

import { beforeEach, expect, test } from "bun:test";
import { boundary, branch } from "./flow.ts";
import { render } from "./dom.ts";
import type { Scope } from "./scope.ts";
import { computed, flush, scope, signal } from "./signals.ts";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

/** A boundary whose content holds a nested region and one suspending read. */
function mount(nest: (inner: Scope | null, which: () => number) => Node | null) {
  let resolve!: (v: string) => void;
  const promise = new Promise<string>((r) => {
    resolve = r;
  });
  const data = computed(() => promise);
  const which = signal(0);

  scope((_dispose, s) => {
    const el = boundary(
      s,
      null,
      null,
      "loading",
      () => document.createTextNode("[busy]"),
      (inner: Scope | null) =>
        [nest(inner, () => which()), document.createTextNode(`:${data()}`)] as never,
    );
    render(el, container);
  });
  flush();
  return { resolve, which };
}

test("a nested region swaps into the DOCUMENT after the boundary reveals", async () => {
  // The compiler's shape: parent `null`, so the region gets a marker.
  const { resolve, which } = mount((inner, w) =>
    branch(inner, null, null, w, [
      () => document.createTextNode("A"),
      () => document.createTextNode("B"),
    ]),
  );

  expect(container.textContent).toBe("[busy]");

  resolve("ok");
  await tick();
  flush();
  expect(container.textContent).toBe("A:ok");

  // The half M7 reported. The arm must REPLACE the old one on the page, not be
  // built into a fragment that never reaches it.
  which.set(1);
  flush();
  expect(container.textContent).toBe("B:ok");
});

test("and the shape that DOES orphan it is a fragment handed over as a parent", async () => {
  const { resolve, which } = mount((inner, w) => {
    const frag = document.createDocumentFragment();
    branch(inner, frag as unknown as Node, null, w, [
      () => document.createTextNode("A"),
      () => document.createTextNode("B"),
    ]);
    return frag;
  });

  resolve("ok");
  await tick();
  flush();
  expect(container.textContent).toBe("A:ok");

  which.set(1);
  flush();
  // Asserted as it IS, not as it should be: the fragment drained when it was
  // inserted, so the region's parent has been empty ever since and the new arm
  // is written somewhere detached. Nothing the compiler emits reaches here —
  // `siteFor(null, null)` produces a marker and a real parent is a real element
  // — so this is a statement about a hand-written call, and it is the whole
  // reason the test above is worth having.
  expect(container.textContent).toBe(":ok");
});
