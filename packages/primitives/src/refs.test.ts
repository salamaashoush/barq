import { describe, expect, test } from "bun:test";
import { flush, root, signal } from "@barqjs/core";
import { mergeRefs, onElement, ref } from "./refs.ts";

const el = () => document.createElement("div");

describe("mergeRefs", () => {
  test("feeds a callback and a box from one ref", () => {
    const box: { current: HTMLDivElement | null } = { current: null };
    const seen: HTMLDivElement[] = [];
    const target = el();

    const dispose = root((d) => {
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

    const dispose = root((d) => {
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
    const dispose = root((d) => {
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
    const source = signal<HTMLDivElement | null>(null);
    const log: string[] = [];

    const dispose = root((d) => {
      onElement(source, (e) => {
        log.push(e === target ? "in" : "in:other");
        return () => log.push("out");
      });
      return d;
    });

    expect(log).toEqual([]);
    source.set(target);
    flush();
    expect(log).toEqual(["in"]);

    source.set(null);
    flush();
    expect(log).toEqual(["in", "out"]);

    source.set(target);
    flush();
    dispose();
    expect(log).toEqual(["in", "out", "in", "out"]);
  });
});
