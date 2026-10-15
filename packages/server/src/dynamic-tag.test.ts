/**
 * `dynamic`, the string half of `<Dynamic>` at `-Ox`, for a tag that is only
 * known at run time.
 *
 * RAW TEXT. A `<style>` or `<script>` body is written as it stands, the way
 * `ssrDynamic` writes it: the tokenizer decodes no entity inside one.
 *
 * THE NAME. The XML `Name` production admits names the HTML tokenizer does not
 * open a tag for: a `<` followed by anything but an ASCII letter is TEXT. The
 * element's attributes would then be text too, and an attribute value is
 * escaped for `&` and `"` only, so markup inside one would be live.
 */

import { expect, test } from "bun:test";

import { dynamic, ssrDynamic } from "./ssr.ts";

const markupOf = (value: unknown): string => String(value);

interface ParsedNode {
  tagName?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: ParsedNode[];
}

/** A conforming HTML parser: happy-dom opens a tag for `<_x`, a browser does not. */
async function elementsIn(markup: string): Promise<string[]> {
  const root = `${import.meta.dir}/../../..`;
  const found = [
    ...new Bun.Glob("node_modules/.bun/parse5@*/node_modules/parse5/dist/index.js").scanSync({
      cwd: root,
      dot: true,
    }),
  ][0];
  if (found === undefined) throw new Error("parse5 is not installed; this check needs it");
  const parse5 = (await import(`${root}/${found}`)) as {
    parseFragment: (source: string) => ParsedNode;
  };
  const out: string[] = [];
  const walk = (node: ParsedNode): void => {
    if (node.tagName !== undefined) out.push(node.tagName);
    for (const child of node.childNodes ?? []) walk(child);
  };
  walk(parse5.parseFragment(markup));
  return out;
}

test("a stylesheet reaches a dynamic <style> undecorated", () => {
  const css = "ul > li { color: red }";

  expect(markupOf(dynamic("style", { children: css }))).toBe(`<style>${css}</style>`);
  expect(markupOf(dynamic("style", { children: css }))).toBe(
    ssrDynamic({ component: "style", children: css }).t,
  );
});

test("a script reaches a dynamic <script> undecorated", () => {
  const source = "if (a < b && c > d) run()";

  expect(markupOf(dynamic("script", { children: source }))).toBe(`<script>${source}</script>`);
});

test("a script body cannot close its own element", () => {
  const source = 'const tag = "</script><img src=x onerror=alert(1)>"';

  expect(markupOf(dynamic("script", { children: source }))).toBe(
    '<script>const tag = "<\\/script><img src=x onerror=alert(1)>"</script>',
  );
});

test("a tag name the tokenizer reads as text does not turn an attribute into markup", async () => {
  const title = "<img src=x onerror=alert(1)>";
  let markup = "";
  try {
    markup = markupOf(dynamic("_x", { title }));
  } catch {
    // Refusing the name is one of the two acceptable answers.
  }

  expect(await elementsIn(markup)).not.toContain("img");
});

test("both spellings refuse a tag name that does not begin with an ASCII letter", () => {
  for (const name of ["_x", ":x", "1x", "\u00e9x"]) {
    expect(() => dynamic(name, {}), name).toThrow("is not a valid tag name");
    expect(() => ssrDynamic({ component: name }), name).toThrow("is not a valid tag name");
  }
  expect(markupOf(dynamic("x-card", { title: "ok" }))).toBe('<x-card title="ok"></x-card>');
});
