import { describe, expect, test } from "bun:test";
import { createSignal, type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { type SearchResultGroup, type SearchResultKind, SearchResults } from "./search-results.tsx";

const KINDS: SearchResultKind[] = [
  { id: "students", label: "Students", icon: <svg data-icon="students" /> },
  { id: "classes", label: "Classes" },
  { id: "messages", label: "Messages" },
];

function people(count: number) {
  return Array.from({ length: count }, (_, at) => ({
    id: `s${String(at)}`,
    title: `Salma Hassan ${String(at + 1)}`,
    description: "Year 4",
    href: `/students/s${String(at)}`,
  }));
}

const GROUPS: SearchResultGroup[] = [
  {
    kind: "classes",
    results: [{ id: "c1", title: "Arabic for Salma's year", snippet: "Taught by Salma" }],
  },
  { kind: "students", results: people(7), total: 12 },
  { kind: "messages", results: [] },
];

function sections(): string[] {
  return [...document.querySelectorAll('[data-slot="search-results-heading"]')].map(
    (one) => one.firstChild?.textContent ?? "",
  );
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("SearchResults", () => {
  test("All lists each kind found, in the kinds' order, the first few each with Show all", async () => {
    render(() => <SearchResults query="salma" kinds={KINDS} groups={GROUPS} />);
    await settle();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((one) => one.textContent)).toEqual([
      "All",
      "Students12",
      "Classes1",
      "Messages",
    ]);
    expect(sections()).toEqual(["Students", "Classes"]);
    const students = screen.getByRole("region", { name: /^Students/ });
    expect(within(students).getAllByRole("link")).toHaveLength(5);
    expect(within(students).getAllByRole("link")[0]?.getAttribute("href")).toBe("/students/s0");
    expect(students.querySelector('[data-icon="students"]')).not.toBeNull();
    expect(students.querySelector('[data-slot="search-results-count"]')?.textContent).toBe(
      "12 results",
    );
    expect(within(students).getByRole("button", { name: "Show all 12 students" })).toBeDefined();
    expect(screen.queryByRole("button", { name: /Show all 1 classes/ })).toBeNull();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the query's words are marked in titles and snippets", async () => {
    render(() => <SearchResults query="salma" kinds={KINDS} groups={GROUPS} />);
    await settle();
    const marks = [...document.querySelectorAll("mark")].map((one) => one.textContent);
    expect(marks).toContain("Salma");
    const classes = screen.getByRole("region", { name: /^Classes/ });
    expect(classes.querySelector('[data-slot="search-results-snippet"] mark')?.textContent).toBe(
      "Salma",
    );
  });

  test("Show all opens that kind's tab, all of it with Show more", async () => {
    const kinds: string[] = [];
    let more = "";
    render(() => (
      <SearchResults
        query="salma"
        kinds={KINDS}
        groups={GROUPS.map((group) =>
          group.kind === "students" ? { ...group, hasMore: true } : group,
        )}
        onKindChange={(kind) => kinds.push(kind)}
        onLoadMore={(kind) => {
          more = kind;
        }}
      />
    ));
    await settle();
    user.click(screen.getByRole("button", { name: "Show all 12 students" }));
    await settle();
    expect(kinds).toEqual(["students"]);
    expect(screen.getByRole("tab", { name: /Students/ }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(sections()).toEqual(["Students"]);
    expect(screen.getAllByRole("link")).toHaveLength(7);
    user.click(screen.getByRole("button", { name: "Show more" }));
    expect(more).toBe("students");
  });

  test("a result with no address calls onOpen", async () => {
    const opened: string[] = [];
    render(() => (
      <SearchResults
        query="arabic"
        kinds={KINDS}
        groups={GROUPS.slice(0, 1)}
        onOpen={(result, kind) => opened.push(`${kind}:${result.id}`)}
      />
    ));
    await settle();
    user.click(document.querySelector('[data-slot="search-results-result"]') as HTMLElement);
    await settle();
    expect(opened).toEqual(["classes:c1"]);
  });

  test("searching, failed, nothing found, and nothing typed", async () => {
    const [status, setStatus] = createSignal<"loading" | "error" | "done">("loading");
    const [query, setQuery] = createSignal("zz");
    let retried = 0;
    render(() => (
      <SearchResults
        query={query()}
        kinds={KINDS}
        groups={[]}
        status={status()}
        onRetry={() => retried++}
        idle={<p>Type to search.</p>}
      />
    ));
    await settle();
    expect(screen.getByRole("status").textContent).toBe("Searching…");
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    setStatus("error");
    await settle();
    expect(screen.getByRole("alert").textContent).toContain("The search did not work.");
    user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retried).toBe(1);
    setStatus("done");
    await settle();
    expect(document.body.textContent).toContain("Nothing matches “zz”.");
    setQuery(" ");
    await settle();
    expect(document.querySelector('[data-slot="search-results-idle"]')?.textContent).toBe(
      "Type to search.",
    );
  });

  test("right to left, counts in the locale's digits", async () => {
    render(() => (
      <Arabic>
        <SearchResults query="سلمى" kinds={KINDS} groups={GROUPS} />
      </Arabic>
    ));
    await settle();
    expect(screen.getAllByRole("tab")[1]?.textContent).toContain("١٢");
  });
});

describe("search results hydrate", () => {
  test("what the server wrote", async () => {
    const result = await hydrates(`
      import { SearchResults } from "<arc>";
      export function Page() {
        return (
          <SearchResults
            query="salma"
            kinds={[{ id: "students", label: "Students" }, { id: "classes", label: "Classes" }]}
            groups={[
              { kind: "students", results: [{ id: "s1", title: "Salma Hassan", href: "/students/s1" }] },
              { kind: "classes", results: [{ id: "c1", title: "Arabic", snippet: "Taught by Salma" }] },
            ]}
          />
        );
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="search-results-result"]')).toHaveLength(
      2,
    );
    result.unmount();
  });
});
