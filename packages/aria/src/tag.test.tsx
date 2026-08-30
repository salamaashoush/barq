import { describe, expect, test } from "bun:test";
import { flush, signal, type Incoming } from "@barqjs/core";
import { accessibleName, expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import type { Key } from "./collections.ts";
import { Tag, TagGroup } from "./tag.tsx";

interface Filter {
  id: string;
  name: string;
  isDisabled?: boolean;
}

const FILTERS: Filter[] = [
  { id: "barcelona", name: "Barcelona" },
  { id: "madrid", name: "Madrid" },
  { id: "seville", name: "Seville" },
];

function Filters(
  props: Incoming<{
    items?: Filter[];
    selectionMode?: "none" | "single" | "multiple";
    onRemove?: (keys: Set<Key>) => void;
    onSelectionChange?: (keys: "all" | Set<Key>) => void;
  }>,
) {
  return (
    <TagGroup
      label="Cities"
      items={props.items?.() ?? FILTERS}
      selectionMode={props.selectionMode?.() ?? "none"}
      onRemove={props.onRemove?.()}
      onSelectionChange={props.onSelectionChange?.()}
      getTextValue={(filter: Filter) => filter.name}
    >
      {(filter: Filter) => <Tag>{filter.name}</Tag>}
    </TagGroup>
  );
}

function tags(): HTMLElement[] {
  return screen.getAllByRole("row");
}

describe("TagGroup", () => {
  test("is a named grid of tags", () => {
    render(() => <Filters />);

    const grid = screen.getByRole("grid");
    expect(accessibleName(grid)).toBe("Cities");
    expect(tags()).toHaveLength(3);
    expect(screen.getAllByRole("gridcell")).toHaveLength(3);
  });

  test("an empty group is a group, not a grid with no rows", () => {
    render(() => <Filters items={[]} />);

    expect(screen.queryByRole("grid")).toBeNull();
    expect(screen.getByRole("group")).not.toBeNull();
  });

  test("without onRemove there is no remove button", () => {
    render(() => <Filters />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  test("with onRemove every tag has one, named for its tag", () => {
    render(() => <Filters onRemove={() => {}} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(accessibleName(buttons[0] as HTMLElement)).toBe("Remove Barcelona");
  });

  test("the remove button is not a Tab stop of its own", () => {
    render(() => <Filters onRemove={() => {}} />);

    for (const button of screen.getAllByRole("button")) {
      expect(button.getAttribute("tabindex")).toBe("-1");
    }
  });

  test("pressing the remove button removes that tag", () => {
    const removed: string[][] = [];
    render(() => <Filters onRemove={(keys) => removed.push([...keys].map(String))} />);

    user.click(screen.getAllByRole("button")[1] as HTMLElement);
    flush();

    expect(removed).toEqual([["madrid"]]);
  });

  test("Delete removes the focused tag", () => {
    const removed: string[][] = [];
    render(() => <Filters onRemove={(keys) => removed.push([...keys].map(String))} />);

    user.focus(tags()[0] as HTMLElement);
    user.keyDown("Delete");
    flush();

    expect(removed).toEqual([["barcelona"]]);
  });

  test("Backspace does too", () => {
    const removed: string[][] = [];
    render(() => <Filters onRemove={(keys) => removed.push([...keys].map(String))} />);

    user.focus(tags()[2] as HTMLElement);
    user.keyDown("Backspace");
    flush();

    expect(removed).toEqual([["seville"]]);
  });

  test("removing one of several selected removes them all", () => {
    const removed: string[][] = [];
    render(() => (
      <Filters selectionMode="multiple" onRemove={(keys) => removed.push([...keys].map(String))} />
    ));

    user.click(tags()[0] as HTMLElement);
    user.click(tags()[1] as HTMLElement);
    flush();

    user.keyDown("Delete");
    flush();

    expect(removed[0]?.toSorted()).toEqual(["barcelona", "madrid"]);
  });

  test("the arrows move across, not down", () => {
    render(() => <Filters />);

    const all = tags();
    user.focus(screen.getByRole("grid"));
    flush();
    expect(document.activeElement).toBe(all[0] as HTMLElement);

    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(all[1] as HTMLElement);

    user.keyDown("ArrowLeft");
    flush();
    expect(document.activeElement).toBe(all[0] as HTMLElement);
  });

  test("the group is a live region only while focus is inside it", () => {
    render(() => <Filters />);

    const grid = screen.getByRole("grid");
    expect(grid.getAttribute("aria-live")).toBe("off");

    user.focus(tags()[0] as HTMLElement);
    flush();
    expect(grid.getAttribute("aria-live")).toBe("polite");
  });

  test("removing the last tag focuses the group", () => {
    const items = signal<Filter[]>([{ id: "barcelona", name: "Barcelona" }]);
    render(() => <Filters items={items()} onRemove={() => items.set([])} />);

    user.focus(screen.getAllByRole("row")[0] as HTMLElement);
    user.keyDown("Delete");
    flush();

    // Empty, so the grid has become a group: there are no rows to be one of.
    expect(document.activeElement).toBe(screen.getByRole("group"));
  });

  test("clicking a tag selects it", () => {
    const selections: string[][] = [];
    render(() => (
      <Filters
        selectionMode="multiple"
        onSelectionChange={(keys) =>
          selections.push(keys === "all" ? ["all"] : [...keys].map(String))
        }
      />
    ));

    user.click(tags()[1] as HTMLElement);
    flush();

    expect(selections).toEqual([["madrid"]]);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Filters selectionMode="multiple" onRemove={() => {}} />);
    expectNoAriaViolations(container);
  });
});
