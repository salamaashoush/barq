import { describe, expect, test } from "bun:test";
import { type Child, createSignal, type ParentProps } from "@barqjs/core";
import type { Key } from "@barqjs/aria/collections";
import { provideLocale } from "@barqjs/aria/i18n";
import { accessibleName, ariaViolations, render, screen, user } from "@barqjs/testing";

import { target } from "../style/index.ts";
import { hydrates, settle, wears } from "../test-arc.ts";
import { chipVariants } from "./chip.tsx";
import { TagGroup } from "./tag-group.tsx";

interface City {
  id: string;
  label: string;
}

const CITIES: City[] = [
  { id: "cairo", label: "Cairo" },
  { id: "lisbon", label: "Lisbon" },
  { id: "oslo", label: "Oslo" },
  { id: "lima", label: "Lima" },
];

interface CitiesProps {
  initial?: City[];
  maxVisible?: number;
  children?: Child;
}

function Cities(props: CitiesProps) {
  const [cities, setCities] = createSignal(props.initial ?? CITIES);
  return (
    <TagGroup
      label="Cities"
      description="Where the team works."
      items={cities()}
      maxVisible={props.maxVisible}
      onRemove={(keys) => setCities((all) => all.filter((city) => !keys.has(city.id)))}
      onClearAll={() => setCities([])}
      empty="No cities yet."
    />
  );
}

function rows(): HTMLElement[] {
  return screen.queryAllByRole("row");
}

describe("TagGroup", () => {
  test("is a grid named by its label and described by its line", async () => {
    render(() => <Cities />);
    await settle();
    const grid = screen.getByRole("grid");
    expect(accessibleName(grid)).toBe("Cities");
    const described = (grid.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent);
    expect(described).toContain("Where the team works.");
    expect(rows().map((row) => row.textContent)).toEqual(["Cairo", "Lisbon", "Oslo", "Lima"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("removes by its button, named after the tag, and by Delete from the keyboard", async () => {
    render(() => <Cities />);
    await settle();
    await user.click(screen.getByRole("button", { name: "Remove Lisbon" }));
    await settle();
    expect(rows().map((row) => row.textContent)).toEqual(["Cairo", "Oslo", "Lima"]);

    (document.activeElement as HTMLElement | null)?.blur();
    user.tab();
    expect(document.activeElement?.textContent).toBe("Cairo");
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement?.textContent).toBe("Oslo");
    await user.keyboard("{Delete}");
    await settle();
    expect(rows().map((row) => row.textContent)).toEqual(["Cairo", "Lima"]);
  });

  test("the arrows follow the reading direction", async () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <Cities />
      </Rtl>
    ));
    await settle();
    user.tab();
    expect(document.activeElement?.textContent).toBe("Cairo");
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement?.textContent).toBe("Lisbon");
  });

  test("shows a few and a button for the rest, and Clear all empties it", async () => {
    render(() => <Cities maxVisible={2} />);
    await settle();
    expect(rows()).toHaveLength(2);
    const toggle = screen.getByRole("button", { name: "Show all (4)" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await user.click(toggle);
    await settle();
    expect(rows()).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Show less" })).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Clear all" }));
    await settle();
    expect(rows()).toHaveLength(0);
    expect(screen.getByText("No cities yet.")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
  });

  test("selects tags, and reports the keys", async () => {
    const chosen: Key[][] = [];
    render(() => (
      <TagGroup
        aria-label="Plans"
        items={CITIES}
        selectionMode="multiple"
        onSelectionChange={(keys) => chosen.push([...keys])}
      />
    ));
    await user.click(screen.getByRole("row", { name: "Oslo" }));
    await settle();
    expect(chosen.at(-1)).toEqual(["oslo"]);
    expect(screen.getByRole("row", { name: "Oslo" }).getAttribute("aria-selected")).toBe("true");
  });

  test("a tap removes, and the remove button has room for a finger", async () => {
    render(() => <Cities />);
    await settle();
    const remove = screen.getByRole("button", { name: "Remove Oslo" });
    expect(wears(remove, target.size)).toBe(true);
    user.tap(remove);
    await settle();
    expect(rows().map((row) => row.textContent)).toEqual(["Cairo", "Lisbon", "Lima"]);
  });

  test("takes a class per part, wears the chip's shape, and a slot on every part", async () => {
    render(() => (
      <TagGroup
        label="Cities"
        description="Where."
        errorMessage="Pick fewer."
        items={CITIES}
        maxVisible={1}
        onRemove={() => {}}
        onClearAll={() => {}}
        tone="info"
        class="mine"
        classes={{
          root: "r",
          list: "l",
          tag: "t",
          cell: "c",
          remove: "x",
          footer: "f",
          label: "lb",
          description: "d",
          error: "e",
        }}
      />
    ));
    await settle();
    function by(slot: string): Element | null {
      return document.querySelector(`[data-slot="${slot}"]`);
    }
    expect(by("tag-group-field")?.classList.contains("mine")).toBe(true);
    expect(by("tag-group-root")?.classList.contains("r")).toBe(true);
    expect(by("tag-group")?.classList.contains("l")).toBe(true);
    expect(by("tag")?.classList.contains("t")).toBe(true);
    expect(by("tag-cell")?.classList.contains("c")).toBe(true);
    expect(by("tag-remove")?.classList.contains("x")).toBe(true);
    expect(by("tag-group-footer")?.classList.contains("f")).toBe(true);
    expect(by("field-label")?.classList.contains("lb")).toBe(true);
    expect(by("field-description")?.classList.contains("d")).toBe(true);
    expect(by("field-error")?.classList.contains("e")).toBe(true);
    expect(wears(by("tag"), chipVariants({ tone: "info" }).root.split(" ")[0] ?? "")).toBe(true);
    expect(screen.getByRole("grid").getAttribute("aria-describedby")).toContain(
      by("field-error")?.id ?? "-",
    );
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { TagGroup } from "<arc>";
      export function Page() {
        return (
          <TagGroup
            label="Cities"
            items={[{ id: "cairo", label: "Cairo" }, { id: "oslo", label: "Oslo" }]}
            onRemove={() => {}}
          />
        );
      }
    `);
    expect(result.container.querySelectorAll('[role="row"]')).toHaveLength(2);
    result.unmount();
  });

  test("hydrates an empty group whose words are a block of their own", async () => {
    const result = await hydrates(`
      import { TagGroup, Text } from "<arc>";
      export function Page() {
        return (
          <TagGroup
            label="Labels"
            items={[]}
            isInvalid
            errorMessage="Add at least one label."
            empty={<Text color="muted">None yet</Text>}
          />
        );
      }
    `);
    expect(result.container.querySelector('[data-slot="tag-group-empty"]')?.textContent).toBe(
      "None yet",
    );
    result.unmount();
  });
});
