import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { flush, root, signal } from "@barqjs/core";
import { intersectionObserver, mutationObserver, resizeObserver } from "./observers.ts";

interface FakeObserver {
  targets: Set<Element>;
  disconnected: boolean;
  options: unknown;
}

const instances: FakeObserver[] = [];
let emitResize: (entries: { target: Element; contentRect?: unknown }[]) => void = () => {};
let emitIntersection: (entries: { target: Element; isIntersecting: boolean }[]) => void = () => {};

const realResize = globalThis.ResizeObserver;
const realIntersection = globalThis.IntersectionObserver;

function fake(callbackSink: (emit: (entries: never[]) => void) => void) {
  return class {
    targets = new Set<Element>();
    disconnected = false;
    options: unknown;
    constructor(callback: (entries: never[]) => void, options?: unknown) {
      this.options = options;
      instances.push(this);
      callbackSink((entries) => {
        if (this.disconnected) return;
        callback(entries.filter((e: { target: Element }) => this.targets.has(e.target)));
      });
    }
    observe(target: Element) {
      this.targets.add(target);
    }
    unobserve(target: Element) {
      this.targets.delete(target);
    }
    disconnect() {
      this.disconnected = true;
      this.targets.clear();
    }
  };
}

beforeEach(() => {
  instances.length = 0;
  const resizeEmitters: ((entries: never[]) => void)[] = [];
  const intersectionEmitters: ((entries: never[]) => void)[] = [];
  emitResize = (entries) => {
    for (const emit of resizeEmitters) emit(entries as never[]);
  };
  emitIntersection = (entries) => {
    for (const emit of intersectionEmitters) emit(entries as never[]);
  };
  globalThis.ResizeObserver = fake((emit) =>
    resizeEmitters.push(emit),
  ) as unknown as typeof ResizeObserver;
  globalThis.IntersectionObserver = fake((emit) =>
    intersectionEmitters.push(emit),
  ) as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  globalThis.ResizeObserver = realResize;
  globalThis.IntersectionObserver = realIntersection;
});

const el = () => document.createElement("div");

describe("resizeObserver", () => {
  test("shares one observer across targets and routes by target", () => {
    const a = el();
    const b = el();
    const seen: string[] = [];
    const clearA = resizeObserver(a, () => seen.push("a"));
    const clearB = resizeObserver(b, () => seen.push("b"));

    expect(instances).toHaveLength(1);
    emitResize([{ target: a }, { target: b }]);
    expect(seen).toEqual(["a", "b"]);

    clearA();
    emitResize([{ target: a }, { target: b }]);
    expect(seen).toEqual(["a", "b", "b"]);

    clearB();
    expect(instances[0]!.disconnected).toBe(true);
  });

  test("two subscribers on one element observe it once", () => {
    const a = el();
    let first = 0;
    let second = 0;
    const clear1 = resizeObserver(a, () => first++);
    const clear2 = resizeObserver(a, () => second++);
    expect(instances).toHaveLength(1);
    expect(instances[0]!.targets.size).toBe(1);

    emitResize([{ target: a }]);
    expect(first).toBe(1);
    expect(second).toBe(1);

    clear1();
    emitResize([{ target: a }]);
    expect(first).toBe(1);
    expect(second).toBe(2);
    clear2();
  });

  test("a different box option gets its own observer", () => {
    const a = el();
    const clear1 = resizeObserver(a, () => {});
    const clear2 = resizeObserver(a, () => {}, { box: "border-box" });
    expect(instances).toHaveLength(2);
    clear1();
    clear2();
  });

  test("a new registry is built after the last subscriber leaves", () => {
    const a = el();
    resizeObserver(a, () => {})();
    expect(instances[0]!.disconnected).toBe(true);
    const clear = resizeObserver(a, () => {});
    expect(instances).toHaveLength(2);
    clear();
  });

  test("follows a reactive target", () => {
    const a = el();
    const b = el();
    const target = signal<HTMLDivElement | null>(null);
    const seen: Element[] = [];
    const dispose = root((d) => {
      resizeObserver(target, (entry) => seen.push(entry.target));
      return d;
    });
    expect(instances).toHaveLength(0);

    target.set(a);
    flush();
    emitResize([{ target: a }]);
    expect(seen).toEqual([a]);

    target.set(b);
    flush();
    emitResize([{ target: a }, { target: b }]);
    expect(seen).toEqual([a, b]);

    dispose();
    emitResize([{ target: b }]);
    expect(seen).toHaveLength(2);
  });

  test("unsubscribing twice is harmless", () => {
    const a = el();
    const b = el();
    const clear = resizeObserver(a, () => {});
    const keep = resizeObserver(b, () => {});
    clear();
    clear();
    expect(instances[0]!.targets.has(b)).toBe(true);
    keep();
  });
});

describe("intersectionObserver", () => {
  test("shares per option set", () => {
    const a = el();
    const b = el();
    const clear1 = intersectionObserver(a, () => {});
    const clear2 = intersectionObserver(b, () => {});
    expect(instances).toHaveLength(1);
    const clear3 = intersectionObserver(a, () => {}, { threshold: 0.5 });
    expect(instances).toHaveLength(2);
    clear1();
    clear2();
    clear3();
  });

  test("routes entries and cleans up", () => {
    const a = el();
    const seen: boolean[] = [];
    const clear = intersectionObserver(a, (entry) => seen.push(entry.isIntersecting));
    emitIntersection([{ target: a, isIntersecting: true }]);
    expect(seen).toEqual([true]);
    clear();
    emitIntersection([{ target: a, isIntersecting: false }]);
    expect(seen).toEqual([true]);
  });

  test("a distinct root gets its own registry", () => {
    const a = el();
    const rootA = el();
    const rootB = el();
    const c1 = intersectionObserver(a, () => {}, { root: rootA });
    const c2 = intersectionObserver(a, () => {}, { root: rootB });
    const c3 = intersectionObserver(a, () => {}, { root: rootA });
    expect(instances).toHaveLength(2);
    c1();
    c2();
    c3();
  });
});

describe("mutationObserver", () => {
  test("reports child list changes and stops on dispose", async () => {
    const parent = el();
    document.body.append(parent);
    let batches = 0;
    const dispose = root((d) => {
      mutationObserver(parent, () => batches++);
      return d;
    });

    parent.append(el());
    await new Promise<void>((r) => setTimeout(r, 10));
    expect(batches).toBeGreaterThan(0);

    const seen = batches;
    dispose();
    parent.append(el());
    await new Promise<void>((r) => setTimeout(r, 10));
    expect(batches).toBe(seen);
    parent.remove();
  });
});
