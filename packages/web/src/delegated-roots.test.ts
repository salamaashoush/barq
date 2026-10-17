import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import * as core from "./index.ts";
import { delegate, delegateEvents, hydrate, render } from "./dom.ts";
import { portal } from "./dom-flow.ts";
import { block, flush } from "@barqjs/core";

let hosts: HTMLElement[] = [];

function host(parent: Node = document.body): HTMLDivElement {
  const node = document.createElement("div");
  parent.appendChild(node);
  hosts.push(node);
  return node;
}

function button(label: string, seen: string[]): HTMLButtonElement {
  const node = document.createElement("button");
  node.textContent = label;
  delegate(node, "click", () => seen.push(label));
  return node;
}

function click(node: Element): void {
  node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function listenersOn(target: EventTarget, type: string): { added: number; removed: number } {
  const counts = { added: 0, removed: 0 };
  const add = target.addEventListener.bind(target);
  const remove = target.removeEventListener.bind(target);
  target.addEventListener = (
    name: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void => {
    if (name === type) counts.added++;
    add(name, listener, options);
  };
  target.removeEventListener = (
    name: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void => {
    if (name === type) counts.removed++;
    remove(name, listener, options);
  };
  return counts;
}

beforeEach(() => {
  hosts = [];
});

afterEach(() => {
  for (const node of hosts) node.remove();
});

describe("delegated events belong to the root that rendered them", () => {
  test("a handler on an element no root rendered never runs", () => {
    const seen: string[] = [];
    const loose = button("loose", seen);
    host().appendChild(loose);
    delegateEvents(["click"]);
    click(loose);
    expect(seen).toEqual([]);
  });

  test("render listens on its container, not on the document, and dispose stops listening", () => {
    const container = host();
    const onDocument = listenersOn(document, "barqrootping");
    const onContainer = listenersOn(container, "barqrootping");
    const seen: string[] = [];
    const dispose = render(() => {
      const node = document.createElement("button");
      delegate(node, "barqrootping", () => seen.push("ping"));
      return node;
    }, container);

    expect(onContainer.added).toBe(1);
    expect(onDocument.added).toBe(0);
    container.firstElementChild?.dispatchEvent(new Event("barqrootping", { bubbles: true }));
    expect(seen).toEqual(["ping"]);

    dispose();
    expect(onContainer.removed).toBe(1);
  });

  test("an event type declared after the root mounted reaches it", () => {
    const container = host();
    const seen: string[] = [];
    let node!: HTMLElement;
    const dispose = render(() => {
      node = document.createElement("button");
      (node as unknown as Record<string, unknown>).__bq_barqlateping = () => seen.push("late");
      return node;
    }, container);
    delegateEvents(["barqlateping"]);
    node.dispatchEvent(new Event("barqlateping", { bubbles: true }));
    expect(seen).toEqual(["late"]);
    dispose();
  });

  test("two roots on one page each run their own handlers, once", () => {
    const seen: string[] = [];
    const first = render(() => button("first", seen), host());
    const second = host();
    const stop = render(() => button("second", seen), second);
    click(second.firstElementChild!);
    click(hosts[0].firstElementChild!);
    expect(seen).toEqual(["second", "first"]);

    first();
    const kept = second.firstElementChild!;
    click(kept);
    expect(seen).toEqual(["second", "first", "second"]);
    stop();
  });

  test("a root nested in another runs its own handlers, then the outer tree's, each once", () => {
    const seen: string[] = [];
    const outerHost = host();
    let innerHost!: HTMLElement;
    const outer = render(() => {
      const frame = document.createElement("section");
      delegate(frame, "click", () => seen.push("outer"));
      innerHost = document.createElement("div");
      frame.appendChild(innerHost);
      return frame;
    }, outerHost);
    const inner = render(() => {
      const card = document.createElement("article");
      delegate(card, "click", () => seen.push("card"));
      card.appendChild(button("inner", seen));
      return card;
    }, innerHost);

    click(innerHost.querySelector("button")!);
    expect(seen).toEqual(["inner", "card", "outer"]);

    inner();
    outer();
  });

  test("stopPropagation in the inner root keeps the outer root's handlers from running", () => {
    const seen: string[] = [];
    let innerHost!: HTMLElement;
    const outer = render(() => {
      const frame = document.createElement("section");
      delegate(frame, "click", () => seen.push("outer"));
      innerHost = document.createElement("div");
      frame.appendChild(innerHost);
      return frame;
    }, host());
    const inner = render(() => {
      const node = document.createElement("button");
      delegate(node, "click", (event: Event) => {
        seen.push("inner");
        event.stopPropagation();
      });
      return node;
    }, innerHost);

    click(innerHost.firstElementChild!);
    expect(seen).toEqual(["inner"]);
    inner();
    outer();
  });

  test("hydrate listens on its container too", () => {
    const container = host();
    const onContainer = listenersOn(container, "click");
    const seen: string[] = [];
    const dispose = hydrate(() => button("hydrated", seen), container);
    flush();
    expect(onContainer.added).toBe(1);
    click(container.querySelector("button")!);
    expect(seen).toEqual(["hydrated"]);
    dispose();
    expect(onContainer.removed).toBe(1);
  });
});

describe("a portal's delegated events", () => {
  test("reach a portal mounted outside its root", () => {
    const target = host();
    const seen: string[] = [];
    const dispose = render(
      () =>
        portal(
          () => target,
          block(() => button("portaled", seen)),
        ),
      host(),
    );
    flush();
    click(target.querySelector("button")!);
    expect(seen).toEqual(["portaled"]);
    dispose();
    expect(target.querySelector("button")).toBeNull();
  });

  test("bubble from the portal to the element the portal is written in", () => {
    const target = host();
    const seen: string[] = [];
    const dispose = render(() => {
      const holder = document.createElement("div");
      delegate(holder, "click", () => seen.push("holder"));
      holder.appendChild(
        portal(
          () => target,
          block(() => button("portaled", seen)),
        ),
      );
      return holder;
    }, host());
    flush();
    click(target.querySelector("button")!);
    expect(seen).toEqual(["portaled", "holder"]);
    dispose();
  });

  test("run once when the portal is mounted inside its own root", () => {
    const container = host();
    let target!: HTMLElement;
    const seen: string[] = [];
    const dispose = render(() => {
      const frame = document.createElement("main");
      target = document.createElement("aside");
      frame.appendChild(target);
      frame.appendChild(
        portal(
          () => target,
          block(() => button("inside", seen)),
        ),
      );
      return frame;
    }, container);
    flush();
    click(target.querySelector("button")!);
    expect(seen).toEqual(["inside"]);
    dispose();
  });

  test("stop when the root that owns the portal is disposed", () => {
    const target = host();
    const seen: string[] = [];
    let node!: HTMLElement;
    const dispose = render(
      () =>
        portal(
          () => target,
          block(() => {
            node = button("portaled", seen);
            return node;
          }),
        ),
      host(),
    );
    flush();
    dispose();
    target.appendChild(node);
    click(node);
    expect(seen).toEqual([]);
  });
});

test("clearDelegatedEvents is gone: a root's listeners leave with the root", () => {
  expect("clearDelegatedEvents" in core).toBe(false);
});
