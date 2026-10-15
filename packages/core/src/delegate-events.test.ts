/**
 * delegateEvents - the per-root listener install that makes compiler-emitted
 * `__bq_<type>` expandos live. Every test runs inside a render root, because a
 * delegated handler outside one has nothing listening for it.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { delegateEvents, render, setProp } from "./dom.ts";
import { DEV } from "./signals.ts";

let container: HTMLDivElement;
let unmount: () => void;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  unmount = render(() => null, container);
});

afterEach(() => {
  unmount();
  container.remove();
});

/** Count the root container's registrations for one event type */
function countInstalls<T>(type: string, fn: () => T): { result: T; installs: number } {
  const original = container.addEventListener.bind(container);
  let installs = 0;
  container.addEventListener = ((t: string, ...rest: unknown[]) => {
    if (t === type) installs++;
    return (original as (t: string, ...r: unknown[]) => void)(t, ...rest);
  }) as typeof container.addEventListener;
  try {
    return { result: fn(), installs };
  } finally {
    container.addEventListener = original;
  }
}

/** The `__bq_<type>` expando surface the compiler writes to */
function expando(el: Element): Record<string, unknown> {
  return el as unknown as Record<string, unknown>;
}

function fire(el: Element, type: string): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
}

describe("delegateEvents", () => {
  test("installs a root listener for a type nobody has bound yet", () => {
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
    expando(el).__bq_barqping3 = (e: Event) => {
      seen.push(e);
    };

    fire(el, "barqping3");
    expect(seen.length).toBe(1);
  });

  test("without delegateEvents the expando is dead", () => {
    const el = document.createElement("button");
    container.appendChild(el);

    let calls = 0;
    expando(el).__bq_barqneverinstalled = () => {
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
    expando(el).__bq_barqping4 = [
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
    expando(outer).__bq_barqping5 = function (this: unknown, e: Event) {
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
    expando(el).__bq_barqping10 = (e: Event) => {
      during = e.currentTarget;
    };

    const event = fire(el, "barqping10");
    expect(during).toBe(el);
    expect(event.currentTarget).not.toBe(document);
  });

  test("a non-bubbling type is reported instead of silently installing a dead handler", () => {
    const capture = DEV.diagnostics.capture();
    delegateEvents(["blur"]);
    delegateEvents(["blur"]);
    delegateEvents(["click"]);
    const events = capture.stop();
    expect(events.map((event) => event.code)).toEqual(["DELEGATED_EVENT_DOES_NOT_BUBBLE"]);
    expect(events[0]?.message).toContain("the `blur` event does not bubble");
    expect(events[0]?.message).toContain('`listen(element, "blur", handler)`');
  });

  test("walks ancestors from the target upward", () => {
    delegateEvents(["barqping6"]);
    const outer = document.createElement("div");
    const inner = document.createElement("span");
    outer.appendChild(inner);
    container.appendChild(outer);

    const order: string[] = [];
    expando(inner).__bq_barqping6 = () => order.push("inner");
    expando(outer).__bq_barqping6 = () => order.push("outer");

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
    expando(inner).__bq_barqping7 = (e: Event) => {
      order.push("inner");
      e.stopPropagation();
    };
    expando(outer).__bq_barqping7 = () => order.push("outer");

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
    expando(inner).__bq_barqping8 = () => order.push("inner");
    expando(outer).__bq_barqping8 = () => order.push("outer");

    fire(inner, "barqping8");
    expect(order).toEqual(["outer"]);
  });

  test("setProp on a built-in delegated type installs the listener itself", () => {
    const el = document.createElement("button");
    container.appendChild(el);

    let calls = 0;
    setProp(el, "onClick", () => {
      calls++;
    });

    expect(expando(el).__bq_click).toBeDefined();
    fire(el, "click");
    expect(calls).toBe(1);
  });

  test("a delegated expando can be swapped in place without re-installing", () => {
    delegateEvents(["barqping9"]);
    const el = document.createElement("div");
    container.appendChild(el);
    const slot = expando(el);

    const order: string[] = [];
    slot.__bq_barqping9 = () => order.push("first");
    fire(el, "barqping9");
    slot.__bq_barqping9 = () => order.push("second");
    fire(el, "barqping9");
    slot.__bq_barqping9 = undefined;
    fire(el, "barqping9");

    expect(order).toEqual(["first", "second"]);
  });
});

describe("a root's listeners", () => {
  test("a handler is dead once its root is disposed, and lives again under a new root", () => {
    delegateEvents(["barqping10"]);
    const el = document.createElement("div");

    let calls = 0;
    expando(el).__bq_barqping10 = () => {
      calls++;
    };
    container.appendChild(el);
    fire(el, "barqping10");
    expect(calls).toBe(1);

    unmount();
    container.appendChild(el);
    fire(el, "barqping10");
    expect(calls, "the expando survives but nothing is listening").toBe(1);

    unmount = render(() => el, container);
    fire(el, "barqping10");
    expect(calls).toBe(2);
  });

  test("a disposed root's container is listened to again by the next root", () => {
    delegateEvents(["barqping11"]);
    unmount();

    const { installs } = countInstalls("barqping11", () => {
      unmount = render(() => null, container);
    });
    expect(installs, "a disposed container is not remembered as listened to").toBe(1);
  });
});

/**
 * The dispatcher's OWNER, which is what the `__bqs` expando beside every `__bq_type`
 * expando carries: the scope a handler's throw is routed to.
 *
 * It is not what the handler runs under. A handler is where the application
 * writes state, and the engine refuses a write made under an owner, because an
 * owner is a scope still being built. So a handler runs under none, exactly as
 * an effect's callback does, and one that creates something it wants owned
 * names the owner for it.
 */
describe("a delegated handler runs under no owner", () => {
  test("it writes state, and what it creates is owned by the scope it names", async () => {
    const { createRoot, createSignal, runWithOwner, delegate, flush, getOwner, onCleanup } =
      await import("./index.ts");
    const el = document.createElement("div");
    container.appendChild(el);

    let sawOwner: unknown = "not run";
    const cleanups: number[] = [];
    let disposeRoot!: () => void;
    const [clicks, setClicks] = createSignal(0);
    const root = runWithOwner(null, () =>
      createRoot((dispose) => {
        disposeRoot = dispose;
        const scope = getOwner();
        delegate(el, "click", () => {
          sawOwner = getOwner();
          setClicks((n) => n + 1);
          runWithOwner(scope, () => onCleanup(() => cleanups.push(1)));
        });
        return scope;
      }),
    );
    delegateEvents(["click"]);
    el.dispatchEvent(new Event("click", { bubbles: true }));
    flush();

    expect(root, "the handler was bound under no scope, so nothing below means anything").not.toBe(
      null,
    );
    expect(sawOwner, "the handler ran under an owner, where a write is refused").toBe(null);
    expect(clicks(), "the handler's write did not land").toBe(1);
    expect(cleanups.length, "the cleanup ran before anything was disposed").toBe(0);
    disposeRoot();
    expect(cleanups.length, "the cleanup the handler filed under the scope was not run").toBe(1);
  });

  test("a Block forwarded into a handler slot is refused rather than invoked with the Event", async () => {
    const { block, createRoot, getOwner, runWithOwner } = await import("./index.ts");
    const el = document.createElement("div");
    container.appendChild(el);

    let invokedWith: unknown = "not invoked";
    const leaf = block((scope: unknown) => {
      invokedWith = scope;
      return null;
    });
    const root = runWithOwner(null, () => createRoot(() => getOwner()));
    // Written as the COMPILED path writes it — the expando directly, with no
    // `delegate` call to guard — because that is the only shape in which this
    // can reach the dispatcher at all.
    (el as unknown as Record<string, unknown>).__bq_click = leaf;
    (el as unknown as Record<string, unknown>).__bqs = root;
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
  });
});

test("a delegated handler is not stored where another library's listener would call it", async () => {
  const { delegate } = await import("./index.ts");
  // Solid 1 keeps its delegated handlers on `$$<type>` and its document
  // listener calls whatever it finds there. A page with one Solid 1 widget on
  // it, a devtools panel, ran every barq handler a second time.
  const element = document.createElement("button");
  delegate(element, "click", () => {});
  expect((element as unknown as Record<string, unknown>).$$click).toBeUndefined();
  expect(typeof (element as unknown as Record<string, unknown>).__bq_click).toBe("function");
});

test("the pointer-capture events are bound under their own names, in the bubble phase", () => {
  const element = document.createElement("div");
  container.appendChild(element);
  const seen: string[] = [];
  setProp(element, "onGotPointerCapture", () => seen.push("got"));
  setProp(element, "onLostPointerCapture", () => seen.push("lost"));
  element.dispatchEvent(new Event("gotpointercapture"));
  element.dispatchEvent(new Event("lostpointercapture"));
  element.dispatchEvent(new Event("gotpointer"));
  expect(seen).toEqual(["got", "lost"]);
});
