/**
 * What the stylesheet says about a set of classes.
 *
 * The suite asserts on the RULES a component produced rather than on the class
 * names it produced, because the names are hashes and the rules are the look.
 * That was one lookup per class while a class was a whole block; a class is one
 * declaration now, so the unit is the LIST a component puts on its element.
 *
 * The package's rules are all in one cascade layer, split into a sub-layer per
 * tier, so every sub-layer's contents are gathered and then split into
 * top-level statements, and the ones naming a class are kept. An at-rule comes
 * with its rule, which is what lets a test say `@media` or `:hover` and mean
 * it.
 */

import { collectCss, TIERS } from "@barqjs/css";

/**
 * The contents of the package's cascade layer, across the tier sub-layers it is
 * split into.
 *
 * A layered atom goes into `barq.ui.<tier>` so tier order is the cascade's
 * rather than the order two modules happened to register in. A test is about
 * the RULES the layer holds, so every sub-layer's contents count as its body.
 */
function layerBody(sheet: string): string {
  const out: string[] = [];
  // `""` is the layer itself, which a hand-written `@layer barq.ui { … }` in a
  // `css` block writes to. Its content OUTRANKS every sub-layer, because
  // un-layered content inside a layer beats that layer's nested layers, and
  // `srOnly` is written that way on purpose.
  for (const tier of ["", ...TIERS]) {
    const open = tier === "" ? "@layer barq.ui{" : `@layer barq.ui.${tier}{`;
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
