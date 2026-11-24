import { describe, expect, test } from "bun:test";
import { type Child, createSignal, flush } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { provideLocale } from "@barqjs/aria/i18n";
import { Link } from "@barqjs/router";
import { ariaViolations, render, screen, tick, user, waitFor } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";

import { DetailSheet } from "./detail-sheet.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

function sheet(): HTMLElement {
  return document.querySelector('[data-slot="detail-sheet"]') as HTMLElement;
}

describe("DetailSheet", () => {
  test("is a dialog named and described by its heading, with a body and actions", async () => {
    const changes: boolean[] = [];
    render(() => (
      <DetailSheet
        open
        heading="INV-001"
        description="Sent to Acme on 3 March."
        footer={<button type="button">Send again</button>}
        onOpenChange={(open) => changes.push(open)}
      >
        <p>Two line items.</p>
      </DetailSheet>
    ));
    await settle();
    const dialog = screen.getByRole("dialog", { name: "INV-001" });
    const described = dialog.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(described)?.textContent).toBe("Sent to Acme on 3 March.");
    expect(sheet().querySelector('[data-slot="detail-sheet-body"]')?.textContent).toBe(
      "Two line items.",
    );
    expect(screen.getByRole("button", { name: "Send again" })).toBeDefined();
    expect(sheet().getAttribute("data-size")).toBe("md");
    expect(sheet().getAttribute("data-side")).toBe("right");
    expect(await ariaViolations(document.body)).toEqual([]);

    await user.keyboard("{Escape}");
    await settle();
    expect(changes).toEqual([false]);
  });

  test("holds its own state from defaultOpen, and its close button closes it", async () => {
    render(() => (
      <DetailSheet defaultOpen heading="Details" closeLabel="Close the details">
        <p>Body</p>
      </DetailSheet>
    ));
    await settle();
    expect(screen.getByRole("dialog")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Close the details" }));
    await settle();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("follows the caller's open state", async () => {
    const [open, setOpen] = createSignal(false);
    render(() => (
      <DetailSheet open={open()} heading="Details">
        <p>Body</p>
      </DetailSheet>
    ));
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    setOpen(true);
    await settle();
    expect(screen.getByRole("dialog", { name: "Details" })).toBeDefined();
  });

  test("gives each width its own classes", async () => {
    render(() => (
      <>
        <DetailSheet open size="sm" heading="Narrow" />
        <DetailSheet open size="xl" heading="Wide" />
      </>
    ));
    await settle();
    const [narrow, wide] = [...document.querySelectorAll('[data-slot="detail-sheet"]')];
    expect(narrow?.getAttribute("data-size")).toBe("sm");
    expect(wide?.getAttribute("data-size")).toBe("xl");
    expect(narrow?.className).not.toBe(wide?.className);
  });

  test("its header keeps room at the start as well as beside the close button", async () => {
    render(() => <DetailSheet open heading="Invoice" />);
    await settle();
    const header = document.querySelector('[data-slot="sheet-header"]') as HTMLElement;
    const css = collectCss();
    const sides = [...header.classList]
      .map((one) => {
        const at = css.indexOf(`.${one}{`);
        return at === -1 ? "" : css.slice(at, css.indexOf("}", at));
      })
      .filter((rule) => rule.includes("padding"))
      .map((rule) => rule.slice(rule.indexOf("{") + 1, rule.indexOf(":")));
    expect(sides.toSorted()).toEqual([
      "padding-bottom",
      "padding-inline-end",
      "padding-inline-start",
      "padding-top",
    ]);
  });

  test("comes in from the reading direction's end, and its start when asked", async () => {
    function Rtl(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <>{props.children}</>;
    }
    render(() => (
      <Rtl>
        <DetailSheet open heading="النهاية" />
        <DetailSheet open side="start" heading="البداية" />
      </Rtl>
    ));
    await settle();
    const [end, start] = [...document.querySelectorAll('[data-slot="detail-sheet"]')];
    expect(end?.getAttribute("data-side")).toBe("left");
    expect(start?.getAttribute("data-side")).toBe("right");
  });

  test("bound to a search parameter, the URL opens it and closing takes the parameter out", async () => {
    function Invoices() {
      return (
        <>
          <Link to="/invoices" search={{ invoice: "INV-002", page: "2" }}>
            INV-002
          </Link>
          <DetailSheet param="invoice" heading="Invoice">
            <p>Detail</p>
          </DetailSheet>
        </>
      );
    }
    const view = await renderRoute({
      routeTree: [{ path: "/invoices", component: Invoices }] as never,
      path: "/invoices?page=2",
    });
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByRole("link", { name: "INV-002" }));
    await waitFor(() => expect(view.state.search().get("invoice")).toBe("INV-002"));
    await settle();
    expect(screen.getByRole("dialog", { name: "Invoice" })).toBeDefined();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(view.state.search().has("invoice")).toBe(false));
    await settle();
    expect(view.state.search().get("page")).toBe("2");
    expect(view.state.location().pathname).toBe("/invoices");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    view.unmount();
  });
});
