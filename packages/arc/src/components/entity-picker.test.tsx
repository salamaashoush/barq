import { describe, expect, test } from "bun:test";
import { type Child } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor } from "@barqjs/testing";
import { touch } from "@barqjs/ui/shared-touch";

import { hydrates, settle, wears } from "../test-arc.ts";
import { type EntityOption, EntityPicker } from "./entity-picker.tsx";

const HERE = import.meta.dir;

const PEOPLE: EntityOption[] = [
  { id: "1", label: "Alex Doe", description: "alex@example.com" },
  { id: "2", label: "Sam Roe", description: "sam@example.com" },
  { id: "3", label: "Salama Ashoush", description: "salama@example.com" },
  { id: "4", label: "Robin Poe" },
  { id: "5", label: "Rowan Loe" },
];

function people(calls: { query: string; cursor: unknown; signal: AbortSignal }[] = [], size = 10) {
  return async (query: string, context: { signal: AbortSignal; cursor?: unknown }) => {
    calls.push({ query, cursor: context.cursor, signal: context.signal });
    await Promise.resolve();
    const start = typeof context.cursor === "number" ? context.cursor : 0;
    const matched = PEOPLE.filter((one) => one.label.toLowerCase().includes(query.toLowerCase()));
    return {
      results: matched.slice(start, start + size),
      next: start + size < matched.length ? start + size : undefined,
    };
  };
}

function input(): HTMLInputElement {
  return document.querySelector(
    '[data-slot="entity-picker-input"] input, input[data-slot="entity-picker-input"]',
  ) as HTMLInputElement;
}

function options(): string[] {
  return screen.queryAllByRole("option").map((one) => one.textContent ?? "");
}

async function type(text: string): Promise<void> {
  input().focus();
  await user.keyboard(text);
  await settle();
}

describe("EntityPicker", () => {
  test("searches the server once typing pauses, its options with avatars and marked matches", async () => {
    const calls: { query: string; cursor: unknown; signal: AbortSignal }[] = [];
    render(() => <EntityPicker label="Owner" search={people(calls)} debounce={5} />);
    expect(screen.getByLabelText("Owner")).toBe(input());
    await type("sa");
    await waitFor(() => expect(options()).toHaveLength(2));
    expect(calls.at(-1)?.query).toBe("sa");
    const first = screen.getAllByRole("option")[0] as HTMLElement;
    expect(first.querySelector('[data-slot="person-avatar"]')).not.toBeNull();
    expect(first.querySelector("mark")?.textContent).toBe("Sa");
    expect(first.textContent).toContain("sam@example.com");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the arrows and Enter choose one, which the field then shows", async () => {
    const chosen: (EntityOption | null)[] = [];
    render(() => (
      <EntityPicker
        label="Owner"
        search={people()}
        debounce={5}
        onChange={(value) => chosen.push(value)}
      />
    ));
    await type("row");
    await waitFor(() => expect(options()).toHaveLength(1));
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
    await settle();
    expect(chosen.map((one) => one?.id)).toEqual(["5"]);
    expect(input().value).toBe("Rowan Loe");
  });

  test("several are chips, kept listed until a search is typed, Backspace taking the last off", async () => {
    const seen: string[][] = [];
    render(() => (
      <EntityPicker
        multiple
        label="Assignees"
        search={people()}
        debounce={5}
        defaultValue={[PEOPLE[0] as EntityOption]}
        onChange={(value) => seen.push(value.map((one) => one.id))}
      />
    ));
    const chips = screen.getByRole("toolbar", { name: "Chosen assignees" });
    expect(chips.textContent).toContain("Alex Doe");
    input().focus();
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(options().length).toBe(5));
    await type("sam");
    await waitFor(() => expect(options()).toEqual(["SRSam Roesam@example.com"]));
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
    await settle();
    expect(seen.at(-1)).toEqual(["1", "2"]);
    await user.click(screen.getByRole("button", { name: "Remove Alex Doe" }));
    await settle();
    expect(seen.at(-1)).toEqual(["2"]);
    input().focus();
    await user.keyboard("{Backspace}");
    await settle();
    expect(seen.at(-1)).toEqual([]);
  });

  test("past its max the rest are held back with the reason", async () => {
    render(() => (
      <EntityPicker
        multiple
        label="Reviewers"
        max={1}
        search={people()}
        debounce={5}
        defaultValue={[PEOPLE[1] as EntityOption]}
      />
    ));
    input().focus();
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(options().length).toBe(5));
    expect(screen.getAllByText("No more than 1").length).toBeGreaterThan(0);
    const others = screen
      .getAllByRole("option")
      .filter((one) => !one.textContent?.includes("Sam Roe"));
    expect(others.every((one) => one.getAttribute("aria-disabled") === "true")).toBe(true);
  });

  test("Show more asks for the next page; Create makes what no option has", async () => {
    const calls: { query: string; cursor: unknown; signal: AbortSignal }[] = [];
    const made: string[] = [];
    render(() => (
      <EntityPicker
        multiple
        label="Team"
        search={people(calls, 2)}
        debounce={5}
        onCreate={async (text) => {
          made.push(text);
          return { id: "new", label: text };
        }}
      />
    ));
    await type("o");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Show more results" })).toBeDefined(),
    );
    await user.click(screen.getByRole("option", { name: "Show more results" }));
    await waitFor(() => expect(calls.at(-1)?.cursor).toBe(2));
    await waitFor(() =>
      expect(options().filter((one) => one.includes("o")).length).toBeGreaterThan(2),
    );
    await type("zz");
    await waitFor(() => expect(screen.getByRole("option", { name: "Create “ozz”" })).toBeDefined());
    user.tap(screen.getByRole("option", { name: "Create “ozz”" }));
    await waitFor(() => expect(made).toEqual(["ozz"]));
    await waitFor(() =>
      expect(screen.getByRole("toolbar", { name: "Chosen team" }).textContent).toContain("ozz"),
    );
  });

  test("says when the search finds nothing or fails", async () => {
    let fail = false;
    render(() => (
      <EntityPicker
        label="Owner"
        debounce={5}
        search={async () => {
          if (fail) throw new Error("down");
          return [];
        }}
      />
    ));
    await type("q");
    await waitFor(() => expect(screen.getByText("No matches")).toBeDefined());
    fail = true;
    await type("w");
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("The search did not work. Try again."),
    );
  });

  test("its options are a finger's size, and it runs right to left", async () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <EntityPicker label="المالك" search={people()} debounce={5} />
      </Arabic>
    ));
    await type("a");
    await waitFor(() => expect(options().length).toBeGreaterThan(0));
    const option = screen.getAllByRole("option")[0] as HTMLElement;
    expect(wears(option, touch.target)).toBe(true);
    user.tap(option);
    await settle();
    expect(input().value).not.toBe("a");
  });

  test("takes a class per part", async () => {
    render(() => (
      <EntityPicker
        class="mine"
        label="Owner"
        search={people()}
        debounce={5}
        classes={{ root: "r", label: "l", option: "o", list: "li" }}
      />
    ));
    const root = document.querySelector('[data-slot="entity-picker"]');
    expect(root?.classList.contains("r")).toBe(true);
    expect(root?.classList.contains("mine")).toBe(true);
    expect(document.querySelector("label")?.classList.contains("l")).toBe(true);
    await type("a");
    await waitFor(() =>
      expect(document.querySelector('[data-slot="entity-picker-option"]')).not.toBeNull(),
    );
    expect(
      document.querySelector('[data-slot="entity-picker-option"]')?.classList.contains("o"),
    ).toBe(true);
    expect(
      document.querySelector('[data-slot="entity-picker-list"]')?.classList.contains("li"),
    ).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { EntityPicker } from "${HERE}/entity-picker.tsx";
      export function Page() {
        return (
          <EntityPicker
            multiple
            label="Assignees"
            search={async () => []}
            defaultValue={[{ id: "1", label: "Alex Doe" }]}
          />
        );
      }
    `);
    expect(result.container.textContent).toContain("Alex Doe");
    result.unmount();
  });
});
