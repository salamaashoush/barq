/**
 * delegateEvents - the document-level listener install that makes
 * compiler-emitted `$$<type>` expandos live.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { clearDelegatedEvents, delegateEvents, setProp } from "./dom.ts";

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
});

/** Count document-level registrations for one event type */
function countInstalls<T>(type: string, fn: () => T): { result: T; installs: number } {
  const original = document.addEventListener.bind(document);
  let installs = 0;
  document.addEventListener = ((t: string, ...rest: unknown[]) => {
    if (t === type) installs++;
    return (original as (t: string, ...r: unknown[]) => void)(t, ...rest);
  }) as typeof document.addEventListener;
  try {
    return { result: fn(), installs };
  } finally {
    document.addEventListener = original;
  }
}

/** The `$$<type>` expando surface the compiler writes to */
function expando(el: Element): Record<string, unknown> {
  return el as unknown as Record<string, unknown>;
}

function fire(el: Element, type: string): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
}

describe("delegateEvents", () => {
  test("installs a document listener for a type nobody has bound yet", () => {
    const { installs } = countInstalls("barqping1", () => {
      delegateEvents(["barqping1"]);
    });
    expect(installs).toBe(1);
  });

  test("installing twice does not double-install", () => {
    const { installs } = countInstalls("barqping2", () => {
      delegateEvents(["barqping2"]);
      delegateEvents(["barqping2"]);
      delegateEvents(["barqping2", "barqping2"]);
    });
    expect(installs).toBe(1);
  });

  test("an expando written directly (no setProp) fires on a dispatched event", () => {
    delegateEvents(["barqping3"]);
    const el = document.createElement("button");
    container.appendChild(el);

    const seen: Event[] = [];
    expando(el).$$barqping3 = (e: Event) => {
      seen.push(e);
    };

    fire(el, "barqping3");
    expect(seen.length).toBe(1);
  });

  test("without delegateEvents the expando is dead", () => {
    const el = document.createElement("button");
    container.appendChild(el);

    let calls = 0;
    expando(el).$$barqneverinstalled = () => {
      calls++;
    };

    fire(el, "barqneverinstalled");
    expect(calls).toBe(0);
  });

  test("tuple form passes its data argument, then the event", () => {
    delegateEvents(["barqping4"]);
    const el = document.createElement("div");
    container.appendChild(el);

    const args: unknown[] = [];
    expando(el).$$barqping4 = [
      (data: unknown, e: Event) => {
        args.push(data, e.type);
      },
      { row: 7 },
    ];

    fire(el, "barqping4");
    expect(args[0]).toEqual({ row: 7 });
    expect(args[1]).toBe("barqping4");
  });

  test("handler runs with the owning node as `this` and as currentTarget", () => {
    delegateEvents(["barqping5"]);
    const outer = document.createElement("div");
    const inner = document.createElement("span");
    outer.appendChild(inner);
    container.appendChild(outer);

    const receivers: unknown[] = [];
    let currentTarget: unknown;
    let target: unknown;
    expando(outer).$$barqping5 = function (this: unknown, e: Event) {
      receivers.push(this);
      currentTarget = e.currentTarget;
      target = e.target;
    };

    fire(inner, "barqping5");
    expect(receivers).toEqual([outer]);
    expect(currentTarget).toBe(outer);
    expect(target).toBe(inner);
  });

  test("currentTarget is restored once the walk ends", () => {
    delegateEvents(["barqping10"]);
    const el = document.createElement("div");
    container.appendChild(el);

    let during: unknown;
    expando(el).$$barqping10 = (e: Event) => {
      during = e.currentTarget;
    };

    const event = fire(el, "barqping10");
    expect(during).toBe(el);
    expect(event.currentTarget).not.toBe(document);
  });

  test("a non-bubbling type is reported instead of silently installing a dead handler", () => {
    const original = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(String(args[0]));
    };
    try {
      delegateEvents(["focus"]);
      delegateEvents(["focus"]);
      delegateEvents(["click"]);
    } finally {
      console.warn = original;
    }
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("focus");
  });

  test("walks ancestors from the target upward", () => {
    delegateEvents(["barqping6"]);
    const outer = document.createElement("div");
    const inner = document.createElement("span");
    outer.appendChild(inner);
    container.appendChild(outer);

    const order: string[] = [];
    expando(inner).$$barqping6 = () => order.push("inner");
    expando(outer).$$barqping6 = () => order.push("outer");

    fire(inner, "barqping6");
    expect(order).toEqual(["inner", "outer"]);
  });

  test("stopPropagation halts the ancestor walk", () => {
    delegateEvents(["barqping7"]);
    const outer = document.createElement("div");
    const inner = document.createElement("span");
    outer.appendChild(inner);
    container.appendChild(outer);

    const order: string[] = [];
    expando(inner).$$barqping7 = (e: Event) => {
      order.push("inner");
      e.stopPropagation();
    };
    expando(outer).$$barqping7 = () => order.push("outer");

    fire(inner, "barqping7");
    expect(order).toEqual(["inner"]);
  });

  test("a disabled element's handler is skipped, ancestors still run", () => {
    delegateEvents(["barqping8"]);
    const outer = document.createElement("div");
    const inner = document.createElement("button");
    inner.disabled = true;
    outer.appendChild(inner);
    container.appendChild(outer);

    const order: string[] = [];
    expando(inner).$$barqping8 = () => order.push("inner");
    expando(outer).$$barqping8 = () => order.push("outer");

    fire(inner, "barqping8");
    expect(order).toEqual(["outer"]);
  });

  test("setProp on a built-in delegated type installs the listener itself", () => {
    const el = document.createElement("button");
    container.appendChild(el);

    let calls = 0;
    setProp(null, el, "onClick", () => {
      calls++;
    });

    expect(expando(el).$$click).toBeDefined();
    fire(el, "click");
    expect(calls).toBe(1);
  });

  test("a delegated expando can be swapped in place without re-installing", () => {
    delegateEvents(["barqping9"]);
    const el = document.createElement("div");
    container.appendChild(el);
    const slot = expando(el);

    const order: string[] = [];
    slot.$$barqping9 = () => order.push("first");
    fire(el, "barqping9");
    slot.$$barqping9 = () => order.push("second");
    fire(el, "barqping9");
    slot.$$barqping9 = undefined;
    fire(el, "barqping9");

    expect(order).toEqual(["first", "second"]);
  });
});

describe("clearDelegatedEvents", () => {
  test("a handler is dead once its document listener is removed, and lives again after a re-install", () => {
    delegateEvents(["barqping10"]);
    const el = document.createElement("div");
    container.appendChild(el);

    let calls = 0;
    expando(el).$$barqping10 = () => {
      calls++;
    };
    fire(el, "barqping10");
    expect(calls).toBe(1);

    clearDelegatedEvents(["barqping10"]);
    fire(el, "barqping10");
    expect(calls, "the expando survives but nothing is listening").toBe(1);

    delegateEvents(["barqping10"]);
    fire(el, "barqping10");
    expect(calls).toBe(2);
  });

  test("clearing everything re-arms the install, so a second delegateEvents really re-registers", () => {
    delegateEvents(["barqping11"]);
    clearDelegatedEvents();

    const { installs } = countInstalls("barqping11", () => delegateEvents(["barqping11"]));
    expect(installs, "a cleared type is not remembered as installed").toBe(1);
    clearDelegatedEvents(["barqping11"]);
  });
});
