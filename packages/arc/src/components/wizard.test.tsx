import { afterEach, describe, expect, test } from "bun:test";
import { type Child } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { type AnyRouteDefinition } from "@barqjs/router";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";
import { touch } from "@barqjs/ui/shared-touch";

import { hydrates, settle, wears } from "../test-arc.ts";
import { useArcForm } from "./form.tsx";
import { Wizard, type WizardStep } from "./wizard.tsx";

const STEPS: WizardStep[] = [
  { id: "details", label: "Details", fields: [{ name: "name", label: "Project name" }] },
  { id: "team", label: "Team", optional: true, fields: [{ name: "lead", label: "Lead" }] },
  { id: "review", label: "Review", summary: true },
];

interface Values {
  name: string;
  lead: string;
}

function Project(props: {
  submitted?: Values[];
  resume?: string;
  param?: string;
  left?: string[];
  class?: string;
  classes?: Record<string, string>;
}) {
  const form = useArcForm(() => ({
    defaultValues: { name: "", lead: "" },
    onSubmit: ({ value }) => {
      props.submitted?.push(value);
    },
  }));
  return (
    <Wizard
      form={form}
      steps={STEPS}
      resume={props.resume}
      param={props.param}
      class={props.class}
      classes={props.classes}
      onStepLeave={(step) => props.left?.push(step)}
    >
      {(step) =>
        step.id === "details" ? (
          <form.AppField
            name="name"
            validators={{
              onSubmit: ({ value }: { value: string }) =>
                value === "" ? "Name the project" : undefined,
            }}
          >
            {(field) => <field.TextField label="Project name" />}
          </form.AppField>
        ) : (
          <form.AppField name="lead">{(field) => <field.TextField label="Lead" />}</form.AppField>
        )
      }
    </Wizard>
  );
}

function slot(name: string): HTMLElement | null {
  return document.querySelector(`[data-slot="${name}"]`);
}

async function press(name: string | RegExp): Promise<void> {
  await user.click(screen.getByRole("button", { name }));
  await settle();
}

afterEach(() => {
  localStorage.removeItem("wizard-test");
});

describe("Wizard", () => {
  test("Next checks the step's fields first, then moves on, focusing and announcing the step", async () => {
    const left: string[] = [];
    render(() => <Project left={left} />);
    const steps = screen.getByRole("list", { name: "Steps" });
    expect(within(steps).getAllByRole("link")).toHaveLength(3);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Details");
    await press("Next");
    await waitFor(() => expect(screen.getByText("Name the project")).toBeDefined());
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Details");
    expect(screen.getByText("Has errors")).toBeDefined();

    await user.type(screen.getByRole("textbox", { name: "Project name" }), "Atlas");
    await press("Next");
    await waitFor(() => expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Team"));
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2 }));
    expect(slot("wizard-status")?.textContent).toBe("Step 2 of 3: Team");
    expect(left).toEqual(["details"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("an optional step can be skipped, Back goes back, and the summary edits a step", async () => {
    render(() => <Project />);
    await user.type(screen.getByRole("textbox", { name: "Project name" }), "Atlas");
    await press("Next");
    await waitFor(() => expect(screen.getByRole("button", { name: "Skip" })).toBeDefined());
    await press("Back");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Details");
    await press("Next");
    await waitFor(() => expect(screen.getByRole("button", { name: "Skip" })).toBeDefined());
    await press("Skip");
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Review"),
    );
    const summary = slot("wizard-summary") as HTMLElement;
    expect(summary.textContent).toContain("Project name");
    expect(summary.textContent).toContain("Atlas");
    expect(summary.textContent).toContain("Not given");
    await press("Edit Team");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Team");
  });

  test("Finish submits the form from the last step and forgets the saved draft", async () => {
    const submitted: Values[] = [];
    render(() => <Project submitted={submitted} resume="wizard-test" />);
    await user.type(screen.getByRole("textbox", { name: "Project name" }), "Atlas");
    await press("Next");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Lead" })).toBeDefined());
    await user.type(screen.getByRole("textbox", { name: "Lead" }), "Salama");
    await settle();
    expect(JSON.parse(localStorage.getItem("wizard-test") ?? "{}").values.lead).toBe("Salama");
    await press("Next");
    await waitFor(() => expect(screen.getByRole("button", { name: "Finish" })).toBeDefined());
    await press("Finish");
    await waitFor(() => expect(submitted).toEqual([{ name: "Atlas", lead: "Salama" }]));
    await waitFor(() => expect(localStorage.getItem("wizard-test")).toBeNull());
  });

  test("resumes at the step and with the values it was left at", async () => {
    localStorage.setItem(
      "wizard-test",
      JSON.stringify({
        step: "team",
        completed: "details",
        values: { name: "Atlas", lead: "Sam" },
      }),
    );
    render(() => <Project resume="wizard-test" />);
    await settle();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Team");
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Lead" }).value).toBe("Sam");
  });

  test("keeps the step in the URL", async () => {
    const tree: AnyRouteDefinition[] = [
      { path: "/", component: () => <Project param="step" /> },
    ] as never;
    const view = await renderRoute({ routeTree: tree, path: "/?step=team" });
    await settle();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Team");
    await press("Back");
    await waitFor(() => expect(view.state.location().search).toBe("?step=details"));
    view.unmount();
  });

  test("its buttons are a finger's size and it runs right to left", () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <Project />
      </Arabic>
    ));
    expect(wears(screen.getByRole("button", { name: "Next" }), touch.target)).toBe(true);
    expect(slot("stepper-marker")?.textContent).toBe("١");
  });

  test("takes a class per part", () => {
    render(() => (
      <Project class="mine" classes={{ root: "r", panel: "p", heading: "h", footer: "f" }} />
    ));
    for (const [name, cls] of [
      ["wizard", "r"],
      ["wizard-panel", "p"],
      ["wizard-heading", "h"],
      ["wizard-footer", "f"],
    ] as const) {
      expect(slot(name)?.classList.contains(cls)).toBe(true);
    }
    expect(slot("wizard")?.classList.contains("mine")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { Wizard, useArcForm } from "<arc>";
      export function Page() {
        const form = useArcForm(() => ({ defaultValues: { name: "" } }));
        return (
          <Wizard form={form} steps={[{ id: "a", label: "One" }, { id: "b", label: "Two" }]}>
            {(step) => <p>{step.label}</p>}
          </Wizard>
        );
      }
    `);
    expect(result.container.querySelector("h2")?.textContent).toBe("One");
    result.unmount();
  });
});
