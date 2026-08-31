/**
 * `src/theme/base.ts`, from a shadcn/ui checkout.
 *
 * The components emit CSS that reads `--spacing`, `--text-sm`, `--ui-shadow`
 * and the rest, so something has to declare them. Tailwind declares them from
 * whichever utilities a project uses, and this asks it the same question for
 * the whole library at once: every class shadcn's components mention, compiled,
 * and the theme block, `@property` declarations, keyframes and preflight it
 * produced written out as the stylesheet this package installs.
 *
 * ```
 * bun run tools/base.ts ../../../vendor/ui
 * ```
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { candidatePattern, createBuilder, layerOf, print, type CssNode } from "./css.ts";

/**
 * shadcn's own `* { @apply border-border outline-ring/50 }`.
 *
 * Preflight sets `border: 0 solid` with no colour, so every `border` utility in
 * the library would draw in `currentColor` without this.
 */
const BORDER_DEFAULTS = `*, ::after, ::before, ::backdrop, ::file-selector-button {
  border-color: var(--border, currentColor);
  outline-color: var(--ring, currentColor);
}
@supports (color: color-mix(in lab, red, red)) {
  *, ::after, ::before, ::backdrop, ::file-selector-button {
    outline-color: color-mix(in oklab, var(--ring) 50%, transparent);
  }
}`;

/** Anything that could be a class. Tailwind decides which of them are. */
const TOKEN = /[a-zA-Z0-9_@:/[\]().,%#*+~>&='"$!?|-]{2,}/g;

function candidates(checkout: string): string[] {
  const directory = resolve(checkout, "apps/v4/registry/new-york-v4/ui");
  const found = new Set<string>();
  for (const entry of readdirSync(directory)) {
    if (!entry.endsWith(".tsx")) continue;
    const source = readFileSync(join(directory, entry), "utf8");
    for (const literal of source.match(/(["'`])(?:\\.|(?!\1)[\s\S])*\1/g) ?? []) {
      for (const token of literal.slice(1, -1).match(TOKEN) ?? []) found.add(token);
    }
  }
  return [...found].toSorted();
}

/**
 * Tailwind's preflight, as Tailwind emits it.
 *
 * shadcn's components are written against it — `button { background: transparent }`
 * and `img { display: block }` are load-bearing for how several of them look —
 * so it is transcribed rather than replaced with an opinion of our own.
 */
/** One block, inside the layer it belongs to. */
function layered(layer: string, body: string): string {
  const indented = body
    .split("\n")
    .map((line) => (line === "" ? line : `  ${line}`))
    .join("\n");
  return `@layer ${layer} {\n${indented}\n}`;
}

async function preflight(): Promise<CssNode[]> {
  const build = await createBuilder();
  return layerOf((await build([])).tree, "base");
}

async function main(): Promise<void> {
  const checkout = process.argv[2];
  if (checkout === undefined) throw new Error("usage: bun run tools/base.ts <shadcn-ui-checkout>");

  const build = await createBuilder();
  const all = candidates(checkout);

  // Two passes. A token that is not a utility still costs nothing on its own,
  // but it must not drag a theme variable into `:root` that nothing reads — so
  // the first pass finds which of them Tailwind had a rule for, and the second
  // asks the theme question of those alone.
  const probe = print((await build(all)).utilities);
  const real = all.filter((candidate) => candidatePattern(candidate).test(probe));
  const compiled = await build(real);

  const theme = [...compiled.theme.entries()]
    .map(([name, value]) => `  ${name}: ${value.replace(/\s+/g, " ")};`)
    .join("\n");

  /**
   * A keyframe set that animates to a height Radix publishes and nothing here
   * does. `animate-accordion-down` reads `--radix-accordion-content-height`,
   * which is measured by Radix's own JavaScript; this package collapses a panel
   * with `grid-template-rows` instead and needs no measurement, so shipping the
   * rule would be shipping a reference to a library that is not installed.
   */
  const foreign = (node: CssNode): boolean => print([node]).includes("--radix-");

  const dedupe = (nodes: readonly CssNode[]): CssNode[] => {
    const seen = new Set<string>();
    return nodes.filter((node) => {
      const key = print([node]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const parts = {
    preflight: print(await preflight()),
    theme: `:root, :host {\n${theme}\n}`,
    properties: print(dedupe(compiled.properties)),
    keyframes: print(dedupe(compiled.keyframes).filter((node) => !foreign(node))),
  };

  const module_ = (doc: string, blocks: readonly string[]): string =>
    [
      doc,
      ``,
      `import { globalCss } from "@barqjs/css";`,
      ``,
      `import "./layers.ts";`,
      ``,
      ...blocks.map(
        (body) => "globalCss`\n" + body.replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "\n`;\n",
      ),
    ].join("\n");

  writeFileSync(
    resolve(import.meta.dir, "../src/theme/reset.ts"),
    module_(
      [
        "/**",
        " * Tailwind's preflight, which shadcn's components are written against.",
        " *",
        " * GENERATED by `tools/base.ts`. Edit that, not this.",
        " *",
        " * Importing this module installs it, and it is a separate module for the",
        " * one case that matters: a component dropped into a page that already has",
        " * a reset wants the scale and not a second opinion on `margin`.",
        " *",
        " * `button { background: transparent }` and `img { display: block }` are",
        " * load-bearing rather than cosmetic — several components look wrong",
        " * without them — so this is transcribed rather than replaced.",
        " */",
      ].join("\n"),
      [layered("barq.reset", parts.preflight), layered("barq.reset", BORDER_DEFAULTS)],
    ),
  );

  writeFileSync(
    resolve(import.meta.dir, "../src/theme/base.ts"),
    module_(
      [
        "/**",
        " * The scale every component's CSS reads.",
        " *",
        " * GENERATED by `tools/base.ts`. Edit that, not this.",
        " *",
        " * Three blocks: the scale itself, which a theme may override; the",
        " * `@property` declarations behind `box-shadow` composition, which have to",
        " * be at the top level for a ring and a shadow on one element to add",
        " * rather than replace; and the keyframes `animate-spin` and",
        " * `animate-pulse` reference.",
        " *",
        " * The colour tokens are NOT here. Those are a theme, and `installTheme`",
        " * or the CLI's `init` puts one on the page.",
        " */",
      ].join("\n"),
      [layered("barq.base", parts.theme), parts.properties, parts.keyframes],
    ),
  );

  process.stdout.write(
    `${real.length} of ${all.length} candidates are utilities; ` +
      `${compiled.theme.size} theme variables, ` +
      `${dedupe(compiled.properties).length} properties, ` +
      `${dedupe(compiled.keyframes).filter((node) => !foreign(node)).length} keyframes\n`,
  );
}

await main();
