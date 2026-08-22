/**
 * dom-expressions-parity optimizations: array reconciliation with node
 * identity + text reuse, prev-value diffing (style/class/attrs),
 * reactive spread, [handler, data] delegation tuples, event replay.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { element, hydrate, insert, setProp, spread } from "./dom.ts";
import { flush, signal } from "./signals.ts";

let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

describe("insert: array reconciliation", () => {
  test("reordering keeps node identity (no recreation)", () => {
    const a = document.createElement("i");
    a.textContent = "a";
    const b = document.createElement("b");
    b.textContent = "b";
    const c = document.createElement("u");
    c.textContent = "c";

    const list = signal([a, b, c]);
    insert(null, container, () => list());
    flush();
    expect(container.textContent).toBe("abc");

    list.set([c, a, b]);
    flush();
    expect(container.textContent).toBe("cab");
    // identical node instances, just moved
    expect(container.querySelector("i")).toBe(a);
    expect(container.querySelector("b")).toBe(b);
    expect(container.querySelector("u")).toBe(c);
  });

  test("append/remove at edges touch only the edges", () => {
    const nodes = [0, 1, 2].map((n) => {
      const el = document.createElement("span");
      el.textContent = String(n);
      return el;
    });
    const list = signal(nodes.slice(0, 2));
    insert(null, container, () => list());
    flush();

    list.set(nodes); // append at end
    flush();
    expect(container.textContent).toBe("012");
    expect(container.children[0]).toBe(nodes[0]); // untouched

    list.set(nodes.slice(1)); // remove from start
    flush();
    expect(container.textContent).toBe("12");
    expect(container.children[0]).toBe(nodes[1]);
  });

  test("text nodes are reused positionally when content matches", () => {
    const items = signal(["a", "b", "c"]);
    insert(null, container, () => items());
    flush();

    const firstText = container.firstChild?.nextSibling; // after start marker
    expect(firstText?.nodeType).toBe(3);

    items.set(["a", "b", "d"]); // only last changes
    flush();
    expect(container.textContent).toBe("abd");
    expect(container.firstChild?.nextSibling).toBe(firstText); // "a" reused
  });
});

describe("prev-value diffing", () => {
  test("style objects: vanished keys removed, unchanged keys not rewritten", () => {
    const el = document.createElement("div");
    const writes: string[] = [];
    const origSet = el.style.setProperty.bind(el.style);
    el.style.setProperty = (name: string, value: string | null) => {
      writes.push(name);
      return origSet(name, value);
    };

    const styles = signal<Record<string, string>>({ color: "red", margin: "4px" });
    setProp(null, el, "style", () => styles());
    flush();
    expect(writes).toEqual(["color", "margin"]);
    expect(el.style.color).toBe("red");

    writes.length = 0;
    styles.set({ color: "red", padding: "2px" }); // margin gone, color same
    flush();
    expect(el.style.margin).toBe("");
    expect(el.style.padding).toBe("2px");
    expect(writes).toEqual(["padding"]); // color untouched
  });

  test("identical attribute values skip DOM writes", () => {
    const el = document.createElement("div");
    let sets = 0;
    const origSetAttr = el.setAttribute.bind(el);
    el.setAttribute = (name: string, value: string) => {
      sets++;
      return origSetAttr(name, value);
    };

    const title = signal("x");
    const tick = signal(0);
    setProp(null, el, "title", () => {
      tick(); // extra dependency forcing re-runs
      return title();
    });
    flush();
    expect(sets).toBe(1);

    tick.set(1); // re-run with same title value
    flush();
    expect(sets).toBe(1); // no write

    title.set("y");
    flush();
    expect(sets).toBe(2);
  });

  test("class objects diff the final string", () => {
    const el = document.createElement("div");
    const active = signal(true);
    setProp(null, el, "class", () => ({ btn: true, active: active() }));
    flush();
    expect(el.className).toBe("btn active");

    active.set(false);
    flush();
    expect(el.className).toBe("btn");
  });
});

describe("spread", () => {
  test("applies, updates, and removes props reactively", () => {
    const el = document.createElement("div");
    const props = signal<Record<string, unknown>>({ id: "a", title: "t1" });
    spread(null, el, () => props());
    flush();
    expect(el.getAttribute("id")).toBe("a");
    expect(el.getAttribute("title")).toBe("t1");

    props.set({ id: "a", lang: "en" }); // title vanished, lang added
    flush();
    expect(el.getAttribute("title")).toBeNull();
    expect(el.getAttribute("lang")).toBe("en");
    expect(el.getAttribute("id")).toBe("a");
  });

  test("event handlers swap; old handler no longer fires", () => {
    const el = document.createElement("button");
    document.body.appendChild(el);
    const log: string[] = [];
    const props = signal<Record<string, unknown>>({
      onClick: () => log.push("first"),
    });
    spread(null, el, () => props());
    flush();
    el.click();
    expect(log).toEqual(["first"]);

    props.set({ onClick: () => log.push("second") });
    flush();
    el.click();
    expect(log).toEqual(["first", "second"]);

    props.set({}); // handler removed
    flush();
    el.click();
    expect(log).toEqual(["first", "second"]);
  });

  test("ref applies once on mount", () => {
    const el = document.createElement("div");
    let refCalls = 0;
    const n = signal(0);
    spread(null, el, () => ({ "data-n": n(), ref: () => refCalls++ }));
    flush();
    expect(refCalls).toBe(1);

    n.set(1);
    flush();
    expect(refCalls).toBe(1); // not re-applied
    expect(el.getAttribute("data-n")).toBe("1");
  });
});

describe("[handler, data] delegation tuples", () => {
  test("delegated tuple calls handler with bound data", () => {
    const seen: unknown[] = [];
    const handler = (data: unknown, e: Event) => {
      seen.push([data, e.type]);
    };
    const el = element(null, "button", { onClick: [handler, 42] }) as HTMLButtonElement;
    container.appendChild(el);
    el.click();
    expect(seen).toEqual([[42, "click"]]);
  });

  test("non-delegated tuple wraps into a listener", () => {
    const seen: unknown[] = [];
    const el = element(null, "div", {
      onMouseEnter: [(data: unknown) => seen.push(data), "hover-data"],
    }) as HTMLDivElement;
    container.appendChild(el);
    el.dispatchEvent(new MouseEvent("mouseenter"));
    expect(seen).toEqual(["hover-data"]);
  });
});

describe("pre-hydration event replay", () => {
  test("captured clicks replay against the hydrated DOM", () => {
    let clicks = 0;
    const makeApp = () => () =>
      element(null, "button", { onClick: () => clicks++, children: "go" });

    // Simulate the inline capture script's leftovers
    let stopCalled = false;
    const g = globalThis as Record<string, unknown>;
    g.__BARQ_EVTS__ = [
      {
        type: "click",
        x: 10,
        y: 10,
        button: 0,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
      },
    ];
    g.__BARQ_EVTS_STOP__ = () => {
      stopCalled = true;
    };

    // happy-dom has no layout: route elementFromPoint to our button
    const origFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => container.querySelector("button");

    try {
      hydrate(makeApp(), container);
    } finally {
      document.elementFromPoint = origFromPoint;
    }

    expect(stopCalled).toBe(true);
    expect(clicks).toBe(1);
    expect(g.__BARQ_EVTS__).toBeUndefined();
  });
});

/**
 * `__BARQ_SWAP__` runs between capture and replay on every streamed page, so a
 * record's target has to survive a region being replaced under it. A child-index
 * path does not: the fallback the user clicked and the content that replaced it
 * sit at the same index.
 */
describe("pre-hydration replay across a swap", () => {
  const record = (over: Record<string, unknown>): Record<string, unknown> => ({
    type: "click",
    x: 10,
    y: 10,
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...over,
  });

  /** Hydration of an empty container: nothing claimed, nothing recovered. */
  const replayInto = (queue: unknown[]): void => {
    const g = globalThis as Record<string, unknown>;
    g.__BARQ_EVTS__ = queue;
    g.__BARQ_EVTS_STOP__ = (): void => {};
    hydrate(() => element(null, "i", { children: "" }), container);
  };

  /** Where a body-relative child-index path lands, for a node already in place. */
  const pathTo = (node: Node): number[] => {
    const path: number[] = [];
    let current: Node | null = node;
    while (current !== null && current !== document.body) {
      let index = 0;
      let sibling: Node | null = current;
      while ((sibling = sibling.previousSibling) !== null) index++;
      path.unshift(index);
      current = current.parentNode;
    }
    return path;
  };

  test("the captured node is the target even when its path has shifted", () => {
    let clicks = 0;
    const survivor = document.createElement("button");
    survivor.addEventListener("click", () => clicks++);
    document.body.appendChild(survivor);
    const path = pathTo(survivor);
    // Something else lands in front of it, so the recorded path now addresses a
    // different node — which is what an unrelated boundary settling does.
    document.body.insertBefore(document.createElement("span"), document.body.firstChild);

    replayInto([record({ node: survivor, path })]);

    expect(clicks).toBe(1);
  });

  test("a click on a fallback that was swapped away does not land on its replacement", () => {
    let victimClicks = 0;
    const victim = document.createElement("button");
    victim.addEventListener("click", () => victimClicks++);

    // The `pending` fallback the user actually clicked, replaced by the swap —
    // which is exactly a same-index substitution, so the recorded path now
    // addresses the content rather than the placeholder.
    const host = document.createElement("div");
    document.body.appendChild(host);
    const fallback = document.createElement("p");
    host.appendChild(fallback);
    const path = pathTo(fallback);
    host.replaceChild(victim, fallback);

    expect(pathTo(victim)).toEqual(path);

    const original = document.elementFromPoint;
    document.elementFromPoint = (): Element => victim;
    try {
      replayInto([record({ node: fallback, path })]);
    } finally {
      document.elementFromPoint = original;
    }

    expect(victimClicks).toBe(0);
  });

  test("a typed value goes back into the input it was typed into", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const path = pathTo(input);
    document.body.insertBefore(document.createElement("span"), document.body.firstChild);

    replayInto([
      {
        type: "@state",
        node: input,
        path,
        value: "typed before the bundle arrived",
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
      },
    ]);

    expect(input.value).toBe("typed before the bundle arrived");
  });
});
