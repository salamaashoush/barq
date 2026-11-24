import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type Child, DEV } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen } from "@barqjs/testing";

import { provideArcMessages } from "./messages.ts";
import { hydrates, settle, wears } from "../test-arc.ts";
import { Image, type ImageStatus, imageStyles } from "./image.tsx";

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

/** The browser's answer for an image it has not fetched yet, which happy-dom never fetches. */
function fetched(complete: boolean, naturalWidth: number): () => void {
  const proto = HTMLImageElement.prototype;
  const saved = ["complete", "naturalWidth"].map(
    (name) => [name, Object.getOwnPropertyDescriptor(proto, name)] as const,
  );
  Object.defineProperty(proto, "complete", { configurable: true, get: () => complete });
  Object.defineProperty(proto, "naturalWidth", { configurable: true, get: () => naturalWidth });
  return () => {
    for (const [name, descriptor] of saved) {
      if (descriptor === undefined) Reflect.deleteProperty(proto, name);
      else Object.defineProperty(proto, name, descriptor);
    }
  };
}

describe("Image", () => {
  let restore: () => void = () => {};
  beforeEach(() => {
    restore = fetched(false, 0);
  });
  afterEach(() => restore());

  test("an image the browser already had when the page hydrated shows at once", async () => {
    restore();
    restore = fetched(true, 640);
    render(() => <Image src="/cached.jpg" alt="Cached" placeholder="#eee" />);
    await settle();
    expect(slot("image").getAttribute("data-status")).toBe("loaded");
    expect(slot("image-placeholder")).toBeNull();
  });

  test("settles a cached image from its effect without an untracked read", async () => {
    restore();
    restore = fetched(true, 640);
    const capture = DEV.diagnostics.capture();
    render(() => <Image src="/cached.jpg" alt="Cached" />);
    await settle();
    expect(slot("image").getAttribute("data-status")).toBe("loaded");
    const strict = capture.stop().filter((event) => event.code === "STRICT_READ_UNTRACKED");
    expect(strict).toEqual([]);
  });

  test("holds its shape, loads lazily and fades in once loaded", async () => {
    const seen: ImageStatus[] = [];
    render(() => (
      <Image
        src="/harbour.jpg"
        alt="The harbour at dawn"
        aspectRatio="16 / 9"
        placeholder="data:image/png;base64,AAAA"
        onStatusChange={(status) => seen.push(status)}
      />
    ));
    const img = screen.getByRole("img", { name: "The harbour at dawn" });
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(slot("image").getAttribute("style")).toContain("aspect-ratio: 16 / 9");
    expect(slot("image-placeholder").getAttribute("style")).toContain("data:image/png");
    expect(img.getAttribute("data-status")).toBe("loading");
    img.dispatchEvent(new Event("load"));
    await settle();
    expect(img.getAttribute("data-status")).toBe("loaded");
    expect(slot("image-placeholder")).toBeNull();
    expect(seen.at(-1)).toBe("loaded");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a priority image loads at once and early", () => {
    render(() => <Image src="/hero.jpg" alt="Hero" priority />);
    const img = screen.getByRole("img", { name: "Hero" });
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");
  });

  test("an image that cannot load says so, and keeps its name", async () => {
    render(() => <Image src="/missing.jpg" alt="Team photo" aspectRatio={1} />);
    slot("image-img").dispatchEvent(new Event("error"));
    await settle();
    expect(slot("image").getAttribute("data-status")).toBe("error");
    expect(slot("image-fallback").textContent).toContain("Image unavailable");
    expect(screen.getByRole("img", { name: "Team photo" }).getAttribute("data-slot")).toBe(
      "image-fallback",
    );
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the fallback is the caller's or in the locale's words, right to left", async () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-EG");
      provideArcMessages(() => ({ imageUnavailable: "الصورة غير متاحة" }));
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <Image src="/a.jpg" alt="" />
        <Image src="/b.jpg" alt="b" fallback={<span>no picture</span>} />
      </Arabic>
    ));
    for (const img of document.querySelectorAll('[data-slot="image-img"]')) {
      img.dispatchEvent(new Event("error"));
    }
    await settle();
    const [plain, own] = [...document.querySelectorAll('[data-slot="image-fallback"]')];
    expect(plain?.textContent).toBe("الصورة غير متاحة");
    expect(plain?.getAttribute("aria-hidden")).toBe("true");
    expect(own?.textContent).toBe("no picture");
  });

  test("a colour placeholder, a fit, a corner and a class per part", () => {
    render(() => (
      <Image
        src="/a.jpg"
        alt="a"
        placeholder="#eeeeee"
        fit="contain"
        rounded="lg"
        class="mine"
        classes={{ root: "r", placeholder: "p", image: "i" }}
      />
    ));
    expect(slot("image-placeholder").getAttribute("style")).toContain("background-color");
    expect(wears(slot("image"), imageStyles({ rounded: "lg" }).root)).toBe(true);
    expect(wears(slot("image-img"), imageStyles({ fit: "contain" }).image)).toBe(true);
    expect(slot("image").classList.contains("mine")).toBe(true);
    expect(slot("image").classList.contains("r")).toBe(true);
    expect(slot("image-placeholder").classList.contains("p")).toBe(true);
    expect(slot("image-img").classList.contains("i")).toBe(true);
    expect(collectCss()).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\{\.[\w-]+\{transition-duration:0s\}/,
    );
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { Image } from "<arc>";
      export function Page() {
        return <Image src="/a.jpg" alt="A" aspectRatio={1.5} placeholder="#eee" />;
      }
    `);
    expect(result.container.querySelector("img")?.getAttribute("alt")).toBe("A");
    result.unmount();
  });
});
