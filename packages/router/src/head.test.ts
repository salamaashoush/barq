/**
 * The merge, checked against TanStack's `useTags` semantics.
 *
 * Where a test is named after one of their bugs it is a DIVERGENCE, recorded in
 * `DESIGN.md` P6-4 — the API is theirs and only the dedup identity differs.
 */

import { describe, expect, test } from "bun:test";

import {
  type MatchAssets,
  OWNED,
  applyTags,
  projectHead,
  renderTags,
  resolveHead,
  resolveScripts,
} from "./head.ts";

const html = (matches: readonly MatchAssets[]): string => renderTags(resolveHead(matches));

describe("meta", () => {
  test("title lives inside meta, and the DEEPEST match wins", () => {
    expect(html([{ meta: [{ title: "Site" }] }, { meta: [{ title: "Page" }] }])).toContain(
      "<title",
    );
    expect(html([{ meta: [{ title: "Site" }] }, { meta: [{ title: "Page" }] }])).toContain("Page");
    expect(html([{ meta: [{ title: "Site" }] }, { meta: [{ title: "Page" }] }])).not.toContain(
      "Site",
    );
  });

  test("a child's description shadows its layout's", () => {
    const out = html([
      { meta: [{ name: "description", content: "site" }] },
      { meta: [{ name: "description", content: "page" }] },
    ]);
    expect(out).toContain("page");
    expect(out).not.toContain(">site<");
    expect(out.match(/name="description"/g)).toHaveLength(1);
  });

  test("DIVERGENCE: name, property and http-equiv are separate namespaces", () => {
    // Theirs keys on `m.name ?? m.property`, one bucket, so these collide.
    const out = html([
      {
        meta: [
          { name: "author", content: "by name" },
          { property: "author", content: "by property" },
        ],
      },
    ]);
    expect(out).toContain("by name");
    expect(out).toContain("by property");
  });

  test("media forks a meta identity, so light and dark theme-color coexist", () => {
    const out = html([
      {
        meta: [
          { name: "theme-color", media: "(prefers-color-scheme: light)", content: "#fff" },
          { name: "theme-color", media: "(prefers-color-scheme: dark)", content: "#000" },
        ],
      },
    ]);
    expect(out).toContain("#fff");
    expect(out).toContain("#000");
  });

  test("charset is a singleton whatever spelling it arrives in", () => {
    const out = html([{ meta: [{ charset: "utf-8" }] }, { meta: [{ charSet: "iso-8859-1" }] }]);
    // The ATTRIBUTE, not the ownership identity — which is also "charset".
    expect(out.match(/\scharset=|\scharSet=/g)).toHaveLength(1);
    expect(out).toContain("iso-8859-1");
  });

  test("`script:ld+json` becomes a script, and two routes' both survive", () => {
    const out = html([
      { meta: [{ "script:ld+json": { "@type": "Organization" } }] },
      { meta: [{ "script:ld+json": { "@type": "Article" } }] },
    ]);
    expect(out).toContain("application/ld+json");
    expect(out).toContain("Organization");
    expect(out).toContain("Article");
  });

  test("a JSON-LD value that cannot serialise loses its tag, not the page", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() =>
      html([{ meta: [{ "script:ld+json": cycle }, { title: "still here" }] }]),
    ).not.toThrow();
    expect(html([{ meta: [{ "script:ld+json": cycle }, { title: "still here" }] }])).toContain(
      "still here",
    );
  });
});

describe("links", () => {
  test("DIVERGENCE (their #6719): a child overrides a parent's canonical", () => {
    // `appendUniqueUserTags` keys on `JSON.stringify(tag)`, so theirs renders both.
    const out = html([
      { links: [{ rel: "canonical", href: "https://x/a" }] },
      { links: [{ rel: "canonical", href: "https://x/b" }] },
    ]);
    expect(out).toContain("https://x/b");
    expect(out).not.toContain("https://x/a");
  });

  test("an icon is replaced at the same size, and a different size is a different icon", () => {
    const out = html([
      { links: [{ rel: "icon", sizes: "32x32", href: "/old.png" }] },
      {
        links: [
          { rel: "icon", sizes: "32x32", href: "/new.png" },
          { rel: "icon", sizes: "16x16", href: "/small.png" },
        ],
      },
    ]);
    expect(out).not.toContain("/old.png");
    expect(out).toContain("/new.png");
    expect(out).toContain("/small.png");
  });

  test("two stylesheets coexist, because a document wants both", () => {
    const out = html([
      { links: [{ rel: "stylesheet", href: "/a.css" }] },
      { links: [{ rel: "stylesheet", href: "/b.css" }] },
    ]);
    expect(out).toContain("/a.css");
    expect(out).toContain("/b.css");
  });

  test("alternates are distinguished by hreflang AND type", () => {
    const out = html([
      {
        links: [
          { rel: "alternate", hreflang: "en", href: "/en" },
          { rel: "alternate", hreflang: "fr", href: "/fr" },
          { rel: "alternate", type: "application/rss+xml", hreflang: "en", href: "/rss" },
        ],
      },
    ]);
    expect(out).toContain("/en");
    expect(out).toContain("/fr");
    expect(out).toContain("/rss");
  });

  test("the winner takes the SHALLOWEST position, so cascade order survives", () => {
    // A child's canonical must beat its layout's, and a layout's stylesheet must
    // still come before the page's. Keeping the first position and the last
    // attributes is the only combination that gives both.
    const out = html([
      {
        links: [
          { rel: "stylesheet", href: "/layout.css" },
          { rel: "canonical", href: "/a" },
        ],
      },
      {
        links: [
          { rel: "canonical", href: "/b" },
          { rel: "stylesheet", href: "/page.css" },
        ],
      },
    ]);
    expect(out.indexOf("/layout.css")).toBeLessThan(out.indexOf("/page.css"));
    expect(out).toContain("/b");
    expect(out).not.toContain('href="/a"');
  });

  test("DIVERGENCE: a lone tag still goes through dedup", () => {
    // `appendUniqueUserTags` returns early at `manifest.ts:153-156` when there
    // is exactly one tag, so a single canonical bypasses their dedup entirely.
    const out = html([
      { links: [{ rel: "canonical", href: "/a" }] },
      { links: [{ rel: "canonical", href: "/b" }] },
    ]);
    expect(out.match(/rel="canonical"/g)).toHaveLength(1);
  });
});

describe("render", () => {
  test("every element carries the ownership attribute", () => {
    const out = html([{ meta: [{ title: "T" }, { name: "a", content: "b" }] }]);
    expect(out.match(new RegExp(OWNED, "g"))).toHaveLength(2);
  });

  test("an attribute value cannot break out of its attribute", () => {
    const out = html([{ meta: [{ name: "x", content: '"><script>alert(1)</script>' }] }]);
    expect(out).not.toContain("<script>alert");
    expect(out).toContain("&quot;&gt;");
  });

  test("a title cannot open a tag", () => {
    expect(html([{ meta: [{ title: "</title><script>x</script>" }] }])).not.toContain("<script>x");
  });

  test("inline script text is NOT entity-escaped — only the closing sequence is", () => {
    const out = html([{ headScripts: [{ children: 'if (a && b) x("</script>")' }] }]);
    expect(out).toContain("a && b");
    expect(out).toContain("<\\/script>");
  });

  test("a nonce rides on everything the caller asked for", () => {
    const out = renderTags(
      resolveHead([{ meta: [{ name: "a", content: "b" }], headScripts: [{ children: "x" }] }], {
        nonce: "n0nce",
      }),
    );
    expect(out.match(/nonce="n0nce"/g)).toHaveLength(2);
  });

  test("the same input renders byte-identically", () => {
    const matches: MatchAssets[] = [
      { meta: [{ title: "A" }, { name: "d", content: "x" }] },
      { links: [{ rel: "canonical", href: "/a" }] },
    ];
    expect(html(matches)).toBe(html(matches));
  });
});

describe("projectHead", () => {
  const match = (definition: Record<string, unknown>, loaderData?: unknown) => ({
    params: { id: "7" },
    loaderData,
    definition: definition as never,
  });

  test("head is handed params and loaderData, as TanStack's is", async () => {
    const assets = await projectHead([
      match(
        {
          head: (context: {
            params: { id: string };
            loaderData: { name: string } | undefined;
          }) => ({
            meta: [{ title: `${context.loaderData?.name} #${context.params.id}` }],
          }),
        },
        { name: "Ada" },
      ),
    ]);
    expect(renderTags(resolveHead(assets))).toContain("Ada #7");
  });

  test("a route declaring neither costs nothing", async () => {
    expect(await projectHead([match({})])).toEqual([{}]);
  });

  test("a THROWING head loses its tags and keeps the page", async () => {
    const seen: unknown[] = [];
    const assets = await projectHead(
      [
        match({
          head: () => {
            throw new Error("boom");
          },
        }),
        match({ head: () => ({ meta: [{ title: "survived" }] }) }),
      ],
      { onError: (error) => seen.push(error) },
    );
    expect(seen).toHaveLength(1);
    expect(renderTags(resolveHead(assets))).toContain("survived");
  });

  test("`scripts` is the BODY half and is never deduplicated", async () => {
    const assets = await projectHead([
      match({ scripts: () => [{ src: "/a.js" }] }),
      match({ scripts: () => [{ src: "/a.js" }] }),
    ]);
    expect(resolveScripts(assets)).toHaveLength(2);
  });

  test("an async head is awaited", async () => {
    const assets = await projectHead([
      match({ head: async () => ({ meta: [{ title: "late" }] }) }),
    ]);
    expect(renderTags(resolveHead(assets))).toContain("late");
  });
});

/**
 * The framework's own head tags live in the SAME list as the route's.
 *
 * TanStack's `buildTagsFromMatches` returns one array holding the route meta,
 * the manifest's preloads, the route links, the manifest CSS, the styles and
 * the head scripts (`react-router/src/headContentUtils.tsx:180-187`). One list
 * is what lets `<HeadContent />` be the only thing that writes to `<head>`,
 * which is what a hydrated document needs: the claim on an element takes its
 * children WHOLE and reconciles away whatever the tree did not produce.
 */
describe("the framework's own tags", () => {
  const matches: readonly MatchAssets[] = [
    { meta: [{ title: "Page" }], links: [{ rel: "icon", href: "/i.png" }] },
  ];

  test("preloads and stylesheets join the one managed list, in their order", () => {
    const tags = resolveHead(matches, { preloads: ["/a.js", "/b.js"], css: ["/s.css"] });
    const order = tags.map((tag) => `${tag.tag}:${String(tag.attrs?.rel ?? tag.tag)}`);
    // Preloads ahead of the route's own links so the browser starts fetching
    // the matched chunks first; the build's stylesheets after them, so a route
    // can still say something about a link.
    expect(order).toEqual([
      "title:title",
      "link:modulepreload",
      "link:modulepreload",
      "link:icon",
      "link:stylesheet",
    ]);
    expect(tags.map((tag) => tag.attrs?.href)).toContain("/a.js");
    expect(tags.map((tag) => tag.attrs?.href)).toContain("/s.css");
  });

  /**
   * THE REGRESSION GUARD, and it caught a real one.
   *
   * Folding the preloads into the list gave them an identity, which made the
   * patcher OWN them — and `installHead` rebuilds its list on the client, where
   * there is no manifest to rebuild a preload from. The first navigation
   * therefore removed every modulepreload the server wrote.
   *
   * They are `unowned` until `<HeadContent />` owns `<head>` outright.
   */
  test("a framework tag is not the patcher's, so a navigation leaves it alone", () => {
    const markup = renderTags(resolveHead(matches, { preloads: ["/a.js"], css: ["/s.css"] }));
    expect(markup).toContain('rel="modulepreload"');
    expect(markup).not.toContain(`${OWNED}="modulepreload:/a.js"`);
    expect(markup).not.toContain(`${OWNED}="stylesheet:/s.css"`);
    // The route's own tags stay owned — the patcher still manages those.
    expect(markup).toContain(`${OWNED}="title"`);

    const target = document.implementation.createHTMLDocument("t");
    target.head.innerHTML = markup;
    // A navigation whose list has no preloads at all: the unowned tags survive
    // it, exactly as an analytics snippet or an extension's link does.
    applyTags(resolveHead([{ meta: [{ title: "Next" }] }]), target);
    expect(target.head.querySelectorAll('link[rel="modulepreload"]')).toHaveLength(1);
    expect(target.head.querySelectorAll('link[rel="stylesheet"]')).toHaveLength(1);
    expect(target.title).toBe("Next");
  });
});
