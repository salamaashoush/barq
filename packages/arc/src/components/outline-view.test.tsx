import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, within } from "@barqjs/testing";

import { hydrates, wears } from "../test-arc.ts";
import { type OutlineNode, OutlineView, outlineViewStyles } from "./outline-view.tsx";

const PROGRAM: OutlineNode[] = [
  {
    id: "1",
    label: "repeat 3 times",
    tone: "info",
    children: [
      { id: "2", label: "move forward" },
      { id: "3", label: "if wall ahead", children: [{ id: "4", label: "turn left" }] },
    ],
  },
  { id: "5", label: "pick up the star", icon: <svg data-icon="star" /> },
];

function all(name: string): HTMLElement[] {
  return [...document.querySelectorAll(`[data-slot="${name}"]`)] as HTMLElement[];
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("OutlineView", () => {
  test("nested ordered lists, each set of lines inside the line it belongs to", async () => {
    render(() => <OutlineView aria-label="Program" nodes={PROGRAM} />);
    const outline = screen.getByRole("list", { name: "Program" });
    expect(outline.tagName).toBe("OL");
    const top = within(outline)
      .getAllByRole("listitem")
      .filter((one) => one.parentElement === outline);
    expect(top).toHaveLength(2);
    const inner = top[0]?.querySelector("ol") as HTMLElement;
    expect(inner.getAttribute("data-slot")).toBe("outline-view-children");
    expect(all("outline-view-item").map((one) => one.getAttribute("data-depth"))).toEqual([
      "0",
      "1",
      "1",
      "2",
      "0",
    ]);
    expect(all("outline-view-line").map((one) => one.textContent)).toEqual([
      "repeat 3 times",
      "move forward",
      "if wall ahead",
      "turn left",
      "pick up the star",
    ]);
    expect(all("outline-view-line")[0]?.getAttribute("data-tone")).toBe("info");
    expect(all("outline-view-icon")[0]?.getAttribute("aria-hidden")).toBe("true");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("pills, guides and an unordered list", () => {
    render(() => <OutlineView nodes={PROGRAM} look="pills" guides ordered={false} />);
    expect(all("outline-view")[0]?.tagName).toBe("UL");
    expect(wears(all("outline-view-line")[1], outlineViewStyles({ look: "pills" }).line)).toBe(
      true,
    );
    expect(
      wears(all("outline-view-children")[0], outlineViewStyles({ guides: true }).children),
    ).toBe(true);
  });

  test("inline, the top lines in a row joined by a hidden arrow", async () => {
    render(() => (
      <OutlineView
        aria-label="Moves"
        flow="inline"
        look="pills"
        nodes={[
          { id: "a", label: "up" },
          { id: "b", label: "up" },
          { id: "c", label: "right" },
        ]}
      />
    ));
    const separators = all("outline-view-separator");
    expect(separators).toHaveLength(2);
    expect(separators.every((one) => one.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(screen.getByRole("list", { name: "Moves" }).textContent).toBe("upupright");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("indents on the start edge and turns its arrow right to left", () => {
    render(() => (
      <Arabic>
        <OutlineView nodes={[{ id: "1", label: "كرر", children: [{ id: "2", label: "تقدم" }] }]} />
      </Arabic>
    ));
    expect(all("outline-view-line")[1]?.textContent).toBe("تقدم");
    const css = collectCss();
    expect(css).toContain("padding-inline-start:");
    expect(css).toContain(":dir(rtl)");
  });

  test("a class per part", () => {
    render(() => (
      <OutlineView
        nodes={PROGRAM}
        class="mine"
        classes={{ root: "r", item: "i", line: "l", icon: "c", children: "ch" }}
      />
    ));
    expect(all("outline-view")[0]?.classList.contains("mine")).toBe(true);
    expect(all("outline-view")[0]?.classList.contains("r")).toBe(true);
    expect(all("outline-view-item")[0]?.classList.contains("i")).toBe(true);
    expect(all("outline-view-line")[0]?.classList.contains("l")).toBe(true);
    expect(all("outline-view-icon")[0]?.classList.contains("c")).toBe(true);
    expect(all("outline-view-children")[0]?.classList.contains("ch")).toBe(true);
  });
});

describe("an outline hydrates", () => {
  test("what the server wrote", async () => {
    const result = await hydrates(`
      import { OutlineView } from "<arc>";
      export function Page() {
        return (
          <OutlineView
            aria-label="Program"
            look="pills"
            nodes={[{ id: "1", label: "repeat", children: [{ id: "2", label: "move" }] }, { id: "3", label: "stop" }]}
          />
        );
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="outline-view-item"]')).toHaveLength(3);
    result.unmount();
  });
});
