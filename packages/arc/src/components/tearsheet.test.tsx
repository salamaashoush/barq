import { describe, expect, test } from "bun:test";
import { createSignal, type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor } from "@barqjs/testing";

import { renderRoute } from "@barqjs/testing/router";
import { Button } from "@barqjs/ui/button";

import { hydrates, settle, wears } from "../test-arc.ts";
import { Tearsheet, tearsheetStyles } from "./tearsheet.tsx";

function sheet(): HTMLElement {
  return document.querySelector('[data-slot="tearsheet"]') as HTMLElement;
}

describe("Tearsheet", () => {
  test("a modal dialog named by its heading, with a body, an influencer and actions", async () => {
    render(() => (
      <Tearsheet
        defaultOpen
        heading="New campaign"
        description="Three steps."
        influencer={<p>Steps</p>}
        footer={<button type="button">Create</button>}
      >
        <input aria-label="Name" />
      </Tearsheet>
    ));
    await settle();
    const dialog = screen.getByRole("dialog", { name: "New campaign" });
    expect(dialog).toBeDefined();
    expect(sheet().querySelector('[data-slot="tearsheet-body"] input')).not.toBeNull();
    expect(sheet().querySelector('[data-slot="tearsheet-influencer"]')?.textContent).toBe("Steps");
    expect(screen.getByRole("button", { name: "Create" })).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("Escape closes it, a press outside does not, and focus starts inside", async () => {
    const changes: boolean[] = [];
    render(() => (
      <Tearsheet defaultOpen heading="Setup" onOpenChange={(open) => changes.push(open)}>
        <input aria-label="Name" />
      </Tearsheet>
    ));
    await settle();
    expect(sheet().contains(document.activeElement)).toBe(true);
    await user.click(document.body);
    await settle();
    expect(changes).toEqual([]);
    await user.keyboard("{Escape}");
    await settle();
    expect(changes).toEqual([false]);
  });

  test("its close button is named in arc's words and closes it on a tap", async () => {
    const [open, setOpen] = createSignal(true);
    render(() => (
      <Tearsheet open={open()} onOpenChange={setOpen} heading="Setup">
        <p>Body</p>
      </Tearsheet>
    ));
    await settle();
    user.tap(screen.getByRole("button", { name: "Close" }));
    await settle();
    expect(open()).toBe(false);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("in a right-to-left page its parts lay out by logical sides", async () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <Tearsheet defaultOpen heading="إعداد" influencer={<p>خطوات</p>}>
          <p>المحتوى</p>
        </Tearsheet>
      </Rtl>
    ));
    await settle();
    const main = sheet().querySelector('[data-slot="tearsheet-main"]') as HTMLElement;
    expect(main.lastElementChild?.getAttribute("data-slot")).toBe("tearsheet-influencer");
    expect(screen.getByRole("dialog", { name: "إعداد" })).toBeDefined();
  });

  test("takes a class per part and a slot on every part", async () => {
    render(() => (
      <Tearsheet
        defaultOpen
        heading="Setup"
        description="Line."
        size="narrow"
        influencer={<p>Steps</p>}
        footer={<span>Foot</span>}
        class="mine"
        classes={{ header: "h", title: "t", body: "b", influencer: "i", footer: "f" }}
      >
        <p>Body</p>
      </Tearsheet>
    ));
    await settle();
    expect(sheet().classList.contains("mine")).toBe(true);
    expect(sheet().getAttribute("data-size")).toBe("narrow");
    function by(slot: string): Element | null {
      return sheet().querySelector(`[data-slot="${slot}"]`);
    }
    expect(by("dialog-header")?.classList.contains("h")).toBe(true);
    expect(by("dialog-title")?.classList.contains("t")).toBe(true);
    expect(by("tearsheet-body")?.classList.contains("b")).toBe(true);
    expect(by("tearsheet-influencer")?.classList.contains("i")).toBe(true);
    expect(by("dialog-footer")?.classList.contains("f")).toBe(true);
  });

  test("hydrates what the server wrote, closed", async () => {
    const result = await hydrates(`
      import { Tearsheet } from "<arc>";
      export function Page() {
        return (
          <main>
            <p>Page</p>
            <Tearsheet heading="Setup"><p>Body</p></Tearsheet>
          </main>
        );
      }
    `);
    expect(result.container.textContent).toContain("Page");
    result.unmount();
  });

  test("a full-screen editor: close first in a bar, the heading cut to a line, the save beside it", async () => {
    let saved = 0;
    const changes: boolean[] = [];
    render(() => (
      <Tearsheet
        defaultOpen
        size="full"
        heading="Untitled puzzle with a long name that runs past the edge"
        actions={<Button onPress={() => saved++}>Save</Button>}
        onOpenChange={(open) => changes.push(open)}
      >
        <p>Canvas</p>
      </Tearsheet>
    ));
    await settle();
    expect(sheet().getAttribute("data-size")).toBe("full");
    expect(wears(sheet(), tearsheetStyles({ size: "full" }).root)).toBe(true);
    const bar = sheet().querySelector('[data-slot="tearsheet-bar"]') as HTMLElement;
    const close = screen.getByRole("button", { name: "Close" });
    expect(bar.firstElementChild).toBe(close);
    expect(document.activeElement).toBe(close);
    expect(bar.lastElementChild?.textContent).toBe("Save");
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(1);
    expect(await ariaViolations(document.body)).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(saved).toBe(1);
    close.focus();
    await user.keyboard("{Enter}");
    await settle();
    expect(changes).toEqual([false]);
  });

  test("opens for a search parameter and its own trigger; closing drops the parameter and its companions", async () => {
    function Page() {
      return (
        <Tearsheet heading="New check" param="create" clearParams={["preset"]}>
          <p>Form</p>
        </Tearsheet>
      );
    }
    const view = await renderRoute({
      routeTree: [{ path: "/checks", component: Page }] as never,
      path: "/checks?create=1&preset=http&page=2",
    });
    await settle();
    expect(screen.getByRole("dialog", { name: "New check" })).toBeDefined();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(view.state.search().toString()).toBe("page=2"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    view.unmount();
  });
});
