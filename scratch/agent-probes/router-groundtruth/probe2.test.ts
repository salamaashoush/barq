import { computed, settle, isPending, latest, refresh } from "@barqjs/core";
import { clearHydrationData, getHydrationData, setAsyncSession } from "@barqjs/core/internal";
import { expect, test } from "bun:test";

test("P5: settle() with no session waits on a DROPPED cell's promise", async () => {
  let resolveIt!: (v: string) => void;
  let cell: unknown = computed(async () => new Promise<string>((r) => { resolveIt = r; }), { key: "k:five" });
  isPending(cell as () => unknown);
  cell = null; // dropped from the "cache"
  let settled = false;
  const p = settle().then(() => { settled = true; });
  await new Promise((r) => setTimeout(r, 30));
  expect(settled).toBe(false); // still waiting on a cell nobody references
  resolveIt("done");
  await p;
  expect(settled).toBe(true);
});

test("P6: a REJECTED keyed computed records nothing in the seed", async () => {
  const session = Symbol("s6");
  const prev = setAsyncSession(session);
  const cell = computed(async () => { throw new Error("boom"); }, { key: "k:six" });
  try { isPending(cell); } finally { setAsyncSession(prev); }
  await settle(session);
  const data = getHydrationData(session);
  clearHydrationData(session);
  console.log("P6 seed after rejection:", JSON.stringify(data));
  expect(data["k:six"]).toBeUndefined();
  let thrown: unknown;
  try { cell(); } catch (e) { thrown = e; }
  console.log("P6 read after rejection threw:", (thrown as Error)?.message);
  expect((thrown as Error).message).toBe("boom");
});

test("P7: refresh() on a REJECTED keyed computed re-runs it", async () => {
  let attempt = 0;
  const cell = computed(async () => {
    attempt++;
    if (attempt === 1) throw new Error("first fails");
    return "second ok";
  }, { key: "k:seven" });
  isPending(cell);
  await settle();
  expect(() => cell()).toThrow("first fails");
  refresh(cell);
  isPending(cell);
  await settle();
  expect(latest(cell)).toBe("second ok");
  expect(attempt).toBe(2);
});
