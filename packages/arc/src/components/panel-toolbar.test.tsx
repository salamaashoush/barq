import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen } from "@barqjs/testing";

import { hydrates } from "../test-arc.ts";
import { PanelToolbar } from "./panel-toolbar.tsx";

function slot(name: string): HTMLElement | null {
  return document.querySelector(`[data-slot="${name}"]`);
}

describe("PanelToolbar", () => {
  test("opens a tab panel with what it holds and its own actions at the end", async () => {
    render(() => (
      <PanelToolbar
        description="Runners that picked up work in the last hour."
        actions={<button type="button">Add runner</button>}
      />
    ));
    expect(screen.queryByRole("heading")).toBeNull();
    expect(slot("panel-toolbar-description")?.tagName).toBe("P");
    expect(slot("panel-toolbar-actions")?.textContent).toBe("Add runner");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("titles a section with an h2 a section can be named by", async () => {
    render(() => (
      <section aria-labelledby="keys">
        <PanelToolbar heading="Keys" headingId="keys" />
      </section>
    ));
    expect(screen.getByRole("region", { name: "Keys" })).toBeDefined();
    expect(screen.getByRole("heading", { level: 2 }).id).toBe("keys");
    expect(slot("panel-toolbar-actions")).toBeNull();
    expect(slot("panel-toolbar-description")).toBeNull();
  });

  test("draws a heading of another level, keeping its id and slot", () => {
    render(() => (
      <PanelToolbar
        heading="Nested"
        headingId="nested"
        renders={{ heading: (part, content) => <h3 {...part.props}>{content}</h3> }}
      />
    ));
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading.id).toBe("nested");
    expect(heading.getAttribute("data-slot")).toBe("panel-toolbar-heading");
  });

  test("takes the caller's class per part and in a right-to-left page", () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <PanelToolbar heading="المفاتيح" class="own" classes={{ heading: "own-heading" }} />
      </Rtl>
    ));
    expect(slot("panel-toolbar")?.classList.contains("own")).toBe(true);
    expect(screen.getByRole("heading").classList.contains("own-heading")).toBe(true);
  });

  test("a server's toolbar is hydrated in place", async () => {
    const result = await hydrates(`
      import { PanelToolbar } from "<arc>";
      export function Page() {
        return <PanelToolbar heading="Keys" description="Keys this runner pool accepts." actions={<button type="button">New key</button>} />;
      }
    `);
    expect(result.container.textContent).toContain("New key");
    result.unmount();
  });
});
