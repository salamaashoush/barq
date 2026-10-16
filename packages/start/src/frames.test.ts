/**
 * The server half of frames, without a browser: what a server function whose
 * handler returns a component answers with, on each channel, and what it is
 * in process.
 */

import { block, useHead } from "@barqjs/core";
import { clearSerializationAdapters, encodeWire } from "@barqjs/server/codec";
import { esc, html } from "@barqjs/server";
import { afterEach, describe, expect, test } from "bun:test";

import { FRAME, frameAddress, isFrame } from "./frames.ts";
import { DATA_SUFFIX, RPC_PREFIX, createServerFn } from "./index.ts";
import { handleServerFn, mount, unmountAll } from "./server.ts";

const ORIGIN = "https://example.com";

// A frame registers the adapter that names it in a seed, and the registry is
// the process's: a later suite's seeds must not carry it.
afterEach(() => {
  unmountAll();
  clearSerializationAdapters();
});

let renders = 0;

/** A server component as the string backend compiles one: slots are calls on its props. */
function storyComponent(id: string) {
  return (props: Record<string, (args?: Record<string, unknown>) => unknown>) => {
    renders++;
    useHead({ tag: "title", children: `story ${id}` });
    return html(
      `<article data-story="${id}">${esc(
        props.comment({
          $key: () => "c1",
          cid: () => 1,
          children: block(() => html("<p>one</p>")),
        }),
      )}${esc(props.children)}</article>`,
    );
  };
}

const getStory = createServerFn({ method: "POST" })
  .validator((input: { readonly id: string }) => input)
  .handler(({ data }) => storyComponent(data.id));

function call(path: string, origin = ORIGIN): Request {
  return new Request(`${ORIGIN}${RPC_PREFIX}${encodeURIComponent("stories#getStory")}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ input: encodeWire({ id: "7" }) }),
  });
}

describe("a server function that returns a component", () => {
  test("is a frame in process, one address per arguments", async () => {
    mount("stories#getStory", getStory);
    const seven = await getStory({ data: { id: "7" } });
    const again = await getStory({ data: { id: "7" } });
    const eight = await getStory({ data: { id: "8" } });

    expect(isFrame(seven)).toBe(true);
    const address = (seven as unknown as Record<symbol, { address: string }>)[FRAME].address;
    expect(address).toBe(frameAddress("stories#getStory", encodeWire({ id: "7" })));
    expect((again as unknown as Record<symbol, { address: string }>)[FRAME].address).toBe(address);
    expect((eight as unknown as Record<symbol, { address: string }>)[FRAME].address).not.toBe(
      address,
    );
    expect(JSON.stringify(encodeWire(seven))).toContain("barq.frame");
  });

  test("answers the data channel with the region alone, its slots empty", async () => {
    mount("stories#getStory", getStory);
    const response = (await handleServerFn(call(DATA_SUFFIX)))!;
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-barq-rpc")).toBe("frame");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatch(
      /^<barq-frame data-frame="stories#getStory#\w+" style="display:contents">/,
    );
    expect(body).toContain(
      '<article data-story="7"><!--s:0--><!--/s:0--><!--s:1--><!--/s:1--></article>',
    );
    expect(body).toEndWith("</barq-frame>");
    const payload = JSON.parse(
      /<script type="application\/barq-frame">(.*?)<\/script>/.exec(body)![1],
    );
    expect(payload).toMatchObject({
      v: 1,
      slots: [
        { at: 0, name: "comment", key: "$c1", region: "<p>one</p>", hasRegion: true },
        { at: 1, name: "children", key: "children:0" },
      ],
      head: [{ tag: "title", children: "story 7" }],
    });
  });

  test("sends a browser following a form back where it came from", async () => {
    mount("stories#getStory", getStory);
    const form = new Request(`${ORIGIN}${RPC_PREFIX}${encodeURIComponent("stories#getStory")}`, {
      method: "POST",
      headers: { origin: ORIGIN, referer: `${ORIGIN}/stories` },
      body: new URLSearchParams({ id: "7" }),
    });
    const response = (await handleServerFn(form))!;

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/stories");
  });

  test("is refused from another origin before the component renders", async () => {
    mount("stories#getStory", getStory);
    const before = renders;
    const response = (await handleServerFn(call(DATA_SUFFIX, "https://elsewhere.example.com")))!;

    expect(response.status).toBe(403);
    expect(renders).toBe(before);
  });
});
