/**
 * shadcn's eight styles, as eight stylesheets this package can serve.
 *
 * ```
 * bun run tools/styles.ts ../ui
 * ```
 *
 * Upstream publishes each style as one CSS file of semantic classes, every one
 * of them an `@apply` of a Tailwind class list:
 *
 *     .cn-button-variant-ghost { @apply hover:bg-muted hover:text-foreground; }
 *
 * Which is the same input `specs/*.json` holds and the same translation
 * `transcribe.ts` runs, so the whole of a style goes through `css.ts` unchanged.
 * What comes out is the file upstream would have shipped if it were not written
 * in Tailwind: ordinary nested CSS, in `@layer barq.ui`, scoped by the style's
 * own class so an application can hold more than one.
 *
 * A utility that resolves to nothing is REPORTED rather than dropped, because a
 * missing rule is invisible: the component simply loses part of its look.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { createBuilder, translate } from "./css.ts";

const LAYER = "barq.style";

/**
 * The slots this package's components actually put on an element.
 *
 * Read from the source rather than listed, so a component added tomorrow is
 * covered without this file being edited, and a slot RENAMED stops matching
 * loudly instead of quietly styling nothing.
 */
function slotsWeEmit(root: string): Set<string> {
  const out = new Set<string>();
  const directory = resolve(root, "src/ui");
  for (const file of readdirSync(directory)) {
    if (!file.endsWith(".tsx") || file.endsWith(".test.tsx")) continue;
    const source = readFileSync(join(directory, file), "utf8");
    for (const pattern of [
      /(?:uiProps|controlProps)\(\s*"([a-z0-9-]+)"/g,
      /data-slot="([a-z0-9-]+)"/g,
      /data-slot=\{[^}]*\?\?\s*"([a-z0-9-]+)"/g,
    ]) {
      for (const [, slot] of source.matchAll(pattern)) if (slot !== undefined) out.add(slot);
    }
  }
  if (out.size === 0) throw new Error(`no data-slot found under ${directory}`);
  return out;
}

/** The three axes a style splits a slot on, and the attribute each is. */
const AXES = [
  ["variant", "data-variant"],
  ["size", "data-size"],
  ["orientation", "data-orientation"],
] as const;

/**
 * `cn-button-variant-ghost` as the selector that reaches OUR button.
 *
 * Upstream writes the look against a semantic class it puts on the element;
 * this package puts a `data-slot` on every element instead, and has since
 * before any of this existed. They name the same thing, so a style needs no
 * component change at all — only a selector that says `[data-slot="button"]`
 * where upstream says `.cn-button`.
 *
 * `null` means the class names something this package has no element for, which
 * is reported rather than dropped: a style silently missing a third of its
 * rules looks like a style that does not work.
 */
export function selectorFor(cn: string, slots: ReadonlySet<string>): string | null {
  const name = cn.replace(/^cn-/, "");

  // A base-ui twin of a slot we already have. Upstream ships two component
  // bases and styles both; the markup this package renders is one of them.
  const bare = name.replace(/-aria$/, "");
  if (slots.has(bare)) return `[data-slot="${bare}"]`;

  for (const [axis, attribute] of AXES) {
    const at = bare.lastIndexOf(`-${axis}-`);
    if (at < 0) continue;
    const slot = bare.slice(0, at);
    const value = bare.slice(at + axis.length + 2);
    if (slots.has(slot)) return `[data-slot="${slot}"][${attribute}="${value}"]`;
  }

  return null;
}

/** `.cn-slot { @apply … }` blocks, as slot to class list. */
export function parseStyle(source: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [, slot, body] of source.matchAll(
    /^ {2}\.(cn-[a-z0-9-]+)\s*\{\s*([\s\S]*?)\s*\}\s*$/gm,
  )) {
    const applied = [...(body ?? "").matchAll(/@apply\s+([^;]+);/g)]
      .map((match) => (match[1] ?? "").split(/\s+/).filter(Boolean).join(" "))
      .join(" ")
      .trim();
    if (slot !== undefined && applied !== "") out.set(slot, applied);
  }
  return out;
}

function indent(text: string, by: string): string {
  return text
    .split("\n")
    .map((line) => (line === "" ? line : `${by}${line}`))
    .join("\n");
}

async function main(): Promise<void> {
  const checkout = process.argv[2] ?? "../ui";
  const from = resolve(process.cwd(), checkout, "apps/v4/registry/styles");
  const into = resolve(import.meta.dir, "../styles");
  mkdirSync(into, { recursive: true });

  const build = await createBuilder();
  const ours = slotsWeEmit(resolve(import.meta.dir, ".."));
  const unreachable = new Set<string>();
  let missing = 0;

  for (const file of readdirSync(from).toSorted()) {
    if (!file.startsWith("style-") || !file.endsWith(".css")) continue;
    const name = basename(file, ".css").replace(/^style-/, "");
    const slots = parseStyle(readFileSync(join(from, file), "utf8"));

    const rules: string[] = [];
    let unmatched = 0;
    for (const [slot, classes] of slots) {
      const selector = selectorFor(slot, ours);
      if (selector === null) {
        unmatched++;
        unreachable.add(slot);
        continue;
      }
      const result = await translate(build, classes);
      if (result.unknown.length > 0) {
        missing += result.unknown.length;
        process.stderr.write(`  ${name}/${slot}: NOT A UTILITY: ${result.unknown.join(" ")}\n`);
      }
      if (result.css.trim() === "") continue;
      rules.push(`${selector} {\n${indent(result.css, "  ")}\n}`);
    }
    void unmatched;

    const body = indent(rules.join("\n\n"), "    ");
    const sheet =
      `/* ${slots.size} classes from shadcn/ui's registry/styles/${file}.\n` +
      ` * Generated by tools/styles.ts. Do not edit. */\n` +
      `@layer ${LAYER} {\n  .style-${name} {\n${body}\n  }\n}\n`;

    writeFileSync(join(into, `${name}.css`), sheet);
    process.stdout.write(
      `${name}: ${String(rules.length)} of ${String(slots.size)} classes reach an element, ` +
        `${(sheet.length / 1024).toFixed(1)} KB\n`,
    );
  }

  // Named, not counted. A style is missing a rule because this package has no
  // element for it, and the list is the work left rather than an error.
  if (unreachable.size > 0) {
    process.stdout.write(
      `\n${String(unreachable.size)} classes reach nothing here, ` +
        `because no component renders the slot they name:\n  ` +
        [...unreachable].toSorted().join(" ") +
        "\n",
    );
  }

  if (missing > 0) process.exitCode = 1;
}

// Only when RUN. `parseStyle` is the half worth testing, and importing it must
// not translate three thousand classes first.
if (import.meta.main) await main();
