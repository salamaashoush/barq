import { afterEach, describe, expect, test } from "bun:test";
import { createSignal, type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { clearAnnouncer } from "@barqjs/aria/live";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { useArcForm } from "./form.tsx";
import { StepSequenceEditor } from "./step-sequence-editor.tsx";

afterEach(() => clearAnnouncer());

interface Request {
  name: string;
  method: string;
  url: string;
}

const STEPS: Request[] = [
  { name: "Log in", method: "POST", url: "/login" },
  { name: "Load cart", method: "GET", url: "/cart" },
  { name: "Check out", method: "POST", url: "/checkout" },
];

interface StepsProps {
  max?: number;
  seen?: Request[][];
}

function Steps(props: StepsProps) {
  const [steps, setSteps] = createSignal<readonly Request[]>(STEPS);
  return (
    <StepSequenceEditor<Request>
      label="Requests"
      value={steps()}
      max={props.max}
      onChange={(next) => {
        props.seen?.push([...next]);
        setSteps(next);
      }}
      newStep={(index) => ({ name: "", method: "GET", url: index === 0 ? "/" : "" })}
      stepLabel={(step, index) => step.name || `Step ${String(index + 1)}`}
      summary={(step) => `${step.method} ${step.url}`}
    >
      {(row) => (
        <input
          aria-label={`URL of ${row.value().name || `step ${String(row.index + 1)}`}`}
          value={row.value().url}
          onInput={(event: Event) =>
            row.update({ ...row.value(), url: (event.currentTarget as HTMLInputElement).value })
          }
        />
      )}
    </StepSequenceEditor>
  );
}

function triggers(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-slot="step-sequence-trigger"]')];
}

function expanded(): string[] {
  return triggers().map((one) => one.getAttribute("aria-expanded") ?? "");
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("StepSequenceEditor", () => {
  test("an ordered list of steps named by its label, the first open", async () => {
    render(() => <Steps />);
    await settle();
    expect(screen.getByRole("list", { name: "Requests" }).tagName).toBe("OL");
    expect(triggers().map((one) => one.getAttribute("aria-label"))).toEqual([
      "Log in",
      "Load cart",
      "Check out",
    ]);
    expect(expanded()).toEqual(["true", "false", "false"]);
    expect(screen.getByRole("textbox", { name: "URL of Log in" })).toBeDefined();
    expect(
      [...document.querySelectorAll('[data-slot="step-sequence-summary"]')].map(
        (one) => one.textContent,
      ),
    ).toEqual(["POST /login", "GET /cart", "POST /checkout"]);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Move Log in up" }).disabled).toBe(
      true,
    );
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Move Check out down" }).disabled,
    ).toBe(true);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a step folds and opens from its header", async () => {
    render(() => <Steps />);
    await settle();
    user.click(triggers()[1] as HTMLElement);
    await settle();
    expect(expanded()).toEqual(["true", "true", "false"]);
    user.click(triggers()[0] as HTMLElement);
    await settle();
    expect(expanded()).toEqual(["false", "true", "false"]);
  });

  test("moving a step carries whether it is open, and keeps focus on the button", async () => {
    const seen: Request[][] = [];
    render(() => <Steps seen={seen} />);
    await settle();
    user.click(screen.getByRole("button", { name: "Move Log in down" }));
    await settle();
    expect(seen.at(-1)?.map((one) => one.name)).toEqual(["Load cart", "Log in", "Check out"]);
    expect(expanded()).toEqual(["false", "true", "false"]);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Move Log in down");
    user.click(screen.getByRole("button", { name: "Move Log in down" }));
    await settle();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Move Log in up");
  });

  test("Add and Duplicate open the new step and focus it; at max they go quiet", async () => {
    const seen: Request[][] = [];
    render(() => <Steps seen={seen} max={5} />);
    await settle();
    user.click(screen.getByRole("button", { name: "Duplicate Load cart" }));
    await settle();
    expect(seen.at(-1)?.map((one) => one.name)).toEqual([
      "Log in",
      "Load cart",
      "Load cart",
      "Check out",
    ]);
    expect(expanded()).toEqual(["true", "false", "true", "false"]);
    expect(document.activeElement).toBe(triggers()[2] ?? null);
    user.click(screen.getByRole("button", { name: "Add step" }));
    await settle();
    expect(seen.at(-1)?.at(-1)).toEqual({ name: "", method: "GET", url: "" });
    expect(document.activeElement).toBe(triggers()[4] ?? null);
    expect(triggers()[4]?.getAttribute("aria-label")).toBe("Step 5");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Add step" }).disabled).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Duplicate Log in" }).disabled,
    ).toBe(true);
  });

  test("remove hands focus to the step in its place, and the last step stays", async () => {
    render(() => <Steps />);
    await settle();
    user.click(screen.getByRole("button", { name: "Remove Load cart" }));
    await settle();
    expect(triggers().map((one) => one.getAttribute("aria-label"))).toEqual([
      "Log in",
      "Check out",
    ]);
    expect(document.activeElement).toBe(triggers()[1] ?? null);
    user.click(screen.getByRole("button", { name: "Remove Check out" }));
    await settle();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Remove Log in" }).disabled).toBe(
      true,
    );
  });

  test("in a form, steps move through the array field", async () => {
    let read: () => Request[] = () => [];
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { steps: STEPS.slice(0, 2) } }));
      read = () => form.state.values.steps;
      return (
        <form.AppForm>
          <form.AppField name="steps" mode="array">
            {(field) => (
              <field.StepSequenceEditor
                label="Requests"
                newStep={() => ({ name: "", method: "GET", url: "" })}
                stepLabel={(step: Request, index: number) =>
                  step.name || `Step ${String(index + 1)}`
                }
              >
                {(row) => (
                  <form.AppField name={row.name("url") as `steps[${number}].url`}>
                    {(cell) => <cell.TextField label="URL" />}
                  </form.AppField>
                )}
              </field.StepSequenceEditor>
            )}
          </form.AppField>
        </form.AppForm>
      );
    });
    await settle();
    user.click(screen.getByRole("button", { name: "Move Load cart up" }));
    await settle();
    expect(read().map((one) => one.name)).toEqual(["Load cart", "Log in"]);
    user.click(screen.getByRole("button", { name: "Duplicate Log in" }));
    await settle();
    expect(read().map((one) => one.name)).toEqual(["Load cart", "Log in", "Log in"]);
    user.click(screen.getByRole("button", { name: "Add step" }));
    await settle();
    expect(read()).toHaveLength(4);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("empty, disabled, and right to left", async () => {
    render(() => (
      <Arabic>
        <StepSequenceEditor<Request>
          label="الطلبات"
          defaultValue={STEPS.slice(0, 2)}
          newStep={() => ({ name: "", method: "GET", url: "" })}
          isDisabled
        >
          {() => <span />}
        </StepSequenceEditor>
      </Arabic>
    ));
    await settle();
    expect(
      [...document.querySelectorAll('[data-slot="step-sequence-number"]')].map(
        (one) => one.textContent,
      ),
    ).toEqual(["١", "٢"]);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Add step" }).disabled).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Move Step 1 down" }).disabled,
    ).toBe(true);
  });

  test("with no steps, says so", async () => {
    render(() => (
      <StepSequenceEditor<Request>
        label="Requests"
        defaultValue={[]}
        emptyLabel="No requests yet."
        newStep={() => ({ name: "", method: "GET", url: "" })}
      >
        {() => <span />}
      </StepSequenceEditor>
    ));
    await settle();
    expect(document.querySelector('[data-slot="step-sequence-empty"]')?.textContent).toBe(
      "No requests yet.",
    );
  });
});

describe("a step sequence editor hydrates", () => {
  test("what the server wrote", async () => {
    const result = await hydrates(`
      import { StepSequenceEditor } from "<arc>";
      export function Page() {
        return (
          <StepSequenceEditor
            label="Requests"
            defaultValue={[{ url: "/login" }, { url: "/cart" }]}
            newStep={() => ({ url: "" })}
            summary={(step) => step.url}
          >
            {(row) => <p>{row.value().url}</p>}
          </StepSequenceEditor>
        );
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="step-sequence-step"]')).toHaveLength(2);
    result.unmount();
  });
});
