import { describe, expect, test } from "bun:test";
import { flush, signal, type Incoming } from "@barqjs/core";
import { accessibleName, expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import { Button } from "./button.tsx";
import type { Key } from "./collections.ts";
import { GridList, GridListItem } from "./gridlist.tsx";

interface File {
  id: string;
  name: string;
  isDisabled?: boolean;
}

const FILES: File[] = [
  { id: "notes", name: "Notes" },
  { id: "budget", name: "Budget" },
  { id: "archive", name: "Archive", isDisabled: true },
  { id: "photos", name: "Photos" },
];

function Files(
  props: Incoming<{
    selectionMode?: "none" | "single" | "multiple";
    keyboardNavigationBehavior?: "arrow" | "tab";
    onSelectionChange?: (keys: "all" | Set<Key>) => void;
    onAction?: (key: Key) => void;
    withButtons?: boolean;
  }>,
) {
  return (
    <GridList
      aria-label="Files"
      items={FILES}
      selectionMode={props.selectionMode?.() ?? "none"}
      keyboardNavigationBehavior={props.keyboardNavigationBehavior?.()}
      onSelectionChange={props.onSelectionChange?.()}
      onAction={props.onAction?.()}
      getTextValue={(file: File) => file.name}
    >
      {(file: File) => (
        <GridListItem>
          <span>{file.name}</span>
          {() =>
            props.withButtons?.() === true ? (
              <>
                <Button>Rename {file.name}</Button>
                <Button>Delete {file.name}</Button>
              </>
            ) : null
          }
        </GridListItem>
      )}
    </GridList>
  );
}

function rows(): HTMLElement[] {
  return screen.getAllByRole("row");
}

describe("GridList", () => {
  test("is a named grid of rows holding cells", () => {
    render(() => <Files />);

    const grid = screen.getByRole("grid");
    expect(accessibleName(grid)).toBe("Files");
    expect(rows()).toHaveLength(4);
    expect(screen.getAllByRole("gridcell")).toHaveLength(4);
  });

  test("a row that cannot be selected does not claim to be unselected", () => {
    render(() => <Files />);
    for (const row of rows()) {
      expect(row.hasAttribute("aria-selected")).toBe(false);
    }
  });

  test("multiple selection says so and every row reports itself", () => {
    render(() => <Files selectionMode="multiple" />);

    expect(screen.getByRole("grid").getAttribute("aria-multiselectable")).toBe("true");
    expect(rows()[0]?.getAttribute("aria-selected")).toBe("false");
  });

  test("clicking a row selects it", () => {
    const selections: string[][] = [];
    render(() => (
      <Files
        selectionMode="multiple"
        onSelectionChange={(keys) =>
          selections.push(keys === "all" ? ["all"] : [...keys].map(String))
        }
      />
    ));

    user.click(rows()[1] as HTMLElement);
    flush();

    expect(selections).toEqual([["budget"]]);
  });

  test("a disabled row cannot be selected", () => {
    const selections: string[][] = [];
    render(() => (
      <Files
        selectionMode="multiple"
        onSelectionChange={(keys) =>
          selections.push(keys === "all" ? ["all"] : [...keys].map(String))
        }
      />
    ));

    expect(rows()[2]?.getAttribute("aria-disabled")).toBe("true");
    user.click(rows()[2] as HTMLElement);
    flush();

    expect(selections).toEqual([]);
  });

  test("the grid is ONE Tab stop and the arrows move between rows", () => {
    render(() => <Files />);

    const grid = screen.getByRole("grid");
    expect(grid.getAttribute("tabindex")).toBe("0");

    user.focus(grid);
    expect(document.activeElement).toBe(rows()[0] as HTMLElement);

    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(rows()[1] as HTMLElement);

    // Archive is disabled, so Down lands on Photos.
    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(rows()[3] as HTMLElement);
  });

  test("the arrows move WITHIN a row, and back out to it", () => {
    render(() => <Files withButtons />);

    const row = rows()[0] as HTMLElement;
    user.focus(row);

    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement?.textContent).toBe("Rename Notes");

    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement?.textContent).toBe("Delete Notes");

    // Off the end: back to the row, which is where up and down work from.
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(row);
  });

  test("down from inside a row still moves to the next row", () => {
    render(() => <Files withButtons />);

    user.focus(rows()[0] as HTMLElement);
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement?.textContent).toBe("Rename Notes");

    // The button would otherwise be the one to see this key.
    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(rows()[1] as HTMLElement);
  });

  test("an action fires for the row that was pressed", () => {
    const acted: Key[] = [];
    render(() => <Files onAction={(key) => acted.push(key)} />);

    user.click(rows()[1] as HTMLElement);
    flush();

    expect(acted).toEqual(["budget"]);
  });

  test("typing jumps to a matching row", () => {
    render(() => <Files />);

    user.focus(screen.getByRole("grid"));
    user.keyDown("p");
    flush();

    expect(document.activeElement).toBe(rows()[3] as HTMLElement);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Files selectionMode="multiple" withButtons />);
    expectNoAriaViolations(container);
  });
});

describe("an action that arrives after the rows were built", () => {
  test("a row picks up an onAction the list did not have at construction", () => {
    const acted: Key[] = [];
    const enabled = signal(false);

    render(() => (
      <GridList
        aria-label="Files"
        items={FILES}
        selectionMode="none"
        onAction={enabled() ? (key: Key) => acted.push(key) : undefined}
        getTextValue={(file: File) => file.name}
      >
        {(file: File) => <GridListItem>{file.name}</GridListItem>}
      </GridList>
    ));

    user.click(screen.getByRole("row", { name: "Notes" }));
    expect(acted, "an action ran before one was declared").toEqual([]);

    enabled.set(true);
    flush();

    user.click(screen.getByRole("row", { name: "Notes" }));
    expect(acted, "the row is still reading the action it saw at construction").toEqual(["notes"]);
  });
});
