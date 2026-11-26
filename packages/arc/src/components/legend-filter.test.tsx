import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { type LegendFilterItem, LegendFilter } from "./legend-filter.tsx";

const KINDS: LegendFilterItem[] = [
  { key: "lesson", label: "Lessons", tone: "info" },
  { key: "exam", label: "Exams", color: "var(--chart-3)" },
  { key: "trip", label: "Trips", dashed: true },
];

function chips(): HTMLElement {
  return screen.getByRole("group", { name: "Kinds" });
}

describe("LegendFilter", () => {
  test("a toggle chip per item, pressed while shown, each swatched in its colour", async () => {
    render(() => <LegendFilter label="Kinds" items={KINDS} />);
    const buttons = within(chips()).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["Lessons", "Exams", "Trips"]);
    expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual([
      "true",
      "true",
      "true",
    ]);
    const swatches = [
      ...chips().querySelectorAll<HTMLElement>('[data-slot="legend-filter-swatch"]'),
    ];
    expect(swatches.map((swatch) => swatch.style.getPropertyValue("background-color"))).toEqual([
      "var(--info)",
      "var(--chart-3)",
      "",
    ]);
    expect(swatches[2]?.hasAttribute("data-dashed")).toBe(true);
    expect(swatches[2]?.style.getPropertyValue("border-block-start-color")).toBe("var(--chart-3)");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("pressing a chip hides its item and pressing again shows it; the caller may hold the hidden", async () => {
    const [hidden, setHidden] = createSignal<readonly string[]>(["exam"]);
    const seen: (readonly string[])[] = [];
    render(() => (
      <LegendFilter
        label="Kinds"
        items={KINDS}
        hidden={hidden()}
        onHiddenChange={(next) => {
          seen.push(next);
          setHidden(next);
        }}
      />
    ));
    const exams = within(chips()).getByRole("button", { name: "Exams" });
    expect(exams.getAttribute("aria-pressed")).toBe("false");
    await user.click(within(chips()).getByRole("button", { name: "Lessons" }));
    await settle();
    expect(seen).toEqual([["exam", "lesson"]]);
    await user.click(exams);
    await settle();
    expect(seen[1]).toEqual(["lesson"]);
    expect(exams.getAttribute("aria-pressed")).toBe("true");
  });

  test("its menu holds the same choices as checkboxes, says how many are shown, and shows all again", async () => {
    render(() => <LegendFilter label="Kinds" items={KINDS} defaultHidden={["trip"]} />);
    const trigger = screen.getByRole("button", { name: "Kinds: 2 of 3" });
    await user.click(trigger);
    const items = await waitFor(() => screen.getAllByRole("menuitemcheckbox"));
    expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual([
      "true",
      "true",
      "false",
    ]);
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Lessons" }));
    await settle();
    expect(screen.getByRole("button", { name: "Kinds: 1 of 3" })).toBeDefined();
    await user.click(screen.getByRole("menuitem", { name: "Show all" }));
    await settle();
    expect(screen.getByRole("button", { name: "Kinds" })).toBeDefined();
    expect(
      within(chips())
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-pressed")),
    ).toEqual(["true", "true", "true"]);
  });

  test("right to left, it writes its count in the locale's digits", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <LegendFilter
          label="الأنواع"
          items={KINDS}
          defaultHidden={["exam"]}
          class="mine"
          classes={{ chips: "c" }}
        />
      </Arabic>
    ));
    expect(screen.getByRole("button", { name: "الأنواع: ٢ of ٣" })).toBeDefined();
    expect(document.querySelector('[data-slot="legend-filter"]')?.classList.contains("mine")).toBe(
      true,
    );
    expect(
      document.querySelector('[data-slot="legend-filter-chips"]')?.classList.contains("c"),
    ).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { LegendFilter } from "<arc>";
      export function Page() {
        return <LegendFilter label="Kinds" defaultHidden={["b"]} items={[{ key: "a", label: "A" }, { key: "b", label: "B" }]} />;
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="chip"]')).toHaveLength(2);
    result.unmount();
  });
});
