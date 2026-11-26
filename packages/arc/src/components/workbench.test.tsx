import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen } from "@barqjs/testing";

import { hydrates, wears } from "../test-arc.ts";
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
