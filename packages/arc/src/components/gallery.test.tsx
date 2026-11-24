import { describe, expect, test } from "bun:test";
import { type Child, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, fireEvent, render, screen, user, waitFor, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { Gallery, type GalleryImage, Lightbox } from "./gallery.tsx";

const PHOTOS: GalleryImage[] = [
  { src: "/a.jpg", alt: "Harbour", caption: "At dawn" },
  { src: "/b.jpg", alt: "Market" },
  { src: "/c.jpg", alt: "Bridge" },
];

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

function shown(): string | null {
  return slot("lightbox-image")?.getAttribute("alt") ?? null;
}

describe("Gallery", () => {
  test("a list of thumbnails, each a button named by its image", async () => {
    render(() => <Gallery aria-label="Photos" images={PHOTOS} />);
    const list = screen.getByRole("list", { name: "Photos" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    for (const name of ["Harbour", "Market", "Bridge"]) {
      expect(within(list).getByRole("button", { name })).toBeDefined();
    }
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a press opens the lightbox at that image, Escape closes it", async () => {
    render(() => <Gallery aria-label="Photos" images={PHOTOS} />);
    user.click(screen.getByRole("button", { name: "Market" }));
    await settle();
    const dialog = screen.getByRole("dialog", { name: "Image viewer" });
    expect(shown()).toBe("Market");
    expect(within(dialog).getByText("Image 2 of 3")).toBeDefined();
    await user.keyboard("{Escape}");
    await settle();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("Lightbox", () => {
  function Open(props: { start?: number }) {
    const [index, setIndex] = createSignal(props.start ?? 0);
    return <Lightbox images={PHOTOS} defaultOpen index={index()} onIndexChange={setIndex} />;
  }

  test("the arrows and buttons step through, stopping at the ends", async () => {
    render(() => <Open />);
    await settle();
    expect(shown()).toBe("Harbour");
    expect(slot("lightbox-caption").textContent).toBe("At dawn");
    const back = screen.getByRole("button", { name: "Previous image" });
    expect(back.hasAttribute("disabled")).toBe(true);
    user.click(screen.getByRole("button", { name: "Next image" }));
    await settle();
    expect(shown()).toBe("Market");
    fireEvent.keyDown(slot("lightbox-body"), { key: "ArrowRight" });
    await settle();
    expect(shown()).toBe("Bridge");
    fireEvent.keyDown(slot("lightbox-body"), { key: "Home" });
    await settle();
    expect(shown()).toBe("Harbour");
    fireEvent.keyDown(slot("lightbox-body"), { key: "End" });
    await settle();
    expect(screen.getByRole("button", { name: "Next image" }).hasAttribute("disabled")).toBe(true);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a swipe steps through, mirrored right to left", async () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <Open />
      </Arabic>
    ));
    await settle();
    const stage = slot("lightbox-stage");
    fireEvent.pointerDown(stage, { clientX: 100, clientY: 10 });
    fireEvent.pointerUp(stage, { clientX: 200, clientY: 10 });
    await settle();
    expect(shown()).toBe("Market");
    fireEvent.keyDown(slot("lightbox-body"), { key: "ArrowLeft" });
    await settle();
    expect(shown()).toBe("Bridge");
    expect(slot("lightbox-counter").textContent).toBe("Image ٣ of ٣");
  });

  test("zooms with the buttons, the keys and a double press, and pans while zoomed", async () => {
    render(() => <Open />);
    await settle();
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    user.click(zoomIn);
    await settle();
    expect(slot("lightbox-image").getAttribute("style")).toContain("scale(1.5)");
    expect(slot("lightbox-image").hasAttribute("data-zoomed")).toBe(true);
    const stage = slot("lightbox-stage");
    fireEvent.pointerDown(stage, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(stage, { clientX: 30, clientY: 20 });
    fireEvent.pointerUp(stage, { clientX: 30, clientY: 20 });
    await settle();
    expect(slot("lightbox-image").getAttribute("style")).toContain("translate(30px, 20px)");
    expect(shown()).toBe("Harbour");
    fireEvent.keyDown(slot("lightbox-body"), { key: "0" });
    await settle();
    expect(slot("lightbox-image").getAttribute("style")).toContain("scale(1)");
    fireEvent.dblClick(stage);
    await settle();
    expect(slot("lightbox-image").getAttribute("style")).toContain("scale(2)");
  });

  test("takes a class per part", async () => {
    render(() => (
      <Lightbox
        images={PHOTOS}
        defaultOpen
        class="mine"
        classes={{
          root: "r",
          body: "y",
          bar: "b",
          counter: "c",
          stage: "s",
          image: "i",
          caption: "p",
        }}
      />
    ));
    await settle();
    const pairs = [
      ["lightbox", "r"],
      ["lightbox-body", "y"],
      ["lightbox-bar", "b"],
      ["lightbox-counter", "c"],
      ["lightbox-stage", "s"],
      ["lightbox-image", "i"],
      ["lightbox-caption", "p"],
    ] as const;
    for (const [name, cls] of pairs) expect(slot(name).classList.contains(cls)).toBe(true);
    expect(slot("lightbox").classList.contains("mine")).toBe(true);
  });

  test("hydrates what the server wrote, closed", async () => {
    const result = await hydrates(`
      import { Gallery } from "<arc>";
      export function Page() {
        return <Gallery aria-label="Photos" images={[{ src: "/a.jpg", alt: "A" }, { src: "/b.jpg", alt: "B" }]} />;
      }
    `);
    expect(result.container.querySelectorAll("li")).toHaveLength(2);
    expect(result.container.querySelector('[role="dialog"]')).toBeNull();
    result.unmount();
  });
});
