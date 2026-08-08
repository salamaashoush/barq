/**
 * Actions & optimistic updates (Solid 2.0 parity).
 */

import { describe, expect, test } from "bun:test";
import { action, createOptimistic, createOptimisticStore } from "./actions.ts";
import { computed, createAsync, effect, flush, isPending, refresh } from "./signals.ts";

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
});
