/**
 * The client's seed lookup answers for the keys the payload carries and for no
 * others.
 *
 * The payload is a plain object, so every name on `Object.prototype` is on it
 * too. A key is application data as often as it is a literal, `key: slug` being
 * the ordinary way to write one, and a read keyed by such a name has to fetch
 * rather than resolve with the inherited member.
 */

import { createMemo, createRoot, runWithOwner, settle } from "@barqjs/core";
import { afterEach, expect, test } from "bun:test";

interface SeedStore {
  __BARQ_DATA__?: Record<string, unknown>;
}

interface KeyedRead {
  value: unknown;
  fetches: number;
}

function store(data: Record<string, unknown> | undefined): void {
  (globalThis as SeedStore).__BARQ_DATA__ = data;
}

afterEach(() => {
  store(undefined);
});

async function readKeyed(key: string): Promise<KeyedRead> {
  let fetches = 0;
  const value = runWithOwner(null, () =>
    createRoot(() =>
      createMemo(
        async () => {
          fetches++;
          return "fetched";
        },
        { key },
      ),
    ),
  );
  await settle();
  return { value: value(), fetches };
}

for (const key of ["toString", "constructor", "__proto__"]) {
  test(`a read keyed "${key}" fetches when the payload does not carry that key`, async () => {
    store({ unrelated: 1 });

    expect(await readKeyed(key)).toEqual({ value: "fetched", fetches: 1 });
  });
}

test("a key the payload does carry still answers without fetching", async () => {
  store({ toString: "seeded" });

  expect(await readKeyed("toString")).toEqual({ value: "seeded", fetches: 0 });
});
