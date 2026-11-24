import { beforeEach, describe, expect, test } from "bun:test";

import {
  atoms,
  collectCss,
  collectCssParts,
  css,
  globalCss,
  layer,
  registerCss,
  setCssSink,
} from "./index.ts";
import { paintedAtoms, resetCss } from "./internal.ts";

/** A sheet as its statements, each `@layer` block as the rules it holds. */
function rules(sheet: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let index = 0; index < sheet.length; index++) {
    if (sheet[index] === "{") depth++;
    else if (sheet[index] === "}" && --depth === 0) {
      const statement = sheet.slice(from, index + 1);
      const opened = /^@layer [\w.-]+\{/.exec(statement);
      if (opened === null) out.push(statement);
      else out.push(...rules(statement.slice(opened[0].length, -1)));
      from = index + 1;
    }
  }
  return out;
}

function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

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
    const ui = layer("barq.media");
    const wide = ui({ width: { "@media (min-width: 60em)": 3 } });
    const narrow = ui({ width: { "@media (min-width: 30em)": 2 } });
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

interface CssHost {
  enter(render: Render | null): void;
}

/** What a host installs: the first read of the sheet in a render is its head. */
function host(): CssHost {
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

/** What the document's two head sheets hold, in order. */
function painted(): string {
  return (document.getElementById("barq-css")?.textContent ?? "") + paintedAtoms();
}

interface ServedSheets {
  head: string;
  late: string;
}

/** A server's sheets, written into the document the client then loads. */
function serve(render: () => void, body: () => void): ServedSheets {
  resetCss();
  const requests = host();
  const page: Render = { head: false, late: undefined };
  render();
  requests.enter(page);
  const parts = collectCssParts();
  const head = parts.blocks + parts.atoms;
  body();
  const late = page.late?.() ?? "";
  requests.enter(null);
  setCssSink(null);
  resetCss();

  const headSheet = document.createElement("style");
  headSheet.id = "barq-css";
  headSheet.textContent = parts.blocks;
  document.head.appendChild(headSheet);
  const atomSheet = document.createElement("style");
  atomSheet.id = "barq-css-atoms";
  atomSheet.textContent = parts.atoms;
  document.head.appendChild(atomSheet);
  const lateSheet = document.createElement("style");
  lateSheet.id = "barq-css-late";
  lateSheet.textContent = late;
  document.body.appendChild(lateSheet);
  return { head, late };
}

/** A theme as `installArcTheme` writes one: a layer around a `:root` block and a dark one. */
function THEME(spacing: string): string {
  return `@layer barq.theme {\n:root {\n  --spacing: ${spacing};\n  --primary: red;\n}\n.dark {\n  --primary: blue;\n}\n[data-density="compact"] {\n  --spacing: 0.2rem;\n}\n}`;
}

describe("the sheet > hydration", () => {
  function application(): void {
    globalCss`
      body {
        margin: 0;
      }
    `;
    atoms({ color: "red", width: { "@media (min-width: 600px)": 2, ":hover": 3 } });
    layer("barq.adopt")({ display: "flex", gap: { "@media print": 0 } });
    registerCss("/m/card.tsx", ".bcard{color:red}@layer barq.adopt{.a-top_z{top:0}}");
  }

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
    expect(painted()).toBe(head);
    expect(document.getElementById("barq-css-late")?.textContent).toBe(late);
  });

  test("a new rule joins in tier order and every server rule keeps its place", () => {
    const { head, late } = serve(application, () => {
      atoms({ height: 5 });
    });
    const served = rules(head);

    atoms({ color: "red" });
    const fresh = atoms({ zIndex: 4 });
    const layered = layer("barq.adopt")({ order: 2 });
    const block = css`
      color: teal;
    `;

    const text = painted();
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
    // Once among the blocks, where the layer is first named, and once among the
    // atoms.
    expect(count(text, "@layer barq.adopt{")).toBe(2);

    // A block arriving after hydration goes in front of every atom, which is
    // where `orderAtoms` puts one in a sheet written whole.
    const teal = now.indexOf(`.${block}{color: teal}`);
    expect(teal).toBeGreaterThan(now.indexOf(".bcard{color:red}"));
    expect(teal).toBeLessThan(now.findIndex((rule) => rule.startsWith(".a-color_")));
    expect(document.getElementById("barq-css-late")?.textContent).toBe(late);
  });

  test("a rule the late sheet holds is not written into the head sheet as well", () => {
    serve(application, () => {
      atoms({ height: 5 });
    });
    const tall = atoms({ height: 5 });
    atoms({ zIndex: 4 });
    expect(painted()).not.toContain(tall);
  });

  test("an entry the server's render registered, replaced after hydration, leaves the late sheet", () => {
    serve(application, () => {
      registerCss("barq-arc:theme", THEME("0.25rem"));
    });
    expect(document.getElementById("barq-css-late")?.textContent).toContain("--spacing: 0.25rem");
    // The hydrating render registers what the server did, then a control changes it.
    registerCss("barq-arc:theme", THEME("0.25rem"));
    // A hydration that renders `<body>` can leave a new element under the id.
    const adopted = document.getElementById("barq-css-late");
    adopted?.replaceWith(adopted.cloneNode(true));
    registerCss("barq-arc:theme", THEME("0.2rem"));
    expect(document.getElementById("barq-css-late")?.textContent).not.toContain(
      "--spacing: 0.25rem",
    );
    expect(painted()).toContain("--spacing: 0.2rem");
  });

  test("a module replaced after hydration loses the rules only it had", () => {
    serve(application, () => {});
    registerCss("/m/card.tsx", ".bcard{color:red}@layer barq.adopt{.a-top_z{top:0}}");
    registerCss("/m/card.tsx", ".bcard2{color:blue}@layer barq.adopt{.a-top_z{top:0}}");
    const text = painted();
    expect(text).not.toContain(".bcard{color:red}");
    expect(text).toContain(".bcard2{color:blue}");
    expect(count(text, ".a-top_z{top:0}")).toBe(1);
  });
});

/**
 * A `css` block class and an atom are both 0-1-0, so for one property on one
 * element the sheet's order decides, and the atom is the override.
 */
describe("the sheet > a block and an atom for one property", () => {
  const block = ".b1n4k2p0{color:blue}";
  const atom = ".a-color_1n4k2p0{color:red}";

  test("the atom is written after the block, whichever module registered first", () => {
    registerCss("/m/atom.tsx", atom);
    registerCss("/m/block.tsx", block);
    expect(rules(collectCss())).toEqual([block, atom]);
    resetCss();
    registerCss("/m/block.tsx", block);
    registerCss("/m/atom.tsx", atom);
    expect(rules(collectCss())).toEqual([block, atom]);
  });

  test("inside a cascade layer too", () => {
    registerCss("/m/atom.tsx", `@layer barq.ui{${atom}}`);
    registerCss("/m/block.tsx", `@layer barq.ui{${block}}`);
    expect(collectCss()).toBe(`@layer barq.ui{${block}${atom}}`);
  });

  test("and for the runtime's own, where an `atoms` call comes before a `css` block", () => {
    const red = atoms({ color: "red" });
    const blue = css`
      color: blue;
    `;
    const sheet = rules(collectCss());
    expect(sheet.findIndex((rule) => rule.startsWith(`.${blue}`))).toBeLessThan(
      sheet.findIndex((rule) => rule.startsWith(`.${red}`)),
    );
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

describe("the sheet > a call that registers several rules", () => {
  /**
   * Every write of the atoms, counted by the text written. In dev they are an
   * adopted stylesheet, which the cascade puts after every stylesheet the
   * document holds.
   */
  function writes(run: () => void): string[] {
    atoms({ order: 1 });
    const seen: string[] = [];
    const original = CSSStyleSheet.prototype.replaceSync;
    CSSStyleSheet.prototype.replaceSync = function (this: CSSStyleSheet, text: string): void {
      seen.push(text);
      original.call(this, text);
    };
    try {
      run();
    } finally {
      CSSStyleSheet.prototype.replaceSync = original;
    }
    return seen;
  }

  test("rewrites the sheet once, and holds every rule when it returns", () => {
    let classes = "";
    const seen = writes(() => {
      classes = atoms({ color: "salmon", margin: "1px 2px", display: "grid" });
    });
    expect(seen).toHaveLength(1);
    for (const name of classes.split(" ")) expect(seen[0]).toContain(`.${name}{`);
    expect(painted()).toBe(collectCssParts().blocks + collectCssParts().atoms);
  });

  test("and still paints after a call that threw", () => {
    expect(() =>
      atoms(
        { color: "teal" },
        {
          get width(): string {
            throw new Error("salama");
          },
        },
      ),
    ).toThrow("salama");
    const seen = writes(() => atoms({ color: "plum" }));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("color:plum");
  });
});

/**
 * A build links its compiled atoms with `data-barq-atoms`, and what the runtime
 * registers goes either side of that link: its blocks in front, so a compiled
 * atom beats them, and its atoms after, so they beat a compiled block.
 */
describe("the sheet > beside a build's atoms", () => {
  test("its blocks go in front of the atoms' link and its atoms after it", () => {
    document.head.innerHTML =
      '<link rel="stylesheet" href="/chunk.css"><link rel="stylesheet" href="/atoms.css" data-barq-atoms>';
    css`
      color: teal;
    `;
    atoms({ color: "red" });
    const order = [...document.head.children].map(
      (element) => element.getAttribute("href") ?? element.id,
    );
    expect(order).toEqual(["/chunk.css", "barq-css", "/atoms.css", "barq-css-atoms"]);
    expect(document.getElementById("barq-css")?.textContent).toContain("color: teal");
    expect(document.getElementById("barq-css-atoms")?.textContent).toContain("color:red");
    document.head.innerHTML = "";
  });

  /**
   * Vite's dev client appends a `<style>` for an imported `.css` file to the
   * end of `<head>`. With no build's link to stand beside, the atoms are an
   * adopted stylesheet, which comes after every one the document holds.
   */
  test("with no build's atoms, its atoms come after every stylesheet in the document", () => {
    const red = atoms({ color: "red" });
    const style = document.createElement("style");
    style.setAttribute("data-vite-dev-id", "/src/plain.css");
    document.head.appendChild(style);
    expect(document.getElementById("barq-css-atoms")).toBe(null);
    const adopted = document.adoptedStyleSheets.flatMap((sheet) =>
      [...sheet.cssRules].map((rule) => rule.cssText),
    );
    expect(adopted.some((rule) => rule.includes(red))).toBe(true);
    style.remove();
  });
});

describe("the sheet > scoped to one page", () => {
  test("holds the module stylesheets it names, in that order, and every other entry", () => {
    registerCss("/m/create.tsx", "#app{display:flex}");
    registerCss("/m/home.tsx", ".bhome{color:red}");
    registerCss("/m/shared.tsx", ".bshared{color:blue}");
    const own = atoms({ color: "green" });
    registerCss("barq-ui:theme", ":root{--chart-1:grey}");
    const modules = new Set(["/m/create.tsx", "/m/home.tsx", "/m/shared.tsx"]);
    const sheet = collectCss({ keys: ["/m/shared.tsx", "/m/home.tsx"], modules });
    expect(sheet).not.toContain("#app");
    expect(sheet.indexOf(".bshared")).toBeLessThan(sheet.indexOf(".bhome"));
    expect(sheet).toContain(`.${own}{color:green}`);
    expect(sheet).toContain("--chart-1:grey");
    expect(collectCssParts({ keys: ["/m/home.tsx"], modules }).blocks).toBe(
      ".bhome{color:red}:root{--chart-1:grey}",
    );
  });
});

describe("the sheet > a late sheet with a block in it", () => {
  test("ends with every atom, so none loses to a block the render brought", () => {
    resetCss();
    const requests = host();
    const page: Render = { head: false, late: undefined };
    const early = atoms({ color: "red" });
    requests.enter(page);
    collectCssParts();
    registerCss("/m/late.tsx", ".blate{color:blue}");
    const late = page.late?.() ?? "";
    requests.enter(null);
    setCssSink(null);
    expect(late.indexOf(".blate{color:blue}")).toBeLessThan(late.indexOf(`.${early}{color:red}`));
  });
});
