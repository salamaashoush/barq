/**
 * Browser-backed check for O5: a dynamic `class`, a string or a map, on an SVG
 * element.
 *
 * `SVGElement.className` is a get-only `SVGAnimatedString`, so `element.className
 * = x` is a no-op in sloppy mode and a TypeError in module code. happy-dom
 * models it as a writable string, which means the differential harness cannot
 * falsify the runtime's SVG branch on its own — `test/preload.ts` installs the
 * browser's property shape to close that gap, and THIS script is what proves
 * the shape it installs is the real one.
 *
 * Run by `browser.test.ts`.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { withChrome, type Page } from "./chrome.ts";
import { compileFixture } from "./harness.ts";

const PROBE = `
import Component, { setActive } from "./fixture.js"
import { flush } from "@barqjs/core"
import { render, setProp } from "@barqjs/web"

const SVG = "http://www.w3.org/2000/svg"
const result = { probes: {}, fixture: {} }

// The bug itself, stated against the real prototype: nothing the runtime can do
// with \`element.className =\` reaches an SVG element.
const descriptor = Object.getOwnPropertyDescriptor(SVGElement.prototype, "className")
result.probes.classNameHasSetter = Boolean(descriptor && descriptor.set)
result.probes.classNameIsAnimatedString =
  document.createElementNS(SVG, "circle").className instanceof SVGAnimatedString

try {
  document.createElementNS(SVG, "circle").className = "written"
  result.probes.classNameAssignment = "silently accepted"
} catch (error) {
  result.probes.classNameAssignment = "throws: " + error.constructor.name
}

// The runtime's two SVG branches, driven directly.
const one = document.createElementNS(SVG, "circle")
setProp(one, "class", "dot dot--on")
result.probes.setPropClass = one.getAttribute("class")

const two = document.createElementNS(SVG, "circle")
two.setAttribute("class", "keep")
setProp(two, "class", { ring: true, hidden: false })
result.probes.setPropClassMap = two.getAttribute("class")

// The compiled fixture, rendered and driven.
const root = document.createElement("div")
document.body.appendChild(root)
render(Component, root)
flush()

const circle = root.querySelector("circle")
result.fixture.initial = circle.getAttribute("class")
result.fixture.initialStrokeWidth = circle.getAttribute("stroke-width")
setActive(true)
flush()
result.fixture.on = circle.getAttribute("class")
result.fixture.onStrokeWidth = circle.getAttribute("stroke-width")
setActive(false)
flush()
result.fixture.off = circle.getAttribute("class")

window.__barqSvgClass = result
`;

export interface Probe {
  classNameHasSetter: boolean;
  classNameIsAnimatedString: boolean;
  classNameAssignment: string;
  setPropClass: string | null;
  setPropClassMap: string | null;
}

export interface Fixture {
  initial: string | null;
  initialStrokeWidth: string | null;
  on: string | null;
  onStrokeWidth: string | null;
  off: string | null;
}

export interface SvgClassResult {
  probes: Probe;
  fixture: Fixture;
}

/** The bundled probe page, on disk. The caller owns `cleanup`. */
export function buildProbePage(): { pagePath: string; cleanup: () => void } {
  // The page is bundled outside the workspace, so the bare specifier has nothing
  // to resolve against. Point both modules straight at the runtime's entry.
  const core = JSON.stringify(Bun.resolveSync("@barqjs/core", import.meta.dir));
  const web = JSON.stringify(Bun.resolveSync("@barqjs/web", import.meta.dir));
  const rewrite = (code: string): string =>
    code.replaceAll('"@barqjs/core"', core).replaceAll('"@barqjs/web"', web);

  const workdir = mkdtempSync(join(tmpdir(), "barq-svg-class-page-"));
  writeFileSync(join(workdir, "fixture.js"), rewrite(compileFixture("svg-dynamic-class")));
  writeFileSync(join(workdir, "probe.js"), rewrite(PROBE));
  return {
    pagePath: join(workdir, "page.html"),
    cleanup: () => rmSync(workdir, { recursive: true, force: true }),
  };
}

async function bundleInto(pagePath: string): Promise<void> {
  const workdir = pagePath.slice(0, pagePath.lastIndexOf("/"));
  const built = await Bun.build({
    entrypoints: [join(workdir, "probe.js")],
    target: "browser",
    format: "esm",
  });
  if (!built.success) {
    for (const log of built.logs) console.error(String(log));
    throw new Error("the probe bundle did not build");
  }
  const bundle = await built.outputs[0].text();
  writeFileSync(
    pagePath,
    `<!doctype html><meta charset="utf-8"><title>barq svg class</title><script type="module">\n${bundle}\n</script>`,
  );
}

/** Drive the probe page in an already-running Chrome. */
export async function checkSvgClass(page: Page): Promise<SvgClassResult> {
  const { pagePath, cleanup } = buildProbePage();
  try {
    await bundleInto(pagePath);
    await page.open(`file://${pagePath}`);
    for (let attempt = 0; attempt < 200; attempt++) {
      const value = await page.evaluate<string | null>(
        "window.__barqSvgClass ? JSON.stringify(window.__barqSvgClass) : null",
      );
      if (value) return JSON.parse(value) as SvgClassResult;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("the page never published a result — check the bundle for a load error");
  } finally {
    cleanup();
  }
}

/** Every O5 claim, as `[why, held]` pairs. */
export function svgClassClaims({
  probes,
  fixture,
}: SvgClassResult): Array<[string, boolean, unknown]> {
  return [
    [
      "SVGElement.prototype.className has no setter (the bug is real)",
      probes.classNameHasSetter === false,
      probes.classNameHasSetter,
    ],
    [
      "an SVG element's .className is an SVGAnimatedString, not a string",
      probes.classNameIsAnimatedString,
      probes.classNameIsAnimatedString,
    ],
    [
      "assigning .className on an SVG element throws in module code",
      probes.classNameAssignment.startsWith("throws:"),
      probes.classNameAssignment,
    ],
    [
      'setProp(svg, "class", …) lands on the class attribute',
      probes.setPropClass === "dot dot--on",
      probes.setPropClass,
    ],
    [
      'setProp(svg, "class", { … }) adds its keys beside a class it does not own',
      probes.setPropClassMap === "keep ring",
      probes.setPropClassMap,
    ],
    ["the compiled fixture renders class=dot", fixture.initial === "dot", fixture.initial],
    [
      "the compiled fixture renders stroke-width=1",
      fixture.initialStrokeWidth === "1",
      fixture.initialStrokeWidth,
    ],
    ["a signal write updates the SVG class", fixture.on === "dot dot--on", fixture.on],
    [
      "a signal write updates a hyphenated SVG attribute",
      fixture.onStrokeWidth === "3",
      fixture.onStrokeWidth,
    ],
    ["the class goes back", fixture.off === "dot", fixture.off],
  ];
}
