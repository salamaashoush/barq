/**
 * barq's own diagnostics channel: what the renderer can see and the engine
 * cannot. The engine reports its own through `@solidjs/signals`' `DEV`.
 */

import { describe, expect, test } from "bun:test";
import { DEV } from "./signals.ts";
import { render } from "./dom.ts";

function mountBuilt(): () => void {
  // An already-built subtree, which the root cannot own.
  return render(document.createElement("span"), document.createElement("div"));
}

describe("DEV.diagnostics", () => {
  test("capture collects what was emitted while it was open", () => {
    const capture = DEV.diagnostics.capture();
    mountBuilt()();
    const events = capture.stop();

    const hit = events.find((e) => e.code === "RENDER_SUBTREE_NOT_OWNED");
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("warning");
  });

  test("nothing is collected after stop", () => {
    const capture = DEV.diagnostics.capture();
    const before = capture.stop().length;
    mountBuilt()();
    expect(capture.stop().length).toBe(before);
  });

  test("subscribe receives events and unsubscribes", () => {
    const seen: string[] = [];
    const unsubscribe = DEV.diagnostics.subscribe((e) => seen.push(e.code));
    mountBuilt()();
    unsubscribe();
    mountBuilt()();
    expect(seen).toEqual(["RENDER_SUBTREE_NOT_OWNED"]);
  });
});
