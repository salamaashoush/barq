import { describe, expect, test } from "bun:test";
import { Inbox } from "@barqjs/lucide/icons/inbox";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { EmptyState } from "./empty-state.tsx";

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
});
