import { describe, expect, test } from "bun:test";
import { collectCss, css, globalCss, keyframes, registerCss } from "./index.ts";

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
    expect(
      css`
        color: red;
      `,
    ).toBe(
      css`
        color: red;
      `,
    );
    expect(
      css`
        color: red;
      `,
    ).not.toBe(
      css`
        color: blue;
      `,
    );
  });

  test("a runtime class is marked as one", () => {
    expect(
      css`
        color: tomato;
      `,
    ).toStartWith("r");
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
});
