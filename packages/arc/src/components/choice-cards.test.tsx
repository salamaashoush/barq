import { describe, expect, test } from "bun:test";
import { type Child, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { accessibleDescription, ariaViolations, render, screen, user } from "@barqjs/testing";

import { target } from "../style/index.ts";
import { hydrates, settle, wears } from "../test-arc.ts";
import { CheckboxCards, type ChoiceOption, RadioCards } from "./choice-cards.tsx";
import { useArcForm } from "./form.tsx";

const PLANS: ChoiceOption[] = [
  { value: "free", label: "Free", description: "One project." },
  { value: "team", label: "Team", description: "Up to 20 seats." },
  { value: "scale", label: "Scale", description: "Everything.", isDisabled: true },
];

function cards(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-slot="choice-card"]')];
}

describe("RadioCards", () => {
  test("a radio group of cards, each radio named by its title and described by its line", async () => {
    render(() => <RadioCards label="Plan" options={PLANS} defaultValue="team" />);
    await settle();
    expect(screen.getByRole("radiogroup", { name: "Plan" })).toBeDefined();
    const team = screen.getByRole<HTMLInputElement>("radio", { name: "Team" });
    expect(team.checked).toBe(true);
    expect(accessibleDescription(team)).toBe("Up to 20 seats.");
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "Scale" }).disabled).toBe(true);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("pressing anywhere on a card chooses it, and the arrows move in the reading direction", async () => {
    const [plan, setPlan] = createSignal<string | null>("free");
    function Rtl(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <RadioCards label="الخطة" options={PLANS} value={plan()} onChange={setPlan} />
      </Rtl>
    ));
    await settle();
    await user.click(cards()[1]?.querySelector('[data-slot="choice-card-title"]') as HTMLElement);
    await settle();
    expect(plan()).toBe("team");
    screen.getByRole("radio", { name: "Team" }).focus();
    await user.keyboard("{ArrowRight}");
    await settle();
    expect(plan()).toBe("free");
  });

  test("a card has room for a finger, and a tap chooses it", async () => {
    const [plan, setPlan] = createSignal<string | null>(null);
    render(() => <RadioCards label="Plan" options={PLANS} value={plan()} onChange={setPlan} />);
    await settle();
    expect(wears(cards()[0], target.size)).toBe(true);
    user.tap(cards()[0] as HTMLElement);
    await settle();
    expect(plan()).toBe("free");
  });

  test("holds the form's value inside form.AppField", async () => {
    let read: () => unknown = () => undefined;
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { plan: "free" } }));
      read = () => form.state.values.plan;
      return (
        <form.AppForm>
          <form.AppField name="plan">{(f) => <f.RadioCards label="Plan" options={PLANS} />}</form.AppField>
        </form.AppForm>
      );
    });
    await settle();
    await user.click(screen.getByRole("radio", { name: "Team" }));
    await settle();
    expect(read()).toBe("team");
  });
});

describe("CheckboxCards", () => {
  test("a group of checkbox cards held as the chosen values in the options' order", async () => {
    const [chosen, setChosen] = createSignal<readonly string[]>(["team"]);
    render(() => (
      <CheckboxCards label="Plans" options={PLANS} value={chosen()} onChange={setChosen} />
    ));
    await settle();
    expect(screen.getByRole("group", { name: "Plans" })).toBeDefined();
    await user.click(screen.getByRole("checkbox", { name: "Free" }));
    await settle();
    expect(chosen()).toEqual(["free", "team"]);
    screen.getByRole("checkbox", { name: "Team" }).focus();
    await user.keyboard(" ");
    await settle();
    expect(chosen()).toEqual(["free"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("takes a class per part and a slot on every part", async () => {
    render(() => (
      <CheckboxCards
        label="Plans"
        class="mine"
        options={[{ value: "a", label: "A", description: "First.", icon: <svg /> }]}
        classes={{ group: "g", card: "c", icon: "i", title: "t", description: "d", control: "k" }}
      />
    ));
    await settle();
    const by = (slot: string): Element | null => document.querySelector(`[data-slot="${slot}"]`);
    expect(by("checkbox-cards")?.classList.contains("mine")).toBe(true);
    expect(by("checkbox-cards-group")?.classList.contains("g")).toBe(true);
    expect(by("choice-card")?.classList.contains("c")).toBe(true);
    expect(by("choice-card-icon")?.classList.contains("i")).toBe(true);
    expect(by("choice-card-title")?.classList.contains("t")).toBe(true);
    expect(by("choice-card-description")?.classList.contains("d")).toBe(true);
    expect(screen.getByRole("checkbox").closest(".k")).not.toBeNull();
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { CheckboxCards, RadioCards } from "<arc>";
      const OPTIONS = [{ value: "a", label: "A", description: "First." }, { value: "b", label: "B" }];
      export function Page() {
        return (
          <div>
            <RadioCards label="One" options={OPTIONS} defaultValue="a" />
            <CheckboxCards label="Many" options={OPTIONS} defaultValue={["b"]} />
          </div>
        );
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="choice-card"]')).toHaveLength(4);
    result.unmount();
  });
});
