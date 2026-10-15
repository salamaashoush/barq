import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  For,
  Show,
  createEffect,
  createRoot,
  createSignal,
  flush,
  render,
  snapshot,
} from "@barqjs/core";
import { renderToString } from "@barqjs/server";
import {
  type Range,
  type VirtualItem,
  type Virtualizer,
  type VirtualizerOptions,
  createVirtualizer,
  createWindowVirtualizer,
  defaultRangeExtractor,
} from "./index.ts";

type ElementVirtualizer = Virtualizer<HTMLDivElement, HTMLDivElement>;
type ListOptions = Partial<VirtualizerOptions<HTMLDivElement, HTMLDivElement>>;

const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * happy-dom has no layout. An element's box is whatever its `data-height` and
 * `data-width` say, and every element can scroll as far as it is asked to.
 */
const LAYOUT = {
  offsetHeight: (el: HTMLElement) => Number(el.getAttribute("data-height") ?? 0),
  offsetWidth: (el: HTMLElement) => Number(el.getAttribute("data-width") ?? 0),
  scrollHeight: () => Number.MAX_SAFE_INTEGER,
  scrollWidth: () => Number.MAX_SAFE_INTEGER,
};

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly targets = new Set<Element>();
  readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.targets.add(target);
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
  }

  static resize(target: Element, size: { width: number; height: number }): void {
    for (const observer of FakeResizeObserver.instances) {
      if (!observer.targets.has(target)) continue;
      const entry = {
        target,
        borderBoxSize: [{ inlineSize: size.width, blockSize: size.height }],
      } as unknown as ResizeObserverEntry;
      observer.callback([entry], observer);
    }
  }

  static observed(): Element[] {
    return FakeResizeObserver.instances.flatMap((observer) => [...observer.targets]);
  }
}

const saved = new Map<string, PropertyDescriptor | undefined>();
let savedResizeObserver: typeof ResizeObserver;
const disposers: (() => void)[] = [];

beforeEach(() => {
  for (const [name, read] of Object.entries(LAYOUT)) {
    saved.set(name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name));
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      get(this: HTMLElement) {
        return read(this);
      },
    });
  }
  savedResizeObserver = window.ResizeObserver;
  window.ResizeObserver = FakeResizeObserver;
  FakeResizeObserver.instances = [];
});

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  for (const [name, descriptor] of saved) {
    if (descriptor === undefined) {
      Reflect.deleteProperty(HTMLElement.prototype, name);
    } else {
      Object.defineProperty(HTMLElement.prototype, name, descriptor);
    }
  }
  saved.clear();
  window.ResizeObserver = savedResizeObserver;
  document.documentElement.scrollTop = 0;
  document.body.innerHTML = "";
});

let current: ElementVirtualizer;
let measured = false;
let rowSize: (index: number) => number = () => 50;
let builtRows: number[] = [];

beforeEach(() => {
  measured = false;
  rowSize = () => 50;
  builtRows = [];
});

function translate(virtualizer: Virtualizer<never, never>, start: number): string {
  return virtualizer.options.horizontal ? `translateX(${start}px)` : `translateY(${start}px)`;
}

export function List(props: { options: () => ListOptions }) {
  let scroller: HTMLDivElement | null = null;
  const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>(() => ({
    count: 100,
    getScrollElement: () => scroller,
    estimateSize: () => 50,
    ...props.options(),
  }));
  current = virtualizer;
  const measure = measured ? virtualizer.measureElement : undefined;
  const scrolling = () => virtualizer.isScrolling;
  return (
    <div
      ref={(el: HTMLDivElement) => (scroller = el)}
      class="scroller"
      data-height="200"
      data-width="300"
      data-scrolling={scrolling() ? "yes" : "no"}
    >
      <div class="sizer" data-total={virtualizer.getTotalSize()}>
        <For each={virtualizer.getVirtualItems()} keyed={(item: VirtualItem) => item.key}>
          {(item: () => VirtualItem) => {
            builtRows.push(item().index);
            return (
              <div
                class="row"
                ref={measure}
                data-index={item().index}
                data-lane={item().lane}
                data-size={item().size}
                data-height={rowSize(item().index)}
                data-width={rowSize(item().index)}
                style={{ transform: translate(virtualizer as never, item().start) }}
              >
                Row {item().index}
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}

interface Mounted {
  host: HTMLDivElement;
  readonly scroller: HTMLDivElement;
  rows: () => HTMLElement[];
  indexes: () => number[];
  row: (index: number) => HTMLElement;
  start: (index: number) => number;
  total: () => number;
  dispose: () => void;
}

function inspect(host: HTMLDivElement, dispose: () => void): Mounted {
  const rows = () => [...host.querySelectorAll<HTMLElement>(".row")];
  const row = (index: number) => {
    const found = host.querySelector<HTMLElement>(`.row[data-index="${index}"]`);
    if (found === null) throw new Error(`row ${index} is not rendered`);
    return found;
  };
  let disposed = false;
  const once = () => {
    if (disposed) return;
    disposed = true;
    dispose();
  };
  disposers.push(once);
  return {
    host,
    get scroller() {
      const found = host.querySelector<HTMLDivElement>(".scroller");
      if (found === null) throw new Error("the scroller is not rendered");
      return found;
    },
    rows,
    row,
    indexes: () => rows().map((el) => Number(el.getAttribute("data-index"))),
    start: (index) => Number(/\(([\d.-]+)px\)/.exec(row(index).style.transform)?.[1]),
    total: () => Number(host.querySelector(".sizer")?.getAttribute("data-total")),
    dispose: once,
  };
}

function mount(options: () => ListOptions = () => ({})): Mounted {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = render(() => <List options={options()} />, host);
  return inspect(host, dispose);
}

function scroll(
  target: HTMLElement,
  offset: number,
  axis: "scrollTop" | "scrollLeft" = "scrollTop",
) {
  target[axis] = offset;
  target.dispatchEvent(new Event("scroll"));
}

const sequence = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("fixed sizes", () => {
  test("only the visible window is in the document", async () => {
    const list = mount();
    await settle();

    expect(list.indexes()).toEqual([0, 1, 2, 3, 4]);
    expect(list.total()).toBe(5000);
    expect(list.row(0).style.transform).toBe("translateY(0px)");
    expect(list.row(3).style.transform).toBe("translateY(150px)");
    expect(list.row(2).textContent).toBe("Row 2");
  });

  test("a scroll event moves the window and keeps the rows that stay", async () => {
    const list = mount();
    await settle();
    const kept = list.row(4);
    builtRows = [];

    scroll(list.scroller, 250);
    await settle();

    expect(list.indexes()).toEqual(sequence(4, 9));
    expect(list.row(4)).toBe(kept);
    expect(builtRows).toEqual([5, 6, 7, 8, 9]);
    expect(list.start(9)).toBe(450);
  });

  test("a million rows cost a window, not a list", async () => {
    const started = performance.now();
    const list = mount(() => ({ count: 1_000_000 }));
    await settle();
    scroll(list.scroller, 25_000_000);
    await settle();

    expect(list.rows()).toHaveLength(6);
    expect(list.indexes()[0]).toBe(499_999);
    expect(list.total()).toBe(50_000_000);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  test("the mirror never rewrites what the core measured", async () => {
    const list = mount();
    await settle();
    scroll(list.scroller, 1234);
    await settle();
    current.resizeItem(25, 90);
    await settle();

    const live = current.getVirtualIndexes().map((index) => current.measurementsCache[index]);
    expect(snapshot(current.getVirtualItems())).toEqual(live);
    expect(list.indexes()).toEqual(current.getVirtualIndexes());
  });
});

describe("overscan", () => {
  test("none renders exactly what the viewport holds", async () => {
    const list = mount(() => ({ overscan: 0 }));
    await settle();

    expect(list.indexes()).toEqual([0, 1, 2, 3]);
  });

  test("a larger overscan renders further on both sides", async () => {
    const list = mount(() => ({ overscan: 3 }));
    await settle();
    scroll(list.scroller, 500);
    await settle();

    expect(list.indexes()).toEqual(sequence(7, 16));
  });

  test("a range extractor decides the rendered indexes", async () => {
    const list = mount(() => ({
      rangeExtractor: (range: Range) => [...new Set([0, ...defaultRangeExtractor(range)])],
    }));
    await settle();
    scroll(list.scroller, 1000);
    await settle();

    expect(list.indexes()).toEqual([0, ...sequence(19, 24)]);
  });
});

describe("dynamic sizes", () => {
  test("a row passed to measureElement is measured once it is in the document", async () => {
    measured = true;
    rowSize = (index) => 60 + index * 10;
    const warn = spyOn(console, "warn");
    const list = mount();
    await settle();

    expect(list.indexes()).toEqual([0, 1, 2, 3]);
    expect([0, 1, 2, 3].map(list.start)).toEqual([0, 60, 130, 210]);
    expect(list.row(2).getAttribute("data-size")).toBe("80");
    // Five rows were built on the 50px estimate and each one was measured.
    expect(list.total()).toBe(60 + 70 + 80 + 90 + 100 + 95 * 50);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  test("a resize reported by the observer moves the rows below it", async () => {
    measured = true;
    const list = mount();
    await settle();
    expect(FakeResizeObserver.observed()).toContain(list.row(1));
    const below = list.row(2);

    FakeResizeObserver.resize(list.row(1), { width: 300, height: 120 });
    await settle();

    expect(list.start(1)).toBe(50);
    expect(list.start(2)).toBe(170);
    expect(list.row(2)).toBe(below);
    expect(list.total()).toBe(5070);
  });

  test("a field assigned on the virtualizer reaches the core", async () => {
    measured = true;
    const list = mount();
    await settle();
    scroll(list.scroller, 1000);
    await settle();
    const asked: number[] = [];

    current.shouldAdjustScrollPositionOnItemSizeChange = (item) => {
      asked.push(item.index);
      return false;
    };
    FakeResizeObserver.resize(list.row(19), { width: 300, height: 90 });

    expect(asked).toEqual([19]);
    expect(list.scroller.scrollTop).toBe(1000);
  });

  test("a custom measureElement option is what sizes the row", async () => {
    measured = true;
    const list = mount(() => ({ measureElement: () => 100 }));
    await settle();

    expect(list.indexes()).toEqual([0, 1, 2]);
    expect(list.start(2)).toBe(200);
  });

  test("measured sizes survive an option change", () => {
    const [count, setCount] = createSignal(2);
    const [virtualizer, dispose] = createRoot((stop) => [
      createVirtualizer<HTMLDivElement, HTMLDivElement>({
        get count() {
          return count();
        },
        getScrollElement: () => null,
        estimateSize: () => 60,
        initialRect: { width: 800, height: 600 },
      }),
      stop,
    ]);

    expect(virtualizer.getTotalSize()).toBe(120);
    virtualizer.resizeItem(0, 100);
    expect(virtualizer.getTotalSize()).toBe(160);

    setCount(3);
    flush();

    expect(virtualizer.itemSizeCache.get(0)).toBe(100);
    expect(virtualizer.getTotalSize()).toBe(220);
    dispose();
  });
});

describe("scrolling to a position", () => {
  test.each([
    ["start", 2500],
    ["center", 2425],
    ["end", 2350],
    ["auto", 2350],
  ] as const)("scrollToIndex aligns %s", async (align, expected) => {
    const list = mount();
    await settle();

    current.scrollToIndex(50, { align });
    expect(list.scroller.scrollTop).toBe(expected);

    list.scroller.dispatchEvent(new Event("scroll"));
    await settle();
    expect(list.indexes()).toContain(50);
    expect(list.start(50)).toBe(2500);
  });

  test("auto leaves a visible row alone and aligns a row above to the start", async () => {
    const list = mount();
    await settle();
    scroll(list.scroller, 2350);
    await settle();

    current.scrollToIndex(49, { align: "auto" });
    expect(list.scroller.scrollTop).toBe(2350);

    current.scrollToIndex(10, { align: "auto" });
    expect(list.scroller.scrollTop).toBe(500);
  });

  test.each([
    ["start", 1000],
    ["center", 900],
    ["end", 800],
  ] as const)("scrollToOffset aligns %s", async (align, expected) => {
    const list = mount();
    await settle();

    current.scrollToOffset(1000, { align });
    expect(list.scroller.scrollTop).toBe(expected);

    list.scroller.dispatchEvent(new Event("scroll"));
    await settle();
    expect(list.indexes()).toContain(Math.floor(expected / 50));
  });

  test("scroll padding is kept clear of the target row", async () => {
    const list = mount(() => ({ scrollPaddingStart: 30, scrollPaddingEnd: 20 }));
    await settle();

    current.scrollToIndex(50, { align: "start" });
    expect(list.scroller.scrollTop).toBe(2470);

    current.scrollToIndex(50, { align: "end" });
    expect(list.scroller.scrollTop).toBe(2370);
  });

  test("isScrolling is reactive and resets after the delay", async () => {
    const list = mount(() => ({ isScrollingResetDelay: 20 }));
    await settle();
    expect(list.scroller.getAttribute("data-scrolling")).toBe("no");

    scroll(list.scroller, 300);
    expect(current.isScrolling).toBe(true);
    await settle();
    expect(list.scroller.getAttribute("data-scrolling")).toBe("yes");

    await settle(60);
    expect(list.scroller.getAttribute("data-scrolling")).toBe("no");
  });

  test("an effect on the range runs once per range change", async () => {
    const list = mount();
    await settle();
    const seen: (number | undefined)[] = [];
    const stop = createRoot((dispose) => {
      createEffect(
        () => current.range?.endIndex,
        (endIndex) => {
          seen.push(endIndex);
        },
      );
      return dispose;
    });
    await settle();

    scroll(list.scroller, 10);
    await settle();
    scroll(list.scroller, 20);
    await settle();
    scroll(list.scroller, 400);
    await settle();

    expect(seen).toEqual([3, 4, 11]);
    stop();
  });

  test("a prepend keeps the reading position when anchored to the end", async () => {
    const warn = spyOn(console, "warn");
    const [ids, setIds] = createSignal(sequence(100, 199));
    const list = mount(() => ({
      count: ids().length,
      getItemKey: (index: number) => ids()[index],
      anchorTo: "end",
    }));
    await settle();
    scroll(list.scroller, 500);
    await settle();
    const reading = list.rows().find((el) => el.textContent === "Row 10");
    expect(reading?.style.transform).toBe("translateY(500px)");

    setIds(sequence(95, 199));
    await settle();

    expect(list.scroller.scrollTop).toBe(750);
    const moved = list.rows().find((el) => el.textContent === "Row 15");
    expect(moved).toBe(reading);
    expect(moved?.style.transform).toBe("translateY(750px)");
    // `getItemKey` reads a signal while the core runs inside the adapter's
    // effects, which the strict engine build reports unless it is untracked.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("lanes", () => {
  test("items fill lanes row by row", async () => {
    const list = mount(() => ({ lanes: 3, count: 20 }));
    await settle();

    // Four visible rows of three, the row the core's lane walk ends on, and
    // one row of overscan.
    expect(list.indexes()).toEqual(sequence(0, 17));
    expect(list.rows().map((el) => el.getAttribute("data-lane"))).toEqual(
      sequence(0, 17).map((index) => String(index % 3)),
    );
    expect([0, 1, 2, 3, 6].map(list.start)).toEqual([0, 0, 0, 50, 100]);
    expect(list.total()).toBe(350);
  });

  test("changing the lane count lays the grid out again", async () => {
    const [lanes, setLanes] = createSignal(2);
    const list = mount(() => ({ lanes: lanes(), count: 20 }));
    await settle();
    expect(list.total()).toBe(500);
    expect(list.start(3)).toBe(50);

    setLanes(4);
    await settle();

    expect(list.total()).toBe(250);
    expect(list.start(3)).toBe(0);
    expect(list.row(3).getAttribute("data-lane")).toBe("3");
    expect(list.start(4)).toBe(50);
  });
});

describe("horizontal", () => {
  test("the width is the viewport and scrollLeft is the offset", async () => {
    const list = mount(() => ({ horizontal: true }));
    await settle();

    expect(list.indexes()).toEqual(sequence(0, 6));
    expect(list.row(2).style.transform).toBe("translateX(100px)");

    scroll(list.scroller, 1000, "scrollLeft");
    await settle();
    expect(list.indexes()).toEqual(sequence(19, 26));

    current.scrollToIndex(50, { align: "start" });
    expect(list.scroller.scrollLeft).toBe(2500);
    expect(list.scroller.scrollTop).toBe(0);
  });

  test("columns are measured by their width", async () => {
    measured = true;
    rowSize = () => 120;
    const list = mount(() => ({ horizontal: true }));
    await settle();

    expect(list.indexes()).toEqual([0, 1, 2, 3]);
    expect(list.start(2)).toBe(240);
  });
});

describe("gap and padding", () => {
  test("both are part of every position and of the total", async () => {
    const list = mount(() => ({ count: 10, gap: 10, paddingStart: 20, paddingEnd: 30 }));
    await settle();

    expect([0, 1, 2].map(list.start)).toEqual([20, 80, 140]);
    expect(list.total()).toBe(20 + 10 * 50 + 9 * 10 + 30);
  });

  test("a gap change moves the rows already rendered", async () => {
    const [gap, setGap] = createSignal(0);
    const list = mount(() => ({ count: 10, gap: gap() }));
    await settle();
    const second = list.row(1);
    expect(list.start(1)).toBe(50);

    setGap(40);
    await settle();

    expect(list.row(1)).toBe(second);
    expect(list.start(1)).toBe(90);
    expect(list.start(2)).toBe(180);
  });
});

describe("reactive options", () => {
  test("a count change renders and removes rows", async () => {
    const [count, setCount] = createSignal(2);
    const list = mount(() => ({ count: count() }));
    await settle();
    expect(list.indexes()).toEqual([0, 1]);
    const first = list.row(0);

    setCount(10);
    await settle();
    expect(list.indexes()).toEqual([0, 1, 2, 3, 4]);
    expect(list.row(0)).toBe(first);
    expect(list.total()).toBe(500);

    setCount(0);
    await settle();
    expect(list.rows()).toHaveLength(0);
    expect(list.total()).toBe(0);
  });

  test("an object of getters is re-applied the same way", async () => {
    const [count, setCount] = createSignal(3);
    const [overscan, setOverscan] = createSignal(0);
    const list = mount(() => ({
      get count() {
        return count();
      },
      get overscan() {
        return overscan();
      },
    }));
    await settle();
    expect(list.indexes()).toEqual([0, 1, 2]);

    setCount(50);
    setOverscan(2);
    await settle();
    expect(list.indexes()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test("disabling empties the list and enabling restores it", async () => {
    const [enabled, setEnabled] = createSignal(true);
    const list = mount(() => ({ enabled: enabled() }));
    await settle();
    expect(list.rows()).toHaveLength(5);

    setEnabled(false);
    await settle();
    expect(list.rows()).toHaveLength(0);
    expect(current.scrollElement).toBeNull();

    setEnabled(true);
    await settle();
    expect(list.rows()).toHaveLength(5);
    expect(current.scrollElement).toBe(list.scroller);
  });

  test("an undefined option keeps the adapter default", async () => {
    const list = mount(() => ({ scrollToFn: undefined, observeElementRect: undefined }));
    await settle();

    expect(list.rows()).toHaveLength(5);
    current.scrollToIndex(20, { align: "start" });
    expect(list.scroller.scrollTop).toBe(1000);
  });

  test("the caller's onChange still runs", async () => {
    const calls: boolean[] = [];
    const list = mount(() => ({
      onChange: (_instance: ElementVirtualizer, sync: boolean) => {
        calls.push(sync);
      },
    }));
    await settle();
    calls.length = 0;

    scroll(list.scroller, 600);
    expect(calls).toEqual([true]);
  });

  test("a total size reader is not woken by a scroll", async () => {
    const list = mount();
    await settle();
    let runs = 0;
    const stop = createRoot((dispose) => {
      createEffect(
        () => current.getTotalSize(),
        () => {
          runs += 1;
        },
      );
      return dispose;
    });
    await settle();
    expect(runs).toBe(1);

    scroll(list.scroller, 900);
    await settle();
    expect(list.indexes()).toContain(18);
    expect(runs).toBe(1);

    current.resizeItem(0, 75);
    await settle();
    expect(runs).toBe(2);
    stop();
  });

  test("an imperative read sees the core before the flush", async () => {
    const list = mount();
    await settle();

    current.resizeItem(0, 80);
    expect(current.getTotalSize()).toBe(5030);
    expect(list.total()).toBe(5000);

    flush();
    expect(list.total()).toBe(5030);
  });
});

let late: ElementVirtualizer;

export function LateList(props: { open: () => boolean }) {
  const [scroller, setScroller] = createSignal<HTMLDivElement | null>(null, { ownedWrite: true });
  const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: 100,
    getScrollElement: scroller,
    estimateSize: () => 50,
  });
  late = virtualizer;
  return (
    <Show when={props.open()}>
      <div ref={setScroller} class="scroller" data-height="200" data-width="300">
        <For each={virtualizer.getVirtualItems()} keyed={(item: VirtualItem) => item.key}>
          {(item: () => VirtualItem) => (
            <div class="row" data-index={item().index}>
              Row {item().index}
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

describe("the scroll element", () => {
  test("one that arrives later is attached when it arrives", async () => {
    const warn = spyOn(console, "warn");
    const [open, setOpen] = createSignal(false);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const list = inspect(
      host,
      render(() => <LateList open={open()} />, host),
    );
    await settle();
    expect(list.rows()).toHaveLength(0);
    expect(late.scrollElement).toBeNull();

    setOpen(true);
    await settle();

    expect(late.scrollElement).toBe(host.querySelector(".scroller"));
    expect(list.indexes()).toEqual([0, 1, 2, 3, 4]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  test("a viewport resize reported by the observer changes the window", async () => {
    const list = mount();
    await settle();
    expect(list.rows()).toHaveLength(5);

    FakeResizeObserver.resize(list.scroller, { width: 300, height: 400 });
    await settle();

    expect(list.indexes()).toEqual(sequence(0, 8));
  });
});

describe("dispose", () => {
  test("observers and listeners are released", async () => {
    measured = true;
    const list = mount();
    await settle();
    const { scroller } = list;
    const removed = spyOn(scroller, "removeEventListener");
    expect(FakeResizeObserver.observed()).toContain(scroller);
    expect(FakeResizeObserver.observed()).toContain(list.row(0));
    const virtualizer = current;
    let changes = 0;
    const onChange = virtualizer.options.onChange;
    virtualizer.options.onChange = (instance, sync) => {
      changes += 1;
      onChange(instance, sync);
    };

    list.dispose();

    expect(FakeResizeObserver.observed()).toEqual([]);
    expect(removed.mock.calls.map((call) => call[0])).toContain("scroll");
    expect(virtualizer.scrollElement).toBeNull();
    expect(virtualizer.targetWindow).toBeNull();

    scroll(scroller, 2000);
    await settle();
    expect(changes).toBe(0);
  });

  test("a row disposed before it reached the document is never measured", async () => {
    measured = true;
    const list = mount();
    list.dispose();
    await settle();

    expect(FakeResizeObserver.observed()).toEqual([]);
    expect(current.elementsCache.size).toBe(0);
  });
});

let page: Virtualizer<Window, HTMLLIElement>;

export function Page(props: { options: () => Partial<VirtualizerOptions<Window, HTMLLIElement>> }) {
  const virtualizer = createWindowVirtualizer<HTMLLIElement>(() => ({
    count: 1000,
    estimateSize: () => 100,
    ...props.options(),
  }));
  page = virtualizer;
  return (
    <ul class="sizer" data-total={virtualizer.getTotalSize()}>
      <For each={virtualizer.getVirtualItems()} keyed={(item: VirtualItem) => item.key}>
        {(item: () => VirtualItem) => (
          <li
            class="row"
            data-index={item().index}
            style={{
              transform: `translateY(${item().start - virtualizer.options.scrollMargin}px)`,
            }}
          >
            Row {item().index}
          </li>
        )}
      </For>
    </ul>
  );
}

function mountPage(
  options: () => Partial<VirtualizerOptions<Window, HTMLLIElement>> = () => ({}),
): Mounted {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return inspect(
    host,
    render(() => <Page options={options()} />, host),
  );
}

function scrollWindow(offset: number): void {
  document.documentElement.scrollTop = offset;
  window.dispatchEvent(new Event("scroll"));
}

describe("the window virtualizer", () => {
  test("the window is the viewport", async () => {
    const list = mountPage();
    await settle();
    const visible = Math.ceil(window.innerHeight / 100);

    expect(page.scrollElement).toBe(window);
    expect(list.indexes()).toEqual(sequence(0, visible));
    expect(list.total()).toBe(100_000);
  });

  test("a window scroll moves the rows", async () => {
    const list = mountPage();
    await settle();

    scrollWindow(5000);
    await settle();

    expect(list.indexes()[0]).toBe(49);
    expect(list.start(50)).toBe(5000);
  });

  test("scrollToIndex scrolls the document", async () => {
    mountPage();
    await settle();

    page.scrollToIndex(200, { align: "start" });

    expect(window.scrollY).toBe(20_000);
  });

  test("a scroll margin offsets the list inside the page", async () => {
    const list = mountPage(() => ({ scrollMargin: 300 }));
    await settle();
    expect(list.total()).toBe(100_000);

    scrollWindow(1300);
    await settle();

    expect(list.indexes()[0]).toBe(9);
    expect(list.start(10)).toBe(1000);
  });

  test("a window resize changes how many rows fit", async () => {
    const list = mountPage();
    await settle();
    const before = list.rows().length;
    const height = Object.getOwnPropertyDescriptor(window, "innerHeight");
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 2000 });

    window.dispatchEvent(new Event("resize"));
    await settle();

    expect(list.rows().length).toBeGreaterThan(before);
    expect(list.indexes()).toEqual(sequence(0, 20));
    if (height === undefined) Reflect.deleteProperty(window, "innerHeight");
    else Object.defineProperty(window, "innerHeight", height);
  });

  test("dispose removes the window listeners", async () => {
    const removed = spyOn(window, "removeEventListener");
    const list = mountPage();
    await settle();

    list.dispose();

    const names = removed.mock.calls.map((call) => call[0]);
    expect(names).toContain("scroll");
    expect(names).toContain("resize");
    removed.mockRestore();
  });
});

describe("server rendering", () => {
  test("the module imports and renders to a string with no DOM globals", async () => {
    const child = Bun.spawn([process.execPath, `${import.meta.dir}/fixtures/ssr-run.ts`], {
      cwd: `${import.meta.dir}/..`,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [output, errors, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(errors).toBe("");
    expect(code).toBe(0);

    const result = JSON.parse(output) as { globals: string[]; element: string; window: string };
    expect(result.globals).toEqual(["undefined", "undefined", "undefined"]);
    expect(result.element).toContain('style="height: 50000px;"');
    expect(result.element).toContain("Row 4");
    expect(result.element).not.toContain("Row 5");
    expect(result.element).toContain("translateY(150px)");
    expect(result.window).toContain('style="height: 40000px;"');
    expect(result.window).toContain("Item 3");
    expect(result.window).not.toContain("Item 4");
  });

  test("renderToString emits the first window and leaves nothing observed", () => {
    const markup = renderToString(() => (
      <List options={{ overscan: 0, initialRect: { width: 300, height: 200 } }} />
    ));

    expect(markup).toContain('data-total="5000"');
    expect(markup).toContain("Row 3");
    expect(markup).not.toContain("Row 4");
    expect(FakeResizeObserver.observed()).toEqual([]);
  });
});
