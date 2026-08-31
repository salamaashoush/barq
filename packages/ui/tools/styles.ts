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

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
      // A slot written as an object entry rather than a JSX attribute, which is
      // how a component that builds its props separately spells it. `Progress`
      // does, and was reported as having no element at all.
      /"data-slot":\s*"([a-z0-9-]+)"/g,
      // The same entry written as an accessor with a default, which is how a
      // component that lets a caller RENAME its slot spells it. `Calendar`
      // does, and reported as having no root element at all.
      /"data-slot":\s*\(\)\s*=>[^,\n]*\?\?\s*"([a-z0-9-]+)"/g,
      // A slot named through a PROP, because the element belongs to a
      // `@barqjs/aria` component rather than to this one: `underlaySlot` on a
      // modal's backdrop, `listSlot` on a select's list. Without this every
      // such element reported as reaching nothing.
      /[A-Za-z]+Slot="([a-z0-9-]+)"/g,
    ]) {
      for (const [, slot] of source.matchAll(pattern)) if (slot !== undefined) out.add(slot);
    }
  }
  if (out.size === 0) throw new Error(`no data-slot found under ${directory}`);
  return out;
}

/**
 * Where upstream and this package name the SAME element differently.
 *
 * These slot names came from shadcn's classic registry, which is what this
 * package transcribes; the styles are written against the new one, which
 * renamed some of them. An alias is the honest record of that, and it is much
 * smaller than renaming fifty components to match a registry they are not from.
 *
 * Only pairs that are genuinely one element. A name with no element here is
 * left unreachable and reported, because guessing at one would style the wrong
 * thing and look like the style being wrong.
 */
const ALIASES: Readonly<Record<string, string>> = {
  // The outer element IS the track here; the inner one is the filled part.
  "progress-track": "progress",
  "progress-value": "progress-indicator",
  // The fill is a gradient on the track rather than an element of its own,
  // which is what stopped the track's `overflow: hidden` cutting the thumb.
  "slider-range": "slider-track",
  "accordion-content-inner": "accordion-body",
  "calendar-caption": "calendar-month-caption",
  "combobox-list": "combobox-content",
  "radio-group-indicator-icon": "radio-group-indicator",
  // One control, whichever element it is.
  "input-group-input": "input-group-control",
  "input-group-textarea": "input-group-control",
  // Both are links, and the style is about the pair rather than the direction.
  "pagination-next": "pagination-link",
  "pagination-previous": "pagination-link",
  // The styles were written against upstream's Base UI registry, whose names
  // for the SAME elements differ from the components' own `data-slot`s. Each
  // of these is one element under two names, not a missing one.
  "dropdown-menu-subcontent": "dropdown-menu-sub-content",
  "context-menu-subcontent": "context-menu-sub-content",
  "command-input-group": "command-input-wrapper",
  "navigation-menu-popup": "navigation-menu-viewport",
  "navigation-menu-positioner": "navigation-menu-viewport-wrapper",
  // Upstream's drawer moved to Base UI, which names the panel a popup and the
  // grip a swipe handle. The elements are the same two.
  "drawer-popup": "drawer-content",
  "drawer-swipe-handle": "drawer-handle",
  "drawer-header-base": "drawer-header",
  "drawer-footer-base": "drawer-footer",
};

/** The three axes a style splits a slot on, and the attribute each is. */
const AXES = [
  ["variant", "data-variant"],
  ["size", "data-size"],
  ["orientation", "data-orientation"],
  // Placement, which a bubble's reactions and an input group's addon both
  // split on and neither writes as a variant.
  ["side", "data-side"],
  ["align", "data-align"],
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
  // `-aria` is upstream's other component base and `-logical` its
  // logical-property twin. Both style the SAME element this package renders, so
  // both resolve to the one slot rather than being reported as missing.
  const bare = name.replace(/-(?:aria|logical)$/, "");
  if (slots.has(bare)) return `[data-slot="${bare}"]`;

  const alias = ALIASES[bare];
  if (alias !== undefined && slots.has(alias)) return `[data-slot="${alias}"]`;

  for (const [axis, attribute] of AXES) {
    const at = bare.lastIndexOf(`-${axis}-`);
    if (at < 0) continue;
    const slot = bare.slice(0, at);
    const value = bare.slice(at + axis.length + 2);
    if (slots.has(slot)) return `[data-slot="${slot}"][${attribute}="${value}"]`;
  }

  // An axis whose value upstream appends with no axis word between:
  // `cn-separator-horizontal`, not `cn-separator-orientation-horizontal`.
  for (const [value, attribute] of [
    ["horizontal", "data-orientation"],
    ["vertical", "data-orientation"],
    ["default", "data-variant"],
    ["icon", "data-variant"],
  ] as const) {
    if (!bare.endsWith(`-${value}`)) continue;
    const slot = bare.slice(0, -value.length - 1);
    if (slots.has(slot)) return `[data-slot="${slot}"][${attribute}="${value}"]`;
  }

  return null;
}

/**
 * Every `data-slot` UPSTREAM'S OWN components render.
 *
 * A style ships rules for elements the pinned registry does not have: they
 * belong to components shadcn keeps elsewhere, or to a newer registry the
 * styles were written against. Counting those as this package's gap is wrong,
 * and listing them by hand rots the moment the checkout moves.
 */
function slotsUpstreamEmits(checkout: string): Set<string> {
  const out = new Set<string>();
  const directory = resolve(checkout, "apps/v4/registry/new-york-v4/ui");
  if (!existsSync(directory)) return out;
  for (const file of readdirSync(directory)) {
    if (!file.endsWith(".tsx")) continue;
    const source = readFileSync(join(directory, file), "utf8");
    for (const [, slot] of source.matchAll(/data-slot="([a-z0-9-]+)"/g)) {
      if (slot !== undefined) out.add(slot);
    }
  }
  return out;
}

/**
 * Where a class reaching nothing is a decision rather than a gap.
 *
 * The list is short on purpose: everything not here is work.
 */
const DIVERGENT: Record<string, string> = {
  "scroll-area-scrollbar":
    "the scroll area is the NATIVE scroller with `scrollbar-color` on it, " +
    "which is stated in the component and is why there are no scrollbar elements",
  "scroll-area-thumb": "as above",
  "select-scroll-up-button":
    "Radix needs these because its popper content does not scroll; the list " +
    "here is a real scroller with `overflow-y: auto`, and a fake arrow over a " +
    "native scrollbar is strictly worse than the scrollbar",
  "select-scroll-down-button": "as above",
  "menu-translucent": "a modifier a caller opts into, not a slot any menu always renders",
  "menu-translucent-aria": "as above",
};

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
  const theirs = slotsUpstreamEmits(resolve(process.cwd(), checkout));
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

  // Split three ways, because one number answering three questions answers
  // none of them. Only the first is work.
  const bare = [...unreachable].map((slot) => slot.replace(/^cn-/, "")).toSorted();
  const stripped = (slot: string): string => slot.replace(/-(aria|logical)$/, "");
  const decided = bare.filter((slot) => DIVERGENT[slot] !== undefined);
  const absent = bare.filter(
    (slot) => DIVERGENT[slot] === undefined && !theirs.has(stripped(slot)),
  );
  const gap = bare.filter((slot) => DIVERGENT[slot] === undefined && theirs.has(stripped(slot)));

  if (gap.length > 0) {
    process.stdout.write(
      `\n${String(gap.length)} classes reach nothing, and upstream renders the element:\n  ` +
        gap.join(" ") +
        "\n",
    );
  }
  if (absent.length > 0) {
    process.stdout.write(
      `\n${String(absent.length)} name elements the pinned registry does not render either, ` +
        `so they belong to components shadcn keeps outside it:\n  ` +
        absent.join(" ") +
        "\n",
    );
  }
  for (const slot of decided) {
    process.stdout.write(`\n${slot} is deliberate: ${DIVERGENT[slot] ?? ""}\n`);
  }

  if (missing > 0) process.exitCode = 1;
}

// Only when RUN. `parseStyle` is the half worth testing, and importing it must
// not translate three thousand classes first.
if (import.meta.main) await main();
