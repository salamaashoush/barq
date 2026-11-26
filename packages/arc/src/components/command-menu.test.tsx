import { afterEach, describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { Folder } from "@barqjs/lucide/icons/folder";
import { parseCombo } from "@barqjs/primitives/keyboard";
import { type AnyRouteDefinition, Outlet } from "@barqjs/router";
import { ariaViolations, screen, tick, user, waitFor, within } from "@barqjs/testing";
import { touch } from "@barqjs/ui/shared-touch";
import { renderRoute } from "@barqjs/testing/router";

import { layout } from "../style/index.ts";
import { wears } from "../test-arc.ts";
import { collectCss } from "@barqjs/css";
import {
  CommandMenu,
  commandMenuStyles,
  type CommandMenuGroup,
  type CommandResult,
  type CommandSource,
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

  test("with bindKeys an action's keys run it from anywhere, a sequence included", async () => {
    const saved: string[] = [];
    const view = await renderRoute({
      routeTree: tree({
        bindKeys: true,
        groups: [
          ...GROUPS,
          {
            heading: "File",
            actions: [
              { label: "Save", keys: "mod+s", onSelect: () => saved.push("save") },
              {
                label: "Print",
                keys: "mod+p",
                disabled: true,
                onSelect: () => saved.push("print"),
              },
            ],
          },
        ],
      }),
    });
    await settle();
    const mod = parseCombo("mod");
    function press(key: string, modded = false): void {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          ctrlKey: modded && mod.ctrl,
          metaKey: modded && mod.meta,
          bubbles: true,
          cancelable: true,
        }),
      );
    }
    press("s", true);
    press("p", true);
    await settle();
    expect(saved).toEqual(["save"]);
    expect(screen.queryByRole("dialog")).toBeNull();

    press("g");
    press("p");
    await waitFor(() => expect(view.state.location().pathname).toBe("/projects"));

    const undo = registerCommands([
      {
        heading: "Help",
        actions: [{ label: "Shortcuts", keys: "shift+?", onSelect: () => saved.push("help") }],
      },
    ]);
    await settle();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "?", shiftKey: true, bubbles: true, cancelable: true }),
    );
    await settle();
    expect(saved).toEqual(["save", "help"]);
    undo();
    await settle();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "?", shiftKey: true, bubbles: true, cancelable: true }),
    );
    await settle();
    expect(saved).toEqual(["save", "help"]);
    view.unmount();
  });

  test("keys are shown as the reader's keyboard writes them, and unbound without bindKeys", async () => {
    const saved: string[] = [];
    const view = await renderRoute({
      routeTree: tree({
        groups: [
          {
            heading: "File",
            actions: [{ label: "Save", keys: "mod+s", onSelect: () => saved.push("save") }],
          },
        ],
      }),
    });
    await settle();
    const mod = parseCombo("mod");
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "s",
        ctrlKey: mod.ctrl,
        metaKey: mod.meta,
        bubbles: true,
        cancelable: true,
      }),
    );
    await settle();
    expect(saved).toEqual([]);
    openCommandMenu();
    await settle();
    expect(options()).toEqual([mod.meta ? "Save⌘S" : "SaveCtrl+S"]);
    view.unmount();
  });
});

interface Doc {
  id: string;
  title: string;
  body: string;
}

const DOCS: Doc[] = Array.from({ length: 5 }, (_, index) => ({
  id: `d${String(index + 1)}`,
  title: `Report ${String(index + 1)}`,
  body: `The quarterly report, part ${String(index + 1)}`,
}));

interface SearchCall {
  query: string;
  cursor: unknown;
  signal: AbortSignal;
}

function docsSource(calls: SearchCall[], overrides: Partial<CommandSource> = {}): CommandSource {
  return {
    id: "docs",
    heading: "Documents",
    debounce: 5,
    search: async (query, { signal, cursor }) => {
      calls.push({ query, cursor, signal });
      await Promise.resolve();
      const start = typeof cursor === "number" ? cursor : 0;
      const matched = DOCS.filter((doc) => doc.title.toLowerCase().includes(query.toLowerCase()));
      const page = matched.slice(start, start + 2);
      return {
        results: page.map((doc) => ({
          id: doc.id,
          label: doc.title,
          snippet: doc.body,
          meta: "Doc",
          to: "/projects",
        })),
        next: start + 2 < matched.length ? start + 2 : undefined,
      };
    },
    ...overrides,
  };
}

async function typeInto(text: string): Promise<void> {
  const input = screen.getByRole("combobox");
  input.focus();
  await user.keyboard(text);
  await settle();
}

function sourceGroup(name: string): HTMLElement {
  return screen.getByRole("group", { name });
}

describe("CommandMenu sources", () => {
  test("typing searches a source once the typing pauses, aborting the search it replaced", async () => {
    const calls: SearchCall[] = [];
    const view = await renderRoute({ routeTree: tree({ sources: [docsSource(calls)] }) });
    openCommandMenu();
    await settle();
    await typeInto("r");
    expect(screen.queryByRole("group", { name: "Documents" })).toBeNull();

    await typeInto("ep");
    expect(screen.getByRole("progressbar", { name: "Searching Documents" })).toBeDefined();
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]?.query).toBe("rep");
    await waitFor(() =>
      expect(within(sourceGroup("Documents")).getAllByRole("option")).toHaveLength(3),
    );
    await settle();
    const results = [...document.querySelectorAll('[data-slot="command-menu-result"]')];
    expect(results.map((one) => one.querySelector("mark")?.textContent)).toEqual(["Rep", "Rep"]);
    expect(results[0]?.textContent).toContain("The quarterly report, part 1");
    expect(screen.getByRole("status").textContent).toBe("2 results");
    expect(screen.queryByText("No results found.")).toBeNull();
    expect(await ariaViolations(document.body)).toEqual([]);

    await typeInto("or");
    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls[1]?.query).toBe("repor");
    view.unmount();
  });

  test("a search still out when the text changes is aborted, and its answer dropped", async () => {
    const signals: AbortSignal[] = [];
    const answers: ((results: CommandResult[]) => void)[] = [];
    const slow: CommandSource = {
      id: "slow",
      heading: "Slow",
      debounce: 1,
      search: (_query, { signal }) => {
        signals.push(signal);
        return new Promise((resolve) => answers.push(resolve));
      },
    };
    const view = await renderRoute({ routeTree: tree({ sources: [slow] }) });
    openCommandMenu();
    await settle();
    await typeInto("ab");
    await waitFor(() => expect(signals).toHaveLength(1));
    await typeInto("c");
    expect(signals[0]?.aborted).toBe(true);
    answers[0]?.([{ id: "old", label: "Old answer" }]);
    await waitFor(() => expect(signals).toHaveLength(2));
    answers[1]?.([{ id: "new", label: "New abc" }]);
    await waitFor(() => expect(screen.getByRole("option", { name: "New abc" })).toBeDefined());
    expect(screen.queryByRole("option", { name: "Old answer" })).toBeNull();
    view.unmount();
    expect(signals[1]?.aborted).toBe(true);
  });

  test("Show more asks for the next page and adds it to the group", async () => {
    const calls: SearchCall[] = [];
    const view = await renderRoute({ routeTree: tree({ sources: [docsSource(calls)] }) });
    openCommandMenu();
    await settle();
    await typeInto("report");
    await waitFor(() => expect(screen.getByRole("option", { name: "Show more Documents" })));
    await user.click(screen.getByRole("option", { name: "Show more Documents" }));
    await settle();
    await waitFor(() =>
      expect(document.querySelectorAll('[data-slot="command-menu-result"]')).toHaveLength(4),
    );
    expect(calls.map((call) => call.cursor)).toEqual([undefined, 2]);
    expect(screen.getByRole("dialog")).toBeDefined();
    view.unmount();
  });

  test("each source says when it found nothing or failed, and the palette's empty waits for them", async () => {
    const failing: CommandSource = {
      id: "people",
      heading: "People",
      debounce: 5,
      search: () => Promise.reject(new Error("down")),
    };
    const view = await renderRoute({
      routeTree: tree({ sources: [docsSource([], { empty: "No documents" }), failing] }),
    });
    openCommandMenu();
    await settle();
    await typeInto("zz");
    expect(screen.queryByText("No results found.")).toBeNull();
    await waitFor(() => expect(screen.getByText("No documents")).toBeDefined());
    await waitFor(() => expect(screen.getByText("People could not be searched")).toBeDefined());
    await settle();
    expect(screen.getByText("No results found.")).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
    view.unmount();
  });

  test("a chosen result navigates, runs the source's onSelect and is offered again before typing", async () => {
    localStorage.removeItem("arc-test-recent");
    const chosen: string[] = [];
    const source = docsSource([], { onSelect: (result) => chosen.push(result.id) });
    const view = await renderRoute({
      routeTree: tree({ sources: [source], recent: { key: "arc-test-recent", max: 3 } }),
    });
    openCommandMenu();
    await settle();
    await typeInto("report 2");
    await waitFor(() => expect(screen.getByRole("option", { name: /Report 2/ })).toBeDefined());
    user.tap(screen.getByRole("option", { name: /Report 2/ }));
    await settle();
    await waitFor(() => expect(view.state.location().pathname).toBe("/projects"));
    expect(chosen).toEqual(["d2"]);
    expect(screen.queryByRole("dialog")).toBeNull();

    openCommandMenu();
    await settle();
    expect(screen.getByRole("combobox")).toHaveProperty("value", "");
    const recent = sourceGroup("Recent");
    expect(within(recent).getByRole("option").textContent).toContain("Report 2");
    expect(JSON.parse(localStorage.getItem("arc-test-recent") ?? "[]")).toHaveLength(1);
    view.unmount();
    localStorage.removeItem("arc-test-recent");
  });

  test("on a phone the palette takes the whole screen", () => {
    const sheet = collectCss();
    const root = commandMenuStyles().root.split(" ");
    expect(
      root.some((one) => sheet.includes(`@media (width < 40rem){.${one}{height:100dvh}`)),
    ).toBe(true);
  });

  test("a result is a finger's height, and its meta sits at the reading end", async () => {
    const view = await renderRoute({
      routeTree: tree({
        sources: [docsSource([])],
        classes: { result: "r", snippet: "s", meta: "m", label: "l", loading: "w" },
      }),
    });
    openCommandMenu();
    await settle();
    await typeInto("report");
    expect(document.querySelector('[data-slot="command-menu-loading"]')?.classList).toContain("w");
    await waitFor(() =>
      expect(document.querySelector('[data-slot="command-menu-result"]')).not.toBeNull(),
    );
    await settle();
    const result = document.querySelector('[data-slot="command-menu-result"]') as HTMLElement;
    expect(wears(result, touch.target)).toBe(true);
    for (const cls of ["r", "s", "m", "l"]) {
      expect(result.querySelector(`.${cls}`)).not.toBeNull();
    }
    expect(wears(result.querySelector(".m"), layout.pushEnd)).toBe(true);
    view.unmount();
  });
});
