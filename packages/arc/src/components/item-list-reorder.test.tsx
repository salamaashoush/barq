import { afterEach, describe, expect, test } from "bun:test";
import { createSignal, flush, type ParentProps } from "@barqjs/core";
import { dragSession } from "@barqjs/aria/dnd";
import { provideLocale } from "@barqjs/aria/i18n";
import { clearAnnouncer } from "@barqjs/aria/live";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { List, ListItem, type ListReorderEvent, reorderItems } from "./item-list.tsx";

interface Stop {
  id: string;
  name: string;
}

const STOPS: Stop[] = [
  { id: "a", name: "Cairo" },
  { id: "b", name: "Giza" },
  { id: "c", name: "Luxor" },
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

interface StopsProps {
  moves?: ListReorderEvent[];
  moveButtons?: boolean;
}

function Stops(props: StopsProps) {
  const [stops, setStops] = createSignal(STOPS);
  return (
    <List<Stop>
      aria-label="Route"
      items={stops()}
      moveButtons={props.moveButtons}
      onReorder={(event) => {
        props.moves?.push(event);
        setStops(reorderItems(stops(), event));
      }}
    >
      {(stop) => <ListItem title={stop.name} />}
    </List>
  );
}

function names(): string[] {
  return [...document.querySelectorAll('[data-slot="list-item-title"]')].map(
    (one) => one.textContent ?? "",
  );
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("List reordering", () => {
  test("reorderItems puts the moved rows beside the target, in their order", () => {
    expect(
      reorderItems(STOPS, { keys: ["a"], target: { key: "c", position: "after" } }).map(
        (one) => one.id,
      ),
    ).toEqual(["b", "c", "a"]);
    expect(
      reorderItems(STOPS, { keys: ["c", "b"], target: { key: "a", position: "before" } }).map(
        (one) => one.id,
      ),
    ).toEqual(["b", "c", "a"]);
    expect(
      reorderItems(STOPS, { keys: ["a"], target: { key: "gone", position: "before" } }).map(
        (one) => one.id,
      ),
    ).toEqual(["b", "c", "a"]);
  });

  test("each row has a drag button named after it, and the keyboard moves a row with it", async () => {
    const moves: ListReorderEvent[] = [];
    render(() => <Stops moves={moves} />);
    const grid = screen.getByRole("grid", { name: "Route" });
    expect(within(grid).getByRole("button", { name: "Drag Cairo" })).toBeDefined();
    user.tab();
    press("ArrowRight");
    expect(document.activeElement?.getAttribute("data-slot")).toBe("list-drag");
    press("Enter");
    await nextFrame();
    press("ArrowDown");
    press("Enter");
    await nextFrame();
    await settle();
    expect(moves[0]?.keys).toEqual(["a"]);
    expect(names()).toEqual(["Giza", "Cairo", "Luxor"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a drag starts only from the handle, which is a finger's size", () => {
    render(() => <Stops />);
    const row = screen.getAllByRole("row")[0] as HTMLElement;
    expect(row.getAttribute("draggable")).not.toBe("true");
    const handle = screen.getByRole("button", { name: "Drag Cairo" });
    expect(handle.getAttribute("draggable")).toBe("true");
  });

  test("move buttons move a row one place, the ends go quiet, and focus stays on the button", async () => {
    const moves: ListReorderEvent[] = [];
    render(() => <Stops moves={moves} moveButtons />);
    const up = screen.getByRole("button", { name: "Move Cairo up" });
    expect(up.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Move Luxor down" }).hasAttribute("disabled")).toBe(
      true,
    );
    const down = screen.getByRole("button", { name: "Move Cairo down" });
    user.click(down);
    await settle();
    expect(moves[0]).toEqual({ keys: ["a"], target: { key: "b", position: "after" } });
    expect(names()).toEqual(["Giza", "Cairo", "Luxor"]);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Move Cairo down");
    user.click(screen.getByRole("button", { name: "Move Cairo down" }));
    await settle();
    expect(names()).toEqual(["Giza", "Luxor", "Cairo"]);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Move Cairo up");
  });

  test("rows holding text fields keep their keys under tab navigation", async () => {
    const moves: ListReorderEvent[] = [];
    render(() => (
      <List<Stop>
        aria-label="Route"
        items={STOPS}
        keyboardNavigationBehavior="tab"
        onReorder={(event) => moves.push(event)}
      >
        {(stop) => <input aria-label={`${stop.name} note`} />}
      </List>
    ));
    const field = screen.getByRole("textbox", { name: "Cairo note" });
    field.focus();
    await user.type(field, "ab");
    press("ArrowDown");
    press("ArrowLeft");
    expect(document.activeElement).toBe(field);
    expect((field as HTMLInputElement).value).toBe("ab");
    expect(moves).toEqual([]);
  });

  test("right to left, the handle comes first on the start side", () => {
    render(() => (
      <Arabic>
        <Stops moveButtons />
      </Arabic>
    ));
    const sortable = document.querySelector('[data-slot="list-sortable"]') as HTMLElement;
    expect(sortable.firstElementChild?.getAttribute("data-slot")).toBe("list-drag");
    expect(sortable.lastElementChild?.getAttribute("data-slot")).toBe("list-move");
  });
});

describe("a reorderable list hydrates", () => {
  test("what the server wrote", async () => {
    const result = await hydrates(`
      import { List, ListItem } from "<arc>";
      const STOPS = [{ id: "a", name: "Cairo" }, { id: "b", name: "Giza" }];
      export function Page() {
        return (
          <List aria-label="Route" items={STOPS} moveButtons onReorder={() => {}}>
            {(stop) => <ListItem title={stop.name} />}
          </List>
        );
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="list-drag"]')).toHaveLength(2);
    result.unmount();
  });
});
