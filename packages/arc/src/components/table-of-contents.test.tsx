import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type Child } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";

import { hydrates, settle, wears } from "../test-arc.ts";
import { TableOfContents, type TocItem, tableOfContentsStyles } from "./table-of-contents.tsx";

const ITEMS: TocItem[] = [
  { id: "install", label: "Install" },
  { id: "usage", label: "Usage", items: [{ id: "options", label: "Options" }] },
  { id: "faq", label: "FAQ" },
];

type Report = (entries: Partial<IntersectionObserverEntry>[]) => void;

let report: Report = () => {};
let options: IntersectionObserverInit | undefined;
const original = globalThis.IntersectionObserver;

beforeEach(() => {
  globalThis.IntersectionObserver = class {
    constructor(callback: IntersectionObserverCallback, init?: IntersectionObserverInit) {
      options = init;
      report = (entries) => callback(entries as IntersectionObserverEntry[], this as never);
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  globalThis.IntersectionObserver = original;
});

function Page(props: { children?: Child }) {
  return (
    <div>
      {props.children}
      <section id="install" />
      <section id="usage" />
      <section id="options" />
      <section id="faq" />
    </div>
  );
}

function at(id: string, intersecting: boolean, top: number): Partial<IntersectionObserverEntry> {
  return {
    target: document.getElementById(id) as Element,
    isIntersecting: intersecting,
    boundingClientRect: { top } as DOMRectReadOnly,
  };
}

function current(): string | null {
  return document.querySelector('[aria-current="location"]')?.textContent ?? null;
}

describe("TableOfContents", () => {
  test("a landmark of #links, nested by level", async () => {
    render(() => (
      <Page>
        <TableOfContents items={ITEMS} />
      </Page>
    ));
    const nav = screen.getByRole("navigation", { name: "On this page" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((one) => one.getAttribute("href"))).toEqual([
      "#install",
      "#usage",
      "#options",
      "#faq",
    ]);
    expect(links[2]?.getAttribute("style")).toContain("--arc-toc-depth: 2");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("marks the section being read as the page scrolls", async () => {
    const changes: string[] = [];
    render(() => (
      <Page>
        <TableOfContents items={ITEMS} offset={64} onActiveChange={(id) => changes.push(id)} />
      </Page>
    ));
    await settle();
    expect(options?.rootMargin).toBe("-64px 0px -60% 0px");
    report([at("install", true, 80)]);
    await settle();
    expect(current()).toBe("Install");
    report([at("install", false, -400), at("usage", true, 70)]);
    await settle();
    expect(current()).toBe("Usage");
    report([at("options", false, -10)]);
    await settle();
    expect(current()).toBe("Options");
    expect(changes).toEqual(["install", "usage", "options"]);
  });

  test("a press marks its section at once, and the caller can hold it", async () => {
    render(() => (
      <Page>
        <TableOfContents items={ITEMS} />
        <TableOfContents items={ITEMS} activeId="faq" title="Contents" />
      </Page>
    ));
    const [own] = screen.getAllByRole("navigation");
    user.click(within(own as HTMLElement).getByRole("link", { name: "FAQ" }));
    await settle();
    const held = screen.getByRole("navigation", { name: "Contents" });
    expect(within(held).getByRole("link", { name: "FAQ" }).getAttribute("aria-current")).toBe(
      "location",
    );
    expect(
      within(own as HTMLElement)
        .getByRole("link", { name: "FAQ" })
        .getAttribute("aria-current"),
    ).toBe("location");
  });

  test("Tab moves through the links, which keep their place right to left", () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <TableOfContents
          items={[
            { id: "a", label: "مقدمة" },
            { id: "b", label: "تثبيت" },
          ]}
        />
      </Arabic>
    ));
    user.tab();
    expect(document.activeElement?.textContent).toBe("مقدمة");
    user.tab();
    expect(document.activeElement?.textContent).toBe("تثبيت");
  });

  test("takes a class per part, and sticks beside the content", () => {
    render(() => (
      <TableOfContents
        sticky
        class="mine"
        items={ITEMS}
        classes={{ root: "r", title: "t", list: "l", nested: "n", item: "i", link: "k" }}
      />
    ));
    const pairs = [
      ["table-of-contents", "r"],
      ["table-of-contents-title", "t"],
      ["table-of-contents-list", "l"],
      ["table-of-contents-nested", "n"],
      ["table-of-contents-item", "i"],
      ["table-of-contents-link", "k"],
    ] as const;
    for (const [name, cls] of pairs) {
      expect(document.querySelector(`[data-slot="${name}"]`)?.classList.contains(cls)).toBe(true);
    }
    const root = document.querySelector('[data-slot="table-of-contents"]');
    expect(root?.classList.contains("mine")).toBe(true);
    expect(wears(root, tableOfContentsStyles({ sticky: true }).root)).toBe(true);
  });

  test("hydrates what the server wrote, with nothing marked", async () => {
    const result = await hydrates(`
      import { TableOfContents } from "<arc>";
      export function Page() {
        return <TableOfContents items={[{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }]} />;
      }
    `);
    expect(result.container.querySelectorAll("a")).toHaveLength(2);
    result.unmount();
  });
});
