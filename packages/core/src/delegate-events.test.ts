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

/**
 * The dispatcher's OWNER, which is what the `$$s` expando beside every `$$type`
 * expando was already carrying and only `routeError` was reading.
 *
 * A handler used to run with `CURRENT === null`, so an `onCleanup` or an
 * `effect` created inside one became an ORPHAN: `flushSync`'s `dropOrphans`
 * clears the claim list without disposing anything, so the work was owned by
 * nobody and never came apart. C1's "the argument decides" has to hold at the
 * one entry point the user's own code reaches most.
 */
describe("a delegated handler runs under the scope stapled to its element", () => {
  test("work created in a handler is owned by that scope and dies with it", async () => {
    const { scope, delegate, getOwner, onCleanup } = await import("./index.ts");
    const el = document.createElement("div");
    container.appendChild(el);

    let sawOwner: unknown = "not run";
    const cleanups: number[] = [];
    let disposeRoot!: () => void;
    const root = scope((dispose, scope) => {
      disposeRoot = dispose;
      return scope;
    }, true);

    delegate(root, el, "click", () => {
      sawOwner = getOwner();
      onCleanup(() => cleanups.push(1));
    });
    delegateEvents(["click"]);
    el.dispatchEvent(new Event("click", { bubbles: true }));

    expect(sawOwner, "the handler ran with no owner at all").toBe(root);
    expect(cleanups.length, "the cleanup ran before anything was disposed").toBe(0);
    disposeRoot();
    expect(cleanups.length, "the handler's cleanup was owned by nobody").toBe(1);
    clearDelegatedEvents(["click"]);
  });

  test("a Block forwarded into a handler slot is refused rather than invoked with the Event", async () => {
    const { block, scope } = await import("./index.ts");
    const el = document.createElement("div");
    container.appendChild(el);

    let invokedWith: unknown = "not invoked";
    const leaf = block((scope: unknown) => {
      invokedWith = scope;
      return null;
    });
    const root = scope((_dispose, scope) => scope, true);
    // Written as the COMPILED path writes it — the expando directly, with no
    // `delegate` call to guard — because that is the only shape in which this
    // can reach the dispatcher at all.
    (el as Element & Record<string, unknown>).$$click = leaf;
    (el as Element & Record<string, unknown>).$$s = root;
    delegateEvents(["click"]);

    const errors: unknown[] = [];
    const onError = (event: Event): void => {
      errors.push(event);
      event.preventDefault();
    };
    globalThis.addEventListener("error", onError);
    let thrown: unknown = null;
    try {
      el.dispatchEvent(new Event("click", { bubbles: true }));
    } catch (error) {
      thrown = error;
    }
    globalThis.removeEventListener("error", onError);

    expect(invokedWith, "the Block was invoked with the Event as its scope").toBe("not invoked");
    // Measured: the refusal is routed through `routeError`, which is the
    // dispatcher's existing E2 #6 path, and with no catching boundary above the
    // element it surfaces as an unhandled error rather than out of
    // `dispatchEvent`. Either is detection; silence is the one outcome C3.8
    // forbids, and this asserts the disjunction so the channel can move without
    // the claim going quiet.
    expect(
      thrown !== null || errors.length > 0,
      "a Block at a handler slot was neither invoked nor reported",
    ).toBe(true);
    clearDelegatedEvents(["click"]);
  });
});
