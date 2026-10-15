import { describe, expect, test } from "bun:test";
import { flush, createRoot, createSignal } from "@barqjs/core";
import { mergeRefs, onElement, ref } from "./refs.ts";

const el = () => document.createElement("div");

describe("mergeRefs", () => {
  test("feeds a callback and a box from one ref", () => {
    const box: { current: HTMLDivElement | null } = { current: null };
    const seen: HTMLDivElement[] = [];
    const target = el();

    const dispose = createRoot((d) => {
      mergeRefs<HTMLDivElement>((e) => {
        seen.push(e);
      }, box)(target);
      return d;
    });

    expect(seen).toEqual([target]);
    expect(box.current).toBe(target);
    dispose();
  });

  test("skips a nullish target instead of throwing", () => {
    const target = el();
    const seen: HTMLDivElement[] = [];
    const apply = mergeRefs<HTMLDivElement>(null, undefined, (e) => {
      seen.push(e);
    });
    apply(target);
    expect(seen).toEqual([target]);
  });

  test("runs a callback's cleanup when the element is replaced", () => {
    const first = el();
    const second = el();
    const log: string[] = [];
    const apply = mergeRefs<HTMLDivElement>((e) => {
      log.push(`in:${e === first ? "first" : "second"}`);
      return () => log.push("out");
    });

    apply(first);
    expect(log).toEqual(["in:first"]);
    apply(second);
    expect(log).toEqual(["in:first", "out", "in:second"]);
  });

  test("clears a box and runs cleanups when the owner disposes", () => {
    const box: { current: HTMLDivElement | null } = { current: null };
    const target = el();
    let released = false;

    const dispose = createRoot((d) => {
      mergeRefs<HTMLDivElement>(box, () => () => {
        released = true;
      })(target);
      return d;
    });

    expect(box.current).toBe(target);
    dispose();
    expect(box.current).toBe(null);
    expect(released).toBe(true);
  });
});

describe("ref", () => {
  test("is a signal, so an effect sees the element when it lands", () => {
    const target = el();
    const seen: (Element | null)[] = [];
    const dispose = createRoot((d) => {
      const box = ref<HTMLDivElement>();
      expect(box()).toBe(null);
      expect(box.current).toBe(null);

      const track = () => seen.push(box());
      track();
      box.set(target);
      flush();
      track();
      expect(box.current).toBe(target);
      return d;
    });
    expect(seen).toEqual([null, target]);
    dispose();
  });
});

describe("onElement", () => {
  test("runs when the element arrives and cleans up when it goes", () => {
    const target = el();
    const [source, setSource] = createSignal<HTMLDivElement | null>(null);
    const log: string[] = [];

    const dispose = createRoot((d) => {
      onElement(source, (e) => {
        log.push(e === target ? "in" : "in:other");
        return () => log.push("out");
      });
      return d;
    });

    expect(log).toEqual([]);
    setSource(target);
    flush();
    expect(log).toEqual(["in"]);

    setSource(null);
    flush();
    expect(log).toEqual(["in", "out"]);

    setSource(target);
    flush();
    dispose();
    expect(log).toEqual(["in", "out", "in", "out"]);
  });
});
