/**
 * A component handed out through `hot` keeps its identity across an edit, and
 * what is on screen is rebuilt with the new implementation while the state
 * above it stays as it was.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { insert } from "./dom.ts";
import { hot, type HotContext } from "./hot.ts";
import { createSignal, flush, onCleanup, rootScope, runWithOwner } from "./signals.ts";

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  host.remove();
});

function label(text: () => string): HTMLElement {
  const node = document.createElement("b");
  insert(node, text);
  return node;
}

test("an edit swaps the implementation in place and keeps the caller's state", () => {
  const context: HotContext = { data: {} };
  const [count, setCount] = createSignal(1);
  const disposed: string[] = [];

  const first = hot(context, "Counter", (props: { count: () => number }) => {
    onCleanup(() => disposed.push("first"));
    return label(() => `first ${props.count()}`);
  });
  runWithOwner(rootScope(), () => insert(host, first({ count })));
  flush();
  expect(host.textContent).toBe("first 1");

  setCount(2);
  flush();
  expect(host.textContent).toBe("first 2");

  const second = hot(context, "Counter", (props: { count: () => number }) =>
    label(() => `second ${props.count()}`),
  );
  expect(second).toBe(first);
  expect(host.textContent).toBe("second 2");
  expect(disposed).toEqual(["first"]);
  expect(host.querySelectorAll("b")).toHaveLength(1);

  setCount(3);
  flush();
  expect(host.textContent).toBe("second 3");
});

test("two components of one module are replaced independently", () => {
  const context: HotContext = { data: {} };
  const title = hot(context, "Title", () => label(() => "title"));
  const body = hot(context, "Body", () => label(() => "body"));
  runWithOwner(rootScope(), () => insert(host, [title(), body()]));
  flush();
  const [kept] = host.querySelectorAll("b");

  hot(context, "Body", () => label(() => "edited"));
  expect(host.textContent).toBe("titleedited");
  expect(host.querySelector("b")).toBe(kept);
});

test("a component whose signature did not move keeps its instance and its state", () => {
  const context: HotContext = { data: {} };
  const counter = (): HTMLElement => {
    const [clicks, setClicks] = createSignal(0);
    const node = label(() => `clicks ${clicks()}`);
    node.addEventListener("click", () => {
      setClicks(clicks() + 1);
      flush();
    });
    return node;
  };
  const kept = hot(context, "Counter", counter, "same");
  const edited = hot(context, "Title", () => label(() => "title"), "one");
  runWithOwner(rootScope(), () => insert(host, [kept(), edited()]));
  flush();
  const [button] = host.querySelectorAll("b");
  button?.dispatchEvent(new Event("click"));
  expect(host.textContent).toBe("clicks 1title");

  hot(context, "Counter", counter, "same");
  hot(context, "Title", () => label(() => "renamed"), "two");
  expect(host.querySelector("b")).toBe(button);
  expect(host.textContent).toBe("clicks 1renamed");
});

test("a component is built where it is called, not where its result is read", () => {
  const context: HotContext = { data: {} };
  const order: string[] = [];
  const first = hot(context, "First", () => {
    order.push("first");
    return label(() => "first");
  });
  const second = hot(context, "Second", () => {
    order.push("second");
    return label(() => "second");
  });
  runWithOwner(rootScope(), () => {
    const one = first();
    const two = second();
    order.push("placed");
    insert(host, [two, one]);
  });
  flush();
  expect(order).toEqual(["first", "second", "placed"]);
});
