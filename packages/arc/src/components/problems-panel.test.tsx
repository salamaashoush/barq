import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal, flush } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";

import type { SourceLocation } from "../lib/source-location.ts";
import { hydrates, settle } from "../test-arc.ts";
import {
  type Problem,
  ProblemsPanel,
  type ProblemSeverity,
  problemCounts,
} from "./problems-panel.tsx";

const PROBLEMS: Problem[] = [
  {
    id: "p1",
    severity: "warning",
    message: "`count` is never read",
    location: { uri: "file:///work/src/main.toy", line: 8, column: 5 },
    source: "toyc",
    code: "W0101",
  },
  {
    id: "p2",
    severity: "error",
    message: "Unknown name `totl`",
    location: { uri: "file:///work/src/main.toy", line: 3, column: 7 },
    source: "toyc",
    code: "E0425",
    related: [
      {
        message: "A similar name, `total`, is declared here",
        location: { uri: "file:///work/src/main.toy", line: 1, column: 5 },
      },
    ],
  },
  {
    id: "p3",
    severity: "info",
    message: "This loop can be a `map`",
    location: { uri: "file:///work/lib/list.toy", line: 12 },
  },
  {
    id: "p4",
    severity: "hint",
    message: "Prefer `let` here",
    location: { uri: "file:///work/lib/list.toy", line: 2, column: 1 },
  },
];

function slots(name: string): HTMLElement[] {
  return [...document.querySelectorAll(`[data-slot="${name}"]`)] as HTMLElement[];
}

function messages(): string[] {
  return slots("problems-panel-message").map((one) => one.textContent ?? "");
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("problemCounts", () => {
  test("counts each severity", () => {
    expect(problemCounts(PROBLEMS)).toEqual({ error: 1, warning: 1, info: 1, hint: 1 });
    expect(problemCounts([])).toEqual({ error: 0, warning: 0, info: 0, hint: 0 });
  });
});

describe("ProblemsPanel", () => {
  test("a tree of documents in order, each one's problems in the order they appear", async () => {
    render(() => <ProblemsPanel problems={PROBLEMS} />);
    await settle();
    const tree = screen.getByRole("treegrid", { name: "Problems" });
    expect(slots("problems-panel-name").map((one) => one.textContent)).toEqual([
      "list.toy",
      "main.toy",
    ]);
    expect(slots("problems-panel-folder").map((one) => one.textContent)).toEqual([
      "work/lib",
      "work/src",
    ]);
    expect(messages()).toEqual([
      "Prefer `let` here",
      "This loop can be a `map`",
      "Unknown name `totl`",
      "A similar name, `total`, is declared here",
      "`count` is never read",
    ]);
    expect(slots("problems-panel-position").map((one) => one.textContent)).toEqual([
      "2:1",
      "12:1",
      "3:7",
      "main.toy:1:5",
      "8:5",
    ]);
    expect(slots("problems-panel-file-count").map((one) => one.textContent)).toEqual([
      "2 problems",
      "2 problems",
    ]);
    const rows = within(tree).getAllByRole("row");
    expect(rows[0]?.getAttribute("aria-level")).toBe("1");
    expect(rows[1]?.getAttribute("aria-level")).toBe("2");
    expect(rows[5]?.getAttribute("aria-level")).toBe("3");
    expect(rows[4]?.textContent).toContain("Error");
    expect(rows[4]?.textContent).toContain("toyc E0425");
    expect(slots("severity-icon")[0]?.getAttribute("aria-hidden")).toBe("true");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("Enter or a press on a problem, or a place related to one, goes there", async () => {
    const went: [SourceLocation, string][] = [];
    render(() => (
      <ProblemsPanel
        problems={PROBLEMS}
        toolbar={false}
        onSelect={(location, problem) => went.push([location, problem.id ?? ""])}
      />
    ));
    await settle();
    user.tab();
    expect(document.activeElement?.textContent).toContain("list.toy");
    await user.keyboard("{ArrowDown}{Enter}");
    flush();
    expect(went).toEqual([[PROBLEMS[3]?.location as SourceLocation, "p4"]]);

    await user.click(screen.getByText("A similar name, `total`, is declared here"));
    flush();
    expect(went.at(-1)).toEqual([{ uri: "file:///work/src/main.toy", line: 1, column: 5 }, "p2"]);
  });

  test("folds a document by the keyboard, by Enter on it, and by a press, and reports it", async () => {
    const folds: string[][] = [];
    render(() => (
      <ProblemsPanel
        problems={PROBLEMS}
        toolbar={false}
        onCollapsedChange={(next) => folds.push(next)}
      />
    ));
    await settle();
    user.tab();
    await user.keyboard("{ArrowLeft}");
    flush();
    expect(folds.at(-1)).toEqual(["file:///work/lib/list.toy"]);
    expect(slots("problems-panel-message")).toHaveLength(3);
    await user.keyboard("{Enter}");
    flush();
    expect(folds.at(-1)).toEqual([]);
    expect(slots("problems-panel-message")).toHaveLength(5);

    await user.click(slots("problems-panel-expand")[0] as HTMLElement);
    flush();
    expect(folds.at(-1)).toEqual(["file:///work/lib/list.toy"]);
  });

  test("filters by severity and by text, says how many match, and clears", async () => {
    const severities: ProblemSeverity[][] = [];
    render(() => (
      <ProblemsPanel problems={PROBLEMS} onSeveritiesChange={(next) => severities.push(next)} />
    ));
    await settle();
    const toggles = slots("problems-panel-severity").map((one) => one.textContent);
    expect(toggles).toEqual(["Error1", "Warning1", "Info1", "Hint1"]);
    await user.click(screen.getByRole("button", { name: "Hint 1" }));
    await user.click(screen.getByRole("button", { name: "Info 1" }));
    flush();
    expect(severities.at(-1)).toEqual(["error", "warning"]);
    expect(slots("problems-panel-name").map((one) => one.textContent)).toEqual(["main.toy"]);

    await user.type(screen.getByRole("searchbox", { name: "Filter problems" }), "e0425");
    flush();
    expect(messages()).toEqual([
      "Unknown name `totl`",
      "A similar name, `total`, is declared here",
    ]);
    expect(slots("problems-panel-status")[0]?.textContent).toBe("1 problem matches");

    await user.type(screen.getByRole("searchbox", { name: "Filter problems" }), "zzz");
    flush();
    expect(screen.getByText("No problems match")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    flush();
    expect(messages()).toHaveLength(5);
  });

  test("controlled: the caller's severities, query and folds, and what changes them", async () => {
    const [query, setQuery] = createSignal("never");
    const [collapsed, setCollapsed] = createSignal<string[]>([]);
    render(() => (
      <ProblemsPanel
        problems={PROBLEMS}
        severities={["warning", "error"]}
        query={query()}
        onQueryChange={setQuery}
        collapsed={collapsed()}
        onCollapsedChange={setCollapsed}
      />
    ));
    await settle();
    expect(messages()).toEqual(["`count` is never read"]);
    setQuery("");
    flush();
    expect(messages()).toHaveLength(3);
    setCollapsed(["file:///work/src/main.toy"]);
    flush();
    expect(messages()).toHaveLength(0);
    expect(slots("problems-panel-name").map((one) => one.textContent)).toEqual(["main.toy"]);
  });

  test("empty, loading and failed", async () => {
    const [state, setState] = createSignal<"loading" | "empty" | "failed">("loading");
    render(() => (
      <ProblemsPanel
        problems={[]}
        isLoading={state() === "loading"}
        errorMessage={state() === "failed" ? "The checker stopped" : undefined}
      />
    ));
    await settle();
    expect(screen.getByRole("region", { name: "Problems" }).getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Checking...")).toBeDefined();
    setState("empty");
    flush();
    expect(screen.getByText("No problems")).toBeDefined();
    expect(slots("problems-panel-severity")).toHaveLength(0);
    setState("failed");
    flush();
    expect(screen.getByRole("alert").textContent).toBe("The checker stopped");
  });

  test("a long message wraps, and a right-to-left page indents on the start edge", async () => {
    render(() => (
      <Arabic>
        <ProblemsPanel
          problems={[
            {
              severity: "error",
              message: "اسم غير معروف ".repeat(40),
              location: { uri: "src/رئيسي.toy", line: 1 },
            },
          ]}
        />
      </Arabic>
    ));
    await settle();
    expect(slots("problems-panel-name")[0]?.textContent).toBe("رئيسي.toy");
    expect(slots("problems-panel-message")[0]?.getAttribute("dir")).toBe("auto");
    expect(slots("problems-panel-position")[0]?.getAttribute("dir")).toBe("ltr");
    const css = collectCss();
    expect(css).toContain("overflow-wrap:anywhere");
    expect(css).toContain("padding-inline-start:");
  });

  test("a class per part", async () => {
    render(() => (
      <ProblemsPanel problems={PROBLEMS} class="mine" classes={{ root: "r", message: "m" }} />
    ));
    await settle();
    expect(slots("problems-panel")[0]?.classList.contains("mine")).toBe(true);
    expect(slots("problems-panel")[0]?.classList.contains("r")).toBe(true);
    expect(slots("problems-panel-message")[0]?.classList.contains("m")).toBe(true);
  });
});

describe("a problems panel hydrates", () => {
  test("what the server wrote", async () => {
    const result = await hydrates(`
      import { ProblemsPanel } from "<arc>";
      export function Page() {
        return (
          <ProblemsPanel
            problems={[
              { severity: "error", message: "Unknown name", location: { uri: "src/main.toy", line: 3, column: 7 }, related: [{ message: "declared here", location: { uri: "src/main.toy", line: 1 } }] },
              { severity: "warning", message: "Unused", location: { uri: "lib/list.toy", line: 2 } },
            ]}
          />
        );
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="problems-panel-message"]')).toHaveLength(
      3,
    );
    result.unmount();
  });
});
