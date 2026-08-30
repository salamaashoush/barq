import { describe, expect, test } from "bun:test";
import { root } from "@barqjs/core";
import { raf } from "./raf.ts";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Wait for a condition rather than a duration; a loaded machine delivers frames late. */
async function eventually(predicate: () => boolean, what: string, deadline = 2000): Promise<void> {
  const until = Date.now() + deadline;
  while (Date.now() < until) {
    if (predicate()) return;
    await sleep(5);
  }
  throw new Error(`timed out after ${deadline}ms waiting for ${what}`);
}

describe("raf", () => {
  test("does not run until started, and stops on request", async () => {
    let frames = 0;
    const loop = raf(() => frames++);
    expect(loop.running()).toBe(false);
    await sleep(50);
    expect(frames).toBe(0);

    loop.start();
    expect(loop.running()).toBe(true);
    await eventually(() => frames > 0, "the first frame");

    loop.stop();
    expect(loop.running()).toBe(false);
    const seen = frames;
    await sleep(80);
    expect(frames, "frames kept arriving after stop()").toBe(seen);
  });

  test("stops when its owner disposes", async () => {
    let frames = 0;
    const dispose = root((d) => {
      raf(() => frames++).start();
      return d;
    });
    await eventually(() => frames > 0, "the first frame");
    dispose();
    const seen = frames;
    await sleep(80);
    expect(frames, "frames kept arriving after the owner disposed").toBe(seen);
  });

  test("a repeated start does not stack loops", async () => {
    let frames = 0;
    const loop = raf(() => frames++);
    loop.start();
    loop.start();
    loop.start();

    // One `stop` cancels one request. Three stacked loops would keep going
    // after it, which is the observation, and it does not depend on how many
    // frames a loaded machine managed to deliver first.
    await eventually(() => frames > 0, "the first frame");
    loop.stop();
    const seen = frames;
    await sleep(80);
    expect(frames, "a second loop survived stop()").toBe(seen);
  });

  test("an fps budget drops frames", async () => {
    let unlimited = 0;
    let limited = 0;
    const a = raf(() => unlimited++);
    const b = raf(() => limited++, 5);
    a.start();
    b.start();

    // Measured against the unlimited loop rather than the clock: what the
    // budget promises is fewer calls than every frame, and a machine that
    // delivers frames slowly makes both counts small together.
    await eventually(() => unlimited >= 20, "twenty unbudgeted frames", 4000);
    a.stop();
    b.stop();
    expect(limited, "the budget let every frame through").toBeLessThan(unlimited);
  });
});
