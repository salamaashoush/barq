import { describe, expect, test } from "bun:test";
import {
  atoms,
  atomsIn,
  collectCss,
  css,
  globalCss,
  keyframes,
  registerCss,
  setCssSink,
} from "./index.ts";

/** The rules a block registered, without its class name in the way. */
function rulesFor(name: string): string {
  const start = collectCss().indexOf(`.${name}`);
  return collectCss().slice(start).replaceAll(name, "X");
}

describe("css", () => {
  test("a flat block becomes one rule", () => {
    const name = css`
      color: red;
      padding: 8px;
    `;
    expect(rulesFor(name)).toStartWith(".X{color: red;padding: 8px}");
  });

  test("the class is stable for the same text and different for different text", () => {
    expect(css`
      color: red;
    `).toBe(css`
      color: red;
    `);
    expect(css`
      color: red;
    `).not.toBe(css`
      color: blue;
    `);
  });

  test("a runtime class is marked as one", () => {
    expect(css`
      color: tomato;
    `).toStartWith("r");
  });

  test("`&` takes the parent and a bare selector is a descendant", () => {
    const name = css`
      color: red;
      &:hover {
        color: blue;
      }
      span {
        color: green;
      }
    `;
    expect(rulesFor(name)).toStartWith(".X{color: red}.X:hover{color: blue}.X span{color: green}");
  });

  test("a comma list crosses against the parent", () => {
    const name = css`
      a,
      b {
        color: red;
      }
    `;
    expect(rulesFor(name)).toStartWith(".X a,.X b{color: red}");
  });

  test("a nested at-rule is hoisted and keeps the scope", () => {
    const name = css`
      color: red;
      @media (min-width: 600px) {
        color: blue;
      }
    `;
    expect(rulesFor(name)).toStartWith(".X{color: red}@media (min-width: 600px){.X{color: blue}}");
  });

  // A verbatim at-rule keeps the author's own whitespace, so this asserts the
  // structure rather than the spelling: `oxfmt` reflows the template above and
  // an exact-text assertion goes stale the next time it does.
  test("a rule that owns its contents is not scoped", () => {
    const name = css`
      @keyframes spin {
        from {
          rotate: 0deg;
        }
      }
    `;
    const sheet = collectCss().replace(/\s+/g, " ");
    expect(sheet).toContain("@keyframes spin{from { rotate: 0deg; }}");
    // No `.class` rule at all, which is the point: a keyframe selector is a
    // percentage and a parent class must not be crossed into it.
    expect(sheet).not.toContain(`.${name}{`);
  });

  /// The regex this replaces split on `;` and `{`, so either inside a string or
  /// a `url()` ended the declaration early.
  test("a string and a data URI keep their punctuation", () => {
    const name = css`
      content: "};{";
      background: url(data:image/svg+xml;base64,AA);
    `;
    expect(rulesFor(name)).toStartWith(
      '.X{content: "};{";background: url(data:image/svg+xml;base64,AA)}',
    );
  });

  test("an interpolation is joined, and a falsy one contributes nothing", () => {
    const gap = 8;
    const name = css`
      gap: ${gap}px;
      ${false} color: red
    `;
    expect(rulesFor(name)).toStartWith(".X{gap: 8px;color: red}");
  });
});

describe("keyframes and globalCss", () => {
  test("keyframes names the animation after its body", () => {
    const name = keyframes`from { opacity: 0 } to { opacity: 1 }`;
    expect(collectCss()).toContain(`@keyframes ${name}{from { opacity: 0 } to { opacity: 1 }}`);
  });

  test("globalCss keeps its own selectors and yields nothing", () => {
    expect(globalCss`body { margin: 0 }`).toBeUndefined();
    expect(collectCss()).toContain("body{margin: 0}");
  });

  test("a statement at-rule is emitted beside the rule, not inside it", () => {
    globalCss`
      @layer probe-one, probe-two;
      main { display: grid }
    `;
    expect(collectCss()).toContain("@layer probe-one, probe-two;");
    expect(collectCss()).not.toContain("{@layer probe-one");
  });

  test("a statement at-rule inside a block does not swallow the declarations", () => {
    const name = css`
      @import "probe.css";
      color: red;
    `;
    expect(collectCss()).toContain(`@import "probe.css";.${name}{color: red}`);
  });
});

describe("the sheet", () => {
  test("a block evaluated twice registers one rule", () => {
    const before = collectCss();
    const first = css`
      color: rebeccapurple;
    `;
    const after = collectCss();
    const again = css`
      color: rebeccapurple;
    `;
    expect(again).toBe(first);
    expect(collectCss()).toBe(after);
    expect(after.length).toBeGreaterThan(before.length);
  });
});

/**
 * The registry is what every environment shares, so these are the properties
 * the compiler's inline mode, `bun test` and a server render all depend on.
 */
describe("a cascade layer", () => {
  test("holds each rule once, however many modules brought it", () => {
    // The compiler emits a module's atoms with the module, and an atom two
    // modules both use arrives twice. Measured over `@barqjs/ui`: 1,955 rules
    // where 552 were distinct.
    registerCss("one", "@layer barq.probe{.shared{color:red}.only-one{color:blue}}");
    registerCss("two", "@layer barq.probe{.shared{color:red}.only-two{color:green}}");
    const sheet = collectCss();
    const layer = sheet.slice(sheet.indexOf("@layer barq.probe{"));
    expect(layer.split(".shared{color:red}").length - 1).toBe(1);
    expect(layer).toContain(".only-one{color:blue}");
    expect(layer).toContain(".only-two{color:green}");
  });

  test("and is written once, not once per module", () => {
    const sheet = collectCss();
    expect(sheet.split("@layer barq.probe{").length - 1).toBe(1);
  });
});

describe("registerCss", () => {
  test("an entry holding several layer blocks is gathered, not left where it was", () => {
    // The compiler emits a module's stylesheet as ONE registration, and a
    // module with several `ui()` calls gets several `@layer barq.ui{…}` blocks
    // inside it. Asking whether the entry IS a layer said no, so the whole
    // entry was written out at its registration position and its atoms escaped
    // the tier order — a plain `width: 100%` from a late module then beat a
    // `@media` width from an early one, with no error and nothing to see but a
    // panel at the wrong size.
    registerCss("early", "@layer barq.probe{@media (min-width:1px){.late{width:10px}}}");
    registerCss("theme", "@layer other{.between{color:red}}");
    registerCss("module", "@layer barq.probe{.a{width:100%}}@layer barq.probe{.b{color:blue}}");

    const sheet = collectCss();
    // One block per layer, and everything in it.
    expect(sheet.split("@layer barq.probe{").length - 1).toBe(1);
    expect(sheet).toContain(".a{width:100%}");
    expect(sheet).toContain(".b{color:blue}");
    // And they are INSIDE that block rather than trailing the layers registered
    // after it, which is where the whole entry used to be written out.
    expect(sheet.indexOf(".a{width:100%}")).toBeLessThan(sheet.indexOf("@layer other{"));
    expect(sheet.indexOf(".b{color:blue}")).toBeLessThan(sheet.indexOf("@layer other{"));
  });

  test("a module's rules arrive whole and are collectable", () => {
    registerCss("/a/card.tsx", ".b1{color:red}");
    expect(collectCss()).toContain(".b1{color:red}");
  });

  test("a module re-evaluated by HMR replaces its own rules rather than stacking", () => {
    registerCss("/a/hmr.tsx", ".b2{color:red}");
    registerCss("/a/hmr.tsx", ".b2{color:blue}");
    const sheet = collectCss();
    expect(sheet).toContain(".b2{color:blue}");
    expect(sheet).not.toContain(".b2{color:red}");
  });

  test("the document sheet is rewritten from the registry, so a replacement is visible", () => {
    registerCss("/a/doc.tsx", ".b3{color:red}");
    registerCss("/a/doc.tsx", ".b3{color:green}");
    const element = document.getElementById("barq-css");
    expect(element?.textContent).toContain(".b3{color:green}");
    expect(element?.textContent).not.toContain(".b3{color:red}");
  });

  test("a compiled block and an uncompiled one land in the same sheet", () => {
    registerCss("/a/mixed.tsx", ".bcompiled{color:red}");
    const runtime = css`
      color: papayawhip;
    `;
    const sheet = collectCss();
    expect(sheet).toContain(".bcompiled{color:red}");
    expect(sheet).toContain(`.${runtime}{color: papayawhip}`);
  });

  // A sink is how a server learns which rules its render produced AFTER it
  // serialised `<head>`. It used to TAKE them, and a module imported lazily
  // inside a request registers its own rules there — so they reached that one
  // response and no other, and every later request served the page with no
  // rules for its own layout. Measured on the dev server against
  // `/charts/area`: six blocks in the first response's late sheet, none after.
  test("a rule the sink records still reaches the sheet every request reads", () => {
    const taken: string[] = [];
    setCssSink((key, rules) => {
      taken.push(`${key} ${rules}`);
      return true;
    });
    registerCss("/a/lazy.tsx", ".blazy{color:blue}");
    setCssSink(null);

    expect(taken).toEqual(["/a/lazy.tsx .blazy{color:blue}"]);
    expect(collectCss()).toContain(".blazy{color:blue}");
  });

  test("a rule the sheet already holds is not offered to the sink again", () => {
    registerCss("/a/known.tsx", ".bknown{color:teal}");
    const taken: string[] = [];
    setCssSink((key) => {
      taken.push(key);
      return true;
    });
    registerCss("/a/known.tsx", ".bknown{color:teal}");
    setCssSink(null);
    expect(taken).toEqual([]);
  });
});

describe("the sheet > a brace inside a string", () => {
  test("closes nothing, so a layer holds its own rules and nobody else's", () => {
    const first = atomsIn("barq.quoted", { caretColor: "teal" });
    const plain = atoms({ caretColor: "olive" });
    const quoted = atomsIn("barq.quoted", { "::before": { content: '"}"' } });
    const sheet = collectCss();
    expect(sheet).toContain(
      `@layer barq.quoted{.${first}{caret-color:teal}.${quoted}::before{content:"}"}}`,
    );
    expect(sheet).toContain(`}.${plain}{caret-color:olive}`);
  });

  test("and a compiled module's stylesheet is split at the same places", () => {
    registerCss(
      "/a/quoted.tsx",
      '@layer barq.braces{.q1::after{content:"{"}}@layer barq.braces{/* } */.q2{color:red}}',
    );
    expect(collectCss()).toContain(
      '@layer barq.braces{.q1::after{content:"{"}/* } */.q2{color:red}}',
    );
  });
});

describe("the sheet > tier order across modules", () => {
  test("a module's atoms are ordered against another module's", () => {
    registerCss(
      "/a/tier-early.tsx",
      "@layer barq.tiers{@media (min-width:1px){.a-width-1x_m{width:10px}}}" +
        "@media (min-width:1px){.a-height-1x_m{height:10px}}",
    );
    registerCss(
      "/a/tier-late.tsx",
      "@layer barq.tiers{.a-width_b{width:100%}}.a-height_b{height:100%}",
    );
    const sheet = collectCss();
    expect(sheet.indexOf(".a-width_b{")).toBeLessThan(sheet.indexOf(".a-width-1x_m{"));
    expect(sheet.indexOf(".a-height_b{")).toBeLessThan(sheet.indexOf(".a-height-1x_m{"));
  });

  test("a rule that is not an atom keeps its place among them", () => {
    registerCss(
      "/a/pinned.tsx",
      "@layer barq.pinned{@media print{.a-color-p_1{color:red}}" +
        ".sr-only{position:absolute}.a-color_2{color:blue}}",
    );
    expect(collectCss()).toContain(
      "@layer barq.pinned{.a-color_2{color:blue}.sr-only{position:absolute}" +
        "@media print{.a-color-p_1{color:red}}}",
    );
  });

  test("every shape of atom sorts where the runtime would have put it", () => {
    registerCss(
      "/a/shapes.tsx",
      "@layer barq.shapes{" +
        "@media print{.a-color-m_1{color:red}}" +
        ".a-color-e_1::before{color:red}" +
        ".a-color-s_1:hover{color:red}" +
        ".dark .a-color-a_1{color:red}" +
        ".a-color_1{color:red}" +
        ".a-color-d_1 > *{color:red}" +
        "@media print{.a-color-n_1 svg{color:red}}}",
    );
    const sheet = collectCss();
    const names = ["d_1 > *", "n_1 svg", "color_1{", "s_1:hover", "a_1{", "e_1::before", "m_1{"];
    const found = names.map((name) => sheet.indexOf(name));
    expect(found).toEqual(found.toSorted((a, b) => a - b));
    expect(found.every((at) => at >= 0)).toBe(true);
  });

  test("an unlayered atom two modules both carry is written once", () => {
    registerCss("/a/twice-one.tsx", ".a-cursor_tw{cursor:pointer}");
    registerCss("/a/twice-two.tsx", ".a-cursor_tw{cursor:pointer}.plain-tw{color:red}");
    const sheet = collectCss();
    expect(sheet.split(".a-cursor_tw{cursor:pointer}").length - 1).toBe(1);
  });
});

describe("keyframes and css > the same text", () => {
  test("is a block and an animation, and each has its rule", () => {
    const block = css`
      to {
        opacity: 0.25;
      }
    `;
    const animation = keyframes`
      to { opacity: 0.25 }
    `;
    const sheet = collectCss();
    expect(sheet).toContain(`.${block} to{opacity: 0.25}`);
    expect(sheet).toContain(`@keyframes ${animation}{to { opacity: 0.25 }}`);
  });
});

describe("globalCss > a declaration with no selector", () => {
  test("has nothing to apply to, so it writes no rule", () => {
    globalCss`
      color: fuchsia;
      .probe-global { color: teal }
    `;
    const sheet = collectCss();
    expect(sheet).toContain(".probe-global{color: teal}");
    expect(sheet).not.toContain("{color: fuchsia}");
  });
});
