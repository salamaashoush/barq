/**
 * `/about` — prerendered, and reachable by CRAWLING from `/`.
 *
 * The prerenderer seeds on the routes it is given and follows same-origin
 * `href`s out of whatever HTML each page produced, so this file needs no entry
 * in the config: the root route's nav links to it.
 */

import { createMemo, createSignal, Loading } from "@barqjs/core";
import { createFileRoute } from "@barqjs/router";

import { buildInfo } from "../data/build-info.ts";

function About() {
  const built = createMemo(async () => buildInfo({ data: { page: "about" } }));
  const [asked, setAsked] = createSignal("—");
  const askAgain = async (): Promise<void> => {
    const again = await buildInfo({ data: { page: "about" } });
    setAsked(again.builtAt.toISOString());
  };
  return (
    <section>
      <h2>About</h2>
      <p>
        This page was written to disk at build time by the same handler that serves a live request,
        with <code>stream: false</code> — which is a different renderer, not a buffered stream.
      </p>
      <Loading fallback={<p>…</p>}>
        <p id="built-at">built at {() => built().builtAt.toISOString()}</p>
      </Loading>
      <button type="button" id="ask-again" onClick={() => void askAgain()}>
        ask again
      </button>
      <p id="asked-again">{() => asked()}</p>
    </section>
  );
}

export const Route = createFileRoute("/about")({
  prerender: true,
  /**
   * A leaf's head, replacing the identities it names and inheriting the rest —
   * `og:site_name` and `og:type` still come from the root route, and this
   * page's canonical REPLACES the root's rather than being a second one.
   */
  head: {
    meta: [
      { title: "About — Barq Kitchen Sink" },
      { name: "description", content: "What this build demonstrates, and how." },
    ],
    links: [{ rel: "canonical", href: "https://barq.example/about" }],
  },
  component: About,
});
