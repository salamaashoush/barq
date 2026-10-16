/**
 * One pump per source, read from where it stands: what a live connection's
 * renders share.
 */

import { expect, test } from "bun:test";

import { SharedSources } from "./shared-sources.ts";

function source(): {
  iterable: AsyncIterable<number>;
  push: (value: number | null) => void;
  pulls: () => number;
} {
  const queue: (number | null)[] = [];
  let wake: (() => void) | null = null;
  let pulls = 0;
  const iterator: AsyncIterator<number> = {
    async next() {
      pulls++;
      while (queue.length === 0) await new Promise<void>((resolve) => (wake = resolve));
      const value = queue.shift()!;
      return value === null ? { done: true, value: undefined } : { done: false, value };
    },
  };
  return {
    iterable: { [Symbol.asyncIterator]: () => iterator },
    push(value) {
      queue.push(value);
      wake?.();
    },
    pulls: () => pulls,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a seat taken after a value has arrived reads it at once, without waiting", async () => {
  const shared = new SharedSources();
  const feed = source();
  const first = shared.seat(feed.iterable)[Symbol.asyncIterator]();
  const reading = first.next();
  feed.push(1);
  expect(await reading).toEqual({ done: false, value: 1 });

  const second = shared.seat(feed.iterable)[Symbol.asyncIterator]();
  expect(second.next()).toEqual({ done: false, value: 1 });
  shared.close();
});

test("one pump feeds every seat, and a value past the first tells the connection", async () => {
  const shared = new SharedSources();
  let changes = 0;
  shared.onChange(() => changes++);
  const feed = source();
  const a = shared.seat(feed.iterable)[Symbol.asyncIterator]();
  const b = shared.seat(feed.iterable)[Symbol.asyncIterator]();
  feed.push(1);
  await settle();
  expect(changes).toBe(0);
  expect(a.next()).toEqual({ done: false, value: 1 });
  expect(b.next()).toEqual({ done: false, value: 1 });
  const nextA = a.next();
  feed.push(2);
  expect(await nextA).toEqual({ done: false, value: 2 });
  await settle();
  expect(changes).toBe(1);
  expect(feed.pulls()).toBe(3);
  shared.close();
});

test("a sweep closes the sources the last render did not read, and an ended one is settled", async () => {
  const shared = new SharedSources();
  const kept = source();
  const dropped = source();
  let returned = false;
  const tracked: AsyncIterable<number> = {
    [Symbol.asyncIterator]() {
      const inner = dropped.iterable[Symbol.asyncIterator]();
      return {
        next: () => inner.next(),
        return: async () => {
          returned = true;
          return { done: true, value: undefined };
        },
      };
    },
  };
  shared.begin();
  shared.seat(kept.iterable);
  shared.seat(tracked);
  shared.sweep();
  shared.begin();
  shared.seat(kept.iterable);
  shared.sweep();
  expect(returned).toBe(true);
  expect(shared.settled).toBe(false);
  kept.push(null);
  await settle();
  expect(shared.settled).toBe(true);
  shared.close();
});
