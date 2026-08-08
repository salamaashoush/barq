/**
 * DOM rendering head-to-head: barq vs solid-js/web.
 *
 * Both sides are hand-written in the exact shape each compiler emits, so this
 * measures the runtimes (template cloning, insert, prop application, list
 * reconciliation) rather than the compilers.
 *
 * Run: bun run src/dom-head-to-head.ts
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

const barq = await import("@barqjs/core");
const solid = await import("solid-js/web");
const solidCore = await import("solid-js");

type Row = { id: number; label: string };

let nextId = 1;
function makeRows(n: number): Row[] {
  const rows: Row[] = new Array(n);
  for (let i = 0; i < n; i++) rows[i] = { id: nextId++, label: `row ${nextId}` };
  return rows;
}

function container(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

// ---------------------------------------------------------------- cases

type Case = {
  name: string;
  barq: () => () => void; // setup -> one measured iteration
  solid: () => () => void;
  n?: number;
};

const cases: Case[] = [];

// 1. Clone a static template
{
  const html = `<div class="card"><h2>Title</h2><p>Body text here</p><span>tail</span></div>`;
  const bTmpl = barq.template(html);
  const sTmpl = solid.template(html);
  cases.push({
    name: "template: clone static tree",
    n: 20000,
    barq: () => () => {
      bTmpl();
    },
    solid: () => () => {
      sTmpl();
    },
  });
}

// 2. One dynamic text hole as an element's only child
{
  cases.push({
    name: "insert: single text hole, first render",
    n: 5000,
    barq: () => {
      const tmpl = barq.template(`<div><span></span></div>`);
      return () => {
        const root = tmpl() as HTMLElement;
        const span = root.firstChild as HTMLElement;
        const s = barq.signal(0);
        barq.insert(span, () => s());
        barq.flush();
      };
    },
    solid: () => {
      const tmpl = solid.template(`<div><span></span></div>`);
      return () => {
        solidCore.createRoot((d) => {
          const root = tmpl() as HTMLElement;
          const span = root.firstChild as HTMLElement;
          const [s] = solidCore.createSignal(0);
          solid.insert(span, s);
          d();
        });
      };
    },
  });
}

// 3. Update that text hole
{
  cases.push({
    name: "insert: text hole update",
    n: 20000,
    barq: () => {
      const tmpl = barq.template(`<div><span></span></div>`);
      const root = tmpl() as HTMLElement;
      container().appendChild(root);
      const span = root.firstChild as HTMLElement;
      const s = barq.signal(0);
      barq.insert(span, () => s());
      barq.flush();
      let i = 0;
      return () => {
        s.set(++i);
        barq.flush();
      };
    },
    solid: () => {
      const tmpl = solid.template(`<div><span></span></div>`);
      let set!: (v: number) => void;
      solidCore.createRoot(() => {
        const root = tmpl() as HTMLElement;
        container().appendChild(root);
        const span = root.firstChild as HTMLElement;
        const [s, setS] = solidCore.createSignal(0);
        set = setS as (v: number) => void;
        solid.insert(span, s);
      });
      let i = 0;
      return () => {
        set(++i);
      };
    },
  });
}

// 4. Node count for one hole (structural, not timing - reported separately)

// 5. Build a 100-row list
{
  const rows = makeRows(100);
  cases.push({
    name: "list: create 100 rows",
    n: 1000,
    barq: () => {
      const tmpl = barq.template(`<tr><td></td><td></td></tr>`);
      return () => {
        const parent = document.createElement("tbody");
        for (const row of rows) {
          const tr = tmpl() as HTMLElement;
          const c1 = tr.firstChild as HTMLElement;
          const c2 = c1.nextSibling as HTMLElement;
          c1.textContent = String(row.id);
          barq.insert(c2, () => row.label);
          parent.appendChild(tr);
        }
        barq.flush();
      };
    },
    solid: () => {
      const tmpl = solid.template(`<tr><td></td><td></td></tr>`);
      return () => {
        solidCore.createRoot((d) => {
          const parent = document.createElement("tbody");
          for (const row of rows) {
            const tr = tmpl() as HTMLElement;
            const c1 = tr.firstChild as HTMLElement;
            const c2 = c1.nextSibling as HTMLElement;
            c1.textContent = String(row.id);
            solid.insert(c2, () => row.label);
            parent.appendChild(tr);
          }
          d();
        });
      };
    },
  });
}

// 6. Keyed list: swap two rows
{
  cases.push({
    name: "list: swap 2 of 200 rows",
    n: 2000,
    barq: () => {
      const parent = container();
      const data = barq.signal(makeRows(200));
      const view = barq.mapArray(data, (row: Row) => {
        const el = document.createElement("div");
        el.textContent = row.label;
        return el;
      });
      barq.insert(parent, () => view());
      barq.flush();
      return () => {
        const list = data.peek().slice();
        const t = list[1];
        list[1] = list[198];
        list[198] = t;
        data.set(list);
        barq.flush();
      };
    },
    solid: () => {
      const parent = container();
      let set!: (v: Row[]) => void;
      let peek!: () => Row[];
      solidCore.createRoot(() => {
        const [data, setData] = solidCore.createSignal(makeRows(200));
        set = setData as (v: Row[]) => void;
        peek = data;
        const view = solidCore.createMemo(
          solidCore.mapArray(data, (row: Row) => {
            const el = document.createElement("div");
            el.textContent = row.label;
            return el;
          }),
        );
        solid.insert(parent, view);
      });
      return () => {
        const list = solidCore.untrack(peek).slice();
        const t = list[1];
        list[1] = list[198];
        list[198] = t;
        set(list);
      };
    },
  });
}

// 7. Replace the whole list
{
  cases.push({
    name: "list: replace all 100 rows",
    n: 2000,
    barq: () => {
      const parent = container();
      const data = barq.signal(makeRows(100));
      const view = barq.mapArray(data, (row: Row) => {
        const el = document.createElement("div");
        el.textContent = row.label;
        return el;
      });
      barq.insert(parent, () => view());
      barq.flush();
      return () => {
        data.set(makeRows(100));
        barq.flush();
      };
    },
    solid: () => {
      const parent = container();
      let set!: (v: Row[]) => void;
      solidCore.createRoot(() => {
        const [data, setData] = solidCore.createSignal(makeRows(100));
        set = setData as (v: Row[]) => void;
        const view = solidCore.createMemo(
          solidCore.mapArray(data, (row: Row) => {
            const el = document.createElement("div");
            el.textContent = row.label;
            return el;
          }),
        );
        solid.insert(parent, view);
      });
      return () => {
        set(makeRows(100));
      };
    },
  });
}

// 8. Attribute / class updates
{
  cases.push({
    name: "prop: class update",
    n: 20000,
    barq: () => {
      const el = document.createElement("div");
      container().appendChild(el);
      const s = barq.signal(0);
      barq.setProp(el, "class", () => (s() % 2 ? "a" : "b"));
      barq.flush();
      let i = 0;
      return () => {
        s.set(++i);
        barq.flush();
      };
    },
    solid: () => {
      const el = document.createElement("div");
      container().appendChild(el);
      let set!: (v: number) => void;
      solidCore.createRoot(() => {
        const [s, setS] = solidCore.createSignal(0);
        set = setS as (v: number) => void;
        solidCore.createRenderEffect(() => {
          solid.className(el, s() % 2 ? "a" : "b");
        });
      });
      let i = 0;
      return () => {
        set(++i);
      };
    },
  });
}

// ---------------------------------------------------------------- harness

function timePair(c: Case): [number, number] {
  const n = c.n ?? 5000;
  const b = c.barq();
  const s = c.solid();
  const warm = Math.min(n, 500);
  for (let i = 0; i < warm; i++) b();
  for (let i = 0; i < warm; i++) s();
  Bun.gc(true);

  const run = (fn: () => void): number => {
    const start = Bun.nanoseconds();
    for (let i = 0; i < n; i++) fn();
    return (Bun.nanoseconds() - start) / n;
  };

  let bestB = Number.POSITIVE_INFINITY;
  let bestS = Number.POSITIVE_INFINITY;
  for (let round = 0; round < 7; round++) {
    const rb = run(b);
    const rs = run(s);
    if (rb < bestB) bestB = rb;
    if (rs < bestS) bestS = rs;
  }
  return [bestB, bestS];
}

// Guard: a framework whose effects are not wired would post absurd numbers
{
  const t = solid.template(`<div><span></span></div>`);
  let probeSpan!: HTMLElement;
  let probeSet!: (v: number) => void;
  solidCore.createRoot(() => {
    const root = t() as HTMLElement;
    document.body.appendChild(root);
    probeSpan = root.firstChild as HTMLElement;
    const [s, setS] = solidCore.createSignal(0);
    probeSet = setS as (v: number) => void;
    solid.insert(probeSpan, s);
  });
  // Writes inside createRoot are batched until it returns, so assert outside
  probeSet(42);
  if (probeSpan.textContent !== "42") {
    throw new Error(`solid harness is not reactive (got ${probeSpan.textContent})`);
  }
  const bt = barq.template(`<div><span></span></div>`);
  const broot = bt() as HTMLElement;
  document.body.appendChild(broot);
  const bspan = broot.firstChild as HTMLElement;
  const bs = barq.signal(0);
  barq.insert(bspan, () => bs());
  barq.flush();
  bs.set(42);
  barq.flush();
  if (bspan.textContent !== "42") {
    throw new Error(`barq harness is not reactive (got ${bspan.textContent})`);
  }
}

console.log(
  `${"case".padEnd(38)}${"barq ns".padStart(11)}${"solid ns".padStart(11)}${"ratio".padStart(14)}`,
);
console.log("-".repeat(74));
for (const c of cases) {
  const [b, s] = timePair(c);
  const ratio = s / b;
  const tag = ratio >= 1 ? `${ratio.toFixed(2)}x` : `${(1 / ratio).toFixed(2)}x SLOW`;
  console.log(
    `${c.name.padEnd(38)}${b.toFixed(0).padStart(11)}${s.toFixed(0).padStart(11)}${tag.padStart(14)}`,
  );
}

// ---------------------------------------------------------------- structure

console.log("\nDOM nodes produced for one dynamic text hole (<span>{x}</span>):");
{
  const tmpl = barq.template(`<div><span></span></div>`);
  const root = tmpl() as HTMLElement;
  const span = root.firstChild as HTMLElement;
  const s = barq.signal("hi");
  barq.insert(span, () => s());
  barq.flush();
  console.log(`  barq : ${span.childNodes.length}  ->  ${span.innerHTML}`);
}
{
  const tmpl = solid.template(`<div><span></span></div>`);
  solidCore.createRoot(() => {
    const root = tmpl() as HTMLElement;
    const span = root.firstChild as HTMLElement;
    const [s] = solidCore.createSignal("hi");
    solid.insert(span, s);
    console.log(`  solid: ${span.childNodes.length}  ->  ${span.innerHTML}`);
  });
}
