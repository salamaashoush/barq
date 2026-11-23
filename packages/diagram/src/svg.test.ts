/**
 * SVG export, compared by structure: the tree of elements with the attributes
 * that carry meaning (colors, fonts, direction, geometry boxes), and path data
 * reduced to whether it is there, so a rounding change in roughjs is not a
 * failure but a missing shape, a wrong color or a lost direction is.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { MIME_TYPES, THEME } from "@excalidraw/common";

import {
  Fonts,
  decodeSvgBase64Payload,
  exportScene,
  exportToSvg,
  exportToSvgString,
  getNonDeletedElements,
  loadFromBlob,
} from "./index.ts";

const KEPT = new Set([
  "viewBox",
  "width",
  "height",
  "fill",
  "stroke",
  "font-family",
  "font-size",
  "text-anchor",
  "direction",
  "dominant-baseline",
  "stroke-dasharray",
  "class",
]);

function structure(node: Element, depth = 0): string {
  const attributes = [...node.attributes]
    .filter((attribute) => KEPT.has(attribute.name))
    .map((attribute) => `${attribute.name}=${attribute.value}`);
  if (node.hasAttribute("d")) attributes.push("d=…");
  const pad = "  ".repeat(depth);
  const own = `${pad}<${node.tagName.toLowerCase()}${attributes.length ? ` ${attributes.join(" ")}` : ""}>`;
  if (node.tagName.toLowerCase() === "text") return `${own} ${node.textContent ?? ""}`;
  if (node.tagName.toLowerCase() === "style" || node.tagName.toLowerCase() === "metadata")
    return own;
  return [own, ...[...node.children].map((child) => structure(child, depth + 1))].join("\n");
}

async function releaseFlow() {
  const file = Bun.file(`${import.meta.dir}/fixtures/release-flow.excalidraw`);
  return loadFromBlob(
    new Blob([await file.arrayBuffer()], { type: MIME_TYPES.excalidraw }),
    null,
    null,
  );
}

describe("exportToSvg", () => {
  test("the light export has the scene's structure", async () => {
    const scene = await releaseFlow();
    const svg = await exportToSvg({
      elements: scene.elements,
      appState: scene.appState,
      files: scene.files,
      skipInliningFonts: true,
    });
    expect(structure(svg)).toMatchSnapshot();
  });

  test("text runs in its own direction, and right-to-left text anchors at its end", async () => {
    const scene = await releaseFlow();
    const svg = await exportToSvg({
      elements: scene.elements,
      appState: scene.appState,
      files: scene.files,
      skipInliningFonts: true,
    });
    const texts = [...svg.querySelectorAll("text")];
    const arabic = texts.find((text) => text.textContent === "مرحبا بالعالم");
    expect(arabic?.getAttribute("direction")).toBe("rtl");
    expect(arabic?.getAttribute("text-anchor")).toBe("end");
    const title = texts.find((text) => text.textContent === "Release flow");
    expect(title?.getAttribute("direction")).toBe("ltr");
    expect(title?.getAttribute("font-family")).toContain("Excalifont");
  });

  test("the dark export filters every color, background included", async () => {
    const scene = await releaseFlow();
    const light = await exportScene({
      type: "svg",
      data: { ...scene, elements: getNonDeletedElements(scene.elements) },
      config: { theme: THEME.LIGHT, skipInliningFonts: true },
    });
    const dark = await exportScene({
      type: "svg",
      data: { ...scene, elements: getNonDeletedElements(scene.elements) },
      config: { theme: THEME.DARK, skipInliningFonts: true },
    });
    const background = (svg: SVGSVGElement) =>
      svg.querySelector(":scope > rect")?.getAttribute("fill");
    expect(background(light)).toBe("#ffffff");
    expect(background(dark)).not.toBe("#ffffff");
    const textFill = (svg: SVGSVGElement) =>
      [...svg.querySelectorAll("text")]
        .find((text) => text.textContent === "Release flow")
        ?.getAttribute("fill");
    expect(textFill(light)).toBe("#1e1e1e");
    expect(textFill(dark)).not.toBe("#1e1e1e");
    expect(structure(dark).split("\n").length).toBe(structure(light).split("\n").length);
  });

  test("a transparent export paints no background", async () => {
    const scene = await releaseFlow();
    const svg = await exportToSvg({
      elements: scene.elements,
      appState: { ...scene.appState, exportBackground: false },
      files: scene.files,
      skipInliningFonts: true,
    });
    const painted = [...svg.children].filter(
      (child) => child.tagName.toLowerCase() === "rect" && child.getAttribute("fill") !== "none",
    );
    expect(painted).toEqual([]);
  });

  test("an embedded scene reads back out of the SVG", async () => {
    const scene = await releaseFlow();
    const svg = await exportToSvg({
      elements: scene.elements,
      appState: { ...scene.appState, exportEmbedScene: true },
      files: scene.files,
      skipInliningFonts: true,
    });
    const payload = JSON.parse(decodeSvgBase64Payload({ svg: svg.outerHTML })) as {
      elements: { id: string }[];
    };
    expect(payload.elements.map((element) => element.id)).toEqual(
      scene.elements.map((element) => element.id),
    );
  });
});

describe("fonts", () => {
  const realFetch = globalThis.fetch;
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  test("a face registered for Arabic is inlined for the Arabic text, and only the faces in use are", async () => {
    const fetched: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      fetched.push(String(input));
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }) as typeof fetch;
    Fonts.register("Excalifont", {
      uri: "https://fonts.example.com/arabic-hand.woff2",
      descriptors: { unicodeRange: "U+0600-06FF" },
    });

    const scene = await releaseFlow();
    const svg = await exportToSvg({
      elements: scene.elements,
      appState: scene.appState,
      files: scene.files,
    });
    const css = svg.querySelector("style.style-fonts")?.textContent ?? "";
    expect(fetched).toContain("https://fonts.example.com/arabic-hand.woff2");
    expect(css).toContain("unicode-range: U+0600-06FF");
    expect(css).toContain("data:font/woff2;base64,AQID");
    // The Latin text pulls Excalifont's Latin face from the asset path; the
    // Cyrillic and Greek faces it has are not used, so not fetched.
    expect(fetched.some((url) => url.includes("fonts/Excalifont/"))).toBe(true);
    expect(fetched.filter((url) => url.includes("fonts/Excalifont/")).length).toBeLessThan(7);
  });

  test("the string export names fonts by URL instead of fetching them", async () => {
    const fetched: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      fetched.push(String(input));
      return new Response(new Uint8Array(0));
    }) as typeof fetch;
    const scene = await releaseFlow();
    const markup = await exportToSvgString(scene);
    expect(fetched).toEqual([]);
    expect(markup.startsWith("<svg")).toBe(true);
    expect(markup).toContain('width="100%"');
    expect(markup).toMatch(/@font-face \{ font-family: Excalifont; src: url\(https:\/\/esm\.sh\//);
  });
});
