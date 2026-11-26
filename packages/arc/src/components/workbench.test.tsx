import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen } from "@barqjs/testing";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@barqjs/ui/resizable";

import { edge } from "../style/index.ts";
import { hydrates, settle, wears } from "../test-arc.ts";
import { consoleLogStyles, ConsoleLogView } from "./console-log.tsx";
import { emptyStateVariants } from "./empty-state.tsx";
import { StatusBar } from "./status-bar.tsx";
import { Workbench, workbenchStyles } from "./workbench.tsx";

function slot(name: string): HTMLElement | null {
  return document.querySelector(`[data-slot="${name}"]`);
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("Workbench", () => {
  test("a header, the page's main and a footer, filling the screen", async () => {
    render(() => (
      <Workbench bar={<h1>Playground</h1>} status={<StatusBar language="Toy" />}>
        <p>Editor</p>
      </Workbench>
    ));
    expect(screen.getByRole("banner").textContent).toBe("Playground");
    expect(screen.getByRole("main").textContent).toBe("Editor");
    expect(screen.getByRole("contentinfo").textContent).toContain("Toy");
    expect(slot("workbench")?.getAttribute("data-fill")).toBe("viewport");
    expect(wears(slot("workbench"), workbenchStyles({ fill: "viewport" }).root)).toBe(true);
    const css = collectCss();
    expect(css).toContain("height:100dvh");
    expect(css).toContain("grid-template-rows:auto minmax(0, 1fr) auto");
    expect(css).toContain("min-height:0px");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("embedded, it fills its parent and is not the page's main", async () => {
    render(() => (
      <main>
        <div style={{ height: "30rem" }}>
          <Workbench fill="parent" aria-label="Playground">
            <p>Editor</p>
          </Workbench>
        </div>
      </main>
    ));
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Playground" }).textContent).toBe("Editor");
    expect(wears(slot("workbench"), workbenchStyles({ fill: "parent" }).root)).toBe(true);
    expect(collectCss()).toContain("height:100%");
    expect(slot("workbench-bar")).toBeNull();
    expect(slot("workbench-status")).toBeNull();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("landmark can be asked for, or turned off, whatever it fills", () => {
    render(() => (
      <Workbench fill="parent" landmark>
        <p>Editor</p>
      </Workbench>
    ));
    expect(slot("workbench-main")?.tagName).toBe("MAIN");
  });

  test("right to left, and a class per part", () => {
    render(() => (
      <Arabic>
        <Workbench
          bar={<span>شريط</span>}
          class="mine"
          classes={{ bar: "b", main: "m", status: "s" }}
          status={<span>حالة</span>}
          landmark={false}
        >
          <p>محرر</p>
        </Workbench>
      </Arabic>
    ));
    expect(slot("workbench")?.classList.contains("mine")).toBe(true);
    expect(slot("workbench-bar")?.classList.contains("b")).toBe(true);
    expect(slot("workbench-main")?.tagName).toBe("DIV");
    expect(slot("workbench-main")?.classList.contains("m")).toBe(true);
    expect(slot("workbench-status")?.classList.contains("s")).toBe(true);
  });
});

describe("a console log in a workbench's panel", () => {
  test("height 100% sizes the whole log from its panel, the lines taking what the toolbar leaves", async () => {
    render(() => (
      <div style={{ height: "30rem" }}>
        <Workbench fill="parent">
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel id="top" defaultSize={50}>
              <p>Editor</p>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="log" defaultSize={50}>
              <ConsoleLogView entries={[{ text: "ready" }]} height="100%" aria-label="Output" />
            </ResizablePanel>
          </ResizablePanelGroup>
        </Workbench>
      </div>
    ));
    await settle();
    const sized = consoleLogStyles({ sized: true });
    const log = slot("console-log") as HTMLElement;
    expect(log.style.getPropertyValue("--log-height")).toBe("100%");
    expect(wears(log, sized.root)).toBe(true);
    expect(wears(slot("console-log-viewport"), sized.viewport)).toBe(true);
    expect(wears(slot("console-log-viewport"), consoleLogStyles({ sized: false }).viewport)).toBe(
      false,
    );
    expect(wears(slot("console-log-viewport")?.parentElement, sized.frame)).toBe(true);
    expect(wears(slot("workbench-main"), workbenchStyles().main)).toBe(true);
    const css = collectCss();
    expect(css).toContain("height:var(--log-height)");
    expect(css).toContain("flex-basis:0px");
  });

  test("with no height the lines keep their 24rem, and an empty log is a quiet empty state", async () => {
    render(() => <ConsoleLogView entries={[]} aria-label="Output" />);
    await settle();
    expect(wears(slot("console-log"), consoleLogStyles({ sized: true }).root)).toBe(false);
    const empty = slot("empty-state");
    expect(empty?.getAttribute("data-variant")).toBe("plain");
    expect(wears(empty, emptyStateVariants({ variant: "plain" }).root)).toBe(true);
    expect(wears(empty, edge.none)).toBe(true);
    expect(collectCss()).toContain("height:24rem");
  });
});

describe("a workbench hydrates", () => {
  test("what the server wrote", async () => {
    const result = await hydrates(`
      import { StatusBar, Workbench } from "<arc>";
      export function Page() {
        return (
          <Workbench bar={<strong>Playground</strong>} status={<StatusBar language="Toy" cursor={{ line: 1, column: 1 }} />}>
            <pre>print 1</pre>
          </Workbench>
        );
      }
    `);
    expect(result.container.querySelector("main")?.textContent).toBe("print 1");
    result.unmount();
  });
});
