import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";

import { hydrates, settle } from "../test-arc.ts";
import { useArcForm } from "./form.tsx";
import {
  MultiSegmentedControl,
  type Segment,
  SegmentedControl,
  SegmentedField,
} from "./segmented-control.tsx";

const STATES: Segment[] = [
  { value: "open", label: "Open", count: 3, tone: "danger" },
  { value: "resolved", label: "Resolved", count: 12, tone: "success" },
  { value: "all", label: "All" },
];

const BROWSERS: Segment[] = [
  { value: "chromium", label: "Chromium" },
  { value: "firefox", label: "Firefox" },
  { value: "webkit", label: "WebKit" },
];

function pressed(): string[] {
  return screen
    .getAllByRole("button")
    .filter((one) => one.getAttribute("aria-pressed") === "true")
    .map((one) => one.getAttribute("data-value") ?? one.textContent ?? "");
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("SegmentedControl", () => {
  test("a named group of toggle buttons, one held, each with its count and tone dot", async () => {
    render(() => <SegmentedControl aria-label="State" items={STATES} />);
    const group = screen.getByRole("group", { name: "State" });
    expect(group).toBeDefined();
    expect(pressed()).toEqual(["Open3"]);
    const dots = document.querySelectorAll('[data-slot="segmented-control-dot"]');
    expect(dots).toHaveLength(2);
    expect(dots[0]?.getAttribute("aria-hidden")).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Resolved 12" })
        .querySelector('[data-slot="segmented-control-count"]')?.textContent,
    ).toBe("12");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("pressing the held segment keeps it; pressing another moves the choice", async () => {
    const seen: string[] = [];
    render(() => (
      <SegmentedControl aria-label="State" items={STATES} onChange={(v) => seen.push(v)} />
    ));
    await user.click(screen.getByRole("button", { name: "Open 3" }));
    await settle();
    expect(pressed()).toEqual(["Open3"]);
    expect(seen).toEqual([]);
    await user.click(screen.getByRole("button", { name: "All" }));
    await settle();
    expect(pressed()).toEqual(["All"]);
    expect(seen).toEqual(["all"]);
  });

  test("one Tab stop, the arrows moving and Enter choosing, by touch too", async () => {
    render(() => <SegmentedControl aria-label="State" items={STATES} defaultValue="resolved" />);
    user.tab();
    expect(document.activeElement?.textContent).toBe("Resolved12");
    await user.keyboard("{ArrowRight}");
    await user.keyboard("{Enter}");
    await settle();
    expect(pressed()).toEqual(["All"]);
    user.tap(screen.getByRole("button", { name: "Open 3" }));
    await settle();
    expect(pressed()).toEqual(["Open3"]);
  });

  test("follows the caller's value", async () => {
    const [value, setValue] = createSignal("all");
    render(() => (
      <SegmentedControl aria-label="State" items={STATES} value={value()} onChange={setValue} />
    ));
    expect(pressed()).toEqual(["All"]);
    setValue("resolved");
    await settle();
    expect(pressed()).toEqual(["Resolved12"]);
  });

  test("an empty value is a segment of its own: the default", async () => {
    const seen: string[] = [];
    render(() => (
      <SegmentedControl
        aria-label="Browser"
        defaultValue="firefox"
        items={[{ value: "", label: "Browser default" }, ...BROWSERS]}
        onChange={(v) => seen.push(v)}
        name="browser"
      />
    ));
    await user.click(screen.getByRole("button", { name: "Browser default" }));
    await settle();
    expect(seen).toEqual([""]);
    expect(pressed()).toEqual(["Browser default"]);
    expect(document.querySelector<HTMLInputElement>('input[name="browser"]')?.value).toBe("");
  });

  test("in a search parameter: the default leaves it out and an unknown value falls back", async () => {
    function Incidents() {
      return <SegmentedControl aria-label="State" param="state" items={STATES} />;
    }
    const view = await renderRoute({
      routeTree: [{ path: "/incidents", component: Incidents }] as never,
      path: "/incidents?state=nope&q=disk",
    });
    await settle();
    expect(pressed()).toEqual(["Open3"]);
    await user.click(screen.getByRole("button", { name: "Resolved 12" }));
    await waitFor(() => expect(view.state.search().get("state")).toBe("resolved"));
    expect(view.state.search().get("q")).toBe("disk");
    await user.click(screen.getByRole("button", { name: "Open 3" }));
    await waitFor(() => expect(view.state.search().has("state")).toBe(false));
    expect(pressed()).toEqual(["Open3"]);
    view.unmount();
  });

  test("runs right to left, the arrows following the reading direction", async () => {
    render(() => (
      <Arabic>
        <SegmentedControl aria-label="State" items={STATES} />
      </Arabic>
    ));
    user.tab();
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement?.textContent).toBe("Resolved12");
  });

  test("disabled, it takes no choice", async () => {
    render(() => <SegmentedControl aria-label="State" items={STATES} isDisabled />);
    await user.click(screen.getByRole("button", { name: "All" }));
    await settle();
    expect(pressed()).toEqual(["Open3"]);
  });

  test("takes a class per part", () => {
    render(() => (
      <SegmentedControl
        aria-label="State"
        items={STATES}
        class="mine"
        classes={{ root: "r", group: "g", item: "i", dot: "d", count: "c" }}
      />
    ));
    for (const [slot, cls] of [
      ["segmented-control", "r"],
      ["segmented-control-group", "g"],
      ["segmented-control-item", "i"],
      ["segmented-control-dot", "d"],
      ["segmented-control-count", "c"],
    ] as const) {
      expect(document.querySelector(`[data-slot="${slot}"]`)?.classList.contains(cls)).toBe(true);
    }
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { SegmentedControl } from "<arc>";
      export function Page() {
        return (
          <SegmentedControl
            aria-label="Window"
            defaultValue="7d"
            items={[
              { value: "24h", label: "24h" },
              { value: "7d", label: "7d", count: 4, tone: "warning" },
              { value: "30d", label: "30d" },
            ]}
          />
        );
      }
    `);
    expect(result.container.querySelector('[aria-pressed="true"]')?.textContent).toBe("7d4");
    result.unmount();
  });
});

describe("MultiSegmentedControl", () => {
  test("holds several in the items' order, and refuses to let go of the last", async () => {
    const seen: string[][] = [];
    render(() => (
      <MultiSegmentedControl
        aria-label="Browsers"
        items={BROWSERS}
        defaultValue={["webkit"]}
        onChange={(v) => seen.push(v)}
      />
    ));
    await user.click(screen.getByRole("button", { name: "Chromium" }));
    await settle();
    expect(seen.at(-1)).toEqual(["chromium", "webkit"]);
    await user.click(screen.getByRole("button", { name: "Chromium" }));
    await user.click(screen.getByRole("button", { name: "WebKit" }));
    await settle();
    expect(pressed()).toEqual(["WebKit"]);
    expect(seen.at(-1)).toEqual(["webkit"]);
  });

  test("marks itself invalid", () => {
    render(() => (
      <MultiSegmentedControl
        aria-label="Browsers"
        items={BROWSERS}
        defaultValue={["webkit"]}
        isInvalid
      />
    ));
    expect(screen.getByRole("group", { name: "Browsers" }).hasAttribute("data-invalid")).toBe(true);
  });

  test("in a search parameter, joined by commas", async () => {
    function Checks() {
      return (
        <MultiSegmentedControl
          aria-label="Browsers"
          param="browsers"
          items={BROWSERS}
          defaultValue={["chromium"]}
        />
      );
    }
    const view = await renderRoute({
      routeTree: [{ path: "/checks", component: Checks }] as never,
      path: "/checks?browsers=webkit,firefox",
    });
    await settle();
    expect(pressed()).toEqual(["Firefox", "WebKit"]);
    await user.click(screen.getByRole("button", { name: "Chromium" }));
    await waitFor(() =>
      expect(view.state.search().get("browsers")).toBe("chromium,firefox,webkit"),
    );
    view.unmount();
  });
});

describe("SegmentedField", () => {
  test("a labelled field whose error marks the group", async () => {
    render(() => (
      <SegmentedField
        label="Severity"
        description="Who gets paged"
        items={STATES}
        errorMessage="Pick one"
      />
    ));
    const group = screen.getByRole("group", { name: "Severity" });
    expect(group.hasAttribute("data-invalid")).toBe(true);
    expect(group.getAttribute("aria-describedby")).toBeTruthy();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("is an arc form's field", async () => {
    let submitted: unknown;
    function Form() {
      const form = useArcForm(() => ({
        defaultValues: { window: "24h" },
        onSubmit: ({ value }) => {
          submitted = value;
        },
      }));
      return (
        <form.AppForm>
          <form.AppField name="window">
            {(field) => (
              <field.SegmentedField
                label="Window"
                items={[
                  { value: "24h", label: "24h" },
                  { value: "7d", label: "7d" },
                ]}
              />
            )}
          </form.AppField>
          <button type="button" onClick={() => void form.handleSubmit()}>
            Go
          </button>
        </form.AppForm>
      );
    }
    render(() => <Form />);
    await user.click(screen.getByRole("button", { name: "7d" }));
    await user.click(screen.getByRole("button", { name: "Go" }));
    await waitFor(() => expect(submitted).toEqual({ window: "7d" }));
  });
});
