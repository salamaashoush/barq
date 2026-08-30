import { describe, expect, test } from "bun:test";
import { effect, flush, root } from "@barqjs/core";
import { bus, emitter, trigger } from "./bus.ts";

describe("emitter", () => {
  test("delivers to every handler and unsubscribes on request", () => {
    const seen: string[] = [];
    const events = emitter<string>();
    const off = events.listen((v) => seen.push(`a:${v}`));
    events.listen((v) => seen.push(`b:${v}`));

    events.emit("1");
    expect(seen).toEqual(["a:1", "b:1"]);
    expect(events.size()).toBe(2);

    off();
    events.emit("2");
    expect(seen).toEqual(["a:1", "b:1", "b:2"]);
    expect(events.size()).toBe(1);
  });

  test("unsubscribes with the owner", () => {
    const events = emitter();
    let calls = 0;
    const dispose = root((d) => {
      events.listen(() => calls++);
      return d;
    });
    events.emit();
    expect(calls).toBe(1);
    dispose();
    events.emit();
    expect(calls).toBe(1);
  });

  test("a handler unsubscribing mid-emit does not disturb the batch", () => {
    const events = emitter();
    const seen: string[] = [];
    const off: { clear?: () => void } = {};
    off.clear = events.listen(() => {
      seen.push("first");
      off.clear?.();
    });
    events.listen(() => seen.push("second"));

    events.emit();
    expect(seen).toEqual(["first", "second"]);
    events.emit();
    expect(seen).toEqual(["first", "second", "second"]);
  });

  test("clear drops everything", () => {
    const events = emitter();
    events.listen(() => {});
    events.clear();
    expect(events.size()).toBe(0);
  });
});

describe("bus", () => {
  test("remembers the last payload as a signal", () => {
    const channel = bus<number>();
    const seen: (number | undefined)[] = [];
    const dispose = root((d) => {
      effect(() => seen.push(channel.last()));
      channel.emit(1);
      flush();
      channel.emit(1);
      flush();
      return d;
    });
    expect(seen).toEqual([undefined, 1, 1]);
    dispose();
  });
});

describe("trigger", () => {
  test("invalidates its readers with no value of its own", () => {
    const [track, dirty] = trigger();
    let runs = 0;
    const dispose = root((d) => {
      effect(() => {
        track();
        runs++;
      });
      return d;
    });
    expect(runs).toBe(1);
    dirty();
    flush();
    expect(runs).toBe(2);
    dirty();
    flush();
    expect(runs).toBe(3);
    dispose();
  });
});
