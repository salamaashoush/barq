/**
 * The document head: what a route declares, how the chain merges, and the two
 * ways it is delivered.
 *
 * ONE reducer, two deliveries. `resolveHead` is pure — matches to winners — and
 * `renderHead` (server) and `applyHead` (client navigation) both consume its
 * output. That split is TanStack's own retrospective conclusion about their head
 * system: their merge model was fine and their DELIVERY model was the flaw,
 * because the two were entangled.
 *
 * WHY A ROUTE DECLARES IT STATICALLY, and why loader data is not in scope. A
 * `<title>` written into the BODY does not win: `document.title` is the first
 * title in tree order, so a shell that already emitted one keeps it — and
 * `<meta>`/`<link>` in the body are not hoisted by the parser at all. Measured
 * in Chrome, and Next.js confirms it the hard way by shipping a byte-level
 * stream rewrite purely to rescue `<link rel="icon">` out of the body. So head
 * content that must reach a crawler has to be in the SHELL bytes, and the shell
 * flushes before any loader has settled. `head` is therefore resolved in the
 * same pre-shell phase as `beforeLoad`, from `{ params, search, context }`.
 *
 * A title that genuinely depends on loader data is a known limit, stated in
 * `DESIGN-FRONTDOOR.md` rather than left to be discovered, and the mechanism
 * that would close it — head patch ops parked under a boundary key and applied
 * by the same swap that reveals the boundary — is named there too.
 */

import { effect } from "@barqjs/core";

/** One tag's attributes. `key` is an identity override and is not rendered. */
export type HeadAttrs = Record<string, string | number | boolean | null | undefined>;

export interface HeadContent extends HeadAttrs {
  /** Text content, for `script`, `style` and `noscript`. */
  readonly children?: string;
}

/**
 * What a route contributes to the head.
 *
 * Grouped by tag rather than a flat list, because the flat list is what makes
 * every one of these libraries need a `tag` discriminant on every entry and
 * makes `title` a special case twice over.
 */
export interface HeadDescriptor {
  readonly title?: string;
  readonly base?: HeadAttrs;
  readonly meta?: readonly HeadAttrs[];
  readonly link?: readonly HeadAttrs[];
  readonly style?: readonly HeadContent[];
  readonly script?: readonly HeadContent[];
  readonly noscript?: readonly HeadContent[];
}

/** What `head` is handed. Everything here is resolved BEFORE the shell flushes. */
export interface HeadContext<Params = Record<string, string>> {
  readonly params: Params;
  readonly search: URLSearchParams;
  readonly context: Record<string, unknown>;
  readonly url: URL;
}

export type Head<Params = Record<string, string>> =
  | HeadDescriptor
  | ((context: HeadContext<Params>) => HeadDescriptor | Promise<HeadDescriptor>);

/** One resolved tag, ready to render or to patch. */
export interface ResolvedTag {
  readonly tag: string;
  readonly attrs: HeadAttrs;
  readonly children?: string;
  /** What this tag competes with. Two tags with one identity cannot both win. */
  readonly identity: string;
}

/** The head of one location: every tag that survived the merge, in order. */
export type ResolvedHead = readonly ResolvedTag[];

/**
 * What a tag competes with, in the order the questions are asked.
 *
 * Adapted from `@solidjs/web@2.0.0-rc`'s `replaceableIdentity`, which is the
 * best in the field, and two shipped bugs are avoided by construction:
 *
 * - `content` is NOT in the key. `@solidjs/meta` puts it there, so a page cannot
 *   override a layout's `<meta name="description">` — both render.
 * - The whole tag is NOT stringified. TanStack dedups on `JSON.stringify(tag)`,
 *   so a child cannot override a parent's `rel="canonical"` (their #6719, open),
 *   and two identical tags whose props were written in a different order both
 *   survive.
 *
 * `name`, `property` and `http-equiv` are separate namespaces — collapsing them
 * is what makes `<meta name="author">` and `<meta property="author">` collide.
 * `media` forks the identity, so a light and a dark `theme-color` coexist
 * without either being keyed by its content. An unkeyed tag nothing else claims
 * falls back to a unique identity, so it never collides by accident.
 */
export function identityOf(tag: string, attrs: HeadAttrs, ordinal: number): string {
  if (tag === "title") return "title";
  if (tag === "base") return "base";
  if (tag === "meta" && attrs.charset !== undefined && attrs.charset !== null) return "charset";

  const key = attrs.key;
  if (typeof key === "string" && key !== "") return `${tag}:key:${key}`;

  if (tag === "meta") {
    for (const namespace of ["name", "property", "http-equiv"] as const) {
      const value = attrs[namespace];
      if (value === undefined || value === null) continue;
      const media = attrs.media;
      const fork = media === undefined || media === null ? "" : `:media=${String(media)}`;
      return `meta:${namespace}:${String(value)}${fork}`;
    }
    return `meta:#${ordinal}`;
  }

  if (tag === "link") {
    const rel = attrs.rel === undefined || attrs.rel === null ? "" : String(attrs.rel);
    // A SEMANTIC singleton: a document has exactly one canonical URL, so the
    // href cannot be in the key — that is precisely the shape that lets a page
    // and its layout each ship one, which is TanStack's #6719. `unhead` reaches
    // the same answer and puts it ahead of the explicit `key` for the same
    // reason: a second canonical is never what was meant.
    if (rel === "canonical") return "link:canonical";
    // An icon is replaced rather than accumulated, and the sizes and type are
    // part of what makes one icon a different icon.
    if (rel === "icon" || rel === "apple-touch-icon" || rel === "mask-icon") {
      const sizes = attrs.sizes === undefined ? "" : `:sizes=${String(attrs.sizes)}`;
      const type = attrs.type === undefined ? "" : `:type=${String(attrs.type)}`;
      return `link:${rel}${sizes}${type}`;
    }
    // `hreflang` is what distinguishes one alternate from another; without it
    // every `rel="alternate"` on a multilingual page replaces the last.
    if (rel === "alternate" && attrs.hreflang !== undefined && attrs.hreflang !== null) {
      return `link:alternate:${String(attrs.hreflang)}`;
    }
    const href = attrs.href === undefined || attrs.href === null ? "" : String(attrs.href);
    return `link:${rel}:${href}`;
  }

  return `${tag}:#${ordinal}`;
}

/**
 * Render order, once the merge has decided WHAT.
 *
 * `charset` first is not cosmetic: a `<meta charset>` past the first 1024 bytes
 * of the document is ignored, and the parser may already have committed to a
 * different encoding. `base` follows, because every relative URL after it
 * resolves against it. `title` is next so it is early in tree order — which is
 * what `document.title` reads — and the rest follow in a fixed order so a
 * document's head is byte-stable across renders.
 */
const ORDER: Record<string, number> = {
  charset: 0,
  base: 1,
  title: 2,
  meta: 3,
  link: 4,
  style: 5,
  script: 6,
  noscript: 7,
};

function rank(tag: ResolvedTag): number {
  if (tag.identity === "charset") return ORDER.charset;
  return ORDER[tag.tag] ?? 9;
}

interface Group {
  readonly seq: number;
  readonly tags: ResolvedTag[];
}

function tagsOf(descriptor: HeadDescriptor, seq: number): ResolvedTag[] {
  const out: ResolvedTag[] = [];
  let ordinal = 0;
  const push = (tag: string, attrs: HeadAttrs, children?: string): void => {
    const identity = identityOf(tag, attrs, seq * 1000 + ordinal++);
    out.push({ tag, attrs, children, identity });
  };

  if (descriptor.title !== undefined) push("title", {}, descriptor.title);
  if (descriptor.base !== undefined) push("base", descriptor.base);
  for (const attrs of descriptor.meta ?? []) push("meta", attrs);
  for (const attrs of descriptor.link ?? []) push("link", attrs);
  for (const { children, ...attrs } of descriptor.style ?? []) push("style", attrs, children);
  for (const { children, ...attrs } of descriptor.script ?? []) push("script", attrs, children);
  for (const { children, ...attrs } of descriptor.noscript ?? []) push("noscript", attrs, children);
  return out;
}

/**
 * The chain's descriptors, outermost first, merged into the tags that survive.
 *
 * THE RULE, and it is `@solidjs/web`'s: within ONE group, same-identity tags
 * COEXIST — three `og:image` in one route's `head` all survive, which is what
 * an image carousel needs. Across groups, a deeper route REPLACES the shallower
 * one's whole set for that identity, so a page overriding a layout's `og:image`
 * gets its own list rather than both lists concatenated.
 *
 * That is compositional. `unhead` solves the same problem with a hardcoded
 * allowlist of meta names that are allowed to be arrays, which cannot express
 * "this route's three, not that route's two".
 */
export function resolveHead(descriptors: readonly (HeadDescriptor | undefined)[]): ResolvedHead {
  const groups: Group[] = [];
  for (const [seq, descriptor] of descriptors.entries()) {
    if (descriptor === undefined) continue;
    groups.push({ seq, tags: tagsOf(descriptor, seq) });
  }

  const winners = new Map<string, ResolvedTag[]>();
  for (const group of groups) {
    const byIdentity = new Map<string, ResolvedTag[]>();
    for (const tag of group.tags) {
      const list = byIdentity.get(tag.identity);
      if (list === undefined) byIdentity.set(tag.identity, [tag]);
      else list.push(tag);
    }
    for (const [identity, tags] of byIdentity) {
      // A singleton keeps only the LAST of its own group: two `<title>`s in one
      // route's descriptor is a mistake with one honest reading.
      winners.set(identity, identity === "title" || identity === "base" ? tags.slice(-1) : tags);
    }
  }

  const out: ResolvedTag[] = [];
  for (const tags of winners.values()) out.push(...tags);
  // A stable sort, so equal ranks keep insertion order and the head is
  // byte-identical for the same input.
  return out
    .map((tag, index) => ({ tag, index }))
    .toSorted((a, b) => rank(a.tag) - rank(b.tag) || a.index - b.index)
    .map((entry) => entry.tag);
}

/** The attribute the client patcher uses to know what it owns. */
export const HEAD_OWNER = "data-barq-head";

/** Void elements among the tags a head can carry: no closing tag, no children. */
const VOID = new Set(["meta", "link", "base"]);

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * Text inside a raw-text element, where an HTML escaper would CORRUPT the
 * content — `&amp;` inside a `<script>` is four characters of JavaScript.
 *
 * The tokenizer ends the element at `</` followed by the tag name, so that is
 * the only sequence that has to go, and it goes by breaking the `<` rather than
 * by entity-escaping anything. `@barqjs/server`'s `ssr.ts` makes the same choice
 * for the same reason.
 */
function escapeRawText(value: string, tag: string): string {
  return value.replaceAll(new RegExp(`</(?=${tag}\\b)`, "gi"), "<\\/");
}

function attributesOf(tag: ResolvedTag, nonce?: string): string {
  let out = ` ${HEAD_OWNER}="${escapeAttribute(tag.identity)}"`;
  for (const [name, value] of Object.entries(tag.attrs)) {
    // `key` is an identity override, not an attribute, and writing it would put
    // an author's private naming into the document.
    if (name === "key" || value === undefined || value === null || value === false) continue;
    if (!/^[a-zA-Z][\w:.-]*$/.test(name)) continue;
    if (value === true) {
      out += ` ${name}`;
      continue;
    }
    out += ` ${name}="${escapeAttribute(String(value))}"`;
  }
  if (nonce !== undefined && (tag.tag === "script" || tag.tag === "style")) {
    out += ` nonce="${escapeAttribute(nonce)}"`;
  }
  return out;
}

/**
 * The resolved head as markup, for the shell.
 *
 * Every element carries `data-barq-head`, which is what makes the first client
 * navigation able to REPLACE what the server wrote instead of appending beside
 * it — and what stops it touching a tag an extension or an analytics snippet
 * put there.
 */
export function renderHead(head: ResolvedHead, nonce?: string): string {
  let out = "";
  for (const tag of head) {
    const attributes = attributesOf(tag, nonce);
    if (VOID.has(tag.tag)) {
      out += `<${tag.tag}${attributes}>`;
      continue;
    }
    const raw = tag.tag === "script" || tag.tag === "style";
    const text =
      tag.children === undefined
        ? ""
        : raw
          ? escapeRawText(tag.children, tag.tag)
          : escapeText(tag.children);
    out += `<${tag.tag}${attributes}>${text}</${tag.tag}>`;
  }
  return out;
}

/**
 * Patch `document.head` to be this head, on a client navigation.
 *
 * THE RULE, and every failure in this area is a violation of it: only nodes
 * carrying `data-barq-head` are ever removed or rewritten. An analytics
 * snippet, a browser extension's injected `<link>`, a tag the application added
 * by hand — all of them are invisible to this function. `@solidjs/meta`'s
 * cleanup, `unhead`'s DOM patcher and TanStack's `useTags` each converged on the
 * same discipline after shipping the version that did not.
 *
 * Reuse before replace, per identity: a `<link rel="canonical">` whose href has
 * not changed is left alone rather than removed and re-created, so a navigation
 * between two routes that share most of their head touches almost nothing. That
 * is what stops the title flicker and the favicon re-request the naive
 * remove-all-then-add-all produces.
 */
export function applyHead(head: ResolvedHead, document_: Document = document): void {
  const owned = new Map<string, Element[]>();
  for (const node of document_.head.querySelectorAll(`[${HEAD_OWNER}]`)) {
    const identity = node.getAttribute(HEAD_OWNER) as string;
    const list = owned.get(identity);
    if (list === undefined) owned.set(identity, [node]);
    else list.push(node);
  }

  const wanted = new Map<string, ResolvedTag[]>();
  for (const tag of head) {
    const list = wanted.get(tag.identity);
    if (list === undefined) wanted.set(tag.identity, [tag]);
    else list.push(tag);
  }

  for (const [identity, nodes] of owned) {
    if (wanted.has(identity)) continue;
    for (const node of nodes) node.remove();
    // The document's ORIGINAL title, restored when nothing claims it any more.
    // Removing the element is not enough: `document.title` falls back to the
    // next title in tree order, and on a page whose only title was ours that is
    // the empty string, which shows as the URL in a tab.
    if (identity === "title") document_.title = originalTitle(document_);
  }

  for (const [identity, tags] of wanted) {
    const existing = owned.get(identity) ?? [];
    let reused = 0;
    for (const tag of tags) {
      const match = existing.find((node, index) => index >= reused && matches(node, tag));
      if (match !== undefined) {
        // Keep it, and keep its position: an unchanged tag is not re-created,
        // so the browser does not re-request an icon or a preloaded font.
        existing.splice(existing.indexOf(match), 1);
        reused++;
        continue;
      }
      document_.head.append(elementFor(tag, document_));
    }
    for (const leftover of existing) leftover.remove();
    if (identity === "title" && tags.length > 0) {
      document_.title = tags[tags.length - 1]?.children ?? "";
    }
  }
}

/**
 * The title the document had before any route claimed one.
 *
 * Captured once, on the first patch, because by the second navigation the
 * original element is gone and there is nothing left to read it from.
 */
let captured: string | null = null;
function originalTitle(document_: Document): string {
  captured ??= document_.head.querySelector(`title:not([${HEAD_OWNER}])`)?.textContent ?? "";
  return captured;
}

/** Called by the boot before the first navigation, while the original is still there. */
export function captureHead(document_: Document = document): void {
  originalTitle(document_);
}

function matches(node: Element, tag: ResolvedTag): boolean {
  if (node.tagName.toLowerCase() !== tag.tag) return false;
  const wanted = Object.entries(tag.attrs).filter(
    ([name, value]) => name !== "key" && value !== undefined && value !== null && value !== false,
  );
  // `+1` for the ownership attribute this function itself wrote.
  if (node.attributes.length !== wanted.length + 1) return false;
  for (const [name, value] of wanted) {
    const found = node.getAttribute(name);
    if (value === true ? found === null : found !== String(value)) return false;
  }
  return (node.textContent ?? "") === (tag.children ?? "");
}

function elementFor(tag: ResolvedTag, document_: Document): Element {
  const node = document_.createElement(tag.tag);
  node.setAttribute(HEAD_OWNER, tag.identity);
  for (const [name, value] of Object.entries(tag.attrs)) {
    if (name === "key" || value === undefined || value === null || value === false) continue;
    if (!/^[a-zA-Z][\w:.-]*$/.test(name)) continue;
    node.setAttribute(name, value === true ? "" : String(value));
  }
  if (tag.children !== undefined) node.textContent = tag.children;
  return node;
}

/**
 * The matched chain's head, resolved.
 *
 * Called in the PRE-SHELL phase, after `preloadMatched` — so every route module
 * on the chain is already in the module cache and a `head` reached through the
 * generator's lazy wrapper resolves without a second round trip.
 *
 * Outermost first, and a route with no `head` contributes a hole rather than an
 * empty descriptor: an empty one would be a group, and a group REPLACES, so a
 * layout's title would be erased by every child that says nothing.
 */
export async function headOf<Params>(
  chain: readonly { readonly definition: { readonly head?: Head<Params> } }[] | null,
  context: Omit<HeadContext<Params>, "context"> & {
    /** Merged context PER DEPTH, as `runBeforeLoad` produces it. */
    readonly contexts: readonly Record<string, unknown>[];
  },
): Promise<ResolvedHead> {
  if (chain === null || chain.length === 0) return [];
  const descriptors = await Promise.all(
    chain.map(async (route, depth) => {
      const declared = route.definition.head;
      if (declared === undefined) return undefined;
      if (typeof declared !== "function") return declared;
      // Each route's OWN depth's context, not the leaf's: a layout that reads
      // `context.user` must see what it and its ancestors contributed, and
      // handing it the leaf's would let a child's key leak upward into a title
      // the layout is supposed to own.
      return await declared({
        params: context.params,
        search: context.search,
        url: context.url,
        context: context.contexts[depth] ?? {},
      });
    }),
  );
  return resolveHead(descriptors);
}

/**
 * Keep `document.head` in step with the router, for the life of the page.
 *
 * Installed by the client boot, never on the server: the server writes the head
 * into the shell and there is no navigation there to react to.
 *
 * THE ORDERING GUARD is the part that is not obvious. `headOf` awaits the route
 * modules, so two navigations in quick succession resolve on their own schedule
 * and can finish out of order — and the loser writing last leaves the document
 * describing a page nobody is looking at, which for `rel="canonical"` is a
 * search-index error rather than a cosmetic one. Each run takes a token and
 * writes only if it is still the newest.
 */
export function installHead(
  state: {
    readonly match: () => { readonly route: { readonly chain: readonly unknown[] } } | null;
    readonly location: () => { readonly pathname: string; readonly search: string };
    readonly contexts: () => readonly Record<string, unknown>[];
  },
  document_: Document = document,
): () => void {
  captureHead(document_);
  let newest = 0;
  return effect(() => {
    const match = state.match() as {
      readonly route: { readonly chain: readonly { definition: { head?: Head } }[] };
      readonly params: Record<string, string>;
    } | null;
    const location = state.location();
    const contexts = state.contexts();
    const mine = ++newest;
    const url = new URL(
      location.pathname + location.search,
      document_.defaultView?.location.origin ?? "http://localhost",
    );
    void headOf(match?.route.chain ?? null, {
      params: match?.params ?? {},
      search: url.searchParams,
      url,
      contexts,
    }).then((head) => {
      if (mine !== newest) return;
      applyHead(head, document_);
    });
  });
}
