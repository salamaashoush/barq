/**
 * The document head, with TanStack Start's API.
 *
 * Shapes taken from their source rather than from a description of it:
 * `router-core/src/route.ts:1367-1385` for the `head` signature and its return,
 * `solid-router/src/headContentUtils.tsx` for the merge, `router-core/src/
 * manifest.ts:145-167` for the link/style/script dedup, and
 * `router-core/src/load-server.ts:618-653` (`projectLane`) for when it runs.
 *
 * A route writes what they write:
 *
 * ```ts
 * export const head = ({ params, loaderData }) => ({
 *   meta: [{ title: loaderData.post.title }, { name: "description", content: "…" }],
 *   links: [{ rel: "canonical", href: `https://x/${params.id}` }],
 *   scripts: [{ type: "application/ld+json", children: JSON.stringify(ld) }],
 * });
 * ```
 *
 * `title` lives inside `meta`. `links` and `scripts` are plural. `scripts` here
 * are HEAD scripts; a route's `scripts` export is the BODY ones. All four match
 * `router-core`'s `head?: (ctx) => Awaitable<{ links, scripts, meta, styles }>`.
 *
 * WHERE barq DIVERGES, and every one of these is invisible in the API and
 * belongs in `DESIGN.md` P6-4:
 *
 * 1. **`meta` dedup keeps `name`, `property` and `http-equiv` apart.** Theirs
 *    keys on `m.name ?? m.property` — one namespace — so `<meta name="author">`
 *    and `<meta property="author">` collide.
 * 2. **`rel="canonical"` is a singleton.** Theirs dedups links on
 *    `JSON.stringify(tag)`, so a child's canonical does not replace a parent's
 *    and both render. Open as their #6719.
 * 3. **A single tag still goes through dedup.** `appendUniqueUserTags` returns
 *    early at `manifest.ts:153-156` when `tags.length === 1`.
 */

/** One managed tag, as `HeadContent` and `Scripts` render it. */
export interface ManagedTag {
  readonly tag: "title" | "meta" | "link" | "style" | "script";
  readonly attrs?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly children?: string;
}

/** `{ title }`, `{ "script:ld+json": … }`, or an ordinary meta's attributes. */
export type HeadMeta = Readonly<Record<string, unknown>>;

export type HeadTag = Readonly<Record<string, string | number | boolean | undefined>>;

/** A `style`, `script` or `noscript`: attributes plus text. */
export interface HeadContentTag extends HeadTag {
  readonly children?: string;
}

/** Exactly `router-core`'s `head` return type. */
export interface HeadResult {
  readonly meta?: readonly HeadMeta[];
  readonly links?: readonly HeadTag[];
  readonly scripts?: readonly HeadContentTag[];
  readonly styles?: readonly HeadContentTag[];
}

/**
 * What `head` is handed — `AssetFnContextOptions` (`route.ts:1194-1241`).
 *
 * `loaderData` is optional THERE too, and here it is optional for a reason
 * barq has and they do not: barq streams route loaders. See `awaitsLoaderData`.
 */
export interface HeadContext<Params = Record<string, string>, Data = unknown> {
  readonly params: Params;
  readonly loaderData: Data | undefined;
  readonly matches: readonly unknown[];
  readonly match: unknown;
  readonly ssr?: { readonly nonce?: string };
}

export type Head<Params = Record<string, string>, Data = unknown> = (
  context: HeadContext<Params, Data>,
) => HeadResult | Promise<HeadResult>;

export type BodyScripts<Params = Record<string, string>, Data = unknown> = (
  context: HeadContext<Params, Data>,
) => readonly HeadContentTag[] | Promise<readonly HeadContentTag[]>;

/** What one matched route contributed, as `projectLane` stamps it onto a match. */
export interface MatchAssets {
  meta?: readonly HeadMeta[];
  links?: readonly HeadTag[];
  headScripts?: readonly HeadContentTag[];
  styles?: readonly HeadContentTag[];
  scripts?: readonly HeadContentTag[];
}

/**
 * Dedup identity for a link, style or head script.
 *
 * Theirs is `JSON.stringify(tag)`, which makes two tags that MEAN the same thing
 * — a canonical URL, an icon at a new href — two different tags, so a child
 * cannot replace a parent's. The three semantic singletons below are the whole
 * of the divergence; everything else falls back to the same
 * whole-tag comparison they use, so an ordinary stylesheet or preload still
 * coexists with every other one.
 */
function linkIdentity(attrs: HeadTag): string {
  const rel = attrs.rel === undefined ? "" : String(attrs.rel);
  // A document has exactly one canonical URL. Keying on the href is what lets a
  // page and its layout each ship one.
  if (rel === "canonical") return "link:canonical";
  // An icon is REPLACED, not accumulated — but one size is not another icon.
  if (rel === "icon" || rel === "apple-touch-icon" || rel === "mask-icon") {
    return `link:${rel}:${String(attrs.sizes ?? "")}:${String(attrs.type ?? "")}`;
  }
  // `hreflang` is what makes one alternate different from another; without it
  // every alternate on a multilingual page replaces the last.
  if (rel === "alternate" && attrs.hreflang !== undefined) {
    return `link:alternate:${String(attrs.hreflang)}:${String(attrs.type ?? "")}`;
  }
  return `link:${JSON.stringify(attrs)}`;
}

/**
 * A meta value as a KEY fragment.
 *
 * `HeadMeta` is `Record<string, unknown>` because `script:ld+json` carries an
 * object, so an attribute value is only a string by convention. Anything that
 * is not a primitive is not an identity — it is a mistake — and `[object
 * Object]` as a dedup key would silently collapse every one of them together.
 */
function keyPart(value: unknown): string | null {
  const kind = typeof value;
  if (kind === "string" || kind === "number" || kind === "boolean") return String(value);
  return null;
}

function metaIdentity(meta: HeadMeta): string | null {
  if (meta.charset !== undefined || meta.charSet !== undefined) return "charset";
  // SEPARATE namespaces. Theirs is `m.name ?? m.property`, one bucket.
  for (const namespace of ["name", "property", "http-equiv", "httpEquiv"] as const) {
    const value = keyPart(meta[namespace]);
    if (value === null) continue;
    const media = keyPart(meta.media);
    return `meta:${namespace}:${value}${media === null ? "" : `:media=${media}`}`;
  }
  return null;
}

function push(out: ManagedTag[], seen: Set<string>, identity: string, tag: ManagedTag): void {
  if (seen.has(identity)) return;
  seen.add(identity);
  out.push(tag);
}

/**
 * One tag per identity: the DEEPEST route's attributes, at the SHALLOWEST
 * route's position.
 *
 * Both halves matter and they pull opposite ways. A child's `rel="canonical"`
 * must beat its layout's — that is the whole point of an identity — while a
 * layout's stylesheet must still come before the page's, because CSS order is
 * cascade order. Keeping the first position and the last attributes is the only
 * combination that gives both.
 */
function collapse(entries: readonly { identity: string; tag: ManagedTag }[]): ManagedTag[] {
  const at = new Map<string, number>();
  const out: ManagedTag[] = [];
  for (const entry of entries) {
    const seen = at.get(entry.identity);
    if (seen === undefined) {
      at.set(entry.identity, out.length);
      out.push(entry.tag);
      continue;
    }
    out[seen] = entry.tag;
  }
  return out;
}

function attrsOf(source: Readonly<Record<string, unknown>>, nonce?: string): ManagedTag["attrs"] {
  const out: Record<string, string | number | boolean | undefined> = {};
  for (const [name, value] of Object.entries(source)) {
    if (name === "children" || value === undefined || value === null) continue;
    out[name] = value as string | number | boolean;
  }
  if (nonce !== undefined) out.nonce = nonce;
  return out;
}

/**
 * The matched chain's head, merged — `useTags`'s algorithm.
 *
 * DEEPEST FIRST for meta, so the first `title` found wins and a child's
 * `description` shadows its layout's; the result is reversed at the end so the
 * document reads outermost-first. Links, styles and head scripts are appended
 * in chain order, deduplicated.
 */
export function resolveHead(
  matches: readonly MatchAssets[],
  options?: { readonly nonce?: string },
): ManagedTag[] {
  const nonce = options?.nonce;
  const meta: ManagedTag[] = [];
  const seenMeta = new Set<string>();
  let title: ManagedTag | undefined;

  for (let index = matches.length - 1; index >= 0; index--) {
    const list = matches[index]?.meta;
    if (list === undefined) continue;
    for (let inner = list.length - 1; inner >= 0; inner--) {
      const entry = list[inner];
      if (entry === undefined) continue;

      if (typeof entry.title === "string") {
        title ??= { tag: "title", children: entry.title };
        continue;
      }
      const structured = entry["script:ld+json"];
      if (structured !== undefined) {
        // JSON-LD is a script, not a meta, and it is never deduplicated: two
        // routes describing two different things both belong in the document.
        try {
          meta.push({
            tag: "script",
            attrs: { type: "application/ld+json", nonce },
            children: JSON.stringify(structured),
          });
        } catch {
          // A cycle or a BigInt. A page is not worth failing over its rich card.
        }
        continue;
      }
      const identity = metaIdentity(entry);
      const tag: ManagedTag = { tag: "meta", attrs: attrsOf(entry, nonce) };
      if (identity === null) meta.push(tag);
      else push(meta, seenMeta, identity, tag);
    }
  }
  if (title !== undefined) meta.push(title);
  meta.reverse();

  const links: { identity: string; tag: ManagedTag }[] = [];
  const styles: { identity: string; tag: ManagedTag }[] = [];
  const scripts: { identity: string; tag: ManagedTag }[] = [];
  for (const match of matches) {
    for (const link of match.links ?? []) {
      links.push({
        identity: linkIdentity(link),
        tag: { tag: "link", attrs: attrsOf(link, nonce) },
      });
    }
    for (const style of match.styles ?? []) {
      styles.push({
        identity: `style:${JSON.stringify(style)}`,
        tag: { tag: "style", attrs: attrsOf(style, nonce), children: style.children },
      });
    }
    for (const script of match.headScripts ?? []) {
      scripts.push({
        identity: `script:${JSON.stringify(script)}`,
        tag: { tag: "script", attrs: attrsOf(script, nonce), children: script.children },
      });
    }
  }
  return [...meta, ...collapse(links), ...collapse(styles), ...collapse(scripts)];
}

/** The BODY scripts, from each match's `scripts`. Never deduplicated — see `Scripts`. */
export function resolveScripts(
  matches: readonly MatchAssets[],
  options?: { readonly nonce?: string },
): ManagedTag[] {
  const out: ManagedTag[] = [];
  for (const match of matches) {
    for (const script of match.scripts ?? []) {
      out.push({
        tag: "script",
        attrs: attrsOf(script, options?.nonce),
        children: script.children,
      });
    }
  }
  return out;
}

/**
 * Run every matched route's `head` and `scripts`, and stamp the results.
 *
 * This is `projectLane` (`router-core/src/load-server.ts:618-653`): per match,
 * `head` and `scripts` are awaited together and their four fields land on the
 * match as `meta`, `links`, `headScripts`, `styles` and `scripts`. A route that
 * declares neither costs nothing.
 *
 * A THROW IS SWALLOWED, as theirs is. A broken `head` must not take the page
 * with it: the document loses that route's tags and keeps everything else,
 * which is what a `console.error` and a rendered page buys over a 500.
 */
export async function projectHead<Params, Data>(
  matches: readonly {
    readonly params: Params;
    readonly loaderData: Data | undefined;
    readonly definition: {
      readonly head?: Head<Params, Data> | HeadResult;
      readonly scripts?: BodyScripts<Params, Data>;
    };
  }[],
  options?: { readonly nonce?: string; readonly onError?: (error: unknown) => void },
): Promise<MatchAssets[]> {
  return await Promise.all(
    matches.map(async (match): Promise<MatchAssets> => {
      const { head, scripts } = match.definition;
      if (head === undefined && scripts === undefined) return {};
      const context: HeadContext<Params, Data> = {
        params: match.params,
        loaderData: match.loaderData,
        matches,
        match,
        ssr: options?.nonce === undefined ? undefined : { nonce: options.nonce },
      };
      try {
        // `head` may be a plain OBJECT as well as a function — a file route
        // already declares `ssr` and `prerender` as plain module exports and a
        // static head has nothing to compute. TanStack takes only a function.
        const declared = typeof head === "function" ? head(context) : head;
        const [resolved, body] = await Promise.all([declared, scripts?.(context)]);
        return {
          meta: resolved?.meta,
          links: resolved?.links,
          headScripts: resolved?.scripts,
          styles: resolved?.styles,
          scripts: body,
        };
      } catch (error) {
        options?.onError?.(error);
        return {};
      }
    }),
  );
}

/** Void elements among the tags a head can carry: no closing tag, no children. */
const VOID = new Set(["meta", "link"]);

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Text inside a raw-text element, where an HTML escaper would CORRUPT it —
 * `&amp;` inside a `<script>` is four characters of JavaScript.
 *
 * The tokenizer ends the element at `</` followed by the tag name, so that is
 * the only sequence that has to go, and it goes by breaking the `<`.
 * `@barqjs/server`'s `ssr.ts` makes the same choice for the same reason.
 */
function escapeRawText(value: string, tag: string): string {
  return value.replaceAll(new RegExp(`</(?=${tag}\\b)`, "gi"), "<\\/");
}

/** The attribute the client patcher owns. Never written by an application. */
export const OWNED = "data-barq-head";

/** One managed tag as markup, for the server. */
export function renderTag(tag: ManagedTag, identity?: string): string {
  let attributes = identity === undefined ? "" : ` ${OWNED}="${escapeAttribute(identity)}"`;
  for (const [name, value] of Object.entries(tag.attrs ?? {})) {
    if (value === undefined || value === false) continue;
    if (!/^[a-zA-Z][\w:.-]*$/.test(name)) continue;
    attributes += value === true ? ` ${name}` : ` ${name}="${escapeAttribute(String(value))}"`;
  }
  if (VOID.has(tag.tag)) return `<${tag.tag}${attributes}>`;
  const raw = tag.tag === "script" || tag.tag === "style";
  const text =
    tag.children === undefined
      ? ""
      : raw
        ? escapeRawText(tag.children, tag.tag)
        : escapeAttribute(tag.children);
  return `<${tag.tag}${attributes}>${text}</${tag.tag}>`;
}

/** Every managed tag as markup, in order. */
export function renderTags(tags: readonly ManagedTag[]): string {
  return tags.map((tag, index) => renderTag(tag, `${tag.tag}:${index}`)).join("");
}
