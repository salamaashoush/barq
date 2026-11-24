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

import { afterEach, describe, expect, test } from "bun:test";
import { flush, createRoot, createSignal } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";
import type { Key, Node } from "./collections.ts";
import { ListCollection } from "./collections.ts";
import type { DroppableCollectionReorderEvent } from "./dnd/index.ts";
import { dragAndDrop } from "./drag-and-drop.tsx";
import { GridList, GridListItem } from "./gridlist.tsx";
import { ListBox, Option } from "./listbox.tsx";
import { Cell, Column, Row, Table, TableBody, TableHeader } from "./table.tsx";
import { fireDrag, MockDataTransfer, nextFrame, restoreRects, stubRects } from "./test-dnd.ts";
import {
  listLayout,
  measureRow,
  rectIntersects,
  virtualizer,
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

function Cities(props: {
  overscan?: number;
  selectionMode?: "none" | "single" | "multiple";
  onSelectionChange?: (keys: "all" | Set<Key>) => void;
}) {
  return (
    <Virtualizer layout={listLayout({ rowHeight: ROW })} overscan={props.overscan ?? 0}>
      <ListBox
        aria-label="Cities"
        items={CITIES}
        selectionMode={props.selectionMode ?? "none"}
        onSelectionChange={props.onSelectionChange}
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

  test("a loader takes its height only while loading", () => {
    const layout = listLayout({ rowHeight: ROW, loaderHeight: 30 });
    const loader: Node<City> = {
      ...(nodesOf([{ id: "more", name: "Loading" }])[0] as Node<City>),
      type: "loader",
    };
    const context = {
      collection: new ListCollection([...nodesOf(CITIES.slice(0, 3)), loader]),
      visibleRect: rect(0, 0, 200, VIEWPORT),
    };

    layout.update(context);
    expect(layout.getLayoutInfo("more")?.rect).toEqual(rect(0, 3 * ROW, 200, 0));
    expect(layout.getContentSize().height).toBe(3 * ROW);

    expect(layout.updateLoaderState("more", true)).toBe(true);
    expect(layout.updateLoaderState("more", true)).toBe(false);
    layout.update(context);
    expect(layout.getLayoutInfo("more")?.rect).toEqual(rect(0, 3 * ROW, 200, 30));
    expect(layout.getLayoutInfo("more")?.isEstimated).toBe(false);
    expect(layout.getContentSize().height).toBe(3 * ROW + 30);
  });

  test("a loader is visible wherever the window is, and a loader height defaults to a row's", () => {
    const layout = listLayout({ rowHeight: ROW });
    const loader: Node<City> = {
      ...(nodesOf([{ id: "more", name: "Loading" }])[0] as Node<City>),
      type: "loader",
    };
    const context = {
      collection: new ListCollection([...nodesOf(CITIES.slice(0, 50)), loader]),
      visibleRect: rect(0, 0, 200, VIEWPORT),
    };
    layout.updateLoaderState("more", true);
    layout.update(context);

    expect(layout.getLayoutInfo("more")?.rect.height).toBe(ROW);
    const keys = layout.getVisibleLayoutInfos(rect(0, 0, 200, VIEWPORT)).map((info) => info.key);
    expect(keys).toEqual(["c0", "c1", "c2", "c3", "c4", "more"]);
    // Nor is it an item a range selection reaches.
    expect(layout.getKeyRange("c48", "more")).toEqual(["c48", "c49"]);
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
    const [nodes] = createSignal(GROUPS);
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

describe("a measured row after the width changes", () => {
  test("is estimated again, from its last height, so it is measured again", () => {
    const layout = listLayout({ estimatedRowHeight: ROW });
    const collection = new ListCollection(nodesOf(CITIES.slice(0, 3)));

    layout.update({ collection, visibleRect: rect(0, 0, 200, VIEWPORT) });
    layout.updateItemSize("c0", { width: 200, height: 50 });
    layout.update({ collection, visibleRect: rect(0, 0, 200, VIEWPORT) });
    expect(layout.getLayoutInfo("c0")?.isEstimated).toBe(false);

    // Narrower: the text in the row wraps differently, so 50 is a guess now.
    layout.update({ collection, visibleRect: rect(0, 0, 120, VIEWPORT) });
    const info = layout.getLayoutInfo("c0");
    expect(info?.isEstimated, "a row measured at another width kept its height").toBe(true);
    expect(info?.rect.height).toBe(50);

    layout.updateItemSize("c0", { width: 120, height: 70 });
    layout.update({ collection, visibleRect: rect(0, 0, 120, VIEWPORT) });
    expect(layout.getLayoutInfo("c0")?.isEstimated).toBe(false);
    expect(layout.getLayoutInfo("c1")?.rect.y).toBe(70);
  });

  test("a row of a fixed height is never estimated, whatever the width", () => {
    const layout = listLayout({ rowHeight: ROW });
    const collection = new ListCollection(nodesOf(CITIES.slice(0, 3)));
    layout.update({ collection, visibleRect: rect(0, 0, 200, VIEWPORT) });
    layout.update({ collection, visibleRect: rect(0, 0, 120, VIEWPORT) });
    expect(layout.getLayoutInfo("c0")?.isEstimated).toBe(false);
  });
});

describe("the virtualizer's state", () => {
  test("a row measured after the layout was made moves the rows below it and the size", () => {
    const items = ["a", "b", "c"].map((key): Node<unknown> => ({
      type: "item",
      key,
      value: key,
      textValue: key,
      level: 0,
      index: 0,
      hasChildNodes: false,
      childNodes: [],
      props: {},
    }));
    const collection = new ListCollection<unknown>(items);
    const [state, dispose] = createRoot((done) => [
      virtualizer({
        layout: listLayout({ estimatedRowHeight: 50 }),
        collection: () => collection,
        ref: () => null,
      }),
      done,
    ]);
    expect(state.contentSize().height).toBe(150);
    state.measure("a", { width: 0, height: 20 });
    flush();
    expect(state.contentSize().height).toBe(120);
    expect(state.layout.getLayoutInfo("b")?.rect.y).toBe(20);
    dispose();
  });
});

describe("measuring a row outside a <Virtualizer>", () => {
  test("takes any measure and shouldMeasure, as a hand-built virtualised list holds them", () => {
    const sizes: string[] = [];
    const element = document.createElement("div");
    document.body.append(element);
    Object.defineProperty(element, "offsetHeight", { value: 72, configurable: true });
    Object.defineProperty(element, "offsetWidth", { value: 300, configurable: true });
    const dispose = createRoot((done) => {
      measureRow(
        {
          shouldMeasure: () => true,
          measure: (key, size) => sizes.push(`${String(key)}:${String(size.height)}`),
        },
        "row-1",
        () => element,
      );
      return done;
    });
    flush();
    expect(sizes).toEqual(["row-1:72"]);
    dispose();
    element.remove();
  });
});

describe("a container the page scrolls", () => {
  test("renders what the window shows of it, not its whole height", () => {
    render(() => <Cities />);
    const element = list();
    // As tall as the collection, so it never scrolls itself: the page does,
    // and has carried its top 1000px above the viewport.
    Object.defineProperty(element, "clientHeight", {
      value: CITIES.length * ROW,
      configurable: true,
    });
    Object.defineProperty(element, "clientWidth", { value: 200, configurable: true });
    element.getBoundingClientRect = () =>
      ({
        top: -1000,
        left: 0,
        bottom: CITIES.length * ROW - 1000,
        right: 200,
        width: 200,
        height: CITIES.length * ROW,
      }) as DOMRect;

    window.dispatchEvent(new Event("scroll"));
    flush();

    const rendered = options();
    expect(rendered.length, "every row of the collection was rendered").toBeLessThan(
      Math.ceil(window.innerHeight / ROW) + 2,
    );
    expect(rendered[0]?.textContent).toBe("City 50");
  });

  test("a row is as wide as the container, however little of it is on screen", () => {
    render(() => <Cities />);
    const element = list();
    Object.defineProperty(element, "clientHeight", { value: VIEWPORT, configurable: true });
    Object.defineProperty(element, "clientWidth", { value: 200, configurable: true });
    element.getBoundingClientRect = () =>
      ({
        top: 0,
        left: -50,
        bottom: VIEWPORT,
        right: 150,
        width: 200,
        height: VIEWPORT,
      }) as DOMRect;

    window.dispatchEvent(new Event("scroll"));
    flush();

    expect(options()[0]?.style.width).toBe("200px");
  });
});

describe("a list layout as a place to drop", () => {
  function laidOut(rowHeight = ROW) {
    const layout = listLayout({ rowHeight });
    layout.update({
      collection: new ListCollection(nodesOf(CITIES.slice(0, 10))),
      visibleRect: rect(0, 40, 200, VIEWPORT),
    });
    return layout;
  }

  test("a point near a row's edge is between rows, and its middle is on it", () => {
    const layout = laidOut();
    const any = (): boolean => true;
    // The window is scrolled by 40, so a point 5 down is at 45: row c2, top edge.
    expect(layout.getDropTargetFromPoint(10, 5, any)).toEqual({
      type: "item",
      key: "c2",
      dropPosition: "before",
    });
    // A row twice the edge's reach has no middle; a taller one does.
    expect(laidOut(40).getDropTargetFromPoint(10, 20, any)).toEqual({
      type: "item",
      key: "c1",
      dropPosition: "on",
    });
    expect(layout.getDropTargetFromPoint(10, 17, any)).toEqual({
      type: "item",
      key: "c2",
      dropPosition: "after",
    });
  });

  test("where a drop on a row is refused, the nearer half decides", () => {
    const layout = laidOut();
    const between = (target: { type: string; dropPosition?: string }): boolean =>
      target.type === "item" && target.dropPosition !== "on";
    expect(layout.getDropTargetFromPoint(10, 8, between)).toMatchObject({
      key: "c2",
      dropPosition: "before",
    });
    expect(layout.getDropTargetFromPoint(10, 12, between)).toMatchObject({
      key: "c2",
      dropPosition: "after",
    });
  });

  test("below the last row is the list itself", () => {
    expect(laidOut().getDropTargetFromPoint(10, 500, () => true)).toEqual({ type: "root" });
  });

  test("an indicator is drawn on the line between the two rows", () => {
    const layout = laidOut();
    const before = layout.getDropTargetLayoutInfo({
      type: "item",
      key: "c2",
      dropPosition: "before",
    });
    const after = layout.getDropTargetLayoutInfo({
      type: "item",
      key: "c2",
      dropPosition: "after",
    });
    expect(before?.rect).toEqual(rect(0, 39, 200, 2));
    expect(after?.rect).toEqual(rect(0, 59, 200, 2));
  });
});

describe("dropping into a virtualised listbox", () => {
  afterEach(restoreRects);

  function Sortable(props: { onReorder: (event: DroppableCollectionReorderEvent) => void }) {
    const { dragAndDropHooks } = dragAndDrop<City>({
      getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
      onReorder: props.onReorder,
    });
    return (
      <Virtualizer layout={listLayout({ rowHeight: ROW })} overscan={0}>
        <ListBox
          aria-label="Cities"
          items={CITIES}
          getTextValue={(city: City) => city.name}
          dragAndDropHooks={dragAndDropHooks}
        >
          {(city: City) => <Option>{city.name}</Option>}
        </ListBox>
      </Virtualizer>
    );
  }

  test("the layout finds the target, places the indicator and keeps the target's row", async () => {
    stubRects(function (this: HTMLElement) {
      return {
        left: 0,
        right: 200,
        top: 0,
        bottom: VIEWPORT,
        x: 0,
        y: 0,
        width: 200,
        height: VIEWPORT,
      };
    });
    const reorders: DroppableCollectionReorderEvent[] = [];
    render(() => <Sortable onReorder={(event) => reorders.push(event)} />);
    scrollTo(list(), 0);

    const dragged = options().find((option) => option.textContent === "City 0") as HTMLElement;
    const dataTransfer = new MockDataTransfer();
    fireDrag(dragged, "dragstart", { dataTransfer, clientX: 10, clientY: 5 });
    await nextFrame();

    // 45 down: the top edge of the third row, so between City 1 and City 2.
    fireDrag(list(), "dragenter", { dataTransfer, clientX: 10, clientY: 45 });
    fireDrag(list(), "dragover", { dataTransfer, clientX: 10, clientY: 45 });
    const indicator = list().querySelector("[data-drop-target]") as HTMLElement;
    expect(indicator.getAttribute("aria-label")).toBe("Insert between City 1 and City 2");
    expect(indicator.style.position).toBe("absolute");
    expect(indicator.style.top).toBe("39px");

    // Scrolled far away, the row the drop is aimed at is still rendered.
    scrollTo(list(), 4000);
    expect(options().some((option) => option.textContent === "City 2")).toBe(true);
    expect(options().some((option) => option.textContent === "City 3")).toBe(false);

    scrollTo(list(), 0);
    fireDrag(list(), "drop", { dataTransfer, clientX: 10, clientY: 45 });
    expect(reorders[0]?.target).toEqual({ type: "item", key: "c2", dropPosition: "before" });
    fireDrag(dragged, "dragend", { dataTransfer, clientX: 10, clientY: 45 });
  });
});

describe("dropping into a virtualised grid list", () => {
  afterEach(restoreRects);

  test("the layout finds the target and places the indicator row", async () => {
    stubRects(function (this: HTMLElement) {
      return {
        left: 0,
        right: 200,
        top: 0,
        bottom: VIEWPORT,
        x: 0,
        y: 0,
        width: 200,
        height: VIEWPORT,
      };
    });
    const reorders: DroppableCollectionReorderEvent[] = [];
    function Sortable() {
      const { dragAndDropHooks } = dragAndDrop<City>({
        getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
        onReorder: (event) => {
          reorders.push(event);
        },
      });
      return (
        <Virtualizer layout={listLayout({ rowHeight: ROW })} overscan={0}>
          <GridList
            aria-label="Cities"
            items={CITIES}
            getTextValue={(c: City) => c.name}
            dragAndDropHooks={dragAndDropHooks}
          >
            {(city: City) => <GridListItem>{city.name}</GridListItem>}
          </GridList>
        </Virtualizer>
      );
    }
    render(() => <Sortable />);
    const grid = screen.getByRole("grid");
    scrollTo(grid, 0);

    const dragged = screen
      .getAllByRole("row")
      .find((row) => (row.textContent ?? "").includes("City 0")) as HTMLElement;
    const dataTransfer = new MockDataTransfer();
    fireDrag(dragged, "dragstart", { dataTransfer, clientX: 10, clientY: 5 });
    await nextFrame();

    fireDrag(grid, "dragenter", { dataTransfer, clientX: 10, clientY: 45 });
    fireDrag(grid, "dragover", { dataTransfer, clientX: 10, clientY: 45 });
    const indicator = grid.querySelector('[data-slot="drop-indicator"][data-drop-target]');
    expect((indicator as HTMLElement).style.position).toBe("absolute");
    expect((indicator as HTMLElement).style.top).toBe("39px");

    fireDrag(grid, "drop", { dataTransfer, clientX: 10, clientY: 45 });
    expect(reorders[0]?.target).toEqual({ type: "item", key: "c2", dropPosition: "before" });
    fireDrag(dragged, "dragend", { dataTransfer, clientX: 10, clientY: 45 });
  });
});
