// Reproduction for the M7 flow.ts bug. Drop into packages/core/src/ and run
// `bun test src/repro-park.test.ts`. FAILS on the hand-rolled loadingBoundary
// (revealed2 === "<i>ARM1</i><i>ARM1</i>"), passes with the instance fix.
import { rooted } from "./test-root.ts";
import { describe, expect, test } from "bun:test";
import { boundary, branch } from "./flow.ts";
import { render } from "./dom.ts";
import { NotReadyError, block, createMemo, createRoot, createSignal } from "./signals.ts";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("M7's parked-boundary bug", () => {
  test(
    "a nested region that swaps while the body is stale reaches the document once",
    rooted(async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const [source, setSource] = createSignal(1);
      let d = deferred<string>();
      const first = d;
      const data = createMemo(async () => {
        const v = source();
        if (v === 1) return first.promise;
        d = deferred<string>();
        return d.promise;
      });
      const [which, setWhich] = createSignal(0);
      const arms = [
        block(() => {
          const n = document.createElement("b");
          n.textContent = "ARM0";
          return n;
        }),
        block(() => {
          const n = document.createElement("i");
          n.textContent = "ARM1";
          return n;
        }),
      ];
      const body = block(() => {
        try {
          data();
        } catch (err) {
          if (err instanceof NotReadyError) throw err;
          throw err;
        }
        return branch(null, null, () => which(), arms);
      });
      createRoot(() => {
        const el = boundary(
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
      setSource(2);
      await tick();
      await tick();
      setWhich(1);
      await tick();
      d.resolve("two");
      await tick();
      await tick();
      expect(container.innerHTML).toBe("<i>ARM1</i>");
    }),
  );
});
