/**
 * The buffered render patches settled boundaries into a page that is full of
 * bytes its author did not write.
 *
 * An attribute value is escaped for `&` and `"` only, so `<!--[b:0-->` and
 * `<!--]-->` inside one read exactly like the comments a boundary is written
 * between. A patch that found its range by reading comments out of the page
 * would land inside the attribute, the settled markup's first `"` would close
 * it, and whatever the value carried after its forged close would be live
 * markup.
 */

import { createMemo } from "@barqjs/core";
import { clearHydrationData } from "@barqjs/core/internal";
import { afterEach, expect, test } from "bun:test";

import { renderPage } from "./server.ts";
import { attr, esc, html, ssrLoading } from "./ssr.ts";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  clearHydrationData();
});

function parse(markup: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = markup;
  return host;
}

test("a hostile attribute value before a parked boundary stays an attribute value", async () => {
  const query = '<!--[b:0--><!--]--><img src=x onerror="alert(1)">';
  const page = (): unknown => {
    const late = createMemo(async () => {
      await tick();
      return "salama";
    });
    return html(
      `<main><input${attr("value", query)}>${esc(
        ssrLoading({
          fallback: () => html("<i>loading</i>"),
          children: () => html(`<b class="done">${esc(late())}</b>`),
        }),
      )}</main>`,
    );
  };

  const out = await renderPage(page as never);
  const dom = parse(out.html);

  expect(dom.querySelector("img")).toBeNull();
  expect(dom.querySelector("input")?.getAttribute("value")).toBe(query);
  expect(dom.querySelector("b.done")?.textContent).toBe("salama");
  expect(dom.querySelector("i")).toBeNull();
});

test("a hostile attribute value inside a fallback cannot end the boundary early", async () => {
  const title = '<!--]--><img src=x onerror="alert(1)">';
  const page = (): unknown => {
    const late = createMemo(async () => {
      await tick();
      return "salama";
    });
    return html(
      `<main>${esc(
        ssrLoading({
          fallback: () => html(`<i${attr("title", title)}>loading</i>`),
          children: () => html(`<b>${esc(late())}</b>`),
        }),
      )}</main>`,
    );
  };

  const out = await renderPage(page as never);

  expect(out.html).toBe("<main><b>salama</b></main>");
  expect(parse(out.html).querySelector("img")).toBeNull();
});

test("a boundary that settles inside another is patched where the outer one put it", async () => {
  const page = (): unknown => {
    const first = createMemo(async () => {
      await tick();
      return "first";
    });
    const second = createMemo(async () => {
      await tick();
      await tick();
      return "second";
    });
    const inner = (): unknown =>
      ssrLoading(
        {
          fallback: () => html("<i>inner</i>"),
          children: () => html(`<u>${esc(second())}</u>`),
        },
        4,
      );
    return html(
      `<main>${esc(
        ssrLoading(
          {
            fallback: () => html("<i>outer</i>"),
            children: () => html(`<b>${esc(first())}</b>${esc(inner())}`),
          },
          4,
        ),
      )}</main>`,
    );
  };

  const out = await renderPage(page as never);

  expect(out.html).toBe("<main><!--[--><b>first</b><!--[--><u>second</u><!--]--><!--]--></main>");
});
