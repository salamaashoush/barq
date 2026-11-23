import { afterEach, describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { Folder } from "@barqjs/lucide/icons/folder";
import { parseCombo } from "@barqjs/primitives/keyboard";
import { type AnyRouteDefinition, Outlet } from "@barqjs/router";
import { ariaViolations, screen, tick, user, waitFor } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";

import {
  CommandMenu,
  type CommandMenuGroup,
  type CommandMenuProps,
  openCommandMenu,
  registerCommands,
  useCommands,
} from "./command-menu.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

/** `mod+k` as this platform spells it. */
function pressModK(): void {
  const mod = parseCombo("mod+k");
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: mod.ctrl,
      metaKey: mod.meta,
      bubbles: true,
      cancelable: true,
    }),
  );
}

const ran: string[] = [];

const GROUPS: CommandMenuGroup[] = [
  {
    heading: "Pages",
    actions: [
      { label: "Projects", to: "/projects", icon: Folder, keys: "G P" },
      { label: "Billing", to: "/billing", keywords: ["invoices"] },
    ],
  },
  {
    heading: "Account",
    actions: [{ label: "Sign out", onSelect: () => ran.push("sign out") }],
  },
];

function tree(props: CommandMenuProps = {}, page?: () => unknown): AnyRouteDefinition[] {
  return [
    {
      path: "/",
      component: () => (
        <>
          <CommandMenu groups={GROUPS} {...props} />
          <Outlet />
        </>
      ),
      children: [
        { path: "", component: (page ?? (() => <h1>Home</h1>)) as never },
        { path: "projects", component: () => <h1>Projects</h1> },
        { path: "billing", component: () => <h1>Billing</h1> },
      ],
    },
  ] as never;
}

function options(): string[] {
  return screen
    .getAllByRole("option")
    .filter((node) => !node.hidden)
    .map((node) => node.textContent ?? "");
}

afterEach(async () => {
  ran.length = 0;
  if (screen.queryByRole("dialog") !== null) {
    await user.keyboard("{Escape}");
    await settle();
  }
});

describe("CommandMenu", () => {
  test("Mod+K opens it as a named dialog, and again closes it", async () => {
    const view = await renderRoute({ routeTree: tree() });
    expect(screen.queryByRole("dialog")).toBeNull();

    pressModK();
    await settle();
    const dialog = screen.getByRole("dialog", { name: "Command menu" });
    expect(dialog.querySelector('[data-slot="command"]')).not.toBeNull();
    expect(screen.getByRole("group", { name: "Pages" })).toBeDefined();
    expect(options()).toEqual(["ProjectsG P", "Billing", "Sign out"]);
    expect(await ariaViolations(document.body)).toEqual([]);

    pressModK();
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    view.unmount();
  });

  test("typing narrows it, keywords included, and Enter navigates through the router", async () => {
    const view = await renderRoute({ routeTree: tree() });
    openCommandMenu();
    await settle();
    const input = screen.getByRole("combobox");
    input.focus();
    await user.keyboard("invoices");
    await settle();
    expect(options()).toEqual(["Billing"]);

    await user.keyboard("{Enter}");
    await waitFor(() => expect(view.state.location().pathname).toBe("/billing"));
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Billing");
    view.unmount();
  });

  test("the arrows move through it and Escape closes it", async () => {
    const view = await renderRoute({ routeTree: tree() });
    openCommandMenu();
    await settle();
    screen.getByRole("combobox").focus();
    await user.keyboard("{ArrowDown}");
    await settle();
    const input = screen.getByRole("combobox");
    const active = document.getElementById(input.getAttribute("aria-activedescendant") ?? "");
    expect(active?.textContent).toBe("Billing");

    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(view.state.location().pathname).toBe("/");
    view.unmount();
  });

  test("an action runs after the palette closes", async () => {
    const view = await renderRoute({ routeTree: tree() });
    openCommandMenu();
    await settle();
    await user.click(screen.getByRole("option", { name: "Sign out" }));
    await settle();
    expect(ran).toEqual(["sign out"]);
    expect(screen.queryByRole("dialog")).toBeNull();
    view.unmount();
  });

  test("a page adds its own actions while it is on the page, under a shared heading", async () => {
    const [shown, setShown] = createSignal(true);
    function Page() {
      useCommands(() => [
        { heading: "Account", actions: [{ label: "Rotate the token", onSelect: () => {} }] },
        { heading: "This page", actions: [{ label: "Export", onSelect: () => {} }] },
      ]);
      return <h1>Page</h1>;
    }
    const view = await renderRoute({
      routeTree: tree({}, () => <>{shown() ? <Page /> : null}</>),
    });
    openCommandMenu();
    await settle();
    expect(options()).toEqual(["ProjectsG P", "Billing", "Sign out", "Rotate the token", "Export"]);
    expect(screen.getByRole("group", { name: "This page" })).toBeDefined();

    setShown(false);
    await settle();
    expect(options()).toEqual(["ProjectsG P", "Billing", "Sign out"]);
    expect(screen.queryByRole("group", { name: "This page" })).toBeNull();
    view.unmount();
  });

  test("registerCommands adds groups from outside any component until it is undone", async () => {
    const view = await renderRoute({ routeTree: tree() });
    const undo = registerCommands([{ heading: "Help", actions: [{ label: "Shortcuts" }] }]);
    openCommandMenu();
    await settle();
    expect(options()).toContain("Shortcuts");
    undo();
    undo();
    await settle();
    expect(options()).not.toContain("Shortcuts");
    view.unmount();
  });

  test("its open state can be the caller's, and the shortcut can be turned off", async () => {
    const asked: boolean[] = [];
    const view = await renderRoute({
      routeTree: tree({ open: false, shortcut: false, onOpenChange: (open) => asked.push(open) }),
    });
    pressModK();
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(asked).toEqual([]);
    view.unmount();

    const shown = await renderRoute({ routeTree: tree({ open: true }) });
    await settle();
    expect(screen.getByRole("dialog")).toBeDefined();
    shown.unmount();
  });
});
