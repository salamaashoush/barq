import { afterEach, describe, expect, test } from "bun:test";
import { type Child } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { Button } from "@barqjs/ui/button";

import { ResponsiveOverlay } from "./responsive-overlay.tsx";

const original = window.matchMedia.bind(window);
afterEach(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: original });
});

/** A screen with a finger or a mouse, as the overlay's query reads it. */
function screenIs(compact: boolean): void {
  const stub = (query: string): MediaQueryList =>
    ({
      matches: query.includes("pointer: coarse") ? compact : original(query).matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
  Object.defineProperty(window, "matchMedia", { configurable: true, value: stub });
}

function overlay(): HTMLElement | null {
  return document.querySelector('[data-slot="responsive-overlay"]');
}

describe("ResponsiveOverlay", () => {
  test("on a wide screen with a mouse it is a dialog its trigger opens", async () => {
    screenIs(false);
    render(() => (
      <ResponsiveOverlay heading="Filters" breakpoint="sm" trigger={<Button>Open</Button>}>
        <p>Body</p>
      </ResponsiveOverlay>
    ));
    await settle();
    await user.click(screen.getByRole("button", { name: "Open" }));
    await settle();
    expect(overlay()?.getAttribute("data-presentation")).toBe("dialog");
    expect(await ariaViolations(document.body)).toEqual([]);
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("as a popover it opens beside its trigger and Escape returns focus", async () => {
    screenIs(false);
    render(() => (
      <ResponsiveOverlay
        heading="Filters"
        desktop="popover"
        breakpoint="sm"
        trigger={<Button>Open</Button>}
      >
        <button type="button">Apply</button>
      </ResponsiveOverlay>
    ));
    await settle();
    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();
    await user.keyboard("{Enter}");
    await settle();
    expect(overlay()?.getAttribute("data-presentation")).toBe("popover");
    await user.keyboard("{Escape}");
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await settle();
    expect(overlay()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  test("under a finger it is a sheet from the bottom, opened by a tap", async () => {
    screenIs(true);
    render(() => (
      <ResponsiveOverlay heading="Filters" breakpoint="lg" trigger={<Button>Open</Button>}>
        <p>Body</p>
      </ResponsiveOverlay>
    ));
    await settle();
    user.tap(screen.getByRole("button", { name: "Open" }));
    await settle();
    expect(overlay()?.getAttribute("data-presentation")).toBe("sheet");
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeDefined();
  });

  test("follows the caller's open state, and lays out by the reading direction", async () => {
    screenIs(false);
    function Rtl(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <ResponsiveOverlay heading="الفلاتر" open breakpoint="sm">
          <p>المحتوى</p>
        </ResponsiveOverlay>
      </Rtl>
    ));
    await settle();
    expect(screen.getByRole("dialog", { name: "الفلاتر" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Close" })).toBeDefined();
  });

  test("takes a class per part and a slot on every part", async () => {
    screenIs(false);
    render(() => (
      <ResponsiveOverlay
        heading="Filters"
        description="Narrow the list."
        footer={<span>Foot</span>}
        open
        breakpoint="sm"
        class="mine"
        classes={{ header: "h", title: "t", description: "d", body: "b", footer: "f" }}
      >
        <p>Body</p>
      </ResponsiveOverlay>
    ));
    await settle();
    const root = overlay() as HTMLElement;
    expect(root.classList.contains("mine")).toBe(true);
    const by = (slot: string): Element | null => root.querySelector(`[data-slot="${slot}"]`);
    expect(by("dialog-header")?.classList.contains("h")).toBe(true);
    expect(by("dialog-title")?.classList.contains("t")).toBe(true);
    expect(by("dialog-description")?.classList.contains("d")).toBe(true);
    expect(by("responsive-overlay-body")?.classList.contains("b")).toBe(true);
    expect(by("dialog-footer")?.classList.contains("f")).toBe(true);
  });

  test("hydrates the wide presentation the server wrote", async () => {
    const result = await hydrates(`
      import { Button, ResponsiveOverlay } from "<arc>";
      export function Page() {
        return (
          <ResponsiveOverlay heading="Filters" trigger={<Button>Open</Button>}>
            <p>Body</p>
          </ResponsiveOverlay>
        );
      }
    `);
    expect(result.container.querySelector("button")?.textContent).toBe("Open");
    result.unmount();
  });
});
