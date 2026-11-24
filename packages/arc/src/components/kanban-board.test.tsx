import { afterEach, describe, expect, test } from "bun:test";
import { type Child, createSignal, flush } from "@barqjs/core";
import { dragSession } from "@barqjs/aria/dnd";
import { provideLocale } from "@barqjs/aria/i18n";
import { clearAnnouncer } from "@barqjs/aria/live";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";
import { srOnly } from "@barqjs/ui/sr-only";

import { layout, target } from "../style/index.ts";
import { hydrates, settle, wears } from "../test-arc.ts";
import { ListItem } from "./item-list.tsx";
import {
  type KanbanColumn,
  KanbanBoard,
  type KanbanMoveEvent,
  applyKanbanMove,
} from "./kanban-board.tsx";

interface Task {
  id: string;
  title: string;
}

const COLUMNS: KanbanColumn<Task>[] = [
  {
    id: "todo",
    title: "To do",
    items: [
      { id: "t1", title: "Write the brief" },
      { id: "t2", title: "Book the room" },
    ],
  },
  { id: "doing", title: "Doing", limit: 1, items: [{ id: "t3", title: "Review the draft" }] },
  { id: "done", title: "Done", items: [] },
];

function press(key: string): void {
  user.keyDown(key);
  user.keyUp(key);
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  flush();
}

afterEach(async () => {
  if (dragSession() !== null) press("Escape");
  await nextFrame();
  clearAnnouncer();
});

function Board(props: { onMove?: (event: KanbanMoveEvent) => void; strict?: boolean }) {
  const [columns, setColumns] = createSignal(COLUMNS);
  return (
    <KanbanBoard<Task>
      aria-label="Tasks"
      columns={columns()}
      strictLimits={props.strict}
      onMove={(event) => {
        props.onMove?.(event);
        setColumns(applyKanbanMove(columns(), event));
      }}
    >
      {(task) => <ListItem title={task.title} />}
    </KanbanBoard>
  );
}

/** Tab past the first column's header to its first card. */
function toFirstCard(): void {
  for (let step = 0; step < 4; step++) {
    user.tab();
    if (document.activeElement?.getAttribute("data-slot") === "kanban-card") return;
  }
}

function titles(column: string): string[] {
  const list = screen.getByRole("grid", { name: column });
  return within(list)
    .queryAllByRole("row")
    .filter((row) => row.getAttribute("data-slot") === "kanban-card")
    .map((row) => row.textContent ?? "");
}

describe("KanbanBoard", () => {
  test("a region of named columns, each a grid of cards counted against its limit", async () => {
    render(() => <Board />);
    const board = screen.getByRole("region", { name: "Tasks" });
    const columns = within(board).getAllByRole("region");
    expect(columns.map((one) => one.getAttribute("aria-labelledby") !== null)).toEqual([
      true,
      true,
      true,
    ]);
    expect(titles("To do")).toEqual(["Write the brief", "Book the room"]);
    expect(screen.getByText("No cards")).toBeDefined();
    const doing = columns[1] as HTMLElement;
    expect(doing.querySelector('[data-slot="kanban-column-count"]')?.textContent).toBe("1 / 1");
    expect(doing.textContent).toContain("1 of 1 cards");
    expect(
      within(columns[0] as HTMLElement).getByRole("button", { name: "Drag Write the brief" }),
    ).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the keyboard moves a card within its column", async () => {
    const moves: KanbanMoveEvent[] = [];
    render(() => <Board onMove={(event) => moves.push(event)} />);
    toFirstCard();
    press("ArrowRight");
    expect(document.activeElement?.getAttribute("data-slot")).toBe("kanban-drag");
    press("Enter");
    await nextFrame();
    press("ArrowDown");
    press("Enter");
    await nextFrame();
    await settle();
    expect(moves[0]).toEqual({
      keys: ["t1"],
      from: "todo",
      to: "todo",
      target: { key: "t2", position: "after" },
    });
    expect(titles("To do")).toEqual(["Book the room", "Write the brief"]);
  });

  test("the keyboard moves a card into another column, and an empty one takes it", async () => {
    const moves: KanbanMoveEvent[] = [];
    render(() => <Board onMove={(event) => moves.push(event)} />);
    toFirstCard();
    press("ArrowRight");
    press("Enter");
    await nextFrame();
    const done = screen.getByRole("grid", { name: "Done" });
    for (let step = 0; step < 6 && !done.contains(document.activeElement); step++) press("Tab");
    expect(done.contains(document.activeElement)).toBe(true);
    press("Enter");
    await nextFrame();
    await waitFor(() => expect(moves).toHaveLength(1));
    expect(moves[0]).toMatchObject({ keys: ["t1"], from: "todo", to: "done", target: null });
    await settle();
    expect(titles("Done")).toEqual(["Write the brief"]);
    expect(titles("To do")).toEqual(["Book the room"]);
  });

  test("with strict limits a full column takes no drop", async () => {
    render(() => <Board strict />);
    toFirstCard();
    press("ArrowRight");
    press("Enter");
    await nextFrame();
    const doing = screen.getByRole("grid", { name: "Doing" });
    const visited: boolean[] = [];
    for (let step = 0; step < 8; step++) {
      press("Tab");
      visited.push(doing.contains(document.activeElement));
    }
    expect(visited.some(Boolean)).toBe(false);
  });

  test("past its limit a column warns, in a tone and in words", async () => {
    render(() => (
      <KanbanBoard<Task>
        aria-label="Tasks"
        columns={[{ id: "doing", title: "Doing", limit: 1, items: COLUMNS[0]?.items ?? [] }]}
      >
        {(task) => <ListItem title={task.title} />}
      </KanbanBoard>
    ));
    const column = document.querySelector('[data-slot="kanban-column"]') as HTMLElement;
    expect(column.hasAttribute("data-over")).toBe(true);
    expect(column.textContent).toContain("2 of 1 cards, over its limit");
  });

  test("a column folds to a strip and opens again, and Add card asks for one there", async () => {
    const added: string[] = [];
    render(() => (
      <KanbanBoard<Task> aria-label="Tasks" columns={COLUMNS} onAddCard={(id) => added.push(id)}>
        {(task) => <ListItem title={task.title} />}
      </KanbanBoard>
    ));
    const fold = screen.getByRole("button", { name: "Collapse To do" });
    expect(fold.getAttribute("aria-expanded")).toBe("true");
    await user.click(fold);
    await settle();
    expect(screen.queryByRole("grid", { name: "To do" })).toBeNull();
    expect(screen.getByRole("button", { name: "Expand To do" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
    await user.click(screen.getByRole("button", { name: "Expand To do" }));
    await settle();
    expect(titles("To do")).toHaveLength(2);
    user.tap(screen.getByRole("button", { name: "Add card to Done" }));
    expect(added).toEqual(["done"]);
  });

  test("a card's drag button is a finger's size, and a card drags from anywhere under a finger", () => {
    render(() => <Board />);
    const handle = screen.getByRole("button", { name: "Drag Write the brief" });
    expect(wears(handle, target.size)).toBe(true);
    const card = handle.closest('[data-slot="kanban-card"]') as HTMLElement;
    expect(card.getAttribute("draggable")).toBe("true");
  });

  test("the board holds its hidden words, so a board that overflows does not widen the page", () => {
    render(() => <Board />);
    const board = document.querySelector('[data-slot="kanban-board"]');
    const hidden = [...(board?.querySelectorAll("span") ?? [])].filter((span) =>
      wears(span, srOnly),
    );
    expect(hidden.length).toBeGreaterThan(0);
    expect(wears(board, layout.relative)).toBe(true);
  });

  test("virtual: a long column draws only the cards on screen", () => {
    const many = Array.from({ length: 200 }, (_, at) => ({ id: `c${at}`, title: `Card ${at}` }));
    render(() => (
      <KanbanBoard<Task>
        aria-label="Big"
        columns={[{ id: "all", title: "All", items: many }]}
        virtual={{ cardHeight: 48, height: "240px" }}
      >
        {(task) => <ListItem title={task.title} />}
      </KanbanBoard>
    ));
    const grid = screen.getByRole("grid", { name: "All" });
    Object.defineProperty(grid, "clientHeight", { value: 240, configurable: true });
    Object.defineProperty(grid, "clientWidth", { value: 280, configurable: true });
    grid.dispatchEvent(new Event("scroll"));
    flush();
    expect(grid.getAttribute("aria-rowcount")).toBe("200");
    expect(within(grid).getAllByRole("row").length).toBeLessThan(40);
  });

  test("runs right to left, the counts in the locale's digits", () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <Board />
      </Arabic>
    ));
    const counts = [...document.querySelectorAll('[data-slot="kanban-column-count"]')];
    expect(counts[1]?.textContent).toBe("١ / ١");
    expect(
      document.querySelector('[data-slot="kanban-board"]')?.closest("[dir=rtl]"),
    ).not.toBeNull();
  });

  test("takes a class per part", () => {
    render(() => (
      <KanbanBoard<Task>
        aria-label="Tasks"
        class="mine"
        columns={COLUMNS}
        classes={{
          root: "r",
          column: "c",
          header: "h",
          title: "t",
          count: "n",
          list: "l",
          card: "k",
          drag: "d",
        }}
      >
        {(task) => <ListItem title={task.title} />}
      </KanbanBoard>
    ));
    const pairs = [
      ["kanban-board", "r"],
      ["kanban-column", "c"],
      ["kanban-column-header", "h"],
      ["kanban-column-title", "t"],
      ["kanban-column-count", "n"],
      ["kanban-list", "l"],
      ["kanban-card", "k"],
      ["kanban-drag", "d"],
    ] as const;
    for (const [name, cls] of pairs) {
      expect(document.querySelector(`[data-slot="${name}"]`)?.classList.contains(cls)).toBe(true);
    }
    expect(document.querySelector('[data-slot="kanban-board"]')?.classList.contains("mine")).toBe(
      true,
    );
  });

  test("applyKanbanMove puts cards beside their target or at the end", () => {
    const after = applyKanbanMove(COLUMNS, {
      keys: ["t3"],
      from: "doing",
      to: "todo",
      target: { key: "t1", position: "before" },
    });
    expect(after.map((column) => column.items.map((item) => item.id))).toEqual([
      ["t3", "t1", "t2"],
      [],
      [],
    ]);
    const end = applyKanbanMove(after, { keys: ["t1"], from: "todo", to: "done", target: null });
    expect(end[2]?.items.map((item) => item.id)).toEqual(["t1"]);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { KanbanBoard, ListItem } from "<arc>";
      export function Page() {
        return (
          <KanbanBoard
            aria-label="Tasks"
            columns={[{ id: "a", title: "To do", items: [{ id: "x", title: "Write" }] }]}
          >
            {(task) => <ListItem title={task.title} />}
          </KanbanBoard>
        );
      }
    `);
    expect(result.container.querySelector('[data-slot="kanban-card"]')?.textContent).toContain(
      "Write",
    );
    result.unmount();
  });
});
