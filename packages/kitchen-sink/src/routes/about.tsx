/**
 * `/about` — prerendered, and reachable by CRAWLING from `/`.
 *
 * The prerenderer seeds on the routes it is given and follows same-origin
 * `href`s out of whatever HTML each page produced, so this file needs no entry
 * in the config: the layout's nav links to it.
 */

export const prerender = true;

/**
 * A leaf's head, replacing what the layout declared for the identities it names
 * and inheriting the rest — `og:site_name` and `og:type` still come from the
 * layout, and this page's `canonical` replaces the layout's rather than being a
 * second one.
 */
export const head = {
  title: "About — Barq Kitchen Sink",
  meta: [{ name: "description", content: "What this build demonstrates, and how." }],
  link: [{ rel: "canonical", href: "https://barq.example/about" }],
};

export default function About() {
  return (
    <section>
      <h2>About</h2>
      <p>
        This page was written to disk at build time by the same handler that
        serves a live request, with <code>stream: false</code> — which is a
        different renderer, not a buffered stream.
      </p>
    </section>
  );
}
