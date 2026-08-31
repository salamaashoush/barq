import { describe, expect, test } from "bun:test";
import {
  atoms,
  atomsIn,
  collectCss,
  create,
  createIn,
  createTheme,
  css,
  defineVars,
  dynamic,
  dynamicVar,
  firstThatWorks,
  globalCss,
  layer,
  mergeable,
  props,
  subLayerOrder,
  TIERS,
  tierOf,
  variants,
} from "./index.ts";

/**
 * The rule a class produced, out of the one sheet.
 *
 * Brace-counted rather than matched: an `@media` condition wraps the rule, so
 * the first `}` after the class is the inner one.
 */
function ruleFor(className: string): string {
  const sheet = collectCss();
  const at = sheet.indexOf(`.${className}`);
  if (at < 0) return "";
  const start = sheet.lastIndexOf("}", at) + 1;
  let depth = 0;
  for (let index = start; index < sheet.length; index++) {
    if (sheet[index] === "{") depth++;
    else if (sheet[index] === "}" && --depth === 0) return sheet.slice(start, index + 1);
  }
  return "";
}

describe("atoms", () => {
  test("one class per declaration, each carrying its property", () => {
    const cls = atoms({ color: "red", paddingTop: 8 }).split(" ");
    expect(cls).toHaveLength(2);
    expect(cls[0]).toStartWith("a-color_");
    expect(cls[1]).toStartWith("a-padding-top_");
    expect(ruleFor(cls[0])).toBe(`.${cls[0]}{color:red}`);
    expect(ruleFor(cls[1])).toBe(`.${cls[1]}{padding-top:8px}`);
  });

  /** The whole point: passing order decides, not the order the rules were written. */
  test("a later argument replaces an earlier one, per property", () => {
    const cls = atoms({ color: "red", margin: 0 }, { color: "blue" }).split(" ");
    const colors = cls.filter((name) => name.startsWith("a-color_"));
    expect(colors).toHaveLength(1);
    expect(ruleFor(colors[0])).toBe(`.${colors[0]}{color:blue}`);
  });

  test("a selector with `&` in the middle is a condition, not a property", () => {
    // `a&:hover` is "an anchor that is also this element". `rule` substitutes
    // `&` wherever it sits, so leading with it was never required.
    const cls = atoms({ backgroundColor: { "a&:hover": "red" } }).split(" ")[0] ?? "";
    expect(ruleFor(cls)).toBe(`a.${cls}:hover{background-color:red}`);
  });

  test("atoms holding the same value end in the same token", () => {
    // The suffix hashes the value alone, so a compressor reads the second,
    // third and fourth as back-references. A shorthand is the common case: one
    // value across four longhands.
    const sides = atoms({ borderWidth: "3px" }).split(" ");
    expect(sides.length).toBe(4);
    const suffixes = new Set(sides.map((name) => name.slice(name.lastIndexOf("_"))));
    expect(suffixes.size).toBe(1);

    // And a different property with the same value shares it too.
    const other = atoms({ outlineWidth: "3px" }).split(" ")[0] ?? "";
    expect(other.slice(other.lastIndexOf("_"))).toBe([...suffixes][0]);
  });

  test("but the key still separates them, so they do not merge", () => {
    const both = atoms({ borderTopWidth: "3px", outlineWidth: "3px" }).split(" ");
    expect(both).toHaveLength(2);
    expect(new Set(both).size).toBe(2);
  });

  test("a class that is not an atom is kept rather than merged", () => {
    // An application's own class arrives through a `class` prop and has no
    // property in its name. Keyed on a slice of itself, two of them could
    // collide and one would vanish.
    const merged = atoms("promo", { color: "red" }, "promotion");
    expect(merged.split(" ")).toContain("promo");
    expect(merged.split(" ")).toContain("promotion");
  });

  test("a falsy argument contributes nothing", () => {
    expect(atoms({ color: "red" }, false, null, undefined)).toBe(atoms({ color: "red" }));
  });

  test("the same declaration anywhere is the same class", () => {
    expect(atoms({ color: "red" })).toBe(atoms({ color: "red" }));
    expect(atoms({ color: "red" })).not.toBe(atoms({ color: "blue" }));
  });

  /**
   * `margin` and `margin-top` are different properties, so without expansion
   * both would apply and the cascade would decide — the exact footgun atoms
   * remove.
   */
  test("a shorthand expands, so a longhand can replace one side of it", () => {
    const cls = atoms({ margin: "0 4px" }, { marginTop: 8 }).split(" ");
    const sides = cls.filter((name) => name.startsWith("a-margin-"));
    expect(sides).toHaveLength(4);
    const top = cls.find((name) => name.startsWith("a-margin-top_")) as string;
    expect(ruleFor(top)).toBe(`.${top}{margin-top:8px}`);
    const right = cls.find((name) => name.startsWith("a-margin-right_")) as string;
    expect(ruleFor(right)).toBe(`.${right}{margin-right:4px}`);
  });

  test("box expansion follows CSS's own 1/2/3/4 rule", () => {
    const one = atoms({ padding: 4 }).split(" ");
    expect(one).toHaveLength(4);
    const three = atoms({ padding: "1px 2px 3px" }).split(" ");
    const left = three.find((name) => name.startsWith("a-padding-left_")) as string;
    expect(ruleFor(left)).toBe(`.${left}{padding-left:2px}`);
  });

  test("a shorthand that cannot be expanded by counting is refused, by name", () => {
    expect(mergeable("border")).toBe(false);
    expect(mergeable("background")).toBe(false);
    expect(mergeable("margin")).toBe(true);
    expect(mergeable("marginTop")).toBe(true);
  });

  test("conditions get their own key, so `:hover` does not replace the base", () => {
    const cls = atoms({ color: { default: "red", ":hover": "blue" } }).split(" ");
    expect(cls).toHaveLength(2);
    const hover = cls.find((name) => ruleFor(name).includes(":hover")) as string;
    expect(ruleFor(hover)).toBe(`.${hover}:hover{color:blue}`);
  });

  test("an at-rule condition wraps, and `&` substitutes", () => {
    const [wide] = atoms({ color: { "@media (min-width: 600px)": "green" } }).split(" ");
    expect(ruleFor(wide)).toContain("@media (min-width: 600px){");
    const [nested] = atoms({ color: { ".dark &": "white" } }).split(" ");
    expect(ruleFor(nested)).toBe(`.dark .${nested}{color:white}`);
  });

  test("a number is px unless the property counts", () => {
    const [line] = atoms({ lineHeight: 2 }).split(" ");
    expect(ruleFor(line)).toBe(`.${line}{line-height:2}`);
    const [width] = atoms({ width: 2 }).split(" ");
    expect(ruleFor(width)).toBe(`.${width}{width:2px}`);
    const [zero] = atoms({ width: 0 }).split(" ");
    expect(ruleFor(zero)).toBe(`.${zero}{width:0}`);
  });

  test("a custom property is a declaration like any other", () => {
    const [cls] = atoms({ "--brand": "#3b82f6" }).split(" ");
    expect(cls).toStartWith("a-var-brand_");
    expect(ruleFor(cls)).toBe(`.${cls}{--brand:#3b82f6}`);
  });
});

describe("defineVars and createTheme", () => {
  const theme = defineVars({ brand: "#3b82f6", radius: "8px" });

  test("a token is a `var()` reference, so it crosses a module boundary as data", () => {
    expect(theme.brand).toMatch(/^var\(--brand-[0-9a-z]+\)$/);
    expect(collectCss()).toContain(`:root{--brand-`);
  });

  test("the same tokens anywhere are the same properties", () => {
    expect(defineVars({ brand: "#3b82f6", radius: "8px" }).brand).toBe(theme.brand);
    expect(defineVars({ brand: "#ef4444", radius: "8px" }).brand).not.toBe(theme.brand);
  });

  test("a theme redeclares only what it names", () => {
    const dark = createTheme(theme, { brand: "#60a5fa" });
    const rule = ruleFor(dark);
    expect(rule).toContain("--brand-");
    expect(rule).toContain("#60a5fa");
    expect(rule).not.toContain("--radius-");
  });

  test("a token used in a block is an ordinary value", () => {
    const card = css`
      color: ${theme.brand};
    `;
    expect(ruleFor(card)).toBe(`.${card}{color: ${theme.brand}}`);
  });
});

describe("variants", () => {
  const button = variants({
    base: "base",
    variants: {
      size: { sm: "size-sm", lg: "size-lg" },
      tone: { primary: "tone-primary", muted: "tone-muted" },
    },
    defaults: { size: "sm", tone: "primary" },
    compound: [{ when: { size: "lg", tone: "primary" }, use: "loud" }],
  });

  test("defaults apply, and base comes first so a variant can override it", () => {
    expect(button()).toBe("base size-sm tone-primary");
  });

  test("a selection replaces the default for that axis only", () => {
    expect(button({ size: "lg" })).toBe("base size-lg tone-primary loud");
  });

  test("a compound arm comes last, so it wins over the axes it refines", () => {
    expect(button({ size: "lg", tone: "muted" })).toBe("base size-lg tone-muted");
    expect(button({ size: "lg", tone: "primary" }).endsWith("loud")).toBe(true);
  });

  test("an absent axis with no default contributes nothing", () => {
    const plain = variants({ variants: { tone: { a: "x" } } });
    expect(plain()).toBe("");
    expect(plain({ tone: "a" })).toBe("x");
  });
});

/** StyleX's shape, over the same merge. */
describe("create", () => {
  const styles = create({
    root: { width: "100%", maxWidth: 800, minHeight: 40 },
    child: { backgroundColor: "black", marginBlock: "1rem" },
  });
  const colors = create({
    red: { backgroundColor: "red", borderColor: "darkred" },
    green: { backgroundColor: "lightgreen", borderColor: "darkgreen" },
  });

  test("each group is a class string", () => {
    expect(styles.root.split(" ")).toHaveLength(3);
    expect(styles.root).toContain("a-max-width_");
    expect(ruleFor(styles.root.split(" ")[1])).toContain("max-width:800px");
  });

  test("groups merge by property, in passing order", () => {
    const merged = atoms(colors.red, colors.green).split(" ");
    expect(merged.filter((name) => name.startsWith("a-background-color_"))).toHaveLength(1);
    expect(ruleFor(merged[0])).toContain("background-color:lightgreen");
  });

  // The replaced class keeps its POSITION and changes its value, which is what
  // a `Map` does and what atoms want: no class competes with another, so the
  // order of the list carries no meaning.
  test("a group merges against a plain object too", () => {
    const merged = atoms(colors.red, { backgroundColor: "blue" }).split(" ");
    const background = merged.filter((name) => name.startsWith("a-background-color_"));
    expect(background).toHaveLength(1);
    expect(ruleFor(background[0])).toContain("background-color:blue");
  });

  test("a conditional group is the ordinary shape", () => {
    const off: boolean = Math.random() < 0;
    expect(atoms(styles.root, off && colors.red)).toBe(styles.root);
    expect(atoms(styles.root, colors.red)).toContain(colors.red.split(" ")[0]);
  });

  test("a logical shorthand expands like a physical one", () => {
    const sides = styles.child.split(" ").filter((n) => n.startsWith("a-margin-block-"));
    expect(sides).toHaveLength(2);
  });
});

/**
 * Ordering, which specificity gives for free once nothing is layered.
 *
 * Atoms WERE emitted into cascade layers, and that took away the thing they
 * exist for: a layered rule loses to an unlayered one whatever the specificity,
 * so an application's `* { margin: 0 }` beat every `margin` atom on the page.
 */
/** What one cascade layer holds, out of the whole sheet. */
/**
 * Everything a layer holds, across the tier sub-layers it is split into.
 *
 * A layered atom goes into `<layer>.<tier>` so tier order is the cascade's
 * rather than the order two modules happened to register in. A test is about
 * the rules the layer holds, which is every sub-layer's contents in the order
 * they appear.
 */
function layerBody(name: string): string {
  const sheet = collectCss();
  const out: string[] = [];
  for (const tier of ["", ...TIERS]) {
    const open = `@layer ${tier === "" ? name : `${name}.${tier}`}{`;
    let from = 0;
    for (;;) {
      const at = sheet.indexOf(open, from);
      if (at < 0) break;
      const start = at + open.length;
      let depth = 1;
      let index = start;
      for (; index < sheet.length; index++) {
        if (sheet[index] === "{") depth++;
        else if (sheet[index] === "}" && --depth === 0) break;
      }
      out.push(sheet.slice(start, index));
      from = index;
    }
  }
  return out.join("");
}

describe("atoms > a rule about a child", () => {
  test("comes before the child's own rule, so the child wins the tie", () => {
    // Both are one class, so nothing but order separates them. Measured in a
    // browser: a field saying `& > * { width: 100% }` stretched a label that
    // asked for `width: fit-content`.
    const parent = atoms({ width: { "& > *": "100%" } });
    const child = atoms({ width: "fit-content" });
    const sheet = collectCss();
    expect(sheet.indexOf(`.${parent}`)).toBeLessThan(sheet.indexOf(`.${child}`));
  });

  test("and a condition about itself still comes after", () => {
    const base = atoms({ color: "olivedrab" });
    const hover = atoms({ color: { ":hover": "olivedrab" } });
    const sheet = collectCss();
    expect(sheet.indexOf(`.${base}`)).toBeLessThan(sheet.indexOf(`.${hover}`));
  });

  test("`&:has(> x)` is about itself, however deep the brackets go", () => {
    expect(tierOf('&:has(> [data-slot="field"])')).toBe(tierOf(":hover"));
    expect(tierOf("& > *")).toBeLessThan(tierOf("default"));
    expect(tierOf("& svg")).toBeLessThan(tierOf("default"));
  });
});

describe("atomsIn", () => {
  test("puts every atom in the layer it is given", () => {
    const classes = atomsIn("barq.ui", { color: "rebeccapurple", padding: { ":hover": 4 } });
    expect(classes).not.toBe("");
    const body = layerBody("barq.ui");
    for (const cls of classes.split(" ")) expect(body).toContain(`.${cls}`);
  });

  test("and neighbours share one block per tier rather than each writing it", () => {
    // A package with a thousand atoms wrote its layer's wrapper a thousand
    // times: 16 KB of the 110 KB the sheet weighed. One block per tier is the
    // most a layer can be split into, however many rules it holds.
    const sheet = collectCss();
    for (const tier of TIERS) {
      expect(sheet.split(`@layer barq.ui.${tier}{`).length - 1).toBeLessThanOrEqual(1);
    }
    // And the order is published once, before the first of them.
    expect(sheet.split(subLayerOrder("barq.ui")).length - 1).toBe(1);
    expect(sheet.indexOf(subLayerOrder("barq.ui"))).toBeLessThan(
      sheet.indexOf("@layer barq.ui.base{"),
    );
  });

  test("a tier is a sub-layer, so the order is the cascade's and not the bundler's", () => {
    // Tier order is what settles a base against the same property under an
    // at-rule, since `@media` adds no specificity — and emitting in tier order
    // settles it within ONE call and nowhere else. A group declared in another
    // module registered first, and three pairs on `@barqjs/ui`'s gallery were
    // decided the wrong way round because of it.
    atomsIn("barq.probe", { color: { "@media print": "black" } });
    atomsIn("barq.probe", { color: "white" });
    const sheet = collectCss();
    expect(sheet.indexOf("@layer barq.probe.base{")).toBeLessThan(
      sheet.indexOf("@layer barq.probe.media{"),
    );
    // Registered the other way round, and the cascade still puts base first.
    expect(sheet).toContain(subLayerOrder("barq.probe"));
  });

  test("the layer is part of the atom, so the same declaration is two classes", () => {
    // One class name cannot carry two different rules, and a layered rule and
    // an unlayered one are exactly that.
    const plain = atoms({ color: "papayawhip" });
    const layered = atomsIn("barq.ui", { color: "papayawhip" });
    expect(layered).not.toBe(plain);
    expect(layerBody("barq.ui")).not.toContain(`.${plain}`);
    expect(layerBody("barq.ui")).toContain(`.${layered}`);
  });

  test("and they still merge, because the key is the property", () => {
    const merged = atoms(atomsIn("barq.ui", { color: "tomato" }), { color: "olive" }).split(" ");
    expect(merged).toHaveLength(1);
    expect(ruleFor(merged[0] ?? "")).toBe(`.${merged[0] ?? ""}{color:olive}`);
  });

  test("a condition inside a layer keeps both", () => {
    const cls = atomsIn("barq.ui", { color: { "@media print": "black" } }).split(" ")[0] ?? "";
    expect(layerBody("barq.ui")).toContain(`@media print{.${cls}{color:black}}`);
  });
});

describe("layer", () => {
  test("binds the layer, and produces the classes `atomsIn` would", () => {
    const ui = layer("barq.ui");
    expect(ui({ color: "seagreen", paddingTop: 8 })).toBe(
      atomsIn("barq.ui", { color: "seagreen", paddingTop: 8 }),
    );
  });

  test("merges its arguments the way `atomsIn` does", () => {
    const ui = layer("barq.ui");
    const merged = ui({ color: "peru" }, { color: "sienna" }).split(" ");
    expect(merged).toHaveLength(1);
    expect(ruleFor(merged[0] ?? "")).toBe(`.${merged[0] ?? ""}{color:sienna}`);
  });
});

describe("createIn", () => {
  test("puts a group's atoms in the layer, and returns plain strings", () => {
    const shared = createIn("barq.ui", {
      ring: { outlineWidth: "3px" },
      flat: { boxShadow: "none" },
    });
    expect(shared).toEqual({
      ring: createIn("barq.ui", { ring: { outlineWidth: "3px" } }).ring,
      flat: createIn("barq.ui", { flat: { boxShadow: "none" } }).flat,
    });
    const body = layerBody("barq.ui");
    expect(body).toContain(`.${shared.ring}{outline-width:3px}`);
    expect(body).toContain(`.${shared.flat}{box-shadow:none}`);
  });

  test("a group composes into a later call, which is what it is for", () => {
    const ui = layer("barq.ui");
    const shared = createIn("barq.ui", { ring: { outlineWidth: "3px" } });
    const merged = ui(shared.ring, { outlineWidth: "1px" }).split(" ");
    expect(merged).toHaveLength(1);
    expect(ruleFor(merged[0] ?? "")).toBe(`.${merged[0] ?? ""}{outline-width:1px}`);
  });

  test("and `create` is the same groups unlayered", () => {
    expect(create({ a: { color: "orchid" } }).a).toBe(createIn("", { a: { color: "orchid" } }).a);
  });
});

describe("atoms > ordering", () => {
  test("nothing is wrapped in a cascade layer", () => {
    const classes = atoms({ color: "seagreen", padding: { ":hover": 2, "@media print": 3 } });
    expect(classes).not.toBe("");
    // Each atom's own rules rather than the whole sheet: `globalCss` is free to
    // write a layer, and did once a test in another file declared an order.
    for (const cls of classes.split(" ")) expect(ruleFor(cls)).not.toContain("@layer");
  });

  /** 0-1-0 against a reset's 0-0-0, which is the whole of it. */
  test("an atom outranks a universal reset on specificity", () => {
    expect(globalCss`* { margin: 0 }`).toBeUndefined();
    const [cls] = atoms({ marginTop: 4 }).split(" ");
    expect(ruleFor(cls)).toBe(`.${cls}{margin-top:4px}`);
    expect(collectCss()).toContain("*{margin: 0}");
  });

  /**
   * `@media` adds no specificity, so a base and the same property under one are
   * separated by order alone. Within a module, which is the only place two
   * atoms can meet, the tier decides it.
   */
  test("a media rule follows the base it refines", () => {
    const cls = atoms({ color: { default: "olive", "@media print": "maroon" } }).split(" ");
    const sheet = collectCss();
    expect(sheet.indexOf(`.${cls[0]}{`)).toBeLessThan(sheet.indexOf(`.${cls[1]}`));
  });
});

/**
 * StyleX's own documented examples, run.
 *
 * From `stylexjs.com/docs/learn/styling-ui/defining-styles` and
 * `/using-styles`. The effect has to match even though the mechanism does not:
 * they sort one stylesheet, we put every rule in a cascade layer.
 */
describe("parity with StyleX's documented behaviour", () => {
  test("a pseudo-class nests inside the property", () => {
    const cls = atoms({
      backgroundColor: { default: "lightblue", ":hover": "blue", ":active": "darkblue" },
    }).split(" ");
    expect(cls).toHaveLength(3);
    expect(ruleFor(cls[1])).toContain(":hover{background-color:blue}");
  });

  test("a pseudo-element is a top-level key holding a style object", () => {
    const [cls] = atoms({ "::placeholder": { color: "#999" } }).split(" ");
    expect(ruleFor(cls)).toBe(`.${cls}::placeholder{color:#999}`);
  });

  test("a media query nests as a condition", () => {
    const cls = atoms({ width: { default: 800, "@media (max-width: 800px)": "100%" } }).split(" ");
    expect(ruleFor(cls[0])).toBe(`.${cls[0]}{width:800px}`);
    expect(ruleFor(cls[1])).toContain("@media (max-width: 800px){");
  });

  /** "Multiple nesting levels combine media queries and pseudo-selectors." */
  test("conditions combine, and the at-rule wraps the selector", () => {
    const cls = atoms({
      color: {
        default: "black",
        "@media (min-width: 800px)": { default: "navy", ":hover": "blue" },
      },
    }).split(" ");
    expect(cls).toHaveLength(3);
    const combined = cls.find((name) => ruleFor(name).includes(":hover")) as string;
    expect(ruleFor(combined)).toBe(`@media (min-width: 800px){.${combined}:hover{color:blue}}`);
  });

  test("firstThatWorks repeats the declaration, best last", () => {
    const [cls] = atoms({
      position: firstThatWorks("sticky", "-webkit-sticky", "fixed"),
    }).split(" ");
    expect(ruleFor(cls)).toBe(`.${cls}{position:fixed;position:-webkit-sticky;position:sticky}`);
  });

  /** "Setting properties to `null` removes previously applied styles." */
  test("null removes what an earlier argument applied", () => {
    const base = atoms({ color: "red", padding: 4 });
    const cleared = atoms(base, { color: null });
    expect(base.split(" ").some((n) => n.startsWith("a-color_"))).toBe(true);
    expect(cleared.split(" ").some((n) => n.startsWith("a-color_"))).toBe(false);
    expect(cleared.split(" ").filter((n) => n.startsWith("a-padding-"))).toHaveLength(4);
  });

  test("null removes every longhand a shorthand set", () => {
    expect(atoms({ margin: 4 }, { margin: null })).toBe("");
  });

  test("false and undefined decline to add rather than remove", () => {
    const base = atoms({ color: "red" });
    expect(atoms(base, { color: false })).toBe(base);
    expect(atoms(base, { color: undefined })).toBe(base);
  });

  /** "Styles can be passed in as an array of styles." */
  test("an array of styles is an argument like any other", () => {
    const a = atoms({ color: "red" });
    const b = atoms({ color: "blue" });
    expect(atoms([a, b])).toBe(atoms(a, b));
    expect(props([a, b]).class).toBe(atoms(b));
    const off: boolean = Math.random() < 0;
    expect(atoms([a, off && b])).toBe(a);
  });

  /** "Order matters only at the callsite, not definition." */
  test("reversing the call site reverses which wins", () => {
    const base = atoms({ color: "red" });
    const highlighted = atoms({ color: "blue" });
    expect(ruleFor(atoms(base, highlighted))).toContain("color:blue");
    expect(ruleFor(atoms(highlighted, base))).toContain("color:red");
  });
});

/**
 * The two attributes an element takes, which is the form a dynamic style needs:
 * a value only known at run time cannot be in a class, so it becomes a custom
 * property the class reads.
 */
describe("props and dynamic", () => {
  const styles = create({ root: { padding: 8 } });
  const bg = dynamic((colour: string) => ({ backgroundColor: colour }));

  test("a static call is just the class, with no style attribute", () => {
    expect(props(styles.root)).toEqual({ class: styles.root });
  });

  test("a dynamic call carries the value in a custom property", () => {
    const applied = props(styles.root, bg("rebeccapurple"));
    expect(applied.style).toEqual({ [dynamicVar("background-color")]: "rebeccapurple" });
    expect(applied.class).toContain(styles.root);
  });

  /** A colour that changes every frame writes one property and no CSS. */
  test("changing the value produces no new class and no new rule", () => {
    const first = props(bg("red"));
    const sheet = collectCss();
    const second = props(bg("blue"));
    props(bg("green"));
    expect(second.class).toBe(first.class);
    expect(collectCss()).toBe(sheet);
    expect(ruleFor(first.class)).toContain(
      `background-color:var(${dynamicVar("background-color")})`,
    );
  });

  test("a later dynamic value replaces an earlier one, like any other atom", () => {
    const applied = props(bg("red"), bg("blue"));
    expect(
      applied.class.split(" ").filter((n) => n.startsWith("a-background-color_")),
    ).toHaveLength(1);
    expect(applied.style?.[dynamicVar("background-color")]).toBe("blue");
  });

  test("a static declaration still wins if it comes last", () => {
    const applied = props(bg("red"), { backgroundColor: "green" });
    const background = applied.class
      .split(" ")
      .find((name) => name.startsWith("a-background-color_")) as string;
    expect(ruleFor(background)).toContain("background-color:green");
  });
});
