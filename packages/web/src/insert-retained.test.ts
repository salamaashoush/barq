/**
 * What a live hole keeps alive between updates. A table renders thousands of
 * them, so anything a hole retains beyond its effect and its nodes is paid once
 * per cell for as long as the page is open.
 */

import { expect, test } from "bun:test";
import { insert } from "./dom.ts";
import type { Child } from "@barqjs/core";
import { createRoot, createSignal, flush } from "@barqjs/core";

const HOLES = 2000;

/**
 * Arrays the runtime keeps alive, counted in a fresh process: happy-dom's own
 * allocation per node depends on what earlier tests left on its window, which
 * swamps a count taken in a shared one.
 */
function retained(measure: string): Record<string, number> {
  const dir = import.meta.dir;
  const development = import.meta.resolve("@solidjs/signals").includes("dev");
  const script = `
    import { GlobalRegistrator } from "@happy-dom/global-registrator";
    import { heapStats } from "bun:jsc";
    GlobalRegistrator.register();
    const { insert } = await import(${JSON.stringify(`${dir}/dom.ts`)});
    const { each } = await import(${JSON.stringify(`${dir}/dom-flow.ts`)});
    const { block, createRoot, createSignal, flush } = await import(${JSON.stringify(`${dir}/../../core/src/signals.ts`)});
    const HOLES = ${HOLES};
    const arrays = () => { Bun.gc(true); return heapStats().objectTypeCounts.Array ?? 0; };
    const out = {};
    ${measure}
    console.log(JSON.stringify(out));
  `;
  const run = Bun.spawnSync(
    [process.execPath, ...(development ? ["--conditions=development"] : []), "-e", script],
    { cwd: dir, stderr: "pipe" },
  );
  expect(run.stderr.toString()).toBe("");
  return JSON.parse(run.stdout.toString()) as Record<string, number>;
}

test("a live text hole that is its parent's only content keeps no array of its nodes", () => {
  const counts = retained(`
    const [tick] = createSignal(0);
    const fill = (name, place) => {
      const hosts = Array.from({ length: HOLES }, () => document.createElement("b"));
      const before = arrays();
      createRoot(() => hosts.forEach(place));
      flush();
      out[name] = arrays() - before;
      out[name + "Shown"] = hosts.every((host, i) => host.textContent === String(i)) ? 1 : 0;
    };
    fill("fixed", (host, i) => insert(host, String(i)));
    fill("live", (host, i) => insert(host, () => (tick(), String(i))));
  `);
  expect([counts.fixedShown, counts.liveShown]).toEqual([1, 1]);
  expect(counts.live - counts.fixed).toBeLessThan(HOLES / 10);
});

test("a list row of one element is held as the element, not an array of one", () => {
  const counts = retained(`
    const items = Array.from({ length: HOLES }, (_, i) => i);
    const rowItem = (i) => {
      const item = document.createElement("li");
      item.textContent = "salama " + i;
      return item;
    };
    const plain = document.createElement("ul");
    let before = arrays();
    for (const i of items) plain.appendChild(rowItem(i));
    out.fixed = arrays() - before;
    const list = document.createElement("ul");
    const [rows] = createSignal(items);
    before = arrays();
    createRoot(() => each(list, null, rows, null, block(rowItem)));
    flush();
    out.listed = arrays() - before;
    out.rows = list.children.length;
  `);
  expect(counts.rows).toBe(HOLES);
  expect(counts.listed - counts.fixed).toBeLessThan(HOLES / 10);
});

test("a live text hole still writes through its node and changes shape", () => {
  const host = document.createElement("p");
  const [value, setValue] = createSignal<Child>("salama");
  const dispose = createRoot((d) => {
    insert(host, () => value());
    return d;
  });
  flush();
  const text = host.firstChild;
  expect(host.innerHTML).toBe("salama");

  setValue(7);
  flush();
  expect(host.firstChild).toBe(text);
  expect(host.innerHTML).toBe("7");

  const em = document.createElement("em");
  setValue(em);
  flush();
  expect(host.innerHTML).toBe("<em></em>");

  setValue(["a", em, "b"]);
  flush();
  expect(host.innerHTML).toBe("a<em></em>b");

  setValue("");
  flush();
  expect(host.textContent).toBe("");

  setValue("example.com");
  flush();
  expect(host.innerHTML).toBe("example.com");

  setValue(() => () => "salama@example.com");
  flush();
  expect(host.innerHTML).toBe("salama@example.com");
  dispose();
});

test("a number is text wherever a hole writes it, zero included", () => {
  const [n, setN] = createSignal(0);
  const sole = document.createElement("b");
  const fixed = document.createElement("i");
  const beside = document.createElement("u");
  beside.append(document.createElement("hr"));
  const dispose = createRoot((d) => {
    insert(sole, () => n());
    insert(fixed, 0);
    insert(beside, () => n(), beside.firstChild);
    return d;
  });
  flush();
  expect([sole.innerHTML, fixed.innerHTML, beside.innerHTML]).toEqual(["0", "0", "0<hr>"]);
  setN(42);
  flush();
  expect([sole.innerHTML, beside.innerHTML]).toEqual(["42", "42<hr>"]);
  setN(0);
  flush();
  expect([sole.innerHTML, beside.innerHTML]).toEqual(["0", "0<hr>"]);
  dispose();
});
