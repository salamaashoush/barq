import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { Link } from "@barqjs/router";
import { ariaViolations, render, screen, user, waitFor } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";

import { hydrates, settle } from "../test-arc.ts";
import { ArcProvider } from "./provider.tsx";
import { RecordPager } from "./record-pager.tsx";

const ROWS = ["DLV-1", "DLV-2", "DLV-3"];

interface StepperProps {
  shortcuts?: boolean;
}

function Stepper(props: StepperProps) {
  const [at, setAt] = createSignal(1);
  return (
    <>
      <p data-testid="open">{ROWS[at()]}</p>
      <input aria-label="Note" />
      <RecordPager
        shortcuts={props.shortcuts}
        position={at() + 1}
        count={ROWS.length}
        onPrevious={at() > 0 ? () => setAt(at() - 1) : undefined}
        onNext={at() < ROWS.length - 1 ? () => setAt(at() + 1) : undefined}
      />
    </>
  );
}

function open(): string {
  return screen.getByTestId("open").textContent ?? "";
}

describe("RecordPager", () => {
  test("steps through the list, says where it is, and disables the end it reached", async () => {
    render(() => <Stepper />);
    await settle();
    expect(screen.getByRole("status").textContent).toBe("2 of 3");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await settle();
    expect(open()).toBe("DLV-3");
    expect(screen.getByRole("status").textContent).toBe("3 of 3");
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Previous" }));
    await user.click(screen.getByRole("button", { name: "Previous" }));
    await settle();
    expect(open()).toBe("DLV-1");
    expect(screen.getByRole("button", { name: "Previous" }).hasAttribute("disabled")).toBe(true);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("K and J step from anywhere but a text field, only when asked to", async () => {
    render(() => (
      <>
        <Stepper shortcuts />
      </>
    ));
    await settle();
    await user.keyboard("j");
    await settle();
    expect(open()).toBe("DLV-3");
    await user.keyboard("k");
    await user.keyboard("k");
    await settle();
    expect(open()).toBe("DLV-1");
    await user.keyboard("k");
    await settle();
    expect(open()).toBe("DLV-1");
    await user.click(screen.getByRole("textbox", { name: "Note" }));
    await user.keyboard("j");
    await settle();
    expect(open()).toBe("DLV-1");
  });

  test("without shortcuts the keys belong to the page", async () => {
    render(() => <Stepper />);
    await settle();
    await user.keyboard("j");
    await settle();
    expect(open()).toBe("DLV-2");
  });

  test("with no list around it, both ends are closed and there is no position", async () => {
    render(() => <RecordPager previousLabel="Previous run at Frankfurt" />);
    await settle();
    expect(screen.queryByRole("status")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Previous run at Frankfurt" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
  });

  test("neighbours with addresses are links, and J follows the next one through the router", async () => {
    function Run() {
      return (
        <ArcProvider toaster={false}>
          <Link to="/runs/2">elsewhere</Link>
          <RecordPager previousHref="/runs/1" nextHref="/runs/3" shortcuts />
        </ArcProvider>
      );
    }
    const view = await renderRoute({
      routeTree: [{ path: "/runs/$id", component: Run }] as never,
      path: "/runs/2",
    });
    await settle();
    expect(screen.getByRole("link", { name: "Previous" }).getAttribute("href")).toBe("/runs/1");
    await user.keyboard("j");
    await waitFor(() => expect(view.state.location().pathname).toBe("/runs/3"));
    view.unmount();
  });

  test("its arrows point along the list in a right-to-left page too", async () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <RecordPager position={1} count={4} onNext={() => {}} />
      </Rtl>
    ));
    await settle();
    expect(screen.getByRole("status").textContent).toBe("1 of 4");
    const next = document.querySelector('[data-slot="record-pager-next"] svg');
    expect(next?.getAttribute("class") ?? "").not.toContain("directional");
  });

  test("a server's pager is hydrated in place", async () => {
    const result = await hydrates(`
      import { RecordPager } from "<arc>";
      export function Page() {
        return <RecordPager position={3} count={40} onPrevious={() => {}} onNext={() => {}} />;
      }
    `);
    expect(result.container.textContent).toContain("3 of 40");
    result.unmount();
  });
});
