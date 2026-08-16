/**
 * Actions & optimistic updates (Solid 2.0 parity).
 */

import { describe, expect, test } from "bun:test";
import { action, affects, commit, createOptimistic, createOptimisticStore } from "./actions.ts";
import {
  computed,
  createAsync,
  effect,
  flush,
  isPending,
  latest,
  overridden,
  refresh,
  signal,
} from "./signals.ts";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("action", () => {
  test("plain async function runs and resolves", async () => {
    const run = action(async (x: number) => {
      await tick();
      return x * 2;
    });
    expect(await run(21)).toBe(42);
  });

  test("generator: yielded promises are awaited, resumes with value", async () => {
    const steps: unknown[] = [];
    const run = action(function* (x: number) {
      steps.push("start");
      const a = (yield Promise.resolve(x + 1)) as number;
      steps.push(a);
      const b = (yield Promise.resolve(a * 10)) as number;
      steps.push(b);
      return b;
    });

    const result = await run(1);
    expect(result).toBe(20);
    expect(steps).toEqual(["start", 2, 20]);
  });

  test("errors propagate and still complete the action", async () => {
    const opt = createOptimistic(0);
    const run = action(function* () {
      opt.set(99);
      yield Promise.reject(new Error("api down"));
    });

    expect(run()).rejects.toThrow("api down");
    await tick();
    flush();
    expect(opt()).toBe(0); // reverted despite the error
  });
});

describe("createOptimistic", () => {
  test("writes outside an action behave like a signal", () => {
    const opt = createOptimistic(1);
    opt.set(5);
    expect(opt()).toBe(5);
    opt.update((n) => n + 1);
    expect(opt()).toBe(6);
  });

  test("writes during an action revert on completion", async () => {
    const opt = createOptimistic("saved");
    const seen: string[] = [];
    effect(() => {
      seen.push(opt());
    });

    const save = action(function* () {
      opt.set("saving...");
      yield tick();
    });

    const p = save();
    flush();
    expect(opt()).toBe("saving...");

    await p;
    expect(opt()).toBe("saved"); // reverted to base
    expect(seen).toEqual(["saved", "saving...", "saved"]);
  });

  test("optimistic write after a yield still reverts (generator context)", async () => {
    const opt = createOptimistic(0);

    const run = action(function* () {
      yield tick();
      opt.set(123); // after resumption - still inside the action context
      yield tick();
    });

    const p = run();
    await tick();
    flush();
    expect(opt()).toBe(123);

    await p;
    expect(opt()).toBe(0);
  });

  test("real source refreshed during action wins after revert", async () => {
    let serverValue = 1;
    const data = createAsync(async () => {
      await tick();
      return serverValue;
    });
    const opt = createOptimistic<number | null>(null);
    // UI value: optimistic overlay if present, else server data
    const display = computed(() => opt() ?? data());

    expect(isPending(() => display())).toBe(true); // kick off the lazy fetch
    await tick();
    await tick();
    expect(display()).toBe(1);

    const increment = action(function* () {
      opt.set(2); // optimistic
      serverValue = 2;
      yield tick(); // "api call"
      refresh(data);
    });

    const p = increment();
    flush();
    expect(display()).toBe(2); // optimistic value shows immediately

    await p;
    isPending(() => data()); // kick off the refreshed fetch
    await tick();
    await tick();
    expect(opt()).toBe(null); // overlay reverted
    expect(display()).toBe(2); // refreshed server data has the real value
  });

  // A4. The optimistic value is `reduce(settled, pending)`, so retiring the
  // action drops the pending layer and whatever the settled state has become is
  // what remains. A snapshot taken at the first optimistic write would name the
  // value the settled state had BEFORE the push, and write it back over it.
  test("a real write landing mid-action survives the action's retirement", async () => {
    const opt = createOptimistic("saved");

    const save = action(function* () {
      opt.set("saving...");
      yield tick();
      yield tick();
    });

    const p = save();
    flush();
    expect(opt()).toBe("saving...");

    // Outside the action context - a push, a refresh, another user's edit.
    setTimeout(() => opt.set("from-server"), 0);

    await p;
    expect(opt()).toBe("from-server");
  });

  test("two overlapping actions each retire only their own layer", async () => {
    const opt = createOptimistic(0);
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((res) => {
      releaseFirst = res;
    });

    const slow = action(function* () {
      opt.update((n) => n + 1);
      yield firstGate;
    });
    const fast = action(function* () {
      opt.update((n) => n + 10);
      yield tick();
    });

    const a = slow();
    const b = fast();
    flush();
    expect(opt()).toBe(11);

    await b;
    expect(opt()).toBe(1);

    releaseFirst();
    await a;
    expect(opt()).toBe(0);
  });
});

// A5. Two buffers on one node, a lane per transaction, and a read surface that
// picks a buffer by mode. There is no transition API, no second scope and
// nothing is parked.
describe("A5: overrides, lanes and the read surface", () => {
  test("a normal read sees the override, latest() reads through it", async () => {
    const opt = createOptimistic("saved");
    const save = action(function* () {
      opt.set("saving...");
      yield tick();
    });

    const p = save();
    expect(opt()).toBe("saving...");
    expect(latest(() => opt())).toBe("saved");
    expect(opt.peek()).toBe("saving...");
    expect(latest(() => opt.peek())).toBe("saved");

    await p;
    expect(opt()).toBe("saved");
    expect(latest(() => opt())).toBe("saved");
  });

  // The whole mechanism in one assertion: the live write lands in the
  // authoritative buffer UNDERNEATH the override, so no revert target is
  // stashed and settling is just dropping the override.
  test("a live write during a lane lands under the override, visible through latest()", async () => {
    const opt = createOptimistic("saved");
    const save = action(function* () {
      opt.set("saving...");
      yield tick();
      yield tick();
    });

    const p = save();
    opt.set("from-server");

    expect(opt()).toBe("saving...");
    expect(latest(() => opt())).toBe("from-server");

    await p;
    expect(opt()).toBe("from-server");
  });

  test("isPending reports a lane on the value it overrides, and stops when it retires", async () => {
    const opt = createOptimistic(0);
    expect(isPending(() => opt())).toBe(false);

    let release!: () => void;
    const gate = new Promise<void>((res) => {
      release = res;
    });
    const run = action(function* () {
      opt.set(1);
      yield gate;
    });

    const p = run();
    expect(isPending(() => opt())).toBe(true);
    expect(overridden(opt)).toBe(true);

    release();
    await p;
    expect(isPending(() => opt())).toBe(false);
    expect(overridden(opt)).toBe(false);
  });

  // Nothing is parked: an override is a VALUE, so a derivation over it stays
  // readable and a Loading boundary has nothing to suspend. A lane that
  // propagated as a status would suspend the content it exists to show.
  test("a derivation over an overridden value stays readable and is not pending", async () => {
    const opt = createOptimistic(1);
    const doubled = computed(() => opt() * 2);
    expect(doubled()).toBe(2);

    let release!: () => void;
    const gate = new Promise<void>((res) => {
      release = res;
    });
    const run = action(function* () {
      opt.set(5);
      yield gate;
    });

    const p = run();
    flush();
    expect(doubled()).toBe(10);
    expect(isPending(() => doubled())).toBe(false);
    expect(isPending(() => opt())).toBe(true);

    release();
    await p;
    expect(doubled()).toBe(2);
  });

  // affects() is the primitive that DOES propagate, and it still does.
  test("affects still holds a derived value pending, unlike a lane", async () => {
    const opt = createOptimistic(1);
    const doubled = computed(() => opt() * 2);
    doubled();

    let release!: () => void;
    const gate = new Promise<void>((res) => {
      release = res;
    });
    const run = action(function* () {
      affects(doubled);
      opt.set(5);
      yield gate;
    });

    const p = run();
    expect(isPending(() => doubled())).toBe(true);

    release();
    await p;
    expect(isPending(() => doubled())).toBe(false);
  });

  // The boundary of the rule, pinned so it is not "fixed" by accident. A read
  // mode is not a dependency, so a memo cannot be keyed on it; keying it would
  // mean a value slot per mode on every computed, which is the cost this model
  // exists to avoid. The mode switch therefore applies where the override
  // lives — at the node — and a derivation serves whatever it last computed.
  test("the mode switch does not reach through a memo", async () => {
    const opt = createOptimistic(1);
    const doubled = computed(() => opt() * 2);

    let release!: () => void;
    const gate = new Promise<void>((res) => {
      release = res;
    });
    const run = action(function* () {
      opt.set(5);
      yield gate;
    });

    const p = run();
    // Read the memo normally first: it computes and caches the optimistic
    // value, and `latest` then serves that cache rather than re-deriving.
    expect(doubled()).toBe(10);
    expect(latest(() => doubled())).toBe(10);
    // At the node, where the override actually lives, the switch is exact.
    expect(latest(() => opt())).toBe(1);

    release();
    await p;
    expect(doubled()).toBe(2);
  });

  // No union-find: a lane is an explicit transaction lifetime, so two lanes
  // whose graphs overlap never merge and neither blocks the other.
  test("lanes do not merge, even where their graphs overlap", async () => {
    const a = createOptimistic(0);
    const b = createOptimistic(0);
    const sum = computed(() => a() + b());

    let releaseSlow!: () => void;
    const gate = new Promise<void>((res) => {
      releaseSlow = res;
    });

    const fast = action(function* () {
      a.set(1);
      yield tick();
    });
    const slow = action(function* () {
      b.set(20);
      yield gate;
    });

    const pf = fast();
    const ps = slow();
    flush();
    expect(sum()).toBe(21);
    expect(isPending(() => a())).toBe(true);
    expect(isPending(() => b())).toBe(true);

    await pf;
    flush();
    expect(isPending(() => a())).toBe(false);
    expect(isPending(() => b())).toBe(true);
    expect(sum()).toBe(20);

    releaseSlow();
    await ps;
    expect(sum()).toBe(0);
  });

  // The restraint IS the design: only opt-in nodes are double-buffered.
  test("a plain signal written during an action writes straight through", async () => {
    const plain = signal(0);
    const run = action(function* () {
      plain.set(7);
      yield tick();
    });

    const p = run();
    expect(plain()).toBe(7);
    expect(overridden(plain)).toBe(false);
    expect(isPending(() => plain())).toBe(false);

    await p;
    expect(plain()).toBe(7);
  });

  test("the override slot is released, not merely emptied", async () => {
    const opt = createOptimistic(0);
    const run = action(function* () {
      opt.set(1);
      yield tick();
    });
    await run();
    expect(overridden(opt)).toBe(false);
    expect(opt()).toBe(0);
  });

  // The other half of the same order: `latest` first, so the memo caches the
  // AUTHORITATIVE answer and serves it to the normal read. Both branches are
  // asserted because the failure this pins is that the two orders disagree —
  // one of them alone reads like the mode reaching through.
  test("the memo answers in whichever mode first computed it, in both orders", async () => {
    const first = createOptimistic(1);
    const firstDoubled = computed(() => first() * 2);
    const second = createOptimistic(1);
    const secondDoubled = computed(() => second() * 2);

    let release!: () => void;
    const gate = new Promise<void>((res) => {
      release = res;
    });
    const run = action(function* () {
      first.set(9);
      second.set(9);
      yield gate;
    });

    const p = run();
    flush();

    expect(firstDoubled()).toBe(18);
    expect(latest(() => firstDoubled())).toBe(18);

    expect(latest(() => secondDoubled())).toBe(2);
    expect(secondDoubled()).toBe(2);

    // The node itself answers exactly, in both modes, whichever order.
    expect(first()).toBe(9);
    expect(latest(() => first())).toBe(1);
    expect(latest(() => second())).toBe(1);
    expect(second()).toBe(9);

    release();
    await p;
    expect(firstDoubled()).toBe(2);
    expect(secondDoubled()).toBe(2);
  });

  // A5 (d): one patch per lane, and a second write COMPOSES over the first.
  // The store form has always accumulated its setter calls; the value form now
  // agrees, so `update(n => n + 1)` twice in one action is `+2` in both.
  test("two writes in one lane compose rather than replace", async () => {
    const n = createOptimistic(0);
    let release!: () => void;
    const gate = new Promise<void>((res) => {
      release = res;
    });
    const seen: number[] = [];
    const run = action(function* () {
      n.update((prev) => prev + 1);
      seen.push(n());
      n.update((prev) => prev + 1);
      seen.push(n());
      yield gate;
    });

    const p = run();
    expect(seen).toEqual([1, 2]);
    expect(n()).toBe(2);
    // A `set` is a constant patch: it ignores what it composes over and wins.
    release();
    await p;
    expect(n()).toBe(0);

    const m = createOptimistic(0);
    let release2!: () => void;
    const gate2 = new Promise<void>((res) => {
      release2 = res;
    });
    const run2 = action(function* () {
      m.update((prev) => prev + 5);
      m.set(100);
      yield gate2;
    });
    const p2 = run2();
    expect(m()).toBe(100);
    release2();
    await p2;
  });

  // A5 (e): a generator resumes IN-CONTEXT, so a write made after the `yield`
  // is a LANE write and is dropped when the lane retires. `commit` is the way
  // an action writes the answer it went to fetch.
  test("commit() writes the authoritative buffer from inside the action", async () => {
    const value = createOptimistic("server-0");
    const run = action(function* () {
      value.set("optimistic");
      yield tick();
      commit(() => {
        value.set("server-1");
      });
    });

    const p = run();
    expect(value()).toBe("optimistic");
    expect(latest(() => value())).toBe("server-0");

    await p;
    expect(value()).toBe("server-1");
    expect(overridden(value)).toBe(false);
  });

  // The stated constraint the line above exists for: WITHOUT `commit`, the
  // post-yield write is a lane write and retires with the lane.
  test("without commit() a post-yield write is a lane write and retires", async () => {
    const value = createOptimistic("server-0");
    const run = action(function* () {
      value.set("optimistic");
      yield tick();
      value.set("server-1");
    });

    await run();
    expect(value()).toBe("server-0");
  });

  test("commit() reaches the store form and survives the lane", async () => {
    const [state, setState] = createOptimisticStore({ n: 0 });
    const run = action(function* () {
      setState((draft) => {
        draft.n = 1;
      });
      yield tick();
      commit(() => {
        setState((draft) => {
          draft.n = 7;
        });
      });
    });

    const p = run();
    expect(state.n).toBe(1);
    expect(latest(() => state.n)).toBe(0);

    await p;
    expect(state.n).toBe(7);
  });

  test("commit() outside an action is a plain call", () => {
    const value = createOptimistic(1);
    expect(commit(() => value() + 1)).toBe(2);
    commit(() => value.set(4));
    expect(value()).toBe(4);
  });
});

describe("createOptimisticStore", () => {
  test("setter writes during an action revert on completion", async () => {
    const [todos, setTodos] = createOptimisticStore<{
      items: { text: string; pending?: boolean }[];
    }>({ items: [{ text: "a" }] });

    const add = action(function* (text: string) {
      setTodos((s) => {
        s.items.push({ text, pending: true });
      });
      yield tick();
    });

    const p = add("b");
    flush();
    expect(todos.items.length).toBe(2);
    expect(todos.items[1].text).toBe("b");

    await p;
    expect(todos.items.length).toBe(1); // reverted
    expect(todos.items[0].text).toBe("a");
  });

  test("writes outside an action persist", () => {
    const [state, setState] = createOptimisticStore<{ n: number }>({ n: 0 });
    setState("n", 5);
    expect(state.n).toBe(5);
  });

  // A4, the store half. The old implementation `structuredClone`d the whole
  // store at the first optimistic write and wrote the clone back at
  // completion, so this real write disappeared.
  test("a real store write landing mid-action survives the action's retirement", async () => {
    const [state, setState] = createOptimisticStore<{ n: number; note: string }>({
      n: 0,
      note: "",
    });

    const save = action(function* () {
      setState("note", "saving...");
      yield tick();
      yield tick();
    });

    const p = save();
    flush();
    expect(state.note).toBe("saving...");

    setTimeout(() => setState("n", 42), 0);

    await p;
    expect(state.n).toBe(42);
    expect(state.note).toBe("");
  });

  // A5, the store half: `base` is the authoritative buffer and `view` is the
  // override, so the read surface picks a buffer by mode exactly as a value's
  // does. The lane's setter calls are how `view` is RECOMPUTED, not a second
  // place values are kept.
  test("a normal read sees the override, latest() reads through it", async () => {
    const [state, setState] = createOptimisticStore<{ n: number }>({ n: 1 });

    let release!: () => void;
    const gate = new Promise<void>((res) => {
      release = res;
    });
    const run = action(function* () {
      setState("n", 2);
      yield gate;
    });

    const p = run();
    expect(state.n).toBe(2);
    expect(latest(() => state.n)).toBe(1);
    expect(isPending(() => state.n)).toBe(true);

    release();
    await p;
    expect(state.n).toBe(1);
    expect(latest(() => state.n)).toBe(1);
    expect(isPending(() => state.n)).toBe(false);
  });

  test("the routed store still enumerates and unwraps", () => {
    const [state] = createOptimisticStore<{ a: number; b: string }>({ a: 1, b: "x" });
    expect(Object.keys(state).toSorted()).toEqual(["a", "b"]);
    expect("a" in state).toBe(true);
    expect("zz" in state).toBe(false);
  });
});
