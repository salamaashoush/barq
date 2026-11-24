import { describe, expect, test } from "bun:test";
import { createSignal, type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { Kanban } from "@barqjs/lucide/icons/kanban";
import { List } from "@barqjs/lucide/icons/list";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";
import { touch } from "@barqjs/ui/shared-touch";

import { hydrates, settle, wears } from "../test-arc.ts";
import { type DataView, DataViews, ViewSwitcher } from "./view-switcher.tsx";

const [query, setQuery] = createSignal("");
const TASKS = ["Write the brief", "Review the draft", "Ship it"];
function matching(): string[] {
  return TASKS.filter((task) => task.toLowerCase().includes(query()));
}

const VIEWS: DataView[] = [
  {
    id: "list",
    label: "List",
    icon: List,
    content: () => (
      <ul aria-label="Task list">
        {matching().map((task) => (
          <li>{task}</li>
        ))}
      </ul>
    ),
  },
  {
    id: "board",
    label: "Board",
    icon: Kanban,
    content: () => <div role="grid" aria-label="Task board" data-count={matching().length} />,
  },
  { id: "table", label: "Table", content: () => <table aria-label="Task table" /> },
  { id: "calendar", label: "Calendar", content: () => <div data-testid="calendar" /> },
];

function pressed(): string[] {
  return screen
    .getAllByRole("button")
    .filter((one) => one.getAttribute("aria-pressed") === "true")
    .map((one) => one.textContent ?? "");
}

describe("DataViews and ViewSwitcher", () => {
  test("one view at a time, chosen by a pressed button, over the same data", async () => {
    setQuery("");
    render(() => <DataViews aria-label="Tasks" views={VIEWS} />);
    const region = screen.getByRole("region", { name: "Tasks" });
    expect(within(region).getByRole("group", { name: "View" })).toBeDefined();
    expect(pressed()).toEqual(["List"]);
    expect(
      within(screen.getByRole("list", { name: "Task list" })).getAllByRole("listitem"),
    ).toHaveLength(3);
    expect(await ariaViolations(document.body)).toEqual([]);

    setQuery("the");
    await user.click(screen.getByRole("button", { name: "Board" }));
    await settle();
    expect(screen.queryByRole("list", { name: "Task list" })).toBeNull();
    expect(screen.getByRole("grid", { name: "Task board" }).getAttribute("data-count")).toBe("2");
    expect(region.getAttribute("data-view")).toBe("board");
  });

  test("the arrows move between the views, one Tab stop", async () => {
    const seen: string[] = [];
    render(() => (
      <ViewSwitcher views={VIEWS} defaultView="board" onViewChange={(v) => seen.push(v)} />
    ));
    user.tab();
    expect(document.activeElement?.textContent).toBe("Board");
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement?.textContent).toBe("Table");
    await user.keyboard("{Enter}");
    await settle();
    expect(seen).toEqual(["table"]);
    expect(pressed()).toEqual(["Table"]);
  });

  test("the view is the caller's when given", async () => {
    const [view, setView] = createSignal("table");
    render(() => <ViewSwitcher views={VIEWS} view={view()} onViewChange={setView} />);
    expect(pressed()).toEqual(["Table"]);
    setView("calendar");
    await settle();
    expect(pressed()).toEqual(["Calendar"]);
  });

  test("bound to a search parameter, the view has a link and the other parameters stay", async () => {
    setQuery("");
    function Tasks() {
      return <DataViews aria-label="Tasks" param="view" views={VIEWS} />;
    }
    const view = await renderRoute({
      routeTree: [{ path: "/tasks", component: Tasks }] as never,
      path: "/tasks?view=table&q=draft",
    });
    await settle();
    expect(pressed()).toEqual(["Table"]);
    expect(screen.getByRole("table", { name: "Task table" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Calendar" }));
    await waitFor(() => expect(view.state.search().get("view")).toBe("calendar"));
    expect(view.state.search().get("q")).toBe("draft");
    expect(screen.getByTestId("calendar")).toBeDefined();
    view.unmount();
  });

  test("an unknown view in the URL falls back to the first", async () => {
    const view = await renderRoute({
      routeTree: [
        { path: "/tasks", component: () => <ViewSwitcher param="view" views={VIEWS} /> },
      ] as never,
      path: "/tasks?view=nope",
    });
    await settle();
    expect(pressed()).toEqual(["List"]);
    view.unmount();
  });

  test("icons alone keep the label for a screen reader, and each is a finger's size", () => {
    render(() => <ViewSwitcher views={VIEWS} iconOnly />);
    const board = screen.getByRole("button", { name: "Board" });
    expect(board.getAttribute("title")).toBe("Board");
    expect(wears(board, touch.target)).toBe(true);
    user.tap(board);
    expect(board.getAttribute("aria-pressed")).toBe("true");
  });

  test("runs right to left, the arrows following the reading direction", async () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <ViewSwitcher views={VIEWS} />
      </Arabic>
    ));
    user.tab();
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement?.textContent).toBe("Board");
  });

  test("takes a class per part", () => {
    render(() => (
      <DataViews
        aria-label="Tasks"
        class="mine"
        views={VIEWS}
        toolbar={<span>tools</span>}
        classes={{
          root: "r",
          header: "h",
          toolbar: "t",
          switcher: "s",
          item: "i",
          label: "l",
          content: "c",
        }}
      />
    ));
    const pairs = [
      ["data-views", "r"],
      ["data-views-header", "h"],
      ["data-views-toolbar", "t"],
      ["view-switcher", "s"],
      ["view-switcher-item", "i"],
      ["view-switcher-label", "l"],
      ["data-views-content", "c"],
    ] as const;
    for (const [name, cls] of pairs) {
      expect(document.querySelector(`[data-slot="${name}"]`)?.classList.contains(cls)).toBe(true);
    }
    expect(document.querySelector('[data-slot="data-views"]')?.classList.contains("mine")).toBe(
      true,
    );
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { DataViews } from "<arc>";
      export function Page() {
        return (
          <DataViews
            aria-label="Tasks"
            defaultView="board"
            views={[
              { id: "list", label: "List", content: () => <p>list</p> },
              { id: "board", label: "Board", content: () => <p>board</p> },
            ]}
          />
        );
      }
    `);
    expect(result.container.querySelector('[data-slot="data-views-content"]')?.textContent).toBe(
      "board",
    );
    result.unmount();
  });
});
