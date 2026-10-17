/**
 * A boundary that has shown its content and parks it again takes what is on
 * the page, not what its content build returned.
 *
 * The two differ whenever a region inside the content swapped an arm after the
 * build: the build's node list still names the arm that left. Parked by that
 * list, the arm on the page stays where it is, beside the fallback, and the
 * stale one is what comes back on the reveal.
 */
import "./host.ts";
import { expect, test } from "bun:test";
import { Loading, Show, createMemo, createRoot, createSignal, flush } from "@barqjs/core";
import { render } from "./dom.ts";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const text = (value: string) => (): Node => document.createTextNode(value);

test("re-parking takes the arm a nested region swapped in", async () => {
  const container = document.createElement("div");
  const [id, setId] = createSignal(0);
  const dispose = createRoot((disposeRoot) => {
    const data = createMemo<string | null>(() => {
      const current = id();
      return current === 0 ? null : sleep(5).then(() => `answer ${current}`);
    });
    render(
      Loading({
        on: id,
        fallback: text("[loading]"),
        children: () =>
          Show({
            when: () => data() !== null,
            fallback: text("[idle]"),
            children: text("[has data]"),
          }),
      }),
      container,
    );
    return disposeRoot;
  });
  flush();
  expect(container.textContent).toBe("[idle]");

  setId(1);
  flush();
  expect(container.textContent).toBe("[loading]");
  await sleep(20);
  flush();
  // The nested region has now swapped: `[idle]` left and `[has data]` is in.
  expect(container.textContent).toBe("[has data]");

  setId(2);
  flush();
  expect(container.textContent, "the content was parked by a stale node list").toBe("[loading]");
  await sleep(20);
  flush();
  expect(container.textContent).toBe("[has data]");
  dispose();
});
