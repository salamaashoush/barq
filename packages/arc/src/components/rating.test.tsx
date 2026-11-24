import { describe, expect, test } from "bun:test";
import { type Child, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { accessibleName, ariaViolations, render, screen, user } from "@barqjs/testing";

import { target } from "../style/index.ts";
import { hydrates, settle, wears } from "../test-arc.ts";
import { useArcForm } from "./form.tsx";
import { Rating } from "./rating.tsx";

function stars(): HTMLInputElement[] {
  return screen.getAllByRole<HTMLInputElement>("radio");
}

function filled(): number {
  return document.querySelectorAll('label[data-slot="rating-star"][data-filled]').length;
}

describe("Rating", () => {
  test("is a radio group named by its label, a star per score, each named", async () => {
    render(() => <Rating label="How was it?" defaultValue={3} />);
    await settle();
    expect(screen.getByRole("radiogroup", { name: "How was it?" })).toBeDefined();
    expect(stars().map((star) => accessibleName(star))).toEqual([
      "1 star",
      "2 stars",
      "3 stars",
      "4 stars",
      "5 stars",
    ]);
    expect(stars()[2]?.checked).toBe(true);
    expect(filled()).toBe(3);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a press chooses, a pointer previews, and allowClear takes it back", async () => {
    const [score, setScore] = createSignal<number | null>(null);
    render(() => <Rating aria-label="Score" value={score()} onChange={setScore} allowClear />);
    await settle();
    const fourth = document.querySelectorAll('label[data-slot="rating-star"]')[3] as HTMLElement;
    user.hover(fourth);
    await settle();
    expect(filled()).toBe(4);
    await user.click(stars()[3] as HTMLElement);
    await settle();
    expect(score()).toBe(4);
    await user.click(stars()[3] as HTMLElement);
    await settle();
    expect(score()).toBeNull();
  });

  test("the arrows move and choose, in the reading direction", async () => {
    function Rtl(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    const [score, setScore] = createSignal<number | null>(2);
    render(() => (
      <Rtl>
        <Rating aria-label="التقييم" value={score()} onChange={setScore} />
      </Rtl>
    ));
    await settle();
    (stars()[1] as HTMLElement).focus();
    await user.keyboard("{ArrowLeft}");
    await settle();
    expect(score()).toBe(3);
  });

  test("a star has room for a finger, and a tap chooses it", async () => {
    const [score, setScore] = createSignal<number | null>(null);
    render(() => <Rating aria-label="Score" value={score()} onChange={setScore} />);
    await settle();
    const second = document.querySelectorAll('label[data-slot="rating-star"]')[1] as HTMLElement;
    expect(wears(second, target.size)).toBe(true);
    user.tap(second);
    await settle();
    expect(score()).toBe(2);
  });

  test("read only, it fills to a fraction and is one image read as its score", async () => {
    render(() => <Rating aria-label="Average" value={3.5} isReadOnly />);
    await settle();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Average Rated 3.5 out of 5");
    const fills = [...document.querySelectorAll<HTMLElement>('[data-slot="rating-fill"]')];
    expect(fills.map((fill) => fill.style.width)).toEqual(["100%", "100%", "100%", "50%", "0%"]);
  });

  test("holds the form's value inside form.AppField", async () => {
    let read: () => unknown = () => undefined;
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { score: 1 } }));
      read = () => form.state.values.score;
      return (
        <form.AppForm>
          <form.AppField name="score">{(f) => <f.Rating label="Score" />}</form.AppField>
        </form.AppForm>
      );
    });
    await settle();
    await user.click(stars()[4] as HTMLElement);
    await settle();
    expect(read()).toBe(5);
  });

  test("takes a class per part and a slot on every part", async () => {
    render(() => (
      <Rating
        label="Score"
        defaultValue={1}
        class="mine"
        classes={{ group: "g", star: "s", icon: "i", filled: "f", label: "l" }}
      />
    ));
    await settle();
    const by = (slot: string): Element | null => document.querySelector(`[data-slot="${slot}"]`);
    expect(by("rating-field")?.classList.contains("mine")).toBe(true);
    expect(by("rating")?.classList.contains("g")).toBe(true);
    expect(by("rating-star")?.classList.contains("s")).toBe(true);
    expect(by("rating-star")?.classList.contains("f")).toBe(true);
    expect(by("rating-star")?.querySelector("svg")?.classList.contains("i")).toBe(true);
    expect(by("field-label")?.classList.contains("l")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { Rating } from "<arc>";
      export function Page() {
        return (
          <div>
            <Rating label="Score" defaultValue={4} />
            <Rating aria-label="Average" value={4.2} isReadOnly />
          </div>
        );
      }
    `);
    expect(result.container.querySelectorAll('[role="radio"], input[type="radio"]').length).toBe(5);
    result.unmount();
  });
});
