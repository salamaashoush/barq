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
 * `branch(null, null, …)` — parent NULL — so `siteFor` gives the region a
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

import { rooted } from "./test-root.ts";
import { beforeEach, expect, test } from "bun:test";
import { boundary, branch } from "./dom-flow.ts";
import { render } from "./dom.ts";
import { createMemo, flush, createRoot, createSignal } from "./signals.ts";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

/** A boundary whose content holds a nested region and one suspending read. */
function mount(nest: (which: () => number) => Node | Node[] | null) {
  let resolve!: (v: string) => void;
  const promise = new Promise<string>((r) => {
    resolve = r;
  });
  const data = createMemo(() => promise);
  const [which, setWhich] = createSignal(0);

  createRoot((_dispose) => {
    const el = boundary(
      null,
      null,
      "loading",
      () => document.createTextNode("[busy]"),
      () => [nest(() => which()), document.createTextNode(`:${data()}`)] as never,
    );
    render(el, container);
  });
  flush();
  return { resolve, setWhich };
}

test(
  "a nested region swaps into the DOCUMENT after the boundary reveals",
  rooted(async () => {
    // The compiler's shape: parent `null`, so the region gets a marker.
    const { resolve, setWhich } = mount((w: () => number) =>
      branch(null, null, w, [
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
    setWhich(1);
    flush();
    expect(container.textContent).toBe("B:ok");
  }),
);

test(
  "and the shape that DOES orphan it is a fragment handed over as a parent",
  rooted(async () => {
    const { resolve, setWhich } = mount((w: () => number) => {
      const frag = document.createDocumentFragment();
      branch(frag as unknown as Node, null, w, [
        () => document.createTextNode("A"),
        () => document.createTextNode("B"),
      ]);
      return frag;
    });

    resolve("ok");
    await tick();
    flush();
    // Asserted as it IS, not as it should be: the fragment drained when it was
    // inserted, and a region places its arm once its pass has committed, which
    // is after that. The arm is written somewhere detached, from the first one.
    expect(container.textContent).toBe(":ok");

    setWhich(1);
    flush();
    // And every later arm with it. Nothing the compiler emits reaches here —
    // `siteFor(null, null)` produces a marker and a real parent is a real element
    // — so this is a statement about a hand-written call, and it is the whole
    // reason the test above is worth having.
    expect(container.textContent).toBe(":ok");
  }),
);
