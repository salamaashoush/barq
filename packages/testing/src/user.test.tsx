import { afterEach, describe, expect, test } from "bun:test";

import { tabbableElements, user } from "./index.ts";

function page(html: string): void {
  document.body.innerHTML = html;
}

const ids = (elements: readonly HTMLElement[]): string[] => elements.map((each) => each.id);

function tabThrough(count: number, options: { shift?: boolean } = {}): string[] {
  const visited: string[] = [];
  for (let step = 0; step < count; step += 1) {
    user.tab(options);
    visited.push((document.activeElement as HTMLElement | null)?.id ?? "");
  }
  return visited;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the sequential focus navigation order", () => {
  test("is document order for natively focusable elements and `tabindex=0`", () => {
    page(`
      <button id="a">a</button>
      <a id="b" href="#">b</a>
      <a id="no-href">not a link</a>
      <input id="c" />
      <div id="d" tabindex="0">d</div>
      <select id="e"></select>
      <textarea id="f"></textarea>
      <div id="g" contenteditable="true">g</div>
    `);
    expect(ids(tabbableElements())).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  });

  test('skips `tabindex="-1"`, on a plain element and on a native control alike', () => {
    page(`
      <button id="a">a</button>
      <button id="b" tabindex="-1">b</button>
      <div id="c" tabindex="-1">c</div>
      <input id="d" tabindex="-1" />
      <a id="e" href="#" tabindex="-1">e</a>
      <button id="f">f</button>
    `);
    expect(ids(tabbableElements())).toEqual(["a", "f"]);
    expect(tabThrough(3)).toEqual(["a", "f", "a"]);
  });

  test("puts a positive `tabindex` first, ascending, then document order", () => {
    page(`
      <button id="zero-1">a</button>
      <button id="three" tabindex="3">b</button>
      <button id="one-a" tabindex="1">c</button>
      <div id="zero-2" tabindex="0">d</div>
      <button id="one-b" tabindex="1">e</button>
      <button id="two" tabindex="2">f</button>
    `);
    expect(ids(tabbableElements())).toEqual(["one-a", "one-b", "two", "three", "zero-1", "zero-2"]);
    expect(tabThrough(7)).toEqual(["one-a", "one-b", "two", "three", "zero-1", "zero-2", "one-a"]);
  });

  test("an unparseable `tabindex` leaves the element as it natively is", () => {
    page(`
      <button id="a" tabindex="soon">a</button>
      <div id="b" tabindex="soon">b</div>
      <button id="c" tabindex="">c</button>
    `);
    expect(ids(tabbableElements())).toEqual(["a", "c"]);
  });

  test("skips disabled controls, including those a disabled fieldset disables", () => {
    page(`
      <button id="a" disabled>a</button>
      <input id="b" disabled />
      <fieldset disabled>
        <legend><input id="in-legend" /></legend>
        <input id="c" />
        <button id="d">d</button>
        <div id="e" tabindex="0">not a form control</div>
      </fieldset>
      <button id="f">f</button>
    `);
    expect(ids(tabbableElements())).toEqual(["in-legend", "e", "f"]);
  });

  test("skips everything under `inert`", () => {
    page(`
      <div inert>
        <button id="a">a</button>
        <div><input id="b" /></div>
      </div>
      <button id="c">c</button>
    `);
    expect(ids(tabbableElements())).toEqual(["c"]);
  });

  test("skips what is not rendered: `hidden`, `display: none`, `visibility: hidden`", () => {
    page(`
      <style>
        .gone { display: none; }
        .unseen { visibility: hidden; }
      </style>
      <button id="a" hidden>a</button>
      <div hidden><button id="b">b</button></div>
      <button id="c" style="display: none">c</button>
      <div style="display: none"><div><button id="d">d</button></div></div>
      <div class="gone"><button id="e">e</button></div>
      <button id="f" style="visibility: hidden">f</button>
      <div class="unseen">
        <button id="g">g</button>
        <button id="h" style="visibility: visible">h</button>
      </div>
      <input id="i" type="hidden" />
      <button id="j">j</button>
    `);
    expect(ids(tabbableElements())).toEqual(["h", "j"]);
  });

  test("skips the content of a closed `<details>`, and keeps its summary", () => {
    page(`
      <details>
        <summary id="closed-summary">More</summary>
        <button id="a">a</button>
      </details>
      <details open>
        <summary id="open-summary">More</summary>
        <summary id="second-summary">Not a summary</summary>
        <button id="b">b</button>
      </details>
    `);
    expect(ids(tabbableElements())).toEqual(["closed-summary", "open-summary", "b"]);
  });

  test("does not skip `aria-hidden`, which hides from a screen reader and not from Tab", () => {
    page(`
      <div aria-hidden="true"><button id="a">a</button></div>
      <button id="b">b</button>
    `);
    expect(ids(tabbableElements())).toEqual(["a", "b"]);
  });

  test("stops once at a radio group: the checked radio, or the first", () => {
    page(`
      <input id="before" />
      <input id="size-s" type="radio" name="size" />
      <input id="size-m" type="radio" name="size" checked />
      <input id="size-l" type="radio" name="size" />
      <input id="colour-red" type="radio" name="colour" />
      <input id="colour-blue" type="radio" name="colour" />
      <input id="loose-1" type="radio" />
      <input id="loose-2" type="radio" />
      <form><input id="other-form" type="radio" name="size" /></form>
      <input id="after" />
    `);
    expect(ids(tabbableElements())).toEqual([
      "before",
      "size-m",
      "colour-red",
      "loose-1",
      "loose-2",
      "other-form",
      "after",
    ]);
  });

  test("a radio group whose first radio cannot be reached stops at the next one", () => {
    page(`
      <input id="a" type="radio" name="plan" disabled />
      <input id="b" type="radio" name="plan" />
      <input id="c" type="radio" name="plan" />
    `);
    expect(ids(tabbableElements())).toEqual(["b"]);
  });

  test("is scoped to the root it is asked about", () => {
    page(`
      <button id="outside">outside</button>
      <div id="scope"><button id="inside">inside</button></div>
    `);
    expect(ids(tabbableElements(document.getElementById("scope") as HTMLElement))).toEqual([
      "inside",
    ]);
  });
});

describe("user.tab", () => {
  test("goes backwards with shift, and wraps both ways", () => {
    page(`<button id="a">a</button><button id="b">b</button><button id="c">c</button>`);
    expect(tabThrough(4)).toEqual(["a", "b", "c", "a"]);
    expect(tabThrough(4, { shift: true })).toEqual(["c", "b", "a", "c"]);
  });

  test("from an element Tab cannot reach, continues from where that element is", () => {
    page(`
      <button id="a">a</button>
      <div id="panel" tabindex="-1">
        <button id="b">b</button>
      </div>
      <button id="c">c</button>
    `);
    (document.getElementById("panel") as HTMLElement).focus();
    user.tab();
    expect(document.activeElement?.id).toBe("b");

    (document.getElementById("panel") as HTMLElement).focus();
    user.tab({ shift: true });
    expect(document.activeElement?.id).toBe("a");
  });

  test("a cancelled keydown moves nothing", () => {
    page(`<button id="a">a</button><button id="b">b</button>`);
    const first = document.getElementById("a") as HTMLElement;
    first.focus();
    first.addEventListener("keydown", (event) => event.preventDefault());
    user.tab();
    expect(document.activeElement?.id).toBe("a");
  });

  test("fires keydown on the element it leaves and keyup on the one it reaches", () => {
    page(`<button id="a">a</button><button id="b">b</button>`);
    const log: string[] = [];
    for (const id of ["a", "b"]) {
      const element = document.getElementById(id) as HTMLElement;
      element.addEventListener("keydown", () => log.push(`down:${id}`));
      element.addEventListener("keyup", () => log.push(`up:${id}`));
    }
    (document.getElementById("a") as HTMLElement).focus();
    user.tab();
    expect(log).toEqual(["down:a", "up:b"]);
  });
});

describe("the keyboard activates what a browser activates", () => {
  test("Enter clicks a button as it goes down, Space as it comes up", () => {
    page(`<button id="save" type="button">Save</button>`);
    const button = document.getElementById("save") as HTMLButtonElement;
    const seen: string[] = [];
    for (const type of ["keydown", "keyup", "click"]) {
      button.addEventListener(type, (event) =>
        seen.push(event instanceof KeyboardEvent ? `${type} ${event.key}` : type),
      );
    }
    button.focus();
    user.keyboard("{Enter}");
    expect(seen).toEqual(["keydown Enter", "click", "keyup Enter"]);
    seen.length = 0;
    user.keyboard(" ");
    expect(seen).toEqual(["keydown  ", "keyup  ", "click"]);
  });

  test("a cancelled keydown activates nothing, and neither does a disabled button", () => {
    page(`<button id="held" type="button">Held</button><button id="off" disabled>Off</button>`);
    let clicks = 0;
    const held = document.getElementById("held") as HTMLButtonElement;
    held.addEventListener("click", () => clicks++);
    held.addEventListener("keydown", (event) => event.preventDefault());
    held.focus();
    user.keyboard("{Enter} ");
    expect(clicks).toBe(0);

    const off = document.getElementById("off") as HTMLButtonElement;
    off.addEventListener("click", () => clicks++);
    user.keyboard("{Enter}", { target: off });
    expect(clicks).toBe(0);
  });

  test("Space toggles a checkbox, Enter does not", () => {
    page(`<input id="terms" type="checkbox" />`);
    const box = document.getElementById("terms") as HTMLInputElement;
    box.focus();
    user.keyboard("{Enter}");
    expect(box.checked).toBe(false);
    user.keyboard(" ");
    expect(box.checked).toBe(true);
  });
});
