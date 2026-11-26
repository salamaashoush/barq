import { afterEach, describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";
import { Dialog, DialogContent, DialogTitle } from "@barqjs/ui/dialog";

import { hydrates, settle } from "../test-arc.ts";
import { Button } from "@barqjs/ui/button";

import { useOpenParam } from "../lib/search-state.ts";
import { ResponsiveOverlay } from "./responsive-overlay.tsx";

const original = window.matchMedia.bind(window);
afterEach(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: original });
});

/** A screen with a finger or a mouse, as the overlay's query reads it. */
function screenIs(compact: boolean): void {
  function stub(query: string): MediaQueryList {
    return {
      matches: query.includes("pointer: coarse") ? compact : original(query).matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList;
  }
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
    function Rtl(props: ParentProps) {
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
    function by(slot: string): Element | null {
      return root.querySelector(`[data-slot="${slot}"]`);
    }
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

  test("opens for a link's search parameter or its trigger; closing drops it and its companions", async () => {
    screenIs(false);
    function Page() {
      return (
        <ResponsiveOverlay
          heading="New tunnel"
          param="create"
          clearParams={["preset"]}
          trigger={<Button>New tunnel</Button>}
        >
          <p>Form</p>
        </ResponsiveOverlay>
      );
    }
    const view = await renderRoute({
      routeTree: [{ path: "/tunnels", component: Page }] as never,
      path: "/tunnels?create=1&preset=ssh&q=edge",
    });
    await settle();
    expect(screen.getByRole("dialog", { name: "New tunnel" })).toBeDefined();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(view.state.search().toString()).toBe("q=edge"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(screen.getByRole("button", { name: "New tunnel" }));
    await settle();
    expect(screen.getByRole("dialog", { name: "New tunnel" })).toBeDefined();
    expect(view.state.search().toString()).toBe("q=edge");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(view.state.location().pathname).toBe("/tunnels");
    view.unmount();
  });

  test("useOpenParam gives any dialog the same link", async () => {
    function Page() {
      const create = useOpenParam("create");
      return (
        <Dialog isOpen={create.isOpen()} onOpenChange={create.setOpen}>
          <DialogContent>
            <DialogTitle>New key</DialogTitle>
          </DialogContent>
        </Dialog>
      );
    }
    const view = await renderRoute({
      routeTree: [{ path: "/keys", component: Page }] as never,
      path: "/keys?create",
    });
    await settle();
    expect(screen.getByRole("dialog", { name: "New key" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(view.state.search().has("create")).toBe(false));
    view.unmount();
  });
});
