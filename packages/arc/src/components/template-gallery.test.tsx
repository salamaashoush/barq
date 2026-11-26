import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import {
  BLANK_TEMPLATE,
  SaveTemplateDialog,
  type TemplateDetails,
  TemplateGallery,
  type TemplateItem,
} from "./template-gallery.tsx";

const TEMPLATES: TemplateItem[] = [
  {
    key: "lesson",
    name: "Lesson plan",
    description: "Aims, steps and a check.",
    category: "plans",
  },
  { key: "unit", name: "Unit overview", description: "Weeks at a glance.", category: "plans" },
  { key: "letter", name: "Letter home", category: "letters", image: "/letter.png" },
];

const CATEGORIES = [
  { key: "plans", label: "Plans" },
  { key: "letters", label: "Letters" },
];

function radios(): string[] {
  return screen.getAllByRole("radio").map((radio) => radio.getAttribute("value") ?? "");
}

describe("TemplateGallery", () => {
  test("a radio card per template, a blank start first, and a pane saying what is chosen", async () => {
    let started: TemplateItem | null | undefined;
    render(() => (
      <TemplateGallery
        label="Templates"
        templates={TEMPLATES}
        categories={CATEGORIES}
        blank
        onStart={(template) => {
          started = template;
        }}
      />
    ));
    screen.getByRole("region", { name: "Templates" });
    expect(radios()).toEqual([BLANK_TEMPLATE, "lesson", "unit", "letter"]);
    const pane = screen.getByRole("region", { name: "Chosen template" });
    expect(pane.textContent).toBe("Choose a template to see what it holds.");
    await user.click(screen.getByRole("radio", { name: "Lesson plan" }));
    await settle();
    expect(within(pane).getByRole("heading", { name: "Lesson plan" })).toBeDefined();
    expect(pane.textContent).toContain("Aims, steps and a check.");
    await user.click(within(pane).getByRole("button", { name: "Use this template" }));
    expect(started?.key).toBe("lesson");
    await user.click(screen.getByRole("radio", { name: "Start blank" }));
    await settle();
    await user.click(within(pane).getByRole("button", { name: "Use this template" }));
    expect(started).toBeNull();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a category chip filters the cards, one pressed at a time, and All brings them back", async () => {
    const seen: (string | null)[] = [];
    render(() => (
      <TemplateGallery
        label="Templates"
        templates={TEMPLATES}
        categories={CATEGORIES}
        onCategoryChange={(next) => seen.push(next)}
        onStart={() => {}}
      />
    ));
    const chips = screen.getByRole("group", { name: "Categories" });
    expect(within(chips).getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    await user.click(within(chips).getByRole("button", { name: "Letters" }));
    await settle();
    expect(radios()).toEqual(["letter"]);
    expect(within(chips).getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    await user.click(within(chips).getByRole("button", { name: "All" }));
    await settle();
    expect(radios()).toEqual(["lesson", "unit", "letter"]);
    expect(seen).toEqual(["letters", null]);
  });

  test("shapes while loading, words when there is nothing, and the caller's choice held", () => {
    render(() => (
      <>
        <TemplateGallery label="A" templates={[]} loading onStart={() => {}} />
        <TemplateGallery label="B" templates={[]} onStart={() => {}} />
        <TemplateGallery
          label="C"
          templates={TEMPLATES}
          selected="letter"
          onStart={() => {}}
          startLabel="Start from this"
        />
      </>
    ));
    expect(document.querySelector('[data-slot="template-gallery-loading"]')).not.toBeNull();
    expect(screen.getByText("No templates here yet.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Start from this" })).toBeDefined();
    expect(
      document.querySelector('[data-slot="template-gallery-preview"] img')?.getAttribute("src"),
    ).toBe("/letter.png");
    expect(document.querySelector('[data-slot="choice-card-media"] img')?.getAttribute("alt")).toBe(
      "",
    );
  });

  test("right to left, in the locale's words", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <TemplateGallery label="القوالب" templates={TEMPLATES} onStart={() => {}} class="mine" />
      </Arabic>
    ));
    expect(screen.getByRole("region", { name: "القوالب" }).classList.contains("mine")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { TemplateGallery } from "<arc>";
      export function Page() {
        return (
          <TemplateGallery label="Templates" blank onStart={() => {}}
            categories={[{ key: "a", label: "A" }]}
            templates={[{ key: "x", name: "X", category: "a", image: "/x.png" }]} defaultSelected="x" />
        );
      }
    `);
    expect(result.container.querySelectorAll('[role="radio"], input[type="radio"]').length).toBe(2);
    result.unmount();
  });
});

describe("SaveTemplateDialog", () => {
  test("asks for a name, then keeps the details with their category", async () => {
    const saved: TemplateDetails[] = [];
    render(() => (
      <SaveTemplateDialog
        defaultOpen
        categories={CATEGORIES}
        onSave={(details) => {
          saved.push(details);
        }}
      />
    ));
    const dialog = await waitFor(() => screen.getByRole("dialog", { name: "Save as a template" }));
    const name = within(dialog).getByRole("textbox", { name: "Name" });
    await user.click(within(dialog).getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"));
    expect(saved).toEqual([]);
    expect(dialog.textContent).toContain("Name the template so others can find it.");
    await user.type(name, "  Weekly letter ");
    await user.type(within(dialog).getByRole("textbox", { name: "What it is for" }), "Home news");
    await user.click(within(dialog).getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toEqual({ name: "Weekly letter", description: "Home news", category: null });
  });
});
