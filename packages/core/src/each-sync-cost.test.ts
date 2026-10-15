/**
 * What a list change costs the document. The rows two lists start and end with
 * have not moved, so a change is paid for by the rows between them and by
 * nothing else.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { each } from "./flow.ts";
import { block, createSignal, flush, rootScope, runWithOwner } from "./signals.ts";

let list: HTMLUListElement;
let moved: string[];
let removed: string[];

beforeEach(() => {
  list = document.createElement("ul");
  document.body.appendChild(list);
  moved = [];
  removed = [];
});

afterEach(() => {
  list.remove();
});

function watch(): void {
  const insertBefore = list.insertBefore.bind(list);
  const removeChild = list.removeChild.bind(list);
  list.insertBefore = ((node: Node, before: Node | null) => {
    if (node.textContent) moved.push(node.textContent);
    return insertBefore(node, before);
  }) as typeof list.insertBefore;
  list.removeChild = ((node: Node) => {
    if (node.textContent) removed.push(node.textContent);
    return removeChild(node);
  }) as typeof list.removeChild;
}

function mounted(initial: string[], pair = false): (next: string[]) => void {
  const [names, setNames] = createSignal(initial);
  runWithOwner(rootScope(), () => {
    each(
      list,
      null,
      names,
      null,
      block((name: string) => {
        const term = document.createElement("li");
        term.textContent = name;
        if (!pair) return term;
        const detail = document.createElement("li");
        detail.textContent = `${name}'`;
        return [term, detail];
      }),
    );
  });
  flush();
  watch();
  return (next) => {
    setNames(next);
    flush();
  };
}

const shown = (): string => [...list.children].map((node) => node.textContent).join(" ");

test("appending a row places that row and touches no other", () => {
  const set = mounted(["a", "b", "c", "d"]);
  set(["a", "b", "c", "d", "e"]);
  expect(shown()).toBe("a b c d e");
  expect(moved).toEqual(["e"]);
  expect(removed).toEqual([]);
});

test("prepending a row places that row and touches no other", () => {
  const set = mounted(["a", "b", "c", "d"]);
  set(["z", "a", "b", "c", "d"]);
  expect(shown()).toBe("z a b c d");
  expect(moved).toEqual(["z"]);
  expect(removed).toEqual([]);
});

test("removing one row from the middle removes that row and moves none", () => {
  const set = mounted(["a", "b", "c", "d", "e"]);
  set(["a", "b", "d", "e"]);
  expect(shown()).toBe("a b d e");
  expect(moved).toEqual([]);
  expect(removed).toEqual(["c"]);
});

test("a row put in the middle lands before the row that follows it", () => {
  const set = mounted(["a", "b", "d", "e"]);
  set(["a", "b", "c", "d", "e"]);
  expect(shown()).toBe("a b c d e");
  expect(moved).toEqual(["c"]);
});

test("replacing the middle keeps both ends where they are", () => {
  const set = mounted(["a", "b", "c", "d", "e"]);
  set(["a", "x", "y", "e"]);
  expect(shown()).toBe("a x y e");
  expect(removed.toSorted()).toEqual(["b", "c", "d"]);
  expect(moved.toSorted()).toEqual(["x", "y"]);
});

test("rows of two nodes stay paired and in order through a change between shared ends", () => {
  const set = mounted(["a", "b", "c", "d"], true);
  set(["a", "c", "x", "b", "d"]);
  expect(shown()).toBe("a a' c c' x x' b b' d d'");
  expect(moved).not.toContain("a");
  expect(moved).not.toContain("d");
});

test("any sequence of edits leaves the rows in the list's order", () => {
  let seed = 20261013;
  const random = (bound: number): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % bound;
  };
  let names = ["a", "b", "c", "d", "e", "f"];
  const set = mounted(names, true);
  let minted = 0;
  for (let step = 0; step < 300; step++) {
    const next = [...names];
    switch (random(5)) {
      case 0:
        next.splice(random(next.length + 1), 0, `n${minted++}`);
        break;
      case 1:
        if (next.length > 0) next.splice(random(next.length), 1);
        break;
      case 2:
        if (next.length > 1) {
          const from = random(next.length);
          const [taken] = next.splice(from, 1);
          next.splice(random(next.length + 1), 0, taken);
        }
        break;
      case 3:
        next.reverse();
        break;
      default:
        next.push(`n${minted++}`, `n${minted++}`);
    }
    names = next;
    set(names);
    expect(shown()).toBe(names.map((name) => `${name} ${name}'`).join(" "));
  }
});
