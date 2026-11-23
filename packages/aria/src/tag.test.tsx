import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { flush, createSignal } from "@barqjs/core";
import { accessibleName, expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import type { Key } from "./collections.ts";
import { provideLocale } from "./i18n.ts";
import { destroyAnnouncer } from "./live.ts";
import { Tag, TagGroup } from "./tag.tsx";
import { SelectionIndicator } from "./selection-indicator.tsx";
import { announcements, nextFrame } from "./test-dnd.ts";

interface Filter {
  id: string;
  name: string;
  isDisabled?: boolean;
  href?: string;
}

const FILTERS: Filter[] = [
  { id: "barcelona", name: "Barcelona" },
  { id: "madrid", name: "Madrid" },
  { id: "seville", name: "Seville" },
];

function Filters(props: {
  items?: Filter[];
  selectionMode?: "none" | "single" | "multiple";
  onRemove?: (keys: Set<Key>) => void;
  onSelectionChange?: (keys: "all" | Set<Key>) => void;
}) {
  return (
    <TagGroup
      label="Cities"
      items={props.items ?? FILTERS}
      selectionMode={props.selectionMode ?? "none"}
      onRemove={props.onRemove}
      onSelectionChange={props.onSelectionChange}
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
    const [items, setItems] = createSignal<Filter[]>([{ id: "barcelona", name: "Barcelona" }]);
    render(() => <Filters items={items()} onRemove={() => setItems([])} />);

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

describe("removing", () => {
  test("the remove button removes its own tag, not the selection around it", () => {
    const removed: string[][] = [];
    render(() => (
      <Filters selectionMode="multiple" onRemove={(keys) => removed.push([...keys].map(String))} />
    ));

    user.click(tags()[0] as HTMLElement);
    user.click(tags()[1] as HTMLElement);
    flush();
    user.click(screen.getAllByRole("button")[1] as HTMLElement);
    flush();

    expect(removed).toEqual([["madrid"]]);
  });

  test("a keyboard user is told Delete removes the tag", () => {
    render(() => <Filters onRemove={() => {}} />);

    user.focus(tags()[0] as HTMLElement);
    user.keyDown("ArrowRight");
    flush();

    const described = tags()[1]?.getAttribute("aria-describedby");
    expect(described, "nothing says how to remove a tag").toBeTruthy();
    expect(document.getElementById(described as string)?.textContent).toBe(
      "Press Delete to remove tag.",
    );
  });

  test("the labels are in the reader's language", () => {
    function German() {
      provideLocale("de-DE");
      return <Filters onRemove={() => {}} />;
    }
    render(() => <German />);

    expect(accessibleName(screen.getAllByRole("button")[0] as HTMLElement)).toBe(
      "Entfernen Barcelona",
    );
  });
});

describe("acting on a tag", () => {
  test("pressing a tag calls onAction with its key", () => {
    const acted: Key[] = [];
    render(() => (
      <TagGroup label="Cities" items={FILTERS} onAction={(key: Key) => acted.push(key)}>
        {(filter: Filter) => <Tag>{filter.name}</Tag>}
      </TagGroup>
    ));

    user.click(tags()[2] as HTMLElement);
    flush();
    expect(acted).toEqual(["seville"]);
  });

  test("a tag with an href is a link that is followed", () => {
    const seen: { href: string | null; prevented: boolean }[] = [];
    const listener = (event: Event): void => {
      if (event.target instanceof HTMLAnchorElement) {
        seen.push({ href: event.target.getAttribute("href"), prevented: event.defaultPrevented });
      }
    };
    document.addEventListener("click", listener);
    try {
      render(() => (
        <TagGroup label="Links" items={[{ id: "docs", name: "Docs", href: "/docs" }]}>
          {(filter: Filter) => <Tag>{filter.name}</Tag>}
        </TagGroup>
      ));
      expect(tags()[0]?.getAttribute("data-href")).toBe("/docs");

      user.click(tags()[0] as HTMLElement);
      flush();
      expect(seen).toEqual([{ href: "/docs", prevented: false }]);
    } finally {
      document.removeEventListener("click", listener);
    }
  });

  test("a tag says whether it can be removed", () => {
    render(() => <Filters onRemove={() => {}} />);
    expect(tags()[0]?.hasAttribute("data-allows-removing")).toBe(true);
  });
});

describe("a selection indicator", () => {
  test("is shown in the selected tags only", () => {
    render(() => (
      <TagGroup
        label="Cities"
        items={FILTERS}
        selectionMode="single"
        defaultSelectedKeys={["madrid"]}
      >
        {(filter: Filter) => (
          <Tag>
            {filter.name}
            <SelectionIndicator data-testid="indicator" />
          </Tag>
        )}
      </TagGroup>
    ));
    const shown = (role: string): (string | null)[] =>
      screen
        .queryAllByTestId("indicator")
        .map(
          (element: Element) =>
            element.closest(`[role="${role}"]`)?.getAttribute("data-key") ?? null,
        );
    expect(shown("row")).toEqual(["madrid"]);
  });
});

describe("selection announcements", () => {
  beforeEach(() => destroyAnnouncer());
  afterEach(() => destroyAnnouncer());

  test("a tag selected and deselected is named, with the count past one", async () => {
    render(() => <Filters selectionMode="multiple" />);
    user.click(tags()[0] as HTMLElement);
    flush();
    await nextFrame();
    user.click(tags()[1] as HTMLElement);
    flush();
    await nextFrame();
    user.click(tags()[1] as HTMLElement);
    flush();
    await nextFrame();
    expect(announcements()).toEqual([
      "Barcelona selected.",
      "Madrid selected. 2 items selected.",
      "Madrid not selected. 1 item selected.",
    ]);
  });
});
