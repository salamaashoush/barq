/**
 * Every rule shadcn's class lists produce, checked against what this package
 * ships.
 *
 * `transcribe.ts` turns a class list into CSS; this runs the same translation
 * over every entry in `specs/` and asserts each declaration it produces is
 * somewhere in the stylesheet the components register. A rule that was never
 * pasted, one lost to an edit, and one whose value drifted all look the same
 * from the outside — the component is simply missing part of the look — and
 * none of them fails a test that asserts on the rules it knows about.
 *
 * ```
 * bun run tools/verify.ts            # every spec
 * bun run tools/verify.ts button     # one
 * ```
 *
 * Deliberate divergences are listed in `ALLOWED`, each with the reason. That
 * list is the whole record of where this package does not match upstream.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { byCall, canonical, declarations } from "./sheet.ts";
import { createBuilder, parse, translate } from "./css.ts";

/** Where this package deliberately differs, and why. */
const ALLOWED: Record<string, string> = {
  "slider:slider-track:overflow":
    "the thumb is a CHILD of the track here, so `overflow: hidden` clipped a " +
    "12px thumb down to the track's 4px. Upstream's thumb is a SIBLING and the " +
    "rule is there to clip its `<SliderRange>` to the rounded ends; the fill " +
    "is a gradient the track paints here and needs no clipping",
  "sidebar:sidebar-container:height":
    "`inset-block: 0` already says as tall as my containing block, and for a " +
    "fixed element with no contained ancestor that IS the viewport — so the " +
    "two agree wherever `h-svh` was right. Inside anything establishing a " +
    "containing block for fixed descendants, a viewport unit is the one thing " +
    "containment cannot redirect, and the sidebar came out a window tall in a " +
    "shorter panel with its footer below the fold",
  "chart:chart:aspect-ratio":
    "the scene is drawn by TanStack Charts, not Recharts. Every rule in " +
    "upstream's class list past `flex text-xs` selects a `.recharts-*` class " +
    "that no element here carries, and the aspect ratio is the container's " +
    "own decision rather than the chart's",
  "chart:chart:justify-content": "as above",
  "chart:chart:fill": "as above",
  "chart:chart:stroke": "as above",
  "chart:chart:outline-style": "as above",
  "chart:chart:--ui-outline-style": "as above",
  "chart:chart-grid-line:stroke":
    "the scene is drawn by TanStack Charts and a node's paint arrives as a " +
    "presentation attribute rather than a class, so the token reaches the " +
    'element as `stroke="var(--border)"`. The value is upstream\'s; the ' +
    "carrier is not, and a class on an element the renderer owns would be " +
    "overwritten on the next scene",
  "chart:chart-axis-label:fill": 'as above, as `fill="var(--muted-foreground)"`',
  "navigation-menu:navigation-menu-viewport:height":
    "`--radix-navigation-menu-viewport-height` is measured and written by " +
    "Radix's own script. This component measures the open panel itself and " +
    "publishes `--barq-viewport-height` and `--barq-viewport-width`, which is " +
    "the same two numbers under this package's names",
  "navigation-menu:navigation-menu-viewport:width": "as above",
  "scroll-area:scroll-area-viewport:width":
    "there is no viewport, no scrollbar and no thumb: this is the NATIVE " +
    "scroller with `scrollbar-color` on it, which did not exist when Radix's " +
    "component was written. The component states the trade — a native " +
    "scrollbar cannot overlay content or fade out — and `tools/styles.ts` " +
    "names the two scrollbar slots as deliberate for the same reason",
  "scroll-area:scroll-area-viewport:height": "as above",
  "scroll-area:scroll-area-viewport:border-radius": "as above",
  "scroll-area:scroll-area-scrollbar:padding": "as above",
  "scroll-area:scroll-area-scrollbar:transition-property": "as above",
  "scroll-area:scroll-area-scrollbar:-webkit-user-select": "as above",
  "scroll-area:scroll-area-scrollbar:user-select": "as above",
  "scroll-area:scroll-area-scrollbar:height": "as above",
  "scroll-area:scroll-area-scrollbar:border-top-color": "as above",
  "scroll-area:scroll-area-scrollbar:width": "as above",
  "scroll-area:scroll-area-scrollbar:border-left-color": "as above",
  "scroll-area:scroll-area-thumb:flex": "as above",
  "slider:slider-range:height":
    "there is no `<SliderRange>` element. `@barqjs/aria`'s track renders one " +
    "child per THUMB and nothing to be a range, and it does not need one: the " +
    "start and end are two custom properties, so the fill is a gradient the " +
    "TRACK paints. `slider.tsx` says so where the gradient is written",
  "slider:slider-range:width": "as above",
  "slider:slider-thumb:position":
    "the thumb is a CHILD of the track here rather than a sibling, so it is " +
    "absolutely positioned against the track — `position: relative` on it " +
    "would put every thumb at the track's start",
  "accordion:accordion-content:animation":
    "`animate-accordion-down` and `-up` read " +
    "`--radix-accordion-content-height`, which Radix's own JavaScript measures " +
    "and writes. This panel collapses with `grid-template-rows: 0fr` to `1fr`, " +
    "which needs no measurement and no script; `tools/base.ts` drops the two " +
    "keyframes for the same reason, since shipping them would ship a " +
    "reference to a library that is not installed",
  "combobox:combobox-content:max-width":
    "the combobox is the one component upstream ships from Base UI rather than " +
    "Radix, so its class list reads Base's `--available-width`, " +
    "`--anchor-width` and `--available-height`. `@barqjs/aria`'s positioner " +
    "writes the same three measurements as `--barq-available-width`, " +
    "`--barq-trigger-width` and `--barq-available-height`",
  "combobox:combobox-content:min-width": "as above, `--barq-trigger-width`",
  "combobox:combobox-list:max-height": "as above, `--barq-available-height`",
  "combobox:combobox-content:position":
    "the panel is a `<Popover>` here rather than a positioner of the " +
    "combobox's own, and the popover is already the containing block its " +
    "children are placed against",
  "combobox:combobox-content:margin":
    "the search row is `<Command>`'s input, not an `<InputGroup>` the combobox " +
    "places inside its panel, so the rules upstream writes ABOUT that group " +
    "belong to the input's own class",
  "combobox:combobox-content:margin-bottom": "as above",
  "combobox:combobox-content:height": "as above",
  "combobox:combobox-content:border-color": "as above",
  "combobox:combobox-content:background-color": "as above",
  "combobox:combobox-content:--ui-shadow": "as above",
  "combobox:input-group-button:display":
    "a rule ABOUT the input group's button, which this combobox does not " +
    "render: the clear control is the chip's own remove button",
  "combobox:combobox-chip-input:min-width":
    "the chips box opens its list from a `<Button>` rather than a bare input, " +
    "so the width belongs to `chipsTrigger`, which carries it",
  "select:select-scroll-up-button:z-index":
    "there are no scroll buttons. Radix needs them because its popper content " +
    "does not scroll; the list here is a real scroller with `overflow-y: auto`, " +
    "and a fake arrow over a native scrollbar is strictly worse than the " +
    "scrollbar. `PORTING.md` records it and `tools/styles.ts` names the two " +
    "slots as deliberate",
  "select:select-scroll-up-button:justify-content": "as above",
  "select:select-scroll-up-button:background-color": "as above",
  "select:select-scroll-down-button:z-index": "as above",
  "select:select-scroll-down-button:justify-content": "as above",
  "select:select-scroll-down-button:background-color": "as above",
  "dropdown-menu:dropdown-menu-content:max-height":
    "`--radix-dropdown-menu-content-available-height` is Radix's name for the " +
    "room the positioner measured; `@barqjs/aria` writes the same number as " +
    "`--barq-available-height`. Same measurement, this package's name",
  "dropdown-menu:dropdown-menu-content:width": "as above, `--barq-trigger-width`",
  "context-menu:context-menu-content:max-height": "as above",
  "menubar:menubar-content:max-height": "as above",
  "menubar:menubar-content:width": "as above",
  "select:select-content:max-height": "as above",
  "combobox:combobox-content:max-height": "as above",
  "combobox:combobox-content:width": "as above",
  "dropdown-menu:dropdown-menu-content:transform-origin":
    "as `popover-content` below, a rule per `data-placement`",
  "dropdown-menu:dropdown-menu-sub-content:transform-origin": "as above",
  "context-menu:context-menu-content:transform-origin": "as above",
  "context-menu:context-menu-sub-content:transform-origin": "as above",
  "menubar:menubar-content:transform-origin": "as above",
  "menubar:menubar-sub-content:transform-origin": "as above",
  "select:select-content:transform-origin": "as above",
  "combobox:combobox-content:transform-origin": "as above",
  "popover:popover-content:transform-origin":
    "`origin-(--radix-popover-content-transform-origin)` reads a variable " +
    "Radix's popper writes from its own measurement, and there is no popper " +
    "here to write it. An undefined `var()` is invalid at computed-value time " +
    "and the origin would fall back to `50% 50%`, which scales the panel out " +
    "of its own corner. The origin is a rule per `data-placement` instead, " +
    "which is the same four values Radix computes",
  "hover-card:hover-card-content:transform-origin": "as above, per placement",
  "tooltip:tooltip-content:transform-origin": "as above, per placement",
  "message-scroller:message-scroller-button:transition-duration":
    "`transition-[…]` and `duration-200` set the SAME property, and an atom " +
    "is one declaration: the literal wins and the `var()` form it replaces " +
    "cannot also be present",
};

/** The literal whose declarations cover most of what the spec asks for. */
function bestMatch(sheet: Map<string, Set<string>>, wanted: readonly string[]): Set<string> {
  let best = new Set<string>();
  let score = -1;
  for (const held of sheet.values()) {
    let overlap = 0;
    for (const decl of wanted) if (held.has(decl)) overlap++;
    if (overlap > score) {
      score = overlap;
      best = held;
    }
  }
  return best;
}

async function main(): Promise<void> {
  const only = process.argv[2];
  const specs = join(import.meta.dir, "../specs");
  const build = await createBuilder();

  const sheet = byCall();

  let checked = 0;
  let missing = 0;

  for (const file of readdirSync(specs).toSorted()) {
    if (!file.endsWith(".json")) continue;
    const name = file.replace(/\.json$/, "");
    if (only !== undefined && only !== name) continue;

    const spec = JSON.parse(readFileSync(join(specs, file), "utf8")) as Record<string, string>;
    for (const [slot, classes] of Object.entries(spec)) {
      const result = await translate(build, classes);
      const wanted = declarations(parse(result.css)).map(canonical);
      const held = bestMatch(sheet, wanted);
      const absent = wanted.filter((decl) => !held.has(decl));
      checked += wanted.length;
      if (absent.length === 0) continue;

      const real = absent.filter((decl) => {
        const property = decl.slice(0, decl.indexOf(":")).trim();
        return ALLOWED[`${name}:${slot}:${property}`] === undefined;
      });
      if (real.length === 0) continue;

      missing += real.length;
      process.stdout.write(`\n${name} / ${slot}\n`);
      for (const decl of real) process.stdout.write(`  missing: ${decl}\n`);
    }
  }

  process.stdout.write(
    `\n${String(checked)} declarations from shadcn's class lists, ${String(missing)} not in the stylesheet\n`,
  );
  if (missing > 0) process.exitCode = 1;
}

await main();
