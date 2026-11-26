import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { type PathOutcome, type PathStage, StagePath } from "./stage-path.tsx";

const STAGES: PathStage[] = [
  { key: "applied", label: "Applied" },
  { key: "interview", label: "Interview" },
  { key: "offer", label: "Offer" },
  { key: "enrolled", label: "Enrolled" },
];

function states(): (string | null)[] {
  return [...document.querySelectorAll('[data-slot="stage-path-stage"]')].map((stage) =>
    stage.getAttribute("data-state"),
  );
}

describe("StagePath", () => {
  test("an ordered list: stages behind ticked and said completed, its own current, those ahead plain", async () => {
    const [current, setCurrent] = createSignal<string | null>("interview");
    render(() => <StagePath label="Admission" stages={STAGES} current={current()} />);
    const list = screen.getByRole("list", { name: "Admission" });
    expect(list.tagName).toBe("OL");
    expect(states()).toEqual(["done", "current", "ahead", "ahead"]);
    const stages = [...list.querySelectorAll("li")];
    expect(stages[0]?.textContent).toBe("Applied, completed");
    expect(stages[0]?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(stages[1]?.getAttribute("aria-current")).toBe("step");
    expect(stages[2]?.hasAttribute("aria-current")).toBe(false);
    setCurrent("enrolled");
    await settle();
    expect(states()).toEqual(["done", "done", "done", "current"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a record that left the path shows where, ticked to there, and how", () => {
    const lost: PathOutcome = { label: "Lost: chose another school", at: "offer" };
    render(() => <StagePath label="Admission" stages={STAGES} current={null} outcome={lost} />);
    expect(states()).toEqual(["done", "done", "done", "ahead", "outcome"]);
    const outcome = screen.getByText("Lost: chose another school");
    expect(outcome.getAttribute("aria-current")).toBe("step");
  });

  test("before it starts, nothing is reached; an outcome before the first stage ticks none", () => {
    render(() => (
      <>
        <StagePath label="One" stages={STAGES} current={null} />
        <StagePath
          label="Two"
          stages={STAGES}
          current={null}
          outcome={{ label: "Withdrew", at: null, tone: "neutral" }}
        />
      </>
    ));
    expect(states()).toEqual([
      "ahead",
      "ahead",
      "ahead",
      "ahead",
      "ahead",
      "ahead",
      "ahead",
      "ahead",
      "outcome",
    ]);
  });

  test("right to left, it reads in its own direction with the locale's words", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <StagePath
          label="القبول"
          stages={[
            { key: "a", label: "تقديم" },
            { key: "b", label: "مقابلة" },
          ]}
          current="b"
          classes={{ stage: "s" }}
          class="mine"
        />
      </Arabic>
    ));
    expect(screen.getByRole("list", { name: "القبول" })).toBeDefined();
    expect(document.querySelector('[data-slot="stage-path"]')?.classList.contains("mine")).toBe(
      true,
    );
    expect(document.querySelector('[data-slot="stage-path-stage"]')?.classList.contains("s")).toBe(
      true,
    );
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { StagePath } from "<arc>";
      export function Page() {
        return (
          <StagePath label="Pipeline" current={null}
            stages={[{ key: "a", label: "New" }, { key: "b", label: "Won" }]}
            outcome={{ label: "Lost", at: "a" }} />
        );
      }
    `);
    expect(result.container.querySelector('[data-state="outcome"]')?.textContent).toBe("Lost");
    result.unmount();
  });
});
