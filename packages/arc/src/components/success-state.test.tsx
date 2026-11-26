import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates } from "../test-arc.ts";
import { SuccessState } from "./success-state.tsx";

function root(): HTMLElement {
  return document.querySelector('[data-slot="success-state"]') as HTMLElement;
}

describe("SuccessState", () => {
  test("a polite status with a tick, a heading, numbered next steps and where to go", async () => {
    const pressed: string[] = [];
    render(() => (
      <SuccessState
        heading="You're all set"
        description="Your workspace is ready."
        tips={["Invite your team", "Connect a calendar"]}
        actions={
          <button type="button" onClick={() => pressed.push("open")}>
            Open the workspace
          </button>
        }
        help={<a href="/help">Get help</a>}
      />
    ));
    expect(root().getAttribute("role")).toBe("status");
    expect(root().getAttribute("data-kind")).toBe("done");
    expect(root().querySelector('[data-slot="empty-media"] svg')).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "You're all set" })).toBeDefined();
    const steps = screen.getByRole("list", { name: "Next steps" });
    expect(steps.tagName).toBe("OL");
    expect([...steps.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "1.Invite your team",
      "2.Connect a calendar",
    ]);
    expect(screen.getByRole("link", { name: "Get help" })).toBeDefined();
    const open = screen.getByRole("button", { name: "Open the workspace" });
    open.focus();
    await user.keyboard("{Enter}");
    user.tap(open);
    expect(pressed).toEqual(["open", "open"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("leaves out what is not given, takes its own icon, a level and a class per part", () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <SuccessState
          heading="تم"
          icon={<svg data-icon="party" />}
          headingLevel={1}
          class="mine"
          classes={{ tips: "t" }}
          tips={["خطوة"]}
        />
      </Rtl>
    ));
    expect(root().classList.contains("mine")).toBe(true);
    expect(root().querySelector('[data-icon="party"]')).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "تم" })).toBeDefined();
    expect(
      document.querySelector('[data-slot="success-state-tips"]')?.classList.contains("t"),
    ).toBe(true);
    expect(document.querySelector('[data-slot="success-state-help"]')).toBeNull();
  });

  test("a server's success state is hydrated in place", async () => {
    const result = await hydrates(`
      import { SuccessState } from "<arc>";
      export function Page() {
        return <SuccessState heading="Subscribed" tips={["Check your inbox"]} />;
      }
    `);
    expect(result.container.textContent).toContain("Subscribed");
    result.unmount();
  });
});
