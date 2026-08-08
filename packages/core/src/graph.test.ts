/**
 * Graph correctness tests - ported from SolidJS signals
 * https://github.com/solidjs/signals/blob/main/tests/graph.test.ts
 *
 * These tests verify:
 * - Diamond dependency handling (glitch-free)
 * - Topological ordering
 * - Bail-out on unchanged values
 * - Dynamic dependency changes
 */

import { describe, expect, test, mock } from "bun:test";
import { signal, computed, effect, batch, flush, createScope } from "./signals.ts";

describe("graph correctness", () => {
  test("should drop X->B->X updates", () => {
    //     X
    //   / |
    //  A  | <- Looks like a flag doesn't it? :D
    //   \ |
    //     B
    //     |
    //     C

    const x = signal(2);
    const a = computed(() => x() - 1);
    const b = computed(() => x() + a());

    let computeCount = 0;
    const c = computed(() => {
      computeCount++;
      return "c: " + b();
    });

    expect(c()).toBe("c: 3");
    expect(computeCount).toBe(1);

    computeCount = 0;
    x.set(4);
    flush();
    expect(c()).toBe("c: 7");
    expect(computeCount).toBe(1);
  });

  test("should only update every signal once (diamond graph)", () => {
    // In this scenario "C" should only update once when "X" receives an update.
    //     X
    //   /   \
    //  A     B
    //   \   /
    //     C

    const x = signal("a");
    const a = computed(() => x());
    const b = computed(() => x());

    let computeCount = 0;
    const c = computed(() => {
      computeCount++;
      return a() + " " + b();
    });

    expect(c()).toBe("a a");
    expect(computeCount).toBe(1);

    computeCount = 0;
    x.set("aa");
    flush();
    expect(c()).toBe("aa aa");
    expect(computeCount).toBe(1);
  });

  test("should only update every signal once (diamond graph + tail)", () => {
    // "D" will be likely updated twice if our mark+sweep logic is buggy.
    //     X
    //   /   \
    //  A     B
    //   \   /
    //     C
    //     |
    //     D

    const x = signal("a");
    const a = computed(() => x());
    const b = computed(() => x());
    const c = computed(() => a() + " " + b());

    let computeCount = 0;
    const d = computed(() => {
      computeCount++;
      return c();
    });

    expect(d()).toBe("a a");
    expect(computeCount).toBe(1);

    computeCount = 0;
    x.set("aa");
    flush();
    expect(d()).toBe("aa aa");
    expect(computeCount).toBe(1);
  });

  test("should bail out if result is the same", () => {
    // Bail out if value of "A" never changes
    // X->A->B

    const x = signal("a");
    const a = computed(() => {
      x();
      return "foo";
    });

    let computeCount = 0;
    const b = computed(() => {
      computeCount++;
      return a();
    });

    expect(b()).toBe("foo");
    expect(computeCount).toBe(1);

    computeCount = 0;
    x.set("aa");
    flush();
    expect(b()).toBe("foo");
    expect(computeCount).toBe(0); // Should not recompute since a() didn't change
  });

  test("should only update every signal once (jagged diamond graph + tails)", () => {
    // "E" and "F" will be likely updated >3 if our mark+sweep logic is buggy.
    //     X
    //   /   \
    //  A     B
    //  |     |
    //  |     C
    //   \   /
    //     D
    //   /   \
    //  E     F

    const x = signal("a");
    const a = computed(() => x());
    const b = computed(() => x());
    const c = computed(() => b());

    let dCount = 0;
    const d = computed(() => {
      dCount++;
      return a() + " " + c();
    });

    let eCount = 0;
    const e = computed(() => {
      eCount++;
      return d();
    });

    let fCount = 0;
    const f = computed(() => {
      fCount++;
      return d();
    });

    expect(e()).toBe("a a");
    expect(eCount).toBe(1);
    expect(f()).toBe("a a");
    expect(fCount).toBe(1);

    dCount = 0;
    eCount = 0;
    fCount = 0;
    x.set("b");
    flush();

    expect(d()).toBe("b b");
    expect(dCount).toBe(1);
    expect(e()).toBe("b b");
    expect(eCount).toBe(1);
    expect(f()).toBe("b b");
    expect(fCount).toBe(1);

    dCount = 0;
    eCount = 0;
    fCount = 0;
    x.set("c");
    flush();

    expect(d()).toBe("c c");
    expect(dCount).toBe(1);
    expect(e()).toBe("c c");
    expect(eCount).toBe(1);
    expect(f()).toBe("c c");
    expect(fCount).toBe(1);
  });

  test("should ensure subs update even if one dep is static", () => {
    //     X
    //   /   \
    //  A     *B <- returns same value every time
    //   \   /
    //     C

    const x = signal("a");
    const a = computed(() => x());
    const b = computed(() => {
      x();
      return "c";
    });

    let computeCount = 0;
    const c = computed(() => {
      computeCount++;
      return a() + " " + b();
    });

    expect(c()).toBe("a c");
    expect(computeCount).toBe(1);

    computeCount = 0;
    x.set("aa");
    flush();

    expect(c()).toBe("aa c");
    expect(computeCount).toBe(1);
  });

  test("should ensure subs update even if two deps mark it clean", () => {
    // In this scenario both "C" and "D" always return the same value. But "E" must still update
    // because "B" marked it.
    //     X
    //   / | \
    //  B *C *D
    //   \ | /
    //     E

    const x = signal("a");
    const b = computed(() => x());
    const c = computed(() => {
      x();
      return "c";
    });
    const d = computed(() => {
      x();
      return "d";
    });

    let computeCount = 0;
    const e = computed(() => {
      computeCount++;
      return b() + " " + c() + " " + d();
    });

    expect(e()).toBe("a c d");
    expect(computeCount).toBe(1);

    computeCount = 0;
    x.set("aa");
    flush();

    expect(e()).toBe("aa c d");
    expect(computeCount).toBe(1);
  });

  test("propagates in topological order", () => {
    //     c1
    //    /  \
    //   /    \
    //  b1     b2
    //   \    /
    //    \  /
    //     a1

    let seq = "";
    const a1 = signal(false);
    const b1 = computed(
      () => {
        a1();
        seq += "b1";
        return undefined;
      },
      { equals: false },
    );
    const b2 = computed(
      () => {
        a1();
        seq += "b2";
        return undefined;
      },
      { equals: false },
    );
    const c1 = computed(
      () => {
        b1();
        b2();
        seq += "c1";
        return undefined;
      },
      { equals: false },
    );

    // Initialize
    c1();
    seq = "";

    a1.set(true);
    flush();
    c1(); // lazy: pull resolves in topological order

    expect(seq).toBe("b1b2c1");
  });

  test("only propagates once with linear convergences", () => {
    //         d
    //         |
    // +---+---+---+---+
    // v   v   v   v   v
    // f1  f2  f3  f4  f5
    // |   |   |   |   |
    // +---+---+---+---+
    //         v
    //         g

    const d = signal(0);
    const f1 = computed(() => d());
    const f2 = computed(() => d());
    const f3 = computed(() => d());
    const f4 = computed(() => d());
    const f5 = computed(() => d());

    let gcount = 0;
    const g = computed(() => {
      gcount++;
      return f1() + f2() + f3() + f4() + f5();
    });

    // Initialize
    g();
    gcount = 0;

    d.set(1);
    flush();
    g(); // lazy: pull

    expect(gcount).toBe(1);
  });

  test("only propagates once with exponential convergence", () => {
    //     d
    //     |
    // +---+---+
    // v   v   v
    // f1  f2 f3
    //   \ | /
    //     O
    //   / | \
    // v   v   v
    // g1  g2  g3
    // +---+---+
    //     v
    //     h

    const d = signal(0);
    const f1 = computed(() => d());
    const f2 = computed(() => d());
    const f3 = computed(() => d());
    const g1 = computed(() => f1() + f2() + f3());
    const g2 = computed(() => f1() + f2() + f3());
    const g3 = computed(() => f1() + f2() + f3());

    let hcount = 0;
    const h = computed(() => {
      hcount++;
      return g1() + g2() + g3();
    });

    // Initialize
    h();
    hcount = 0;

    d.set(1);
    flush();
    h(); // lazy: pull

    expect(hcount).toBe(1);
  });

  test("does not trigger downstream computations unless changed", () => {
    const s1 = signal(1, { equals: false });
    let order = "";
    const t1 = computed(() => {
      order += "t1";
      return s1();
    });
    const t2 = computed(() => {
      order += "c1";
      t1();
    });

    // Initialize (lazy: t2 starts evaluating, then pulls t1)
    t2();
    expect(order).toBe("c1t1");

    order = "";
    s1.set(1);
    flush();
    t2();
    expect(order).toBe("t1"); // c1 should not run since t1 returned same value

    order = "";
    s1.set(2);
    flush();
    t2();
    expect(order).toBe("t1c1");
  });

  test("applies updates to changed dependees in same order as computed", () => {
    const s1 = signal(0);
    let order = "";
    const t1 = computed(() => {
      order += "t1";
      return s1() === 0;
    });
    const t2 = computed(() => {
      order += "c1";
      return s1();
    });
    const t3 = computed(() => {
      order += "c2";
      return t1();
    });

    // Initialize
    t1();
    t2();
    t3();
    expect(order).toBe("t1c1c2");

    order = "";
    s1.set(1);
    flush();
    t1();
    t2();
    t3();
    expect(order).toBe("t1c1c2");
  });
});

describe("dynamic dependencies", () => {
  test("updates on active dependencies", () => {
    const i = signal(true);
    const t = signal(1);
    const e = signal(2);

    let fevals = 0;
    const f = computed(() => {
      fevals++;
      return i() ? t() : e();
    });

    f(); // Initialize
    fevals = 0;

    t.set(5);
    flush();
    expect(f()).toBe(5);
    expect(fevals).toBe(1);
  });

  test("does not update on inactive dependencies", () => {
    const i = signal(true);
    const t = signal(1);
    const e = signal(2);

    let fevals = 0;
    const f = computed(() => {
      fevals++;
      return i() ? t() : e();
    });

    f();
    fevals = 0;

    e.set(5);
    flush();
    expect(f()).toBe(1);
    expect(fevals).toBe(0);
  });

  test("deactivates obsolete dependencies", () => {
    const i = signal(true);
    const t = signal(1);
    const e = signal(2);

    let fevals = 0;
    const f = computed(() => {
      fevals++;
      return i() ? t() : e();
    });

    f();
    i.set(false);
    flush();
    f();
    fevals = 0;

    t.set(5);
    flush();
    f();
    expect(fevals).toBe(0); // t is no longer tracked
  });

  test("activates new dependencies", () => {
    const i = signal(true);
    const t = signal(1);
    const e = signal(2);

    let fevals = 0;
    const f = computed(() => {
      fevals++;
      return i() ? t() : e();
    });

    f();
    i.set(false);
    flush();
    f();
    fevals = 0;

    e.set(5);
    flush();
    f(); // lazy: pull
    expect(fevals).toBe(1); // e is now tracked
  });

  test("ensures that new dependencies are updated before dependee", () => {
    let order = "";
    const a = signal(0);
    const b = computed(() => {
      order += "b";
      return a() + 1;
    });
    const c = computed(() => {
      order += "c";
      const check = b();
      if (check) {
        return check;
      }
      return e();
    });
    const d = computed(() => a());
    const e = computed(() => {
      order += "d";
      return d() + 10;
    });

    // Initialize (lazy: c starts evaluating, then pulls b; d/e untouched)
    c();
    expect(order).toBe("cb");

    order = "";
    a.set(-1);
    flush();
    c();
    expect(order).toBe("bcd");
    expect(c()).toBe(9);

    order = "";
    a.set(0);
    flush();
    c();
    // b validates first (dep order), c re-runs and drops e without evaluating it
    expect(order).toBe("bc");
    expect(c()).toBe(1);
  });
});

describe("effect correctness", () => {
  test("effect runs once per signal change in diamond", () => {
    const x = signal(0);
    const a = computed(() => x());
    const b = computed(() => x());

    let effectCount = 0;
    effect(() => {
      a();
      b();
      effectCount++;
    });

    expect(effectCount).toBe(1);

    x.set(1);
    flush();
    expect(effectCount).toBe(2);
  });

  test("batched updates run effect once", () => {
    const a = signal(0);
    const b = signal(0);
    const c = signal(0);

    let effectCount = 0;
    effect(() => {
      a();
      b();
      c();
      effectCount++;
    });

    expect(effectCount).toBe(1);

    batch(() => {
      a.set(1);
      b.set(1);
      c.set(1);
    });

    expect(effectCount).toBe(2);
  });
});

describe("computed with equals: false", () => {
  test("always notifies subscribers when equals is false", () => {
    const s = signal(1);
    const c = computed(
      () => {
        s();
        return "static";
      },
      { equals: false },
    );

    let effectCount = 0;
    effect(() => {
      c();
      effectCount++;
    });

    expect(effectCount).toBe(1);

    s.set(2);
    flush();
    expect(effectCount).toBe(2);

    s.set(3);
    flush();
    expect(effectCount).toBe(3);
  });
});

describe("custom equality", () => {
  test("uses custom equality function", () => {
    const s = signal({ id: 1, name: "test" }, { equals: (a, b) => a.id === b.id });

    let effectCount = 0;
    effect(() => {
      s();
      effectCount++;
    });

    expect(effectCount).toBe(1);

    // Same id, should not trigger
    s.set({ id: 1, name: "different" });
    flush();
    expect(effectCount).toBe(1);

    // Different id, should trigger
    s.set({ id: 2, name: "test" });
    flush();
    expect(effectCount).toBe(2);
  });
});
