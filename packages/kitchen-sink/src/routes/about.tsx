/**
 * `/about` — prerendered, and reachable by CRAWLING from `/`.
 *
 * The prerenderer seeds on the routes it is given and follows same-origin
 * `href`s out of whatever HTML each page produced, so this file needs no entry
 * in the config: the layout's nav links to it.
 */

export const prerender = true;

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
