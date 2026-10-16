/**
 * A7 — what a compute may hand back.
 *
 * `computed(fn)` accepts a value, ANY thenable, or an ASYNC ITERABLE. The test
 * was `newValue instanceof Promise` until M11, which is a question about the
 * CONSTRUCTOR: a thenable from another realm or library and an async generator
 * both failed it and were stored AS VALUES, so the node settled instantly
 * holding the thenable or the iterator object and every read got that object
 * where the awaited value belonged.
 *
 * The stream half needs a procedure that observes MORE THAN ONE yield. One
 * yield is indistinguishable from a promise — the same "pending, then a value"
 * — so a single-yield test is satisfied by an implementation that awaits the
 * first step and abandons the iterator, which is most of the ways to get this
 * wrong.
 */

import { rooted } from "./test-root.ts";
import { describe, expect, test } from "bun:test";
import {
  NotReadyError,
  createEffect,
  createMemo,
  flush,
  createRoot,
  createSignal,
  runWithOwner,
} from "./signals.ts";

const tick = (ms = 0) => new Promise((res) => setTimeout(res, ms));

/** Reads the node, reporting the pending throw rather than propagating it */
function read<T>(node: () => T): T | "PENDING" {
  try {
    return node();
  } catch (err) {
    if (err instanceof NotReadyError) return "PENDING";
    throw err;
  }
}

describe("A7: a thenable that is not a native Promise", () => {
  test(
    "is awaited, not stored",
    rooted(async () => {
      const thenable = {
        then(resolve: (v: string) => void) {
          queueMicrotask(() => resolve("settled"));
        },
      };
      const node = createMemo(() => thenable as unknown as PromiseLike<string>);

      expect(read(node)).toBe("PENDING");
      await tick();
      flush();
      // Stored rather than awaited, this reads back as the thenable OBJECT — the
      // shape `await` accepts and `instanceof Promise` refuses.
      expect(read(node)).toBe("settled");
    }),
  );

  test(
    "its rejection is the node's error, not a value",
    rooted(async () => {
      const thenable = {
        then(_resolve: (v: never) => void, reject: (e: unknown) => void) {
          queueMicrotask(() => reject(new Error("refused")));
        },
      };
      const node = createMemo(() => thenable as unknown as PromiseLike<string>);
      expect(read(node)).toBe("PENDING");
      await tick();
      flush();
      expect(() => node()).toThrow("refused");
    }),
  );
});

describe("A7: an async iterable", () => {
  test(
    "commits every yield in order, and suspends only until the FIRST",
    rooted(async () => {
      const seen: (string | number)[] = [];
      let dispose!: () => void;

      runWithOwner(null, () =>
        createRoot((d) => {
          const node = createMemo(async function* () {
            yield 1;
            await tick();
            yield 2;
            await tick();
            yield 3;
          });
          createEffect(
            () => read(node),
            (value) => {
              seen.push(value);
            },
          );
          flush();
          dispose = d;
          return d;
        }),
      );

      flush();
      await tick();
      flush();
      await tick();
      flush();
      await tick();
      flush();

      // PENDING once, then every yield. The second and third must NOT re-suspend:
      // a stream that re-marks pending per step flaps every `Loading` above it
      // once per element, and the fallback is what a stream exists to avoid.
      expect(seen).toEqual(["PENDING", 1, 2, 3]);
      dispose();
    }),
  );

  test(
    "a stream that ends without yielding settles instead of hanging pending",
    rooted(async () => {
      // `never`, spelled: an async generator that yields nothing infers no item
      // type, and the row is about what the node holds when it ends empty.
      const node = createMemo<undefined>(async function* () {
        // yields nothing
      });
      expect(read(node)).toBe("PENDING");
      await tick();
      flush();
      // Left PENDING, this holds every boundary above it for the life of the page.
      expect(read(node)).toBe(undefined);
    }),
  );

  test(
    "a throw mid-stream becomes the node's error",
    rooted(async () => {
      const node = createMemo(async function* () {
        yield 1;
        await tick();
        throw new Error("stream broke");
      });

      expect(read(node)).toBe("PENDING");
      await tick();
      flush();
      expect(read(node)).toBe(1);
      await tick();
      await tick();
      flush();
      expect(() => node()).toThrow("stream broke");
    }),
  );

  test(
    "disposal closes the iterator, so the producer's own finally runs",
    rooted(async () => {
      let closed = false;
      let pulls = 0;
      let dispose!: () => void;

      runWithOwner(null, () =>
        createRoot((d) => {
          const node = createMemo(async function* () {
            try {
              while (true) {
                pulls++;
                yield pulls;
                await tick();
              }
            } finally {
              closed = true;
            }
          });
          createEffect(
            () => read(node),
            () => {},
          );
          flush();
          dispose = d;
          return d;
        }),
      );

      flush();
      await tick();
      flush();
      expect(pulls).toBeGreaterThan(0);

      dispose();
      await tick();
      await tick();
      const after = pulls;
      await tick(20);
      flush();

      // Both halves matter: without `return()` the generator's `finally` never
      // runs, and an endless producer goes on pumping into a disposed node with
      // nothing to observe it (A1 reaches a stream through its iterator).
      expect(closed).toBe(true);
      expect(pulls).toBe(after);
    }),
  );

  test(
    "a re-run closes the stream it supersedes and starts the new one",
    rooted(async () => {
      const closed: number[] = [];
      const [source, setSource] = createSignal(1);
      let dispose!: () => void;
      const seen: (number | string)[] = [];

      runWithOwner(null, () =>
        createRoot((d) => {
          // The read is in the COMPUTE, not in the generator body. An async
          // generator's body does not run until `next()`, which happens from a
          // continuation the tracked region has already left — so `source()` read
          // inside the body registers no dependency and the node never re-runs.
          // That is the language's shape, and the reason a streaming compute is
          // written as a function that reads and then returns the stream.
          const node = createMemo(() => {
            const id = source();
            return (async function* () {
              try {
                let n = 0;
                while (true) {
                  n++;
                  yield id * 100 + n;
                  await tick();
                }
              } finally {
                closed.push(id);
              }
            })();
          });
          createEffect(
            () => read(node),
            (value) => {
              seen.push(value);
            },
          );
          flush();
          dispose = d;
          return d;
        }),
      );

      flush();
      await tick();
      flush();
      expect(seen).toContain(101);

      setSource(2);
      flush();
      // An async generator suspended at an `await` cannot observe `return()` until
      // it resumes, so the producer's `finally` runs a turn or two later than the
      // close call. That is the language's, not the scheduler's.
      await tick(20);
      flush();
      await tick(20);
      flush();

      // The superseded stream is closed at the moment its replacement is
      // installed, not whenever its next step happens to resolve — an
      // interval-driven producer would otherwise keep running until it yielded.
      expect(closed).toContain(1);
      expect(seen.some((v) => typeof v === "number" && v >= 200)).toBe(true);
      dispose();
    }),
  );

  test(
    "a producer handing back a bare IteratorResult is assimilated, not crashed on",
    rooted(async () => {
      // `for await` unwraps whatever `next()` returns, so a producer with a value
      // already buffered may skip the promise. Calling `.then` on that is a
      // TypeError, and buffering producers are the common case for a
      // deserialised stream.
      // A `next()` that answers SYNCHRONOUSLY. `AsyncIterable` demands a promise
      // and the runtime awaits whatever it is handed, which is what this pins.
      const node = createMemo<number>(() => ({
        [Symbol.asyncIterator]() {
          let n = 0;
          return {
            next() {
              n++;
              return n <= 2
                ? { done: false, value: n }
                : ({ done: true, value: undefined } as IteratorResult<number>);
            },
          } as unknown as AsyncIterator<number>;
        },
      }));

      // Settled in the turn it is read, as the engine reads a bare result.
      expect(read(node)).toBe(2);
      await tick();
      flush();
      expect(read(node)).toBe(2);
    }),
  );
});
