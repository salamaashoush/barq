import {
  For,
  Match,
  Repeat,
  Show,
  Switch,
  cell,
  element,
  props,
  render,
  type Cell,
  type JSXElement,
  type Scope,
} from "@barqjs/core";
import { describe, expect, test } from "bun:test";

import { renderToString } from "./server.ts";
import {
  SsrHtml,
  attr,
  cls,
  clsList,
  content,
  esc,
  escapeAttribute,
  escapeText,
  html,
  isSsrHtml,
  raw,
  rawText,
  spreadAttrs,
  ssrDynamic,
  ssrFor,
  ssrMatch,
  ssrRepeat,
  ssrShow,
  ssrSwitch,
} from "./ssr.ts";

/**
 * The string backend's oracle is `renderToString`: the same value applied
 * through `createElement` and serialised by `innerHTML`. Where a test below
 * compares against `oracleText`/`oracleAttr` it is asserting exactly that
 * seam — an escaper that disagrees with the serialiser is a dual-render
 * failure, and one that under-escapes is an XSS hole.
 */
function oracleText(value: unknown): string {
  return renderToString(() => element(null, "p", { children: value as never })).replace(
    /^<p>|<\/p>$/g,
    "",
  );
}

function oracleAttr(value: unknown): string {
  const markup = renderToString(() => element(null, "p", { title: value }));
  const match = /^<p title="([\s\S]*)"><\/p>$/.exec(markup);
  return match ? match[1] : markup;
}

const HOSTILE = [
  '<img src=x onerror="alert(1)">',
  '" onmouseover="alert(1)" data-x="',
  "a & b &amp; c &#38; d",
  "</p><script>alert(1)</script>",
  "]]> --> &lt; <!--",
  "\u{1F600}\u{20B9E}",
  "a b",
  "a b c",
  "'single' \"double\"",
  ">>>><<<<&&&&",
  "",
];

describe("escaping", () => {
  test("text escaping matches what the DOM path serialises", () => {
    for (const value of HOSTILE) {
      expect(escapeText(value)).toBe(oracleText(value));
    }
  });

  test("attribute escaping matches what the DOM path serialises", () => {
    for (const value of HOSTILE) {
      expect(escapeAttribute(value)).toBe(oracleAttr(value));
    }
  });

  test("the three contexts escape different characters", () => {
    // `"` is inert in text and fatal in an attribute; `<`/`>` the reverse.
    expect(escapeText('a "q" <b> &')).toBe('a "q" &lt;b&gt; &amp;');
    expect(escapeAttribute('a "q" <b> &')).toBe("a &quot;q&quot; <b> &amp;");
    // Raw text escapes nothing at all: `&amp;` inside <style> is four literal
    // characters to the tokenizer, so escaping there corrupts the content.
    expect(rawText(".a::after { content: '>' } /* & */")).toBe(
      ".a::after { content: '>' } /* & */",
    );
  });

  /**
   * The escapers are a manual scan with an `indexOf` probe in front of it, so
   * they have boundaries a regex does not: the probe's length gate, the prefix
   * slice before the first hit, the tail after the last one, and the join
   * between two adjacent hits. This corpus puts an escapable character at each
   * of those boundaries, at every length either side of the gate — and holds
   * the answer to `renderToString` of the same value, which is the oracle the
   * whole SSR backend is compared against.
   */
  function boundaryCorpus(): string[] {
    const filler = "abcdefghij";
    const out: string[] = [""];
    for (const length of [1, 2, 3, 7, 8, 16, 31, 32, 33, 40, 64, 100, 200]) {
      const clean = filler.repeat(Math.ceil(length / filler.length)).slice(0, length);
      out.push(clean);
      // `\u` escapes, not the characters: U+00A0 is invisible, and an editor
      // that normalises it to a space silently deletes a sixth of this table.
      for (const ch of ["&", "<", ">", "\u00a0", '"', "'"]) {
        const mid = length >> 1;
        out.push(ch + clean.slice(1));
        out.push(clean.slice(0, -1) + ch);
        out.push(clean.slice(0, mid) + ch + clean.slice(mid + 1));
        out.push(ch + clean.slice(2) + ch);
        out.push(clean.slice(0, -2) + ch + ch);
        out.push(ch + ch + clean.slice(2));
        out.push(clean.replaceAll(/[aeiou]/g, ch));
        // A surrogate pair either side of the escape, so a slice that cut on a
        // code UNIT rather than a code POINT leaves a lone half behind.
        out.push(`${clean.slice(0, mid)}\u{1f600}${ch}\u{1d54f}${clean.slice(mid)}`);
      }
    }
    return out;
  }

  const BOUNDARIES = boundaryCorpus();

  test("the escapers agree with the serialiser at every scan boundary", () => {
    expect(BOUNDARIES.length).toBeGreaterThan(600);
    for (const value of BOUNDARIES) {
      expect(escapeText(value), `text: ${JSON.stringify(value)}`).toBe(oracleText(value));
      expect(escapeAttribute(value), `attr: ${JSON.stringify(value)}`).toBe(oracleAttr(value));
    }
  });

  test("and never split a surrogate pair or drop a code point", () => {
    const points = (s: string): number => Array.from(s).length;
    const lone = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
    for (const value of BOUNDARIES) {
      const pairs = points(value) - points(value.replaceAll(/[\u{10000}-\u{10ffff}]/gu, ""));
      for (const escaped of [escapeText(value), escapeAttribute(value)]) {
        expect(lone.test(escaped), `lone surrogate in ${JSON.stringify(value)}`).toBe(false);
        expect(
          points(escaped) - points(escaped.replaceAll(/[\u{10000}-\u{10ffff}]/gu, "")),
          `astral count for ${JSON.stringify(value)}`,
        ).toBe(pairs);
      }
    }
  });

  test("a clean string longer than the probe gate comes back identical", () => {
    // The one branch that returns the input rather than a rebuilt string. It has
    // to be the SAME string, not an equal one, or every long text hole on a page
    // allocates a copy of itself.
    const long = "the quick brown fox jumps over the lazy dog".repeat(4);
    expect(escapeText(long)).toBe(long);
    expect(escapeAttribute(long)).toBe(long);
    expect(escapeText(long)).toBe(oracleText(long));
    expect(escapeAttribute(long)).toBe(oracleAttr(long));
  });

  test("a non-BMP character survives the escape unchanged", () => {
    // Surrogate pairs are two UTF-16 units; a per-unit escaper splits them.
    const astral = "\u{1D54F}\u{1F600}\u{20B9E}";
    expect(escapeText(astral)).toBe(astral);
    expect(escapeAttribute(astral)).toBe(astral);
    expect(escapeText(astral).match(/./gu)?.length).toBe(3);
  });

  test("a no-break space becomes an entity in text and stays raw in an attribute", () => {
    // Both agree with the serialiser behind `renderToString`, which is what a
    // dual render compares against; the two spellings parse to one character.
    expect(escapeText("a b")).toBe("a&nbsp;b");
    expect(escapeText("a b")).toBe(oracleText("a b"));
    expect(escapeAttribute("a b")).toBe("a b");
    expect(escapeAttribute("a b")).toBe(oracleAttr("a b"));
  });

  test("esc mirrors what a child position does with the same value", () => {
    for (const value of [null, undefined, true, false, 0, 42, -1.5, "", "x"]) {
      expect(esc(value)).toBe(oracleText(value));
    }
    expect(esc(["a", "<b>", 1])).toBe("a&lt;b&gt;1");
    expect(esc(() => "<b>")).toBe("&lt;b&gt;");
    expect(esc(10n)).toBe("10");
  });

  test("markup the compiler produced passes through and user data never does", () => {
    expect(esc(html("<b>bold</b>"))).toBe("<b>bold</b>");
    expect(esc(raw("<b>bold</b>"))).toBe("<b>bold</b>");
    expect(esc("<b>bold</b>")).toBe("&lt;b&gt;bold&lt;/b&gt;");
    // A branded value nested in an array is markup too.
    expect(esc([html("<i>a</i>"), "<i>b</i>"])).toBe("<i>a</i>&lt;i&gt;b&lt;/i&gt;");
    expect(isSsrHtml(html("x"))).toBe(true);
    expect(isSsrHtml("x")).toBe(false);
    expect(String(html("<b>x</b>"))).toBe("<b>x</b>");
    expect(html("x")).toBeInstanceOf(SsrHtml);
  });

  test("a real DOM node from a fallback module reaches the wire as markup", () => {
    const node = element(null, "b", { class: "c", children: "hi" }) as Node;
    expect(esc(node)).toBe('<b class="c">hi</b>');
    // …and the node is not consumed: it is cloned, not moved.
    expect((node as Element).textContent).toBe("hi");
  });
});

describe("attributes", () => {
  test("attr reproduces setElementAttr's add/remove semantics", () => {
    expect(attr("id", "x")).toBe(' id="x"');
    expect(attr("id", null)).toBe("");
    expect(attr("id", undefined)).toBe("");
    expect(attr("disabled", true)).toBe(' disabled=""');
    expect(attr("disabled", false)).toBe("");
    expect(attr("tabindex", 0)).toBe(' tabindex="0"');
    expect(attr("title", () => "lazy")).toBe(' title="lazy"');
  });

  test("a hostile attribute value cannot escape its quotes", () => {
    for (const value of HOSTILE) {
      const written = attr("title", value);
      if (written === "") continue;
      expect(written).toBe(` title="${oracleAttr(value)}"`);
      // Exactly two quotes: the delimiters. Anything else is an escape.
      expect(written.split('"').length - 1).toBe(2);
    }
  });

  test("names that never describe an attribute write nothing", () => {
    for (const name of [
      "ref",
      "key",
      "children",
      "onClick",
      "onclick",
      "indeterminate",
      "innerHTML",
      "innerText",
      "textContent",
      "dangerouslySetInnerHTML",
    ]) {
      expect(attr(name, "anything")).toBe("");
    }
  });

  test("DOM_PROPS names reach the wire as the attribute they reflect to", () => {
    // Written as a PROPERTY on the client, so only what it reflects to survives
    // as markup — and `value` is the one whose answer depends on the element.
    expect(attr("value", "hi", "input")).toBe("");
    expect(attr("value", "hi", "textarea")).toBe("");
    expect(attr("value", "hi", "option")).toBe(' value="hi"');
    expect(attr("value", "hi", "button")).toBe(' value="hi"');
    expect(attr("defaultValue", "hi", "input")).toBe(' value="hi"');
    expect(attr("defaultChecked", true, "input")).toBe(' checked=""');
    expect(attr("readOnly", true, "input")).toBe(' readonly=""');
    expect(attr("disabled", true, "input")).toBe(' disabled=""');
    expect(attr("multiple", true, "select")).toBe(' multiple=""');
    expect(attr("checked", true, "input")).toBe("");
    expect(attr("selected", true, "option")).toBe("");
    expect(attr("indeterminate", true, "input")).toBe("");

    // …and each of those answers is what the DOM path actually serialises.
    for (const [tag, name, value] of [
      ["input", "value", "hi"],
      ["input", "checked", true],
      ["input", "defaultValue", "hi"],
      ["input", "defaultChecked", true],
      ["input", "readOnly", true],
      ["input", "disabled", true],
      ["input", "indeterminate", true],
      ["select", "multiple", true],
      ["option", "selected", true],
      ["option", "value", "hi"],
    ] as Array<[string, string, unknown]>) {
      const oracle = renderToString(() => element(null, tag, { [name]: value }) as never);
      expect(oracle, `${tag}.${name}`).toBe(
        `<${tag}${attr(name, value, tag)}></${tag}>`.replace("></input>", ">"),
      );
    }
  });

  test("class goes through classToString and style through the kebab + px rule", () => {
    expect(attr("class", "a b")).toBe(' class="a b"');
    expect(attr("className", ["a", "", "b"])).toBe(' class="a b"');
    expect(attr("class", { a: true, b: false, c: 1 })).toBe(' class="a c"');
    expect(attr("class", null)).toBe("");
    expect(attr("classList", { a: true, b: false })).toBe(' class="a"');
    expect(attr("style", "color: red")).toBe(' style="color: red"');
    expect(attr("style", { fontSize: 12, zIndex: 3, opacity: 0.5, lineHeight: 2 })).toBe(
      ' style="font-size: 12px; z-index: 3; opacity: 0.5; line-height: 2;"',
    );
    // 0 is unitless whatever the property, matching setStylePropDirect.
    expect(attr("style", { margin: 0 })).toBe(' style="margin: 0;"');
    expect(attr("style", { color: null, width: false })).toBe("");
  });

  test("a style value cannot break out of its quotes", () => {
    expect(attr("style", 'color: red" onload="x')).toBe(' style="color: red&quot; onload=&quot;x"');
    expect(attr("class", '" onload="x')).toBe(' class="&quot; onload=&quot;x"');
  });

  test("cls joins every piece of a class into one attribute", () => {
    expect(cls("base", { on: true }, ["x", "y"])).toBe(' class="base on x y"');
    expect(cls(null, undefined)).toBe("");
    expect(cls("a", () => "b")).toBe(' class="a b"');
  });

  test("an empty class is present, an absent one is not, and classList is neither", () => {
    // The DOM path assigns `""` to `className` — which leaves `class=""` on the
    // element — and calls `removeAttribute` only for nullish and `false`. The
    // string backend used to omit the attribute for both, so `class={() => ""}`
    // rendered one attribute on the client and none on the server.
    expect(attr("class", "")).toBe(' class=""');
    expect(attr("class", () => "")).toBe(' class=""');
    expect(attr("class", [])).toBe(' class=""');
    expect(attr("class", {})).toBe(' class=""');
    expect(attr("class", false)).toBe("");
    expect(attr("class", undefined)).toBe("");
    expect(cls(null, undefined, "")).toBe(' class=""');
    expect(cls(null, clsList({ a: false }))).toBe("");

    // `classList` writes tokens or nothing at all: `diffClassList` toggles the
    // keys of an OBJECT and does nothing whatever with a string or an array, so
    // no token means no attribute rather than an empty one.
    expect(attr("classList", { a: false })).toBe("");
    expect(attr("classList", "a b")).toBe("");
    expect(attr("classList", ["a", "b"])).toBe("");
    expect(clsList({ a: false })).toBeNull();
    expect(clsList("a b")).toBeNull();
    expect(clsList({ a: true, b: () => true })).toBe("a b");
    expect(cls("k", clsList({ hit: true }))).toBe(' class="k hit"');
  });

  test("…and the line between them is the ORACLE's, not this file's", () => {
    // Every expectation above states what `attr` answers. That is a claim about
    // this module, and a module can be confidently wrong: the string backend
    // omitted `class` for `""` and for `null` alike, and a table of `toBe`s
    // written next to it would have agreed with it.
    //
    // `createElement` through the real runtime is the specification. Each value
    // here is applied as a prop and the resulting element SERIALISED, so the
    // question asked is the only one that matters — would a browser given the
    // markup have the element the client builds?
    const wrong: string[] = [];
    for (const name of ["class", "className", "classList"]) {
      for (const value of [
        "",
        "a b",
        [],
        ["a", "b"],
        {},
        { a: false },
        { a: true, b: false },
        false,
        null,
        undefined,
        0,
      ] as unknown[]) {
        const oracle = renderToString(() => element(null, "div", { [name]: value }) as never);
        const string = `<div${attr(name, value, "div")}></div>`;
        if (oracle !== string) {
          wrong.push(`${name}=${JSON.stringify(value)}: DOM ${oracle} vs string ${string}`);
        }
      }
    }
    expect(wrong, "the string backend disagrees with the DOM about a class").toEqual([]);

    // Both answers are really reached, so neither clause is vacuous — and the
    // empty one is the one that regressed.
    expect(renderToString(() => element(null, "div", { class: "" }) as never)).toBe(
      '<div class=""></div>',
    );
    expect(renderToString(() => element(null, "div", { class: null }) as never)).toBe(
      "<div></div>",
    );
    expect(renderToString(() => element(null, "div", { classList: {} }) as never)).toBe(
      "<div></div>",
    );
  });

  test("spreadAttrs writes the object in its own key order", () => {
    expect(spreadAttrs({ id: "a", class: "b", onClick: () => {}, children: "no" })).toBe(
      ' id="a" class="b"',
    );
    expect(spreadAttrs(() => ({ id: "a" }))).toBe(' id="a"');
    expect(spreadAttrs(null)).toBe("");
    expect(spreadAttrs({ title: '"><script>' })).toBe(' title="&quot;><script>"');
  });

  test("content owns the child position and only innerHTML is raw", () => {
    expect(content("innerHTML", "<b>x</b>")).toBe("<b>x</b>");
    expect(content("dangerouslySetInnerHTML", { __html: "<b>x</b>" })).toBe("<b>x</b>");
    expect(content("dangerouslySetInnerHTML", {})).toBe("");
    expect(content("textContent", "<b>x</b>")).toBe("&lt;b&gt;x&lt;/b&gt;");
    expect(content("innerText", "a & b")).toBe("a &amp; b");
    expect(content("innerHTML", null)).toBe("");
  });
});

describe("the six string-inlinable flow components", () => {
  const row = (_s: unknown, item: { n: string }, index: () => number) =>
    html(`<li>${index()}: ${esc(item.n)}</li>`);

  test("ssrFor reproduces For's rows, keys and fallback", () => {
    const rows = [{ n: "a" }, { n: "<b>" }];
    expect(ssrFor(null, { each: rows, children: row }).toString()).toBe(
      "<li>0: a</li><li>1: &lt;b&gt;</li>",
    );
    expect(ssrFor(null, { each: () => rows, children: row }).toString()).toBe(
      "<li>0: a</li><li>1: &lt;b&gt;</li>",
    );
    expect(ssrFor(null, { each: [], fallback: "none", children: row }).toString()).toBe("none");
    expect(ssrFor(null, { each: null, children: row }).toString()).toBe("");
    // A key FUNCTION hands the row its item as an ACCESSOR.
    const boxed = ssrFor(null, {
      each: rows,
      keyed: cell((item: { n: string }) => item.n),
      children: ((_s: unknown, item: () => { n: string }) =>
        html(`<li>${esc(item().n)}</li>`)) as never,
    });
    expect(boxed.toString()).toBe("<li>a</li><li>&lt;b&gt;</li>");
    // `keyed: false` is the positional mode, whose row item is an accessor.
    const unkeyed = ssrFor(null, {
      each: rows,
      keyed: false,
      children: ((_s: unknown, item: () => { n: string }) =>
        html(`<li>${esc(item().n)}</li>`)) as never,
    });
    expect(unkeyed.toString()).toBe("<li>a</li><li>&lt;b&gt;</li>");
  });

  test("a BARE key function carried by a spread is told apart from a Cell by its arity", () => {
    // §3.0 rule 1, on the seam where it is load-bearing. `<For {...opts}>`
    // splices `opts` into the source list verbatim, so `props.keyed` is the key
    // function itself and not a Cell carrying one. Reading it the way a Cell is
    // read calls it with no row, and `row.id` throws on `undefined`. `For`
    // draws the line at the parameter a key function declares and a Cell never
    // does; the string backend has to draw it in the same place.
    const rows = [
      { id: "x", n: "a" },
      { id: "y", n: "b" },
    ];
    const seen: unknown[] = [];
    const keyed = (item: { id: string }) => {
      seen.push(item);
      return item.id;
    };
    const carrier = props([
      { each: rows },
      { keyed },
      {
        children: ((_s: unknown, item: () => { n: string }) =>
          html(`<li>${esc(item().n)}</li>`)) as never,
      },
    ]) as never;

    // A key function selects the BOXED row shape, where `children` takes its
    // item as an accessor. Getting that wrong renders `[object Object]` or
    // throws, so the markup is the observation.
    expect(ssrFor(null, carrier).toString()).toBe("<li>a</li><li>b</li>");
    expect(seen, "the key function was never invoked as if it were a Cell").toEqual([]);

    // The detector. Reading the same carrier the way a Cell is read — call it,
    // take the result — is what `ssrFor` used to do, and it is a TypeError on
    // the first row rather than a wrong string.
    expect(() => (carrier as { keyed: () => unknown }).keyed()).toThrow();
  });

  test("ssrFor keyed={false} hands the item as an accessor and the index as a number", () => {
    const seen: number[] = [];
    const out = ssrFor(null, {
      each: ["a", "b"],
      keyed: false,
      children: ((_s: unknown, item: () => string, index: number) => {
        seen.push(index);
        return html(`<i>${esc(item())}</i>`);
      }) as never,
    });
    expect(out.toString()).toBe("<i>a</i><i>b</i>");
    expect(seen).toEqual([0, 1]);
    expect(
      ssrFor(null, { each: [], keyed: false, fallback: "empty", children: row }).toString(),
    ).toBe("empty");
  });

  test("ssrRepeat counts from `from` and falls back at zero", () => {
    expect(ssrRepeat(null, { count: 3, children: (_s, i) => html(`<i>${i}</i>`) }).toString()).toBe(
      "<i>0</i><i>1</i><i>2</i>",
    );
    expect(
      ssrRepeat(null, {
        count: () => 2,
        from: 5,
        children: (_s, i) => html(`<i>${i}</i>`),
      }).toString(),
    ).toBe("<i>5</i><i>6</i>");
    expect(ssrRepeat(null, { count: 0, fallback: "none", children: () => "" }).toString()).toBe(
      "none",
    );
    expect(ssrRepeat(null, { count: -1, children: () => "x" }).toString()).toBe("");
  });

  test("ssrShow branches, and passes the value the way Show does", () => {
    expect(ssrShow(null, { when: true, children: html("<b>y</b>") }).toString()).toBe("<b>y</b>");
    expect(ssrShow(null, { when: 0, fallback: "no", children: "yes" }).toString()).toBe("no");
    expect(
      ssrShow(null, { when: () => "v", children: (_s, v: unknown) => esc(v) }).toString(),
    ).toBe("v");
    // Non-keyed narrows to an accessor.
    expect(
      ssrShow(null, {
        when: "v",
        keyed: false,
        children: (_s, v: unknown) => esc((v as () => unknown)()),
      }).toString(),
    ).toBe("v");
    // A body that is user data is still escaped.
    expect(ssrShow(null, { when: true, children: "<b>" }).toString()).toBe("&lt;b&gt;");
  });

  test("ssrSwitch picks the first truthy Match and falls back", () => {
    const children = [
      ssrMatch(null, { when: false, children: "a" }),
      ssrMatch(null, { when: () => "hit", children: (_s, v: unknown) => esc(v) }),
      ssrMatch(null, { when: true, children: "c" }),
    ];
    expect(ssrSwitch(null, { children }).toString()).toBe("hit");
    expect(ssrSwitch(null, { children: [], fallback: "none" }).toString()).toBe("none");
    expect(
      ssrSwitch(null, { children: [ssrMatch(null, { when: 0, children: "a" })] }).toString(),
    ).toBe("");
    // Identity, exactly as the client component is.
    const props = { when: 1, children: "x" };
    expect(ssrMatch(null, props)).toBe(props);
  });

  /**
   * K7, in its strongest form: a client-rendered page contains ZERO framework
   * comment nodes, so the two backends now agree BYTE FOR BYTE and there is no
   * difference for this suite to know about. Until M4 every control-flow
   * component spliced a `<!--Name:n-->` marker PAIR into the live parent so its
   * `renderEffect` could find its own range again; `branch`/`each`/`boundary`
   * receive `(parent, anchor)` instead and the pair is gone. The assertion that
   * used to strip the markers now asserts they are absent.
   */
  test("each string implementation matches the DOM component's markup", () => {
    const rows = [{ n: "a" }, { n: "<b>" }];
    const cases: Array<[string, () => unknown]> = [
      [
        ssrFor(null, { each: rows, children: row }).toString(),
        () =>
          For<{ n: string }, JSXElement>(null, {
            each: () => rows,
            children: (_s: Scope | null, item: { n: string }, index: Cell<number>) =>
              element(null, "li", { children: `${index()}: ${item.n}` }),
          }),
      ],
      [
        ssrFor(null, {
          each: rows,
          keyed: false,
          children: ((_s: unknown, item: () => { n: string }, index: number) =>
            html(`<li>${index}: ${esc(item().n)}</li>`)) as never,
        }).toString(),
        () =>
          For<{ n: string }, JSXElement>(null, {
            each: () => rows,
            keyed: false,
            children: (_s: Scope | null, item: Cell<{ n: string }>, index: number) =>
              element(null, "li", { children: `${index}: ${item().n}` }),
          }),
      ],
      [
        ssrRepeat(null, { count: 2, children: (_s, i) => html(`<li>${i}</li>`) }).toString(),
        () =>
          Repeat(null, {
            count: 2,
            children: (_s, i) => element(null, "li", { children: String(i) }),
          }),
      ],
      [
        ssrShow(null, { when: true, children: html("<i>on</i>") }).toString(),
        () => Show(null, { when: () => true, children: element(null, "i", { children: "on" }) }),
      ],
      [
        ssrSwitch(null, {
          children: [ssrMatch(null, { when: true, children: html("<i>m</i>") })],
        }).toString(),
        () =>
          Switch(null, {
            children: [
              Match(null, {
                when: () => true,
                children: () => element(null, "i", { children: "m" }),
              }),
            ],
          }),
      ],
    ];
    for (const [string, dom] of cases) {
      const rendered = renderToString(dom as never);
      expect(rendered).not.toContain("<!--");
      expect(string).toBe(rendered);
    }
  });
});

describe("the two SSR strategies compose", () => {
  test("renderToString returns compiled markup without touching the DOM", () => {
    expect(renderToString(() => html('<div class="c">x</div>') as never)).toBe(
      '<div class="c">x</div>',
    );
  });

  test("a DOM-backend module renders a string-compiled component's markup", () => {
    // The direction the brand exists for: a fallback module builds real nodes
    // and one of its children is markup a string-compiled module produced.
    const container = document.createElement("div");
    render(
      element(null, "section", { children: html('<b class="x">bold</b>') as never }),
      container,
    );
    expect(container.innerHTML).toBe('<section><b class="x">bold</b></section>');
    expect(container.querySelector("b")?.className).toBe("x");
  });

  test("and it is not inserted as escaped text", () => {
    const container = document.createElement("div");
    render(element(null, "section", { children: "<b>bold</b>" }) as never, container);
    expect(container.innerHTML).toBe("<section>&lt;b&gt;bold&lt;/b&gt;</section>");
  });
});

// ---------------------------------------------------------------------------
// the three M6-review holes
// ---------------------------------------------------------------------------

describe("the brand cannot be forged", () => {
  /**
   * The brand decides whether a value is written as MARKUP or escaped as text,
   * which makes it a trust boundary. It used to be a plain property tested with
   * `in`, so any object `JSON.parse` produced carried it — and the same
   * predicate is wired into five value→node funnels in `dom.ts`, so a
   * deserialised API response reaching `<div>{value}</div>` became live
   * elements on the CLIENT as well as on the wire.
   */
  const forged = JSON.parse('{"__barqSsrHtml":true,"t":"<img src=x onerror=alert(1)>"}') as unknown;

  test("a JSON-shaped object is user data, on the string path", () => {
    expect(isSsrHtml(forged)).toBe(false);
    expect(esc(forged)).not.toContain("<img");
  });

  test("and on the DOM path, where it would be a client-side injection", () => {
    // Before the brand was a registered symbol this rendered a live
    // `<img onerror>`; an unbranded object is now what it always was —
    // a value with no node meaning, stringified into a text node.
    const markup = renderToString(() => element(null, "div", { children: forged as never }));
    expect(markup).not.toContain("<img");
    expect(markup).toBe("<div>[object Object]</div>");
  });

  test("a brand carrying no string is not markup either", () => {
    const half = { [Symbol.for("barq.ssr.html")]: true } as unknown;
    expect(isSsrHtml(half)).toBe(false);
    // `esc` used to return `undefined` here, which interpolates as the literal
    // text `undefined`.
    expect(typeof esc(half)).toBe("string");
  });

  test("what the compiler produces is still markup", () => {
    expect(isSsrHtml(html("<b>x</b>"))).toBe(true);
    expect(esc(html("<b>x</b>"))).toBe("<b>x</b>");
  });
});

describe("an attribute NAME is data only in a spread, and is refused there", () => {
  /**
   * `setAttribute` answers an invalid name with `InvalidCharacterError` and
   * writes nothing, so a string backend that wrote the bytes would turn one
   * hostile key into three attributes — markup the DOM path cannot produce.
   */
  test("a key that is not a valid attribute name throws rather than writing", () => {
    expect(() => spreadAttrs({ "x onload=alert(1) y": "1" }, "div")).toThrow(
      /not a valid attribute name/,
    );
    expect(() => spreadAttrs({ 'a"b': "1" }, "div")).toThrow();
    expect(() => spreadAttrs({ "a><img src=x>": "v" }, "div")).toThrow();
    expect(() => spreadAttrs({ "a b": "1" }, "div")).toThrow();
    expect(() => attr("bad name", "1", "div")).toThrow();
  });

  test("the DOM path refuses the same names, which is why refusing is parity", () => {
    for (const name of ["x onload=alert(1) y", 'a"b', "a><img src=x>"]) {
      expect(() => document.createElement("div").setAttribute(name, "1")).toThrow();
    }
  });

  /**
   * M6 gave `Dynamic` a string implementation, and with it the SECOND position
   * where a name is runtime data: the TAG. `component={"div onload=alert(1)"}`
   * writes two attributes into markup where `document.createElement` throws
   * `InvalidCharacterError` and writes nothing, so the string path refuses it
   * for exactly the reason `spreadAttrs` refuses a key.
   */
  test("a dynamic TAG is a name too, and is refused on the same production", () => {
    expect(() => ssrDynamic(null, { component: "div onload=alert(1)", children: "x" })).toThrow(
      /not a valid tag name/,
    );
    expect(() => ssrDynamic(null, { component: "a><img src=x>", children: "x" })).toThrow();
    // The DOM half of this parity is NOT asserted here, and that is deliberate:
    // `document.createElement` throws `InvalidCharacterError` on a name outside
    // the `Name` production in every real engine, and happy-dom implements no
    // such check — it hands back an `HTMLUnknownElement` called
    // `div onload=alert(1)`. Asserting against the fake DOM would pin the fake
    // DOM's gap. The attribute half above IS asserted, because happy-dom does
    // implement `setAttribute`'s check.

    // And a legitimate one still writes, through the same attribute policy every
    // other hole on this backend goes through.
    expect(ssrDynamic(null, { component: "section", class: "c", children: "<b>" }).toString()).toBe(
      '<section class="c">&lt;b&gt;</section>',
    );
    expect(ssrDynamic(null, { component: "br" }).toString()).toBe("<br>");
  });

  test("the accept cache cannot launder a name, and is bounded", () => {
    // Names that pass are remembered so the `Name` production is not re-derived
    // per attribute per row. Only the ACCEPTING answer is cached and the map is
    // capped, so a spread of untrusted keys can neither get one past the check
    // nor make the process grow a map entry per request.
    for (let i = 0; i < 2000; i++) expect(attr(`data-x${i}`, "1", "div")).toBe(` data-x${i}="1"`);
    expect(() => attr("bad name", "1", "div")).toThrow(/not a valid attribute name/);
    expect(() => spreadAttrs({ "x onload=alert(1) y": "1" }, "div")).toThrow();
    expect(attr("data-x0", "2", "div")).toBe(' data-x0="2"');
  });

  test("and every legitimate name still writes", () => {
    expect(spreadAttrs({ "data-x": "1", ariaLabel: "y", viewBox: "0 0 1 1" }, "div")).toBe(
      ' data-x="1" ariaLabel="y" viewBox="0 0 1 1"',
    );
    // A name that writes nothing is never validated: `removeAttribute` does not
    // validate either, so nullish and `false` come off before the check.
    expect(spreadAttrs({ "bad name": null, "worse name": false }, "div")).toBe("");
  });
});

describe("raw text has no escaping, so the close sequence is neutralised", () => {
  test("a value cannot end its own element", () => {
    expect(rawText("</script><img src=x>", "script")).toBe("<\\/script><img src=x>");
    expect(rawText("</STYLE ><img src=x>", "style")).toBe("<\\/STYLE ><img src=x>");
    // Only the OWNING tag's close sequence: everything else is content.
    expect(rawText("if (a</b) {}", "script")).toBe("if (a</b) {}");
    expect(rawText("</script>", "style")).toBe("</script>");
  });

  test("`<!--` is neutralised in script data and left alone in CSS", () => {
    // Script data is the only state `<!--` changes, and a following `<script`
    // there makes `</script>` stop closing the element.
    expect(rawText("<!--<script></script>", "script")).toBe("<\\!--<script><\\/script>");
    // `<!--` is a legal CDO token in CSS.
    expect(rawText("<!-- .a {} -->", "style")).toBe("<!-- .a {} -->");
  });

  test("an unknown owner neutralises every close tag", () => {
    expect(rawText("</b>x")).toBe("<\\/b>x");
  });

  test("content that closes nothing is untouched, including the common case", () => {
    expect(rawText("var a = 1; if (a < 2) {}", "script")).toBe("var a = 1; if (a < 2) {}");
    expect(rawText(".card::after { content: '>' }", "style")).toBe(".card::after { content: '>' }");
    // No entity escaping, in either direction — the tokenizer decodes nothing.
    expect(rawText("a &amp; b", "style")).toBe("a &amp; b");
  });

  test("the neutralised bytes really do stay inside the element", () => {
    const host = document.createElement("div");
    host.innerHTML = `<script class="probe">${rawText('</script><img src=x onerror="alert(1)">', "script")}</script>`;
    expect(host.children.length).toBe(1);
    expect(host.querySelectorAll("img").length).toBe(0);
  });
});
