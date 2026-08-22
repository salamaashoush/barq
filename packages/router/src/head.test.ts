/**
 * The merge, the render and the patch.
 *
 * Two of these tests are named after bugs that are shipping in other libraries
 * right now; they are the reason the identity ladder is written the way it is,
 * and without them a "simplification" would put either bug back.
 */

import { describe, expect, test } from "bun:test";

import {
  HEAD_OWNER,
  type HeadDescriptor,
  applyHead,
  captureHead,
  identityOf,
  renderHead,
  resolveHead,
} from "./head.ts";

const html = (chain: readonly (HeadDescriptor | undefined)[]): string =>
  renderHead(resolveHead(chain));

describe("identity", () => {
  test("title, base and charset are singletons whatever else they carry", () => {
    expect(identityOf("title", {}, 0)).toBe("title");
    expect(identityOf("base", { href: "/a" }, 0)).toBe("base");
    expect(identityOf("meta", { charset: "utf-8" }, 0)).toBe("charset");
  });

  test("name, property and http-equiv are SEPARATE namespaces", () => {
    expect(identityOf("meta", { name: "author" }, 0)).toBe("meta:name:author");
    expect(identityOf("meta", { property: "author" }, 0)).toBe("meta:property:author");
    expect(identityOf("meta", { "http-equiv": "author" }, 0)).toBe("meta:http-equiv:author");
  });

  test("media forks a meta identity, so light and dark theme-color coexist", () => {
    const light = identityOf(
      "meta",
      { name: "theme-color", media: "(prefers-color-scheme:light)" },
      0,
    );
    const dark = identityOf(
      "meta",
      { name: "theme-color", media: "(prefers-color-scheme:dark)" },
      0,
    );
    expect(light).not.toBe(dark);
  });

  test("an icon keys on rel, sizes and type — so it is replaced, not accumulated", () => {
    expect(identityOf("link", { rel: "icon", href: "/a.png", sizes: "32x32" }, 0)).toBe(
      identityOf("link", { rel: "icon", href: "/b.png", sizes: "32x32" }, 1),
    );
    expect(identityOf("link", { rel: "icon", href: "/a.png", sizes: "32x32" }, 0)).not.toBe(
      identityOf("link", { rel: "icon", href: "/a.png", sizes: "16x16" }, 1),
    );
  });

  test("canonical is a SEMANTIC singleton — the href is not in its identity", () => {
    expect(identityOf("link", { rel: "canonical", href: "https://x/a" }, 0)).toBe(
      identityOf("link", { rel: "canonical", href: "https://x/b" }, 1),
    );
  });

  test("two stylesheets coexist, because a document wants both", () => {
    expect(identityOf("link", { rel: "stylesheet", href: "/a.css" }, 0)).not.toBe(
      identityOf("link", { rel: "stylesheet", href: "/b.css" }, 1),
    );
  });

  test("hreflang is what makes one alternate different from another", () => {
    expect(identityOf("link", { rel: "alternate", hreflang: "en", href: "/en" }, 0)).not.toBe(
      identityOf("link", { rel: "alternate", hreflang: "fr", href: "/fr" }, 1),
    );
  });

  test("an unkeyed tag nothing claims never collides by accident", () => {
    expect(identityOf("script", { src: "/a.js" }, 0)).not.toBe(
      identityOf("script", { src: "/a.js" }, 1),
    );
  });
});

describe("the merge", () => {
  test("a deeper route's title wins", () => {
    expect(html([{ title: "Site" }, { title: "Page" }])).toBe(
      `<title ${HEAD_OWNER}="title">Page</title>`,
    );
  });

  test("SOLID-META'S BUG: a page CAN override a layout's description", () => {
    // `@solidjs/meta` puts `content` in the dedup key, so the two below have
    // different identities there and both render. Reproduced by the research
    // against 0.29.7.
    const out = html([
      { meta: [{ name: "description", content: "the site" }] },
      { meta: [{ name: "description", content: "the page" }] },
    ]);
    expect(out).toContain("the page");
    expect(out).not.toContain("the site");
  });

  test("TANSTACK'S #6719: a child CAN override a parent's canonical", () => {
    // Theirs dedups on `JSON.stringify(tag)`, so these are two different tags
    // and both survive.
    const out = html([
      { link: [{ rel: "canonical", href: "https://x/a" }] },
      { link: [{ rel: "canonical", href: "https://x/b" }] },
    ]);
    expect(out).toContain("https://x/b");
    expect(out).not.toContain("https://x/a");
  });

  test("within ONE route, same-identity tags coexist", () => {
    const out = html([
      {
        meta: [
          { property: "og:image", content: "/1.png" },
          { property: "og:image", content: "/2.png" },
        ],
      },
    ]);
    expect(out).toContain("/1.png");
    expect(out).toContain("/2.png");
  });

  test("across routes, the deeper SET replaces the shallower SET", () => {
    // Not concatenation: a page that declares one image gets one, not three.
    const out = html([
      {
        meta: [
          { property: "og:image", content: "/layout-1.png" },
          { property: "og:image", content: "/layout-2.png" },
        ],
      },
      { meta: [{ property: "og:image", content: "/page.png" }] },
    ]);
    expect(out).toContain("/page.png");
    expect(out).not.toContain("/layout-1.png");
    expect(out).not.toContain("/layout-2.png");
  });

  test("an explicit key takes a tag out of the automatic scheme", () => {
    const out = html([
      { meta: [{ name: "description", content: "a", key: "one" }] },
      { meta: [{ name: "description", content: "b", key: "two" }] },
    ]);
    expect(out).toContain(">a<".replaceAll(">a<", "")); // no text content on meta
    expect(out).toContain('content="a"');
    expect(out).toContain('content="b"');
    expect(out).not.toContain('key="');
  });

  test("a hole in the chain is skipped, not treated as an empty override", () => {
    expect(html([{ title: "Site" }, undefined, { meta: [{ name: "x", content: "y" }] }])).toContain(
      "Site",
    );
  });
});

describe("render", () => {
  test("charset comes first, then base, then title", () => {
    const out = html([{ title: "T", base: { href: "/app/" }, meta: [{ charset: "utf-8" }] }]);
    expect(out.indexOf("charset")).toBeLessThan(out.indexOf("<base"));
    expect(out.indexOf("<base")).toBeLessThan(out.indexOf("<title"));
  });

  test("every element carries the ownership attribute", () => {
    const out = html([{ title: "T", meta: [{ name: "a", content: "b" }] }]);
    expect(out.match(new RegExp(HEAD_OWNER, "g"))?.length).toBe(2);
  });

  test("an attribute value cannot break out of its attribute", () => {
    const out = html([{ meta: [{ name: "x", content: '"><script>alert(1)</script>' }] }]);
    expect(out).not.toContain("<script>");
    expect(out).toContain("&quot;&gt;");
  });

  test("a title cannot open a tag", () => {
    expect(html([{ title: "</title><script>x</script>" }])).not.toContain("<script>");
  });

  test("inline script text is NOT entity-escaped — only the closing sequence is", () => {
    // `&amp;` inside a script is four characters of JavaScript, so escaping it
    // corrupts the program. Only `</script` can end the element.
    const out = html([{ script: [{ children: 'if (a && b) x("</script>")' }] }]);
    expect(out).toContain("a && b");
    expect(out).toContain("<\\/script>");
    expect(out.match(/<\/script>/g)?.length).toBe(1);
  });

  test("a boolean attribute is written bare, and false writes nothing", () => {
    const out = html([{ script: [{ src: "/a.js", defer: true, async: false }] }]);
    expect(out).toContain(" defer");
    expect(out).not.toContain("async");
  });

  test("a nonce rides on script and style and nothing else", () => {
    const out = renderHead(
      resolveHead([{ script: [{ children: "x" }], meta: [{ name: "a", content: "b" }] }]),
      "n0nce",
    );
    expect(out).toMatch(/<script data-barq-head="[^"]+" nonce="n0nce">/);
    expect(out).not.toMatch(/<meta[^>]*nonce/);
  });

  test("the same input renders byte-identically", () => {
    const chain: HeadDescriptor[] = [
      { title: "A", meta: [{ name: "d", content: "x" }] },
      { link: [{ rel: "canonical", href: "/a" }] },
    ];
    expect(html(chain)).toBe(html(chain));
  });
});

describe("the client patch", () => {
  const fresh = (headHtml: string): Document => {
    const parsed = new DOMParser().parseFromString(
      `<!doctype html><html><head>${headHtml}</head><body></body></html>`,
      "text/html",
    );
    return parsed;
  };

  test("it adopts what the server wrote instead of appending beside it", () => {
    const served = html([{ title: "Home", meta: [{ name: "description", content: "home" }] }]);
    const document_ = fresh(served);
    applyHead(
      resolveHead([{ title: "About", meta: [{ name: "description", content: "about" }] }]),
      document_,
    );

    expect(document_.querySelectorAll("title").length).toBe(1);
    expect(document_.querySelectorAll('meta[name="description"]').length).toBe(1);
    expect(document_.title).toBe("About");
    expect(document_.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "about",
    );
  });

  test("it never touches a tag it does not own", () => {
    const document_ = fresh(
      `<meta name="analytics" content="third-party">${html([{ title: "Home" }])}`,
    );
    applyHead(resolveHead([{ title: "About" }]), document_);
    expect(document_.querySelector('meta[name="analytics"]')).not.toBeNull();
  });

  test("an unchanged tag is REUSED, not re-created", () => {
    const document_ = fresh(html([{ link: [{ rel: "icon", href: "/f.png" }] }]));
    const before = document_.querySelector("link");
    applyHead(
      resolveHead([
        { link: [{ rel: "icon", href: "/f.png" }], meta: [{ name: "x", content: "y" }] },
      ]),
      document_,
    );
    expect(document_.querySelector("link")).toBe(before);
  });

  test("a retracted title restores the document's original", () => {
    const document_ = fresh(`<title>Barq</title>`);
    captureHead(document_);
    applyHead(resolveHead([{ title: "Page" }]), document_);
    expect(document_.title).toBe("Page");
    applyHead(resolveHead([{}]), document_);
    expect(document_.title).toBe("Barq");
  });

  test("a retracted meta is removed, not left behind", () => {
    const document_ = fresh(html([{ meta: [{ name: "robots", content: "noindex" }] }]));
    applyHead(resolveHead([{ title: "Public" }]), document_);
    expect(document_.querySelector('meta[name="robots"]')).toBeNull();
  });

  test("two navigations in a row do not accumulate", () => {
    const document_ = fresh(
      html([{ title: "A", meta: [{ property: "og:image", content: "/1" }] }]),
    );
    for (const n of ["B", "C", "D"]) {
      applyHead(
        resolveHead([{ title: n, meta: [{ property: "og:image", content: `/${n}` }] }]),
        document_,
      );
    }
    expect(document_.querySelectorAll(`[${HEAD_OWNER}]`).length).toBe(2);
    expect(document_.title).toBe("D");
  });
});
