// Reproduction for the M7 flow.ts bug. Drop into packages/core/src/ and run
// `bun test src/repro-park.test.ts`. FAILS on the hand-rolled loadingBoundary
// (revealed2 === "<i>ARM1</i><i>ARM1</i>"), passes with the instance fix.
import { describe, expect, test } from "bun:test";
import { boundary, branch } from "./flow.ts";
import { render } from "./dom.ts";
import { NotReadyError, block, computed, scope, signal } from "./signals.ts";
import type { Scope } from "./scope.ts";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("M7's parked-boundary bug", () => {
  test("a nested region that swaps while the body is stale reaches the document once", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const source = signal(1);
    let d = deferred<string>();
    const first = d;
    const data = computed(async () => {
      const v = source();
      if (v === 1) return first.promise;
      d = deferred<string>();
      return d.promise;
    });
    const which = signal(0);
    const arms = [
      block((_s: Scope | null) => {
        const n = document.createElement("b");
        n.textContent = "ARM0";
        return n;
      }),
      block((_s: Scope | null) => {
        const n = document.createElement("i");
        n.textContent = "ARM1";
        return n;
      }),
    ];
    const body = block((s: Scope | null) => {
      try {
        data();
      } catch (err) {
        if (err instanceof NotReadyError) throw err;
        throw err;
      }
      return branch(s, null, null, () => which(), arms);
    });
    scope(() => {
      const el = boundary(
        null,
        null,
        null,
        "loading",
        block(() => document.createTextNode("WAIT")),
        body,
        0,
        () => source(),
      );
      render(el, container);
    });
    await tick();
    first.resolve("one");
    await tick();
    await tick();
    source.set(2);
    await tick();
    await tick();
    which.set(1);
    await tick();
    d.resolve("two");
    await tick();
    await tick();
    expect(container.innerHTML).toBe("<i>ARM1</i>");
  });
});
