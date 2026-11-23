import { LOCAL_FONT_PROTOCOL, promiseTry } from "@excalidraw/common";

import { stringToBase64, toByteString } from "../data/encode.ts";

/**
 * Where Excalidraw's own published package serves the font files. Their paths
 * under it are the ones `FONT_FILES` lists, so an app that copies that
 * package's `dist/prod/fonts` to its own origin points `setFontAssetPath` at
 * the copy and fetches nothing from a third party.
 */
export const DEFAULT_FONT_ASSET_PATH = "https://esm.sh/@excalidraw/excalidraw@0.18.1/dist/prod/";

let assetPaths: readonly string[] | null = null;

/**
 * The base URLs the bundled font files are fetched from, tried in order with
 * the public default last. `null` goes back to `window.EXCALIDRAW_ASSET_PATH`,
 * which Excalidraw reads for the same purpose, and then the default alone.
 */
export function setFontAssetPath(path: string | readonly string[] | null): void {
  assetPaths = path === null ? null : typeof path === "string" ? [path] : path;
}

function configuredAssetPaths(): readonly string[] {
  if (assetPaths !== null) return assetPaths;
  const global = (globalThis as { EXCALIDRAW_ASSET_PATH?: unknown }).EXCALIDRAW_ASSET_PATH;
  if (typeof global === "string") return [global];
  if (Array.isArray(global)) return global.filter((each) => typeof each === "string");
  return [];
}

function normalizeBaseUrl(baseUrl: string): string {
  let result = baseUrl;
  // A root-relative or `./` path is resolved against the page.
  if (/^\.?\//.test(result)) {
    const origin = typeof location === "undefined" ? "http://localhost/" : location.origin;
    result = new URL(result.replace(/^\.?\/+/, ""), origin).toString();
  }
  return `${result.replace(/\/+$/, "")}/`;
}

export interface FontFaceDescriptor {
  /** A path under the font asset path, an absolute URL, a data URL, or `LOCAL_FONT_PROTOCOL` for a system font. */
  uri: string;
  descriptors?: FontFaceDescriptors;
}

/**
 * One face of a family: where its file is, the code points it covers, and the
 * `FontFace` a document loads it through. The `FontFace` is built on first
 * use, so a process without the Font Loading API (a server) can still embed
 * faces into an SVG.
 */
export class DiagramFontFace {
  public readonly family: string;
  public readonly uri: string;
  public readonly descriptors: FontFaceDescriptors;
  private face: FontFace | null = null;

  constructor(family: string, uri: string, descriptors?: FontFaceDescriptors) {
    this.family = family;
    this.uri = uri;
    this.descriptors = descriptors ?? {};
  }

  public get unicodeRange(): string {
    return this.descriptors.unicodeRange ?? "U+0-10FFFF";
  }

  /** The URLs the face is fetched from, first to last. Empty for a system font. */
  public get urls(): string[] {
    if (this.uri.startsWith("data:")) return [this.uri];
    if (this.uri.startsWith(LOCAL_FONT_PROTOCOL)) return [];
    if (/^https?:/.test(this.uri)) return [this.uri];
    const relative = this.uri.replace(/^\/+/, "");
    return [...configuredAssetPaths(), DEFAULT_FONT_ASSET_PATH].map((base) =>
      new URL(relative, normalizeBaseUrl(base)).toString(),
    );
  }

  /** The face for a document's font set, or `null` where there is no Font Loading API. */
  public get fontFace(): FontFace | null {
    if (this.face !== null) return this.face;
    if (typeof FontFace === "undefined") return null;
    const sources = this.urls.map((url) => `url(${url})${format(url)}`).join(", ");
    this.face = new FontFace(this.family, sources, {
      display: "swap",
      style: "normal",
      weight: "400",
      ...this.descriptors,
    });
    return this.face;
  }

  /**
   * An `@font-face` rule with the file inlined as a data URL, when any of
   * `characters` falls in this face's range; `undefined` otherwise.
   */
  public toCSS(characters: string): Promise<string> | undefined {
    if (!this.getUnicodeRangeRegex().test(characters)) {
      return undefined;
    }
    return this.getContent().then(
      (content) =>
        `@font-face { font-family: ${this.family}; src: url(${content}); unicode-range: ${this.unicodeRange}; }`,
    );
  }

  /** The same rule naming the files by URL instead of inlining one. */
  public toUrlCSS(characters: string): string | undefined {
    const urls = this.urls;
    if (urls.length === 0 || !this.getUnicodeRangeRegex().test(characters)) {
      return undefined;
    }
    const sources = urls.map((url) => `url(${url})${format(url)}`).join(", ");
    return `@font-face { font-family: ${this.family}; src: ${sources}; unicode-range: ${this.unicodeRange}; }`;
  }

  /**
   * The file as a data URL, from the first URL that answers. When none does,
   * the last URL itself, so the SVG still names a source a viewer can fetch.
   */
  public async getContent(): Promise<string> {
    const urls = this.urls;
    const errors: string[] = [];
    for (const url of urls) {
      if (url.startsWith("data:")) return url;
      try {
        const buffer = await this.fetchFont(url);
        return `data:font/woff2;base64,${stringToBase64(toByteString(buffer), true)}`;
      } catch (error) {
        errors.push(`"${url}" returned error "${String(error)}"`);
      }
    }
    console.error(
      `Failed to fetch font family "${this.family}"`,
      JSON.stringify(errors, undefined, 2),
    );
    return urls.at(-1) ?? "";
  }

  public fetchFont(url: string): Promise<ArrayBuffer> {
    return promiseTry(async () => {
      // The file names carry a content hash, so a stale cache entry is never wrong.
      const response = await fetch(url, {
        cache: "force-cache",
        headers: { Accept: "font/woff2" },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch "${url}": ${response.statusText}`);
      }
      return response.arrayBuffer();
    });
  }

  private getUnicodeRangeRegex(): RegExp {
    const ranges = this.unicodeRange
      .split(/,\s*/)
      .map((range) => {
        const [start, end] = range.replace("U+", "").split("-");
        return end ? `\\u{${start}}-\\u{${end}}` : `\\u{${start}}`;
      })
      .join("");
    return new RegExp(`[${ranges}]`, "u");
  }
}

function format(url: string): string {
  if (url.startsWith("data:")) return "";
  const extension = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(new URL(url).pathname)?.[1];
  return extension === undefined ? "" : ` format('${extension}')`;
}
