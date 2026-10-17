/**
 * An expression that is the whole body of a region, driven as the compiler
 * emits it: `<Show when={open()}>{count()}</Show>` lowers to
 * `branch(…, [null, block(() => [() => count()])])` and
 * `<Show …>count: {count()}</Show>` to
 * `branch(…, [null, block(() => ["count: ", () => count()])])`. A body is
 * invoked once, so the read is a hole inside it rather than the body itself.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { branch } from "./dom-flow.ts";
import { block, createSignal, flush, rootScope, runWithOwner } from "./signals.ts";

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  host.remove();
});

function mount(build: () => void): void {
  runWithOwner(rootScope(), build);
  flush();
}

test("a branch whose body holds a lone read follows the value it reads", () => {
  const [open] = createSignal(true);
  const [count, setCount] = createSignal(0);
  mount(() => {
    branch(host, null, () => (open() ? 1 : 0), [null, block(() => [() => count()])]);
  });
  expect(host.textContent).toBe("0");

  setCount(1);
  flush();
  expect(host.textContent).toBe("1");
});

test("a branch whose body holds text and a read follows the value", () => {
  const [open] = createSignal(true);
  const [count, setCount] = createSignal(0);
  mount(() => {
    branch(host, null, () => (open() ? 1 : 0), [null, block(() => ["count: ", () => count()])]);
  });
  expect(host.textContent).toBe("count: 0");

  setCount(1);
  flush();
  expect(host.textContent).toBe("count: 1");
});
