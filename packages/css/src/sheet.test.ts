import { beforeEach, describe, expect, test } from "bun:test";

import { atoms, atomsIn, collectCss, css, globalCss, registerCss, setCssSink } from "./index.ts";
import { resetCss } from "./internal.ts";

/** A sheet as its statements, each `@layer` block as the rules it holds. */
function rules(sheet: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let index = 0; index < sheet.length; index++) {
    if (sheet[index] === "{") depth++;
    else if (sheet[index] === "}" && --depth === 0) {
      const statement = sheet.slice(from, index + 1);
      const layer = /^@layer [\w.-]+\{/.exec(statement);
      if (layer === null) out.push(statement);
      else out.push(...rules(statement.slice(layer[0].length, -1)));
      from = index + 1;
    }
  }
  return out;
}

const count = (text: string, needle: string): number => text.split(needle).length - 1;

beforeEach(() => {
  resetCss();
  setCssSink(null);
  document.getElementById("barq-css-late")?.remove();
});

describe("the sheet > the media tier", () => {
  test("is mobile-first, whichever query was used first", () => {
    const wide = atoms({ width: { "@media (min-width: 1024px)": 3 } });
    const capped = atoms({ width: { "@media (max-width: 500px)": 9 } });
    const print = atoms({ width: { "@media print": 7 } });
    const narrow = atoms({ width: { "@media (min-width: 640px)": 2 } });
    const loose = atoms({ width: { "@media (max-width: 800px)": 8 } });
    const base = atoms({ width: 1 });
    const sheet = collectCss();
    const order = [base, narrow, wide, loose, capped, print].map((name) => sheet.indexOf(name));
    expect(order).toEqual(order.toSorted((a, b) => a - b));
  });

  test("across a compiled module's rules and the runtime's own", () => {
    registerCss(
      "/m/late.tsx",
      "@media (min-width: 900px){.a-color-900_x{color:red}}.a-color_y{color:blue}",
    );
    const narrow = atoms({ color: { "@media (min-width: 300px)": "green" } });
    const plain = atoms({ height: 1 });
    const sheet = collectCss();
    expect(sheet.indexOf(plain)).toBeLessThan(sheet.indexOf(narrow));
    expect(sheet.indexOf(".a-color_y{")).toBeLessThan(sheet.indexOf(narrow));
    expect(sheet.indexOf(narrow)).toBeLessThan(sheet.indexOf(".a-color-900_x{"));
  });

  test("inside a cascade layer too", () => {
    const wide = atomsIn("barq.media", { width: { "@media (min-width: 60em)": 3 } });
    const narrow = atomsIn("barq.media", { width: { "@media (min-width: 30em)": 2 } });
    const sheet = collectCss();
    expect(sheet.indexOf(narrow)).toBeLessThan(sheet.indexOf(wide));
  });

  test("puts a wider range before a narrower one from the same floor", () => {
    const narrow = atoms({ width: { "@media (min-width: 600px) and (max-width: 900px)": 2 } });
    const open = atoms({ width: { "@media (min-width: 600px)": 1 } });
    const sheet = collectCss();
    expect(sheet.indexOf(open)).toBeLessThan(sheet.indexOf(narrow));
  });
});

interface Render {
  head: boolean;
  late: (() => string) | undefined;
}

/** What a host installs: the first read of the sheet in a render is its head. */
function host(): { enter(render: Render | null): void } {
  let current: Render | null = null;
  setCssSink(
    Object.assign((): boolean => current !== null, {
      head(late: () => string): void {
        if (current === null || current.head) return;
        current.head = true;
        current.late = late;
      },
    }),
  );
  return {
    enter(render) {
      current = render;
    },
  };
}

describe("the sheet > two renders at once", () => {
  test("a rule one render registered after another read its head reaches both pages", () => {
    const requests = host();
    const first: Render = { head: false, late: undefined };
    const second: Render = { head: false, late: undefined };
    const shared = atoms({ color: "red" });

    requests.enter(second);
    const secondHead = collectCss();
    requests.enter(first);
    const firstHead = collectCss();
    const rule = atoms({ color: "blue" });
    requests.enter(second);
    expect(atoms({ color: "blue" })).toBe(rule);
    const secondLate = second.late?.() ?? "";
    requests.enter(first);
    const firstLate = first.late?.() ?? "";
    requests.enter(null);

    for (const page of [secondHead + secondLate, firstHead + firstLate]) {
      expect(count(page, `.${rule}{color:blue}`)).toBe(1);
      expect(count(page, `.${shared}{color:red}`)).toBe(1);
    }
    expect(secondHead).not.toContain(rule);
  });

  test("a render that starts afterwards has the rule in its head and nothing late", () => {
    const requests = host();
    const early: Render = { head: false, late: undefined };
    requests.enter(early);
    collectCss();
    const rule = atoms({ color: "blue" });

    const later: Render = { head: false, late: undefined };
    requests.enter(later);
    const head = collectCss();
    atoms({ color: "blue" });
    expect(head).toContain(`.${rule}{color:blue}`);
    expect(later.late?.()).toBe("");
    requests.enter(null);
  });

  test("a module two renders share is not written into a page twice", () => {
    const requests = host();
    registerCss("/m/one.tsx", ".a-color_one{color:red}.b1{color:red}");
    const render: Render = { head: false, late: undefined };
    requests.enter(render);
    const head = collectCss();
    registerCss("/m/two.tsx", ".a-color_one{color:red}.a-width_two{width:1px}");
    const late = render.late?.() ?? "";
    requests.enter(null);
    expect(late).toBe(".a-width_two{width:1px}");
    expect(count(head + late, ".a-color_one{color:red}")).toBe(1);
  });

  test("the late sheet is in tier order, like the head", () => {
    const requests = host();
    const render: Render = { head: false, late: undefined };
    requests.enter(render);
    collectCss();
    const wide = atoms({ width: { "@media (min-width: 900px)": 3 } });
    const narrow = atoms({ width: { "@media (min-width: 300px)": 2 } });
    const hover = atoms({ width: { ":hover": 4 } });
    const base = atoms({ width: 1 });
    const late = render.late?.() ?? "";
    requests.enter(null);
    const order = [base, hover, narrow, wide].map((name) => late.indexOf(name));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual(order.toSorted((a, b) => a - b));
  });
});

/** A server's two sheets, written into the document the client then loads. */
function serve(render: () => void, body: () => void): { head: string; late: string } {
  resetCss();
  const requests = host();
  const page: Render = { head: false, late: undefined };
  render();
  requests.enter(page);
  const head = collectCss();
  body();
  const late = page.late?.() ?? "";
  requests.enter(null);
  setCssSink(null);
  resetCss();

  const headSheet = document.createElement("style");
  headSheet.id = "barq-css";
  headSheet.textContent = head;
  document.head.appendChild(headSheet);
  const lateSheet = document.createElement("style");
  lateSheet.id = "barq-css-late";
  lateSheet.textContent = late;
  document.body.appendChild(lateSheet);
  return { head, late };
}

describe("the sheet > hydration", () => {
  const application = (): void => {
    globalCss`
      body {
        margin: 0;
      }
    `;
    atoms({ color: "red", width: { "@media (min-width: 600px)": 2, ":hover": 3 } });
    atomsIn("barq.adopt", { display: "flex", gap: { "@media print": 0 } });
    registerCss("/m/card.tsx", ".bcard{color:red}@layer barq.adopt{.a-top_z{top:0}}");
  };

  test("registering what the server sent rewrites nothing", () => {
    const { head, late } = serve(application, () => {
      atoms({ height: 5 });
    });
    const element = document.getElementById("barq-css");
    expect(late).not.toBe("");

    atoms({ color: "red" });
    registerCss("/m/card.tsx", ".bcard{color:red}@layer barq.adopt{.a-top_z{top:0}}");
    atoms({ height: 5 });

    expect(document.getElementById("barq-css")).toBe(element);
    expect(element?.textContent).toBe(head);
    expect(document.getElementById("barq-css-late")?.textContent).toBe(late);
  });

  test("a new rule joins in tier order and every server rule keeps its place", () => {
    const { head, late } = serve(application, () => {
      atoms({ height: 5 });
    });
    const element = document.getElementById("barq-css");
    const served = rules(head);

    atoms({ color: "red" });
    const fresh = atoms({ zIndex: 4 });
    const layered = atomsIn("barq.adopt", { order: 2 });
    const block = css`
      color: teal;
    `;

    const text = element?.textContent ?? "";
    const now = rules(text);
    expect(now.filter((rule) => served.includes(rule))).toEqual(served);
    expect(text.startsWith("body{margin: 0}")).toBe(true);

    const hover = now.findIndex((rule) => rule.includes(":hover"));
    const media = now.findIndex((rule) => rule.startsWith("@media (min-width: 600px)"));
    const at = now.indexOf(`.${fresh}{z-index:4}`);
    expect(at).toBeGreaterThan(now.findIndex((rule) => rule.endsWith("{color:red}")));
    expect(at).toBeLessThan(hover);
    expect(at).toBeLessThan(media);

    const inLayer = now.indexOf(`.${layered}{order:2}`);
    expect(inLayer).toBeGreaterThan(now.findIndex((rule) => rule.endsWith("{display:flex}")));
    expect(inLayer).toBeLessThan(now.findIndex((rule) => rule.startsWith("@media print")));
    expect(count(text, "@layer barq.adopt{")).toBe(1);

    expect(now.at(-1)).toBe(`.${block}{color: teal}`);
    expect(document.getElementById("barq-css-late")?.textContent).toBe(late);
  });

  test("a rule the late sheet holds is not written into the head sheet as well", () => {
    serve(application, () => {
      atoms({ height: 5 });
    });
    const tall = atoms({ height: 5 });
    atoms({ zIndex: 4 });
    expect(document.getElementById("barq-css")?.textContent).not.toContain(tall);
  });

  test("a module replaced after hydration loses the rules only it had", () => {
    serve(application, () => {});
    registerCss("/m/card.tsx", ".bcard{color:red}@layer barq.adopt{.a-top_z{top:0}}");
    registerCss("/m/card.tsx", ".bcard2{color:blue}@layer barq.adopt{.a-top_z{top:0}}");
    const text = document.getElementById("barq-css")?.textContent ?? "";
    expect(text).not.toContain(".bcard{color:red}");
    expect(text).toContain(".bcard2{color:blue}");
    expect(count(text, ".a-top_z{top:0}")).toBe(1);
  });
});

describe("the sheet > two declarations under one class", () => {
  // FNV-1a over 32 bits gives `40189px` and `797186px` the same suffix.
  test("is an error naming both, where the runtime builds the atom", () => {
    atoms({ width: 40189 });
    expect(() => atoms({ width: 797186 })).toThrow(/width:40189px[\s\S]*width:797186px/);
  });

  test("is not what a rule that only names a class like an atom's is", () => {
    const cls = atoms({ color: "red" });
    registerCss(
      "/m/blocks.tsx",
      `.${cls} .b1{color:blue}.a-card__title{color:red}.a-card__title{margin:0}`,
    );
    expect(collectCss()).toContain(".a-card__title{margin:0}");
  });

  test("and where two compiled modules bring one each", () => {
    registerCss("/m/first.tsx", ".a-width_1m625zv{width:40189px}");
    expect(() => registerCss("/m/second.tsx", ".a-width_1m625zv{width:797186px}")).toThrow(
      /a-width_1m625zv/,
    );
  });
});
