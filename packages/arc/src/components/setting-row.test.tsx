import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { useArcForm } from "./form.tsx";
import { type FeatureToggle, FeatureToggles, PlanGate, SettingRow } from "./setting-row.tsx";

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

function deferred(): Deferred {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  return { promise, resolve: () => resolve(), reject };
}

function checked(element: HTMLElement): boolean {
  return element.getAttribute("aria-checked") === "true" || (element as HTMLInputElement).checked;
}

describe("SettingRow", () => {
  test("a switch named by the label and described by its line, applied at once and saved", async () => {
    const calls: boolean[] = [];
    const pending = deferred();
    render(() => (
      <SettingRow
        label="Require two-factor sign-in"
        description="Members without it are asked to set it up."
        defaultChecked={false}
        onCheckedChange={(on: boolean) => {
          calls.push(on);
          return pending.promise;
        }}
      />
    ));
    const toggle = screen.getByRole("switch", { name: "Require two-factor sign-in" });
    expect(toggle.getAttribute("aria-describedby")).not.toBeNull();
    const describedBy = document.getElementById(
      toggle.getAttribute("aria-describedby")?.split(" ")[0] ?? "",
    );
    expect(describedBy?.textContent).toContain("Members without it");
    await user.click(toggle);
    await settle();
    expect(calls).toEqual([true]);
    expect(checked(toggle)).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Saving…");
    expect(toggle.closest('[data-slot="switch"]')?.hasAttribute("data-disabled") ?? true).toBe(
      true,
    );
    pending.resolve();
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Saved"));
    expect(checked(toggle)).toBe(true);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a refused change flips back and says why", async () => {
    render(() => (
      <SettingRow
        label="Allow public projects"
        defaultChecked
        onCheckedChange={() => Promise.reject(new Error("only owners can change this"))}
      />
    ));
    const toggle = screen.getByRole("switch", { name: "Allow public projects" });
    toggle.focus();
    await user.keyboard(" ");
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Only owners can change this."),
    );
    expect(checked(toggle)).toBe(true);
  });

  test("controlled, it shows the caller's value once the change lands", async () => {
    const [on, setOn] = createSignal(false);
    render(() => (
      <SettingRow
        label="Weekly digest"
        checked={on()}
        onCheckedChange={async (next: boolean) => {
          setOn(next);
        }}
      />
    ));
    const toggle = screen.getByRole("switch", { name: "Weekly digest" });
    user.tap(toggle);
    await waitFor(() => expect(on()).toBe(true));
    await settle();
    expect(checked(toggle)).toBe(true);
  });

  test("locked: read only with the reason, the plan's badge and a way to lift it", async () => {
    render(() => (
      <SettingRow
        label="Single sign-on"
        defaultChecked={false}
        locked={{
          reason: "Available on the Business plan.",
          badge: "Business",
          action: <a href="/billing">See plans</a>,
        }}
      />
    ));
    const toggle = screen.getByRole("switch", { name: "Single sign-on" });
    expect(
      toggle.hasAttribute("disabled") ||
        toggle.closest('[data-slot="switch"]')?.hasAttribute("data-disabled"),
    ).toBe(true);
    const row = document.querySelector('[data-slot="setting-row"]') as HTMLElement;
    expect(row.hasAttribute("data-locked")).toBe(true);
    expect(row.querySelector('[data-slot="setting-row-badge"]')?.textContent).toBe("Business");
    expect(row.querySelector('[data-slot="setting-row-lock"]')?.textContent).toContain(
      "Business plan",
    );
    expect(screen.getByRole("link", { name: "See plans" })).toBeDefined();
    await user.click(toggle);
    await settle();
    expect(checked(toggle)).toBe(false);
  });

  test("any control of its own, named by the row, with its save state", async () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <SettingRow
          label="المنطقة الزمنية"
          status="error"
          statusReason="تعذر الحفظ"
          control={(ids) => <select aria-labelledby={ids.label} />}
          class="mine"
        />
      </Rtl>
    ));
    expect(screen.getByRole("combobox", { name: "المنطقة الزمنية" })).toBeDefined();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("تعذر الحفظ");
    expect(document.querySelector('[data-slot="setting-row"]')?.classList.contains("mine")).toBe(
      true,
    );
  });

  test("a server's row is hydrated in place", async () => {
    const result = await hydrates(`
      import { SettingRow } from "<arc>";
      export function Page() {
        return <SettingRow label="Digest" description="Monday mornings." defaultChecked
          locked={{ reason: "Only owners", badge: "Owner" }} />;
      }
    `);
    expect(result.container.textContent).toContain("Digest");
    result.unmount();
  });
});

const FEATURES: readonly FeatureToggle[] = [
  { id: "grades", label: "Gradebook", description: "Marks and term grades." },
  { id: "reports", label: "Report cards", requires: ["grades"] },
  { id: "transcripts", label: "Transcripts", requires: ["reports"] },
  {
    id: "sis",
    label: "Records sync",
    locked: { reason: "On the District plan.", badge: "District" },
  },
  { id: "state", label: "State reporting", requires: ["sis"] },
];

function switchFor(name: string): HTMLElement {
  return screen.getByRole("switch", { name });
}

describe("FeatureToggles", () => {
  test("turning one on turns on what it needs, and off turns off what needs it", async () => {
    const changes: (readonly string[])[] = [];
    render(() => (
      <FeatureToggles
        aria-label="Modules"
        features={FEATURES}
        defaultValue={[]}
        onChange={(next: readonly string[]) => changes.push(next)}
      />
    ));
    expect(screen.getByRole("group", { name: "Modules" })).toBeDefined();
    await user.click(switchFor("Transcripts"));
    await settle();
    expect(changes.at(-1)).toEqual(["grades", "reports", "transcripts"]);
    expect(checked(switchFor("Gradebook"))).toBe(true);
    await user.click(switchFor("Gradebook"));
    await settle();
    expect(changes.at(-1)).toEqual([]);
    expect(checked(switchFor("Transcripts"))).toBe(false);
    expect(
      document.querySelector('[data-slot="setting-row-note"]')?.textContent?.startsWith("Needs"),
    ).toBe(true);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a locked feature keeps its state, and one that needs it is locked naming it", async () => {
    render(() => <FeatureToggles aria-label="Modules" features={FEATURES} defaultValue={[]} />);
    const rows = [...document.querySelectorAll('[data-slot="setting-row"]')] as HTMLElement[];
    const state = rows.find((row) => row.textContent?.includes("State reporting")) as HTMLElement;
    expect(state.hasAttribute("data-locked")).toBe(true);
    expect(within(state).getByText("Needs Records sync")).toBeDefined();
    await user.click(switchFor("Records sync"));
    await settle();
    expect(checked(switchFor("Records sync"))).toBe(false);
  });

  test("inside a form field it is the form's value", async () => {
    let read: () => readonly string[] = () => [];
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { modules: ["grades"] as string[] } }));
      read = () => form.state.values.modules;
      return (
        <form.AppField name="modules">
          {() => <FeatureToggles aria-label="Modules" features={FEATURES} />}
        </form.AppField>
      );
    });
    await settle();
    expect(checked(switchFor("Gradebook"))).toBe(true);
    await user.click(switchFor("Report cards"));
    await settle();
    expect(read()).toEqual(["grades", "reports"]);
  });
});

describe("PlanGate", () => {
  test("the editor where the plan includes it, an info notice with the way to it where not", async () => {
    const [allowed, setAllowed] = createSignal(false);
    render(() => (
      <PlanGate
        allowed={allowed()}
        title="IP allowlists are on the Business plan"
        description="Limit sign-in to your office network."
        action={<a href="/billing">See plans</a>}
      >
        <p>Allowlist editor</p>
      </PlanGate>
    ));
    expect(screen.getByText("IP allowlists are on the Business plan")).toBeDefined();
    expect(screen.getByRole("link", { name: "See plans" })).toBeDefined();
    expect(screen.queryByText("Allowlist editor")).toBeNull();
    expect(await ariaViolations(document.body)).toEqual([]);
    setAllowed(true);
    await settle();
    expect(screen.getByText("Allowlist editor")).toBeDefined();
    expect(screen.queryByText("IP allowlists are on the Business plan")).toBeNull();
  });
});
