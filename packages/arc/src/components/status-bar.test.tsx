import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal, flush } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, settle, wears } from "../test-arc.ts";
import { StatusBar, StatusBarItem, type StatusTask, statusBarStyles } from "./status-bar.tsx";

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("StatusBar", () => {
  test("problems, tasks, the cursor and the language, with the caller's items at each end", async () => {
    render(() => (
      <StatusBar
        start={<StatusBarItem>main</StatusBarItem>}
        end={<StatusBarItem priority="low">UTF-8</StatusBarItem>}
        problems={{ error: 2, warning: 1, info: 4 }}
        tasks={[
          { id: "index", label: "Indexing" },
          { id: "build", label: "Building", progress: 0.4 },
        ]}
        cursor={{ line: 12, column: 5, selected: 3 }}
        language="Toy"
      />
    ));
    await settle();
    const bar = screen.getByRole("group", { name: "Status bar" });
    expect(
      bar.querySelector('[data-slot="status-bar-start"]')?.firstElementChild?.textContent,
    ).toBe("main");
    expect(screen.getByRole("group", { name: "2 errors, 1 warning" }).textContent).toBe("21");
    expect(screen.getByRole("status", { name: "Indexing" })).toBeDefined();
    const progress = screen.getByRole("progressbar", { name: "Building" });
    expect(progress.getAttribute("aria-valuenow")).toBe("40");
    expect(bar.textContent).toContain("40%");
    expect(slot("status-bar-cursor").textContent).toBe("Ln 12, Col 5 (3 selected)");
    expect(slot("status-bar-language").tagName).toBe("SPAN");
    expect(slot("status-bar-language").textContent).toBe("Toy");
    expect(slot("status-bar-end").lastElementChild?.textContent).toBe("UTF-8");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the counts and the language are buttons when they lead somewhere", async () => {
    const opened: string[] = [];
    render(() => (
      <StatusBar
        problems={{ error: 1, warning: 0 }}
        onProblemsClick={() => opened.push("problems")}
        language="Toy"
        onLanguageClick={() => opened.push("language")}
      />
    ));
    await settle();
    await user.click(screen.getByRole("button", { name: "1 error, 0 warnings. Show problems" }));
    user.tab();
    expect(document.activeElement?.getAttribute("data-slot")).toBe("status-bar-language");
    await user.keyboard("{Enter}");
    expect(opened).toEqual(["problems", "language"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("tasks come and go, and progress moves", async () => {
    const [tasks, setTasks] = createSignal<StatusTask[]>([]);
    render(() => <StatusBar tasks={tasks()} />);
    await settle();
    expect(document.querySelectorAll('[data-slot="status-bar-task"]')).toHaveLength(0);
    setTasks([{ id: "build", label: "Building", progress: 0.1 }]);
    flush();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("10");
    setTasks([{ id: "build", label: "Building", progress: 1.4 }]);
    flush();
    expect(slot("status-bar-task").textContent).toContain("100%");
    setTasks([]);
    flush();
    expect(document.querySelectorAll('[data-slot="status-bar-task"]')).toHaveLength(0);
  });

  test("on a narrow bar the low items and the task words step aside, by container query", () => {
    render(() => (
      <StatusBar cursor={{ line: 1, column: 1 }} tasks={[{ id: "t", label: "Saving" }]} />
    ));
    const styles = statusBarStyles();
    expect(wears(slot("status-bar-cursor"), styles.low)).toBe(true);
    expect(wears(slot("status-bar-task-label"), styles.label)).toBe(true);
    expect(slot("status-bar-task-label").getAttribute("aria-hidden")).toBe("true");
    expect(wears(slot("status-bar"), styles.root)).toBe(true);
    expect(collectCss()).toContain("@container (width >= 32rem)");
  });

  test("right to left, in the locale's digits", async () => {
    render(() => (
      <Arabic>
        <StatusBar tasks={[{ id: "b", label: "يبني", progress: 0.5 }]} language="توي" />
      </Arabic>
    ));
    await settle();
    expect(slot("status-bar-task").textContent).toContain("٥٠");
    expect(slot("status-bar-language").textContent).toBe("توي");
  });
});

describe("a status bar hydrates", () => {
  test("what the server wrote", async () => {
    const result = await hydrates(`
      import { StatusBar } from "<arc>";
      export function Page() {
        return (
          <StatusBar
            problems={{ error: 1, warning: 2 }}
            onProblemsClick={() => {}}
            tasks={[{ id: "a", label: "Indexing" }, { id: "b", label: "Building", progress: 0.5 }]}
            cursor={{ line: 3, column: 9 }}
            language="Toy"
          />
        );
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="status-bar-task"]')).toHaveLength(2);
    result.unmount();
  });
});
