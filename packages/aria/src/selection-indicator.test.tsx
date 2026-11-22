import { describe, expect, test } from "bun:test";
import { createSignal, flush, For } from "@barqjs/core";
import { render, screen, tick } from "@barqjs/testing";
import { SelectionIndicator, SelectionIndicatorProvider } from "./selection-indicator.tsx";
import { SharedElementTransition } from "./shared-element-transition.tsx";

function after(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms + 40));
}

const MOVES = { "transition-property": "translate", "transition-duration": "0ms" };

function Tabs(props: { selected: string }) {
  return (
    <SharedElementTransition>
      <For each={["salama", "acme", "example"]}>
        {(name: string) => (
          <div data-testid={`tab-${name}`}>
            <SelectionIndicatorProvider isSelected={props.selected === name}>
              {name}
              <SelectionIndicator data-testid={`indicator-${name}`} style={MOVES} />
            </SelectionIndicatorProvider>
          </div>
        )}
      </For>
    </SharedElementTransition>
  );
}

function indicators(): HTMLElement[] {
  return screen.queryAllByTestId(/^indicator-/);
}

describe("SelectionIndicator", () => {
  test("only the selected item's indicator is rendered", () => {
    render(() => <Tabs selected="acme" />);

    expect(indicators().map((each) => each.dataset.testid)).toEqual(["indicator-acme"]);
    expect(screen.getByTestId("tab-acme").contains(indicators()[0] as Node)).toBe(true);
  });

  test("the selection moving moves the indicator rather than re-entering it", async () => {
    const [selected, setSelected] = createSignal("salama");
    render(() => <Tabs selected={selected()} />);
    await after();
    flush();
    const first = screen.getByTestId("indicator-salama");
    first.getBoundingClientRect = () =>
      ({ left: 40, top: 0, width: 10, height: 2, right: 50, bottom: 2, x: 40, y: 0 }) as DOMRect;

    setSelected("example");
    flush();
    const moved = screen.getByTestId("indicator-example");
    expect(moved.style.translate).toBe("40px 0px");

    await tick();
    flush();
    expect(moved.hasAttribute("data-entering")).toBe(false);
    expect(screen.queryByTestId("indicator-salama")).toBeNull();
  });

  test("nothing selected, nothing rendered; the first selection enters", async () => {
    const [selected, setSelected] = createSignal("");
    render(() => <Tabs selected={selected()} />);
    expect(indicators()).toHaveLength(0);

    setSelected("acme");
    flush();
    await tick();
    flush();

    expect(screen.getByTestId("indicator-acme").hasAttribute("data-entering")).toBe(true);
  });

  test("isSelected overrides the item's state", () => {
    render(() => (
      <SharedElementTransition>
        <SelectionIndicatorProvider isSelected={false}>
          <SelectionIndicator isSelected data-testid="forced" />
        </SelectionIndicatorProvider>
        <SelectionIndicator data-testid="orphan" />
      </SharedElementTransition>
    ));

    expect(screen.getByTestId("forced")).not.toBeNull();
    expect(screen.queryByTestId("orphan")).toBeNull();
  });

  test("forwards class and data attributes", () => {
    render(() => (
      <SharedElementTransition>
        <SelectionIndicator isSelected class="pill" data-slot="indicator" data-testid="pill" />
      </SharedElementTransition>
    ));

    const pill = screen.getByTestId("pill");
    expect(pill.getAttribute("class")).toBe("pill");
    expect(pill.getAttribute("data-slot")).toBe("indicator");
  });
});
