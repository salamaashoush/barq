import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";
import { toast } from "@barqjs/ui/sonner";

import { hydrates, settle } from "../test-arc.ts";
import { ActionMenu, type MenuAction } from "./action-menu.tsx";
import { ConfirmHost } from "./confirm.tsx";

function trigger(): HTMLElement {
  return screen.getByRole("button", { name: "More actions" });
}

function actions(log: string[], fail = false): MenuAction[] {
  return [
    {
      id: "delete",
      label: "Delete",
      tone: "danger",
      confirm: { title: "Delete Homepage?", description: "Its runs go with it." },
      onAction: () => {
        log.push("delete");
        if (fail) throw new Error("check is still running");
      },
    },
    { id: "rename", label: "Rename", onAction: () => log.push("rename") },
    { id: "open", label: "Open", href: "/checks/1" },
  ];
}

describe("ActionMenu", () => {
  test("regular actions first, destructive after a separator, from the keyboard", async () => {
    const log: string[] = [];
    render(() => (
      <>
        <ActionMenu actions={actions(log)} />
        <ConfirmHost />
      </>
    ));
    trigger().focus();
    await user.keyboard("{Enter}");
    await settle();
    const menu = screen.getByRole("menu", { name: "More actions" });
    const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(items).toEqual(["Rename", "Open", "Delete"]);
    expect(menu.querySelector('[role="separator"]')).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Open" }).getAttribute("href")).toBe("/checks/1");
    expect(screen.getByRole("menuitem", { name: "Delete" }).getAttribute("data-variant")).toBe(
      "destructive",
    );
    expect(await ariaViolations(document.body)).toEqual([]);
    await user.keyboard("{Enter}");
    await settle();
    expect(log).toEqual(["rename"]);
  });

  test("a destructive action asks first, naming what goes, and runs inside the question", async () => {
    const log: string[] = [];
    render(() => (
      <>
        <ActionMenu actions={actions(log)} />
        <ConfirmHost />
      </>
    ));
    await user.click(trigger());
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await settle();
    expect(log).toEqual([]);
    expect(screen.getByRole("alertdialog").textContent).toContain("Delete Homepage?");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await settle();
    expect(log).toEqual(["delete"]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("a destructive failure stays in its question; cancelling runs nothing", async () => {
    const log: string[] = [];
    render(() => (
      <>
        <ActionMenu actions={actions(log, true)} />
        <ConfirmHost />
      </>
    ));
    user.tap(trigger());
    await settle();
    user.tap(screen.getByRole("menuitem", { name: "Delete" }));
    await settle();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await settle();
    expect(screen.getByRole("alert").textContent).toContain("Check is still running.");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await settle();
    expect(log).toEqual(["delete"]);
  });

  test("a regular action that fails says so in a toast", async () => {
    render(() => (
      <ActionMenu
        actions={[
          {
            id: "pause",
            label: "Pause",
            onAction: async () => {
              throw new Error("not allowed");
            },
          },
        ]}
      />
    ));
    await user.click(trigger());
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Pause" }));
    await settle();
    const last = toast.getHistory().at(-1);
    expect(last?.title).toBe("That did not work. Try again.");
    expect(last?.description).toBe("Not allowed.");
  });

  test("draws nothing with no actions, and takes a label and a class per part", async () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <ActionMenu actions={[]} label="Empty" />
        <ActionMenu
          label="إجراءات"
          class="mine"
          classes={{ item: "it" }}
          actions={[{ id: "a", label: "فتح", onAction: () => {} }]}
        />
      </Rtl>
    ));
    expect(screen.queryByRole("button", { name: "Empty" })).toBeNull();
    const button = screen.getByRole("button", { name: "إجراءات" });
    expect(button.classList.contains("mine")).toBe(true);
    await user.click(button);
    await settle();
    expect(screen.getByRole("menuitem", { name: "فتح" }).classList.contains("it")).toBe(true);
  });

  test("a server's trigger is hydrated in place", async () => {
    const result = await hydrates(`
      import { ActionMenu } from "<arc>";
      export function Page() {
        return <ActionMenu actions={[{ id: "a", label: "Rename", onAction: () => {} }]} />;
      }
    `);
    expect(result.container.querySelector('[data-slot="action-menu-trigger"]')).not.toBeNull();
    result.unmount();
  });
});
