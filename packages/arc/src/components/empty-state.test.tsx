import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { Inbox } from "@barqjs/lucide/icons/inbox";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, wears } from "../test-arc.ts";
import { EmptyState, emptyStateVariants } from "./empty-state.tsx";

function state(): HTMLElement {
  return document.querySelector('[data-slot="empty-state"]') as HTMLElement;
}

describe("EmptyState", () => {
  test("puts the icon, the title, the line and the actions in one block", async () => {
    const pressed: string[] = [];
    render(() => (
      <EmptyState
        icon={<Inbox />}
        heading="No invoices yet"
        description="They appear here once one is sent."
        actions={
          <button type="button" onClick={() => pressed.push("new")}>
            New invoice
          </button>
        }
      />
    ));
    const root = document.querySelector('[data-slot="empty-state"]') as HTMLElement;
    expect(root.getAttribute("data-variant")).toBe("plain");
    expect(root.querySelector('[data-slot="empty-media"] svg')).not.toBeNull();
    expect(screen.getByText("No invoices yet").getAttribute("data-slot")).toBe("empty-title");
    expect(screen.getByText("They appear here once one is sent.").getAttribute("data-slot")).toBe(
      "empty-description",
    );

    const action = screen.getByRole("button", { name: "New invoice" });
    action.focus();
    await user.keyboard("{Enter}");
    expect(pressed).toEqual(["new"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("leaves out what is not given, and keeps the caller's class", () => {
    render(() => <EmptyState heading="Nothing here" variant="outline" class="mine" />);
    const root = document.querySelector('[data-slot="empty-state"]') as HTMLElement;
    expect(root.className).toContain("mine");
    expect(root.getAttribute("data-variant")).toBe("outline");
    expect(root.querySelector('[data-slot="empty-media"]')).toBeNull();
    expect(root.querySelector('[data-slot="empty-description"]')).toBeNull();
    expect(root.querySelector('[data-slot="empty-content"]')).toBeNull();
  });

  test("gives each variant its own classes", () => {
    render(() => (
      <>
        <EmptyState heading="Plain" />
        <EmptyState heading="Framed" variant="outline" />
      </>
    ));
    const [plain, framed] = [...document.querySelectorAll('[data-slot="empty-state"]')];
    expect(plain?.className).not.toBe(framed?.className);
  });

  test("a filtered empty says nothing matches and clears from the keyboard or a tap", async () => {
    let cleared = 0;
    render(() => <EmptyState kind="filtered" onClearFilters={() => cleared++} />);
    expect(state().getAttribute("data-kind")).toBe("filtered");
    expect(screen.getByText("No matches")).toBeDefined();
    expect(
      screen.getByText("Nothing matches these filters. Clear them to see everything."),
    ).toBeDefined();
    expect(state().querySelector('[data-slot="empty-media"] svg')).not.toBeNull();
    const clear = screen.getByRole("button", { name: "Clear filters" });
    clear.focus();
    await user.keyboard("{Enter}");
    user.tap(clear);
    expect(cleared).toBe(2);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a restricted empty names who can grant access, joined in the locale", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <>
        <EmptyState kind="restricted" grantedBy={["Ola", "Sam", "Rin"]} />
        <Arabic>
          <EmptyState kind="restricted" grantedBy={["علا", "سام"]} heading="لا شيء" />
        </Arabic>
      </>
    ));
    expect(screen.getByText("Ask Ola, Sam, or Rin for access.")).toBeDefined();
    expect(screen.getByText("Nothing to show you")).toBeDefined();
    expect(document.body.textContent).toContain("علا أو سام");
  });

  test("a restricted empty with nobody named asks an admin; done marks success", () => {
    render(() => (
      <>
        <EmptyState kind="restricted" />
        <EmptyState kind="done" description="Nothing waits for review." />
      </>
    ));
    expect(screen.getByText("Ask an admin for access.")).toBeDefined();
    expect(screen.getByText("All done")).toBeDefined();
    const done = document.querySelector('[data-kind="done"] [data-slot="empty-media"]');
    expect(wears(done, emptyStateVariants({ kind: "done" }).media)).toBe(true);
  });

  test("in a section it is a quiet line at the start, marking only a kind", () => {
    render(() => (
      <>
        <EmptyState placement="section" icon={<Inbox />} heading="No runs yet" />
        <EmptyState placement="section" kind="filtered" onClearFilters={() => {}} />
      </>
    ));
    const [plain, filtered] = [...document.querySelectorAll('[data-slot="empty-state"]')];
    expect(plain?.getAttribute("data-placement")).toBe("section");
    expect(plain?.querySelector('[data-slot="empty-media"]')).toBeNull();
    expect(filtered?.querySelector('[data-slot="empty-media"]')).not.toBeNull();
    expect(filtered?.querySelector('[data-slot="empty-description"]')).toBeNull();
    expect(wears(plain, emptyStateVariants({ placement: "section" }).root)).toBe(true);
  });

  test("a heading level makes the title a heading; content goes between words and actions", () => {
    render(() => (
      <EmptyState
        heading="Nothing yet"
        headingLevel={2}
        actions={<button type="button">Add</button>}
      >
        <p>A tip</p>
      </EmptyState>
    ));
    expect(screen.getByRole("heading", { level: 2, name: "Nothing yet" })).toBeDefined();
    const body = state().querySelector('[data-slot="empty-state-body"]');
    expect(body?.textContent).toBe("A tip");
    expect(body?.nextElementSibling?.getAttribute("data-slot")).toBe("empty-content");
  });

  test("a server's empty states are hydrated in place", async () => {
    const result = await hydrates(`
      import { EmptyState } from "<arc>";
      export function Page() {
        return (
          <div>
            <EmptyState kind="filtered" onClearFilters={() => {}} />
            <EmptyState kind="restricted" grantedBy={["Ola"]} placement="section" />
            <EmptyState icon={<svg data-icon="inbox" />} heading="No invoices" />
          </div>
        );
      }
    `);
    expect(result.container.textContent).toContain("Ask Ola for access.");
    result.unmount();
  });
});
