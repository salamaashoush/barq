import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { ariaViolations, render, screen } from "@barqjs/testing";

import { hydrates } from "../test-arc.ts";
import { provideArcMessages } from "./messages.ts";
import { Value } from "./value.tsx";

function values(): (string | null)[] {
  return [...document.querySelectorAll('[data-slot="value"]')].map((one) => one.textContent);
}

describe("Value", () => {
  test("a value as it is, or formatted; absence in arc's words or the caller's", async () => {
    render(() => (
      <dl>
        <dt>Seats</dt>
        <dd>
          <Value value={12} />
        </dd>
        <dt>Limit</dt>
        <dd>
          <Value value={null} absent="noLimit" />
        </dd>
        <dt>Expires</dt>
        <dd>
          <Value value={undefined} absent="never" />
        </dd>
        <dt>Guardian</dt>
        <dd>
          <Value value="  " absentText="No guardian" />
        </dd>
        <dt>Tags</dt>
        <dd>
          <Value value={[] as string[]} absent="none" format={(tags) => tags.join(", ")} />
        </dd>
        <dt>Price</dt>
        <dd>
          <Value value={4.5} format={(price) => <b>{price.toFixed(2)}</b>} />
        </dd>
      </dl>
    ));
    expect(values()).toEqual(["12", "No limit", "Never", "No guardian", "None", "4.50"]);
    expect(document.querySelectorAll('[data-state="absent"]')).toHaveLength(4);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("with no word for it, absence reads as not recorded; a dash reads as not applicable", () => {
    render(() => (
      <>
        <Value value={null} />
        <Value value={undefined} notApplicable />
      </>
    ));
    expect(values()).toEqual(["Not recorded", "—Not applicable"]);
    expect(screen.getByText("—").getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector('[data-state="unrecorded"]')).not.toBeNull();
  });

  test("words follow the provider, and a class per part is taken", () => {
    function German(props: ParentProps) {
      provideArcMessages(() => ({ nobody: "Niemand", notSet: "Nicht gesetzt" }));
      return <>{props.children}</>;
    }
    render(() => (
      <German>
        <Value value={null} absent="nobody" class="mine" classes={{ absent: "a" }} />
        <Value value="" absent="notSet" />
      </German>
    ));
    expect(values()).toEqual(["Niemand", "Nicht gesetzt"]);
    const first = document.querySelector('[data-slot="value"]');
    expect(first?.classList.contains("mine") && first.classList.contains("a")).toBe(true);
  });

  test("a server's values are hydrated in place", async () => {
    const result = await hydrates(`
      import { Value } from "<arc>";
      export function Page() {
        return <p><Value value={3} /> <Value value={null} absent="never" /> <Value value={null} notApplicable /></p>;
      }
    `);
    expect(result.container.textContent).toBe("3 Never —Not applicable");
    result.unmount();
  });
});
