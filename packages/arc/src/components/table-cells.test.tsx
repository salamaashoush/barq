import { describe, expect, test } from "bun:test";
import type { ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { CellWithNote, OverflowList } from "./table-cells.tsx";

const CHECKS = ["Checkout", "Sign in", "Search", "Billing page", "Status API"];

function overlay(): Element | null {
  return document.querySelector('[data-slot="responsive-overlay"]');
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("CellWithNote", () => {
  test("the value over a muted note, the note whole in its title and in the page", () => {
    render(() => (
      <CellWithNote note="Marked late: the bus broke down on the ring road">Absent</CellWithNote>
    ));
    const note = document.querySelector('[data-slot="cell-with-note-note"]');
    expect(note?.textContent).toBe("Marked late: the bus broke down on the ring road");
    expect(note?.getAttribute("title")).toBe(note?.textContent ?? "");
    expect(note?.getAttribute("dir")).toBe("auto");
    expect(document.querySelector('[data-slot="cell-with-note-value"]')?.textContent).toBe(
      "Absent",
    );
  });

  test("no note, no second line", () => {
    render(() => <CellWithNote note={null}>Present</CellWithNote>);
    expect(document.querySelector('[data-slot="cell-with-note-note"]')).toBeNull();
  });

  test("takes a class per part", () => {
    render(() => (
      <CellWithNote note="n" class="mine" classes={{ root: "r", value: "v", note: "o" }}>
        x
      </CellWithNote>
    ));
    const root = document.querySelector('[data-slot="cell-with-note"]');
    expect(root?.classList.contains("mine")).toBe(true);
    expect(root?.classList.contains("r")).toBe(true);
    expect(
      document.querySelector('[data-slot="cell-with-note-value"]')?.classList.contains("v"),
    ).toBe(true);
    expect(
      document.querySelector('[data-slot="cell-with-note-note"]')?.classList.contains("o"),
    ).toBe(true);
  });
});

describe("OverflowList", () => {
  test("the first two, then a +N button that names everything and opens the whole list", async () => {
    render(() => <OverflowList label="Used by" items={CHECKS} />);
    expect(
      [...document.querySelectorAll('[data-slot="overflow-list-item"]')].map((n) => n.textContent),
    ).toEqual(["Checkout", "Sign in"]);
    const more = screen.getByRole("button", { name: /^3 more, Used by: Checkout/ });
    expect(more.textContent).toBe("+3");
    expect(await ariaViolations(document.body)).toEqual([]);
    await user.click(more);
    await settle();
    const all = await waitFor(() => overlay() as HTMLElement);
    expect(all.getAttribute("data-presentation")).toBe("popover");
    expect(
      within(all)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(CHECKS);
  });

  test("the keyboard and a finger reach the rest", async () => {
    render(() => <OverflowList label="Used by" items={CHECKS} />);
    user.tab();
    expect(document.activeElement?.textContent).toBe("+3");
    await user.keyboard("{Enter}");
    await settle();
    await waitFor(() => expect(overlay()).not.toBeNull());
    await user.keyboard("{Escape}");
    await settle();
    await waitFor(() => expect(overlay()).toBeNull());
    user.tap(screen.getByRole("button", { name: /3 more/ }));
    await settle();
    await waitFor(() => expect(overlay()).not.toBeNull());
  });

  test("as a sentence: a, b, c and 2 more, the tail a button", () => {
    render(() => <OverflowList label="Projects" variant="text" items={CHECKS} />);
    const sentence = document.querySelector('[data-slot="overflow-list-text"]');
    expect(sentence?.textContent).toBe("Checkout, Sign in, Search, and 2 more");
    expect(screen.getByRole("button", { name: /^2 more/ }).textContent).toBe("2 more");
  });

  test("short lists fold nothing", () => {
    render(() => <OverflowList label="Used by" variant="text" items={["Checkout", "Search"]} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.querySelector('[data-slot="overflow-list"]')?.textContent).toBe(
      "Checkout and Search",
    );
  });

  test("none shows the empty content", () => {
    render(() => <OverflowList label="Used by" items={[]} empty={<span>Unused</span>} />);
    expect(screen.getByText("Unused")).toBeDefined();
    expect(document.querySelector('[data-slot="overflow-list"]')).toBeNull();
  });

  test("joins in the reader's language and direction", () => {
    render(() => (
      <Arabic>
        <OverflowList label="الفحوص" variant="text" items={["أ", "ب"]} />
      </Arabic>
    ));
    expect(document.querySelector('[data-slot="overflow-list"]')?.textContent).toBe("أ وب");
  });

  test("takes a class per part", () => {
    render(() => (
      <OverflowList
        label="Used by"
        items={CHECKS}
        class="mine"
        classes={{ root: "r", item: "i", more: "m" }}
      />
    ));
    expect(document.querySelector('[data-slot="overflow-list"]')?.classList.contains("r")).toBe(
      true,
    );
    expect(document.querySelector('[data-slot="overflow-list"]')?.classList.contains("mine")).toBe(
      true,
    );
    expect(
      document.querySelector('[data-slot="overflow-list-item"]')?.classList.contains("i"),
    ).toBe(true);
    expect(
      document.querySelector('[data-slot="overflow-list-more"]')?.classList.contains("m"),
    ).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { CellWithNote, OverflowList } from "<arc>";
      export function Page() {
        return (
          <div>
            <CellWithNote note="Paid by card">INV-001</CellWithNote>
            <OverflowList label="Used by" items={["a", "b", "c", "d"]} />
            <OverflowList label="Used by" variant="text" items={["a", "b", "c", "d", "e"]} />
          </div>
        );
      }
    `);
    expect(result.container.textContent).toContain("+2");
    expect(result.container.textContent).toContain("a, b, c, and 2 more");
    result.unmount();
  });
});
