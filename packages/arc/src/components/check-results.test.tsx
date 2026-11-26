import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal, flush } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { Sparkles } from "@barqjs/lucide/icons/sparkles";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";

import type { SourceLocation } from "../lib/source-location.ts";
import { hydrates, settle } from "../test-arc.ts";
import { type CheckResult, CheckResults, counterexampleText } from "./check-results.tsx";

const CHECKS: CheckResult[] = [
  {
    id: "len",
    name: "sort keeps the length",
    verdict: "proved",
    location: { uri: "src/sort.toy", line: 4, column: 1 },
    duration: 120,
  },
  {
    id: "stable",
    name: "sort is stable",
    verdict: "falsified",
    location: { uri: "src/sort.toy", line: 9 },
    counterexample: { xs: [2, 1, 2], key: "first", limit: null },
  },
  {
    id: "term",
    name: "merge terminates",
    verdict: "timeout",
    message: "Gave up after 10 s",
  },
  {
    id: "idem",
    name: "sort twice is sort once",
    verdict: "unknown",
    message: "Needs an inductive hint",
  },
  { id: "parse", name: "parser round-trips", verdict: "error", message: "Unsupported recursion" },
  { id: "vac", name: "empty input is sorted", verdict: "vacuous" },
];

function slots(name: string): HTMLElement[] {
  return [...document.querySelectorAll(`[data-slot="${name}"]`)] as HTMLElement[];
}

function shownNames(): string[] {
  return slots("check-results-name").map((one) => one.textContent ?? "");
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("counterexampleText", () => {
  test("writes strings quoted and the rest as JSON", () => {
    expect(counterexampleText("a")).toBe('"a"');
    expect(counterexampleText(3)).toBe("3");
    expect(counterexampleText(null)).toBe("null");
    expect(counterexampleText(undefined)).toBe("undefined");
    expect(counterexampleText(Number.NaN)).toBe("NaN");
    expect(counterexampleText(10n)).toBe("10n");
    expect(counterexampleText([1, 2])).toBe("[\n  1,\n  2\n]");
  });
});

describe("CheckResults", () => {
  test("each check with its verdict in words, its place, and a counterexample's values", async () => {
    render(() => <CheckResults checks={CHECKS} />);
    await settle();
    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(6);
    expect(slots("check-results-verdict").map((one) => one.textContent)).toEqual([
      "Proved",
      "Falsified",
      "Timed out",
      "Unknown",
      "Error",
      "vacuous",
    ]);
    expect(slots("check-results-location")[0]?.textContent).toBe("sort.toy:4:1 · 120ms");
    expect(slots("check-results-name")[0]?.tagName).toBe("SPAN");
    expect(screen.getAllByRole("term").map((one) => one.textContent)).toEqual([
      "xs",
      "key",
      "limit",
    ]);
    const values = slots("check-results-counterexample")[0] as HTMLElement;
    expect(within(values).getByText("Counterexample")).toBeDefined();
    expect(values.querySelector("dl")?.getAttribute("aria-label")).toBe(
      "Counterexample to sort is stable",
    );
    expect([...values.querySelectorAll("dd")].map((one) => one.textContent)).toEqual([
      "[\n  2,\n  1,\n  2\n]",
      '"first"',
      "null",
    ]);
    expect(slots("check-results-message").map((one) => one.textContent)).toEqual([
      "Gave up after 10 s",
      "Needs an inductive hint",
      "Unsupported recursion",
    ]);
    expect(items[1]?.getAttribute("data-verdict")).toBe("falsified");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a name with a place goes there when pressed or entered", async () => {
    const went: [SourceLocation, string][] = [];
    render(() => (
      <CheckResults
        checks={CHECKS}
        toolbar={false}
        onSelect={(location, check) => went.push([location, check.id])}
      />
    ));
    await settle();
    await user.click(screen.getByRole("button", { name: "sort keeps the length" }));
    user.tab();
    expect(document.activeElement?.textContent).toBe("sort is stable");
    await user.keyboard("{Enter}");
    expect(went).toEqual([
      [{ uri: "src/sort.toy", line: 4, column: 1 }, "len"],
      [{ uri: "src/sort.toy", line: 9 }, "stable"],
    ]);
    expect(slots("check-results-name")[2]?.tagName).toBe("SPAN");
  });

  test("counts and filters by verdict, the caller's own included, and searches by name", async () => {
    const shown: string[][] = [];
    render(() => (
      <CheckResults
        checks={CHECKS}
        verdicts={{ vacuous: { label: "Vacuous", tone: "info", icon: Sparkles } }}
        onShownVerdictsChange={(next) => shown.push(next)}
      />
    ));
    await settle();
    expect(slots("check-results-filter").map((one) => one.textContent)).toEqual([
      "Falsified1",
      "Error1",
      "Timed out1",
      "Unknown1",
      "Proved1",
      "Vacuous1",
    ]);
    await user.click(screen.getByRole("button", { name: "Proved 1" }));
    flush();
    expect(shown.at(-1)).toEqual(["falsified", "error", "timeout", "unknown", "vacuous"]);
    expect(shownNames()).not.toContain("sort keeps the length");

    await user.type(screen.getByRole("searchbox", { name: "Filter checks" }), "SORT");
    flush();
    expect(shownNames()).toEqual([
      "sort is stable",
      "sort twice is sort once",
      "empty input is sorted",
    ]);
    expect(slots("check-results-status")[0]?.textContent).toBe("3 checks match");
    await user.type(screen.getByRole("searchbox", { name: "Filter checks" }), "zzz");
    flush();
    expect(screen.getByText("No checks match")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    flush();
    expect(shownNames()).toHaveLength(6);
  });

  test("controlled verdicts and query", async () => {
    const [query, setQuery] = createSignal("");
    render(() => (
      <CheckResults
        checks={CHECKS}
        shownVerdicts={["falsified", "proved"]}
        query={query()}
        onQueryChange={setQuery}
      />
    ));
    await settle();
    expect(shownNames()).toEqual(["sort keeps the length", "sort is stable"]);
    setQuery("stable");
    flush();
    expect(shownNames()).toEqual(["sort is stable"]);
  });

  test("checking, failed, and no checks", async () => {
    const [state, setState] = createSignal<"loading" | "empty" | "failed">("loading");
    render(() => (
      <CheckResults
        checks={[]}
        isLoading={state() === "loading"}
        errorMessage={state() === "failed" ? "The solver is missing" : undefined}
      />
    ));
    await settle();
    expect(screen.getByText("Checking...")).toBeDefined();
    setState("empty");
    flush();
    expect(screen.getByText("No checks yet")).toBeDefined();
    setState("failed");
    flush();
    expect(screen.getByRole("alert").textContent).toBe("The solver is missing");
  });

  test("right to left, values still left to right", async () => {
    render(() => (
      <Arabic>
        <CheckResults
          checks={[
            { id: "a", name: "الترتيب مستقر", verdict: "falsified", counterexample: { xs: [1] } },
          ]}
        />
      </Arabic>
    ));
    await settle();
    expect(slots("check-results-name")[0]?.getAttribute("dir")).toBe("auto");
    expect(document.querySelector("dd pre")?.getAttribute("dir")).toBe("ltr");
  });
});

describe("check results hydrate", () => {
  test("what the server wrote", async () => {
    const result = await hydrates(`
      import { CheckResults } from "<arc>";
      export function Page() {
        return (
          <CheckResults
            checks={[
              { id: "a", name: "keeps length", verdict: "proved", location: { uri: "sort.toy", line: 4 } },
              { id: "b", name: "is stable", verdict: "falsified", counterexample: { xs: [2, 1] } },
            ]}
            onSelect={() => {}}
          />
        );
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="check-results-check"]')).toHaveLength(2);
    result.unmount();
  });
});
