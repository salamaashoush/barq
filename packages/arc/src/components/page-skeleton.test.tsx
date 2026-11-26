import { describe, expect, test } from "bun:test";
import { ariaViolations, render, screen } from "@barqjs/testing";

import { hydrates, wears } from "../test-arc.ts";
import { PageSkeleton, type PageTemplate, pageSkeletonStyles } from "./page-skeleton.tsx";

function skeleton(): HTMLElement {
  return document.querySelector('[data-slot="page-skeleton"]') as HTMLElement;
}

describe("PageSkeleton", () => {
  test("a busy status named Loading, shaped like a list page", async () => {
    render(() => <PageSkeleton template="list" />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.textContent).toBe("Loading");
    expect(skeleton().getAttribute("data-template")).toBe("list");
    const rows = skeleton().querySelectorAll('[data-slot="page-skeleton-table"] > div');
    expect(rows).toHaveLength(9);
    expect(skeleton().querySelector('[data-slot="page-skeleton-header"]')).not.toBeNull();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("each template draws its own shape, and a table's middle column steps out when narrow", () => {
    const templates: PageTemplate[] = ["list", "record", "form", "dashboard", "settings", "review"];
    render(() => (
      <>
        {templates.map((template) => (
          <PageSkeleton template={template} />
        ))}
      </>
    ));
    const all = [...document.querySelectorAll('[data-slot="page-skeleton"]')];
    expect(all.map((one) => one.getAttribute("data-template"))).toEqual(templates);
    const shapes = all.map((one) => one.innerHTML);
    expect(new Set(shapes).size).toBe(templates.length);
    const side = document.querySelector(
      '[data-slot="page-skeleton-table"] > div:nth-child(2) > :nth-child(2)',
    );
    expect(wears(side, pageSkeletonStyles().cellSide)).toBe(true);
  });

  test("no header, a row count and a class per part", () => {
    render(() => (
      <PageSkeleton
        template="dashboard"
        header={false}
        rows={2}
        class="mine"
        classes={{ strip: "s" }}
      />
    ));
    expect(skeleton().classList.contains("mine")).toBe(true);
    expect(skeleton().querySelector('[data-slot="page-skeleton-header"]')).toBeNull();
    expect(
      skeleton().querySelector('[data-slot="page-skeleton-strip"]')?.classList.contains("s"),
    ).toBe(true);
    const tables = skeleton().querySelectorAll('[data-slot="page-skeleton-table"]');
    expect(tables[1]?.children).toHaveLength(3);
  });

  test("right to left it is the same shape, mirrored by logical sides", () => {
    render(() => (
      <div dir="rtl">
        <PageSkeleton template="review" />
      </div>
    ));
    expect(
      wears(
        skeleton().querySelector('[data-slot="page-skeleton-header"]'),
        pageSkeletonStyles().header,
      ),
    ).toBe(true);
  });

  test("a server's skeleton is hydrated in place", async () => {
    const result = await hydrates(`
      import { PageSkeleton } from "<arc>";
      export function Page() {
        return <PageSkeleton template="record" />;
      }
    `);
    expect(result.container.querySelector('[role="status"]')?.getAttribute("aria-busy")).toBe(
      "true",
    );
    result.unmount();
  });
});
