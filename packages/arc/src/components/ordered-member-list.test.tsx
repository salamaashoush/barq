import { afterEach, describe, expect, test } from "bun:test";
import { createSignal, flush, type ParentProps } from "@barqjs/core";
import { dragSession } from "@barqjs/aria/dnd";
import { provideLocale } from "@barqjs/aria/i18n";
import { clearAnnouncer } from "@barqjs/aria/live";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import type { EntityOption } from "./entity-picker.tsx";
import { OrderedMemberList } from "./ordered-member-list.tsx";

const PEOPLE: EntityOption[] = [
  { id: "u1", label: "Salama Ashoush", description: "Lead" },
  { id: "u2", label: "Ana Lima" },
  { id: "u3", label: "Ben Okafor" },
  { id: "u4", label: "Chen Wu" },
];

async function search(query: string): Promise<EntityOption[]> {
  await Promise.resolve();
  return PEOPLE.filter((one) => one.label.toLowerCase().includes(query.toLowerCase()));
}

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

interface RotationProps {
  seen?: string[][];
  max?: number;
}

function Rotation(props: RotationProps) {
  const [members, setMembers] = createSignal<readonly EntityOption[]>(PEOPLE.slice(0, 3));
  return (
    <OrderedMemberList
      label="Turn order"
      description="Each takes a week, in this order."
      value={members()}
      max={props.max}
      search={search}
      onChange={(next) => {
        props.seen?.push(next.map((one) => one.id));
        setMembers(next);
      }}
    />
  );
}

function names(): string[] {
  return [...document.querySelectorAll('[data-slot="ordered-member-list-name"]')].map(
    (one) => one.textContent ?? "",
  );
}

function picker(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("combobox", { name: "Add a member" });
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("OrderedMemberList", () => {
  test("a numbered list named by its label, each with move and remove buttons", async () => {
    render(() => <Rotation />);
    await settle();
    const list = screen.getByRole("grid", { name: "Turn order" });
    expect(names()).toEqual(["Salama Ashoush", "Ana Lima", "Ben Okafor"]);
    expect(
      [...document.querySelectorAll('[data-slot="ordered-member-list-position"]')].map(
        (one) => one.textContent,
      ),
    ).toEqual(["1", "2", "3"]);
    expect(
      within(list).getByRole("button", { name: "Move Salama Ashoush up" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      within(list).getByRole("button", { name: "Move Ben Okafor down" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(within(list).getByRole("button", { name: "Remove Ana Lima" })).toBeDefined();
    expect(document.querySelector('[data-slot="ordered-member-list-detail"]')?.textContent).toBe(
      "Lead",
    );
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("moves a person later, the numbers following", async () => {
    const seen: string[][] = [];
    render(() => <Rotation seen={seen} />);
    await settle();
    user.click(screen.getByRole("button", { name: "Move Salama Ashoush down" }));
    await settle();
    expect(seen.at(-1)).toEqual(["u2", "u1", "u3"]);
    expect(names()).toEqual(["Ana Lima", "Salama Ashoush", "Ben Okafor"]);
  });

  test("removes a person and hands focus to the row in their place", async () => {
    const seen: string[][] = [];
    render(() => <Rotation seen={seen} />);
    await settle();
    user.click(screen.getByRole("button", { name: "Remove Ana Lima" }));
    await settle();
    expect(seen.at(-1)).toEqual(["u1", "u3"]);
    expect(document.activeElement?.textContent).toContain("Ben Okafor");
  });

  test("adds from a search that leaves out those already listed", async () => {
    const seen: string[][] = [];
    render(() => <Rotation seen={seen} />);
    await settle();
    picker().focus();
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(1), { timeout: 1500 });
    expect(screen.getByRole("option").textContent).toContain("Chen Wu");
    await user.keyboard("{ArrowDown}{Enter}");
    await settle();
    expect(seen.at(-1)).toEqual(["u1", "u2", "u3", "u4"]);
    expect(names().at(-1)).toBe("Chen Wu");
  });

  test("at its max the add field goes quiet", async () => {
    render(() => <Rotation max={3} />);
    await settle();
    expect(picker().hasAttribute("disabled")).toBe(true);
  });

  test("someone whose name is gone reads as having left; an empty list says so", async () => {
    render(() => (
      <OrderedMemberList
        label="Escalation"
        defaultValue={[{ id: "x", label: "" }]}
        search={search}
      />
    ));
    await settle();
    expect(names()).toEqual(["Someone who left"]);
    expect(screen.getByRole("button", { name: "Remove Someone who left" })).toBeDefined();
    user.click(screen.getByRole("button", { name: "Remove Someone who left" }));
    await settle();
    expect(document.querySelector('[data-slot="ordered-member-list-empty"]')?.textContent).toBe(
      "No members yet.",
    );
  });

  test("rows drag by their handle from the keyboard", async () => {
    const seen: string[][] = [];
    render(() => <Rotation seen={seen} />);
    await settle();
    screen.getByRole("button", { name: "Drag Salama Ashoush" }).focus();
    press("Enter");
    await nextFrame();
    press("ArrowDown");
    press("Enter");
    await nextFrame();
    await settle();
    expect(seen.at(-1)).toEqual(["u2", "u1", "u3"]);
  });

  test("disabled, a plain numbered list", async () => {
    render(() => (
      <OrderedMemberList
        label="Turn order"
        isDisabled
        defaultValue={PEOPLE.slice(0, 2)}
        search={search}
      />
    ));
    await settle();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  test("right to left, the positions are written in the locale's digits", async () => {
    render(() => (
      <Arabic>
        <OrderedMemberList label="الترتيب" defaultValue={PEOPLE.slice(0, 2)} search={search} />
      </Arabic>
    ));
    await settle();
    expect(
      [...document.querySelectorAll('[data-slot="ordered-member-list-position"]')].map(
        (one) => one.textContent,
      ),
    ).toEqual(["١", "٢"]);
  });
});

describe("an ordered member list hydrates", () => {
  test("what the server wrote", async () => {
    const result = await hydrates(`
      import { OrderedMemberList } from "<arc>";
      export function Page() {
        return (
          <OrderedMemberList
            label="Turn order"
            defaultValue={[{ id: "u1", label: "Salama Ashoush" }, { id: "u2", label: "Ana Lima" }]}
            search={async () => []}
          />
        );
      }
    `);
    expect(
      result.container.querySelectorAll('[data-slot="ordered-member-list-member"]'),
    ).toHaveLength(2);
    result.unmount();
  });
});
