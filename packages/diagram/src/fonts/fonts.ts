import {
  FONT_FAMILY,
  DEFAULT_FONT_FAMILY,
  FONT_FAMILY_FALLBACKS,
  CJK_HAND_DRAWN_FALLBACK_FONT,
  LOCAL_FONT_PROTOCOL,
  WINDOWS_EMOJI_FALLBACK_FONT,
  getFontFamilyFallbacks,
  FONT_SIZES,
} from "@excalidraw/common";
import { getContainerElement } from "@excalidraw/element";
import { charWidth } from "@excalidraw/element";
import { containsCJK } from "@excalidraw/element";

import {
  FONT_METADATA,
  type FontMetadata,
  getFontString,
  PromisePool,
  promiseTry,
} from "@excalidraw/common";

import { ShapeCache } from "@excalidraw/element";

import { isTextElement } from "@excalidraw/element";

import type { ExcalidrawElement, ExcalidrawTextElement } from "@excalidraw/element/types";

import type { Scene } from "@excalidraw/element";

import { DiagramFontFace, type FontFaceDescriptor } from "./font-face.ts";
import { FONT_FILES } from "./manifest.ts";

/** warned once per process, not per export (e.g. on a server) */
let warnedNoFontFaceSet = false;

interface WorkerFonts {
  fonts: FontFaceSet;
}

/** a worker's own font set (`WorkerGlobalScope.fonts`), if this is one */
function getWorkerFontFaceSet(): FontFaceSet | null {
  return typeof self !== "undefined" && "fonts" in self
    ? (self as unknown as WorkerFonts).fonts
    : null;
}

export class Fonts {
  public static readonly loadedFontsCache = new Set<string>();

  private static _registered: Map<number, RegisteredFamily> | undefined;

  public static get registered(): Map<number, RegisteredFamily> {
    Fonts._registered ??= Fonts.init();
    return Fonts._registered;
  }

  public get registered(): Map<number, RegisteredFamily> {
    return Fonts.registered;
  }

  /**
   * Adds faces to one of the scene's font families. A face with a
   * `unicodeRange` extends the family over those code points only, which is
   * how a script the family does not cover, Arabic in a hand-drawn family
   * for instance, gets a face of its own on the canvas and in exports.
   */
  public static register(family: string, ...descriptors: FontFaceDescriptor[]): void {
    const id = familyId(family);
    if (id === undefined) {
      throw new Error(`Fonts.register: "${family}" is not one of the scene's font families.`);
    }
    const entry = Fonts.registered.get(id) ?? {
      metadata: FONT_METADATA[id] ?? FONT_METADATA[FONT_FAMILY.Excalifont]!,
      fontFaces: [],
    };
    entry.fontFaces.push(
      ...descriptors.map(({ uri, descriptors: each }) => new DiagramFontFace(family, uri, each)),
    );
    Fonts.registered.set(id, entry);
  }

  private readonly scene: Scene;
  private readonly ownerDocument: Document;
  private readonly loadedFonts = new Set<string>();

  constructor(scene: Scene, ownerDocument: Document = document) {
    this.scene = scene;
    this.ownerDocument = ownerDocument;
  }

  /**
   * Get all the font families for the given scene.
   */
  public getSceneFamilies = () => {
    return Fonts.getUniqueFamilies(this.scene.getNonDeletedElements());
  };

  /**
   * if we load a (new) font, it's likely that text elements using it have
   * already been rendered using a fallback font. Thus, we want invalidate
   * their shapes and rerender. See #637.
   *
   * Invalidates text elements and rerenders scene, provided that at least one
   * of the supplied fontFaces has not already been processed.
   */
  public onLoaded = (fontFaces: readonly FontFace[]): void => {
    // bail if all fonts with have been processed by THIS instance. We're
    // checking just a subset of the font properties (though it should be
    // enough), so it can technically bail on a false positive.
    let shouldBail = true;

    for (const fontFace of fontFaces) {
      const sig = `${fontFace.family}-${fontFace.style}-${fontFace.weight}-${fontFace.unicodeRange}`;

      // make sure to update our cache with all the loaded font faces
      Fonts.loadedFontsCache.add(sig);

      if (!this.loadedFonts.has(sig)) {
        this.loadedFonts.add(sig);
        shouldBail = false;
      }
    }

    if (shouldBail) {
      return;
    }

    let didUpdate = false;

    const elementsMap = this.scene.getNonDeletedElementsMap();

    for (const element of this.scene.getNonDeletedElements()) {
      if (isTextElement(element)) {
        didUpdate = true;
        ShapeCache.delete(element);

        // clear the width cache, so that we don't perform subsequent wrapping based on the stale fallback font metrics
        charWidth.clearCache(getFontString(element));

        const container = getContainerElement(element, elementsMap);
        if (container) {
          ShapeCache.delete(container);
        }
      }
    }

    if (didUpdate) {
      this.scene.triggerUpdate();
    }
  };

  /**
   * Load font faces for a given scene and trigger scene update.
   */
  public loadSceneFonts = async (
    defaultFontFamily: ExcalidrawTextElement["fontFamily"] = DEFAULT_FONT_FAMILY,
  ): Promise<FontFace[]> => {
    const elements = this.scene.getNonDeletedElements();
    const sceneFamilies = Fonts.getUniqueFamilies(elements);
    const charsPerFamily = Fonts.getCharsPerFamily(elements);

    // prewarm the default font so that the first text element is not
    // rendered with a fallback font
    if (!sceneFamilies.includes(defaultFontFamily)) {
      sceneFamilies.push(defaultFontFamily);
      charsPerFamily[defaultFontFamily] = new Set("Excalidraw");
    }

    // A DOM without the Font Loading API (happy-dom, linkedom) has no font
    // set: text is drawn with the fonts the environment has.
    const fontFaceSet = this.ownerDocument.fonts as FontFaceSet | undefined;
    if (fontFaceSet === undefined) {
      return [];
    }

    return Fonts.loadFontFaces(sceneFamilies, charsPerFamily, fontFaceSet);
  };

  /**
   * Load font faces for passed elements - use when the scene is unavailable (i.e. export).
   *
   * Loads into the document's font set, or in a worker into the worker's own
   * (`self.fonts`, what an `OffscreenCanvas` there measures with). Where there
   * is neither -- e.g. a DOM shim without `FontFaceSet` (`linkedom`), or Node
   * -- nothing is loaded: the host makes the fonts available itself, and is
   * warned once if the elements use fonts that would need loading.
   */
  public static loadElementsFonts = async (
    elements: readonly ExcalidrawElement[],
    ownerDocument?: Document,
  ): Promise<FontFace[]> => {
    const fontFaceSet =
      (ownerDocument ?? (typeof document !== "undefined" ? document : null))?.fonts ??
      getWorkerFontFaceSet();

    const fontFamilies = Fonts.getUniqueFamilies(elements);

    if (!fontFaceSet) {
      // local fonts (e.g. Helvetica) are never loaded anyway
      if (!warnedNoFontFaceSet && fontFamilies.some((family) => !FONT_METADATA[family]?.local)) {
        warnedNoFontFaceSet = true;
        console.warn(
          "@barqjs/diagram: there is no font set (`document.fonts`, or a worker's " +
            "`self.fonts`) to load the exported fonts into, so text is " +
            "measured and drawn with whatever fonts this environment has. " +
            "Load them yourself in `config.environment.loadFonts`.",
        );
      }
      return [];
    }

    const charsPerFamily = Fonts.getCharsPerFamily(elements);

    return Fonts.loadFontFaces(fontFamilies, charsPerFamily, fontFaceSet);
  };

  /**
   * Generate CSS @font-face declarations for the given elements.
   */
  /**
   * `@font-face` rules for the faces the elements' text needs, each naming
   * its files by URL: a page fetches only the ranges it draws, and nothing is
   * fetched to write them.
   */
  public static fontFaceRules(elements: readonly ExcalidrawElement[]): string {
    const charsPerFamily = Fonts.getCharsPerFamily(elements);
    const rules: string[] = [];
    for (const family of Fonts.getUniqueFamilies(elements)) {
      const characters = Fonts.getCharacters(charsPerFamily, family);
      const fallbacks = getFontFamilyFallbacks(family).flatMap((name) => {
        const id = FONT_FAMILY_FALLBACKS[name];
        return id === family ? [] : [id];
      });
      for (const id of [family, ...fallbacks]) {
        const registered = Fonts.registered.get(id);
        if (registered === undefined || registered.metadata.local) continue;
        for (const face of registered.fontFaces) {
          const rule = face.toUrlCSS(characters);
          if (rule !== undefined) rules.push(rule);
        }
      }
    }
    return [...new Set(rules)].join("\n");
  }

  public static async generateFontFaceDeclarations(elements: readonly ExcalidrawElement[]) {
    const families = Fonts.getUniqueFamilies(elements);
    const charsPerFamily = Fonts.getCharsPerFamily(elements);

    // for simplicity, assuming we have just one family with the CJK handdrawn fallback
    const familyWithCJK = families.find((x) =>
      getFontFamilyFallbacks(x).includes(CJK_HAND_DRAWN_FALLBACK_FONT),
    );

    if (familyWithCJK) {
      const characters = Fonts.getCharacters(charsPerFamily, familyWithCJK);

      if (containsCJK(characters)) {
        const family = FONT_FAMILY_FALLBACKS[CJK_HAND_DRAWN_FALLBACK_FONT];

        // adding the same characters to the CJK handrawn family
        charsPerFamily[family] = new Set(characters);

        // the order between the families and fallbacks is important, as fallbacks need to be defined first and in the reversed order
        // so that they get overriden with the later defined font faces, i.e. in case they share some codepoints
        families.unshift(FONT_FAMILY_FALLBACKS[CJK_HAND_DRAWN_FALLBACK_FONT]);
      }
    }

    // don't trigger hundreds of concurrent requests (each performing fetch, creating a worker, etc.),
    // instead go three requests at a time, in a controlled manner, without completely blocking the main thread
    // and avoiding potential issues such as rate limits
    const iterator = Fonts.fontFacesStylesGenerator(families, charsPerFamily);
    const concurrency = 3;
    const fontFaces = await new PromisePool(iterator, concurrency).all();

    // dedup just in case (i.e. could be the same font faces with 0 glyphs)
    return Array.from(new Set(fontFaces));
  }

  private static async loadFontFaces(
    fontFamilies: Array<ExcalidrawTextElement["fontFamily"]>,
    charsPerFamily: Record<number, Set<string>>,
    fontFaceSet: FontFaceSet,
  ) {
    // add all registered font faces into the font set (if not added already)
    for (const { fontFaces, metadata } of Fonts.registered.values()) {
      // skip registering font faces for local fonts (i.e. Helvetica)
      if (metadata.local) {
        continue;
      }

      for (const { fontFace } of fontFaces) {
        if (fontFace !== null && !fontFaceSet.has(fontFace)) {
          fontFaceSet.add(fontFace);
        }
      }
    }

    // loading 10 font faces at a time, in a controlled manner
    const iterator = Fonts.fontFacesLoader(fontFamilies, charsPerFamily, fontFaceSet);
    const concurrency = 10;
    const fontFaces = await new PromisePool(iterator, concurrency).all();
    return fontFaces.flat().filter(Boolean);
  }

  private static *fontFacesLoader(
    fontFamilies: Array<ExcalidrawTextElement["fontFamily"]>,
    charsPerFamily: Record<number, Set<string>>,
    fontFaceSet: FontFaceSet,
  ): Generator<Promise<void | readonly [number, FontFace[]]>> {
    for (const [index, fontFamily] of fontFamilies.entries()) {
      const font = getFontString({
        fontFamily,
        fontSize: FONT_SIZES.sm,
      });

      // WARN: without "text" param it does not have to mean that all font faces are loaded as it could be just one irrelevant font face!
      // instead, we are always checking chars used in the family, so that no required font faces remain unloaded
      const text = Fonts.getCharacters(charsPerFamily, fontFamily);

      if (!fontFaceSet.check(font, text)) {
        yield promiseTry(async () => {
          try {
            // WARN: browser prioritizes loading only font faces with unicode ranges for characters which are present in the document (html & canvas), other font faces could stay unloaded
            // we might want to retry here, i.e.  in case CDN is down, but so far I didn't experience any issues - maybe it handles retry-like logic under the hood
            const fontFaces = await fontFaceSet.load(font, text);

            return [index, fontFaces];
          } catch (e) {
            // don't let it all fail if just one font fails to load
            console.error(
              `Failed to load font "${font}" from urls "${String(
                Fonts.registered.get(fontFamily)?.fontFaces.map((x) => x.urls),
              )}"`,
              e,
            );
            return undefined;
          }
        });
      }
    }
  }

  private static *fontFacesStylesGenerator(
    families: Array<number>,
    charsPerFamily: Record<number, Set<string>>,
  ): Generator<Promise<void | readonly [number, string]>> {
    for (const [familyIndex, family] of families.entries()) {
      const { fontFaces, metadata } = Fonts.registered.get(family) ?? {};

      if (!Array.isArray(fontFaces)) {
        console.error(
          `Couldn't find registered fonts for font-family "${family}"`,
          Fonts.registered,
        );
        continue;
      }

      if (metadata?.local) {
        // don't inline local fonts
        continue;
      }

      for (const [fontFaceIndex, fontFace] of fontFaces.entries()) {
        yield promiseTry(async () => {
          try {
            const characters = Fonts.getCharacters(charsPerFamily, family);
            const fontFaceCSS = await fontFace.toCSS(characters);

            if (!fontFaceCSS) {
              return undefined;
            }

            // giving a buffer of 10K font faces per family
            const fontFaceOrder = familyIndex * 10_000 + fontFaceIndex;
            const fontFaceTuple = [fontFaceOrder, fontFaceCSS] as const;

            return fontFaceTuple;
          } catch (error) {
            console.error(
              `Couldn't transform font-face to css for family "${fontFace.family}"`,
              error,
            );
            return undefined;
          }
        });
      }
    }
  }

  private static init(): Map<number, RegisteredFamily> {
    const registered = new Map<number, RegisteredFamily>();
    function add(family: string, descriptors: readonly FontFaceDescriptor[]) {
      const id = familyId(family)!;
      registered.set(id, {
        metadata: FONT_METADATA[id] ?? FONT_METADATA[FONT_FAMILY.Excalifont]!,
        fontFaces: descriptors.map(
          ({ uri, descriptors: each }) => new DiagramFontFace(family, uri, each),
        ),
      });
    }
    for (const [family, files] of Object.entries(FONT_FILES)) {
      add(
        family,
        files.map(({ file, unicodeRange, weight }) => ({
          uri: file,
          descriptors: {
            ...(unicodeRange === undefined ? {} : { unicodeRange }),
            ...(weight === undefined ? {} : { weight }),
          },
        })),
      );
    }
    // System fonts: measured and drawn, never fetched or inlined.
    add("Helvetica", [{ uri: LOCAL_FONT_PROTOCOL }]);
    add(WINDOWS_EMOJI_FALLBACK_FONT, [{ uri: LOCAL_FONT_PROTOCOL }]);
    return registered;
  }

  /**
   * Get all the unique font families for the given elements.
   */
  private static getUniqueFamilies(
    elements: ReadonlyArray<ExcalidrawElement>,
  ): Array<ExcalidrawTextElement["fontFamily"]> {
    return Array.from(
      elements.reduce((families, element) => {
        if (isTextElement(element)) {
          families.add(element.fontFamily);
        }
        return families;
      }, new Set<number>()),
    );
  }

  /**
   * Get all the unique characters per font family for the given scene.
   */
  private static getCharsPerFamily(
    elements: ReadonlyArray<ExcalidrawElement>,
  ): Record<number, Set<string>> {
    const charsPerFamily: Record<number, Set<string>> = {};

    for (const element of elements) {
      if (!isTextElement(element)) {
        continue;
      }

      const chars = (charsPerFamily[element.fontFamily] ??= new Set());
      for (const char of element.originalText) {
        chars.add(char);
      }
    }

    return charsPerFamily;
  }

  /**
   * Get characters for a given family.
   */
  private static getCharacters(charsPerFamily: Record<number, Set<string>>, family: number) {
    const chars = charsPerFamily[family];
    return chars ? Array.from(chars).join("") : "";
  }
}

interface RegisteredFamily {
  metadata: FontMetadata;
  fontFaces: DiagramFontFace[];
}

function familyId(family: string): number | undefined {
  return (
    FONT_FAMILY[family as keyof typeof FONT_FAMILY] ??
    FONT_FAMILY_FALLBACKS[family as keyof typeof FONT_FAMILY_FALLBACKS]
  );
}
