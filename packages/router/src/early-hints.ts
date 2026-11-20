/**
 * What a page needs before its markup, as `Link` values: for a `103 Early
 * Hints` the host writes and for the page's own `Link` header.
 *
 * Two phases, as in TanStack Start. `static` is the build's own knowledge, the
 * entry and the matched chain's chunks and stylesheets, known before any
 * loader runs. `dynamic` is what the routes' `head` declared once it has run:
 * a preload, a preconnect, a font. Each phase carries only links the earlier
 * one did not.
 */

export interface EarlyHint {
  readonly href: string;
  readonly rel: "preload" | "modulepreload" | "preconnect" | "dns-prefetch";
  readonly as?: "fetch" | "font" | "image" | "script" | "style" | "track";
  readonly crossOrigin?: "" | "anonymous" | "use-credentials";
  readonly type?: string;
  readonly integrity?: string;
  readonly referrerPolicy?: string;
  readonly fetchPriority?: string;
}

export type EarlyHintsPhase = "static" | "dynamic";

export interface EarlyHintsEvent {
  readonly phase: EarlyHintsPhase;
  /** This phase's hints, none of which an earlier phase sent. */
  readonly hints: readonly EarlyHint[];
  /** The same, as `Link` values. */
  readonly links: readonly string[];
  /** Every link the request has collected so far. */
  readonly allLinks: readonly string[];
}

/** One `Link` value the page's response header may carry. */
export interface LinkHeaderEntry {
  readonly phase: EarlyHintsPhase;
  readonly hint: EarlyHint;
  readonly link: string;
}

/**
 * Whether the page's response repeats the hints as its `Link` header, which a
 * CDN turns into a 103 of its own. On by default; `filter` keeps out a link
 * that is not public and cache-safe for the deployment.
 */
export type ResponseLinkHeader =
  | boolean
  | { readonly filter?: (entry: LinkHeaderEntry) => boolean };

const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const PRELOAD_AS = new Set(["fetch", "font", "image", "script", "style", "track"]);

function param(name: string, value: string | undefined): string {
  if (value === undefined || value === "") return name;
  return TOKEN.test(value) ? `${name}=${value}` : `${name}=${JSON.stringify(value)}`;
}

/** A hint as one `Link` value, or `undefined` for an href a header cannot carry. */
export function serializeEarlyHint(hint: EarlyHint): string | undefined {
  if (/[\s<>,;]/.test(hint.href)) return undefined;
  const parts = [`<${hint.href}>`, param("rel", hint.rel)];
  if (hint.as !== undefined) parts.push(param("as", hint.as));
  if (hint.crossOrigin !== undefined) parts.push(param("crossorigin", hint.crossOrigin));
  if (hint.type) parts.push(param("type", hint.type));
  if (hint.integrity) parts.push(param("integrity", hint.integrity));
  if (hint.referrerPolicy) parts.push(param("referrerpolicy", hint.referrerPolicy));
  if (hint.fetchPriority) parts.push(param("fetchpriority", hint.fetchPriority));
  return parts.join("; ");
}

type LinkAttrs = Readonly<Record<string, string | number | boolean | undefined>>;

function text(attrs: LinkAttrs, name: string, alias?: string): string | undefined {
  const value = attrs[name] ?? (alias === undefined ? undefined : attrs[alias]);
  return typeof value === "string" ? value : undefined;
}

/**
 * The hint a `head` link stands for: a stylesheet is preloaded as a style, a
 * module preload as a script, and a preload only when its `as` is one a 103
 * may carry. Anything else, an icon or a canonical, is not a hint.
 */
export function hintOfLink(attrs: LinkAttrs): EarlyHint | undefined {
  const href = text(attrs, "href");
  const rel = text(attrs, "rel");
  if (href === undefined || rel === undefined) return undefined;
  const tokens = rel.toLowerCase().split(/\s+/);
  let hint: { -readonly [K in keyof EarlyHint]: EarlyHint[K] };
  if (tokens.includes("modulepreload")) hint = { href, rel: "modulepreload", as: "script" };
  else if (tokens.includes("stylesheet")) hint = { href, rel: "preload", as: "style" };
  else if (tokens.includes("preload")) {
    const as = text(attrs, "as");
    if (as === undefined || !PRELOAD_AS.has(as)) return undefined;
    hint = { href, rel: "preload", as: as as EarlyHint["as"] };
  } else if (tokens.includes("preconnect")) hint = { href, rel: "preconnect" };
  else if (tokens.includes("dns-prefetch")) hint = { href, rel: "dns-prefetch" };
  else return undefined;
  const crossOrigin = text(attrs, "crossOrigin", "crossorigin");
  if (crossOrigin !== undefined) {
    hint.crossOrigin = crossOrigin as EarlyHint["crossOrigin"];
  } else if (attrs.crossorigin === true || attrs.crossOrigin === true) {
    hint.crossOrigin = "";
  }
  const type = text(attrs, "type");
  if (type) hint.type = type;
  const integrity = text(attrs, "integrity");
  if (integrity) hint.integrity = integrity;
  const referrerPolicy = text(attrs, "referrerPolicy", "referrerpolicy");
  if (referrerPolicy) hint.referrerPolicy = referrerPolicy;
  const fetchPriority = text(attrs, "fetchPriority", "fetchpriority");
  if (fetchPriority) hint.fetchPriority = fetchPriority;
  return hint;
}

/** The build's own hints: modules preloaded as modules, stylesheets as styles. */
export function staticHints(
  scripts: readonly string[],
  styles: readonly string[],
  crossOrigin?: (href: string) => string | undefined,
): EarlyHint[] {
  const cross = (href: string) => {
    const value = crossOrigin?.(href);
    return value === undefined ? {} : { crossOrigin: value as EarlyHint["crossOrigin"] };
  };
  return [
    ...scripts.map((href): EarlyHint => ({
      href,
      rel: "modulepreload",
      as: "script",
      ...cross(href),
    })),
    ...styles.map((href): EarlyHint => ({ href, rel: "preload", as: "style", ...cross(href) })),
  ];
}

/** One request's hints across both phases, each link sent once. */
export function createEarlyHints(options: {
  readonly onEarlyHints?: (event: EarlyHintsEvent) => void;
  readonly responseLinkHeader?: ResponseLinkHeader;
}): {
  collect(phase: EarlyHintsPhase, hints: readonly EarlyHint[]): void;
  /** The `Link` values the page's response carries, in collection order. */
  headerLinks(): string[];
} {
  const sent = new Set<string>();
  const entries: LinkHeaderEntry[] = [];
  return {
    collect(phase, hints) {
      const fresh: EarlyHint[] = [];
      const links: string[] = [];
      for (const hint of hints) {
        const link = serializeEarlyHint(hint);
        if (link === undefined || sent.has(link)) continue;
        sent.add(link);
        fresh.push(hint);
        links.push(link);
        entries.push({ phase, hint, link });
      }
      if (links.length === 0 || options.onEarlyHints === undefined) return;
      try {
        options.onEarlyHints({ phase, hints: fresh, links, allLinks: [...sent] });
      } catch (error) {
        // A host that cannot send a 103 has still answered the request; the
        // `Link` header carries the hints.
        console.error(error);
      }
    },
    headerLinks() {
      const header = options.responseLinkHeader ?? true;
      if (header === false) return [];
      const filter = header === true ? undefined : header.filter;
      if (filter === undefined) return entries.map((entry) => entry.link);
      const kept: string[] = [];
      for (const entry of entries) {
        try {
          if (filter(entry)) kept.push(entry.link);
        } catch (error) {
          console.error(error);
        }
      }
      return kept;
    },
  };
}
