import { describe, expect, test } from "bun:test";
import { createSignal } from "@barqjs/core";
import { ariaViolations, render } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { HighlightMatches } from "./highlight-matches.tsx";

function marks(): string[] {
  return [...document.querySelectorAll("mark")].map((one) => one.textContent ?? "");
}

describe("HighlightMatches", () => {
  test("marks every word of the search wherever it matches, folding case and accents", async () => {
    const view = render(() => (
      <HighlightMatches text="Résumé review: the RESUME template" query="resume temp" />
    ));
    expect(marks()).toEqual(["Résumé", "RESUME", "temp"]);
    expect(view.container.textContent).toBe("Résumé review: the RESUME template");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("takes a service's own ranges, merging those that touch", () => {
    render(() => (
      <HighlightMatches
        text="quarterly report"
        ranges={[
          [10, 13],
          [12, 16],
          [0, 3],
        ]}
      />
    ));
    expect(marks()).toEqual(["qua", "report"]);
  });

  test("follows the search as it changes, and marks nothing for none", async () => {
    const [query, setQuery] = createSignal("a");
    render(() => <HighlightMatches text="banana" query={query()} />);
    expect(marks()).toEqual(["a", "a", "a"]);
    setQuery("");
    await settle();
    expect(marks()).toEqual([]);
  });

  test("marks Arabic text right to left in place", () => {
    const view = render(() => (
      <div dir="rtl">
        <HighlightMatches text="تقرير الربع الأول" query="الربع" />
      </div>
    ));
    expect(marks()).toEqual(["الربع"]);
    expect(view.container.textContent).toBe("تقرير الربع الأول");
  });

  test("takes a class per part", () => {
    render(() => (
      <HighlightMatches class="mine" text="alpha" query="al" classes={{ root: "r", mark: "m" }} />
    ));
    const root = document.querySelector('[data-slot="highlight-matches"]');
    expect(root?.classList.contains("r")).toBe(true);
    expect(root?.classList.contains("mine")).toBe(true);
    expect(document.querySelector('[data-slot="highlight-matches-mark"]')?.classList).toContain(
      "m",
    );
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { HighlightMatches } from "<arc>";
      export function Page() {
        return <HighlightMatches text="Invoice 42 for Acme" query="acme 42" />;
      }
    `);
    expect([...result.container.querySelectorAll("mark")].map((one) => one.textContent)).toEqual([
      "42",
      "Acme",
    ]);
    result.unmount();
  });
});
