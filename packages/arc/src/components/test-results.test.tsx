import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal, flush } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";

import type { SourceLocation } from "../lib/source-location.ts";
import { hydrates, settle } from "../test-arc.ts";
import {
  type TestNode,
  TestResults,
  type TestStatus,
  testCounts,
  testDurationText,
  testStatus,
} from "./test-results.tsx";

const TESTS: TestNode[] = [
  {
    id: "math",
    name: "math",
    location: { uri: "tests/math.toy", line: 1 },
    children: [
      { id: "add", name: "adds two numbers", status: "passed", duration: 3 },
      {
        id: "div",
        name: "divides by a whole number",
        status: "failed",
        duration: 12,
        location: { uri: "tests/math.toy", line: 9 },
        failure: {
          message: "expected 5, received 4",
          expected: '{\n  "quotient": 5\n}',
          actual: '{\n  "quotient": 4\n}',
          language: "json",
          location: { uri: "tests/math.toy", line: 11, column: 3 },
          trace: "at divides (tests/math.toy:11:3)",
        },
      },
      { id: "pow", name: "raises to a power", status: "skipped" },
    ],
  },
  {
    id: "text",
    name: "text",
    children: [
      { id: "upper", name: "upper-cases", status: "running" },
      { id: "trim", name: "trims both ends" },
    ],
  },
];

function slots(name: string): HTMLElement[] {
  return [...document.querySelectorAll(`[data-slot="${name}"]`)] as HTMLElement[];
}

function names(): string[] {
  return slots("test-results-name").map((one) => one.textContent ?? "");
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("the counts and statuses", () => {
  test("count tests, not suites, and a suite takes its tests' status", () => {
    expect(testCounts(TESTS)).toEqual({ passed: 1, failed: 1, skipped: 1, running: 1, queued: 1 });
    expect(testStatus(TESTS[0] as TestNode)).toBe("failed");
    expect(testStatus(TESTS[1] as TestNode)).toBe("running");
    expect(
      testStatus({ id: "s", name: "s", children: [{ id: "a", name: "a", status: "skipped" }] }),
    ).toBe("skipped");
    expect(testStatus({ id: "s", name: "s", status: "passed", children: [] })).toBe("passed");
  });

  test("a duration is milliseconds under a second and seconds above", () => {
    expect(testDurationText(12, "en")).toBe("12ms");
    expect(testDurationText(1240, "en")).toBe("1.24s");
  });
});

describe("TestResults", () => {
  test("a tree of suites and tests, each with its status in words and its time", async () => {
    render(() => <TestResults tests={TESTS} />);
    await settle();
    const tree = screen.getByRole("treegrid", { name: "Test results" });
    expect(names()).toEqual([
      "math",
      "adds two numbers",
      "divides by a whole number",
      "raises to a power",
      "text",
      "upper-cases",
      "trims both ends",
    ]);
    const rows = within(tree).getAllByRole("row");
    expect(rows[0]?.getAttribute("aria-level")).toBe("1");
    expect(rows[2]?.getAttribute("aria-level")).toBe("2");
    expect(rows[0]?.textContent).toContain("Failed");
    expect(rows[2]?.textContent).toContain("12ms");
    expect(rows[5]?.textContent).toContain("Running");
    expect(rows[6]?.textContent).toContain("Queued");
    expect(slots("test-results-total")[0]?.textContent).toBe("Took 15ms");
    expect(screen.getByText("Choose a test to see its result.")).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the arrows choose a test and show its failure; Enter goes to it", async () => {
    const went: [SourceLocation, string][] = [];
    const chosen: (string | null)[] = [];
    render(() => (
      <TestResults
        tests={TESTS}
        onSelect={(location, node) => went.push([location, node.id])}
        onSelectedChange={(id) => chosen.push(id)}
      />
    ));
    await settle();
    screen.getByRole("treegrid").focus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    flush();
    expect(chosen.at(-1)).toBe("div");
    const detail = screen.getByRole("region", { name: "divides by a whole number" });
    expect(within(detail).getByText("expected 5, received 4")).toBeDefined();
    expect(detail.textContent).toContain("Failed · 12ms · math.toy:11:3");
    expect(slots("test-results-trace")[0]?.textContent).toBe("at divides (tests/math.toy:11:3)");
    await waitFor(() => expect(slots("test-results-diff")).toHaveLength(1));
    expect(slots("test-results-sides")).toHaveLength(0);

    await user.keyboard("{Enter}");
    flush();
    expect(went).toEqual([[{ uri: "tests/math.toy", line: 11, column: 3 }, "div"]]);
    await user.click(screen.getByRole("button", { name: "Go to source" }));
    expect(went).toHaveLength(2);

    await user.click(screen.getByText("adds two numbers"));
    flush();
    expect(screen.getByRole("region", { name: "adds two numbers" }).textContent).toContain(
      "Passed · 3ms",
    );
  });

  test("runs one test, all of them, or the failed ones, and stops", async () => {
    const ran: string[] = [];
    const [running, setRunning] = createSignal(false);
    let stopped = 0;
    render(() => (
      <TestResults
        tests={TESTS}
        running={running()}
        onRun={(id) => ran.push(id)}
        onRunAll={() => ran.push("all")}
        onRerunFailed={(ids) => ran.push(`failed:${ids.join(",")}`)}
        onStop={() => stopped++}
      />
    ));
    await settle();
    await user.click(screen.getByRole("button", { name: "Rerun divides by a whole number" }));
    await user.click(screen.getByRole("button", { name: "Run trims both ends" }));
    await user.click(screen.getByRole("button", { name: "Run all" }));
    await user.click(screen.getByRole("button", { name: "Rerun failed" }));
    flush();
    expect(ran).toEqual(["div", "trim", "all", "failed:div"]);
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();

    setRunning(true);
    flush();
    expect(screen.getByRole("button", { name: "Run all" }).hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByRole("button", { name: "Run trims both ends" }).hasAttribute("disabled"),
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(stopped).toBe(1);
  });

  test("filters by status, keeping the suites of what is shown", async () => {
    const statuses: TestStatus[][] = [];
    render(() => <TestResults tests={TESTS} onStatusesChange={(next) => statuses.push(next)} />);
    await settle();
    expect(slots("test-results-filter").map((one) => one.textContent)).toEqual([
      "Failed1",
      "Passed1",
      "Skipped1",
      "Running1",
      "Queued1",
    ]);
    for (const name of ["Passed 1", "Skipped 1", "Running 1", "Queued 1"]) {
      await user.click(screen.getByRole("button", { name }));
    }
    flush();
    expect(statuses.at(-1)).toEqual(["failed"]);
    expect(names()).toEqual(["math", "divides by a whole number"]);
    await user.click(screen.getByRole("button", { name: "Failed 1" }));
    flush();
    expect(screen.getByText("No tests match")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    flush();
    expect(names()).toHaveLength(7);
  });

  test("controlled: the caller's choice of test and statuses", async () => {
    const [selected, setSelected] = createSignal<string | null>("pow");
    render(() => (
      <TestResults
        tests={TESTS}
        statuses={["skipped", "passed"]}
        selected={selected()}
        onSelectedChange={setSelected}
      />
    ));
    await settle();
    expect(names()).toEqual(["math", "adds two numbers", "raises to a power"]);
    expect(screen.getByRole("region", { name: "raises to a power" }).textContent).toContain(
      "Skipped",
    );
    setSelected("add");
    flush();
    expect(screen.getByRole("region", { name: "adds two numbers" })).toBeDefined();
  });

  test("finding, failed, and no tests", async () => {
    const [state, setState] = createSignal<"loading" | "empty" | "failed">("loading");
    render(() => (
      <TestResults
        tests={[]}
        isLoading={state() === "loading"}
        errorMessage={state() === "failed" ? "The runner crashed" : undefined}
      />
    ));
    await settle();
    expect(screen.getByText("Finding tests...")).toBeDefined();
    setState("empty");
    flush();
    expect(screen.getByText("No tests yet")).toBeDefined();
    setState("failed");
    flush();
    expect(screen.getByRole("alert").textContent).toBe("The runner crashed");
  });

  test("a long name and a right-to-left page", async () => {
    render(() => (
      <Arabic>
        <TestResults
          tests={[{ id: "a", name: "يجمع عددين ".repeat(30), status: "passed", duration: 1500 }]}
        />
      </Arabic>
    ));
    await settle();
    expect(slots("test-results-name")[0]?.getAttribute("dir")).toBe("auto");
    expect(slots("test-results-duration")[0]?.textContent).toContain("١٫٥");
  });
});

describe("test results hydrate", () => {
  test("what the server wrote, a failure shown as text until its diff loads", async () => {
    const result = await hydrates(`
      import { TestResults } from "<arc>";
      export function Page() {
        return (
          <TestResults
            defaultSelected="b"
            tests={[{ id: "s", name: "suite", children: [
              { id: "a", name: "passes", status: "passed", duration: 2 },
              { id: "b", name: "fails", status: "failed", failure: { message: "no", expected: "1", actual: "2" } },
            ] }]}
          />
        );
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="test-results-name"]')).toHaveLength(3);
    expect(result.container.querySelectorAll('[data-slot="test-results-sides"]')).toHaveLength(1);
    result.unmount();
  });
});
