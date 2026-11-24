import { describe, expect, test } from "bun:test";
import { createSignal, type ParentProps } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { Pager, pageWindow } from "./pager.tsx";

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

function pages(): string[] {
  return [...document.querySelectorAll('[data-slot="pager-pages"] li')].map((one) =>
    one.querySelector('[data-slot="pager-page"]') === null ? "…" : (one.textContent ?? ""),
  );
}

describe("pageWindow", () => {
  test("every page while few, the ends and the neighbours with gaps when many", () => {
    expect(pageWindow(0, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(pageWindow(0, 20)).toEqual([0, 1, 2, 3, 4, "gap", 19]);
    expect(pageWindow(10, 20)).toEqual([0, "gap", 9, 10, 11, "gap", 19]);
    expect(pageWindow(19, 20)).toEqual([0, "gap", 15, 16, 17, 18, 19]);
    expect(pageWindow(3, 20, 2)).toEqual([0, 1, 2, 3, 4, 5, 6, "gap", 19]);
    expect(pageWindow(0, 0)).toEqual([]);
  });
});

describe("Pager", () => {
  test("a landmark with the range, the pages and the current one marked", async () => {
    render(() => <Pager defaultPageIndex={1} total={312} pageSize={20} />);
    const nav = screen.getByRole("navigation", { name: "Pages" });
    expect(slot("pager-range").textContent).toBe("21–40 of 312");
    expect(pages()).toEqual(["1", "2", "3", "4", "5", "…", "16"]);
    expect(within(nav).getByRole("button", { name: "Page 2" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the arrows and the pages move it, and it stops at the ends", async () => {
    const [page, setPage] = createSignal(0);
    render(() => <Pager pageIndex={page()} onPageIndexChange={setPage} pageCount={3} showEdges />);
    const previous = screen.getByRole("button", { name: "Previous page" });
    expect(previous.hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await settle();
    expect(page()).toBe(1);
    user.tap(screen.getByRole("button", { name: "Page 3" }));
    await settle();
    expect(page()).toBe(2);
    expect(screen.getByRole("button", { name: "Last page" }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("button", { name: "First page" }));
    await settle();
    expect(page()).toBe(0);
  });

  test("works from the keyboard", async () => {
    let page = 0;
    render(() => <Pager pageCount={4} onPageIndexChange={(next) => (page = next)} />);
    user.tab();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Page 1");
    user.tab();
    await user.keyboard("{Enter}");
    await settle();
    expect(page).toBe(1);
  });

  test("compact and simple variants, and the page size", async () => {
    const sizes: number[] = [];
    render(() => (
      <>
        <Pager
          variant="compact"
          pageCount={9}
          defaultPageIndex={1}
          pageSizes={[20, 50]}
          pageSize={20}
          onPageSizeChange={(size) => sizes.push(size)}
        />
        <Pager variant="simple" pageCount={9} />
      </>
    ));
    const [compact, simple] = screen.getAllByRole("navigation");
    expect(compact?.querySelector('[data-slot="pager-current"]')?.textContent).toBe("Page 2 of 9");
    expect(compact?.querySelector('[data-slot="pager-pages"]')).toBeNull();
    expect(simple?.querySelector('[data-slot="pager-current"]')).toBeNull();
    const select = screen.getByLabelText<HTMLSelectElement>("Rows per page");
    select.value = "50";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(sizes).toEqual([50]);
  });

  test("pages as links, and the list folding across a narrow container", () => {
    render(() => <Pager pageCount={3} getHref={(page) => `?page=${String(page + 1)}`} />);
    expect(screen.getByRole("link", { name: "Page 2" }).getAttribute("href")).toBe("?page=2");
    expect(collectCss()).toMatch(/@container \(width < 32rem\)\{[^}]*\{display:none\}/);
  });

  test("the locale's digits and words, arrows turned right to left", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <Pager
          pageCount={3}
          total={45}
          pageSize={20}
          labels={{
            pagination: "الصفحات",
            range: (from, to, total) => `${from}–${to} من ${total}`,
          }}
        />
      </Arabic>
    ));
    expect(screen.getByRole("navigation", { name: "الصفحات" })).toBeDefined();
    expect(slot("pager-range").textContent).toBe("١–٢٠ من ٤٥");
    expect(pages()).toEqual(["١", "٢", "٣"]);
    expect(collectCss()).toContain(":dir(rtl)");
  });

  test("takes a class per part", () => {
    render(() => (
      <Pager
        class="mine"
        pageCount={3}
        total={30}
        pageSize={10}
        pageSizes={[10]}
        classes={{
          root: "r",
          range: "g",
          size: "s",
          sizeLabel: "z",
          controls: "c",
          pages: "p",
          page: "k",
          current: "u",
          edge: "e",
        }}
      />
    ));
    const pairs = [
      ["pager", "r"],
      ["pager-range", "g"],
      ["pager-size", "s"],
      ["pager-controls", "c"],
      ["pager-pages", "p"],
      ["pager-page", "k"],
      ["pager-current", "u"],
      ["pager-edge", "e"],
    ] as const;
    for (const [name, cls] of pairs) expect(slot(name).classList.contains(cls)).toBe(true);
    expect(slot("pager").classList.contains("mine")).toBe(true);
    expect(slot("pager-size").querySelector("label")?.classList.contains("z")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { Pager } from "<arc>";
      export function Page() {
        return <Pager defaultPageIndex={2} total={200} pageSize={10} pageSizes={[10, 20]} />;
      }
    `);
    expect(result.container.querySelector('[aria-current="page"]')?.textContent).toBe("3");
    result.unmount();
  });
});
