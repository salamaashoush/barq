import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";

import { toastQueue } from "./toast.ts";

/** Long enough for a timer scheduled at `ms` to have run. */
function after(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms + 25));
}

describe("toastQueue", () => {
  test("starts empty", () => {
    expect(toastQueue().toasts()).toEqual([]);
  });

  test("adding returns the id an update needs", () => {
    const queue = toastQueue();
    const id = queue.add({ title: "Saved" });
    flush();
    expect(queue.toasts()).toHaveLength(1);
    expect(queue.toasts()[0]?.id).toBe(id);
    expect(queue.toasts()[0]?.title).toBe("Saved");
    // Defaults, so a caller that gives only a title still gets a whole toast.
    expect(queue.toasts()[0]?.kind).toBe("default");
    expect(queue.toasts()[0]?.duration).toBe(4000);
  });

  test("it goes on its own once the duration is up", async () => {
    const queue = toastQueue();
    queue.add({ title: "Saved", duration: 40 });
    flush();
    expect(queue.toasts()).toHaveLength(1);
    await after(40);
    expect(queue.toasts()).toHaveLength(0);
  });

  test("onDismiss is told, however it went", async () => {
    const seen: string[] = [];
    const queue = toastQueue();
    queue.add({ title: "A", duration: 40, onDismiss: () => seen.push("timer") });
    flush();
    const id = queue.add({ title: "B", duration: 10_000, onDismiss: () => seen.push("by hand") });
    queue.dismiss(id);
    flush();
    expect(seen).toEqual(["by hand"]);
    await after(40);
    expect(seen).toEqual(["by hand", "timer"]);
  });

  test("Infinity keeps it, rather than taking it away at once", async () => {
    // `setTimeout(fn, Infinity)` fires immediately, which is the opposite of
    // what the caller asked for.
    const queue = toastQueue();
    queue.add({ title: "Stay", duration: Number.POSITIVE_INFINITY });
    flush();
    await after(60);
    expect(queue.toasts()).toHaveLength(1);
  });

  test("the limit drops the OLDEST, not the newest", () => {
    // Dropping the newest would mean the thing that just happened is the one
    // nobody is told about.
    const queue = toastQueue({ limit: 2 });
    queue.add({ title: "one" });
    flush();
    queue.add({ title: "two" });
    flush();
    queue.add({ title: "three" });
    flush();
    expect(queue.toasts().map((each) => each.title)).toEqual(["two", "three"]);
  });

  test("a dropped toast takes its timer with it", async () => {
    // A timer left behind fires later and removes whatever now has that id.
    const queue = toastQueue({ limit: 1 });
    queue.add({ title: "one", duration: 40 });
    flush();
    queue.add({ title: "two", duration: 10_000 });
    flush();
    await after(40);
    expect(queue.toasts().map((each) => each.title)).toEqual(["two"]);
  });

  test("an update replaces in place, keeping its position", () => {
    // A "Saving" that becomes "Saved" must not jump to the bottom of the
    // column and read as a second thing happening.
    const queue = toastQueue();
    const id = queue.add({ title: "Saving", kind: "loading" });
    queue.add({ title: "Other" });
    flush();
    queue.update(id, { title: "Saved", kind: "success" });
    flush();
    expect(queue.toasts().map((each) => each.title)).toEqual(["Saved", "Other"]);
    expect(queue.toasts()[0]?.kind).toBe("success");
    expect(queue.toasts()[0]?.id).toBe(id);
  });

  test("updating restarts the clock, because the message is new", async () => {
    const queue = toastQueue();
    const id = queue.add({ title: "Saving", duration: 200 });
    await after(100);
    queue.update(id, { title: "Saved", duration: 200 });
    flush();
    // Well past the original 200ms, and still there on the new one.
    await after(150);
    expect(queue.toasts()).toHaveLength(1);
    await after(150);
    expect(queue.toasts()).toHaveLength(0);
  });

  test("updating an id nothing has is ignored rather than adding one", () => {
    const queue = toastQueue();
    queue.update(999, { title: "ghost" });
    flush();
    expect(queue.toasts()).toEqual([]);
  });

  test("pausing stops the clock and resuming carries on from there", async () => {
    const queue = toastQueue();
    queue.add({ title: "Read me", duration: 80 });
    flush();
    queue.pause();
    flush();
    expect(queue.isPaused()).toBe(true);
    await after(100);
    // A toast that expired while the pointer was over it was never read.
    expect(queue.toasts()).toHaveLength(1);
    queue.resume();
    flush();
    expect(queue.isPaused()).toBe(false);
    await after(90);
    expect(queue.toasts()).toHaveLength(0);
  });

  test("pausing twice does not hand back the whole duration", async () => {
    // The remaining time is measured from when the run started, so crossing a
    // toast repeatedly must not keep it alive forever.
    const queue = toastQueue();
    queue.add({ title: "Read me", duration: 100 });
    flush();
    await after(60);
    queue.pause();
    flush();
    queue.resume();
    flush();
    queue.pause();
    flush();
    queue.resume();
    flush();
    await after(60);
    expect(queue.toasts()).toHaveLength(0);
  });

  test("clear takes them all, and their timers", async () => {
    const queue = toastQueue();
    queue.add({ title: "a", duration: 10_000 });
    flush();
    queue.add({ title: "b", duration: 40 });
    flush();
    queue.clear();
    flush();
    expect(queue.toasts()).toEqual([]);
    await after(40);
    expect(queue.toasts()).toEqual([]);
  });

  test("an action travels with the toast", () => {
    const undone: string[] = [];
    const queue = toastQueue();
    queue.add({ title: "Deleted", action: { label: "Undo", onAction: () => undone.push("yes") } });
    flush();
    queue.toasts()[0]?.action?.onAction();
    expect(undone).toEqual(["yes"]);
  });
});
