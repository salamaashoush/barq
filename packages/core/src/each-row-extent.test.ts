/**
 * A row whose root is itself a region, driven as the compiler emits it:
 * `<For each={rows()}>{(row) => <Show when={row.open()}>…</Show>}</For>` lowers
 * to `each(…, block((row) => branch(null, null, …)))`, and a nested `<For>` to
 * `each(…, block((row) => each(null, null, …)))`.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { NO_SCOPE } from "./flow.ts";
import { branch, each } from "./dom-flow.ts";
import { block, createSignal, flush, rootScope, runWithOwner } from "./signals.ts";

let list: HTMLUListElement;

beforeEach(() => {
  list = document.createElement("ul");
  document.body.appendChild(list);
});

afterEach(() => {
  list.remove();
});

function mount(build: () => void): void {
  runWithOwner(rootScope(), build);
  flush();
}

function item(text: string): HTMLLIElement {
  const node = document.createElement("li");
  node.textContent = text;
  return node;
}

interface Row {
  name: string;
  open: () => boolean;
  setOpen: (next: boolean) => void;
}

function row(name: string, initially: boolean): Row {
  const [open, setOpen] = createSignal(initially);
  return { name, open, setOpen };
}

function conditionalRows(rows: () => Row[]): void {
  each(
    list,
    null,
    rows,
    null,
    block((entry: Row) =>
      branch(
        null,
        null,
        () => (entry.open() ? 1 : 0),
        [null, block(() => item(entry.name))],
        NO_SCOPE,
      ),
    ),
  );
}

test("a row that opened after it was built takes its content along when it moves", () => {
  const ada = row("ada", false);
  const grace = row("grace", true);
  const edsger = row("edsger", true);
  const [rows, setRows] = createSignal([ada, grace, edsger]);
  mount(() => conditionalRows(rows));

  ada.setOpen(true);
  flush();
  expect(list.textContent).toBe("adagraceedsger");

  setRows([grace, edsger, ada]);
  flush();
  expect(list.textContent).toBe("graceedsgerada");
});

test("rows that closed after they were built can still be reordered", () => {
  const ada = row("ada", true);
  const grace = row("grace", false);
  const edsger = row("edsger", true);
  const [rows, setRows] = createSignal([ada, grace, edsger]);
  mount(() => conditionalRows(rows));

  ada.setOpen(false);
  grace.setOpen(true);
  edsger.setOpen(false);
  flush();
  expect(list.textContent).toBe("grace");

  setRows([edsger, grace, ada]);
  expect(() => flush()).not.toThrow();
  expect(list.textContent).toBe("grace");
});

test("a row holding a nested list that grew takes every nested row along when it moves", () => {
  const group = (names: string[]) => {
    const [members, setMembers] = createSignal(names);
    return { members, setMembers };
  };
  const first = group(["ada"]);
  const second = group(["grace"]);
  const third = group(["edsger"]);
  const [groups, setGroups] = createSignal([first, second, third]);
  mount(() => {
    each(
      list,
      null,
      groups,
      null,
      block((entry: ReturnType<typeof group>) =>
        each(
          null,
          null,
          entry.members,
          null,
          block((name: string) => item(name)),
        ),
      ),
    );
  });

  first.setMembers(["ada", "alan"]);
  flush();
  expect(list.textContent).toBe("adaalangraceedsger");

  setGroups([second, third, first]);
  flush();
  expect(list.textContent).toBe("graceedsgeradaalan");
});

test("a row of several nodes keeps its own order when it moves", () => {
  const [rows, setRows] = createSignal(["ada", "grace"]);
  mount(() => {
    each(
      list,
      null,
      rows,
      null,
      block((name: string) => [item(`${name}:term`), item(`${name}:detail`)]),
    );
  });
  expect(list.textContent).toBe("ada:termada:detailgrace:termgrace:detail");

  setRows(["grace", "ada"]);
  flush();
  expect(list.textContent).toBe("grace:termgrace:detailada:termada:detail");
});
