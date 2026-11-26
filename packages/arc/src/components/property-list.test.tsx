import { afterEach, describe, expect, test } from "bun:test";
import { createSignal, type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { accessibleName, ariaViolations, render, screen, user, waitFor } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import type { EntityOption } from "./entity-picker.tsx";
import { type PropertyField, PropertyList } from "./property-list.tsx";

afterEach(() => destroyAnnouncer());

const PEOPLE: EntityOption[] = [
  { id: "u1", label: "Salama Ashoush" },
  { id: "u2", label: "Ana Lima" },
];

async function search(query: string): Promise<EntityOption[]> {
  await Promise.resolve();
  return PEOPLE.filter((one) => one.label.toLowerCase().includes(query.toLowerCase()));
}

const FIELDS: PropertyField[] = [
  {
    id: "status",
    label: "Status",
    kind: "choice",
    options: [
      { value: "todo", label: "To do", tone: "neutral" },
      { value: "doing", label: "In progress", tone: "info" },
      { value: "done", label: "Done", tone: "success" },
    ],
  },
  { id: "assignees", label: "Assignees", kind: "people", search },
  { id: "due", label: "Due", kind: "date", clearable: true },
  { id: "summary", label: "Summary", kind: "text", multiline: true },
  { id: "ref", label: "Reference", kind: "value", format: (value) => `#${String(value)}` },
];

interface Saved {
  id: string;
  value: unknown;
}

interface TaskProps {
  saves?: Saved[];
  fail?: boolean;
  disabled?: boolean;
}

function Task(props: TaskProps) {
  const [values, setValues] = createSignal<Record<string, unknown>>({
    status: "doing",
    assignees: [PEOPLE[0]],
    due: "2026-03-04",
    summary: "Ship the brief",
    ref: 42,
  });
  return (
    <PropertyList
      fields={FIELDS}
      values={values()}
      isDisabled={props.disabled}
      onSave={async (id, value) => {
        props.saves?.push({ id, value });
        if (props.fail === true) throw new Error("The task is locked.");
        setValues({ ...values(), [id]: value });
      }}
    />
  );
}

function day(of: number): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(`, March ${String(of)}, 2026`) });
}

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("PropertyList", () => {
  test("a dl of named values, each its own editor", async () => {
    render(() => <Task />);
    await settle();
    const list = slot("description-list");
    expect(list.tagName).toBe("DL");
    expect([...list.querySelectorAll("dt")].map((one) => one.textContent)).toEqual([
      "Status",
      "Assignees",
      "Due",
      "Summary",
      "Reference",
    ]);
    expect(
      [...document.querySelectorAll('[data-slot="property-list-value"]')].map((one) =>
        one.getAttribute("data-kind"),
      ),
    ).toEqual(["choice", "people", "date", "text", "value"]);
    expect(slot("inline-select-trigger").textContent).toContain("In progress");
    expect(screen.getByRole("toolbar", { name: "Chosen assignees" }).textContent).toContain(
      "Salama Ashoush",
    );
    expect(accessibleName(slot("property-list-date"))).toBe("Due: Mar 4, 2026");
    expect(accessibleName(slot("inline-edit-display"))).toBe("Summary: Ship the brief");
    expect(list.textContent).toContain("#42");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a choice saves its value, its option drawn with a dot in its tone", async () => {
    const saves: Saved[] = [];
    render(() => <Task saves={saves} />);
    await settle();
    await user.click(slot("inline-select-trigger"));
    await settle();
    const done = screen.getByRole("option", { name: "Done" });
    expect(done.querySelector('[data-slot="property-list-dot"]')).not.toBeNull();
    await user.click(done);
    await settle();
    expect(saves).toEqual([{ id: "status", value: "done" }]);
    expect(slot("inline-select-trigger").textContent).toContain("Done");
  });

  test("text saves where it is read", async () => {
    const saves: Saved[] = [];
    render(() => <Task saves={saves} />);
    await settle();
    await user.click(slot("inline-edit-display"));
    await settle();
    const field = document.querySelector('[data-slot="inline-edit-input"]') as HTMLTextAreaElement;
    await user.clear(field);
    await user.type(field, "Ship it");
    await user.keyboard("{Enter}", { ctrlKey: true });
    await settle();
    expect(saves).toEqual([{ id: "summary", value: "Ship it" }]);
  });

  test("a day is picked on a calendar and saved as an ISO date, or cleared", async () => {
    const saves: Saved[] = [];
    render(() => <Task saves={saves} />);
    await settle();
    await user.click(slot("property-list-date"));
    await settle();
    await waitFor(() => expect(screen.getByRole("grid")).toBeDefined());
    user.click(day(12));
    await settle();
    expect(saves).toEqual([{ id: "due", value: "2026-03-12" }]);
    expect(accessibleName(slot("property-list-date"))).toBe("Due: Mar 12, 2026");
    await user.click(slot("property-list-date"));
    await settle();
    await user.click(screen.getByRole("button", { name: "No date" }));
    await settle();
    expect(saves.at(-1)).toEqual({ id: "due", value: null });
    expect(accessibleName(slot("property-list-date"))).toBe("Due: Not set");
  });

  test("people are added from a search and saved as a list", async () => {
    const saves: Saved[] = [];
    render(() => <Task saves={saves} />);
    await settle();
    const input = document.querySelector(
      '[data-slot="entity-picker-input"] input, input[data-slot="entity-picker-input"]',
    ) as HTMLInputElement;
    input.focus();
    await user.keyboard("ana");
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0), {
      timeout: 1500,
    });
    await user.keyboard("{ArrowDown}{Enter}");
    await settle();
    await waitFor(() => expect(saves.length).toBe(1));
    const people = (saves[0]?.value ?? []) as EntityOption[];
    expect(people.map((one) => one.id)).toEqual(["u1", "u2"]);
  });

  test("a failed save says why, and a disabled list edits nothing", async () => {
    render(() => <Task fail />);
    await settle();
    await user.click(slot("property-list-date"));
    await settle();
    await waitFor(() => expect(screen.getByRole("grid")).toBeDefined());
    user.click(day(20));
    await settle();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("The task is locked."));
    expect(slot("property-list-date").getAttribute("aria-describedby")).toBe(
      screen.getByRole("alert").id,
    );
  });

  test("disabled, every editor is read-only", async () => {
    render(() => <Task disabled />);
    await settle();
    expect(slot("property-list-date").hasAttribute("disabled")).toBe(true);
    expect(slot("inline-edit-display").hasAttribute("disabled")).toBe(true);
  });

  test("right to left, the date reads in the locale", async () => {
    render(() => (
      <Arabic>
        <Task />
      </Arabic>
    ));
    await settle();
    expect(slot("property-list-date").textContent).toContain("٢٠٢٦");
  });
});

describe("a property list hydrates", () => {
  test("what the server wrote", async () => {
    const result = await hydrates(`
      import { PropertyList } from "<arc>";
      const FIELDS = [
        { id: "status", label: "Status", kind: "choice", options: [{ value: "done", label: "Done", tone: "success" }] },
        { id: "due", label: "Due", kind: "date" },
        { id: "summary", label: "Summary", kind: "text" },
        { id: "ref", label: "Reference", kind: "value" },
      ];
      export function Page() {
        return (
          <PropertyList
            fields={FIELDS}
            values={{ status: "done", due: "2026-03-04", summary: "Ship", ref: "T-1" }}
            onSave={() => {}}
          />
        );
      }
    `);
    expect(result.container.querySelectorAll("dt")).toHaveLength(4);
    result.unmount();
  });
});
