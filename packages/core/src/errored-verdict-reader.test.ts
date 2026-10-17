/**
 * A binding that reads `isPending(x)` beside `x()`, under an error boundary,
 * after a refetch of `x` rejects.
 *
 * The compiler folds every dynamic attribute of an element into one effect, so
 * `class={{ stale: isPending(row) }}` and `data-x={() => row().x}` are one
 * computation: a verdict reader that also reads the value. When the refetch
 * rejects, the boundary shows its fallback while the content stays alive, and
 * the engine must leave the errored reader alone. Engines that re-derived it
 * at every landing met the stored error each time and queued another landing,
 * which spun `flush()` forever and froze the page.
 */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { insert, render, setAttr, setClass } from "./dom.ts";
import { boundary } from "./dom-flow.ts";
import { block } from "./props.ts";
import { bindEffect, createMemo, createRoot, createSignal, flush, isPending } from "./signals.ts";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Past this many runs the binding stops reading, which ends a runaway loop so
// the test can fail instead of hanging the runner.
const RUNAWAY = 100;

let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});
afterEach(() => container.remove());

type Row = { name: string; skeleton?: boolean };

test("a rejected refetch reaches the error fallback and the flush returns", async () => {
  const [generation, setGeneration] = createSignal(0);
  let fetches = 0;
  let runs = 0;

  const dispose = createRoot((disposeRoot) => {
    const row = createMemo<Row>(
      async () => {
        const asked = generation();
        fetches++;
        await sleep(5);
        if (asked === 2) throw new TypeError("Failed to fetch");
        return { name: `row ${asked}` };
      },
      { loadingValue: { name: "loading", skeleton: true } },
    );

    const content = (): Node => {
      const el = document.createElement("h4");
      bindEffect(
        (): { a: Record<string, boolean>; b: string } => {
          if (++runs > RUNAWAY) return { a: {}, b: "" };
          return {
            a: { row: true, stale: isPending(row) },
            b: String(row().skeleton === true),
          };
        },
        (value, prev) => {
          value.a = setClass(el, "class", value.a, prev?.a) as Record<string, boolean>;
          if (value.b !== prev?.b) setAttr(el, "data-skeleton", value.b);
        },
      );
      insert(el, () => row().name);
      return el;
    };

    render(() => {
      const outer = document.createElement("div");
      boundary(
        outer,
        null,
        "error",
        block((error: () => Error) =>
          document.createTextNode(`failed: ${error().message}`),
        ) as never,
        block(() => {
          const inner = document.createElement("div");
          boundary(
            inner,
            null,
            "loading",
            block(() => document.createTextNode("[loading]")),
            block(content),
          );
          return inner;
        }),
      );
      return outer;
    }, container);
    return disposeRoot;
  });

  flush();
  expect(container.querySelector("h4")?.getAttribute("data-skeleton")).toBe("true");
  await sleep(20);
  flush();
  expect(container.textContent).toBe("row 0");

  // An ordinary refetch: the stale row shows while it is in flight.
  setGeneration(1);
  flush();
  expect(container.querySelector("h4")?.className).toBe("row stale");
  await sleep(20);
  flush();
  expect(container.textContent).toBe("row 1");
  expect(container.querySelector("h4")?.className).toBe("row");

  setGeneration(2);
  flush();
  await sleep(20);
  flush();

  expect(runs, "the binding re-ran without end").toBeLessThanOrEqual(RUNAWAY);
  expect(container.textContent).toBe("failed: Failed to fetch");
  expect(fetches, "the rejected fetch was retried").toBe(3);
  dispose();
});
