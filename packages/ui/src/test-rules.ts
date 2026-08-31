/**
 * What the stylesheet says about a set of classes.
 *
 * The suite asserts on the RULES a component produced rather than on the class
 * names it produced, because the names are hashes and the rules are the look.
 * That was one lookup per class while a class was a whole block; a class is one
 * declaration now, so the unit is the LIST a component puts on its element.
 *
 * The package's rules are all in one cascade layer, so the layer's contents are
 * split into top-level statements and the ones naming a class are kept. An
 * at-rule comes with its rule, which is what lets a test say `@media` or
 * `:hover` and mean it.
 */

import { collectCss } from "@barqjs/css";

/** The contents of the package's cascade layer, however many blocks it is in. */
function layerBody(sheet: string): string {
  const open = "@layer barq.ui{";
  const out: string[] = [];
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
  return out.join("");
}

/** One string per top-level rule or at-rule. */
function statements(body: string): string[] {
  const out: string[] = [];
  let from = 0;
  let depth = 0;
  for (let index = 0; index < body.length; index++) {
    if (body[index] === "{") depth++;
    else if (body[index] === "}" && --depth === 0) {
      out.push(body.slice(from, index + 1));
      from = index + 1;
    }
  }
  return out;
}

/**
 * The rules a class LIST produced.
 *
 * An atom writes `color:red` where a block wrote `color: red`, and a test is
 * about the declaration rather than the spacing, so the bodies are normalised.
 */
export function rulesFor(classes: string): string {
  const names = classes.split(" ").filter((name) => name !== "");
  if (names.length === 0) return "";
  return statements(layerBody(collectCss()))
    .filter((chunk) => names.some((name) => new RegExp(`\\.${name}(?![\\w-])`).test(chunk)))
    .join("\n")
    .replaceAll(/\{([^{}]*)\}/g, (_, body: string) => `{${body.replaceAll(/:\s*/g, ": ")}}`);
}
