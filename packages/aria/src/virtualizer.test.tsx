/**
 * Virtualisation: the DOM is a window, everything else is the whole thing.
 *
 * The assertions worth making are about that gap. A screen reader must be told
 * the size of the COLLECTION, the selection must reach items that were never
 * rendered, and the keyboard must move by geometry rather than by asking
 * elements that are not there.
 *
 * happy-dom lays nothing out: every element measures zero, and there is no
 * scrolling. So the visible rectangle is written onto the container by hand,
 * which is what a real scroll would have produced.
 */

import { describe, expect, test } from "bun:test";
import { flush, signal, type Incoming } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";
import type { Key, Node } from "./collections.ts";
import { ListCollection } from "./collections.ts";
import { GridList, GridListItem } from "./gridlist.tsx";
import { ListBox, Option } from "./listbox.tsx";
import { Cell, Column, Row, Table, TableBody, TableHeader } from "./table.tsx";
import {
  listLayout,
  rectIntersects,
  rectMaxY,
  rect,
  Virtualizer,
  type LayoutInfo,
} from "./virtualizer.tsx";

interface City {
  id: string;
  name: string;
  [key: string]: unknown;
}

const CITIES: City[] = Array.from({ length: 1000 }, (_, at) => ({
  id: `c${at}`,
  name: `City ${at}`,
}));

const ROW = 20;
const VIEWPORT = 100;

/**
 * happy-dom reports every box as zero, so the container is told what it shows.
 *
 * `clientHeight` and `scrollTop` are what the virtualiser reads, and they are
 * exactly what a browser would have reported for a 100px tall list scrolled to
 * a given offset.
 */
function scrollTo(element: HTMLElement, top: number): void {
  // `isScrollable` reads the computed overflow, and a keyboard delegate asks
  // it before deciding that Page Down means one page rather than the end.
  element.style.overflow = "auto";
  Object.defineProperty(element, "clientHeight", { value: VIEWPORT, configurable: true });
  Object.defineProperty(element, "clientWidth", { value: 200, configurable: true });
  Object.defineProperty(element, "scrollTop", { value: top, writable: true, configurable: true });
  element.dispatchEvent(new Event("scroll"));
  flush();
}

function Cities(
  props: Incoming<{
    overscan?: number;
    selectionMode?: "none" | "single" | "multiple";
    onSelectionChange?: (keys: "all" | Set<Key>) => void;
  }>,
) {
  return (
    <Virtualizer layout={listLayout({ rowHeight: ROW })} overscan={props.overscan?.() ?? 0}>
      <ListBox
        aria-label="Cities"
        items={CITIES}
        selectionMode={props.selectionMode?.() ?? "none"}
        onSelectionChange={props.onSelectionChange?.()}
        getTextValue={(city: City) => city.name}
      >
        {(city: City) => <Option>{city.name}</Option>}
      </ListBox>
    </Virtualizer>
  );
}

/** The nodes a `listState` would have built, for a layout tested on its own. */
function nodesOf(cities: City[]): Node<City>[] {
  return cities.map((city, index) => ({
    type: "item",
    key: city.id,
    value: city,
    textValue: city.name,
    level: 0,
    index,
    hasChildNodes: false,
    childNodes: [],
    props: city,
  }));
}

function list(): HTMLElement {
  return screen.getByRole("listbox");
}

function options(): HTMLElement[] {
  return screen.getAllByRole("option");
}

describe("the geometry", () => {
  test("two rectangles that only touch do not intersect", () => {
    expect(rectIntersects(rect(0, 0, 10, 10), rect(10, 0, 10, 10))).toBe(false);
    expect(rectIntersects(rect(0, 0, 10, 10), rect(9, 0, 10, 10))).toBe(true);
  });

  test("a rectangle knows its far edge", () => {
    expect(rectMaxY(rect(0, 5, 10, 20))).toBe(25);
  });
});

describe("a list layout", () => {
  test("stacks rows at a fixed height and reports the whole content", () => {
    const layout = listLayout({ rowHeight: ROW });
    layout.update({
      collection: new ListCollection(nodesOf(CITIES.slice(0, 5))),
      visibleRect: rect(0, 0, 200, VIEWPORT),
    });

    expect(layout.getLayoutInfo("c0")?.rect).toEqual(rect(0, 0, 200, ROW));
    expect(layout.getLayoutInfo("c3")?.rect).toEqual(rect(0, 60, 200, ROW));
    expect(layout.getContentSize().height).toBe(5 * ROW);
  });

  test("only the rows overlapping the window are visible", () => {
    const layout = listLayout({ rowHeight: ROW });
    layout.update({
      collection: new ListCollection(nodesOf(CITIES.slice(0, 20))),
      visibleRect: rect(0, 0, 200, VIEWPORT),
    });

    const visible = layout.getVisibleLayoutInfos(rect(0, 40, 200, VIEWPORT));
    // c7 begins at exactly 140, the window's far edge, and a touching edge is
    // not an overlap: nothing of it is on screen.
    expect(visible.map((info: LayoutInfo) => info.key)).toEqual(["c2", "c3", "c4", "c5", "c6"]);
  });

  test("a measured row corrects the estimate and moves what is below it", () => {
    const layout = listLayout({ estimatedRowHeight: ROW });
    const collection = new ListCollection(nodesOf(CITIES.slice(0, 3)));
    const context = { collection, visibleRect: rect(0, 0, 200, VIEWPORT) };

    layout.update(context);
    expect(layout.getLayoutInfo("c0")?.isEstimated).toBe(true);
    expect(layout.getLayoutInfo("c1")?.rect.y).toBe(ROW);

    expect(layout.updateItemSize("c0", { width: 200, height: 50 })).toBe(true);
    expect(layout.updateItemSize("c0", { width: 200, height: 50 })).toBe(false);

    layout.update(context);
    expect(layout.getLayoutInfo("c1")?.rect.y).toBe(50);
    expect(layout.getContentSize().height).toBe(50 + ROW * 2);
  });

  test("a range between two keys is every item between them", () => {
    const layout = listLayout({ rowHeight: ROW });
    layout.update({
      collection: new ListCollection(nodesOf(CITIES.slice(0, 10))),
      visibleRect: rect(0, 0, 200, VIEWPORT),
    });

    expect(layout.getKeyRange("c2", "c5")).toEqual(["c2", "c3", "c4", "c5"]);
    // Backwards is the same range: a shift-selection may be dragged either way.
    expect(layout.getKeyRange("c5", "c2")).toEqual(["c2", "c3", "c4", "c5"]);
  });
});

describe("a virtualised listbox", () => {
  test("renders a window, not a thousand rows", () => {
    render(() => <Cities />);
    scrollTo(list(), 0);

    expect(options().length).toBeGreaterThan(0);
    expect(options().length).toBeLessThan(20);
    expect(options()[0]?.textContent).toBe("City 0");
  });

  test("tells a screen reader the size of the COLLECTION", () => {
    render(() => <Cities />);
    scrollTo(list(), 0);

    const first = options()[0] as HTMLElement;
    expect(first.getAttribute("aria-setsize")).toBe("1000");
    expect(first.getAttribute("aria-posinset")).toBe("1");
  });

  test("scrolling renders the rows that are now on screen", () => {
    render(() => <Cities />);
    scrollTo(list(), 0);
    expect(options()[0]?.textContent).toBe("City 0");

    scrollTo(list(), 400);

    expect(options()[0]?.textContent).toBe("City 20");
    expect(options().some((o) => o.textContent === "City 0")).toBe(false);
  });

  test("a row is positioned by the layout, not by document flow", () => {
    render(() => <Cities />);
    scrollTo(list(), 400);

    const first = options()[0] as HTMLElement;
    expect(first.style.position).toBe("absolute");
    expect(first.style.top).toBe("400px");
  });

  test("the container claims the height of the whole collection", () => {
    render(() => <Cities />);
    scrollTo(list(), 0);

    expect(list().style.height).toBe(`${1000 * ROW}px`);
    expect(list().style.position).toBe("relative");
  });

  test("overscan renders beyond the window, so a fast scroll is not blank", () => {
    render(() => <Cities overscan={1} />);
    scrollTo(list(), 400);

    const rendered = options().length;
    expect(rendered).toBeGreaterThan(VIEWPORT / ROW);
  });

  test("the list says it is virtualised", () => {
    render(() => <Cities />);
    scrollTo(list(), 0);
    expect(list().hasAttribute("data-virtualized")).toBe(true);
  });

  test("a plain listbox is not virtualised and renders everything", () => {
    render(() => (
      <ListBox aria-label="Few" items={CITIES.slice(0, 4)} getTextValue={(c: City) => c.name}>
        {(city: City) => <Option>{city.name}</Option>}
      </ListBox>
    ));

    expect(options()).toHaveLength(4);
    expect(list().hasAttribute("data-virtualized")).toBe(false);
    expect(options()[0]?.style.position).toBe("");
  });

  test("selection reaches an item that was scrolled away", () => {
    const picked: string[][] = [];
    render(() => (
      <Cities
        selectionMode="multiple"
        onSelectionChange={(keys) => picked.push(keys === "all" ? ["all"] : [...keys].map(String))}
      />
    ));
    scrollTo(list(), 0);

    user.click(options()[0] as HTMLElement);
    flush();
    expect(picked.at(-1)).toEqual(["c0"]);

    scrollTo(list(), 400);
    user.click(options()[0] as HTMLElement);
    flush();

    // The first click's item is no longer in the DOM, and is still selected.
    expect(picked.at(-1)).toEqual(["c0", "c20"]);
  });

  test("the focused row stays rendered after it scrolls out of the window", () => {
    render(() => <Cities />);
    scrollTo(list(), 0);

    user.focus(options()[0] as HTMLElement);
    flush();

    scrollTo(list(), 600);

    // Persisted: unmounting the element that holds focus would drop focus to
    // the body and lose a keyboard user's place.
    expect(options().some((o) => o.textContent === "City 0")).toBe(true);
  });
});

describe("a section", () => {
  interface Group {
    id: string;
    name: string;
    children: City[];
  }

  const GROUPS: Group[] = [
    { id: "north", name: "North", children: CITIES.slice(0, 3) },
    { id: "south", name: "South", children: CITIES.slice(3, 6) },
  ];

  test("a heading takes its own height and the rows follow it", () => {
    const layout = listLayout({ rowHeight: ROW, headingHeight: 30 });
    const nodes = signal(GROUPS);
    void nodes;

    render(() => (
      <Virtualizer layout={layout}>
        <ListBox aria-label="Grouped" items={GROUPS} getTextValue={(g: Group) => g.name}>
          {(group: Group) => <Option>{group.name}</Option>}
        </ListBox>
      </Virtualizer>
    ));
    scrollTo(list(), 0);

    // Two sections of three: two headings at 30 and six rows at 20.
    expect(layout.getContentSize().height).toBe(30 * 2 + ROW * 6);
  });
});

describe("keyboard navigation without the DOM", () => {
  test("Page Down moves a viewport, over rows that were never rendered", () => {
    render(() => <Cities />);
    const container = list();
    scrollTo(container, 0);

    user.focus(options()[0] as HTMLElement);
    flush();
    expect(document.activeElement?.textContent).toBe("City 0");

    user.keyDown("PageDown");
    flush();

    // The page boundary is `y - height + viewport` = 0 - 20 + 100 = 80, and the
    // walk stops at the first row that reaches it: City 4, at y=80. What
    // matters is that it walked at all — those rows were not in the document
    // when the key was pressed, so the LAYOUT is what answered.
    expect(document.activeElement?.textContent).toBe("City 4");
  });

  test("End reaches the last item of a thousand", () => {
    render(() => <Cities />);
    scrollTo(list(), 0);

    user.focus(options()[0] as HTMLElement);
    flush();
    user.keyDown("End");
    flush();

    // The last row was nine hundred and ninety-nine rows away and never
    // rendered; it is rendered now because it is focused, and holds focus.
    expect(document.activeElement?.textContent).toBe("City 999");
  });
});

describe("a virtualised grid list", () => {
  test("renders a window and tells a screen reader the whole count", () => {
    render(() => (
      <Virtualizer layout={listLayout({ rowHeight: ROW })}>
        <GridList aria-label="Cities" items={CITIES} getTextValue={(c: City) => c.name}>
          {(city: City) => <GridListItem>{city.name}</GridListItem>}
        </GridList>
      </Virtualizer>
    ));

    const grid = screen.getByRole("grid");
    scrollTo(grid, 0);

    const rows = screen.getAllByRole("row");
    expect(rows.length).toBeLessThan(20);
    expect(grid.getAttribute("aria-rowcount")).toBe("1000");
    expect((rows[0] as HTMLElement).style.position).toBe("absolute");
  });
});

describe("a virtualised table", () => {
  interface Row_ {
    id: string;
    name: string;
    [key: string]: unknown;
  }

  const COLUMNS = [{ id: "name", name: "Name", isRowHeader: true }];
  const ROWS: Row_[] = CITIES.map((city) => ({ id: city.id, name: city.name }));

  test("windows the BODY and leaves the header alone", () => {
    render(() => (
      <Virtualizer layout={listLayout({ rowHeight: ROW })}>
        <Table aria-label="Cities" columns={COLUMNS} items={ROWS}>
          <TableHeader>{(column: { name: string }) => <Column>{column.name}</Column>}</TableHeader>
          <TableBody>{(row: Row_) => <Row>{() => <Cell>{row.name}</Cell>}</Row>}</TableBody>
        </Table>
      </Virtualizer>
    ));

    const grid = screen.getByRole("grid");
    scrollTo(grid, 0);

    // The header row is always there; the body rows are a window.
    expect(screen.getAllByRole("columnheader")).toHaveLength(1);
    const body = screen.getAllByRole("row").filter((r) => r.hasAttribute("data-key"));
    expect(body.length).toBeLessThan(20);
    expect(grid.getAttribute("aria-rowcount")).toBe("1001");
  });
});
