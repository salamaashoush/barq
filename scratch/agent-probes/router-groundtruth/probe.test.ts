import { computed, refresh, resource, scope, settle, latest, isPending } from "@barqjs/core";
import { clearHydrationData, getHydrationData, setAsyncSession } from "@barqjs/core/internal";
import { expect, test } from "bun:test";

type Payload = Record<string, unknown>;

function seedStore(data: Payload | undefined): void {
  const t = globalThis as { __BARQ_DATA__?: Payload };
  if (data === undefined) delete t.__BARQ_DATA__;
  else t.__BARQ_DATA__ = { ...data };
}

test("P1: refresh() on a keyed computed re-runs fn and does NOT re-consult the seed", async () => {
  seedStore({ "k:one": "SEEDED" });
  let calls = 0;
  const cell = computed(async () => {
    calls++;
    return `FETCH${calls}`;
  }, { key: "k:one" });

  // first read consumes the seed
  isPending(cell);
  await settle();
  expect(latest(cell)).toBe("SEEDED");
  expect(calls).toBe(0);

  refresh(cell);
  isPending(cell);
  await settle();
  expect(latest(cell)).toBe("FETCH1");
  expect(calls).toBe(1);
  seedStore(undefined);
});

test("P2: the seed is DELETED on read; a second cell under the same key refetches", async () => {
  seedStore({ "k:two": "SEEDED" });
  const a = computed(async () => "A", { key: "k:two" });
  isPending(a);
  await settle();
  expect(latest(a)).toBe("SEEDED");
  expect((globalThis as { __BARQ_DATA__?: Payload }).__BARQ_DATA__).toEqual({});

  const b = computed(async () => "B", { key: "k:two" });
  isPending(b);
  await settle();
  expect(latest(b)).toBe("B");
  seedStore(undefined);
});

test("P3: resource() with NO key still auto-keys and is seeded", async () => {
  const session = Symbol("s");
  const prev = setAsyncSession(session);
  let d!: () => void;
  try {
    scope((dispose) => {
      d = dispose;
      const r = resource(() => 1, async () => "RESOURCE-VALUE");
      isPending(r);
    }, true);
  } finally {
    setAsyncSession(prev);
  }
  await settle(session);
  const data = getHydrationData(session);
  clearHydrationData(session);
  d();
  console.log("P3 seed:", JSON.stringify(data));
  expect(Object.values(data)).toContain("RESOURCE-VALUE");
});

test("P4: an OWNERLESS keyed computed keeps its dependency link after being dropped", async () => {
  const { signal } = await import("@barqjs/core");
  const src = signal(0);
  let runs = 0;
  const cell = computed(() => {
    runs++;
    return src();
  }, { key: "k:four" });
  expect(cell()).toBe(0);
  expect(runs).toBe(1);
  // "drop it from the Map"
  const node = (cell as unknown as { _node: { _deps: unknown; _flags: number } })._node;
  expect(node._deps).not.toBeNull();
  const srcNode = (src as unknown as { _node: { _subs: unknown } })._node;
  expect(srcNode._subs).not.toBeNull();
  console.log("P4: dropped cell still linked; src._subs non-null =", srcNode._subs !== null);
});
