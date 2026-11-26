import { afterEach, describe, expect, test } from "bun:test";
import { createSignal, flush, type ParentProps } from "@barqjs/core";
import { dragSession } from "@barqjs/aria/dnd";
import { provideLocale } from "@barqjs/aria/i18n";
import { clearAnnouncer } from "@barqjs/aria/live";
import { accessibleName, ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { type ChecklistItem, ChecklistEditor } from "./checklist-editor.tsx";

const ITEMS: ChecklistItem[] = [
  { id: "1", label: "Draft the brief", done: true },
  { id: "2", label: "Book the room", done: false },
  { id: "3", label: "Send invites", done: false },
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

interface SubtasksProps {
  seen?: ChecklistItem[][];
}

function Subtasks(props: SubtasksProps) {
  const [items, setItems] = createSignal(ITEMS);
  return (
    <ChecklistEditor
      label="Subtasks"
      value={items()}
      onChange={(next) => {
        props.seen?.push(next);
        setItems(next);
      }}
    />
  );
}

function labels(): string[] {
  return [...document.querySelectorAll('[data-slot="inline-edit-display"]')].map(
    (one) => one.textContent ?? "",
  );
}

function adder(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("textbox", { name: "Add an item" });
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("ChecklistEditor", () => {
  test("its lines with their boxes, and how many are done in words and as a bar", async () => {
    render(() => <Subtasks />);
    await settle();
    expect(labels()).toEqual(["Draft the brief", "Book the room", "Send invites"]);
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Draft the brief" }).checked,
    ).toBe(true);
    const bar = screen.getByRole("progressbar", { name: "Subtasks" });
    expect(bar.getAttribute("aria-valuetext")).toBe("1 of 3 done");
    expect(document.querySelector('[data-slot="checklist-editor-count"]')?.textContent).toBe("1/3");
    expect(screen.getByRole("grid", { name: "Subtasks" })).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("ticking a line marks it done and moves the count", async () => {
    const seen: ChecklistItem[][] = [];
    render(() => <Subtasks seen={seen} />);
    await settle();
    user.click(screen.getByRole("checkbox", { name: "Book the room" }));
    await settle();
    expect(seen.at(-1)?.map((one) => one.done)).toEqual([true, true, false]);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe("2 of 3 done");
    expect(
      document.querySelectorAll('[data-slot="checklist-editor-item"][data-done]'),
    ).toHaveLength(2);
  });

  test("Enter adds a line and keeps the field for the next; Escape empties it", async () => {
    const seen: ChecklistItem[][] = [];
    render(() => <Subtasks seen={seen} />);
    await settle();
    adder().focus();
    await user.type(adder(), "Order lunch{Enter}");
    await settle();
    expect(labels().at(-1)).toBe("Order lunch");
    expect(seen.at(-1)?.at(-1)?.done).toBe(false);
    expect(adder().value).toBe("");
    expect(document.activeElement).toBe(adder());
    await user.type(adder(), "  {Enter}");
    await settle();
    expect(labels()).toHaveLength(4);
    await user.type(adder(), "draft");
    await user.keyboard("{Escape}");
    await settle();
    expect(adder().value).toBe("");
  });

  test("a line's text is edited in place, and an empty edit is refused", async () => {
    const seen: ChecklistItem[][] = [];
    render(() => <Subtasks seen={seen} />);
    await settle();
    const display = document.querySelectorAll<HTMLElement>('[data-slot="inline-edit-display"]')[1]!;
    expect(accessibleName(display)).toBe("Item: Book the room");
    await user.click(display);
    await settle();
    const input = document.querySelector('[data-slot="inline-edit-input"]') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "{Enter}");
    await settle();
    expect(screen.getByRole("alert").textContent).toBe("Write something, or remove the item.");
    await user.type(input, "Book the big room{Enter}");
    await settle();
    expect(labels()[1]).toBe("Book the big room");
  });

  test("remove takes a line out and hands focus to the line in its place", async () => {
    render(() => <Subtasks />);
    await settle();
    user.click(screen.getByRole("button", { name: "Remove Book the room" }));
    await settle();
    expect(labels()).toEqual(["Draft the brief", "Send invites"]);
    expect(document.activeElement).toBe(screen.getByRole("checkbox", { name: "Send invites" }));
  });

  test("lines reorder through their drag handles", async () => {
    const seen: ChecklistItem[][] = [];
    render(() => <Subtasks seen={seen} />);
    await settle();
    const handle = screen.getByRole("button", { name: "Drag Draft the brief" });
    handle.focus();
    press("Enter");
    await nextFrame();
    press("ArrowDown");
    press("Enter");
    await nextFrame();
    await settle();
    expect(labels()).toEqual(["Book the room", "Draft the brief", "Send invites"]);
  });

  test("uncontrolled, empty, and disabled", async () => {
    render(() => <ChecklistEditor label="Steps" emptyLabel="No steps yet." isDisabled />);
    await settle();
    expect(document.querySelector('[data-slot="checklist-editor-empty"]')?.textContent).toBe(
      "No steps yet.",
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  test("right to left, the count follows the locale's digits in the bar's words", async () => {
    render(() => (
      <Arabic>
        <ChecklistEditor label="المهام" defaultValue={ITEMS} />
      </Arabic>
    ));
    await settle();
    expect(screen.getByRole("progressbar", { name: "المهام" })).toBeDefined();
    expect(
      document
        .querySelector('[data-slot="list-sortable"]')
        ?.firstElementChild?.getAttribute("data-slot"),
    ).toBe("list-drag");
  });
});

describe("a checklist editor hydrates", () => {
  test("what the server wrote", async () => {
    const result = await hydrates(`
      import { ChecklistEditor } from "<arc>";
      export function Page() {
        return (
          <ChecklistEditor
            label="Subtasks"
            defaultValue={[
              { id: "1", label: "Draft the brief", done: true },
              { id: "2", label: "Book the room", done: false },
            ]}
          />
        );
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="checklist-editor-item"]')).toHaveLength(
      2,
    );
    result.unmount();
  });
});
