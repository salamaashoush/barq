import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";

import { toastQueue, toastSwipe } from "./toast.ts";

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

describe("toastQueue, by id", () => {
  test("an id the caller chose comes back as it was given", () => {
    const queue = toastQueue();
    const id = queue.add({ id: "save", title: "Saving" });
    flush();
    expect(id).toBe("save");
    expect(queue.get("save")?.title).toBe("Saving");
  });

  test("adding an id that is already up replaces it rather than stacking a second", () => {
    const queue = toastQueue();
    queue.add({ id: "save", title: "Saving", kind: "loading" });
    queue.add({ title: "Other" });
    flush();
    queue.add({ id: "save", title: "Saved", kind: "success" });
    flush();
    expect(queue.toasts().map((each) => each.title)).toEqual(["Saved", "Other"]);
    expect(queue.toasts()[0]?.kind).toBe("success");
  });

  test("dismiss with no id takes every toast, and tells each one", () => {
    const seen: string[] = [];
    const queue = toastQueue();
    queue.add({ title: "a", duration: 10_000, onDismiss: () => seen.push("a") });
    queue.add({ title: "b", duration: 10_000, onDismiss: () => seen.push("b") });
    flush();
    queue.dismiss();
    flush();
    expect(queue.toasts()).toEqual([]);
    expect(seen).toEqual(["a", "b"]);
  });
});

describe("toastQueue, clocks", () => {
  test("a loading toast has no clock, whatever its duration says", async () => {
    const queue = toastQueue();
    const id = queue.add({ title: "Saving", kind: "loading", duration: 40 });
    flush();
    await after(40);
    expect(queue.toasts()).toHaveLength(1);
    // The clock starts when the work is done, on the duration it was given.
    queue.update(id, { title: "Saved", kind: "success" });
    flush();
    await after(40);
    expect(queue.toasts()).toHaveLength(0);
  });

  test("onAutoClose is the timer alone; onDismiss is told either way", async () => {
    const seen: string[] = [];
    const queue = toastQueue();
    queue.add({
      title: "A",
      duration: 40,
      onAutoClose: () => seen.push("auto A"),
      onDismiss: () => seen.push("gone A"),
    });
    const id = queue.add({
      title: "B",
      duration: 10_000,
      onAutoClose: () => seen.push("auto B"),
      onDismiss: () => seen.push("gone B"),
    });
    flush();
    queue.dismiss(id);
    flush();
    await after(40);
    expect(seen).toEqual(["gone B", "auto A", "gone A"]);
  });

  test("two reasons to pause need two reasons to resume", async () => {
    // The pointer leaving a toast must not restart a clock the hidden tab
    // stopped.
    const queue = toastQueue();
    queue.add({ title: "Read me", duration: 60 });
    flush();
    queue.pause("pointer");
    queue.pause("hidden");
    queue.resume("pointer");
    flush();
    expect(queue.isPaused()).toBe(true);
    await after(80);
    expect(queue.toasts()).toHaveLength(1);
    queue.resume("hidden");
    flush();
    expect(queue.isPaused()).toBe(false);
    await after(80);
    expect(queue.toasts()).toHaveLength(0);
  });

  test("a hidden document stops the clocks until it is shown again", async () => {
    let hidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    const queue = toastQueue();
    const stop = queue.watchDocument();
    queue.add({ title: "Read me", duration: 60 });
    flush();

    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    flush();
    expect(queue.isPaused()).toBe(true);
    await after(80);
    expect(queue.toasts()).toHaveLength(1);

    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    flush();
    expect(queue.isPaused()).toBe(false);
    await after(80);
    expect(queue.toasts()).toHaveLength(0);

    stop();
    Reflect.deleteProperty(document, "hidden");
  });

  test("leaving the watch gives back the pause it was holding", () => {
    let hidden = true;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    const queue = toastQueue();
    const stop = queue.watchDocument();
    flush();
    expect(queue.isPaused()).toBe(true);
    stop();
    flush();
    expect(queue.isPaused()).toBe(false);
    hidden = false;
    Reflect.deleteProperty(document, "hidden");
  });
});

describe("toastQueue, leaving", () => {
  test("a toast with an exit to draw stays, marked, for as long as it takes", async () => {
    const queue = toastQueue();
    const asked: (number | string)[] = [];
    const stop = queue.onLeave((id) => {
      asked.push(id);
      return 60;
    });
    const id = queue.add({ title: "Saved", duration: 10_000 });
    flush();
    queue.dismiss(id);
    flush();
    expect(asked).toEqual([id]);
    expect(queue.toasts()).toHaveLength(1);
    expect(queue.toasts()[0]?.isLeaving).toBe(true);
    await after(60);
    expect(queue.toasts()).toHaveLength(0);
    stop();
  });

  test("with nothing to draw it goes at once", () => {
    const queue = toastQueue();
    queue.onLeave(() => 0);
    const id = queue.add({ title: "Saved", duration: 10_000 });
    flush();
    queue.dismiss(id);
    flush();
    expect(queue.toasts()).toHaveLength(0);
  });

  test("onDismiss is told when the decision is made, not when the drawing ends", () => {
    const seen: string[] = [];
    const queue = toastQueue();
    queue.onLeave(() => 10_000);
    const id = queue.add({ title: "Saved", duration: 10_000, onDismiss: () => seen.push("gone") });
    flush();
    queue.dismiss(id);
    // A second dismissal of one already leaving is the same decision.
    queue.dismiss(id);
    expect(seen).toEqual(["gone"]);
    queue.clear();
  });
});

describe("toastQueue.promise", () => {
  test("one toast goes from loading to success, and then has a clock", async () => {
    const queue = toastQueue({ duration: 40 });
    const work = queue.promise(Promise.resolve(42), {
      loading: "Saving",
      success: (value) => `Saved ${String(value)}`,
      error: "Failed",
    });
    flush();
    expect(queue.toasts()[0]?.kind).toBe("loading");
    expect(await work).toBe(42);
    flush();
    expect(queue.toasts()).toHaveLength(1);
    expect(queue.toasts()[0]?.title).toBe("Saved 42");
    expect(queue.toasts()[0]?.kind).toBe("success");
    await after(40);
    expect(queue.toasts()).toHaveLength(0);
  });

  test("a function is called for the work, so the toast is up before it starts", async () => {
    const order: string[] = [];
    const queue = toastQueue();
    const work = queue.promise(
      () => {
        flush();
        order.push(`started with ${String(queue.toasts().length)} up`);
        return Promise.resolve("done");
      },
      { loading: "Saving", success: "Saved", error: "Failed" },
    );
    await work;
    expect(order).toEqual(["started with 1 up"]);
    queue.clear();
  });

  test("a failure reads the error, and the caller is still told", async () => {
    const queue = toastQueue();
    const work = queue.promise(Promise.reject(new Error("nope")), {
      loading: "Saving",
      success: "Saved",
      error: (reason) => `Failed: ${reason instanceof Error ? reason.message : "unknown"}`,
    });
    await expect(work.unwrap()).rejects.toThrow("nope");
    flush();
    expect(queue.toasts()[0]?.kind).toBe("error");
    expect(queue.toasts()[0]?.title).toBe("Failed: nope");
    queue.clear();
  });

  test("a message can be whole options, and finally runs either way", async () => {
    const seen: string[] = [];
    const queue = toastQueue();
    const work = queue.promise(Promise.resolve(1), {
      loading: "Saving",
      success: { title: "Saved", description: "Three files" },
      error: "Failed",
      finally: () => seen.push("finally"),
    });
    await work;
    flush();
    expect(queue.get(work.id)?.description).toBe("Three files");
    expect(seen).toEqual(["finally"]);
    queue.clear();
  });
});

describe("toastQueue.promise, an outcome that names its own kind", () => {
  test("a message may say it is an error although the work resolved", async () => {
    const queue = toastQueue();
    const work = queue.promise(Promise.resolve(503), {
      loading: "Saving",
      success: (status) =>
        status >= 400 ? { title: `Failed with ${String(status)}`, kind: "error" } : "Saved",
      error: "Failed",
    });
    await work;
    flush();
    expect(queue.toasts().map((each) => [each.kind, each.title])).toEqual([
      ["error", "Failed with 503"],
    ]);
  });
});

describe("toastSwipe", () => {
  const far = { x: 0, y: 60 };

  test("past the threshold in a direction it allows, letting go throws it away", () => {
    const thrown: string[] = [];
    const swipe = toastSwipe({ directions: ["down"], onDismiss: (way) => thrown.push(way) });
    swipe.start({ x: 0, y: 0 });
    swipe.move(far);
    flush();
    expect(swipe.isSwiping()).toBe(true);
    expect(swipe.offset()).toEqual({ x: 0, y: 60 });
    expect(swipe.end()).toBe(true);
    flush();
    expect(thrown).toEqual(["down"]);
    expect(swipe.direction()).toBe("down");
    expect(swipe.isSwiping()).toBe(false);
  });

  test("short of it, slowly, it goes back where it was", async () => {
    const thrown: string[] = [];
    const swipe = toastSwipe({ directions: ["down"], onDismiss: (way) => thrown.push(way) });
    swipe.start({ x: 0, y: 0 });
    swipe.move({ x: 0, y: 20 });
    await after(300);
    expect(swipe.end()).toBe(false);
    flush();
    expect(thrown).toEqual([]);
    expect(swipe.offset()).toEqual({ x: 0, y: 0 });
    expect(swipe.direction()).toBeNull();
  });

  test("a flick counts however short it was", () => {
    const thrown: string[] = [];
    const swipe = toastSwipe({ directions: ["right"], onDismiss: (way) => thrown.push(way) });
    swipe.start({ x: 0, y: 0 });
    swipe.move({ x: 20, y: 0 });
    expect(swipe.end()).toBe(true);
    expect(thrown).toEqual(["right"]);
  });

  test("the first axis it moves along is the one it keeps", () => {
    const swipe = toastSwipe({ directions: ["down", "right"] });
    swipe.start({ x: 0, y: 0 });
    swipe.move({ x: 10, y: 2 });
    swipe.move({ x: 12, y: 80 });
    flush();
    // A diagonal that starts sideways is a sideways swipe; the toast must not
    // wander off along both axes at once.
    expect(swipe.offset()).toEqual({ x: 12, y: 0 });
    swipe.cancel();
  });

  test("an axis with no way out along it does not move at all", () => {
    const thrown: string[] = [];
    const swipe = toastSwipe({ directions: ["down"], onDismiss: (way) => thrown.push(way) });
    swipe.start({ x: 0, y: 0 });
    swipe.move({ x: 60, y: 2 });
    swipe.move({ x: 120, y: 2 });
    flush();
    // Sideways is not a direction this toast leaves by, either way, so there
    // is nothing to resist: a pull along it is not a swipe.
    expect(swipe.offset()).toEqual({ x: 0, y: 0 });
    expect(swipe.end()).toBe(false);
    expect(thrown).toEqual([]);
  });

  test("the wrong way is resisted, and never throws it", () => {
    const thrown: string[] = [];
    const swipe = toastSwipe({ directions: ["down"], onDismiss: (way) => thrown.push(way) });
    swipe.start({ x: 0, y: 0 });
    swipe.move({ x: 0, y: -200 });
    flush();
    const { y } = swipe.offset();
    expect(y).toBeLessThan(0);
    expect(y).toBeGreaterThan(-45);
    expect(swipe.end()).toBe(false);
    expect(thrown).toEqual([]);
  });

  test("a cancelled pointer took no decision", () => {
    const thrown: string[] = [];
    const swipe = toastSwipe({ directions: ["down"], onDismiss: (way) => thrown.push(way) });
    swipe.start({ x: 0, y: 0 });
    swipe.move(far);
    swipe.cancel();
    flush();
    expect(thrown).toEqual([]);
    expect(swipe.offset()).toEqual({ x: 0, y: 0 });
    expect(swipe.isSwiping()).toBe(false);
  });

  test("moves before a start are not a swipe", () => {
    const swipe = toastSwipe({ directions: ["down"] });
    swipe.move(far);
    flush();
    expect(swipe.offset()).toEqual({ x: 0, y: 0 });
    expect(swipe.end()).toBe(false);
  });
});

describe("toastSwipe, a change of mind", () => {
  test("pulled out and brought back, it stays: reversing cancels", () => {
    const thrown: string[] = [];
    const swipe = toastSwipe({
      directions: ["right"],
      reverseCancels: true,
      onDismiss: (way) => thrown.push(way),
    });
    swipe.start({ x: 0, y: 0 });
    swipe.move({ x: 80, y: 0 });
    swipe.move({ x: 65, y: 0 });
    expect(swipe.end()).toBe(false);
    flush();
    expect(thrown).toEqual([]);
    expect(swipe.offset()).toEqual({ x: 0, y: 0 });
  });

  test("without asking for it, sonner's way, a throw is a throw", () => {
    const thrown: string[] = [];
    const swipe = toastSwipe({ directions: ["right"], onDismiss: (way) => thrown.push(way) });
    swipe.start({ x: 0, y: 0 });
    swipe.move({ x: 80, y: 0 });
    swipe.move({ x: 60, y: 0 });
    expect(swipe.end()).toBe(true);
    expect(thrown).toEqual(["right"]);
  });

  test("a wobble shorter than the cancel distance still throws it", () => {
    const thrown: string[] = [];
    const swipe = toastSwipe({
      directions: ["right"],
      reverseCancels: true,
      onDismiss: (way) => thrown.push(way),
    });
    swipe.start({ x: 0, y: 0 });
    swipe.move({ x: 80, y: 0 });
    swipe.move({ x: 75, y: 0 });
    expect(swipe.end()).toBe(true);
    expect(thrown).toEqual(["right"]);
  });

  test("pushed past where it turned back, the throw stands again", () => {
    const thrown: string[] = [];
    const swipe = toastSwipe({
      directions: ["right"],
      reverseCancels: true,
      onDismiss: (way) => thrown.push(way),
    });
    swipe.start({ x: 0, y: 0 });
    swipe.move({ x: 80, y: 0 });
    swipe.move({ x: 60, y: 0 });
    swipe.move({ x: 90, y: 0 });
    expect(swipe.end()).toBe(true);
    expect(thrown).toEqual(["right"]);
  });

  test("along an axis it leaves by both ways, coming back is a throw the other way, not a cancel", () => {
    const thrown: string[] = [];
    const swipe = toastSwipe({
      directions: ["left", "right"],
      reverseCancels: true,
      onDismiss: (way) => thrown.push(way),
    });
    swipe.start({ x: 0, y: 0 });
    swipe.move({ x: 80, y: 0 });
    swipe.move({ x: 60, y: 0 });
    expect(swipe.end()).toBe(true);
    expect(thrown).toEqual(["right"]);
  });
});

describe("toastSwipe.track", () => {
  const down = (target: Element, init: PointerEventInit = {}): PointerEvent => {
    const event = new PointerEvent("pointerdown", { bubbles: true, button: 0, ...init });
    Object.defineProperty(event, "target", { value: target });
    return event;
  };

  test("follows the pointer on the window, so a toast dragged from under it keeps moving", () => {
    const thrown: string[] = [];
    const held: boolean[] = [];
    const row = document.createElement("li");
    document.body.append(row);
    const swipe = toastSwipe({
      directions: ["down"],
      onDismiss: (way) => thrown.push(way),
      onHold: (isHeld) => held.push(isHeld),
    });
    expect(swipe.track(down(row, { clientX: 0, clientY: 0 }), row)).toBe(true);
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 0, clientY: 70 }));
    flush();
    expect(swipe.offset()).toEqual({ x: 0, y: 70 });
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: 0, clientY: 70 }));
    expect(thrown).toEqual(["down"]);
    expect(held).toEqual([true, false]);
    // The listeners went with the gesture.
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 0, clientY: 200 }));
    flush();
    expect(swipe.offset()).toEqual({ x: 0, y: 70 });
    row.remove();
  });

  test("a press on a control inside the toast is the control's", () => {
    const row = document.createElement("li");
    const button = document.createElement("button");
    row.append(button);
    document.body.append(row);
    const swipe = toastSwipe({ directions: ["down"] });
    expect(swipe.track(down(button), row)).toBe(false);
    flush();
    expect(swipe.isSwiping()).toBe(false);
    row.remove();
  });

  test("only the main button starts one", () => {
    const row = document.createElement("li");
    document.body.append(row);
    const swipe = toastSwipe({ directions: ["down"] });
    expect(swipe.track(down(row, { button: 2 }), row)).toBe(false);
    row.remove();
  });

  test("a cancelled pointer lets go without deciding", () => {
    const thrown: string[] = [];
    const row = document.createElement("li");
    document.body.append(row);
    const swipe = toastSwipe({ directions: ["down"], onDismiss: (way) => thrown.push(way) });
    swipe.track(down(row), row);
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 0, clientY: 70 }));
    window.dispatchEvent(new PointerEvent("pointercancel"));
    flush();
    expect(thrown).toEqual([]);
    expect(swipe.isSwiping()).toBe(false);
    row.remove();
  });
});
