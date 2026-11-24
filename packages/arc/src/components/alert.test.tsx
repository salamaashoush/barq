import { describe, expect, test } from "bun:test";
import { type Child } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { Banner, InlineAlert, alertStyles } from "./alert.tsx";
import { provideArcMessages } from "./messages.ts";

describe("InlineAlert", () => {
  test("a toned message with a title, an icon and actions; danger interrupts, the rest wait", async () => {
    render(() => (
      <>
        <InlineAlert
          tone="danger"
          title="Payment failed"
          actions={<button type="button">Retry</button>}
        >
          The card was declined.
        </InlineAlert>
        <InlineAlert tone="success">Saved.</InlineAlert>
      </>
    ));
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("data-tone")).toBe("danger");
    expect(alert.textContent).toContain("Payment failed");
    expect(alert.querySelector('[data-slot="inline-alert-icon"] svg')).not.toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Saved.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("dismissed from the keyboard it hides itself and says so", async () => {
    let dismissed = 0;
    render(() => (
      <InlineAlert tone="info" onDismiss={() => dismissed++}>
        Beta.
      </InlineAlert>
    ));
    const close = screen.getByRole("button", { name: "Dismiss" });
    close.focus();
    await user.keyboard("{Enter}");
    await settle();
    expect(dismissed).toBe(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  test("its dismiss button takes a tap and arc's words", async () => {
    function German(props: { children?: Child }) {
      provideArcMessages(() => ({ dismiss: "Schließen" }));
      return <>{props.children}</>;
    }
    let dismissed = 0;
    render(() => (
      <German>
        <InlineAlert onDismiss={() => dismissed++}>Beta.</InlineAlert>
      </German>
    ));
    user.tap(screen.getByRole("button", { name: "Schließen" }));
    await settle();
    expect(dismissed).toBe(1);
  });

  test("in a right-to-left page the icon leads and dismiss ends the line", () => {
    function Rtl(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <InlineAlert tone="warning" title="تنبيه" onDismiss={() => {}}>
          نص
        </InlineAlert>
      </Rtl>
    ));
    const root = document.querySelector('[data-slot="inline-alert"]') as HTMLElement;
    expect(root.firstElementChild?.getAttribute("data-slot")).toBe("inline-alert-icon");
    expect(root.lastElementChild?.getAttribute("data-slot")).toBe("inline-alert-dismiss");
  });

  test("takes a class per part and a slot on every part", () => {
    render(() => (
      <InlineAlert
        title="T"
        actions={<span>A</span>}
        onDismiss={() => {}}
        class="mine"
        classes={{
          icon: "i",
          content: "c",
          title: "t",
          description: "d",
          actions: "a",
          dismiss: "x",
        }}
      >
        Body
      </InlineAlert>
    ));
    const by = (slot: string): Element | null => document.querySelector(`[data-slot="${slot}"]`);
    expect(by("inline-alert")?.classList.contains("mine")).toBe(true);
    for (const [slot, name] of [
      ["inline-alert-icon", "i"],
      ["inline-alert-content", "c"],
      ["inline-alert-title", "t"],
      ["inline-alert-description", "d"],
      ["inline-alert-actions", "a"],
      ["inline-alert-dismiss", "x"],
    ] as const) {
      expect(by(slot)?.classList.contains(name)).toBe(true);
    }
  });
});

describe("Banner", () => {
  test("full width along the page, toned, and dismissible", async () => {
    let dismissed = 0;
    render(() => (
      <Banner tone="warning" title="Maintenance" onDismiss={() => dismissed++}>
        Sunday from 02:00 UTC.
      </Banner>
    ));
    const banner = document.querySelector('[data-slot="banner"]') as HTMLElement;
    for (const one of alertStyles({ tone: "warning", kind: "banner" }).root.split(" ")) {
      expect(banner.classList.contains(one)).toBe(true);
    }
    expect(screen.getByRole("status").textContent).toContain("Maintenance");
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    await settle();
    expect(dismissed).toBe(1);
    expect(document.querySelector('[data-slot="banner"]')).toBeNull();
  });

  test("hydrates what the server wrote, banner and inline alert", async () => {
    const result = await hydrates(`
      import { Banner, InlineAlert } from "<arc>";
      export function Page() {
        return (
          <div>
            <Banner tone="info" onDismiss={() => {}}>Maintenance tonight.</Banner>
            <InlineAlert tone="danger" title="Failed">Try again.</InlineAlert>
          </div>
        );
      }
    `);
    expect(result.container.querySelector('[role="alert"]')?.textContent).toContain("Failed");
    result.unmount();
  });
});
